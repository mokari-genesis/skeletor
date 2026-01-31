// eslint-disable-next-line no-unused-vars
export const response = async (code, data, msg, msConn = null, pgConn = null) => {
  if (pgConn) {
    await pgConn.end()
  }

  return {
    statusCode: code,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(
      {
        data,
        msg: msg || 'OK',
        status: code >= 200 && code < 300 ? 'SUCCESS' : 'FAILURE',
      },
      null,
      2
    ),
  }
}

export const getBody = event => {
  try {
    return event.body
      ? typeof event.body === 'string'
        ? JSON.parse(event.body)
        : event.body
      : JSON.parse(event.Records[0].Sns.Message)
  } catch (e) {
    return {}
  }
}

export const normalizeKeysToLowercase = input => {
  input = input || {}
  return Object.entries(input).reduce(
    (acc, [key, value]) => ({ ...acc, [key.toLowerCase()]: value }),
    {}
  )
}
