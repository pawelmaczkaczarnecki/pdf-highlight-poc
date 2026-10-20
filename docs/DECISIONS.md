# Decisions

| #   | Decision                                                                                                                                                                                                                                                                                           | Alternatives considered                                                                                              | Why                                                                                                                                                                                                                                      | Limitation / at scale I would                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SvelteKit + TypeScript, static build, pdfjs-dist used directly                                                                                                                                                                                                                                     | React + Vite; a PDF viewer wrapper                                                                                   | Matches the requested stack; no server needed; a wrapper would hide the PDF.js layers this needs direct access to                                                                                                                        | —                                                                                                                                                                                                                          |
| 2   | **B (default):** box left/right edges from glyph positions replayed from the PDF.js operator list; vertical extent from the native text layer (`Range.getClientRects()`). **A** (text layer only) stays as a toggle and as the fallback                                                            | A only: text-layer spans + `Range.getClientRects()`                                                                  | Measured on the same words of two differently produced PDFs, B halves the median error and removes the 3–7 px tail that comes from the browser's fallback font (see "Accuracy check")                                                    | Characters without a trusted glyph position (unknown or Type3 font, rotated text, glyphs not matching the text) fall back to A. The page's drawing instructions are parsed a second time                                   |
| 3   | Sentences and words via `Intl.Segmenter`                                                                                                                                                                                                                                                           | Regex splitting; an NLP library                                                                                      | Built into browsers, handles punctuation and Unicode, no dependency                                                                                                                                                                      | Abbreviations like "e.g." can split a sentence                                                                                                                                                                             |
| 4   | Simulated reading on a timer; browser speech (Web Speech API) only as an optional extra                                                                                                                                                                                                            | Always use `speechSynthesis`                                                                                         | The PoC is about position accuracy; timing data comes from their TTS. Browser voices do not all report word boundaries                                                                                                                   | —                                                                                                                                                                                                                          |
| 5   | Words split by a **hidden space** ("conﬁ rmation": the PDF draws a space over the ligature) are joined, detected from glyph positions: a space glyph is drawn, yet the next letter starts where the previous one ended (gap < 0.08 em, same line). Text is extracted without Unicode normalization | A text-only rule "ligature + space + lowercase" (tried in #6, removed: it also joined "staﬀ members", "Wiﬁ network") | Only geometry can tell a hidden space from a real one. Positions are replayed from the PDF.js operator list (same arithmetic as its canvas renderer, horizontal text only); if drawn glyphs do not match the text 1:1, nothing is joined | The page's drawing instructions are parsed a second time (PDF.js renders from its own copy). Vertical/rotated text and Type3 fonts are not handled. Glyph positions could also replace the fallback-font boxes (next step) |
| 6   | A word broken at a line end ("dispro-⏎portionately", "post-⏎study") is one word with a box per line, unless the second half is capitalised                                                                                                                                                         | Keep two words; decide syllable vs. compound hyphen with a dictionary                                                | Highlighting jumps between word halves otherwise; for highlighting both kinds look natural as one unit                                                                                                                                   | Whether to speak the hyphen is left to the TTS side (needs a dictionary)                                                                                                                                                   |
| 7   | Reading starts at the highest word on the page, and the view follows the current word (scrolls just enough, below the sticky toolbar)                                                                                                                                                              | Start at the first word in PDF content order; scroll only on request                                                 | Content order often starts in a footer, so the demo opened with the highlight off screen; TTS readers keep the spoken word visible                                                                                                       | Reading order itself still follows the PDF content order                                                                                                                                                                   |
| 8   | PDF.js image decoders, standard font data and CJK character maps are copied from `pdfjs-dist` into `static/pdfjs/` on every dev/build and passed to `getDocument`                                                                                                                                  | Commit the files; a Vite copy plugin                                                                                 | Without them some valid PDFs render blank images or substitute fonts. Copying from `node_modules` keeps them in sync with the installed version without a new dependency                                                                 | ~4 MB of static files in the deployment                                                                                                                                                                                    |

## Assumptions

- "Highlight sentences and words" → like the reference: the current sentence as a light band per
  line, the current word as a darker box inside it.
- What to highlight is driven by a simulated reader (play/pause, next/previous, click a word),
  because real TTS timings are not available here.
- One page at a time with manual page navigation. Reading does not continue onto the next page
  automatically (cut after review: extra state, and sentences that cross pages, for no accuracy gain).
- A bundled sample PDF plus a file picker, so reviewers can test their own PDFs.

## Scope cuts

- Zoom — not needed to judge position accuracy.

## Accuracy check

Box positions are checked against the rendered canvas, not against the DOM range they were
computed from (`src/lib/highlight/accuracy.ts`, shown in the demo and asserted in e2e):

- For each word with a space on both sides, read the canvas pixels around its box. Ink = pixels
  clearly different from the strip's most common colour (works for white text on coloured panels).
- Near each box edge, the widest blank run is the word space; the ink starts/ends there.
  Error = distance between box edge and ink edge.
- The two spaces must be confirmed: every gap inside the word must be narrower than them.
  Otherwise the word is "not measured" (a box shrunk onto letter gaps would score ~0 px).
- Excluded: words touching punctuation (the punctuation's ink would count as the word's) and
  words split over two lines.
- Mutation checks: shifting all boxes by 3 px, or shrinking them by 3 px on both sides, raises the
  median to 4 px and fails the e2e test. It is an estimate of horizontal edges only (vertical
  extent is not measured).

Results, macOS Chromium, DPR 2, A and B measured on exactly the same words (percentages are of
those words):

| PDF (page 1)                                                                              | words compared | A median / 95% / max | B median / 95% / max   |
| ----------------------------------------------------------------------------------------- | -------------- | -------------------- | ---------------------- |
| Sample (journal article, two columns)                                                     | 764 of 934     | 1.0 / 3.5 / 7.5 px   | **0.5 / 1.0 / 7.5 px** |
| Generated with Chrome "print to PDF" (Georgia + Helvetica, two columns, auto hyphenation) | 566 of 679     | 1.5 / 3.5 / 5.5 px   | **0.5 / 1.0 / 2.0 px** |

The second PDF is a local test document (not in the repository) so that the comparison does not
depend on one typesetter. The remaining 7.5 px on the sample is "relationships" in both modes; zoomed
in, the box matches the letters — the metric is confused by the italic "c" right before it.

The CI check runs on Linux (DPR 1) with thresholds for A (median ≤ 1.5 px, ≥ 70% within 2 px)
and requires B to be at least as good as A on the same words.

The measured count alone is a weak signal: with a deliberately stale canvas (page 1 under page
5's text) most words were still "measurable", but the median jumped to 9 px. Tests assert the
median.

The first metric version (walk out from the middle until a 3 px gap) reported 12 px errors: on
tightly justified lines word spaces are only ~2 px, and punctuation joined the word. Found by
looking at pixel profiles of the worst words before trusting the number.
