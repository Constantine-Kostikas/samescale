import type { Position } from 'geojson'
import type { AreaGeometry } from './move'
import type { OsmType } from './types'

const BASE_URL = 'https://nominatim.openstreetmap.org'
const CACHE_PREFIX = 'samescale:nominatim:'
const MAX_CACHE_ENTRIES = 30
const SEARCH_LIMIT = 5
/** Degrees. Simplifies boundaries to roughly 50 m, plenty for size comparison. */
const POLYGON_THRESHOLD = 0.0005

export interface Place {
  osmType: OsmType
  osmId: number
  name: string
  displayName: string
  center: Position
  /** Present only when the place has a polygon boundary. */
  geometry?: AreaGeometry
}

export class NominatimError extends Error {}

interface RawPlace {
  osm_type: string
  osm_id: number
  lat: string
  lon: string
  name?: string
  display_name: string
  geojson?: { type: string }
}

interface ClientOptions {
  fetch: typeof fetch
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'length' | 'key'>
  minIntervalMs: number
  now: () => number
  sleep: (ms: number) => Promise<void>
}

const OSM_TYPES: Record<string, OsmType> = { node: 'N', way: 'W', relation: 'R' }

const toPlace = (raw: RawPlace): Place | null => {
  const osmType = OSM_TYPES[raw.osm_type]
  if (!osmType) return null
  const isArea = raw.geojson?.type === 'Polygon' || raw.geojson?.type === 'MultiPolygon'
  return {
    osmType,
    osmId: raw.osm_id,
    name: raw.name || raw.display_name.split(',')[0]!,
    displayName: raw.display_name,
    center: [Number(raw.lon), Number(raw.lat)],
    geometry: isArea ? (raw.geojson as AreaGeometry) : undefined,
  }
}

export const createNominatimClient = (options: ClientOptions) => {
  let nextSlot = 0
  let queue: Promise<unknown> = Promise.resolve()

  const readCache = (key: string): RawPlace[] | null => {
    try {
      const cached = options.storage.getItem(CACHE_PREFIX + key)
      return cached ? (JSON.parse(cached) as RawPlace[]) : null
    } catch {
      return null
    }
  }

  const evictOldest = () => {
    const keys: string[] = []
    for (let index = 0; index < options.storage.length; index++) {
      const key = options.storage.key(index)
      if (key?.startsWith(CACHE_PREFIX)) keys.push(key)
    }
    keys.slice(0, Math.max(1, keys.length - MAX_CACHE_ENTRIES + 1)).forEach((key) => options.storage.removeItem(key))
  }

  const writeCache = (key: string, value: RawPlace[]) => {
    const serialized = JSON.stringify(value)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        options.storage.setItem(CACHE_PREFIX + key, serialized)
        return
      } catch {
        evictOldest()
      }
    }
  }

  const throttledFetch = (url: string): Promise<Response> => {
    const run = async () => {
      const wait = nextSlot - options.now()
      if (wait > 0) await options.sleep(wait)
      nextSlot = options.now() + options.minIntervalMs
      return options.fetch(url, { headers: { Accept: 'application/json' } })
    }
    const result = queue.then(run, run)
    queue = result.catch(() => undefined)
    return result
  }

  const request = async (path: string, params: Record<string, string>): Promise<RawPlace[]> => {
    const query = new URLSearchParams({ format: 'jsonv2', polygon_geojson: '1', polygon_threshold: String(POLYGON_THRESHOLD), ...params })
    const url = `${BASE_URL}/${path}?${query}`
    const cached = readCache(url)
    if (cached) return cached

    let response: Response
    try {
      response = await throttledFetch(url)
    } catch {
      throw new NominatimError("Couldn't reach the place search. Check your connection, or try a preset.")
    }
    if (response.status === 429) throw new NominatimError('The place search is busy right now. Wait a moment and try again, or pick a preset.')
    if (!response.ok) throw new NominatimError(`The place search failed (HTTP ${response.status}). Try again, or pick a preset.`)

    const body = (await response.json()) as RawPlace[]
    writeCache(url, body)
    return body
  }

  return {
    async search(query: string): Promise<Place[]> {
      const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ')
      if (!normalized) return []
      const raw = await request('search', { q: normalized, limit: String(SEARCH_LIMIT) })
      return raw.map(toPlace).filter((place): place is Place => place !== null)
    },

    async lookup(osmType: OsmType, osmId: number): Promise<Place | null> {
      const raw = await request('lookup', { osm_ids: `${osmType}${osmId}` })
      return raw.map(toPlace).find((place) => place !== null) ?? null
    },
  }
}

export const nominatim = createNominatimClient({
  fetch: (...args) => fetch(...args),
  storage: typeof localStorage === 'undefined' ? (undefined as never) : localStorage,
  minIntervalMs: 1100,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
})
