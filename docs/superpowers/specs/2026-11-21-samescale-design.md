# Same Scale: design

Name picked by Claude (repo `samescale`), easy to change. Date: 2026-11-21.

## Intent

A just-for-fun web app to compare the true size of cities and areas. Pick Athens, drag its outline onto Amsterdam, and see how they really compare. Web maps use Web Mercator, which inflates sizes away from the equator, so a naive overlay lies. This app moves shapes across the globe so they stay true to size.

Audience: the owner and whoever they share it with. No commercial goals.

## Goals

- Search for a place (city, district, neighborhood, region) and get its real boundary as an outline on the map.
- Pick from a small set of bundled presets that load instantly and work without Nominatim. (The basemap still needs OpenFreeMap. No offline basemap fallback.)
- Draw a custom polygon.
- New shapes appear at their real location. Each shape has a "Place over" action: pick another shape or search a place, and the shape jumps there at true size. Fine-tune by dragging. It keeps its true size and its north-up orientation.
- No ghost outline left at the original location (v1).
- Show several shapes at once, each in its own color, with name and area (km², toggle to mi²).
- Globe view, so zooming out shows the Earth's curvature and why Mercator distorts.
- Share a comparison through a link (state in the URL hash).
- Works on desktop and mobile (touch drag).
- Static site, hosted on Cloudflare Pages. No server, no API keys, no running costs.

## Non-goals

- Accounts, saved comparisons beyond the URL, backend of any kind.
- Rotating shapes, editing vertices of searched boundaries, analytics.
- Live search-as-you-type.

## Anti-goals

- A shape displayed at the wrong size after moving. That defeats the whole point.
- Abusing the free public services (Nominatim, OpenFreeMap) or breaking their usage policies.

## Constraints

- Nominatim usage policy: at most 1 request per second, valid attribution, identify the app, no autocomplete. Search fires only on explicit submit, debounced, with results cached in `localStorage`.
- OpenStreetMap data is ODbL: show "© OpenStreetMap contributors" attribution.
- Static output only (Cloudflare Pages).

## Approaches considered

1. **MapLibre GL JS + OpenFreeMap tiles + Nominatim, with bundled presets as fallback. (Chosen.)** Fully static, free, keyless, and has globe projection. Depends on two free public services, acceptable at hobby traffic.
2. Leaflet instead of MapLibre. Simpler and smaller, with plenty of draw plugins, but no globe view, which is the most fun part.
3. Curated presets only, no live search. Most reliable, but you can't look up your own neighborhood.

The owner chose 1, with 3's bundled presets as fallback.

## Decided how

- **Map:** MapLibre GL JS v5 with globe projection, OpenFreeMap "liberty" style.
- **Search:** Nominatim `/search` with `format=jsonv2`, `polygon_geojson=1`, and a `polygon_threshold` to simplify the geometry. Keep only results whose geometry is a Polygon or MultiPolygon. Point-only results show as "no boundary available". The user picks from up to 5 results.
- **Presets:** about 30 well-known cities and areas across many latitudes (mix of capitals, famous districts, islands). Fetched once by a build-time script from Nominatim, simplified, and committed as static GeoJSON. Not fetched at runtime.

## Builder's calls (Claude's proposals, owner can override)

- **Stack:** Vue 3 + TypeScript + Vite + Tailwind CSS 4, npm. Matches the owner's other projects.
- **True-size move algorithm:** for each vertex, compute geodesic distance and bearing from the shape's original centroid, then place it at the same distance and bearing from the new centroid (Turf `distance`, `bearing`, `destination`). This is exactly a rigid rotation of the sphere that keeps north-up, so area is preserved for shapes of any size. Alternative considered: a plain great-circle rotation (also rigid, but the shape tilts away from north-up, which makes comparisons harder to read).
- **Rendering accuracy:** MapLibre draws polygon edges as straight lines in Mercator space, not great-circle arcs. After each move, densify edges longer than a threshold (e.g. 10 km) so large shapes render at their true area. Clamp the target centroid away from the poles, where bearings are undefined.
- **Drawing:** Terra Draw (MapLibre adapter) for drawing a polygon.
- **Dragging:** custom pointer handling on the shape's fill layer. While dragging, the map pan is disabled and the shape is re-projected each frame against the cursor position.
- **Share link:** URL hash holds a compact list of shapes. Searched shapes store their OSM type and ID plus current centroid. Presets store their preset ID plus centroid. Drawn shapes store an encoded polyline. On load, OSM shapes are re-fetched through Nominatim `/lookup` (respecting the rate limit and cache).
- **Testing:** Vitest unit tests for the move algorithm (area preserved within 0.01% when moving city- and country-sized shapes from 38°N to 60°N and to the equator; centroid lands where requested; pole clamping) and for share-link encode and decode. Manual check in the browser for interaction.
- **Look:** clean, map-first layout. Side panel on desktop, bottom sheet on mobile.

## Left to the builder

- Exact preset list.
- Color palette and visual polish.
- Handling of MultiPolygons with far-flung parts (e.g. islands belonging to a city) in the move algorithm: same per-vertex method from the overall centroid is acceptable.
- Error states and empty states.
