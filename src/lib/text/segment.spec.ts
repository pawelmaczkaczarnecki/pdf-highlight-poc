import { describe, expect, it } from 'vitest';
import { splitSentences, splitWords } from './segment';

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

	it('leaves a hyphen inside a line alone', () => {
		expect(wordsOf('A well-known fact.')).toEqual(['A', 'well', 'known', 'fact']);
	});

	it('does not join across a dash with a space before it', () => {
		expect(wordsOf('It ends -\nnext part.')).toEqual(['It', 'ends', 'next', 'part']);
	});
});
