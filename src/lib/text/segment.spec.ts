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
