import * as utils from '../../libs/utils.js'

export const getHealth = async event => {
  return {
    msg: 'OK',
    date: new Date(),
    status: 'SUCCESS',
  }
}
