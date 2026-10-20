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

export function splitWords(text: string, sentences: Sentence[]): Word[] {
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

	return words;
}

/** Shrinks a range so it does not start or end with whitespace; null if nothing is left. */
function trimRange(text: string, start: number, end: number): TextRange | null {
	while (start < end && /\s/.test(text[start])) start++;
	while (end > start && /\s/.test(text[end - 1])) end--;
	return start < end ? { start, end } : null;
}
