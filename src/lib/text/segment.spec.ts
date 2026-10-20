import { describe, expect, it } from 'vitest';
import { joinConnectedWords, splitSentences, splitWords, type Word } from './segment';

function textsOf(text: string, ranges: { start: number; end: number }[]): string[] {
	return ranges.map((range) => text.slice(range.start, range.end));
}

describe('splitSentences', () => {
	it('splits on sentence ends and trims surrounding spaces', () => {
		const text = 'First sentence here. Second one? Third!';
		expect(textsOf(text, splitSentences(text))).toEqual([
			'First sentence here.',
			'Second one?',
			'Third!'
		]);
	});

	it('does not treat a PDF line break as the end of a sentence', () => {
		const text = 'A sentence that wraps\nonto the next line. Next.';
		expect(textsOf(text, splitSentences(text))).toEqual([
			'A sentence that wraps\nonto the next line.',
			'Next.'
		]);
	});
});

describe('splitSentences across blocks', () => {
	it('ends a sentence at a block break even without punctuation (a title)', () => {
		const text = 'Why Most Findings Are False\n\u2029There is increasing concern. More.';
		expect(textsOf(text, splitSentences(text))).toEqual([
			'Why Most Findings Are False',
			'There is increasing concern.',
			'More.'
		]);
	});
});

describe('splitWords', () => {
	it('returns only real words (a citation number list stays one token), each linked to its sentence', () => {
		const text = 'Hello, world. Bye [4,5].';
		const sentences = splitSentences(text);
		const words = splitWords(text, sentences);

		expect(textsOf(text, words)).toEqual(['Hello', 'world', 'Bye', '4,5']);
		expect(words.map((word) => word.sentenceIndex)).toEqual([0, 0, 1, 1]);
	});

	it('keeps offsets pointing into the original page text', () => {
		const text = 'One two.\nThree four.';
		const words = splitWords(text, splitSentences(text));
		expect(text.slice(words[2].start, words[2].end)).toBe('Three');
	});
});

describe('splitWords with hidden spaces', () => {
	it('joins the two parts of a word around a space that is not visible on the page', () => {
		const text = 'Lack of conﬁ rmation and staﬀ members.';
		const hiddenSpace = { start: 12, end: 13 }; // the space inside "conﬁ rmation"
		const words = splitWords(text, splitSentences(text), [hiddenSpace]);
		expect(textsOf(text, words)).toEqual(['Lack', 'of', 'conﬁ rmation', 'and', 'staﬀ', 'members']);
	});
});

describe('splitWords with ligatures', () => {
	// A word ending in a ligature followed by a space is usually two real words ("staﬀ members").
	// Telling them apart from a hidden space ("conﬁ rmation") needs glyph positions, not text.
	it('keeps real words after a ligature separate', () => {
		const text = 'The staﬀ members took oﬀ the Wiﬁ network.';
		const words = splitWords(text, splitSentences(text));
		expect(textsOf(text, words)).toEqual([
			'The',
			'staﬀ',
			'members',
			'took',
			'oﬀ',
			'the',
			'Wiﬁ',
			'network'
		]);
	});
});

describe('splitWords with words hyphenated across lines', () => {
	function wordsOf(text: string): string[] {
		return textsOf(text, splitWords(text, splitSentences(text)));
	}

	it('joins a word broken at the end of a line into one word', () => {
		expect(wordsOf('They dispro-\nportionately reward it.')).toEqual([
			'They',
			'dispro-\nportionately',
			'reward',
			'it'
		]);
	});

	it('keeps word indexes consecutive after joining', () => {
		const text = 'A post-\nstudy check.';
		expect(splitWords(text, splitSentences(text)).map((word) => word.index)).toEqual([0, 1, 2]);
	});

	it('leaves a capitalised second half separate (a name like Kaplan-Meier)', () => {
		expect(wordsOf('The Kaplan-\nMeier curve.')).toEqual(['The', 'Kaplan', 'Meier', 'curve']);
	});

	it('keeps a hyphenated compound inside a line as one word, as a voice reads it', () => {
		expect(wordsOf('A Frontend-focused, well-known Kaplan-Meier fact.')).toEqual([
			'A',
			'Frontend-focused',
			'well-known',
			'Kaplan-Meier',
			'fact'
		]);
	});

	it('keeps a range written with an en dash as one word, as a voice reads it ("9–11")', () => {
		expect(wordsOf('Pages 10–20 and refs [9–11].')).toEqual([
			'Pages',
			'10–20',
			'and',
			'refs',
			'9–11'
		]);
	});

	it('does not join across dashes with spaces or an em dash', () => {
		expect(wordsOf('Ten – twenty, see—above.')).toEqual(['Ten', 'twenty', 'see', 'above']);
	});

	it('does not join across a dash with a space before it', () => {
		expect(wordsOf('It ends -\nnext part.')).toEqual(['It', 'ends', 'next', 'part']);
	});
});

describe('joinConnectedWords', () => {
	// Word parts as Chrome's segmenter returns them: it splits at "." "@" and "/".
	function parts(text: string, pieces: string[]): Word[] {
		let from = 0;
		return pieces.map((piece, index) => {
			const start = text.indexOf(piece, from);
			from = start + piece.length;
			return { index, sentenceIndex: 0, start, end: from };
		});
	}

	it('joins domains, e-mails and URLs that the browser split into parts', () => {
		const text = 'At piano.io, mail jane@example.com or see linkedin.com/in/jane-doe now.';
		const words = parts(text, [
			'At',
			'piano',
			'io',
			'mail',
			'jane',
			'example',
			'com',
			'or',
			'see',
			'linkedin',
			'com',
			'in',
			'jane',
			'doe',
			'now'
		]);
		expect(joinConnectedWords(text, words).map((w) => text.slice(w.start, w.end))).toEqual([
			'At',
			'piano.io',
			'mail',
			'jane@example.com',
			'or',
			'see',
			'linkedin.com/in/jane-doe',
			'now'
		]);
	});

	it('does not join across punctuation with a space or a comma inside a list', () => {
		const text = 'Done. Next, items [4,5].';
		const words = parts(text, ['Done', 'Next', 'items', '4', '5']);
		expect(joinConnectedWords(text, words)).toHaveLength(5);
	});
});
