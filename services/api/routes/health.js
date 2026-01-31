import * as health from '../health.js'

export default [
  {
    path: 'health',
    method: 'GET',
    handler: health.getHealth,
    public: true,
  },
]
