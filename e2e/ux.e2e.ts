import { expect, test } from '@playwright/test';

/** A one-page PDF with no text at all, like a scanned page without OCR. */
const PDF_WITHOUT_TEXT = Buffer.from(
	'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
		'2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
		'3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]>>endobj\n' +
		'trailer<</Root 1 0 R>>\n%%EOF\n'
);

test('a page without text says so instead of looking like it is still loading', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByTestId('word-box')).toHaveCount(1);

	await page.locator('input[type="file"]').setInputFiles({
		name: 'scan.pdf',
		mimeType: 'application/pdf',
		buffer: PDF_WITHOUT_TEXT
	});

	await expect(page.getByTestId('reading-status')).toContainText('No selectable text');
	await expect(page.getByRole('button', { name: 'Play' })).toBeDisabled();
});

test('the screen-reader announcement stays quiet while playing', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('word-box')).toHaveCount(1);
	const announcer = page.getByTestId('announcer');

	await page.getByRole('button', { name: 'Play' }).click();
	await expect(announcer).toHaveText('Playing');
	await page.waitForTimeout(1000); // several words at 180 wpm
	await expect(announcer).toHaveText('Playing');

	await page.getByRole('button', { name: 'Pause' }).click();
	await expect(announcer).toContainText(/Paused at word \d+ of \d+/);
});

test('on a narrow screen only the PDF area scrolls sideways, not the controls', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 800 });
	await page.goto('/');
	await expect(page.getByTestId('word-box')).toHaveCount(1);

	const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
	expect(pageWidth).toBeLessThanOrEqual(390);
	await expect(page.getByRole('button', { name: 'Play' })).toBeInViewport();

	// Every group of controls wraps inside the toolbar's padding instead of running past it
	// (font metrics differ between machines, so "just fits" is not good enough).
	const overflowing = await page.evaluate(() => {
		const toolbar = document.querySelector('header')!;
		const contentRight =
			toolbar.getBoundingClientRect().right - parseFloat(getComputedStyle(toolbar).paddingRight);
		return [...toolbar.children]
			.filter((group) => group.getBoundingClientRect().right > contentRight + 0.5)
			.map((group) => group.getAttribute('aria-label') ?? group.textContent!.trim().slice(0, 20));
	});
	expect(overflowing).toEqual([]);
});
