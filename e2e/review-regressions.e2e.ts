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

test('PDF.js helper files (image decoders, standard fonts, CJK maps) are deployed', async ({
	request
}) => {
	for (const path of [
		'/pdfjs/wasm/openjpeg.wasm',
		'/pdfjs/standard_fonts/FoxitSerif.pfb',
		'/pdfjs/cmaps/UniJIS-UCS2-H.bcmap'
	]) {
		const response = await request.get(path);
		expect(response.status(), path).toBe(200);
	}
});

test('the demo opens with the highlight on screen', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('word-box').first()).toBeInViewport();
});

test('the view follows the highlight when it moves off screen', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('word-box').first()).toBeInViewport();

	// Jump far ahead in the text, past what fits on the screen.
	for (let i = 0; i < 20; i++) await page.keyboard.press('Shift+ArrowRight');

	const word = page.getByTestId('word-box').first();
	await expect(word).toBeInViewport();
	// Not hidden under the sticky toolbar either.
	const toolbarBottom = (await page.locator('header').boundingBox())!;
	expect((await word.boundingBox())!.y).toBeGreaterThanOrEqual(
		toolbarBottom.y + toolbarBottom.height
	);
});

test('on a narrow screen the first highlight is not hidden under the toolbar', async ({ page }) => {
	await page.setViewportSize({ width: 412, height: 660 });
	await page.goto('/');
	const word = page.getByTestId('word-box').first();
	await expect(word).toBeInViewport();
	const toolbar = (await page.locator('header').boundingBox())!;
	expect((await word.boundingBox())!.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height);
});
