# Site foundation

Preserve the current visual direction while improving layout, geographic accuracy,
component ownership, and failure handling. Work in reviewable stages.

## Checklist

- [ ] Capture expected overview, selection, replay, and responsive behavior.
- [ ] Repair layout and consolidate the legacy and Atlas CSS.
  - [x] Separate visual frame, metrics, and caption.
  - [ ] Consolidate remaining duplicated component rules.
- [ ] Establish and verify a shared geographic coordinate system.
  - [x] Use positive projection scale and explicit north-up axes.
  - [x] Check representative land/water locations and overview/selected-sail rendering.
- [ ] Rebuild geographic assets with polygon topology, coverage boundaries,
  reproducible sources, and direct SVG generation.
  - [x] Rebuild harbor surfaces with polygon-clipping and a committed regional extract.
  - [x] Generate harbor SVG directly using the runtime's projection/path module.
  - [ ] Apply the asset pipeline to cycling.
- [ ] Extract application controller, visual stage, mode renderers, data utilities,
  and current conditions around explicit ownership and cleanup.
  - [x] Extract harbor map rendering and sail data preparation.
- [ ] Define selection/replay transitions and isolate loading failures by mode.
  - [x] Stop cycling replay when leaving the mode.
  - [x] Separate synthetic sail playback timing from measured activity statistics.
- [ ] Verify responsive layouts, mode switching during replay, missing data,
  reduced motion, geographic alignment, and overflow.
  - [x] Check all three selected-activity views at 390, 768, 1024, and 1440px
    for stage/caption overlap and document overflow.
  - [x] Test projection orientation, frame fit, centering, and rotation distance.

## First pass

The original projection used a negative vertical extent and therefore a negative
scale. This canceled the apparent reversed X expression: the previous review's
claim that east and west were mirrored was inaccurate. Positive extents now make
axis orientation and fitting explicit and testable.

Metrics occupy a reserved row below the artwork, preserving map space on narrow
screens and preventing replay labels from covering the caption. This is the first
layout pass; full CSS consolidation and map asset rebuilding remain separate work.

Validation: `node --test tests/projection.test.mjs` and
`node scripts/smoke-playwright.mjs`. Responsive screenshots are written to
`/tmp/site-{mode}-{width}.png`. Only failed first-party requests fail the smoke
suite; optional external services are not a reliable application health signal.
Desktop sailing and mobile cycling screenshots were inspected. Harbor geography
still needs the planned asset rebuild; passing layout checks does not certify it.

## Harbor and data pass

The harbor rebuild is implemented; see [harbor-map.md](harbor-map.md). Land and
water are precomputed, disjoint surfaces covering only the geographic extent.
The build preserves holes/islands, drops the unrelated coastline overlay, and
generates the SVG without launching a browser. Generalized shoreline resolution
remains a source-data limitation, not a coverage guarantee.

The renderer and sailing data preparation now have separate modules. Untimed,
partially timed, or non-monotonic sails can replay, but show "Not recorded" for
measured speed. Existing valid timestamps continue to supply measured statistics.

Seven unit tests pass, including topology, coverage, representative land/water
locations, export/runtime path parity, projection, and timing cases. Browser checks
pass for all three modes at four widths, with overview screenshots as well as
selected activities. Conditions services are deliberately unavailable in this test
to exercise fallback text; a legacy nowrap rule causing overflow was corrected.
Sailing overview/selection and mobile archery screenshots were inspected.

Next: mode-level loading/error isolation, remaining component ownership, and CSS
consolidation. Cycling asset generation and broader replay-transition tests remain.

## Sailing camera

- [x] Increase sailing stage to 70svh on desktop and 55svh on mobile/tablet.
- [x] Start near the densest cluster of sail start/end points.
- [x] Fit each complete sail with 18% padding on each side and preserve aspect ratio.
- [x] Fit all routes on All; restore launch-area framing with Home.
- [x] Animate camera changes, honor reduced motion, and refit on resize.
- [x] Keep map and tracks in one fixed projection; only the SVG camera changes.

Camera fitting and endpoint clustering have unit tests. Browser checks cover Home,
All, all three complete sails, responsive layouts, and reduced-motion framing.

## Interactive harbor prototype

- [x] Shorten automatic camera transitions from 700ms to 260ms.
- [x] Expand basemap coverage to 40.45-40.95 N, 74.30-73.70 W.
- [x] Widen the launch view and add more regional context to All.
- [x] Mouse drag pans; wheel zooms around the pointer; Shift-drag rotates.
- [x] Home and selecting a sail reset rotation and automatic framing.
- [x] Focused-map arrow keys pan and +/- zoom without triggering trace navigation.

Touch retains vertical page scrolling in this mouse-interaction prototype.
The outer region uses Natural Earth land/water; OSM details still come from the
original smaller extract. Tests exercise pan, wheel zoom, rotation, and Home reset.

## Interaction performance

- [x] Coalesce pointer updates into one SVG paint per animation frame.
- [x] Cache marker references and viewport sizes; avoid layout reads after camera writes.
- [x] Clip painting to the SVG viewport and remove sailing-only grain/shadow filters.
- [x] Batch 6,313 roads and 98 piers into two line paths, preserving their geometry.
- [x] Disable per-feature hit testing; map input is handled by the SVG viewport.

`node scripts/smoke-playwright.mjs --profile-camera` exercises 90 alternating zoom
frames during replay, discards 10 warm-up frames, and reports median/p95 intervals.
On the same local headless Chrome run: baseline 133.3/266.6ms, optimized
16.7/16.8ms. These are local comparative measurements, not a device-independent
performance guarantee. All existing browser interaction checks still pass.

## Cycling interaction parity

- [x] Share the camera implementation in `scripts/map-camera.mjs` between both maps.
- [x] Enable cycling drag-pan, wheel zoom, Shift-drag rotation, and keyboard control.
- [x] Increase the cycling stage to the same desktop/mobile dimensions as sailing.
- [x] Fit selected visible ride segments; Home/All restore the Prospect Park overview.
- [x] Batch cycling linework by layer and style without changing geometry or styling.
- [x] Remove cycling's live grain/blur/shadow filters and clip painting to its viewport.
- [x] Preserve playback, live metrics, reduced motion, and constant-size markers.

The existing park-only ride segmentation is unchanged. Both maps measured about
16.7ms median and 16.8ms p95 in the local camera benchmark. Nine unit tests and
all three mode smoke checks pass; browser gesture checks now run on both maps.
Desktop/mobile cycling screenshots were inspected after responsive layout settled.

## Pitch interaction update

Shift-drag on both maps combines horizontal rotation with vertical orthographic
pitch. Upward drag tilts toward 68 degrees; downward drag returns to 0 degrees.
Pan and pointer-centered zoom invert both transforms. Home and automatic activity
framing restore the default rotation and 0-degree pitch. Archery retains tilt only.

## Window-fit layout

- [x] Constrain the shell to 100dvh with a reserved footer row.
- [x] Allocate remaining space to the visual stage rather than adding a fixed vh map height.
- [x] Compact desktop headings, captions, and sidebars; short sidebars can scroll internally.
- [x] Keep phone mode navigation, map, live metrics, and trace controls in the window.
- [x] Put narrow-screen activity metadata in a toggled, internally scrollable panel.
- [x] Support Escape, expanded-state announcements, and inert covered map controls.

All three modes are checked at 320x568, 390x844, 768x1024, 844x390,
1024x768, 1280x600, and 1440x900. Tests assert no document overflow, usable map
height, and no visual/metrics overlap. Details open/close without changing selection.
Short/narrow layouts omit the figure caption and legend to retain working map space.
Desktop and mobile screenshots were inspected.

## Archery camera controls

The target now shares `map-camera.mjs`: drag pans, wheel zooms, Shift-drag tilts
between 0 and 68 degrees, and Home fits the full target at flat pitch. Keyboard
arrows and +/- work while the graphic has focus. Target rings and shots transform
together; arrow diameter remains relative to the scoring face. Home preserves the
selected session, shot playback, and score. Hidden-mode camera motion is canceled.
Browser gesture checks now include archery, including shot/score preservation.

## Water geometry correction

The earlier Natural Earth harbor source was too generalized at interactive zoom
levels. It is replaced by US Census TIGERweb 2026 areal hydrography, covering both
New York and New Jersey. Land is now the bounded complement of those water areas.
Prospect Park uses the same source's closed water polygons with island holes;
the old water collection included open lines that SVG implicitly filled.

`pnpm build:maps` rebuilds both water layers offline from the committed GeoJSON.
The provenance manifest records the service, query parameters, and source hash.
Harbor island/bay probes and park island-hole tests supplement the coverage tests.
Desktop cycling and harbor screenshots were checked; both camera benchmarks
remain around 16.7ms median locally. The old coarse shoreline is no longer used.

## Local Content Drop Folder

- [x] Add `~/Website Content/{targets,cycling,sailing}` and `./update-content`.
- [x] Validate GPX with an XML parser, preserve source files, deduplicate imports, update public indices.
- [x] Read photo capture dates locally, orient images and remove EXIF before vision requests.
- [x] Implement structured vision extraction, hanging-pin exclusions, approximate geometry, and cached results.
- [x] Produce private numbered photo reviews; keep uncertain sites visible and explicitly flagged.
- [x] Seed the March 24 target with the manual extraction and remove samples from the live index.
- [x] Show photo impacts simultaneously, with estimated totals and unknown equipment/order.
- [x] Verify repeat runs, failure handling, corrections, and all three responsive site modes.
- [ ] Configure the owner's API key and verify a live vision extraction on a new photo.

The earlier upload-page direction was removed in favor of the folder workflow.
The command neither commits nor deploys. Full usage and limitations are in
`docs/content-workflow.md`. The API adapter is covered by mocked contract tests;
the seeded target came from manual inspection, not an unverified API run.

### Local Review and Feedback

`./review-targets` opens a loopback-only editor on port 8016. It reuses the
existing photo cache and supports numbered per-mark feedback, target notes,
known counts for overlapping tears, a ready-for-revision state, direct position
corrections, exclusion/restoration, merge/split, and undo. Saving stays local;
the content command applies corrections later. Feedback never enters public
session JSON. Browser tests cover persistence, drag, merge/split, undo, stale-save
conflicts, cross-origin rejection, private-file isolation, and phone layouts.

## Video Content

- [x] Replace Writing with Scenes in desktop and phone navigation.
- [x] Add `Website Content/videos` to the existing content-update command.
- [x] Convert MOV/MP4/M4V/WebM to H.264/AAC web MP4 plus poster; preserve originals.
- [x] Enforce four-minute duration, bounded web dimensions/bitrate, and repeat-import caching.
- [x] Read capture timestamps and general location; look up hourly historical weather when possible.
- [x] Share historical weather lookup and formatting across GPX, targets, and Scenes; remove current-weather fallback.
- [x] Loop muted with custom play/pause and sound controls only, and mode/tab pause.
- [x] Honor reduced motion and leave an honest empty state until footage is imported.
- [x] Verify conversion, metadata, looping playback, mode changes, and desktop/mobile layout with temporary fixtures.

The current local FFmpeg lacks zscale: HDR sources need an SDR export or an
FFmpeg upgrade. No demonstration footage is included in public content.

## Sailing Regions

- [x] Shared region registry, reusable comma-separated map picker, and lazy regional loading.
- [x] Newport Harbor and Mahone Bay polygon basemaps, offline rebuilds, source provenance, and SVG exports.
- [x] Sort 16 real GPX originals into NY/Newport/Mahone without modifying originals.
- [x] Region-aware import, scoped sailing-only updates, and historical weather saved for all 16 sails.
- [x] Delete sailing samples and stale sample trace export.
- [x] Verify regional coverage, isolated tracks, deep links, camera controls, and phone/desktop layouts.

## Event Media

- [x] Shared event photo/video gallery below metadata, with accessible previous/next and placeholder labels.
- [x] Reuse Scenes playback controls; event clips start paused and stop when hidden.
- [x] Local manifest or event-sidecar attachments, image resizing, MP4 conversion, and source-hash caching.
- [x] Seed previews for the first ride and each region's first sail, plus the existing target photo.
- [x] Import the flying clip into Scenes without modifying raw exports.
- [x] Verify photos, playback, mode changes, mobile details, and an actual Scenes video.

## Next Session Notes

Captured at the close of the October 4, 2026 work session; resumed October 5
with the map tasks. No publishing or deployment requested.

- [x] Extend Mahone Bay's geographic coverage, including offshore source-boundary repair. Also give Newport a framing buffer. Check Home, All, every selected sail, and portrait/landscape phone and desktop framing.
- [x] Add restrained roads and parks to Mahone Bay and Newport, preserving shorelines and islands. Use lower-detail regional geometry, cached sources, provenance, and deterministic offline rebuilds.
- [x] Combine horizontal Shift-drag rotation and vertical tilt (0-68 degrees) on cycling and sailing maps; verify pan direction and Home reset afterward.
- [x] Fine-tune the event-media gallery: keep videos without duplicate generated stills, preserve separate uploaded photos, and center-crop all media to fill the frame. Verify desktop/mobile presentation and playback; legacy manifests cannot reintroduce duplicate video posters.
- [ ] Revisit the overall information hierarchy of the metadata components. Consider what belongs in shared conditions, activity summaries, selected-event details, and media; make aggregate versus selected-event context clear.
- [ ] Create Labs for writing and coding experiments. Markdown-based content is the proposed direction, not yet a committed implementation choice. Use the existing center content window; explore a different treatment of the metadata column for this section.
- [ ] Create About. Content and presentation still need to be discussed; do not invent biographical copy.

Current handoff: 29 automated tests and desktop/mobile browser checks passed.
Raw media originals remain in Website Content, with optimized site copies.
Use the local HTTP preview at http://localhost:8015/ rather than opening
index.html through file://, since the site loads modules and content with fetch.
