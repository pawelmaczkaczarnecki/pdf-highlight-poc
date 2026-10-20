import {
	splitSentences,
	splitWords,
	type Sentence,
	type TextRange,
	type Word
} from '#lib/text/segment.js';
import type { PageText } from '#lib/text/pageText.js';
import { nextSentenceStart, previousSentenceStart, wordAtOffset } from './navigation.js';
import { orderSentences } from './readingOrder.js';
import {
	estimatedWordTimes,
	isUsableWordEvent,
	speechRate,
	spokenSentenceFrom,
	wordAtSpokenOffset
} from './speech.js';

const MS_PER_MINUTE = 60_000;
/** A voice that reports no word this long after it starts speaking gets estimated word timing. */
const WORD_EVENT_GRACE_MS = 400;
/** If speech has not even started by then, the voice is not working: read silently instead. */
const SPEECH_START_TIMEOUT_MS = 3000;
/** Starting guess for estimated timing; refined from how long each sentence actually took. */
const INITIAL_CHARACTERS_PER_SECOND = 15;

/** Silent: a timer moves the highlight. Voice: the browser speaks and its word events move it. */
export type Narration = 'silent' | 'voice';

function speechAvailable(): boolean {
	return typeof window !== 'undefined' && window.speechSynthesis !== undefined;
}

/**
 * The reading position on the current page. In the real product a TTS engine would move it;
 * here the browser's voice moves it (see #speakFrom), or a timer when reading silently.
 */
export class Reader {
	sentences = $state<Sentence[]>([]);
	words = $state<Word[]>([]);
	wordIndex = $state(0);
	playing = $state(false);
	wordsPerMinute = $state(180);
	narration = $state<Narration>('silent');
	voiceURI = $state<string | null>(null);
	/** Shown when a voice had to be given up (e.g. it reports no word timing). */
	narrationNotice = $state<string | null>(null);

	currentWord = $derived<Word | null>(this.words[this.wordIndex] ?? null);
	currentSentence = $derived<Sentence | null>(
		this.currentWord ? (this.sentences[this.currentWord.sentenceIndex] ?? null) : null
	);

	#timer: ReturnType<typeof setTimeout> | null = null;
	#text = '';
	/** Increases with every utterance, so events from a cancelled one are ignored. */
	#speechRun = 0;
	/** Measured speaking pace of the current voice at the current rate (for estimated timing). */
	#charactersPerSecond = INITIAL_CHARACTERS_PER_SECOND;

	/**
	 * @param hiddenSpaces whitespace that is not a word boundary on the page (after ligatures)
	 */
	loadText(pageText: PageText, hiddenSpaces: TextRange[] = []): void {
		this.pause();
		this.#text = pageText.text;
		this.sentences = orderSentences(splitSentences(pageText.text), pageText.blocks);
		this.words = splitWords(pageText.text, this.sentences, [...hiddenSpaces, ...pageText.joins]);
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
		this.#continueFromCurrentWord();
	}

	pause(): void {
		this.playing = false;
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		this.#stopSpeaking();
	}

	setNarration(narration: Narration, voiceURI: string | null = this.voiceURI): void {
		this.narration = narration;
		this.voiceURI = voiceURI;
		this.narrationNotice = null;
		this.#charactersPerSecond = INITIAL_CHARACTERS_PER_SECOND * speechRate(this.wordsPerMinute);
		if (this.playing) this.#continueFromCurrentWord();
	}

	setWordsPerMinute(wordsPerMinute: number): void {
		this.wordsPerMinute = wordsPerMinute;
		this.#charactersPerSecond = INITIAL_CHARACTERS_PER_SECOND * speechRate(wordsPerMinute);
		// The step (or utterance) already running was timed for the old speed; restart it.
		if (this.playing) this.#continueFromCurrentWord();
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
		// Restart from the new word: a full word duration, or speech from this word on.
		if (this.playing) this.#continueFromCurrentWord();
	}

	#continueFromCurrentWord(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		this.#stopSpeaking();
		if (this.narration === 'voice' && speechAvailable()) this.#speakFrom(this.wordIndex);
		else this.#scheduleNextWord();
	}

	/**
	 * Speaks the rest of the current sentence. The voice's word events move the highlight; voices
	 * that send none (e.g. Google's network voices in Chrome) get word times estimated from the
	 * measured pace, while each sentence still starts exactly with the voice.
	 */
	#speakFrom(index: number): void {
		const run = ++this.#speechRun;
		const isCurrent = () => run === this.#speechRun && this.playing;
		const spoken = spokenSentenceFrom(this.#text, this.words, index);
		const utterance = new SpeechSynthesisUtterance(spoken.text);
		utterance.voice = speechSynthesis.getVoices().find((v) => v.voiceURI === this.voiceURI) ?? null;
		utterance.rate = speechRate(this.wordsPerMinute);
		let heardWord = false;
		let estimating = false;
		let startedAt: number | null = null;

		const startEstimating = () => {
			if (estimating || startedAt === null) return;
			estimating = true;
			this.narrationNotice = 'This voice does not report words, so word timing is estimated.';
			const elapsed = performance.now() - startedAt;
			estimatedWordTimes(spoken, this.#charactersPerSecond).forEach((at, i) => {
				setTimeout(
					() => {
						if (isCurrent()) this.wordIndex = spoken.words[i].wordIndex;
					},
					Math.max(0, at - elapsed)
				);
			});
		};

		utterance.onstart = () => {
			startedAt = performance.now();
			setTimeout(() => {
				if (isCurrent() && !heardWord) startEstimating();
			}, WORD_EVENT_GRACE_MS);
		};
		utterance.onboundary = (event) => {
			if (!isCurrent() || event.name !== 'word' || estimating) return;
			// Some engines report every word as the whole utterance; then estimate instead.
			if (!isUsableWordEvent(spoken, event.charIndex, event.charLength)) {
				startEstimating();
				return;
			}
			heardWord = true;
			const wordIndex = wordAtSpokenOffset(spoken, event.charIndex);
			if (wordIndex !== null) this.wordIndex = wordIndex;
		};
		utterance.onerror = (event) => {
			// Our own cancel (pause, jump, voice change) also ends in an error; ignore those.
			if (!isCurrent() || event.error === 'interrupted' || event.error === 'canceled') return;
			this.narrationNotice = `Reading aloud stopped (${event.error}), so reading continues silently.`;
			this.narration = 'silent';
			this.#continueFromCurrentWord();
		};
		utterance.onend = () => {
			if (!isCurrent()) return;
			if (estimating && startedAt !== null) this.#learnPace(spoken.text.length, startedAt);
			const last = spoken.words[spoken.words.length - 1]?.wordIndex ?? index;
			if (last >= this.words.length - 1) {
				this.pause();
				return;
			}
			this.wordIndex = last + 1;
			this.#speakFrom(last + 1);
		};
		speechSynthesis.speak(utterance);

		setTimeout(() => {
			if (!isCurrent() || startedAt !== null) return;
			this.narrationNotice = 'This voice did not start speaking, so reading continues silently.';
			this.narration = 'silent';
			this.#continueFromCurrentWord();
		}, SPEECH_START_TIMEOUT_MS);
	}

	/** Averages in how fast the last sentence was actually spoken. */
	#learnPace(characters: number, startedAt: number): void {
		const seconds = (performance.now() - startedAt) / 1000;
		if (seconds < 0.5) return;
		this.#charactersPerSecond = (this.#charactersPerSecond + characters / seconds) / 2;
	}

	#stopSpeaking(): void {
		this.#speechRun++;
		if (speechAvailable()) speechSynthesis.cancel();
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
