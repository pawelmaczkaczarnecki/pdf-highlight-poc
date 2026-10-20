import { expect, test } from '@playwright/test';
import { clickWordInSpan } from './helpers';

// Behaviours that depend on box geometry, checked with glyph-position boxes (the only mode).
test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('word-box').first()).toBeInViewport();
});

test('B: a click on the right half of a last letter selects that word', async ({ page }) => {
	const span = page.locator('.textLayer span', { hasText: 'Refutation and' }).first();
	await span.scrollIntoViewIfNeeded();
	const target = await span.evaluate((element) => {
		const node = element.firstChild!;
		const last = node.textContent!.indexOf('Refutation') + 'Refutation'.length - 1;
		const range = document.createRange();
		range.setStart(node, last);
		range.setEnd(node, last + 1);
		const letter = range.getBoundingClientRect();
		return { x: letter.left + letter.width * 0.8, y: letter.top + letter.height / 2 };
	});
	await page.mouse.click(target.x, target.y);
	await expect(page.getByTestId('announcer')).toContainText(': Refutation');
});

test('B: a word with a hidden space after a ligature is one box', async ({ page }) => {
	await clickWordInSpan(page, 'rmation) of research discoveries', 'con');
	await expect(page.getByTestId('announcer')).toContainText(': confirmation');
	await expect(page.getByTestId('word-box')).toHaveCount(1);
});

test('B: a sentence across lines has one band per line', async ({ page }) => {
	await clickWordInSpan(page, 'Refutation and', 'Refutation');
	expect(await page.getByTestId('sentence-box').count()).toBeGreaterThan(1);
});

test('B: a word hyphenated across lines has a box on each line', async ({ page }) => {
	for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Next page' }).click();
	await expect(page.getByTestId('page-indicator')).toHaveText('Page 6 / 6');
	await clickWordInSpan(page, 'would pose a challenge for hypothesis-', 'hypothesis');
	await expect(page.getByTestId('word-box')).toHaveCount(2);
});

test('B: changing pages while playing keeps boxes on the new page’s ink', async ({ page }) => {
	await page.getByRole('button', { name: 'Play' }).click();
	const next = page.getByRole('button', { name: 'Next page' });
	for (let i = 0; i < 3; i++) await next.click();
	await expect(page.getByTestId('page-indicator')).toHaveText('Page 4 / 6');
	const median = page.getByTestId('accuracy-median-b');
	await expect(median).toBeVisible();
	expect(parseFloat((await median.textContent())!)).toBeLessThanOrEqual(1.5);
});
