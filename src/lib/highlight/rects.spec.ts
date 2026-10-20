import { describe, expect, it } from 'vitest';
import { mergeIntoLines, type Box } from './rects';

function box(left: number, top: number, right: number, bottom: number): Box {
	return { left, top, right, bottom };
}

describe('mergeIntoLines', () => {
	it('joins boxes on the same line into one band', () => {
		const merged = mergeIntoLines([box(10, 100, 50, 115), box(52, 101, 90, 116)]);
		expect(merged).toEqual([box(10, 100, 90, 116)]);
	});

	it('keeps different lines separate', () => {
		const merged = mergeIntoLines([box(10, 100, 50, 115), box(10, 117, 50, 132)]);
		expect(merged).toHaveLength(2);
	});

	it('keeps boxes in two columns separate even at the same height', () => {
		const merged = mergeIntoLines([box(10, 100, 200, 115), box(240, 100, 400, 115)]);
		expect(merged).toHaveLength(2);
	});
});
