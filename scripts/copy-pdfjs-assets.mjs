// Copies the PDF.js helper files that the browser downloads on demand into static/pdfjs/:
// image decoders (JPEG 2000, JBIG2), data for the 14 standard PDF fonts, and character maps
// for CJK text. They must match the installed pdfjs-dist version, so they are copied from
// node_modules on every dev/build run instead of being committed.
import { cpSync, rmSync } from 'node:fs';

const FOLDERS = ['wasm', 'standard_fonts', 'cmaps'];
const target = 'static/pdfjs';

rmSync(target, { recursive: true, force: true });
for (const folder of FOLDERS) {
	cpSync(`node_modules/pdfjs-dist/${folder}`, `${target}/${folder}`, { recursive: true });
}
console.log(`Copied PDF.js ${FOLDERS.join(', ')} to ${target}/`);
