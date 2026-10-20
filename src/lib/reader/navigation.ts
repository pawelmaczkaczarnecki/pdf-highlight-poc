import type { Word } from '#lib/text/segment.js';

/** Index of the first word of the given sentence, or null if the sentence has no words. */
function firstWordOf(words: Word[], sentenceIndex: number): number | null {
	const index = words.findIndex((word) => word.sentenceIndex === sentenceIndex);
	return index === -1 ? null : index;
}

export function nextSentenceStart(words: Word[], wordIndex: number): number {
	const current = words[wordIndex];
	if (!current) return wordIndex;
	const next = words.findIndex((word) => word.sentenceIndex > current.sentenceIndex);
	return next === -1 ? wordIndex : next;
}

/** Like a media player's "back": to the start of this sentence, or the previous one if already there. */
export function previousSentenceStart(words: Word[], wordIndex: number): number {
	const current = words[wordIndex];
	if (!current) return wordIndex;
	const sentenceStart = firstWordOf(words, current.sentenceIndex) ?? wordIndex;
	if (sentenceStart < wordIndex) return sentenceStart;

	const previousWord = words[sentenceStart - 1];
	if (!previousWord) return sentenceStart;
	return firstWordOf(words, previousWord.sentenceIndex) ?? sentenceStart;
}

/** The word at a character offset, or the next word after it (e.g. a click on a space). */
export function wordAtOffset(words: Word[], offset: number): number | null {
	const index = words.findIndex((word) => offset < word.end);
	return index === -1 ? null : index;
}
