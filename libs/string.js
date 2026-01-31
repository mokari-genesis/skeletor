export function camelize(text) {
  return text.replace(/^([A-Z])|[\s-_]+(\w)/g, function (_, p1, p2) {
    if (p2) {
      return p2.toUpperCase()
    }
    return p1.toLowerCase()
  })
}

export function camelizeKeys(o) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [camelize(k), v]))
}

export const streamToString = stream =>
  new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', chunk => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    stream.on('error', reject)
  })
