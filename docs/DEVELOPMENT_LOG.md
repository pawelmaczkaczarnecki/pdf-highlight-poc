# Development log

## Goals

- [x] PDF page renders sharply (also on HiDPI screens).
- [x] A custom overlay layer sits above the native PDF.js layers, does not block clicks, keeps text readable.
- [x] A whole sentence is highlighted accurately, also across lines (one band per line).
- [x] A single word is highlighted accurately (edges at letter boundaries).
- [x] Reading can be stepped / played sentence by sentence and word by word.

## Out of scope

- Zoom, backend, real TTS timing data.

## Progress

Done (from the third step on, each change went through a PR describing how it was verified):

- Skeleton: SvelteKit + TS + Tailwind + Vitest + Playwright + adapter-static, pdfjs-dist 6.4.299.
- Vertical slice: sample PDF → canvas + text layer + overlay → sentence and word highlighted.
- Correct text-layer scale, safe render cancellation, canvas-pixel accuracy test.
- Reader controls, click-to-read, page navigation, file picker, "show all word boxes".
- CI (GitHub Actions): lint, typecheck, unit, e2e on the production build.
- Accuracy report in the demo (canvas ink vs. box edges), clickable worst words.
- Robustness: stale loads, last-letter clicks, Space on buttons, stricter metric.
- Sentences end at block boundaries; footnote markers do not split sentences.
- Accessible playback announcements, empty-page message, narrow screens, speed changes.
- Words hyphenated across lines are one word with a box per line.
- PDF.js helper files (image decoders, standard fonts, CJK maps); highlight starts on screen and
  the view follows it; failed loads free their worker.
- Hidden spaces after ligatures detected from glyph positions.
- README, deployment from a clean clone.

- Approach B (default): box edges from glyph positions, A as toggle and fallback; compared with
  A on the same words of two differently produced PDFs; B-mode regression tests.

- Accuracy metric picks the closest word-space-sized gap (italic neighbours); glyph positions
  are the only mode, text-layer boxes remain as fallback and report baseline.
- Reading order from layout: headers/footers skipped, columns read in order, sentences continue
  across column breaks, drop caps joined; reading starts at the top of the page.

## AI mistakes caught

| What the agent did                                                                                                                                                                                                                                     | How it was noticed                                                      | Fix                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Explained "relationships 7.5 px" as a metric quirk without fixing it                                                                                                                                                                                   | User: "the box is perfect when I click it"                              | Pixel profile showed the widest-gap rule picked the space before an italic "c"; closest word-space gap instead |
| Reported "all tests pass" from local runs (macOS) while CI on Linux had been failing since the narrow-screen test was added: the page was 395 px wide there                                                                                            | Independent reviewer; then the CI run history                           | Fixed the wrapping; checked every branch's CI run after re-stacking (all green)                                |
| Committed 200 copied PDF.js files while fixing an older branch whose `.gitignore` predates the `static/pdfjs` entry                                                                                                                                    | Diff check of every re-stacked branch before pushing                    | Removed them from the commit and re-stacked; nothing was pushed                                                |
| "Start at the highest word" made Play jump from the header straight to the footer                                                                                                                                                                      | User pressed Play                                                       | Reading order from layout, headers/footers skipped                                                             |
| A header band of 8% hid the first line of body columns on pages 2–3                                                                                                                                                                                    | Listed the skipped blocks on all 6 pages                                | 5% band; headers/footers still caught                                                                          |
| Wrote that hidden spaces are only joined when glyphs match the text 1:1, but the code compared only the character count                                                                                                                                | Independent reviewer ran "ab cd" against drawn "ax cd"                  | Compare characters, not only count; test for a same-length mismatch                                            |
| Edited the progress list by searching for a heading the formatter had re-indented; the edits silently did nothing for most of the work                                                                                                                 | Noticed while cleaning up the docs                                      | Rewrote the list from the PR history                                                                           |
| Wrote "word edges off by ~1–2 px" into DECISIONS.md as a fact without measuring it                                                                                                                                                                     | Independent reviewer (second AI tool)                                   | Replaced with a measured check against canvas pixels                                                           |
| First canvas accuracy test only searched for ink within 2 px of the box, so it could never report an error larger than 2 px                                                                                                                            | Mutation check: boxes shifted by 4 px, test still passed                | Rewrote it to walk outwards from the word's middle to a word-sized gap; the same mutation now fails            |
| Unit test expected "[4,5]" to be two words; Intl.Segmenter keeps "4,5" as one number                                                                                                                                                                   | Test failure                                                            | Fixed the expectation (the code was right)                                                                     |
| First accuracy metric assumed word spaces ≥ 3 px and counted punctuation as word ink, reporting 12 px errors                                                                                                                                           | Numbers contradicted the screenshot; pixel profiles of the worst words  | Widest-gap-near-edge metric, only space-separated words; mutation check                                        |
| Second review round: stale "open document" could replace a newer file; click on the right half of a word's last letter picked the next word; Space on a focused button toggled playback; accuracy metric scored a box shrunk onto letter gaps as ~0 px | Independent reviewer; each reproduced by a failing test first           | Request counter; character-under-pointer check; shortcuts skip buttons; confirm word spaces                    |
| Said "PDF.js inserts a space after the ligature" without checking                                                                                                                                                                                      | User asked whether "confi" was our bug                                  | Checked the operator list: the PDF itself draws a hidden space glyph                                           |
| Joined words after a ligature on the claim "a word practically never ends in a ligature" — false for "off", "staff", "cliff"                                                                                                                           | Independent reviewer (third round) clicked "Wiﬁ network" on another PDF | Removed the rule; the correct signal is glyph geometry                                                         |
| Planned to handle words hyphenated across lines in Phase 0, then forgot                                                                                                                                                                                | User asked about it                                                     | Queued as a separate change                                                                                    |
| Claimed a low "measured" count would expose a broken layout                                                                                                                                                                                            | Mutation check with a stale canvas: count stayed high                   | Tests assert the median instead                                                                                |
| Block rule compared the next line with the last item of the previous one — a footnote marker                                                                                                                                                           | Fourth review (Astra)                                                   | Compare with the line's largest item                                                                           |
| Never passed wasm/standard-font/cMap URLs to PDF.js                                                                                                                                                                                                    | Fourth review: a JPEG 2000 test PDF rendered blank                      | Copy the folders on dev/build, pass the URLs                                                                   |
| Scroll margin in CSS assumed a fixed toolbar height; on a narrow screen the word hid under it                                                                                                                                                          | Screenshot at 412 px width                                              | Measure the real toolbar edge in code; test asserts the word is below it                                       |
| Scaffolder wrote the local folder name (containing the company name) into package.json                                                                                                                                                                 | Grep for the company name before the first commit                       | Renamed the package                                                                                            |
