import { expect, testWithFakeSpeech as test, type FakeSpeech, type Page } from './fixtures';
import { clickWordInSpan } from './helpers';

const wordNumber = async (page: Page) =>
	Number((await page.getByTestId('reading-status').textContent())!.match(/word (\d+)/)![1]);

/** Fires events on the utterance the app spoke last. */
async function onLastUtterance(page: Page, script: string) {
	await page.evaluate((script) => {
		const utterance = (window.speechSynthesis as unknown as FakeSpeech).spoken.at(-1)!;
		new Function('u', script)(utterance);
	}, script);
}

async function startSpeaking(page: Page) {
	await page.goto('/');
	await expect(page.getByTestId('word-box').first()).toBeInViewport();
	await page.getByTestId('voice').selectOption('karen');
	// Start in a sentence of several words ("Refutation and controversy is seen …").
	await clickWordInSpan(page, 'disappointment. Refutation and', 'Refutation');
	await page.getByRole('button', { name: 'Play' }).click();
	await expect
		.poll(() =>
			page.evaluate(() => (window.speechSynthesis as unknown as FakeSpeech).spoken.length)
		)
		.toBe(1);
}

test('reading aloud is off until a voice is chosen, even when voices load late', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByTestId('voice')).toHaveValue('silent');
	await page.getByRole('button', { name: 'Play' }).click();
	await page.evaluate(() =>
		(window.speechSynthesis as unknown as FakeSpeech).fire('voiceschanged')
	);

	await expect(page.getByTestId('voice')).toHaveValue('silent');
	expect(
		await page.evaluate(() => (window.speechSynthesis as unknown as FakeSpeech).spoken.length)
	).toBe(0);
});

test('word events from the voice move the highlight', async ({ page }) => {
	await startSpeaking(page);
	const first = await wordNumber(page);
	await onLastUtterance(
		page,
		`u.onstart(); const i = u.text.indexOf(' ') + 1; u.onboundary({ name: 'word', charIndex: i, charLength: 3 });`
	);
	await expect.poll(() => wordNumber(page)).toBe(first + 1);
});

test('an event claiming the whole sentence switches to estimated timing', async ({ page }) => {
	await startSpeaking(page);
	await onLastUtterance(
		page,
		`u.onstart(); u.onboundary({ name: 'word', charIndex: 0, charLength: u.text.length });`
	);
	await expect(page.getByText('word timing is estimated')).toBeVisible();
});

test('a speech error after the first word continues silently from the current word', async ({
	page
}) => {
	await startSpeaking(page);
	await onLastUtterance(page, `u.onstart(); u.onerror({ error: 'synthesis-failed' });`);

	await expect(page.getByText('Reading aloud stopped (synthesis-failed)')).toBeVisible();
	await expect(page.getByTestId('voice')).toHaveValue('silent');
	await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
	const stuckAt = await wordNumber(page);
	await expect.poll(() => wordNumber(page)).toBeGreaterThan(stuckAt); // the timer took over
});

test('pause cancels speech and late events from that utterance change nothing', async ({
	page
}) => {
	await startSpeaking(page);
	await onLastUtterance(page, 'u.onstart();');
	await page.getByRole('button', { name: 'Pause' }).click();
	expect(
		await page.evaluate(() => (window.speechSynthesis as unknown as FakeSpeech).cancels)
	).toBeGreaterThan(0);

	const paused = await wordNumber(page);
	await onLastUtterance(
		page,
		`const i = u.text.indexOf(' ') + 1; u.onboundary({ name: 'word', charIndex: i, charLength: 3 }); u.onend();`
	);
	expect(await wordNumber(page)).toBe(paused);
	await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});
