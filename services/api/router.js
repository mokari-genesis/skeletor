import healthRouter from './routes/index.js'

export const router = () => {
  const routes = [
    {
      proxy: 'core',
      routes: [...healthRouter],
    },
  ]

  return routes
}
