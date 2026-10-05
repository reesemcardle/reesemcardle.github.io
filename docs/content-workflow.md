# Adding Content

Drop files into your local folder, outside the website repository:

```
~/Website Content/
  targets/   # Completed target photos: JPEG, PNG, WebP
  cycling/   # Recorded cycling GPX files
  sailing/   # Sailing GPX files (timing optional)
  videos/    # MP4, MOV, M4V, WebM clips up to four minutes
  review/    # Generated private target overlays and summary
```

From the website repository, run:

```sh
./update-content
```

`npm run update-content` does the same thing. `./update-content --dry-run` lists work without writing files or calling the API. `--folder '/another/path'` overrides the input folder. Subfolders are scanned recursively; symbolic links are not followed. Files left in the folder are not added again. Removing an input file does not remove a published activity.

## Target Photos

Set `OPENAI_API_KEY` in the ignored file `private/content.env` on your own machine. Do not put a key in the public site or commit it. `OPENAI_VISION_MODEL` defaults to `gpt-6-astra`; changing it does not rerun cached extractions.

New photos are oriented, reduced to a maximum 2560-pixel long edge, and stripped of EXIF before being sent to the OpenAI Responses API. Local EXIF processing retains the original capture date and timezone when available. Photos are sent only when this command runs and there is no cached extraction. API usage is billed to your API account, separately from Codex. The request uses `store: false`; this does not assert that all provider retention is disabled.

The model returns impact sites and scoring-ring geometry, with top hanging-pin holes separated from impacts. Coordinates are normalized to the site's target; X is right, Y is up, and radius 1 is the outside scoring edge. Uncertain merged tears are flagged, not turned into invented shot counts or chronology. Target scores are approximate center-based estimates, not official line-cutter scores. Only the existing 40 cm single-face ten-ring target is supported; other faces should be rejected for review.

Coordinates are added to the site automatically, including flagged candidate sites shown in pink. Each imported photo gets a local HTML overlay under `review/`; open it to inspect numbered marks. Original photos and local paths are never put in the public data. A model can miss or misidentify impacts even when it returns valid JSON: this is assisted transcription, not a verified scoring system.

The supplied March 24, 2026 photo is seeded with a **manual visual extraction**, not an API result: 76 candidate sites, four flagged locations, two hanging holes excluded. New photos take the API path. A live API call has not yet been verified with your account.

EXIF capture time is not treated as shooting start time. Unknown distance and equipment remain unknown. If a date is missing, the photo stays pending until you provide one.

Optional corrections go beside an image in a JSON file with `.json` appended to its full name, for example `target.jpeg.json`:

```json
{
  "name": "Range practice",
  "date": "2026-03-24",
  "excludeImpacts": ["impact-14"]
}
```

The sidecar is optional; omit fields you do not need. Mark numbers in the report correspond to `impact-N` identifiers. Re-running applies these corrections without another API charge. Detailed extraction coordinates are retained in `private/target-workspace/photo-*.json` for precise edits. The raw model response is retained separately in `*.detection.json` for reference.

## Local Target Review

Run `./review-targets` (or `npm run review-targets`) from the website repository,
then open `http://localhost:8016`. Keep that terminal running. Set
`TARGET_REVIEW_PORT` to use another port if 8016 is occupied. This server binds
only to loopback and serves only the editor and target records, not arbitrary
repository files or API keys. It makes no vision API calls.

Select a numbered mark to leave feedback, confirm it, exclude/restore it, or
record a known shot count for an overlapping tear. Known counts do not invent
extra coordinates or alter estimated scoring. Drag a marker to correct its
location; use Add impact for a missed hole. Split keeps the selected location
and adds a second where you click. To merge, check multiple marks in the list;
the active mark's position is retained and the others become excluded. Excluded
marks remain available for restoration. Undo is available until saving.

Whole-target notes and per-mark feedback stay in the ignored local
`private/target-workspace/photo-*.json` record, separate from the original
extraction notes. Choose **Ready for revision**, then **Save review**, and tell
Codex the reviews are ready. Codex can read `reviewFeedback`, each mark's
`feedback`, and `reviewState` directly from those records. Saving does not send a
chat message or start a background agent.

Saving updates the local cache only. Run `./update-content` afterward to apply
coordinate corrections to the site and regenerate reports, without repeating
vision analysis. Feedback text is not included in the public site data. Keep
using stable mark IDs: excluded or merged marks do not renumber the others.
Photo-name/date sidecars, when present, still take precedence over editor values.

## GPX Import

The folder determines the activity, so cycling versus sailing is never guessed. Validated tracks are copied into the existing public content structure and indexed automatically. Re-importing the same track does not duplicate it, even after renaming it. Existing activities are preserved. Public copies contain positions and times but omit device/account extensions. Positions themselves are public location data; trim sensitive starts and ends before importing.

Cycling needs increasing point timestamps because its existing replay displays measured speed. Sailing can handle untimed tracks without fabricating measured speed. Route-only files without `trkpt` positions are reported rather than silently converted. The command does not rebuild geographic basemaps. Historical weather is saved during import and reused; the browser reads the updated indices directly.

## Scenes

Drop iPhone or Photos exports into `~/Website Content/videos`, then run
`./update-content` from the website repository. MOV and MP4 are accepted, along
with M4V and WebM, up to four minutes long. Export originals from Photos when
possible so the embedded capture date survives. Originals remain untouched.

The importer creates a web-friendly H.264/AAC MP4, poster, and fast-start playback,
at 30 fps and up to 1280x720 landscape or 720x1280 portrait without upscaling.
Audio is retained. Unchanged originals and sidecars are skipped.
FFmpeg and ffprobe are installed on this Mac; `FFMPEG_PATH` and `FFPROBE_PATH`
can override their paths.

HDR phone clips currently need an SDR export: this Mac's FFmpeg lacks the zscale
filter required for HDR tone mapping. Unsupported conversions are reported,
not published with washed-out colors. Sources over 2 GB and web copies over
90 MB are rejected. Shorter loops keep downloads lighter.

Scenes fills the existing animation area, cropping edges as needed, loops, and
starts muted. Only play/pause and sound on/off appear over the video. There is
no timeline, timestamp, fullscreen button, or options menu. Clips without audio
have a disabled sound control. Playback pauses when the section or browser tab
is hidden. Reduced-motion visitors can start playback explicitly.

Visible metadata is **location, date, and historical weather/wind**. Date comes
from embedded capture metadata, never file-modification time. The place label is
owner supplied. Embedded GPS is used for weather lookup, not as the visible label.
Original metadata is stripped from the public MP4.

Add an optional file next to a clip, using its full filename plus `.json`.
For example, `IMG_1234.MOV.json`:

```json
{
  "location": "Prospect Park",
  "date": "2026-10-04"
}
```

Omit `date` to use the embedded capture date. A date override uses YYYY-MM-DD.
Scenes appear newest first. This updates local site files only; publishing
still uses the site's normal Git/deployment workflow.

## Sailing Regions

Sailing originals are organized under `sailing/NY`, `sailing/Newport`, and
`sailing/Mahone`. The importer scans subfolders and assigns the map using track
coordinates, not filenames. Public GPX copies live in matching region-ID folders.
Unknown regions are reported instead of being drawn on the wrong map.

To organize new files dropped directly into `sailing/`, preview with
`node scripts/organize-sailing.mjs`, then add `--apply` to move originals and
their optional JSON sidecars. Existing destination files are never overwritten.
Run `./update-content --only sailing` to import sails without applying pending
target-photo or video changes. The default command still imports all content.

The initial real dataset contains 11 New York sails, 3 Newport sails, and 2
Mahone Bay sails. The three old sailing samples were deleted. Adjacent repeated
GPX timestamps are deduplicated in the published copy, preserving originals and
measured timing for the rest of the activity.

Each sail now has an editable `filename.gpx.json` next to its original. Boat
details use `boat: {"name":"American Eagle","sailNumber":"US-21","class":"12 Metre"}`.
`sailType` can identify a race, club sail, cruise, or practice.
`event` and `notes` are optional public text. Unassigned boats/types can use
`boatOptions` and `sailTypeOptions` without asserting which applies.
Newport is recorded as American Eagle / US-21 / 12 Metre / race; Mahone as J/30;
New York retains J/80-or-J/24 and race-or-club uncertainty.

`durationSeconds` is elapsed GPX start-to-end time, including stops, not official
race time. It is included in the initial sidecars for reference; every import
derives the published duration from the GPX rather than trusting a manual override.
The Sail details panel shows the selected outing; Fleet details summarizes the
current region with total duration. Editing the JSON and rerunning
`./update-content --only sailing` updates existing records without duplicating
tracks or repeating cached weather requests.

The shared conditions panel lists location, date, start time, average wind,
starting tide, ending tide, weather, and average temperature. Starting/ending
tide remain unrecorded where those values have not been retrieved; a missing
ending tide is never copied from the starting value.

## Shared Activity Weather

`scripts/activity-weather.mjs` is the single historical-weather provider used by
GPX imports, target photos, Scenes, and the metadata rebuild command. It accepts
coordinates and a timezone-qualified start/end instant, rounds coordinates to
two decimal places, and requests UTC hourly samples from the
[Open-Meteo archive](https://open-meteo.com/en/docs/historical-weather-api).
It averages samples across an activity window, or uses the nearest hour for a
photo or clip. These are historical estimates, not exact on-site observations.
The site uses one shared display formatter for all four modes.

Successful results are cached with their lookup inputs. Missing or failed results
are retried on the next import without rerunning target detection or retranscoding
unchanged footage. No browser-time weather request or current-weather fallback
is used. Aggregate views show the latest activity's conditions, labeled as latest.

GPX supplies its recorded times and starting coordinates. Target photos and
iPhone videos use embedded capture times and GPS when present. All content can
have an owner-supplied place label; photo/video sidecars can also supply
`capturedAt` (for example `2026-10-04T15:30:00-04:00`) and
`coordinates: {"latitude":40.66,"longitude":-73.97}` when metadata is missing.
A place name or date alone cannot determine hourly weather. Those cases show
unavailable rather than assuming noon or Brooklyn. If you correct only the date,
supply the corrected capture time too to retrieve matching weather.

For offline imports or tests, `CONTENT_WEATHER_OFFLINE=1` disables new GPX/photo
weather requests. Dry runs never request weather.

## Event Photos and Videos

Raw exports are fine. The updater creates resized, metadata-stripped JPEGs and
the same bounded H.264/AAC MP4s used by Scenes, without altering originals.
The current SDR iPhone examples convert directly. HDR still requires an SDR
export or an FFmpeg build with zscale. Event videos have the same four-minute
limit as Scenes. JPEG, PNG, and WebP images are supported; export HEIC as JPEG.

`Website Content/event-media.json` maps events to ordered media arrays:

```json
{
  "cycling:2025-08-01": [
    {
      "file": "placeholder image and video/bike.MOV",
      "alt": "Cycling preview",
      "placeholder": true
    }
  ]
}
```

Paths are relative to Website Content and cannot escape that folder. Event keys
use `cycling:`, `sailing:`, or `archery:` followed by the event ID in the
corresponding public index. Each video appears once; its generated poster is
only a playback preview, never a separate gallery still. Legacy `posterOnly`
entries import as videos and duplicate video entries are collapsed. Separately
uploaded photos remain separate items. Photos and videos use a centered crop
to fill the gallery frame. Empty arrays remove the event's gallery references without
deleting originals. `./update-content --only media` processes this manifest.

For an event already managed by an original-file JSON sidecar, the same array
can instead go in its `media` field. Run the usual content update for that
activity. Use one configuration location per event rather than defining it in
both the central manifest and the sidecar.

The gallery lives below event metadata. Previous/next controls step through
multiple items; videos reuse the Scenes play/pause and sound controls but do
not autoplay. Playback stops on event/mode changes, when the details panel
closes, or when the gallery leaves view. In an All view, the gallery is labeled
with the first event's name. Placeholder previews are explicitly marked.

The first ride, first sail in each region, and the existing target session are
seeded. The sailing previews are not claimed to depict the Newport or Mahone
events. Event media never initiates an additional weather lookup.

## Import Errors

Files are processed independently. Invalid files, absent capture dates, missing API keys, and failed API requests are reported; the command continues with the others and exits nonzero when something needs attention. Successful detections are cached by the original file's SHA-256, avoiding repeat API calls. Byte-identical photos are deduplicated; re-encoded versions of a photo have different hashes and should not both be imported.

The first real target removes sample sessions from the live index. Old sample files remain unreferenced for now. Nothing commits, pushes, or deploys automatically. Reload the local site to see the changes, then publish through the usual Git workflow.

Implementation references: [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Labs and About

These sections use the same local folder and update command, without an API.
Run commands from the website project folder.

- `Website Content/labs/my-entry.md`: Markdown text. Use lowercase, hyphenated filenames; the filename is the permanent entry ID.
- `Website Content/labs/my-entry.md.json`: optional metadata, shown below.
- `Website Content/about/about.md`: the public profile and resume; use level-two headings for Experience, Education, and other sections.
- `Website Content/about/about.md.json`: name, city-level location, LinkedIn URL, and an optional public email alias. Email is currently null and is not displayed.

```json
{
  "title": "An experiment",
  "date": "2026-10-05",
  "kind": "experiment",
  "summary": "A short description of this entry.",
  "tags": ["Maps"],
  "draft": true,
  "experiment": "my-experiment.html"
}
```

Use `kind: "writing"` for essays; omit `experiment` when there is no demo.
Set `draft` to false, or omit it, when an entry is ready to appear. Drafts are
excluded from generated public data. The optional experiment is a self-contained
HTML file inside `labs`, with inline CSS/JavaScript. It runs in a sandboxed frame
without access to the parent page; it is removed when leaving the entry. Treat
experiment code as public and never include credentials. Relative module imports
and accompanying asset folders are not bundled in this first version.

Markdown supports headings, lists, links, tables, blockquotes, code fences, and
images using full HTTPS URLs or existing site-asset paths. Arbitrary scripts and
iframes inside Markdown are stripped. Article headings become sidebar links.
Dates are optional; no file-modification date is presented as a publication date.

Run `./update-content --only labs` or `./update-content --only about`; the normal
`./update-content` includes both. Output is saved in `content/pages/`, so visitors
do not need a Markdown parser, an API connection, or the activity/map data to read
these sections. A deleted or newly drafted Labs entry disappears on the next
update; removing About's source file leaves the last published version intact.

About's initial seed uses only details visible on the supplied
[LinkedIn profile](https://www.linkedin.com/in/reesemcardle/). Job titles, most
employment dates, and degree details were not accessible and were not invented.
The source folder is the editable master; the seed script never overwrites it.
Email/privacy choices remain deferred. Obfuscating an address in JavaScript is
not a privacy boundary; use a dedicated public alias if email is added later.
# Publishing

After updating content and reviewing the local site, commit the intended changes
on `master`, then run `./deploy-site` from the website folder
(`npm run deploy` also works when npm is installed).

This runs the tests, checks that the working tree is clean and the remote branch
has no unmerged changes, stamps the footer with the publication date in New York
time, commits the date if needed, and pushes to GitHub Pages. Same-day deployments
do not create an extra date commit. Check the Pages deployment and live site after
pushing. If the push fails, resolve the issue and run the command again.

Use this command instead of a bare `git push` when publishing, so the date is
updated. Content imports still do not commit or publish anything. The footer is
static: it never changes just because a visitor loads the page.
