import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Reader } from './reader.svelte.js';

describe('Reader playback timing', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('applies a new speed to the step already scheduled, not only to later ones', () => {
		const reader = new Reader();
		reader.loadText('one two three four five six.');
		reader.wordsPerMinute = 120; // 500 ms per word
		reader.play();

		vi.advanceTimersByTime(50);
		reader.setWordsPerMinute(300); // 200 ms per word, counted from now

		vi.advanceTimersByTime(199);
		expect(reader.wordIndex).toBe(0);
		vi.advanceTimersByTime(1);
		expect(reader.wordIndex).toBe(1);
		reader.pause();
	});
});
