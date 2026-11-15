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

## Deploy

The site is static and runs on Cloudflare Workers. Settings are in
`wrangler.jsonc`: Cloudflare runs `npm run build` and serves the `dist` folder.
Every push to `main` deploys, and other branches get a preview build.

## Licence

AGPL-3.0-or-later. See [LICENSE](LICENSE).
