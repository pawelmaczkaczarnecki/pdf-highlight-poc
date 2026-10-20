# Decisions

| #   | Decision                                                                                | Alternatives considered                                                         | Why                                                                                                                                       | Limitation / at scale I would                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SvelteKit + TypeScript, static build, pdfjs-dist used directly                          | React + Vite; a PDF viewer wrapper                                              | Matches the requested stack; no server needed; wrappers are excluded by the brief                                                         | —                                                                                                                                                                       |
| 2   | Word/sentence boxes from the native text layer via `Range.getClientRects()`             | Compute glyph positions from the PDF operator list (font widths, text matrices) | Text-layer spans have the exact start and width of each PDF text item, so line edges are exact; the browser does the per-character layout | Inside a span, character widths come from a fallback font scaled to the item width, so word edges can be off by ~1–2 px. Next step: glyph widths from the operator list |
| 3   | Sentences and words via `Intl.Segmenter`                                                | Regex splitting; an NLP library                                                 | Built into browsers, handles punctuation and Unicode, no dependency                                                                       | Abbreviations like "e.g." can split a sentence                                                                                                                          |
| 4   | Simulated reading on a timer; browser speech (Web Speech API) only as an optional extra | Always use `speechSynthesis`                                                    | The brief is about position accuracy; timing data comes from their TTS. Browser voices do not all report word boundaries                  | —                                                                                                                                                                       |

## Assumptions about the brief

- "Highlight sentences and words" → like the reference: the current sentence as a light band per
  line, the current word as a darker box inside it.
- What to highlight is driven by a simulated reader (play/pause, next/previous, click a word),
  because real TTS timings are not available here.
- One page at a time with page navigation; reading continues onto the next page.
- A bundled sample PDF plus a file picker, so reviewers can test their own PDFs.

## Scope cuts

- Zoom — optional in the brief.
