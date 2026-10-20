import { describe, expect, it } from 'vitest';
import {
	BLOCK_BREAK,
	buildPageText,
	isBlockBreak,
	sliceByItems,
	type TextItemLike
} from './pageText';

/** A text item at baseline (x, y) with the given font height, in PDF units. */
function item(str: string, x: number, y: number, height = 10, hasEOL = false): TextItemLike {
	return { str, hasEOL, transform: [height, 0, 0, height, x, y], height };
}

const items = [
	item('Refutation and', 50, 500, 10, true),
	item('controversy is', 50, 488),
	item(' seen', 110, 488, 10, true)
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

describe('isBlockBreak', () => {
	it('treats the next line of the same paragraph as a continuation', () => {
		expect(isBlockBreak(item('first line', 50, 500), item('second line', 50, 488))).toBe(false);
	});

	it('does not break a sentence at a smaller footnote marker on the same line', () => {
		expect(isBlockBreak(item('as shown', 50, 500), item('4', 90, 503, 6))).toBe(false);
	});

	it('breaks between a title and the text below it (font size changes)', () => {
		expect(isBlockBreak(item('A Title', 50, 700, 24), item('Body text', 50, 670))).toBe(true);
	});

	it('breaks at a large vertical gap (e.g. body text to footer)', () => {
		expect(isBlockBreak(item('last line', 50, 100), item('Page 3', 50, 40))).toBe(true);
	});

	it('breaks when the text continues higher up (next column or header)', () => {
		expect(isBlockBreak(item('end of column', 50, 100), item('top of next', 300, 700))).toBe(true);
	});
});

describe('buildPageText with blocks', () => {
	it('keeps a sentence together across a footnote marker at the end of a line', () => {
		const pageText = buildPageText([
			item('This result', 50, 500),
			item('1', 104, 503, 6, true), // raised footnote marker ends the line
			item('is statistically significant.', 50, 488, 10, true)
		]);
		expect(pageText.text).not.toContain(BLOCK_BREAK);
	});

	it('puts a block break between a title and the body', () => {
		const pageText = buildPageText([
			item('A Title', 50, 700, 24, true),
			item('Body starts here.', 50, 670, 10, true)
		]);
		expect(pageText.text).toBe(`A Title\n${BLOCK_BREAK}Body starts here.\n`);
		// Offsets of items still point at their own text.
		expect(pageText.text.slice(pageText.itemStarts[1], pageText.itemStarts[1] + 4)).toBe('Body');
	});
});
