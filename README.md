# simple-to-do

Live at **https://simple-to-do.davidp.dev**

A tiny installable to-do PWA built for very quick additions. Everything is stored in your browser's IndexedDB and it works fully offline once installed. No backend, no accounts, no build step.

## How it works

- Four pages in the bottom nav: **Later**, **Month**, **Week**, **History**. The page title is top left.
- **+** (top right) opens a modal; type and press **Add** (or Enter). The item lands on the current page. On History, **+** adds to Later.
- On Later, Month and Week, **swipe or drag** a row sideways to move it: right goes Later → Month → Week, left goes back. The target list shows as a colored hint while you drag. Works with touch and mouse.
- Fallback: **long-press** (or right-click) a row, or tap its **⋯**, to pick any list directly (or delete it).
- **Check** an item to send it to History. Only the completion date and the list it came from are kept. **Uncheck** it in History and it returns to that list.

Because nothing leaves your device, clearing site data erases your list.

## Data model

One IndexedDB database (`simple-to-do`), one object store (`items`):

```js
{ id, text, list: "later" | "month" | "week" | "history", order,
  completedAt?, from? }   // completedAt + from only while in History
```

List logic lives in `public/store.js` (no DOM) and is unit-tested in Node.

## Run locally

```bash
npm install
npm run dev     # http://localhost:5181
npm test        # IndexedDB / list logic tests (fake-indexeddb)
```

Service workers (so offline use and install) need `localhost` or HTTPS.

## Deploy

Hosted on Cloudflare as an assets-only Worker, configured in `cloudflare.config.ts` (Worker `simple-to-do`, custom domain `simple-to-do.davidp.dev`), same as poop-tracker. Deploy with the [`cf` CLI](https://developers.cloudflare.com/cf/):

```bash
npm install
npm run deploy
```

When you change any file in `public/`, bump `CACHE` in `public/sw.js` so installed copies pick up the update.

## Files

- `public/index.html`, `styles.css`, `app.js`: UI, swipe/drag, modals
- `public/store.js`: IndexedDB store and list logic
- `public/sw.js`: precaches everything; cache-first, refreshes in the background
- `public/manifest.webmanifest` + `public/icons/`: install metadata (`scripts/make-icons.py` renders the PNGs)

## License

MIT
