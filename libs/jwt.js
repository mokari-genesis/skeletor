const jwt = require('jsonwebtoken')
const jwkToPem = require('jwk-to-pem')

// See https://jwt.io/introduction for JWT decoding.
function base64Decode(token) {
  return JSON.parse(
    Buffer.from(token.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
  )
}

function decodedHeaderAndBody(token) {
  // Parse header and body
  const [header, body] = token.split('.').slice(0, 2).map(base64Decode)

  return [header, body]
}

function verifiedBody({ token, key }) {
  return jwt.verify(
    token,
    jwkToPem(key),
    {
      algorithms: ['RS256'],
      issuer: `https://cognito-idp.us-east-1.amazonaws.com/${process.env.AWS_POOL_ID}`,
    },
    (err, decoded) => (err ? null : decoded)
  )
}

module.exports = {
  decodedHeaderAndBody,
  verifiedBody,
}
