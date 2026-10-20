import { describe, expect, it } from 'vitest';
import { splitSentences, splitWords } from '#lib/text/segment.js';
import {
	estimatedWordTimes,
	isUsableWordEvent,
	preferredVoices,
	speechRate,
	spokenSentenceFrom,
	wordAtSpokenOffset
} from './speech';

const pageText = 'Lack of conﬁ rmation is common.\n\u2029Dispro-\nportionately, yes.';
const hiddenSpace = { start: 12, end: 13 };
const words = splitWords(pageText, splitSentences(pageText), [hiddenSpace]);

describe('spokenSentenceFrom', () => {
	it('speaks words as they read on the page and keeps the punctuation', () => {
		const spoken = spokenSentenceFrom(pageText, words, 0);
		expect(spoken.text).toBe('Lack of confirmation is common.');
		expect(spoken.words.map((w) => spoken.text.slice(w.start).split(' ')[0])).toEqual([
			'Lack',
			'of',
			'confirmation',
			'is',
			'common.'
		]);
	});

	it('starts in the middle of a sentence and stops at its end', () => {
		const spoken = spokenSentenceFrom(pageText, words, 2);
		expect(spoken.text).toBe('confirmation is common.');
		expect(spoken.words[0].wordIndex).toBe(2);
	});

	it('replaces the minus sign, which breaks word events in the macOS engine, keeping offsets', () => {
		const text = 'the power 1 − β (one minus).';
		const ws = splitWords(text, splitSentences(text));
		const spoken = spokenSentenceFrom(text, ws, 0);
		expect(spoken.text).toBe('the power 1 - β (one minus).');
		expect(spoken.text.length).toBe(text.length);
	});

	it('writes a word hyphenated across lines on one line', () => {
		const second = words.findIndex((word) =>
			pageText.slice(word.start, word.end).startsWith('Dispro')
		);
		expect(spokenSentenceFrom(pageText, words, second).text).toBe('Dispro-portionately, yes.');
	});
});

describe('wordAtSpokenOffset', () => {
	it('maps an event that starts at an opening bracket to the word after it, not the one before', () => {
		const text = 'pointed out [9–11] that';
		const ws = splitWords(text, splitSentences(text));
		const spoken = spokenSentenceFrom(text, ws, 0);
		const event = spoken.text.indexOf('[');
		expect(
			text.slice(
				ws[wordAtSpokenOffset(spoken, event)!].start,
				ws[wordAtSpokenOffset(spoken, event)!].end
			)
		).toBe('9–11');
	});

	it('maps a speech engine word event back to the reader word', () => {
		const spoken = spokenSentenceFrom(pageText, words, 0);
		expect(wordAtSpokenOffset(spoken, spoken.text.indexOf('confirmation'))).toBe(2);
		expect(wordAtSpokenOffset(spoken, spoken.text.indexOf('common'))).toBe(4);
		// Inside a word, also at a non-letter character, it stays on that word.
		expect(wordAtSpokenOffset(spoken, spoken.text.indexOf('rmation'))).toBe(2);
	});
});

describe('isUsableWordEvent', () => {
	it('accepts a long single word and the word after it', () => {
		const text = 'Supercalifragilisticexpialidocious a.';
		const spoken = spokenSentenceFrom(text, splitWords(text, splitSentences(text)), 0);
		expect(isUsableWordEvent(spoken, 0, 34)).toBe(true);
		expect(isUsableWordEvent(spoken, 35, 1)).toBe(true);
	});

	it('rejects an event that claims the whole utterance is the first word', () => {
		const spoken = spokenSentenceFrom(pageText, words, 0);
		expect(isUsableWordEvent(spoken, 0, spoken.text.length)).toBe(false);
	});

	it('accepts events without a length and with closing punctuation', () => {
		const spoken = spokenSentenceFrom(pageText, words, 0);
		expect(isUsableWordEvent(spoken, 0, 0)).toBe(true);
		const common = spoken.text.indexOf('common');
		expect(isUsableWordEvent(spoken, common, 'common.'.length)).toBe(true);
	});
});

describe('speechRate', () => {
	it('maps words per minute to a clamped speech rate', () => {
		expect(speechRate(180)).toBe(1);
		expect(speechRate(360)).toBe(2);
		expect(speechRate(30)).toBe(0.5);
	});
});

describe('preferredVoices', () => {
	const voice = (name: string, lang: string, localService: boolean) =>
		({ name, lang, localService }) as SpeechSynthesisVoice;

	it('offers on-device voices (they report words) with Karen first, not Google network voices', () => {
		const ordered = preferredVoices([
			voice('Google US English', 'en-US', false),
			voice('Samantha', 'en-US', true),
			voice('Karen', 'en-AU', true),
			voice('Zarvox', 'en-US', true),
			voice('Grandma (English (US))', 'en-US', true),
			voice('Anna', 'de-DE', true),
			voice('Ava (Premium)', 'en-US', true)
		]);
		expect(ordered.map((v) => v.name)).toEqual(['Karen', 'Ava (Premium)', 'Samantha']);
	});

	it('falls back to Google voices only when the system has no voice of its own', () => {
		const ordered = preferredVoices([
			voice('Google UK English Female', 'en-GB', false),
			voice('Google US English', 'en-US', false)
		]);
		expect(ordered.map((v) => v.name)).toEqual(['Google UK English Female', 'Google US English']);
	});
});

describe('estimatedWordTimes', () => {
	it('spreads the words over the utterance by their position in the text', () => {
		const spoken = {
			text: 'one two three',
			words: [0, 4, 8].map((start, wordIndex) => ({ wordIndex, start, end: start + 3 }))
		};
		expect(estimatedWordTimes(spoken, 10)).toEqual([0, 400, 800]);
	});
});
