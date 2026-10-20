# Project rules

## Goal

A browser-only proof of concept: render a PDF page with pdfjs-dist and draw precise sentence and
word highlights (text-to-speech style) in a custom overlay layer above the native PDF.js layers.

## Structure

- `src/lib/pdf/` — pdfjs-dist setup (worker) and the page component (canvas + text layer + overlay).
- `src/lib/text/` — page text model and sentence/word segmentation. Pure functions, no DOM.
- `src/lib/highlight/` — turning a character range into overlay rectangles, and the overlay component.
- `src/lib/reader/` — reading position and playback (which sentence/word is current).
- `src/routes/` — the demo page: file picker, page navigation, playback controls.
- `static/` — the bundled sample PDF.

## Rules

- Geometry and text logic live in `src/lib/text` and `src/lib/highlight`, not in Svelte components.
  Components only wire state to the DOM.
- pdfjs-dist is used directly (no wrappers) and only in the browser (`ssr = false`).
- The overlay never captures pointer events; the native text layer stays usable for selection.
- One source of truth for positions: character offsets into the page text built from the
  PDF.js text items. Sentences, words and highlights all refer to these offsets.
- No new dependency, layer or abstraction without naming the concrete problem it solves.
- Every change comes with a test of behaviour (execute the operation, assert the result).
  No tests that only inspect source text.
- Small commits; message says what and why.
- Never commit secrets or `.env`. Never put the hiring company's name in the repository.
- Identifiers, comments, UI text, commits and docs in English.
- Readable over clever: domain names, short single-purpose functions, early returns, no `any`,
  comments only for the "why". Run `npm run format` before every commit.

## Commands

- Run: `npm run dev`
- Unit tests: `npm run test:unit -- --run`
- E2E tests: `npm run test:e2e`
- Lint/typecheck: `npm run lint && npm run check`
