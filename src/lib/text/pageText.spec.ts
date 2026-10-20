import { describe, expect, it } from 'vitest';
import { buildPageText, sliceByItems } from './pageText';

const items = [
	{ str: 'Refutation and', hasEOL: true },
	{ str: 'controversy is', hasEOL: false },
	{ str: ' seen', hasEOL: true }
];

describe('buildPageText', () => {
	it('joins items and adds a line break only where the PDF line ends', () => {
		const pageText = buildPageText(items);
		expect(pageText.text).toBe('Refutation and\ncontroversy is seen\n');
		expect(pageText.itemStarts).toEqual([0, 15, 29]);
	});
});

describe('sliceByItems', () => {
	it('maps a range that crosses a line break onto both items with local offsets', () => {
		const pageText = buildPageText(items);
		const start = pageText.text.indexOf('and');
		const end = pageText.text.indexOf(' is');

		expect(sliceByItems(pageText, { start, end })).toEqual([
			{ itemIndex: 0, start: 11, end: 14 },
			{ itemIndex: 1, start: 0, end: 11 }
		]);
	});

	it('returns nothing for a range that covers only the artificial line break', () => {
		const pageText = buildPageText(items);
		expect(sliceByItems(pageText, { start: 14, end: 15 })).toEqual([]);
	});
});
