# PDF highlight PoC

Precise sentence and word highlighting over a PDF page, as a text-to-speech reader would show it:
the current sentence as a light band, the current word as a darker box. Built with SvelteKit and
`pdfjs-dist` (no wrappers); everything runs in the browser.

**Demo:** https://pdf-highlight-poc-sigma.vercel.app

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. Press **Play** or click any word; `←/→` move by word, `Shift+←/→` by
sentence, `Space` plays/pauses. Open your own PDF with the file picker.

## Test

```bash
npm run lint && npm run check   # format, lint, types
npm run test:unit -- --run      # text, geometry and accuracy logic
npx playwright install chromium # once, for the e2e tests
npm run test:e2e                # Playwright on the production build
```

## How it works

Three layers per page, bottom to top:

1. **canvas** – the page rendered by PDF.js (at device pixel ratio, so it is sharp on HiDPI);
2. **text layer** – the native PDF.js layer: one transparent `<span>` per text item, stretched to
   the item's exact width from the PDF;
3. **highlight layer** – ours, `pointer-events: none`, `mix-blend-mode: multiply`.

The page text is one string built from the PDF.js text items, and sentences and words are
character ranges in it (`Intl.Segmenter`). A change of font size, a jump up the page (next
column, header) or a large vertical gap ends a block, so a title never runs into the text below
it; a word hyphenated across lines is one word with a box on each line.

To highlight a range, it is mapped to the text-layer spans and the browser measures it with
`Range.getClientRects()`; rectangles are merged into one band per line. That gives the height of
each band (**approach A**). The **left and right edges** then come from the PDF itself
(**approach B, the default**): the page's drawing instructions (`getOperatorList()`) are replayed
with the same arithmetic the PDF.js canvas renderer uses, which gives every glyph's real position
and width. Where that is not possible (unknown or Type3 font, rotated text, glyphs that do not
match the text), the A box is used. The toolbar switches between A and B.

A timer stands in for the TTS engine; in a product, the engine's word events would move the same
reader.

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DECISIONS.md](docs/DECISIONS.md).

## How accurate is it?

The demo measures itself. For every word with a space on both sides, it compares the box edges
with where the letters are actually drawn on the canvas (pixels, not the DOM range the box came
from) and shows a summary above the page. Click a word in "Largest errors" to inspect it.

A and B are measured on exactly the same words (macOS Chromium; median / 95th percentile / max):

| PDF (page 1)                                   | A · text layer     | B · glyph positions    |
| ---------------------------------------------- | ------------------ | ---------------------- |
| Sample journal article (764 words compared)    | 1.0 / 3.5 / 7.5 px | **0.5 / 1.0 / 7.5 px** |
| Chrome "print to PDF", two columns (566 words) | 1.5 / 3.5 / 5.5 px | **0.5 / 1.0 / 2.0 px** |

The 7.5 px on the sample is one word whose box matches when zoomed in (the metric is confused by
an italic letter next to it). The second PDF is a local test document, not in the repository.
The same check runs in CI on Linux, and the tests fail if boxes are shifted or shrunk by 3 px.

## Known limitations

- **Box height** comes from the text layer (the browser's fallback font), so bands can be a little
  taller or shorter than the letters; only left/right edges come from the PDF.
- **Fallback to A** (letter positions from the browser's fallback font, ~1–2 px median, up to
  ~7 px) for Type3 fonts, rotated or vertical text, and pages whose drawn glyphs do not match the
  extracted text.
- **Reading order is the PDF's content order**, not visual order: on multi-column pages reading
  can jump. Drop caps and section headings set in the body font are not recognised as separate
  blocks. Real layout analysis is out of scope.
- **Hidden spaces after ligatures** are handled only where glyph positions confirm them: some
  PDFs draw an invisible space over "ﬁ"/"ﬂ" ("conﬁ rmation"). A space glyph after which the next
  letter starts where the previous one ended is treated as not there (5 words on the sample page
  1). Vertical text and Type3 fonts are not checked.
- Rotated and vertical text are not highlighted precisely (boxes are axis-aligned).
- No zoom; one page at a time; no reading across pages.
- Pages without a text layer (scans) have nothing to highlight.

## With more time

- Box height from the font's ascent/descent instead of the text layer; support Type3 fonts and
  rotated text in the glyph replay; parse the drawing instructions once for both canvas and
  positions.
- Zoom: recompute boxes from the same character ranges after re-rendering.
- Continuous scrolling with lazy page rendering; reading across pages.
- Real TTS: feed engine word timings (or the browser's `speechSynthesis` boundary events) into the
  reader.

## How AI was used

Built with Claude Code as the main pair programmer and ChatGPT (Sol 6.1) and Astra as independent
reviewers. I decided the stack, scope and trade-offs (e.g. measured accuracy over extra features,
no automatic page advance); the agent proposed options and implemented. Work went through small
PRs, each with how it was verified; the scaffold and first vertical slice went straight to `main`.

Verification: unit tests for pure logic, Playwright on the production build, mutation checks for
the key guarantees (shifting or shrinking boxes by 3 px must fail the accuracy test), three rounds
of independent review where every finding was first reproduced by a failing test. Where the AI was
wrong and how it was caught is logged in [docs/SESSION.md](docs/SESSION.md).

## What I learned

- A number can lie convincingly. The first accuracy metric reported 12 px errors while the page
  looked right; pixel profiles of the worst words showed the metric was wrong (word spaces on tight
  justified lines are only ~2 px), not the boxes.
- A test that cannot fail proves nothing: the first canvas test searched only 2 px around the box,
  so it could never report a larger error. A deliberate 4 px shift exposed it.
- "confirmation" highlighted as "confi" + "rmation" was not our segmentation: the PDF draws a
  hidden space glyph after the "ﬁ" ligature. My first fix (join words after a ligature) broke
  "staff members" — text alone cannot tell a hidden space from a real one; glyph positions can.

## Sample PDF

`static/sample.pdf`: J. P. A. Ioannidis, "Why Most Published Research Findings Are False",
PLoS Medicine 2(8): e124 (2005), CC BY. See `static/SAMPLE_PDF_LICENSE.md`.
