const mssql = require('mssql')
const { Pool } = require('pg')
const { Logger } = require('./logger')
const { camelizeKeys } = require('./string')

const pgConfig = {
  user: process.env.DATABASE_USER,
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  password: process.env.DATABASE_PASSWORD,
  port: process.env.DATABASE_PORT ? process.env.DATABASE_PORT : 5432,
  ssl: { rejectUnauthorized: false },
}

const msqlConfig = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_NAME,
  server: process.env.MSSQL_HOST,
  requestTimeout: 180000,
  connectionTimeout: 60000,
  options: {
    encrypt: false, // for azure
    trustServerCertificate: false, // change to true for local dev / self-signed certs
    enableArithAbort: true,
  },
  pool: {
    max: 85,
    min: 0,
    idleTimeoutMillis: 30000,
  },
}

//conection
globalMsPool.connectedPool = null
async function globalMsPool() {
  if (globalMsPool.connectedPool) {
    return globalMsPool.connectedPool
  }
  const pool = new mssql.ConnectionPool(msqlConfig)
  await pool.connect()
  console.log('global pool connected')

  globalMsPool.connectedPool = pool
  return globalMsPool.connectedPool
}

const getTransactionMssql = async () => new mssql.Transaction(await globalMsPool())

const getConnectionPg = () => {
  const pool = new Pool(pgConfig)
  return pool.connect()
}

const fetchResult = (query, { singleResult = false, debug = false } = {}) => {
  // "connection" can be a transaction or pool -- something with a "request()" method.
  // Pass "null" to use the global connection pool.
  return async (args, connection = null) => {
    try {
      const request = connection ? connection.request() : (await globalMsPool()).request()
      const result = await query(args, request)

      if (debug) {
        console.log('Query parameters:', args)
        console.log('Raw query:', query.toString(args))
      }
      const records = result.recordset

      return singleResult ? records[0] : records
    } catch (error) {
      console.log(error)
      throw error
    }
  }
}
function fetchResultPg(query, { singleResult = false } = {}) {
  return async (...args) => {
    const pool = new Pool(pgConfig)
    const request = await pool.connect()
    try {
      const result = await query(...args, request)
      await request.release()
      const records = result.rows.map(camelizeKeys)
      return singleResult ? records[0] : records
    } catch (error) {
      console.error(error)
      await request.release()
      throw error
    }
  }
}

// PG transactions
function transactionPG() {
  return async operations => {
    const pool = new Pool(pgConfig)
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      const result = await operations(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}

function eachSlice(size, array) {
  const result = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}

function validSqlIdentifiers(names) {
  return names.every(x => /^\w+$/.test(x))
}

/**
 * Executes a bulk insert safely by using a prepared statement.
 * @param {String} table - Table we're inserting into.
 * @param {Array.<Object>} records - Records to insert.
 * @param {Object} types - Maps record keys to mssql types.
 * @param {PreparedStatement} ps - Node mssql PreparedStatement object.
 * @param {Array.<String>} outputCols - Columns to output as result.
 */
async function safeBulkInsertMS({
  table,
  records,
  types,
  transaction,
  outputCols = [],
} = {}) {
  const identifiers = [...Object.keys(types), table]

  // This function is intended to be used only privately by the repo, but we
  // add this validation to thwart injection just in case user input ever ends
  // up here
  if (!validSqlIdentifiers(identifiers)) {
    console.log(`${identifiers}`)
    throw new Error('Invalid column names')
  }

  const keysClause = Object.keys(types).join(',')
  const outputClause = outputCols.length
    ? 'OUTPUT ' + outputCols.map(x => 'inserted.' + x).join(',\n')
    : ''

  // Calculate the number of parameters we're creating, since SQLServer has
  // a limit of 2100.  We'll need to break down into batches if we exceed it.
  const maxParamsAllowed = 2099
  const batchSize = Math.floor(maxParamsAllowed / Object.keys(types).length)

  let inserted = []

  for (const batch of eachSlice(batchSize, records)) {
    const batchInserted = await insertOneBatch(batch)
    inserted.push(batchInserted)
  }

  return inserted.flat()

  async function insertOneBatch(batch) {
    const ps = new mssql.PreparedStatement(transaction)

    // Create the clauses that comprise the final SQL.
    const paramNames = batch.map((o, i) => Object.entries(o).map(([k]) => `${k}_${i}`))
    const valuesClause = paramNames
      .map(x => x.map(y => `@${y}`).join(', '))
      .map(x => `(${x})`)
      .join(',\n')

    // Define input params.
    paramNames.flat().forEach(param => {
      const key = param.replace(/_\d+$/, '')
      ps.input(param, types[key])
    })

    // Construct SQL and prepare the query.
    await ps.prepare(`
      INSERT INTO ${table} (
        ${keysClause}
      )
      ${outputClause}
      VALUES
      ${valuesClause}
    `)

    // Execute and return result.
    const paramNameVals = Object.fromEntries(
      batch.flatMap((o, i) => Object.entries(o).map(([k, v]) => [`${k}_${i}`, v]))
    )

    const result = await ps.execute(paramNameVals)
    await ps.unprepare()
    return result.recordset
  }
}

/**
 * @typedef column
 * @property {object} column - column
 * @property {string} column.name - column name
 * @property {string} column.type - column type
 * @property {boolean} [column.isConditional] - is conditional
 * @property {object} [column.customExpression] - custom expression
 */

/**
 * Executes a bulk update safely by using a prepared statement.
 * @param {string} table - Table we're updating.
 * @param {Array.<object>} records - Records to update.
 * @param {Array.<column>} columns - Maps record keys to mssql types.
 * @param {object} ps - Node mssql PreparedStatement object.
 */
async function safeBulkUpdateMS({ table, records, columns, ps } = {}) {
  const columnNames = columns.map(col => col.name)
  const identifiers = [...columnNames, table]

  // Validate SQL identifiers to prevent SQL injection.
  if (!validSqlIdentifiers(identifiers)) {
    console.log(`${identifiers}`)
    throw new Error('Invalid column names')
  }

  // Calculate the number of parameters we're creating, since SQL Server has a limit of 2100.
  const maxParamsAllowed = 2099
  const batchSize = Math.floor(maxParamsAllowed / columns.length)

  let updated = []

  for (const batch of eachSlice(batchSize, records)) {
    const batchUpdated = await updateOneBatch(batch)
    updated.push(batchUpdated)
  }

  return updated.flat()

  async function updateOneBatch(batch) {
    const setColumns = columns.filter(col => !col.isConditional)
    const whereColumns = columns.filter(col => col.isConditional)

    const query = batch
      .map((item, i) => {
        const paramNames = Object.keys(item).reduce(
          (acc, key) => ({
            ...acc,
            [key]: `${key}_${i}`,
          }),
          {}
        )

        const setClause = setColumns
          .map(col => {
            const param = `@${paramNames[col.name]}`
            const expression = col.customExpression ? col.customExpression(param) : param

            return `${col.name} = ${expression}`
          })
          .join(',')

        const whereClause = whereColumns
          .map(col => `${col.name} = @${paramNames[col.name]}`)
          .join(' AND ')

        // Define input params.
        Object.entries(paramNames).forEach(([key, param]) => {
          ps.input(param, columns.find(col => col.name === key).type)
        })

        return `
          UPDATE ${table}
          SET ${setClause}
          WHERE ${whereClause}
        `
      })
      .join('; ')

    // Prepare the query
    await ps.prepare(query + ';')

    // Define values to be passed to the query.
    const paramNameVals = Object.fromEntries(
      batch.flatMap((o, i) => Object.entries(o).map(([k, v]) => [`${k}_${i}`, v]))
    )

    // Execute and return result.
    const result = await ps.execute(paramNameVals)
    return result.recordsets
  }
}

async function dbOffset() {
  try {
    const request = (await globalMsPool()).request()

    const query = `SELECT DATEPART(TZoffset, SYSDATETIMEOFFSET()) AS offset`

    const result = await request.query(query)

    return result.recordset[0].offset
  } catch (error) {
    Logger.error(error)
    throw error
  }
}

function safeBulkInsertPG(table, records, keys, outputCols = []) {
  const identifiers = [...keys, table]

  // This function is intended to be used only privately by the repo, but we
  // add this validation to thwart injection just in case user input ever ends up here
  if (!validSqlIdentifiers(identifiers)) {
    Logger.error(`${identifiers}`)
    throw new Error('Invalid column names')
  }

  const outputClause = outputCols.length
    ? 'returning ' + outputCols.map(x => x).join(',\n')
    : ''

  // the format of the string will be defined by the object records
  // ['jonah,'foo','bar'],['Jonah2','foo2','bar2'] => result ($1,$2,$3),
  // ($4,$5,$6)
  let index = 1
  const valuesClause = records
    .map(x => x.map(() => `$${index++}`).join(', '))
    .map(x => `(${x})`)
    .join(',\n')

  return `
    INSERT INTO ${table} (
      ${keys.join(',')}
    )
    VALUES ${valuesClause}
    ${outputClause}
  `
}

module.exports = {
  pgConfig,
  msqlConfig,
  getTransactionMssql,
  getConnectionPg,
  fetchResult,
  fetchResultPg,
  safeBulkInsertMS,
  safeBulkUpdateMS,
  dbOffset,
  globalMsPool,
  safeBulkInsertPG,
  transactionPG,
}
