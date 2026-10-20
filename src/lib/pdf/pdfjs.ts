import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Parsing runs in a Web Worker so a large PDF does not freeze the page.
GlobalWorkerOptions.workerSrc = workerUrl;

/** Copied from pdfjs-dist by scripts/copy-pdfjs-assets.mjs and served as static files. */
const ASSETS = '/pdfjs';

export type PdfSource = { url: string } | { data: ArrayBuffer };

export async function loadPdf(source: PdfSource): Promise<PDFDocumentProxy> {
	const loadingTask = getDocument({
		...source,
		// Without these, some valid PDFs lose content: JPEG 2000 / JBIG2 images, standard fonts
		// that are not embedded in the file, and CJK text.
		wasmUrl: `${ASSETS}/wasm/`,
		standardFontDataUrl: `${ASSETS}/standard_fonts/`,
		cMapUrl: `${ASSETS}/cmaps/`,
		cMapPacked: true
	});
	try {
		return await loadingTask.promise;
	} catch (error) {
		// A failed load still started a worker; free it, or every bad file leaks one.
		await loadingTask.destroy();
		throw error;
	}
}
