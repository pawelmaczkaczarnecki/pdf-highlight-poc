import { expect, test } from '@playwright/test';

test('accuracy report measures the page and its worst words can be inspected', async ({ page }) => {
	await page.goto('/');
	const report = page.getByTestId('accuracy-report');
	await expect(report.getByTestId('accuracy-median')).toBeVisible();

	const median = parseFloat((await report.getByTestId('accuracy-median').textContent())!);
	const within2Px = parseFloat((await report.getByTestId('accuracy-within-2px').textContent())!);
	// Thresholds from the sample PDF (median 1.0 px, 81% within 2 px on macOS Chromium), with
	// headroom because the text layer's fallback fonts differ between operating systems.
	expect(median).toBeLessThanOrEqual(1.5);
	expect(within2Px).toBeGreaterThanOrEqual(70);
	// Boxes that do not line up with word spaces are "not measured" rather than counted as good,
	// so a broken layout shows up as a low measured count.
	const measured = Number(await report.getByTestId('accuracy-measured').textContent());
	expect(measured).toBeGreaterThanOrEqual(600);

	const worstWord = report.getByRole('button').first();
	const status = page.getByTestId('reading-status');
	const before = await status.textContent();
	await worstWord.click();
	await expect(status).not.toHaveText(before!);
	await expect(page.getByTestId('word-box').first()).toBeVisible();
});
