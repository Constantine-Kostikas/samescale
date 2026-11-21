// Fetches preset boundaries once and writes them to src/presets/presets.json.
// Run with `npm run presets`. Respects the Nominatim usage policy (1 request per second).
// Coastal places whose OSM boundary includes territorial waters are either left out
// or taken from Natural Earth land polygons instead, so their area matches the land.
import { writeFile } from 'node:fs/promises'

const SMALL = 0.0002
const MEDIUM = 0.0005
const LARGE = 0.01

const PRESETS = [
  ['athens', 'Athens', 'Municipality of Athens, Greece', MEDIUM],
  ['amsterdam', 'Amsterdam', 'Amsterdam, North Holland, Netherlands', MEDIUM],
  ['paris', 'Paris', 'Paris, Ile-de-France, France', MEDIUM],
  ['greater-london', 'Greater London', 'Greater London, England', MEDIUM],
  ['city-of-london', 'City of London', 'City of London, England', SMALL],
  ['manhattan', 'Manhattan', 'Manhattan, New York County, New York', MEDIUM],
  ['central-park', 'Central Park', 'Central Park, Manhattan, New York', SMALL],
  ['berlin', 'Berlin', 'Berlin, Germany', MEDIUM],
  ['rome', 'Rome', 'Roma Capitale, Lazio, Italy', MEDIUM],
  ['vatican', 'Vatican City', 'Vatican City', SMALL],
  ['madrid', 'Madrid', 'Madrid, Community of Madrid, Spain', MEDIUM],
  ['barcelona', 'Barcelona', 'Barcelona, Catalonia, Spain', MEDIUM],
  ['lisbon', 'Lisbon', 'Lisbon, Portugal', MEDIUM],
  ['vienna', 'Vienna', 'Vienna, Austria', MEDIUM],
  ['prague', 'Prague', 'Prague, Czechia', MEDIUM],
  ['copenhagen', 'Copenhagen', 'Copenhagen Municipality, Denmark', MEDIUM],
  ['oslo', 'Oslo', 'Oslo, Norway', MEDIUM],
  ['helsinki', 'Helsinki', 'Helsinki, Finland', MEDIUM],
  ['reykjavik', 'Reykjavík', 'Reykjavík, Iceland', MEDIUM],
  ['los-angeles', 'Los Angeles', 'Los Angeles, California', MEDIUM],
  ['buenos-aires', 'Buenos Aires', 'Ciudad Autónoma de Buenos Aires, Argentina', MEDIUM],
  ['shinjuku', 'Shinjuku', 'Shinjuku, Tokyo', MEDIUM],
  ['nairobi', 'Nairobi', 'Nairobi County, Kenya', MEDIUM],
  ['luxembourg', 'Luxembourg', 'Luxembourg', MEDIUM],
  ['texas', 'Texas', 'Texas, United States', LARGE],
]

const NATURAL_EARTH_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'

const NATURAL_EARTH_PRESETS = [
  ['iceland', 'Iceland', 'ISL'],
  ['greenland', 'Greenland', 'GRL'],
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const round = (value) => Math.round(value * 1e5) / 1e5
const roundCoordinates = (coords) => (typeof coords[0] === 'number' ? coords.map(round) : coords.map(roundCoordinates))
const countPoints = (coords) => (typeof coords[0] === 'number' ? 1 : coords.reduce((sum, c) => sum + countPoints(c), 0))

const output = []
for (const [id, name, query, threshold] of PRESETS) {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', polygon_geojson: '1', polygon_threshold: String(threshold), limit: '5' })
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': 'samescale-preset-builder/0.1' },
  })
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`)
  const results = await response.json()
  const match = results.find((r) => r.geojson?.type === 'Polygon' || r.geojson?.type === 'MultiPolygon')
  if (!match) {
    console.warn(`${id}: no boundary found, skipped`)
  } else {
    const geometry = { type: match.geojson.type, coordinates: roundCoordinates(match.geojson.coordinates) }
    output.push({ id, name, osm: `${match.osm_type[0].toUpperCase()}${match.osm_id}`, geometry })
    console.log(`${id}: ${match.display_name} (${countPoints(geometry.coordinates)} points)`)
  }
  await sleep(1100)
}

const naturalEarth = await (await fetch(NATURAL_EARTH_URL)).json()
for (const [id, name, isoCode] of NATURAL_EARTH_PRESETS) {
  const feature = naturalEarth.features.find((f) => f.properties.ADM0_A3 === isoCode)
  if (!feature) throw new Error(`${id}: not found in Natural Earth`)
  const geometry = { type: feature.geometry.type, coordinates: roundCoordinates(feature.geometry.coordinates) }
  output.push({ id, name, geometry })
  console.log(`${id}: Natural Earth ${isoCode} (${countPoints(geometry.coordinates)} points)`)
}

output.sort((a, b) => a.name.localeCompare(b.name))
await writeFile(new URL('../src/presets/presets.json', import.meta.url), JSON.stringify(output))
console.log(`Wrote ${output.length} presets`)
