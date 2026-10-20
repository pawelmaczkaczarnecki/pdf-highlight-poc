import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { findHiddenSpaces, positionGlyphs, type PositionedGlyph } from './glyphLayout';

/** A glyph at [left, right] on a baseline, 10 units font size. */
function glyph(text: string, left: number, right: number, baseline = 100): PositionedGlyph {
	return { text, left, right, baseline, emSize: 10, supported: true };
}

describe('findHiddenSpaces', () => {
	it('finds a space that is drawn over the ligature ("conﬁ rmation")', () => {
		const text = 'conﬁ rmation';
		const glyphs = [
			glyph('c', 0, 4),
			glyph('o', 4, 9),
			glyph('n', 9, 14),
			glyph('ﬁ', 14, 19),
			glyph(' ', 16.5, 19), // drawn back over the ligature
			glyph('r', 19, 22.5), // starts right where "ﬁ" ended
			...[...'mation'].map((char, i) => glyph(char, 22.5 + i * 4, 26.5 + i * 4))
		];
		expect(findHiddenSpaces(text, glyphs)).toEqual([{ start: 4, end: 5 }]);
	});

	it('keeps a real space after a ligature ("staﬀ members")', () => {
		const text = 'staﬀ members';
		const glyphs = [
			glyph('s', 0, 4),
			glyph('t', 4, 7),
			glyph('a', 7, 11),
			glyph('ﬀ', 11, 17),
			glyph(' ', 17, 19.5),
			...[...'members'].map((char, i) => glyph(char, 19.5 + i * 5, 24.5 + i * 5))
		];
		expect(findHiddenSpaces(text, glyphs)).toEqual([]);
	});

	it('ignores a space at the end of a line (the next word is on another line)', () => {
		const text = 'oﬀ next';
		const glyphs = [
			glyph('o', 0, 5),
			glyph('ﬀ', 5, 11),
			glyph(' ', 11, 11),
			glyph('n', 0, 5, 88),
			glyph('e', 5, 10, 88),
			glyph('x', 10, 15, 88),
			glyph('t', 15, 18, 88)
		];
		expect(findHiddenSpaces(text, glyphs)).toEqual([]);
	});

	it('returns nothing when the drawn glyphs do not match the text', () => {
		expect(findHiddenSpaces('ab cd', [glyph('a', 0, 5), glyph('x', 5, 10)])).toEqual([]);
	});

	it('returns nothing when the glyphs differ from the text even with the same length', () => {
		// "ax cd" drawn for the text "ab cd": the space would look hidden, but the glyphs do not
		// belong to this text, so nothing may be joined.
		const glyphs = [
			glyph('a', 0, 5),
			glyph('x', 5, 10),
			glyph(' ', 8, 10),
			glyph('c', 10, 15),
			glyph('d', 15, 20)
		];
		expect(findHiddenSpaces('ab cd', glyphs)).toEqual([]);
	});
});

describe('positionGlyphs on the sample PDF', () => {
	it('finds exactly the hidden spaces after ligatures on page 1', async () => {
		const data = new Uint8Array(readFileSync('static/sample.pdf'));
		const pdf = await getDocument({ data }).promise;
		const page = await pdf.getPage(1);
		const textContent = await page.getTextContent({ disableNormalization: true });
		const pageText = textContent.items
			.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
			.join('');
		const operatorList = await page.getOperatorList();
		const glyphs = positionGlyphs(
			operatorList,
			OPS,
			(name) => page.commonObjs.get(name)?.fontMatrix?.[0]
		);

		// The whole word around each hidden space, as it reads on the page.
		const words = findHiddenSpaces(pageText, glyphs).map(({ start, end }) => {
			const before = pageText.slice(0, start).match(/\p{L}+$/u)![0];
			const after = pageText.slice(end).match(/^\p{L}+/u)![0];
			return `${before} ${after}`;
		});
		expect(words).toEqual(['conﬁ rmation', 'ﬁ eld', 'reﬂ ects', 'ﬁ nding', 'ﬁ eld']);
		await pdf.loadingTask.destroy();
	});
});
