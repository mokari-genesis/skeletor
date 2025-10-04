const { Logger } = require('libs/logger')

async function attemptWithRetry(fn, { maxRetries = 2, delay = 1000 } = {}) {
  let retries = 0
  let result

  while (retries < maxRetries) {
    try {
      result = await fn()
      break
    } catch (error) {
      retries++
      if (retries === maxRetries) {
        throw error
      }
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return result
}

// serverless-offline does not correctly handle errors in async lambdas.  This
// will wrap the lambda in a try/catch so it doesn't crash the server, and
// instead matches the dev/prod behavior.
function catchLocally(fn) {
  if (process.env.STAGE !== 'localhost') {
    return fn
  }

  return async function (...args) {
    try {
      return await fn(...args)
    } catch (error) {
      Logger.unexpected(error)
      return
    }
  }
}

function getRouteFromRequest({ routes, request }) {
  return routes.find(route => {
    const match = request.path.match(
      new RegExp(
        `/${route.path
          .split('/')
          .map(x => (x.startsWith(':') ? '[A-z0-9]+' : x))
          .join('/')}`,
        'gi'
      )
    )

    return route.method === request.httpMethod && match && match[0] === request.path
  })
}

function getParamsFromRequest(route, request) {
  const params = {
    ...request.body,
    ...request.queryStringParameters,
  }

  if (route.path.match(/:[A-z]+/gi)) {
    const paramEntries = route.path
      .split('/')
      .filter(x => x.startsWith(':'))
      .map(x => [
        x.replace(':', ''),
        request.path.split('/').filter(val => val)[route.path.split('/').indexOf(x)],
      ])

    Object.assign(params, Object.fromEntries(paramEntries))
  }

  return params
}

function getRoutes(allRoutes) {
  return allRoutes
    .map(proxy =>
      proxy.routes.map(route => ({
        ...route,
        path: `${proxy.proxy}/${route.path}`,
      }))
    )
    .flat()
}

function parseEvent(event) {
  const { body, httpMethod, path, queryStringParameters, headers, requestContext } = event

  const parsedEvent = {
    body: typeof body === 'string' ? JSON.parse(body) : body,
    httpMethod,
    path,
    queryStringParameters,
    deviceId: headers?.device_id || null,
    platform: headers?.platform || null,
    platformVersion: headers?.platform_version || null,
    appVersion: headers?.app_version || null,
    sourceIp: requestContext?.identity?.sourceIp,
    xApiKey: headers?.['x-api-key'] || null,
  }

  if (event.headers && (event.headers.Authorization || event.headers.authorization)) {
    parsedEvent.authorization = event.headers.Authorization || event.headers.authorization
  }

  return parsedEvent
}

/**
 * Retries an asynchronous operation a specified number of times with an exponential backoff delay between attempts.
 *
 * @param {Function} fn - The asynchronous function to retry.
 * @param {number} maxRetries - The maximum number of retries.
 * @param {Function} [delayStrategy] - A function that determines the delay between retries.
 * @return {Promise} A promise that resolves with the result of the asynchronous function, or rejects with the error from the last attempt.
 */
async function retryAsync(fn, maxRetries, delayStrategy) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= maxRetries) {
        throw err
      }
      Logger.info(
        `Retrying async operation attempt ${attempt} of ${maxRetries} after: ${err.message}`
      )

      // Use the provided delay strategy or a default 1000ms delay if none is provided
      const delay = delayStrategy ? delayStrategy(attempt) : 1000
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

function deviceIdChecker({ deviceId }) {
  if (!deviceId) {
    Logger.info('no deviceId provided')
    return false
  }
  // Commented until define if we want to use it
  /*const iosDeviceIdRegex =
    /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/

  // Regex for Android deviceId (16-character alphanumeric string)
  const androidDeviceIdRegex = /^[a-fA-F0-9]{16}$/

  if (!iosDeviceIdRegex.test(deviceId) && !androidDeviceIdRegex.test(deviceId)) {
    Logger.info('deviceId must be a 16-character alphanumeric string')
    return false
  }*/

  return true
}

module.exports = {
  catchLocally,
  attemptWithRetry,
  getParamsFromRequest,
  getRouteFromRequest,
  getRoutes,
  parseEvent,
  retryAsync,
  deviceIdChecker,
}
