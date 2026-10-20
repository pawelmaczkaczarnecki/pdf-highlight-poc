import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Parsing runs in a Web Worker so a large PDF does not freeze the page.
GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfSource = { url: string } | { data: ArrayBuffer };

export function loadPdf(source: PdfSource): Promise<PDFDocumentProxy> {
	return getDocument(source).promise;
}
