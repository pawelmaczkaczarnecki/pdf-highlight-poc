import { describe, expect, it } from 'vitest';
import type { TextBlock } from '#lib/text/pageText.js';
import { splitSentences } from '#lib/text/segment.js';
import { orderSentences } from './readingOrder';

function block(
	start: number,
	end: number,
	readingRank: number,
	isPageFurniture = false
): TextBlock {
	return { start, end, firstLeft: 0, firstTop: 0, top: 0, bottom: 0, isPageFurniture, readingRank };
}

describe('orderSentences', () => {
	// Content order as in the sample PDF: footer, body, then the title at the end.
	const text = 'Page 1 Body one. Body two. The Title';
	const blocks = [block(0, 7, 2, true), block(7, 27, 1), block(27, 36, 0)];

	it('reads blocks in reading order and skips headers and footers', () => {
		const ordered = orderSentences(splitSentences(text), blocks);
		expect(ordered.map((s) => text.slice(s.start, s.end))).toEqual([
			'The Title',
			'Body one.',
			'Body two.'
		]);
		expect(ordered.map((s) => s.index)).toEqual([0, 1, 2]);
	});

	it('keeps content order when there are no blocks', () => {
		const sentences = splitSentences(text);
		expect(orderSentences(sentences, [])).toBe(sentences);
	});
});
