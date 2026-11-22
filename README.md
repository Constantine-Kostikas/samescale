# Same Scale

Compare the true size of cities, districts, and countries. Web maps use the Mercator projection, which stretches places near the poles. Same Scale moves outlines across the globe with an exact rotation of the sphere, so a shape keeps its real size wherever you drop it.

## Features

- Search any place with a boundary in OpenStreetMap (through Nominatim), or pick a bundled preset.
- Draw your own area.
- "Place over" another shape or a searched place, then fine-tune by dragging.
- Globe view, km² or mi², and share links that encode every shape and position in the URL.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (Vitest)
npm run build      # type-check and build to dist/
npm run presets    # refetch bundled preset boundaries (Nominatim + Natural Earth)
```

## Deploying to Cloudflare

Fully static, no server or API keys. Deployed as a Cloudflare Worker with static assets (`wrangler.jsonc` serves `dist/`), connected to this GitHub repo so every push to `main` deploys.

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Node version: 22 (from `.node-version`)

## How true-size moving works

Every vertex keeps its great-circle distance and bearing from the shape's center when the center moves. That is a rigid rotation of the sphere that keeps north up, so area is preserved exactly. Long edges are densified to 5 km segments first, because MapLibre draws edges as straight lines in Mercator space.

## Data and attribution

- Map tiles: [OpenFreeMap](https://openfreemap.org), © OpenMapTiles, data © OpenStreetMap contributors.
- Place search and boundaries: [Nominatim](https://nominatim.org), data © OpenStreetMap contributors (ODbL). Searches run only on submit, at most one request per second, and are cached locally, per the [usage policy](https://operations.osmfoundation.org/policies/nominatim/).
- Iceland and Greenland presets: [Natural Earth](https://www.naturalearthdata.com) (public domain).

## Known limitations

- OpenStreetMap boundaries of coastal places often include territorial waters (Monaco, Malta, San Francisco), which inflates their area. Such places are left out of the presets, but search results can still include them.
- Many neighborhoods exist in OpenStreetMap only as points, with no boundary, so they can't be added.
