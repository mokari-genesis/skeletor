const health = require('health')

module.exports = [
  {
    path: 'health',
    method: 'GET',
    handler: health.getHealth,
    public: true,
  },
]
