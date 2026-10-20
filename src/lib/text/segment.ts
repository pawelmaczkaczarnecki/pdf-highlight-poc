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
/**
 * Characters that connect two word parts without a space into one token a voice reads as a whole:
 * hyphenated compounds, ranges with an en dash ("9–11"), domains and versions ("piano.io", "2.5"),
 * e-mails, URLs and paths. An em dash or a dash with spaces still separates words.
 */
const CONNECTORS = /^[-\u2010\u2013.@/_:]+$/;
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

	return joinAcrossHiddenSpaces(joinConnectedWords(text, words), hiddenSpaces);
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
 * Word parts that belong together are one word to highlight, as a voice reads them:
 * - parts connected without spaces ("Frontend-focused", "piano.io", "jane@example.com",
 *   "linkedin.com/in/jane-doe"). Browsers split these differently (Chrome splits "piano.io",
 *   Node does not), so they are joined here explicitly;
 * - a word broken at the end of a line ("dispro-⏎portionately", or the compound "post-⏎study"),
 *   with a box on each line. A capitalised second half ("Kaplan-⏎Meier") is left as two words,
 *   because after a line break it is as likely a new name as a continuation.
 * Whether a line-end hyphen is spoken (compound) or dropped (syllable break) needs a dictionary,
 * so that is left to the speech side.
 */
export function joinConnectedWords(text: string, words: Word[]): Word[] {
	const joined: Word[] = [];

	for (const word of words) {
		const previous = joined[joined.length - 1];
		const between = previous ? text.slice(previous.end, word.start) : '';
		const sameSentence = previous !== undefined && previous.sentenceIndex === word.sentenceIndex;
		const isSecondHalf =
			sameSentence &&
			(CONNECTORS.test(between) ||
				(between === LINE_END_HYPHEN && STARTS_LOWERCASE.test(text.slice(word.start, word.end))));

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
