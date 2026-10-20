# Project rules

## Goal

A browser-only proof of concept: render a PDF page with pdfjs-dist and draw precise sentence and
word highlights (text-to-speech style) in a custom overlay layer above the native PDF.js layers.

## Structure

- `src/lib/pdf/` — pdfjs-dist setup, the page component (canvas + text layer + overlay) and the
  replay of the PDF's drawing instructions (glyph positions).
- `src/lib/text/` — page text model (blocks, reading order data) and sentence/word segmentation.
- `src/lib/highlight/` — character range → boxes, glyph edges, the accuracy metric, their components.
- `src/lib/reader/` — reading position, playback (voice or timer), reading order, navigation.
- `src/lib/ui/` — small presentational pieces (icons).
- `src/routes/` — the app page: toolbar, status, accuracy card.
- `e2e/` — Playwright tests; `fixtures.ts` removes the speech engine so reading is timer-driven.
- `scripts/` — copies PDF.js helper files into `static/pdfjs/` before dev/build.
- `static/` — the bundled sample PDF and its licence.

## Rules

- Geometry, text and reading logic live in plain TypeScript modules with unit tests, not in Svelte
  components. Components only wire state to the DOM.
- pdfjs-dist is used directly (no wrappers) and only in the browser (`ssr = false`).
- The overlay never captures pointer events; the native text layer stays usable for selection.
- One source of truth for positions: character offsets into the page text built from the
  PDF.js text items. Sentences, words and highlights all refer to these offsets.
- No new dependency, layer or abstraction without naming the concrete problem it solves.
- Every change comes with a test of behaviour (execute the operation, assert the result).
  No tests that only inspect source text.
- Small commits; message says what and why.
- Never commit secrets or `.env`.
- Identifiers, comments, UI text, commits and docs in English.
- Readable over clever: domain names, short single-purpose functions, early returns, no `any`,
  comments only for the "why". Run `npm run format` before every commit.

## Commands

- Run: `npm run dev`
- Unit tests: `npm run test:unit -- --run`
- E2E tests: `npm run test:e2e`
- Lint/typecheck: `npm run lint && npm run check`
