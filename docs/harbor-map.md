# Harbor map pipeline

Install the pinned build dependency with `pnpm install --frozen-lockfile`.
Run `pnpm build:maps` to regenerate both map water layers and the harbor SVG.
`pnpm build:harbor` rebuilds the harbor alone. Normal builds are offline, using
`content/maps/water-source.geojson` and `content/maps/harbor-source.json`.

Water comes from the [US Census TIGERweb Areal Hydrography service](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Hydro/MapServer/1),
January 1, 2026 edition. The committed snapshot contains 1,053 features queried
for the regional extent, with six-decimal coordinate precision and a 0.00001-degree
maximum generalization offset. `water-sources.json` records exact query parameters,
retrieval date, attribution, and SHA-256 hash. To refresh, repeat that query and
replace the snapshot before rebuilding; reject truncated service responses.
OSM park, major-road, and named-pier details retain their original provenance and
OpenStreetMap contributor attribution under ODbL 1.0.

The optional `node scripts/build-harbor-map.mjs --refresh-source` command refreshes
the OSM detail extract from `private/harbor-overpass.json`. That cache is not needed for a
normal checkout's build. Refreshing source data is separate from rebuilding assets.

[polygon-clipping](https://github.com/mfogel/polygon-clipping) computes intersections
and differences while retaining polygon holes and disconnected islands. Water
polygons are unioned and clipped to geographic coverage; land is their complement.
The park uses the same source clipped to its own bounds, with lake islands retained.
This replaces both the old generalized Natural Earth land and cycling's incomplete
water-way collection. Open lines are explicitly rendered without a fill.
The browser draws these finished surfaces with even-odd fills and clips detail
layers to the same geographic coverage. It performs no polygon boolean operations.

`scripts/harbor-map.mjs` owns projection, layer order, SVG paths, and DOM rendering.
The static export and runtime use the same paths. Map and tracks now keep a fixed
projection; `scripts/map-camera.mjs` pans and zooms the SVG viewBox to fit the
selected sail. The initial Home camera uses clustered start/end positions, and All
fits the combined routes. Resizing adjusts framing without restarting playback.
Mouse drag pans, wheel zooms around the pointer, and Shift-drag rotates horizontally
and adjusts orthographic pitch vertically from 0 to 68 degrees for the common
map/trace group. Dragging up increases tilt; down flattens it. Both axes work in
the same gesture. Pan and pointer-anchored zoom invert the combined transform.
Automatic framing resets rotation and pitch and moves the camera in 260ms;
reduced motion applies changes immediately.

## Limits

Census hydrography and OSM detail are independent datasets, so small shoreline and
pier differences can remain. Very small pools and narrow streams may be omitted.
Unrelated OSM coastline strokes are not overlaid as though they were the fill boundary.
The coverage is a finite geographic rectangle; outside it the page remains paper,
not assumed ocean. The exported SVG is an asset, not a navigation chart.
Coverage now spans 40.45-40.95 N and 74.30-73.70 W; the OSM detail extract has not
been expanded, so the outer region is intentionally less detailed.

Run `pnpm test` for topology, coverage, landmark, projection, and timing checks.
Run `pnpm test:browser` for all modes and responsive screenshots.

## Regional Maps

`scripts/map-regions.mjs` is the shared registry for labels, source files,
coverage, projection rotation, import folders, and time zones. It also exports
the reusable comma-separated region picker and coordinate-based GPX classifier.
Sailing offers New York Harbor, Newport Harbor, and Mahone Bay. Cycling has a
Prospect Park registry entry ready for additional regional configurations.

Each sailing region uses the same SVG surface renderer and camera. Region
switching resets trace selection, filters the activity/weather panels to that
region, and retains pan, zoom, tilt, Home, and All. Maps and GPX are loaded once
on demand per region. Deep links use `?mode=sailing&region=newport` or
`?mode=sailing&region=mahone-bay`.

Newport's snapshot uses Census TIGERweb areal hydrography. Mahone Bay uses the
[Nova Scotia Topographic Database water polygons](https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_UT83/MapServer/8).
The query includes water-area classes, excluding wetlands. Their source JSON
files preserve query parameters, attribution, retrieval time, feature count,
and a SHA-256 hash. Downloads request feature IDs first and verify complete
batched retrieval. Builds preserve holes and derive land as the complement of
water inside the configured coverage, exactly like New York.
Regional requests use a 0.0001-degree maximum generalization offset (roughly
8-11 metres here) to avoid carrying survey-scale shoreline detail into the
activity overview. This setting is recorded in each source manifest.

Run `pnpm build:regions` for an offline rebuild. To explicitly refresh the
water snapshots, run `node scripts/build-regional-maps.mjs --refresh-source`.
Use `--refresh-details` for OSM roads and parks; both flags can be combined.
Use `--region=newport` or `--region=mahone-bay` to rebuild only one map.
`OVERPASS_URL` can select another [public Overpass endpoint](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances)
when the default service is unavailable. No private GPX tracks are sent.

Regional details use pinned `osmtogeojson` conversion with complete relation
geometry. Major roads through tertiary roads stay unfilled lines; parks, nature
reserves, and recreation grounds retain polygon holes and are clipped to the
hydrography's land surface in one operation. Raw OSM snapshots and separate
provenance files record the query, coverage, date, attribution, and hash.
Source coverage must match the registry before rebuilding; incomplete downloads
are rejected. Normal builds make no network requests.

Mahone Bay now covers 43.95-44.85 N, 64.75-63.65 W; Newport covers
41.20-41.95 N, 72.00-70.70 W. The wider extents accommodate rotated portrait
and wide-screen automatic cameras. Manual panning/zooming can still leave this
finite coverage; outside it remains paper, not invented ocean.
Roads and parks are concentrated around the sailing areas (`detailBounds` in
the registry); the outer geographic buffer deliberately has less detail.
These maps are personal activity illustrations, not charts.

Nova Scotia's water polygons stop offshore. Mahone supplements that outer ocean
using a clipped, cached [Natural Earth 1:10m land reference](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/),
with a five-kilometre coastal guard and every isolated detailed-source island
preserved. The reference does not replace the detailed coastline. Refresh it
explicitly with `--region=mahone-bay --refresh-ocean-reference`; normal builds
use the saved reference and its provenance.

Run `node scripts/smoke-regions.mjs` against the local site on port 8015 to verify
region switching, isolated tracks, deep links, and mobile/desktop layout.
