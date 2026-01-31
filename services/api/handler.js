import * as util from '../../libs/utils.js'
import { router } from './router.js'
import * as fn from '../../libs/fn.js'
import { Logger } from '../../libs/logger.js'

//const { isValidToken } = require("vendor/aws/cognito");

export const app = async event => {
  try {
    const request = fn.parseEvent(event)

    const _routes = router()
    const route = fn.getRouteFromRequest({
      routes: fn.getRoutes(_routes),
      request,
    })

    console.log('route', route)

    if (!route) {
      return util.response(400, { message: 'Route not found.', request })
    }

    const normalizedHeaders = util.normalizeKeysToLowercase(event.headers)

    /*const isTokenValid = async () => {
      if (route.public) {
        return true;
      }
      return isValidToken(normalizedHeaders.authorization);
    };*/

    //const validToken = await isTokenValid();

    /*if (!validToken && !route.public) {
      Logger.unexpected("Invalid Token", normalizedHeaders.authorization);
      return util.response(400, null, "Invalid authorization token");
    }
    const email = route.public
      ? ""
      : util.getUserEmailFromAuthorization(normalizedHeaders.authorization);
    */
    const user = {
      email: 'm@m.com',
    }
    //isAuthorized is a function that checks if the user is authorized to access the api
    if (!route.public) {
      const isAuthorized = user?.authorised ?? false
      const userId = user?.userId

      if (!isAuthorized) {
        Logger.unexpected('Unauthorized', { user })
        return util.response(
          400,
          null,
          `User with email ${user.email} is not authorized.`
        )
      }
    }

    Logger.info('input', {
      request: { ...request, user },
      params: fn.getParamsFromRequest(route, request),
    })
    const rsp = await route.handler({
      request: { ...request, user },
      params: fn.getParamsFromRequest(route, request),
    })

    Logger.info('output', rsp)
    return util.response(200, rsp, rsp?.msg || 'done')
  } catch (e) {
    Logger.unexpected(e, 'ERROR')
    return util.response(400, null, e.message || 'ERROR')
  }
}
