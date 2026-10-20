import { describe, expect, it } from 'vitest';
import type { Word } from '#lib/text/segment.js';
import { nextSentenceStart, previousSentenceStart, wordAtOffset } from './navigation';

// "One two. Three four five. Six."
const words: Word[] = [
	{ index: 0, sentenceIndex: 0, start: 0, end: 3 },
	{ index: 1, sentenceIndex: 0, start: 4, end: 7 },
	{ index: 2, sentenceIndex: 1, start: 9, end: 14 },
	{ index: 3, sentenceIndex: 1, start: 15, end: 19 },
	{ index: 4, sentenceIndex: 1, start: 20, end: 24 },
	{ index: 5, sentenceIndex: 2, start: 26, end: 29 }
];

describe('nextSentenceStart', () => {
	it('jumps to the first word of the next sentence', () => {
		expect(nextSentenceStart(words, 0)).toBe(2);
		expect(nextSentenceStart(words, 3)).toBe(5);
	});

	it('stays put in the last sentence', () => {
		expect(nextSentenceStart(words, 5)).toBe(5);
	});
});

describe('previousSentenceStart', () => {
	it('goes back to the start of the current sentence first', () => {
		expect(previousSentenceStart(words, 4)).toBe(2);
	});

	it('goes to the previous sentence when already at a sentence start', () => {
		expect(previousSentenceStart(words, 2)).toBe(0);
	});

	it('stays put at the very first word', () => {
		expect(previousSentenceStart(words, 0)).toBe(0);
	});
});

describe('wordAtOffset', () => {
	it('finds the word that contains the offset', () => {
		expect(wordAtOffset(words, 16)).toBe(3);
	});

	it('picks the next word when the offset is between words', () => {
		expect(wordAtOffset(words, 8)).toBe(2);
	});

	it('finds the clicked word even when words are not in text order (reading order)', () => {
		const reordered = [words[5], words[0], words[1]];
		expect(wordAtOffset(reordered, 1)).toBe(1);
		expect(wordAtOffset(reordered, 27)).toBe(0);
	});

	it('returns null after the last word', () => {
		expect(wordAtOffset(words, 40)).toBeNull();
	});
});
