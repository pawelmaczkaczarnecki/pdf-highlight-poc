# Decisions

Each decision: what was chosen, why, what else was considered, and what it costs.

## 1. Stack: SvelteKit + TypeScript, static build, `pdfjs-dist` directly

- **Why:** everything runs in the browser, so a static build (adapter-static) is enough and deploys
  anywhere. Using `pdfjs-dist` directly gives access to the native text layer and the drawing
  instructions, which a viewer wrapper would hide.
- **Alternatives:** React + Vite; a PDF viewer component.
- **Cost:** PDF.js only runs in the browser, so server-side rendering is off.

## 2. Three layers: canvas, native text layer, our highlight layer

- **Why:** the canvas is what the user sees; the native text layer keeps text selectable and
  clickable; our own layer above both (`pointer-events: none`, `mix-blend-mode: multiply`) draws
  highlights without touching PDF.js internals and keeps the text readable.
- **Alternatives:** PDF.js's own find-highlighter (styles text-layer spans; not a separate layer,
  only whole spans).

## 3. One text model: page text + character offsets

- **Why:** sentences, words, clicks, hidden spaces and boxes all refer to offsets in one string
  built from the PDF.js text items, in the order PDF.js returns them. Everything can be mapped
  back to the text-layer span and to the drawn glyph.
- **Cost:** reading order is a separate step (decision 7) instead of being baked into the text.

## 4. Sentences and words with `Intl.Segmenter`

- **Why:** built into browsers, handles punctuation and Unicode, no dependency. Line breaks are
  turned into spaces before segmenting (offsets unchanged); block boundaries use a paragraph
  separator, where the segmenter always ends a sentence.
- **Alternatives:** regular expressions; an NLP library.
- **Cost:** some abbreviations and initials ("John P. A.") split a sentence.

## 5. Box edges from glyph positions; height from the text layer

- **What:** the browser measures each line of a range in the native text layer
  (`Range.getClientRects()`), which gives the band's height. Its left and right edges are then
  replaced by the real glyph positions: the page's drawing instructions (`getOperatorList()`) are
  replayed with the same arithmetic the PDF.js canvas renderer uses (text matrix, transforms, font
  size and widths, character/word spacing, horizontal scale, TJ adjustments).
- **Why:** inside a text-layer span the browser lays letters out in a fallback font, stretched to
  the span's width, so word edges drift by 1–5 px. Glyph positions remove that drift
  (measured: median 1.0 → 0.5 px, 95th percentile 3.5 → 1.0 px; see "Accuracy check").
- **Fallback:** characters without a trusted glyph position — unknown or Type3 font, rotated or
  skewed text, drawn glyphs that do not match the text character by character — keep the
  text-layer edges.
- **Alternatives:** text-layer boxes only (the first version; now the report's baseline);
  snapping boxes to the ink on the canvas (looks good, but could no longer be measured honestly
  with the same pixels).
- **Cost:** the drawing instructions are parsed a second time (PDF.js renders from its own copy).

## 6. Words the PDF text splits wrongly

- **Hidden spaces after ligatures:** some PDFs draw "ﬁ", move back and draw a space over it, so
  the text reads "conﬁ rmation". A space glyph after which the next letter starts where the
  previous one ended (gap < 0.08 em, same line) is not a word boundary. Text is extracted without
  Unicode normalization so ligatures stay one character, aligned 1:1 with the drawn glyphs.
  A text-only rule ("ligature + space + lowercase") was rejected: it also joins "staﬀ members".
- **Connected tokens:** parts joined without spaces by `-` `.` `@` `/` `_` `:` are one word —
  compounds ("Frontend-focused"), ranges with an en dash ("[9–11]"), domains and versions
  ("piano.io", "2.5"), e-mails and URLs.
  The voices we tried (macOS, Chrome) read these as one token, and browsers segment them
  differently (Chrome splits "piano.io", Node does not), so they are joined explicitly. A dash
  with spaces around it and an em dash still separate words. A voice word event that starts at
  punctuation (the "[" of "[9–11]") is mapped to the word after it, not the one before.
- **Line-end hyphenation:** a word broken at a line end ("dispro-⏎portionately", "post-⏎study")
  is one word with a box on each line, unless the second half is capitalised ("Kaplan-⏎Meier").
  Whether the hyphen is spoken needs a dictionary, so it is kept.
- **Drop caps:** a single large capital followed by lowercase text joins it ("P" + "ublished").

## 7. Reading order from the page layout

- **What:** a block ends where the font size changes, the text jumps up the page, or there is a
  gap of more than ~1.8 lines. Blocks in the top/bottom 5% of the page are running headers and
  footers and are skipped. The rest is read column by column (left edges more than 15% of the page
  width apart), each column from the top. A sentence that has not ended continues at the top of
  the next column. Reading starts at the first block and the view follows the current word.
- **Why:** PDF content order is the order the typesetter drew things: on the sample's page 1 it is
  footer, header, body, and only then the title.
- **Alternatives:** PDF content order (reading jumped between header and footer); starting at the
  highest word (still jumped right after).
- **Cropped pages:** positions are absolute, so the header/footer bands are measured from the
  visible area's own bottom edge (a PDF can crop its page to an area that does not start at 0).
- **Cost:** a heuristic, not layout analysis: tables, captions and side boxes are read where they
  sit in their column; headings set in the body font are not separate blocks.

## 8. Reading aloud with the browser's voices (optional)

- **What:** reading aloud is opt-in; "Voice off" (a timer moves the highlight) is the default,
  because it behaves the same everywhere. With a voice chosen, `speechSynthesis` speaks the rest of
  the current sentence, written as it reads on the page, and the voice's word events move the
  highlight. Pause, arrows, clicks, speed and voice changes cancel the utterance and restart from
  the current word; events from a cancelled utterance are ignored.
- **Voices offered:** on-device English voices without the novelty ones, Karen first where
  installed. Observed on macOS with Chrome: these voices (e.g. Karen) report a word event for
  every word. Google's network voices in Chrome reported none; they are offered only when the
  system has no voice of its own.
- **When word events are missing or wrong:** if no usable word event arrives shortly after the
  voice starts, words inside the sentence follow an estimated pace (re-measured after each
  sentence) while every sentence still starts with the voice. An event that reaches into the next word is
  treated as unusable (the macOS engine reports every word as the whole sentence
  when the text contains the minus sign U+2212, so "−" is spoken as "-", which keeps offsets).
- **When speech fails:** a speech error ends reading aloud with a message and reading continues
  silently from the current word; if speech does not start within 3 s, the same happens.
- **Alternatives:** a cloud TTS with word timestamps (needs an API key and a server); Google voices
  only (tried; the highlight did not keep in step).
- **Cost:** the voices are the viewer's system voices: their availability, quality and word
  events are outside the app's control. Most e2e tests remove the speech API so the timer drives
  reading; a few use a scripted fake engine to test the app's reactions to engine events, which
  is not evidence that a real voice works.

## 9. PDF.js helper files deployed with the app

- **What:** image decoders (JPEG 2000, JBIG2), standard font data and CJK character maps are
  copied from `pdfjs-dist` into `static/pdfjs/` on every dev/build run and passed to
  `getDocument`.
- **Why:** without them some valid PDFs render blank images or substitute fonts. Copying from
  `node_modules` keeps them in step with the installed version, without a new dependency.
- **Cost:** about 4 MB of static files in the deployment.

## 10. Accuracy measured from the rendered page

- **Why:** a highlight is accurate if it covers the letters the user sees, so boxes are compared
  with the ink on the canvas — not with the DOM range they were computed from. The demo shows the
  result and the tests assert it. Details below.

## Assumptions

- "Highlight sentences and words": the current sentence as a light band per line, the current
  word as a darker box inside it.
- One page at a time with manual page navigation; reading does not continue onto the next page
  (extra state and sentences crossing pages, for no accuracy gain).
- A bundled sample PDF plus **Open PDF**, so any PDF can be tried.

## Scope cuts

- Zoom: not needed to judge position accuracy; boxes would be recomputed from the same offsets.

## How decisions changed along the way

Kept here so the history reads as iteration, not as noise:

| First version                                       | Found                                | Now                                                   |
| --------------------------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| Boxes from the text layer only                      | 1–5 px drift from the fallback font  | Glyph-position edges (5)                              |
| An A/B toggle between the two                       | Glyph positions better on every page | Glyph positions only; text layer as baseline/fallback |
| Join words after a ligature by a text rule          | Also joined "staﬀ members"           | Detect hidden spaces from glyph geometry (6)          |
| PDF content order, then "start at the highest word" | Reading jumped header ↔ footer       | Layout reading order (7)                              |
| Google voices only                                  | Highlight drifted (no word events)   | On-device voices, Google as fallback (8)              |
| Widest gap = word space (metric)                    | Italic neighbour gave a false 7.5 px | Closest word-space-sized gap                          |

## Accuracy check

Code: `src/lib/highlight/accuracy.ts`; shown above the page in the demo; asserted in e2e.

- For each word with a space on both sides, read the canvas pixels around its box. Ink = pixels
  clearly different from the strip's most common colour (works for white text on coloured panels).
- Near each box edge, the word space is the closest blank run wider than half of the widest one
  (wider than gaps between letters); the ink starts/ends there. Closest rather than widest,
  because an italic letter leans into the space after it. Error = distance between box edge and
  ink edge.
- Both spaces must be confirmed: every gap inside the word must be narrower than them; otherwise
  the word is "not measured" (a box shrunk onto letter gaps would otherwise score ~0 px).
- Excluded: words touching punctuation (its ink would count as the word's) and words split over
  two lines.
- Mutation checks: shifting all boxes by 3 px, or shrinking them by 3 px on both sides, fails the
  tests. Only horizontal edges are measured.

Results, macOS Chromium, device pixel ratio 2, both box sources measured on exactly the same
words (percentages are of those words):

| PDF (page 1)                                                                              | words compared | Text layer only: median / 95% / max | Glyph positions: median / 95% / max |
| ----------------------------------------------------------------------------------------- | -------------- | ----------------------------------- | ----------------------------------- |
| Sample (journal article, two columns)                                                     | 752 of 915     | 1.0 / 3.5 / 5.0 px                  | **0.5 / 1.0 / 2.5 px**              |
| Generated with Chrome "print to PDF" (Georgia + Helvetica, two columns, auto hyphenation) | 566 of 678     | 1.5 / 3.5 / 5.5 px                  | **0.5 / 1.0 / 2.0 px**              |

The second PDF is a local test document (not in the repository), so the comparison does not
depend on one typesetter. The remaining 2–2.5 px are large title letters: a box ends where the
glyph's advance ends, while the ink of a 25 pt letter starts 1–2 px inside it.

CI runs the check on Linux (device pixel ratio 1) with thresholds for the text-layer baseline
(median ≤ 1.5 px, ≥ 70% within 2 px) and requires glyph positions to be at least as good on the
same words. The measured count alone is a weak signal (a deliberately stale canvas still left most
words "measurable", but the median jumped to 9 px), so tests assert the median.
