- Follow the KISS methodology
- Use vanilla typescript with JSDoc syntax
- Just run `tsc` to typecheck, not `npx tsc`.
- While this project lives in a wider git repository and happens to use a very
  simple `../ui.js` file, think of this `bible` subdirectory as being its own
  independent project -- there's no need to explore the rest of the repository.
- The app must work as a PWA via Safari "Add to Home Screen" for offline use on
  iOS. The service worker (`sw.js`) pre-caches all files so the app works
  without a network connection.

## Files

- `data/` — 66 `.txt` files (one per book, split from Project Gutenberg KJV) plus
  `books.json` (index of book IDs, names, and testaments).
- `index.html` — App shell
- `app.js` — Main application. Fetches and parses book text files on demand,
  renders with `../ui.js`.
- `sw.js` — Service worker. Network-first strategy with two caches:
  `bible-app` for HTML/JS, `bible-data` for book text files. Files are
  pre-cached on install for offline use, but always fetched fresh when online.
- `manifest.json` — PWA manifest for Add to Home Screen

The codebase is quite small so you shouldn't need to do a full Explore,
especially if you start by reading app.js.
