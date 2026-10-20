import { describe, expect, it } from 'vitest';
import {
	backgroundColor,
	edgeErrors,
	inkColumns,
	isSpaceSeparated,
	summarize,
	type PixelStrip
} from './accuracy';

/** Builds a 1-pixel-high strip from a row pattern: '#' = ink colour, '.' = background colour. */
function strip(pattern: string, ink: number[], background: number[]): PixelStrip {
	const data = new Uint8ClampedArray(pattern.length * 4);
	[...pattern].forEach((char, x) => {
		const [r, g, b] = char === '#' ? ink : background;
		data.set([r, g, b, 255], x * 4);
	});
	return { data, width: pattern.length, height: 1 };
}

const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];
const GREEN = [160, 180, 70];

describe('inkColumns', () => {
	it('finds dark letters on white paper', () => {
		expect(inkColumns(strip('..##..', BLACK, WHITE))).toEqual([
			false,
			false,
			true,
			true,
			false,
			false
		]);
	});

	it('finds white letters on a coloured panel (the background is not ink)', () => {
		expect(backgroundColor(strip('.#...', WHITE, GREEN))).toEqual(GREEN);
		expect(inkColumns(strip('.#...', WHITE, GREEN))).toEqual([false, true, false, false, false]);
	});
});

describe('edgeErrors', () => {
	// "the range of": 1-column gaps between letters, 4-column word spaces. "range" is columns 7–15.
	const columns = [...'###....##.###.##....##'].map((c) => c === '#');

	it('reports zero for a box that matches the word exactly', () => {
		expect(edgeErrors(columns, 7, 16, 3)).toEqual({ left: 0, right: 0 });
	});

	it('reports a shifted box as an error of the shift size', () => {
		expect(edgeErrors(columns, 9, 18, 3)).toEqual({ left: 2, right: 2 });
	});

	it('does not mistake a gap between letters for the word space', () => {
		// Box edge inside the word next to a letter gap (column 9); the real space is still found.
		expect(edgeErrors(columns, 8, 16, 4)!.left).toBe(1);
	});

	it('measures a one-letter word without taking the space after it as its left edge', () => {
		// "a b": the letter "a" is columns 6–7, with 4-column word spaces on both sides.
		const oneLetter = [...'##....##....##'].map((c) => c === '#');
		expect(edgeErrors(oneLetter, 6, 8, 6)).toEqual({ left: 0, right: 0 });
	});

	it('does not confirm a box shrunk inside the word (its edges only find gaps between letters)', () => {
		// "research": letters separated by 1-column gaps, 5-column word spaces around it.
		const word = [...'#.....#.#.#.#.#.#.#.#.....#'].map((c) => c === '#');
		// The real word is columns 6–20. A box from 10 to 17 sits on letter gaps only.
		expect(edgeErrors(word, 10, 17, 3)).toBeNull();
		expect(edgeErrors(word, 6, 21, 3)).toEqual({ left: 0, right: 0 });
	});

	it('returns null when there is no gap near an edge', () => {
		expect(edgeErrors(Array(20).fill(true), 5, 15, 3)).toBeNull();
	});
});

describe('isSpaceSeparated', () => {
	const text = 'the range (of) studies,\nnext';

	it('accepts a word with spaces or line breaks on both sides', () => {
		expect(isSpaceSeparated(text, { start: 4, end: 9 })).toBe(true);
	});

	it('rejects a word touching punctuation, whose ink would include the punctuation', () => {
		expect(isSpaceSeparated(text, { start: 11, end: 13 })).toBe(false);
		expect(isSpaceSeparated(text, { start: 15, end: 22 })).toBe(false);
	});
});

describe('summarize', () => {
	it('reports median, 95th percentile, shares within 1 and 2 px, and the worst words', () => {
		const results = [0.2, 0.4, 0.6, 1.5, 3].map((errorPx, wordIndex) => ({ wordIndex, errorPx }));
		const report = summarize(6, results);

		expect(report.words).toBe(6);
		expect(report.measured).toBe(5);
		expect(report.medianPx).toBe(0.6);
		expect(report.p95Px).toBe(3);
		expect(report.within1Px).toBeCloseTo(0.6);
		expect(report.within2Px).toBeCloseTo(0.8);
		expect(report.worst[0]).toEqual({ wordIndex: 4, errorPx: 3 });
	});
});
