import { expect, test, type Locator, type Page } from './fixtures';
import { clickWordInSpan } from './helpers';

async function centerOf(locator: Locator) {
	const box = (await locator.boundingBox())!;
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function wordBoxCenter(page: Page) {
	return centerOf(page.getByTestId('word-box'));
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('word-box')).toHaveCount(1);
});

test('clicking a word starts reading from that word', async ({ page }) => {
	const clicked = await clickWordInSpan(page, 'Refutation and', 'Refutation');

	const center = await wordBoxCenter(page);
	expect(Math.abs(center.x - clicked.x)).toBeLessThan(2);
	expect(Math.abs(center.y - clicked.y)).toBeLessThan(2);
});

test('arrow keys move by word and Shift+arrow by sentence', async ({ page }) => {
	await clickWordInSpan(page, 'Refutation and', 'Refutation');
	const status = page.getByTestId('reading-status');
	const wordNumber = async () => Number((await status.textContent())!.match(/word (\d+)/)![1]);

	const start = await wordNumber();
	await page.keyboard.press('ArrowRight');
	expect(await wordNumber()).toBe(start + 1);

	// From the second word, Shift+← goes back to the start of the sentence ("Refutation").
	await page.keyboard.press('Shift+ArrowLeft');
	expect(await wordNumber()).toBe(start);

	await page.keyboard.press('Shift+ArrowRight');
	expect(await wordNumber()).toBeGreaterThan(start + 1);
});

test('play advances the highlighted word over time and pause stops it', async ({ page }) => {
	const before = await wordBoxCenter(page);
	await page.getByRole('button', { name: 'Play' }).click();
	await expect.poll(async () => (await wordBoxCenter(page)).x).not.toBe(before.x);

	await page.getByRole('button', { name: 'Pause' }).click();
	const paused = await wordBoxCenter(page);
	await page.waitForTimeout(800);
	expect(await wordBoxCenter(page)).toEqual(paused);
});

test('changing the page rebuilds the text and highlights for the new page', async ({ page }) => {
	await page.getByRole('button', { name: 'Next page' }).click();
	await expect(page.getByTestId('page-indicator')).toHaveText('Page 2 / 6');
	await expect(page.getByTestId('word-box')).toHaveCount(1);
	await expect(page.getByTestId('word-box')).toBeInViewport();
	await expect(page.getByTestId('reading-status')).toContainText(/word \d+ of \d+/);
});

test('rapid page changes end on the last requested page without errors', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});

	const next = page.getByRole('button', { name: 'Next page' });
	for (let i = 0; i < 4; i++) await next.click();

	await expect(page.getByTestId('page-indicator')).toHaveText('Page 5 / 6');
	// The text layer must be page 5's text (its page number in the footer)…
	await expect(page.locator('.textLayer')).toContainText('0700');
	// …and the canvas must show the same page: the accuracy check compares boxes from the text
	// layer with ink on the canvas, so boxes over another page's ink give a large median error.
	const median = page.getByTestId('accuracy-median-text-layer');
	await expect(median).toBeVisible();
	expect(parseFloat((await median.textContent())!)).toBeLessThanOrEqual(1.5);
	expect(errors).toEqual([]);
});

test('"Show all word boxes" outlines every word on the page', async ({ page }) => {
	const total = Number(
		(await page.getByTestId('reading-status').textContent())!.match(/word \d+ of (\d+)/)![1]
	);
	await page.getByLabel('Show all word boxes').check();
	// A word hyphenated across two lines has a box on each line, so at least one box per word.
	expect(await page.locator('.highlightLayer .outline').count()).toBeGreaterThanOrEqual(total);
});
