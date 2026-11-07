# Reese McArdle

A personal website for scenes, cycling, sailing, archery, writing, and experiments.

## Preview

Install Node.js 22 or newer, Python 3, and the dependencies with `pnpm install`.
Run `npm run preview`, then open http://localhost:8015/.

The published content is included, so previewing the site does not require private
originals or API credentials. The preview server blocks private files and dotfiles.

## Structure

- `index.html`, `index.js`, and stylesheets: site interface.
- `content/`: prepared website assets, activity records, and source attribution.
- `scripts/`: rendering, content preparation, review, and build tools.
- `tests/`: automated checks.
- `docs/`: workflow and data-format documentation.

Original uploads, credentials, saved target reviews, map-building sources, and
archived experiments live in the ignored `private/` folder. They are not included
in this repository. The site intentionally displays recorded activity locations;
its prepared tracks therefore contain the coordinates needed for those views.

## Content and review

For local authoring, place source material in `private/Website Content/` and run
`./update-content`. Use `./update-metadata --report` to check weather/tide gaps,
and `./update-metadata` to fill them without processing media. See [the content workflow](docs/content-workflow.md).

The target-review utility is included: run `npm run review-targets` and open
http://localhost:8016/. It uses local target records in `private/target-workspace/`;
no personal review records or credentials are shipped with the utility.

## Checks and publishing

Run `npm test` for automated checks and `npm run test:browser` for browser checks.
Detailed comparisons against private map/GPX originals run when those originals
are available; they are explicitly skipped in a public checkout. Public asset
validation and synthetic geometry tests always run.

Map rebuilds require local inputs in `private/build/maps/`. Prepared playback
tracks are generated from `private/build/sails/`. Normal previews need neither.

Publishing uses `./deploy-site`. Original media and archived files are never
required by GitHub Pages. Removing a file from the current tree does not remove
older copies from Git history.
