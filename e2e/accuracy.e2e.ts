import { expect, test } from './fixtures';

test('accuracy report measures the page and its worst words can be inspected', async ({ page }) => {
	await page.goto('/');
	const report = page.getByTestId('accuracy-report');
	await expect(report.getByTestId('accuracy-median-text-layer')).toBeVisible();

	const median = parseFloat(
		(await report.getByTestId('accuracy-median-text-layer').textContent())!
	);
	const within2Px = parseFloat(
		(await report.getByTestId('accuracy-within-2px-text-layer').textContent())!
	);
	// Thresholds from the sample PDF (median 1.0 px, 81% within 2 px on macOS Chromium), with
	// headroom because the text layer's fallback fonts differ between operating systems.
	expect(median).toBeLessThanOrEqual(1.5);
	expect(within2Px).toBeGreaterThanOrEqual(70);
	// Boxes that do not line up with word spaces are "not measured" rather than counted as good;
	// make sure most words are still measured, so the median is based on a large sample.
	const measured = Number(await report.getByTestId('accuracy-measured').textContent());
	expect(measured).toBeGreaterThanOrEqual(600);

	const worstWord = report.getByRole('button').first();
	const status = page.getByTestId('reading-status');
	const before = await status.textContent();
	await worstWord.click();
	await expect(status).not.toHaveText(before!);
	await expect(page.getByTestId('word-box').first()).toBeVisible();
});

test('glyph-position boxes are at least as accurate as text-layer boxes on the same words', async ({
	page
}) => {
	await page.goto('/');
	const report = page.getByTestId('accuracy-report');
	await expect(report.getByTestId('accuracy-median-glyphs')).toBeVisible();
	const value = async (id: string) => parseFloat((await report.getByTestId(id).textContent())!);

	expect(await value('accuracy-glyph-words')).toBeGreaterThan(500);
	expect(await value('accuracy-median-glyphs')).toBeLessThanOrEqual(
		await value('accuracy-median-text-layer')
	);
	expect(await value('accuracy-within-2px-glyphs')).toBeGreaterThanOrEqual(
		await value('accuracy-within-2px-text-layer')
	);
	expect(await value('accuracy-max-glyphs')).toBeLessThanOrEqual(
		await value('accuracy-max-text-layer')
	);
});
