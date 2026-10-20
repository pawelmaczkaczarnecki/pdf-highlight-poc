import type { Word } from '#lib/text/segment.js';

/**
 * What the speech engine is given for one stretch of reading (the rest of a sentence), and where
 * each of our words starts in it, so the engine's word events can be mapped back to highlights.
 */
export interface SpokenSentence {
	text: string;
	/** For each spoken word: its index in the reader's word list and where it is in `text`. */
	words: Array<{ wordIndex: number; start: number; end: number }>;
}

/** Speech rate 1 is roughly this many words per minute for typical English voices. */
const WORDS_PER_MINUTE_AT_RATE_1 = 180;

/**
 * Builds the text to speak from `fromIndex` to the end of that word's sentence. Words are written
 * as they read on the page (no hidden spaces, "-⏎" → "-", ligatures as letters) and the
 * punctuation between them is kept for natural pauses; line and block breaks become spaces.
 */
export function spokenSentenceFrom(
	pageText: string,
	words: Word[],
	fromIndex: number
): SpokenSentence {
	const first = words[fromIndex];
	const spoken: SpokenSentence = { text: '', words: [] };
	if (!first) return spoken;

	let index = fromIndex;
	let previousEnd = first.start;
	while (index < words.length && words[index].sentenceIndex === first.sentenceIndex) {
		const word = words[index];
		spoken.text += asSpokenGap(pageText.slice(previousEnd, word.start));
		const start = spoken.text.length;
		spoken.text += asSpokenWord(pageText.slice(word.start, word.end));
		spoken.words.push({ wordIndex: index, start, end: spoken.text.length });
		previousEnd = word.end;
		index++;
	}
	// Closing punctuation of the sentence ("." "?" ")"), up to the next whitespace.
	spoken.text += pageText.slice(previousEnd).match(/^\S*/)![0];
	return spoken;
}

/**
 * The minus sign U+2212 makes the macOS speech engine report every word as the whole utterance
 * (position 0, full length), so the highlight could not follow. A hyphen is read as "minus" too
 * and keeps all offsets, being one character as well.
 */
const MINUS_SIGN = /\u2212/g;

function asSpokenWord(text: string): string {
	return text.replace('-\n', '-').replace(/\s+/g, '').normalize('NFKC').replace(MINUS_SIGN, '-');
}

function asSpokenGap(text: string): string {
	text = text.replace(MINUS_SIGN, '-');
	return text.replace(/\s+/g, ' '); // line and block breaks included
}

/**
 * The reader's word index for a speech engine word event at `charIndex`: the word that contains
 * it, or else the first word after it (an event can start at punctuation, e.g. "[" before "9–11").
 */
export function wordAtSpokenOffset(spoken: SpokenSentence, charIndex: number): number | null {
	const word =
		spoken.words.find((w) => charIndex >= w.start && charIndex < w.end) ??
		spoken.words.find((w) => w.start > charIndex) ??
		spoken.words[spoken.words.length - 1];
	return word?.wordIndex ?? null;
}

/**
 * Whether a word event can drive the highlight. Some engines report every word as the whole
 * utterance (position 0, full length). A real word event is about as long as the word it points
 * at (punctuation may be included), so an event much longer than that word carries no position.
 * A long single word ("Supercalifragilisticexpialidocious") is therefore still accepted.
 */
export function isUsableWordEvent(
	spoken: SpokenSentence,
	charIndex: number,
	charLength: number
): boolean {
	if (charLength <= 0) return true; // engines that report no length
	const word =
		spoken.words.find((w) => charIndex >= w.start && charIndex < w.end) ??
		spoken.words.find((w) => w.start > charIndex);
	if (!word) return false;
	const expectedLength = word.end - charIndex;
	return charLength <= expectedLength * 2 + PUNCTUATION_SLACK;
}

/** Characters a voice may include around a word (brackets, closing punctuation). */
const PUNCTUATION_SLACK = 4;

export function speechRate(wordsPerMinute: number): number {
	return Math.min(2, Math.max(0.5, wordsPerMinute / WORDS_PER_MINUTE_AT_RATE_1));
}

/**
 * macOS ships novelty voices (sound effects, singing) and old robotic ones that are no use for
 * reading papers aloud.
 */
const NOVELTY_VOICES =
	/^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Eddy|Flo|Fred|Good News|Grandma|Grandpa|Hysterical|Jester|Junior|Kathy|Organ|Pipe Organ|Ralph|Reed|Rocko|Sandy|Shelley|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i;

/** Default voice when present: it reports every word, so the highlight follows it exactly. */
const DEFAULT_VOICE = /^Karen\b/;

/**
 * Voices offered for reading, the default first. On-device English voices (without the novelty
 * ones) report every word, so the highlight follows them exactly; Google's network voices in Chrome
 * report none, so they are offered only when the system has no voice of its own.
 */
export function preferredVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
	const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
	const onDevice = english.filter(
		(voice) => voice.localService && !/google/i.test(voice.name) && !NOVELTY_VOICES.test(voice.name)
	);
	const candidates = onDevice.length > 0 ? onDevice : english;
	const score = (voice: SpeechSynthesisVoice) =>
		(DEFAULT_VOICE.test(voice.name) ? 8 : 0) +
		(/premium|enhanced|natural|neural/i.test(voice.name) ? 2 : 0) +
		(/^en-(us|gb)/i.test(voice.lang) ? 1 : 0);
	return candidates.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

/**
 * For voices that report no word events: when each word should be highlighted, in milliseconds
 * from the start of the utterance, assuming a steady speaking pace in characters per second.
 */
export function estimatedWordTimes(spoken: SpokenSentence, charactersPerSecond: number): number[] {
	return spoken.words.map((word) => (word.start / charactersPerSecond) * 1000);
}
