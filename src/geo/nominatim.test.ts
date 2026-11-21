import { describe, expect, it, vi } from 'vitest'
import { createNominatimClient, NominatimError } from './nominatim'

const square = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }

const results = [
  { osm_type: 'relation', osm_id: 1, lat: '37.98', lon: '23.72', name: 'Athens', display_name: 'Athens, Greece', geojson: square },
  { osm_type: 'node', osm_id: 2, lat: '33.9', lon: '-83.3', name: 'Athens', display_name: 'Athens, Georgia', geojson: { type: 'Point', coordinates: [-83.3, 33.9] } },
]

const memoryStorage = () => {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    get length() {
      return data.size
    },
    key: (index: number) => [...data.keys()][index] ?? null,
  }
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const setup = (fetchImpl: typeof fetch) => {
  const sleep = vi.fn(async () => {})
  let clock = 0
  const client = createNominatimClient({
    fetch: fetchImpl,
    storage: memoryStorage(),
    minIntervalMs: 1100,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
      await sleep(ms)
    },
  })
  return { client, sleep }
}

describe('nominatim client', () => {
  it('maps results and marks which ones have a boundary', async () => {
    const { client } = setup(vi.fn(async () => jsonResponse(results)))
    const places = await client.search('Athens')
    expect(places).toHaveLength(2)
    expect(places[0]).toMatchObject({ osmType: 'R', osmId: 1, name: 'Athens', center: [23.72, 37.98] })
    expect(places[0]!.geometry?.type).toBe('Polygon')
    expect(places[1]!.geometry).toBeUndefined()
  })

  it('serves repeated searches from the cache', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(results))
    const { client } = setup(fetchMock)
    await client.search('Athens')
    await client.search('  athens ')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('waits between consecutive requests to respect the rate limit', async () => {
    const { client, sleep } = setup(vi.fn(async () => jsonResponse(results)))
    await client.search('one')
    await client.search('two')
    expect(sleep).toHaveBeenCalledWith(1100)
  })

  it('reports rate limiting with a friendly error', async () => {
    const { client } = setup(vi.fn(async () => jsonResponse({}, 429)))
    await expect(client.search('Athens')).rejects.toThrow(NominatimError)
    await expect(client.search('Paris')).rejects.toThrow(/busy/)
  })

  it('reports network failures with a friendly error', async () => {
    const { client } = setup(vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(client.search('Athens')).rejects.toThrow(/reach/)
  })

  it('looks up a single place by OSM id', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) => jsonResponse([results[0]]))
    const { client } = setup(fetchMock as unknown as typeof fetch)
    const place = await client.lookup('R', 1)
    expect(place?.name).toBe('Athens')
    expect(String(fetchMock.mock.calls[0]![0])).toContain('osm_ids=R1')
  })

  it('ignores an empty query without calling the service', async () => {
    const fetchMock = vi.fn()
    const { client } = setup(fetchMock)
    expect(await client.search('   ')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
