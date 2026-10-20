import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('a file opened while the sample is still loading is not replaced by the sample', async ({
	page
}) => {
	// Hold the sample PDF back so the user's file finishes loading first.
	await page.route('**/sample.pdf', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 1500));
		await route.continue();
	});
	await page.goto('/');

	await page.locator('input[type="file"]').setInputFiles({
		name: 'my-paper.pdf',
		mimeType: 'application/pdf',
		buffer: readFileSync('static/sample.pdf')
	});
	await expect(page.getByTestId('reading-status')).toContainText('my-paper.pdf');

	// Let the delayed sample finish; the user's file must stay open.
	await page.waitForTimeout(2500);
	await expect(page.getByTestId('reading-status')).toContainText('my-paper.pdf');
});

test('clicking the right half of a word’s last letter selects that word', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('word-box')).toHaveCount(1);

	const span = page.locator('.textLayer span', { hasText: 'Refutation and' }).first();
	await span.scrollIntoViewIfNeeded();
	const target = await span.evaluate((element) => {
		const node = element.firstChild!;
		const lastLetter = node.textContent!.indexOf('Refutation') + 'Refutation'.length - 1;
		const range = document.createRange();
		range.setStart(node, lastLetter);
		range.setEnd(node, lastLetter + 1);
		const letter = range.getBoundingClientRect();
		const wordRange = document.createRange();
		wordRange.setStart(node, lastLetter - 9);
		wordRange.setEnd(node, lastLetter + 1);
		const word = wordRange.getBoundingClientRect();
		return {
			x: letter.left + letter.width * 0.8,
			y: letter.top + letter.height / 2,
			wordCenterX: word.left + word.width / 2
		};
	});
	await page.mouse.click(target.x, target.y);

	const box = (await page.getByTestId('word-box').boundingBox())!;
	expect(Math.abs(box.x + box.width / 2 - target.wordCenterX)).toBeLessThan(2);
});

test('Space on a focused button activates the button instead of toggling playback', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByTestId('word-box')).toHaveCount(1);

	await page.getByRole('button', { name: 'Next page' }).focus();
	await page.keyboard.press('Space');

	await expect(page.getByTestId('page-indicator')).toHaveText('Page 2 / 6');
	await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});
