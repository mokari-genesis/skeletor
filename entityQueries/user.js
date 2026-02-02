import { fetchResult, msqlConfig, fetchResultPg, getTransactionMssql } from 'libs/db.js'
// import { getSettings } from '../libs/repo.js' // Checking if this file exists or removed
import mssql from 'mssql'

//example of how to use the db
const getUser = async id => {
  const result = await fetchResult('SELECT * FROM users WHERE id = ?', [id])
  return result
}

export default {
  getUser,
}
