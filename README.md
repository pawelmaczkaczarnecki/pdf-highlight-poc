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
sentence, `Space` plays/pauses. Reading is silent by default; pick a voice under **Read aloud** to
hear it. Open your own PDF with **Open PDF**.

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
it; connected tokens ("Frontend-focused", "piano.io", e-mail addresses) are one word, also when
hyphenated across two lines (then with a box on each line).

Reading follows the page layout, not the order in which the PDF happens to draw text: running
headers and footers (blocks in the top/bottom 5% of the page) are skipped, blocks are read column
by column from the top, a sentence that continues at the top of the next column stays one
sentence, and a drop cap joins its word ("P" + "ublished").

To highlight a range, it is mapped to the text-layer spans and the browser measures it with
`Range.getClientRects()`; rectangles are merged into one band per line. That gives the height of
each band. The **left and right edges** come from the PDF itself: the page's drawing instructions
(`getOperatorList()`) are replayed with the same arithmetic the PDF.js canvas renderer uses, which
gives every glyph's real position and width. Where that is not possible (unknown or Type3 font,
rotated text, glyphs that do not match the text), the text-layer edges are used.

**Reading aloud** is optional and off by default ("Voice off": the highlight moves on a timer).
With a voice chosen under **Read aloud**, the browser's speech engine (`speechSynthesis`) speaks
the rest of the current sentence as written on the page (no hidden spaces, ligatures as letters),
and the voice's word events move the highlight. On-device voices are offered (novelty voices
removed), Karen first where installed; on macOS with Chrome they reported every word. When a
voice reports no usable word events (e.g. Google's network voices, offered only when the system
has none), each sentence still starts with the voice and words follow an estimated pace. If
speech fails, reading continues silently with a message. In a product, the TTS engine's own word
timings would drive the same reader.

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DECISIONS.md](docs/DECISIONS.md).

## How accurate is it?

The demo measures itself. For every word with a space on both sides, it compares the box edges
with where the letters are actually drawn on the canvas (pixels, not the DOM range the box came
from) and shows a summary above the page. Click a word in "Largest errors" to inspect it.

Glyph-position edges against the text-layer-only baseline, on exactly the same words (macOS
Chromium; median / 95th percentile / max):

| PDF (page 1)                                   | Text layer only    | Glyph positions (used) |
| ---------------------------------------------- | ------------------ | ---------------------- |
| Sample journal article (752 words compared)    | 1.0 / 3.5 / 5.0 px | **0.5 / 1.0 / 2.5 px** |
| Chrome "print to PDF", two columns (566 words) | 1.5 / 3.5 / 5.5 px | **0.5 / 1.0 / 2.0 px** |

The remaining ~2 px are large title letters: a box ends where the glyph's advance ends, while the
ink of a 25 pt letter starts 1–2 px inside it, so the metric has a floor that grows with the font
size. The second PDF is a local test document, not in the repository. The same check runs in CI
on Linux, and the tests fail if boxes are shifted or shrunk by 3 px.

## Known limitations

- **Box height** comes from the text layer (the browser's fallback font), so bands can be a little
  taller or shorter than the letters; only left/right edges come from the PDF.
- **Fallback to the text layer** (letter positions from the browser's fallback font, ~1 px median,
  up to ~5 px) for Type3 fonts, rotated or vertical text, and pages whose drawn glyphs do not match the
  extracted text.
- **Reading order is a layout heuristic** (columns by left edge, then top to bottom), not a full
  layout analysis: tables, figure captions and side boxes are read where they sit in their
  column; section headings set in the body font are not separate blocks.
- **Hidden spaces after ligatures** are handled only where glyph positions confirm them: some
  PDFs draw an invisible space over "ﬁ"/"ﬂ" ("conﬁ rmation"). A space glyph after which the next
  letter starts where the previous one ended is treated as not there (5 words on the sample page
  1). Vertical text and Type3 fonts are not checked.
- Rotated and vertical text are not highlighted precisely (boxes are axis-aligned).
- No zoom; one page at a time; no reading across pages.
- **Voices come from the viewer's operating system and browser**, not from this app: which voices
  are available, how natural they sound and how they pronounce technical terms is outside its
  control. The app only chooses among them and keeps the highlight in step.
- Word timing is only as good as the voice's word events; where they are missing or unusable the
  highlight inside a sentence is estimated. Behaviour was checked with real voices on macOS +
  Chrome only; other systems were not tested.
- Pages without a text layer (scans) have nothing to highlight.

## With more time

- Box height from the font's ascent/descent instead of the text layer; support Type3 fonts and
  rotated text in the glyph replay; parse the drawing instructions once for both canvas and
  positions.
- Zoom: recompute boxes from the same character ranges after re-rendering.
- Continuous scrolling with lazy page rendering; reading across pages.
- A TTS service with word timestamps (e.g. a cloud voice behind a small server) instead of
  estimated timing for voices that report none.

## History of this repository

Before submission, I reorganized the development history into seven thematic pull requests to
make the implementation easier to review. Their creation dates reflect that cleanup. The
development iterations, changed decisions, and issues found during review are documented in
[docs/DECISIONS.md](docs/DECISIONS.md) ("How decisions changed along the way") and
[docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md).

## How AI was used

Built with Claude Code as the main pair programmer and ChatGPT (Sol 6.1) and Astra as independent
reviewers. I decided the stack, scope and trade-offs (e.g. measured accuracy over extra features,
no automatic page advance); the agent proposed options and implemented. During development
work went through small PRs, each with how it was verified (see "History of this repository").

Verification: unit tests for pure logic, Playwright on the production build, mutation checks for
the key guarantees (shifting or shrinking boxes by 3 px must fail the accuracy test), several rounds
of independent review where every finding was first reproduced by a failing test. Where the AI was
wrong and how it was caught is logged in [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md).

## What I learned

- A number can lie convincingly. The first accuracy metric reported 12 px errors while the page
  looked right; pixel profiles of the worst words showed the metric was wrong (word spaces on tight
  justified lines are only ~2 px), not the boxes.
- A test that cannot fail proves nothing: the first canvas test searched only 2 px around the box,
  so it could never report a larger error. A deliberate 4 px shift exposed it.
- An "error" can be the ruler's: "relationships" showed 7.5 px while its box was exact — an
  italic "c" before it leaned into the space, and the metric took the wider space before the "c".
- "confirmation" highlighted as "confi" + "rmation" was not our segmentation: the PDF draws a
  hidden space glyph after the "ﬁ" ligature. My first fix (join words after a ligature) broke
  "staff members" — text alone cannot tell a hidden space from a real one; glyph positions can.

## Sample PDF

`static/sample.pdf`: J. P. A. Ioannidis, "Why Most Published Research Findings Are False",
PLoS Medicine 2(8): e124 (2005), CC BY. See `static/SAMPLE_PDF_LICENSE.md`.
