import { test as base } from '@playwright/test';

export { expect, type Locator, type Page } from '@playwright/test';

/**
 * Every test runs without the browser's speech engine, so reading is driven by the silent timer
 * and does not depend on which voices the machine has installed.
 */
export const test = base.extend({
	page: async ({ page }, use) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
		});
		await use(page);
	}
});

/** A scripted stand-in for the browser's speech engine: tests decide which events it fires. */
export interface FakeSpeech {
	spoken: Array<{
		text: string;
		onstart?: () => void;
		onboundary?: (event: { name: string; charIndex: number; charLength: number }) => void;
		onerror?: (event: { error: string }) => void;
		onend?: () => void;
	}>;
	cancels: number;
	fire: (type: string) => void;
}

/**
 * Tests with a fake speech engine and one voice ("Karen"). It checks how the app reacts to engine
 * events; it is not evidence that a real system voice works.
 */
export const testWithFakeSpeech = base.extend({
	page: async ({ page }, use) => {
		await page.addInitScript(() => {
			const listeners: Record<string, Array<() => void>> = {};
			const voice = { name: 'Karen', lang: 'en-AU', localService: true, voiceURI: 'karen' };
			const fake = {
				spoken: [] as unknown[],
				cancels: 0,
				getVoices: () => [voice],
				speak(utterance: unknown) {
					this.spoken.push(utterance);
				},
				cancel() {
					this.cancels++;
				},
				addEventListener(type: string, listener: () => void) {
					(listeners[type] ??= []).push(listener);
				},
				removeEventListener(type: string, listener: () => void) {
					listeners[type] = (listeners[type] ?? []).filter((l) => l !== listener);
				},
				fire(type: string) {
					(listeners[type] ?? []).forEach((listener) => listener());
				}
			};
			class FakeUtterance {
				voice: unknown = null;
				rate = 1;
				constructor(public text: string) {}
			}
			Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
			Object.defineProperty(window, 'SpeechSynthesisUtterance', {
				value: FakeUtterance,
				configurable: true
			});
		});
		await use(page);
	}
});
