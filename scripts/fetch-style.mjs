// Refreshes the bundled copy of the OpenFreeMap Liberty style in src/map/liberty-style.json.
// Run with `npm run style`.
import { writeFile } from 'node:fs/promises'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const OUTPUT = new URL('../src/map/liberty-style.json', import.meta.url)

const response = await fetch(STYLE_URL)
if (!response.ok) throw new Error(`Fetching ${STYLE_URL} failed with ${response.status}`)
await writeFile(OUTPUT, `${JSON.stringify(await response.json(), null, 2)}\n`)
console.log(`Wrote ${OUTPUT.pathname}`)
