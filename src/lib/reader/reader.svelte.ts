import {
	splitSentences,
	splitWords,
	type Sentence,
	type TextRange,
	type Word
} from '#lib/text/segment.js';
import { nextSentenceStart, previousSentenceStart, wordAtOffset } from './navigation.js';

const MS_PER_MINUTE = 60_000;

/**
 * The reading position on the current page. In the real product a TTS engine would move it;
 * here a timer stands in for the engine, because the PoC is about where the highlight lands.
 */
export class Reader {
	sentences = $state<Sentence[]>([]);
	words = $state<Word[]>([]);
	wordIndex = $state(0);
	playing = $state(false);
	wordsPerMinute = $state(180);

	currentWord = $derived<Word | null>(this.words[this.wordIndex] ?? null);
	currentSentence = $derived<Sentence | null>(
		this.currentWord ? (this.sentences[this.currentWord.sentenceIndex] ?? null) : null
	);

	#timer: ReturnType<typeof setTimeout> | null = null;

	loadText(text: string, hiddenSpaces: TextRange[] = []): void {
		this.pause();
		this.sentences = splitSentences(text);
		this.words = splitWords(text, this.sentences, hiddenSpaces);
		this.wordIndex = 0;
	}

	clear(): void {
		this.pause();
		this.sentences = [];
		this.words = [];
		this.wordIndex = 0;
	}

	play(): void {
		if (this.words.length === 0) return;
		if (this.wordIndex >= this.words.length - 1) this.wordIndex = 0;
		this.playing = true;
		this.#scheduleNextWord();
	}

	pause(): void {
		this.playing = false;
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
	}

	setWordsPerMinute(wordsPerMinute: number): void {
		this.wordsPerMinute = wordsPerMinute;
		// The step already waiting was timed for the old speed; start it again at the new one.
		if (this.playing) this.#scheduleNextWord();
	}

	togglePlay(): void {
		if (this.playing) this.pause();
		else this.play();
	}

	nextWord(): void {
		this.#goTo(this.wordIndex + 1);
	}

	previousWord(): void {
		this.#goTo(this.wordIndex - 1);
	}

	nextSentence(): void {
		this.#goTo(nextSentenceStart(this.words, this.wordIndex));
	}

	previousSentence(): void {
		this.#goTo(previousSentenceStart(this.words, this.wordIndex));
	}

	goToWord(index: number): void {
		this.#goTo(index);
	}

	goToOffset(offset: number): void {
		const index = wordAtOffset(this.words, offset);
		if (index !== null) this.#goTo(index);
	}

	#goTo(index: number): void {
		if (index < 0 || index >= this.words.length) return;
		this.wordIndex = index;
		// Restart the timer so a manual jump gets a full word duration before moving on.
		if (this.playing) this.#scheduleNextWord();
	}

	#scheduleNextWord(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			if (this.wordIndex >= this.words.length - 1) {
				this.pause();
				return;
			}
			this.wordIndex += 1;
			this.#scheduleNextWord();
		}, MS_PER_MINUTE / this.wordsPerMinute);
	}
}
