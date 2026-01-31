const { fetchResult, msqlConfig, fetchResultPg, getTransactionMssql } = require('libs/db')
const { getSettings } = require('libs/repo')
const mssql = require('mssql')

//example of how to use the db
const getUser = async id => {
  const result = await fetchResult('SELECT * FROM users WHERE id = ?', [id])
  return result
}

module.exports = {
  getUser,
}
