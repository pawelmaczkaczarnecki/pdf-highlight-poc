import { describe, expect, it, vi } from 'vitest';

const destroy = vi.fn(() => Promise.resolve());

vi.mock('pdfjs-dist', () => ({
	GlobalWorkerOptions: {},
	getDocument: () => ({ promise: Promise.reject(new Error('Invalid PDF structure.')), destroy })
}));

describe('loadPdf', () => {
	it('frees the loading task (and its worker) when the file cannot be opened', async () => {
		const { loadPdf } = await import('./pdfjs');

		await expect(loadPdf({ data: new ArrayBuffer(8) })).rejects.toThrow('Invalid PDF structure.');
		expect(destroy).toHaveBeenCalledOnce();
	});
});
