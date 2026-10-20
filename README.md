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
it; a word hyphenated across lines is one word with a box on each line. To highlight a range, it is mapped to the text-layer
spans, the browser measures it with `Range.getClientRects()`, and the rectangles are merged into
one band per line. A timer stands in for the TTS engine; in a product, the engine's word events
would move the same reader.

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DECISIONS.md](docs/DECISIONS.md).

## How accurate is it?

The demo measures itself. For every word with a space on both sides, it compares the box edges
with where the letters are actually drawn on the canvas (pixels, not the DOM range the box came
from) and shows a summary above the page. Click a word in "Largest errors" to inspect it.

Sample PDF, page 1 (Chromium, macOS): **median edge error 1.0 px, 81% of words within 2 px,
95% within 3.5 px** (764 of 939 words measurable; percentages are of those). The same check runs
in CI on Linux, and the tests fail if boxes are shifted or shrunk by 3 px.

## Known limitations

- **Inside a text item, letter positions come from the browser's fallback font**, scaled to the
  item's real width. Line edges are exact; word edges drift most where the fallback font differs
  most from the real one (small sans-serif headers on the sample: ~5–7 px).
- **Reading order is the PDF's content order**, not visual order: on multi-column pages reading
  can jump. Drop caps and section headings set in the body font are not recognised as separate
  blocks. Real layout analysis is out of scope.
- **Hidden spaces after ligatures:** some PDFs draw an invisible space after "ﬁ"/"ﬂ", so
  "confirmation" reads as "conﬁ rmation". A text-only fix also joined real pairs ("staﬀ
  members"), so it was removed; glyph positions (below) can tell the two apart.
- Rotated and vertical text are not highlighted precisely (boxes are axis-aligned).
- No zoom (optional in the brief); one page at a time; no reading across pages.
- Pages without a text layer (scans) have nothing to highlight.

## With more time

- Exact glyph positions from the PDF.js operator list (font widths and text matrices) instead of
  the fallback font – the main remaining source of error, and the way to detect hidden spaces.
  Feasibility checked: on the sample page the drawn glyphs match the extracted text 1:1
  (5001 characters).
- Zoom: recompute boxes from the same character ranges after re-rendering.
- Continuous scrolling with lazy page rendering; reading across pages.
- Real TTS: feed engine word timings (or the browser's `speechSynthesis` boundary events) into the
  reader.

## How AI was used

Built with Claude Code as the main pair programmer and ChatGPT (Sol 6.1) as an independent
reviewer. I decided the stack, scope and trade-offs (e.g. measured accuracy over extra features,
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
  "staff members" — text alone cannot tell a hidden space from a real one.

## Sample PDF

`static/sample.pdf`: J. P. A. Ioannidis, "Why Most Published Research Findings Are False",
PLoS Medicine 2(8): e124 (2005), CC BY. See `static/SAMPLE_PDF_LICENSE.md`.
