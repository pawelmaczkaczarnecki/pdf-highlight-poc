# Session

Started: 18:04. Length: 240 min.

## Acceptance criteria

- [ ] PDF page renders sharply (also on HiDPI screens).
- [ ] A custom overlay layer sits above the native PDF.js layers, does not block clicks, keeps text readable.
- [ ] A whole sentence is highlighted accurately, also across lines (one band per line).
- [ ] A single word is highlighted accurately (edges at letter boundaries).
- [ ] Reading can be stepped / played sentence by sentence and word by word.
- [ ] Public demo URL; private GitHub repository.
- [ ] README: approach, limitations, next steps.

## Out of scope

- Zoom, backend, real TTS timing data.

## Progress

Done:

- Skeleton: SvelteKit + TS + Tailwind + Vitest + Playwright + adapter-static, pdfjs-dist 6.4.299.
  Next:
- Vertical slice: load sample PDF → render page → highlight one hardcoded word.

## AI mistakes caught

| What the agent did                                                                                                                                                                                                                                     | How it was noticed                                                      | Fix                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Wrote "word edges off by ~1–2 px" into DECISIONS.md as a fact without measuring it                                                                                                                                                                     | Independent reviewer (second AI tool)                                   | Replaced with a measured check against canvas pixels                                                |
| First canvas accuracy test only searched for ink within 2 px of the box, so it could never report an error larger than 2 px                                                                                                                            | Mutation check: boxes shifted by 4 px, test still passed                | Rewrote it to walk outwards from the word's middle to a word-sized gap; the same mutation now fails |
| Unit test expected "[4,5]" to be two words; Intl.Segmenter keeps "4,5" as one number                                                                                                                                                                   | Test failure                                                            | Fixed the expectation (the code was right)                                                          |
| First accuracy metric assumed word spaces ≥ 3 px and counted punctuation as word ink, reporting 12 px errors                                                                                                                                           | Numbers contradicted the screenshot; pixel profiles of the worst words  | Widest-gap-near-edge metric, only space-separated words; mutation check                             |
| Second review round: stale "open document" could replace a newer file; click on the right half of a word's last letter picked the next word; Space on a focused button toggled playback; accuracy metric scored a box shrunk onto letter gaps as ~0 px | Independent reviewer; each reproduced by a failing test first           | Request counter; character-under-pointer check; shortcuts skip buttons; confirm word spaces         |
| Said "PDF.js inserts a space after the ligature" without checking                                                                                                                                                                                      | User asked whether "confi" was our bug                                  | Checked the operator list: the PDF itself draws a hidden space glyph                                |
| Joined words after a ligature on the claim "a word practically never ends in a ligature" — false for "off", "staff", "cliff"                                                                                                                           | Independent reviewer (third round) clicked "Wiﬁ network" on another PDF | Removed the rule; the correct signal is glyph geometry                                              |
| Planned to handle words hyphenated across lines in Phase 0, then forgot                                                                                                                                                                                | User asked about it                                                     | Queued as a separate change                                                                         |
| Claimed a low "measured" count would expose a broken layout                                                                                                                                                                                            | Mutation check with a stale canvas: count stayed high                   | Tests assert the median instead                                                                     |
| Block rule compared the next line with the last item of the previous one — a footnote marker                                                                                                                                                           | Fourth review (Astra)                                                   | Compare with the line's largest item                                                                |
| Never passed wasm/standard-font/cMap URLs to PDF.js                                                                                                                                                                                                    | Fourth review: a JPEG 2000 test PDF rendered blank                      | Copy the folders on dev/build, pass the URLs                                                        |
| Scroll margin in CSS assumed a fixed toolbar height; on a narrow screen the word hid under it                                                                                                                                                          | Screenshot at 412 px width                                              | Measure the real toolbar edge in code; test asserts the word is below it                            |
| Scaffolder wrote the local folder name (containing the company name) into package.json                                                                                                                                                                 | Grep for the company name before the first commit                       | Renamed the package                                                                                 |
