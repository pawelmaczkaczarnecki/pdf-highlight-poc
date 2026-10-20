import { describe, expect, it } from 'vitest';
import { glyphRefinedBoxes, type GlyphEdge } from './glyphEdges';

const text = 'the range of';
// Glyph edges for "range" (offsets 4–8), baseline 112 on a line box from 100 to 115.
const glyphs: Record<number, GlyphEdge> = {
	4: { left: 40.2, right: 44.1, baseline: 112 },
	5: { left: 44.1, right: 49.0, baseline: 112 },
	6: { left: 49.0, right: 54.3, baseline: 112 },
	7: { left: 54.3, right: 59.0, baseline: 112 },
	8: { left: 59.0, right: 63.8, baseline: 112 }
};
const textLayerBox = { left: 41.5, top: 100, right: 62.0, bottom: 115 };

describe('glyphRefinedBoxes', () => {
	it('takes left and right edges from the glyphs and keeps the line box height', () => {
		const boxes = glyphRefinedBoxes(
			[textLayerBox],
			{ start: 4, end: 9 },
			text,
			(o) => glyphs[o] ?? null
		);
		expect(boxes).toEqual([{ left: 40.2, top: 100, right: 63.8, bottom: 115 }]);
	});

	it('falls back to the text-layer box when a character has no trusted glyph position', () => {
		const boxes = glyphRefinedBoxes([textLayerBox], { start: 4, end: 9 }, text, (o) =>
			o === 6 ? null : glyphs[o]
		);
		expect(boxes).toEqual([textLayerBox]);
	});

	it('splits a word across two lines by baseline (hyphenated word)', () => {
		const twoLines = 'dispro-\nportion';
		const edgeAt = (o: number): GlyphEdge | null => {
			if (o <= 6) return { left: 200 + o * 5, right: 205 + o * 5, baseline: 112 };
			if (o >= 8) return { left: 10 + (o - 8) * 5, right: 15 + (o - 8) * 5, baseline: 127 };
			return null;
		};
		const lineBoxes = [
			{ left: 199, top: 100, right: 236, bottom: 115 },
			{ left: 9, top: 115, right: 46, bottom: 130 }
		];
		expect(glyphRefinedBoxes(lineBoxes, { start: 0, end: 15 }, twoLines, edgeAt)).toEqual([
			{ left: 200, top: 100, right: 235, bottom: 115 },
			{ left: 10, top: 115, right: 45, bottom: 130 }
		]);
	});
});
