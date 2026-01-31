/**
 * A factory function which takes:
 * @param {object} metadata - object props to include in every output
 *
 * and returns a "logger" object with two methods: "info" and "error",
 * for logging to stdout and stderr, respectively. Both of these
 * methods have the following signature:
 *
 * @param {string} msg - main message to log
 * @param {object} additionalMetadata - additional object properties
 *   to inlcude for this specific output
 *
 * Notes:
 *   1. msg can be an Error object
 *   2. Props of additionalMetadata will overwrite metadata props
 */

function redConsoleError(...args) {
  const red = '\x1b[31m'
  const reset = '\x1b[0m'

  console.error(red, ...args, reset)
}

const activeConsoleError =
  process.env.STAGE === 'localhost' ? redConsoleError : console.error

function LoggerFn(metadata) {
  const lg =
    consoleFn =>
    (msg, data = {}) =>
      consoleFn({ msg, data, metadata })

  return {
    info: lg(console.log),
    error: lg(activeConsoleError),
    unexpected: (msg, data = {}) =>
      activeConsoleError('[UNEXPECTED]', msg, data, metadata),
  }
}

// Allow logger to be used without metadata.
const noMetaDataLogger = LoggerFn({})
LoggerFn.info = noMetaDataLogger.info
LoggerFn.error = noMetaDataLogger.error
LoggerFn.unexpected = noMetaDataLogger.unexpected

export { LoggerFn as Logger }
