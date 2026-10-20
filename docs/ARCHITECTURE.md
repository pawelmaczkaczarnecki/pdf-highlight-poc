# Architecture

## Overview

A static SvelteKit app; everything runs in the browser. For the current page, PDF.js draws the
canvas and the native text layer, and our highlight layer sits on top. The page's text becomes one
string; sentences, words and highlights are character ranges in it. A reader moves through the
words (by voice or timer) and the current sentence and word are drawn as boxes whose height comes
from the text layer and whose left/right edges come from the real glyph positions in the PDF.

## Layers (bottom → top)

1. `canvas` — the page rendered by PDF.js at the device pixel ratio (sharp on HiDPI).
2. `.textLayer` — the native PDF.js text layer: one transparent `<span>` per text item, stretched
   to the item's width; used for selection, clicks and the height of highlight bands.
3. `.highlightLayer` — ours: `pointer-events: none`, `mix-blend-mode: multiply`.

## Modules

| Module                          | Responsibility                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `routes/+page.svelte`           | The app: toolbar, status, accuracy card; wires the reader to the page.                              |
| `lib/pdf/pdfjs.ts`              | Worker setup; load a document (with decoder/font/CMap URLs); free it on failure.                    |
| `lib/pdf/PdfPage.svelte`        | Render one page (canvas + text layer + highlight layer), cancel stale renders, measure ranges.      |
| `lib/pdf/glyphLayout.ts`        | Replay the drawing instructions: glyph positions, glyph ↔ text alignment, hidden spaces.            |
| `lib/text/pageText.ts`          | Text items → page string, item offsets, blocks (headers/footers, columns, reading rank), drop caps. |
| `lib/text/segment.ts`           | Sentences and words (`Intl.Segmenter`); line-end hyphenation and hidden spaces joined.              |
| `lib/highlight/rects.ts`        | Character range → text-layer rectangles → one band per line; click → character offset.              |
| `lib/highlight/glyphEdges.ts`   | Replace each band's left/right edges with glyph edges, or keep them.                                |
| `lib/highlight/accuracy.ts`     | Compare box edges with the ink on the canvas; summary for both box sources.                         |
| `lib/highlight/*.svelte`        | Draw the boxes; show the accuracy card.                                                             |
| `lib/reader/reader.svelte.ts`   | Reading position, play/pause, next/previous, voice or timer.                                        |
| `lib/reader/readingOrder.ts`    | Sentences in layout order, headers/footers dropped.                                                 |
| `lib/reader/navigation.ts`      | Sentence jumps; the word at a clicked offset.                                                       |
| `lib/reader/speech.ts`          | Text to speak, mapping voice word events to words, voice choice, estimated timing.                  |
| `lib/ui/Icon.svelte`            | Inline SVG icons.                                                                                   |
| `scripts/copy-pdfjs-assets.mjs` | Copy PDF.js decoders, standard fonts and CMaps into `static/pdfjs/`.                                |

Logic lives in plain TypeScript modules with unit tests; Svelte components wire state to the DOM.

## Main flow

1. Open a PDF (the sample on start, or **Open PDF**) → `loadPdf`.
2. `PdfPage` renders the page: canvas and text layer together; then reads the drawing instructions
   (glyph positions, hidden spaces) and builds the page text with its blocks.
3. The reader splits sentences and words, orders them by layout and starts at the first word.
4. Play: the voice speaks the rest of the sentence and its word events set the current word (or a
   timer does). A click on text maps to a character offset and a word.
5. The current sentence and word ranges become line bands (text layer) with glyph edges and are
   drawn in the highlight layer; the view scrolls to keep the word visible.
6. After rendering, the accuracy card compares both box sources with the canvas ink.

## Data

Source of truth: the page text built from PDF.js text items, and character offsets into it.
Nothing is stored; everything is derived per page in the browser.

## Errors, cancellation, units

- Load and render failures (invalid file, password-protected PDF) are shown as a message; a page
  without a text layer (a scan) says so. A failed load frees its PDF.js worker.
- Each document open is numbered and each page render registers cleanups, so a slower, older
  load or render can never overwrite a newer one.
- Only the canvas bitmap is scaled by the device pixel ratio; text layer and boxes are in CSS
  pixels; `--total-scale-factor` is `viewport.scale * viewport.userUnit`.

## Tests

- Unit (Vitest): text model, segmentation, reading order, navigation, speech text and voices,
  glyph replay (also against the real sample PDF), box merging and glyph edges, the accuracy metric.
- E2E (Playwright, production build): highlighting, clicks, keyboard, page changes, reading order,
  accuracy thresholds, edge cases (cropped pages, scans); run without a speech engine so the
  timer drives reading. A few tests use a scripted fake speech engine to check reactions to word
  events, errors and cancellation (not evidence that a real voice works).
- CI (GitHub Actions): lint, types, unit and e2e on every pull request.

## Deliberately not done

- Zoom; boxes would be recomputed from the same offsets after re-rendering.
- Box height from font metrics; Type3 fonts and rotated or vertical text in the glyph replay.
- Continuous multi-page scrolling and reading across pages; real layout analysis.
- A backend or a TTS service with word timestamps.
