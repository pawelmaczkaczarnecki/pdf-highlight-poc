# Decisions

| #   | Decision                                                                                | Alternatives considered                                                         | Why                                                                                                                                       | Limitation / at scale I would                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SvelteKit + TypeScript, static build, pdfjs-dist used directly                          | React + Vite; a PDF viewer wrapper                                              | Matches the requested stack; no server needed; wrappers are excluded by the brief                                                         | —                                                                                                                                                                                                                                                                                                                 |
| 2   | Word/sentence boxes from the native text layer via `Range.getClientRects()`             | Compute glyph positions from the PDF operator list (font widths, text matrices) | Text-layer spans have the exact start and width of each PDF text item, so line edges are exact; the browser does the per-character layout | Inside a span, character widths come from a fallback font scaled to the item width, so word edges inside long items can drift; the error depends on how different the fallback font is. Measured, not assumed: an e2e test compares box edges with the canvas ink. Next step: glyph widths from the operator list |
| 3   | Sentences and words via `Intl.Segmenter`                                                | Regex splitting; an NLP library                                                 | Built into browsers, handles punctuation and Unicode, no dependency                                                                       | Abbreviations like "e.g." can split a sentence                                                                                                                                                                                                                                                                    |
| 4   | Simulated reading on a timer; browser speech (Web Speech API) only as an optional extra | Always use `speechSynthesis`                                                    | The brief is about position accuracy; timing data comes from their TTS. Browser voices do not all report word boundaries                  | —                                                                                                                                                                                                                                                                                                                 |

## Assumptions about the brief

- "Highlight sentences and words" → like the reference: the current sentence as a light band per
  line, the current word as a darker box inside it.
- What to highlight is driven by a simulated reader (play/pause, next/previous, click a word),
  because real TTS timings are not available here.
- One page at a time with manual page navigation. Reading does not continue onto the next page
  automatically (cut after review: extra state, and sentences that cross pages, for no accuracy gain).
- A bundled sample PDF plus a file picker, so reviewers can test their own PDFs.

## Scope cuts

- Zoom — optional in the brief.

## Accuracy check

Box positions are checked against the rendered canvas, not against the DOM range they were
computed from: `e2e/highlight.e2e.ts` walks outwards from the middle of the word box over the
canvas pixels until it meets a word-sized blank gap, and requires the ink edges to be within 2 px
of the box edges. A mutation check (shifting boxes by 4 px) makes the test fail.
