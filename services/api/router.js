const healthRouter = require('./routes/index')

module.exports.router = () => {
  const routes = [
    {
      proxy: 'core',
      routes: [...healthRouter],
    },
  ]

  return routes
}
