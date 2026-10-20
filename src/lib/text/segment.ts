/** Half-open character range [start, end) into the page text. */
export interface TextRange {
	start: number;
	end: number;
}

export interface Sentence extends TextRange {
	index: number;
}

export interface Word extends TextRange {
	index: number;
	sentenceIndex: number;
}

const LOCALE = 'en';

/** What separates the two halves of a word broken at the end of a line: a hyphen, then the line break. */
const LINE_END_HYPHEN = '-\n';
const STARTS_LOWERCASE = /^\p{Ll}/u;

/**
 * Line breaks from the PDF are not sentence breaks, but Intl.Segmenter treats them as such.
 * Replacing them with spaces keeps every character offset unchanged.
 */
function withoutLineBreaks(text: string): string {
	return text.replaceAll('\n', ' ');
}

export function splitSentences(text: string): Sentence[] {
	const segmenter = new Intl.Segmenter(LOCALE, { granularity: 'sentence' });
	const sentences: Sentence[] = [];

	for (const segment of segmenter.segment(withoutLineBreaks(text))) {
		const trimmed = trimRange(text, segment.index, segment.index + segment.segment.length);
		if (!trimmed) continue;
		sentences.push({ index: sentences.length, ...trimmed });
	}

	return sentences;
}

/**
 * @param hiddenSpaces spaces present in the text but not visible on the page (see
 *   findHiddenSpaces); the words on both sides of one are a single word.
 */
export function splitWords(
	text: string,
	sentences: Sentence[],
	hiddenSpaces: TextRange[] = []
): Word[] {
	const segmenter = new Intl.Segmenter(LOCALE, { granularity: 'word' });
	const words: Word[] = [];

	for (const sentence of sentences) {
		const sentenceText = text.slice(sentence.start, sentence.end);
		for (const segment of segmenter.segment(withoutLineBreaks(sentenceText))) {
			if (!segment.isWordLike) continue;
			const start = sentence.start + segment.index;
			const end = start + segment.segment.length;
			words.push({ index: words.length, sentenceIndex: sentence.index, start, end });
		}
	}

	return joinAcrossHiddenSpaces(joinLineBreakHyphenation(text, words), hiddenSpaces);
}

function joinAcrossHiddenSpaces(words: Word[], hiddenSpaces: TextRange[]): Word[] {
	if (hiddenSpaces.length === 0) return words;
	const isHidden = (start: number, end: number) =>
		hiddenSpaces.some((space) => space.start === start && space.end === end);
	const joined: Word[] = [];

	for (const word of words) {
		const previous = joined[joined.length - 1];
		if (previous && isHidden(previous.end, word.start)) {
			previous.end = word.end;
			continue;
		}
		joined.push({ ...word, index: joined.length });
	}

	return joined;
}

/**
 * A word broken at the end of a line ("dispro-⏎portionately", or the compound "post-⏎study") is
 * one word to highlight, with a box on each line. Whether the hyphen is spoken (compound) or
 * dropped (syllable break) needs a dictionary, so that is left to the speech side.
 * A capitalised second half ("Kaplan-⏎Meier") is left as two words.
 */
function joinLineBreakHyphenation(text: string, words: Word[]): Word[] {
	const joined: Word[] = [];

	for (const word of words) {
		const previous = joined[joined.length - 1];
		const isSecondHalf =
			previous !== undefined &&
			previous.sentenceIndex === word.sentenceIndex &&
			text.slice(previous.end, word.start) === LINE_END_HYPHEN &&
			STARTS_LOWERCASE.test(text.slice(word.start, word.end));

		if (isSecondHalf) {
			previous.end = word.end;
			continue;
		}
		joined.push({ ...word, index: joined.length });
	}

	return joined;
}

/** Shrinks a range so it does not start or end with whitespace; null if nothing is left. */
function trimRange(text: string, start: number, end: number): TextRange | null {
	while (start < end && /\s/.test(text[start])) start++;
	while (end > start && /\s/.test(text[end - 1])) end--;
	return start < end ? { start, end } : null;
}
