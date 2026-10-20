# Decisions

| #   | Decision                                                                                                                                      | Alternatives considered                                                         | Why                                                                                                                                                                       | Limitation / at scale I would                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SvelteKit + TypeScript, static build, pdfjs-dist used directly                                                                                | React + Vite; a PDF viewer wrapper                                              | Matches the requested stack; no server needed; wrappers are excluded by the brief                                                                                         | —                                                                                                                                                                                                                                                                                                                 |
| 2   | Word/sentence boxes from the native text layer via `Range.getClientRects()`                                                                   | Compute glyph positions from the PDF operator list (font widths, text matrices) | Text-layer spans have the exact start and width of each PDF text item, so line edges are exact; the browser does the per-character layout                                 | Inside a span, character widths come from a fallback font scaled to the item width, so word edges inside long items can drift; the error depends on how different the fallback font is. Measured, not assumed: an e2e test compares box edges with the canvas ink. Next step: glyph widths from the operator list |
| 3   | Sentences and words via `Intl.Segmenter`                                                                                                      | Regex splitting; an NLP library                                                 | Built into browsers, handles punctuation and Unicode, no dependency                                                                                                       | Abbreviations like "e.g." can split a sentence                                                                                                                                                                                                                                                                    |
| 4   | Simulated reading on a timer; browser speech (Web Speech API) only as an optional extra                                                       | Always use `speechSynthesis`                                                    | The brief is about position accuracy; timing data comes from their TTS. Browser voices do not all report word boundaries                                                  | —                                                                                                                                                                                                                                                                                                                 |
| 5   | Text extracted without Unicode normalization (ligatures stay one character). Words split after a ligature ("conﬁ rmation") are **not** joined | A text rule: join "<…ligature> <lowercase…>" (tried in PR #6, removed)          | The text rule also joined real pairs: "staﬀ members", "oﬀ the", "Wiﬁ network". A hidden space and a real one look identical in text; only glyph positions tell them apart | Detect hidden spaces from glyph advances (part of the glyph-positions next step)                                                                                                                                                                                                                                  |
| 6   | A word broken at a line end ("dispro-⏎portionately", "post-⏎study") is one word with a box per line, unless the second half is capitalised    | Keep two words; decide syllable vs. compound hyphen with a dictionary           | Highlighting jumps between word halves otherwise; for highlighting both kinds look natural as one unit                                                                    | Whether to speak the hyphen is left to the TTS side (needs a dictionary)                                                                                                                                                                                                                                          |

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

Sample PDF, page 1 (macOS Chromium, DPR 2): 764 of 939 words measurable; of those, median
1.0 px, 81% within 2 px, 95% within 3.5 px (percentages are of the measured words). The same
check runs in CI on Linux (DPR 1) with thresholds median ≤ 1.5 px and ≥ 70% within 2 px.
Largest errors: "reﬂ" (the PDF draws a hidden space glyph after the "ﬂ" ligature, so the word is
cut short), a small sans-serif header where the fallback font differs most from the real one,
and a few 6–7.5 px cases ("few", "will") whose boxes look right when zoomed in — not yet
explained whether the box or the metric is off there.

The measured count alone is a weak signal: with a deliberately stale canvas (page 1 under page
5's text) most words were still "measurable", but the median jumped to 9 px. Tests assert the
median.

The first metric version (walk out from the middle until a 3 px gap) reported 12 px errors: on
tightly justified lines word spaces are only ~2 px, and punctuation joined the word. Found by
looking at pixel profiles of the worst words before trusting the number.
