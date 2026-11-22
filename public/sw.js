const CACHE = 'map-tiles-v1'
const MAX_ENTRIES = 3000
const TILE_HOST = 'tiles.openfreemap.org'
const IMMUTABLE_PATHS = [/^\/planet\/[^/]+\/\d+\/\d+\/\d+\.pbf$/, /^\/natural_earth\//, /^\/sprites\//, /^\/fonts\//]

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.hostname !== TILE_HOST) return
  const immutable = IMMUTABLE_PATHS.some((pattern) => pattern.test(url.pathname))
  event.respondWith(immutable ? cacheFirst(event) : networkFirst(event))
})

async function cacheFirst(event) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(event.request)
  if (cached) return cached
  const response = await fetch(event.request)
  if (response.ok) event.waitUntil(store(cache, event.request, response.clone()))
  return response
}

async function networkFirst(event) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(event.request)
    if (response.ok) event.waitUntil(store(cache, event.request, response.clone()))
    return response
  } catch (error) {
    const cached = await cache.match(event.request)
    if (cached) return cached
    throw error
  }
}

async function store(cache, request, response) {
  await cache.put(request, response)
  const keys = await cache.keys()
  const excess = keys.length - MAX_ENTRIES
  if (excess > 0) await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)))
}
