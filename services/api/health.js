const utils = require('libs/utils')

module.exports.getHealth = async event => {
  return {
    msg: 'OK',
    date: new Date(),
    status: 'SUCCESS',
  }
}
