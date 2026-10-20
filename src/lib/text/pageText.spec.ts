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

describe('buildPageText reading order', () => {
	const page = { width: 600, height: 800 };

	it('continues a sentence from the bottom of one column to the top of the next', () => {
		const pageText = buildPageText(
			[
				item('Here I will examine the key', 50, 100, 10, true),
				item('factors that matter.', 320, 700, 10, true)
			],
			page
		);
		expect(pageText.text).not.toContain(BLOCK_BREAK);
	});

	it('still starts a new block at the top of the next column after a finished sentence', () => {
		const pageText = buildPageText(
			[item('The end.', 50, 100, 10, true), item('A new start', 320, 700, 10, true)],
			page
		);
		expect(pageText.text).toContain(BLOCK_BREAK);
	});

	it('joins a drop cap with the rest of its word ("P" + "ublished")', () => {
		const pageText = buildPageText(
			// A three-line drop cap: its baseline is ~2 lines below the first line of text.
			[item('P', 50, 500, 40, true), item('ublished research', 80, 524, 10, true)],
			page
		);
		const join = pageText.joins[0];
		expect(pageText.text.slice(0, join.start)).toBe('P');
		expect(pageText.text.slice(join.end).startsWith('ublished')).toBe(true);
	});

	it('marks running headers and footers, and reads the rest in layout order', () => {
		const pageText = buildPageText(
			[
				item('Journal | page 12', 50, 20, 8, true), // footer, first in the content stream
				item('Body text of the article.', 50, 600, 10, true),
				item('The Title', 50, 740, 20, true), // drawn last, but highest on the page
				item('Open access', 400, 790, 9, true) // header
			],
			page
		);
		const label = (i: number) =>
			pageText.text.slice(pageText.blocks[i].start, pageText.blocks[i].end).trim();
		expect(pageText.blocks.filter((b) => b.isPageFurniture)).toHaveLength(2);
		const byRank = [...pageText.blocks.keys()]
			.filter((i) => !pageText.blocks[i].isPageFurniture)
			.sort((a, b) => pageText.blocks[a].readingRank - pageText.blocks[b].readingRank)
			.map(label);
		expect(byRank).toEqual(['The Title', 'Body text of the article.']);
	});

	it('does not treat the first line of a column near the top as a header', () => {
		const pageText = buildPageText(
			[
				item('continued text at the top', 50, 750, 10, true),
				item('of the column.', 50, 738, 10, true)
			],
			page
		);
		expect(pageText.blocks.every((b) => !b.isPageFurniture)).toBe(true);
	});
});

describe('buildPageText on a cropped page', () => {
	it('classifies text by its place in the visible area, not by absolute coordinates', () => {
		const body = (y: number) => [item('Visible body sentence.', 100, y, 12, true)];
		const uncropped = buildPageText(body(150), { width: 600, height: 300 });
		// Same page cropped from a 600×600 media box: the visible area starts at y = 300.
		const cropped = buildPageText(body(450), { width: 600, height: 300, bottom: 300 });

		expect(uncropped.blocks.every((b) => !b.isPageFurniture)).toBe(true);
		expect(cropped.blocks.every((b) => !b.isPageFurniture)).toBe(true);
	});

	it('still finds a footer at the bottom of a cropped page', () => {
		const pageText = buildPageText(
			[item('Body text here.', 100, 450, 12, true), item('Page 3', 100, 305, 8, true)],
			{ width: 600, height: 300, bottom: 300 }
		);
		expect(pageText.blocks.map((b) => b.isPageFurniture)).toEqual([false, true]);
	});
});
