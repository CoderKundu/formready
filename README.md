# FormReady

Exam-ready photos, signatures and PDFs, made in the browser.

FormReady turns a phone photo, a signature and a pile of marksheets into files
that pass the upload rules of exam portals (SSC, UPSC, NTA, IBPS and UPSSSC are
planned for version 1). Nothing is uploaded; everything runs on the user's
device.

**Status:** early setup. The app shell is in place; the tools are not built yet.

## Develop

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds the site into `dist/` |
| `npm run preview` | Serves the built site locally |
| `npm run lint` | Lints the code with Oxlint |
| `npm test` | Runs the tests with Vitest, including a check of every exam preset |

## Exam presets

Each exam's upload rules are a JSON file in `src/presets/`, checked against the
Zod schema in `src/presets/schema.ts`. The figures come from the official
sources listed in [docs/portal-rules.md](docs/portal-rules.md).

## Deploy

The site is static and runs on Cloudflare Workers. Cloudflare runs
`npm run build` (set in its build settings) and serves the `dist` folder as
configured in `wrangler.jsonc`. Every push to `main` deploys, and other branches
get a preview build.

## Licence

AGPL-3.0-or-later. See [LICENSE](LICENSE).
