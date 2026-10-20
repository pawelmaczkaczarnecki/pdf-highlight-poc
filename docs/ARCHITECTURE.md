# Architecture

## Overview

A static SvelteKit app (no backend). pdfjs-dist renders one PDF page into a `<canvas>` and builds
its native text layer: one absolutely positioned, transparent `<span>` per PDF.js text item,
stretched to the item's exact width from the PDF. A custom highlight layer sits above both.
To highlight a sentence or a word we take its character range in the page text, map it to the
text-layer spans, ask the browser for the range's rectangles (`Range.getClientRects()`), convert
them to page coordinates, merge them per line and draw them in the overlay.

## Layers (bottom → top)

1. `canvas` — the rendered page (rendered at devicePixelRatio for sharpness).
2. `.textLayer` — native PDF.js text layer (selection, click-to-start-reading).
3. `.highlightLayer` — ours. `pointer-events: none`, `mix-blend-mode: multiply` so text stays readable.

## Modules

| Module                                | Responsibility                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `lib/pdf/pdfjs.ts`                    | Configure the worker, load a document from a URL or a file.                      |
| `lib/pdf/PdfPage.svelte`              | Render one page: canvas, text layer, highlight layer.                            |
| `lib/text/pageText.ts`                | Join text items into one page string; remember where each item starts.           |
| `lib/text/segment.ts`                 | Split page text into sentences and words (`Intl.Segmenter`), as offset ranges.   |
| `lib/highlight/rects.ts`              | Character range → DOM Range → rectangles relative to the page → merged per line. |
| `lib/highlight/HighlightLayer.svelte` | Draw sentence and word rectangles.                                               |
| `lib/reader/`                         | Current sentence/word, next/previous, play/pause on a timer.                     |

## Main flow

User picks a PDF (or the sample loads) → `pdfjs.getDocument` → page renders (canvas + text layer)
→ page text model + sentences/words are built from the text items → user presses Play or clicks a
word → reader sets the current word → its sentence and word ranges become rectangles → overlay draws.

## Data

Source of truth: the page text string built from PDF.js text items, and character offsets into it.
Nothing is stored; everything is derived per page in the browser.

## Error handling

Loading or rendering failures (invalid file, password-protected PDF, page without text) are shown as
a message in the UI instead of a blank page.

## Deliberately not done

- Zoom (optional in the brief); highlights are computed at the current scale.
- Glyph-exact positions from the PDF operator list (see DECISIONS.md #2) — more accurate inside a
  line, but too much to build reliably in the time box.
- Continuous multi-page scrolling, a backend, real TTS timing data.
