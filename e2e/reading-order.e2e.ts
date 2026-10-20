import { expect, test } from './fixtures';
import { clickWordInSpan } from './helpers';

test('page 1 reads in layout order and never stops in a header or footer', async ({ page }) => {
	await page.goto('/');
	const announcer = page.getByTestId('announcer');
	await expect(announcer).toContainText('word 1 of');

	// Walk the page sentence by sentence and record the first word of each.
	const firstWords: string[] = [];
	for (let i = 0; i < 70; i++) {
		firstWords.push((await announcer.textContent())!.split(': ')[1]);
		const before = await announcer.textContent();
		await page.keyboard.press('Shift+ArrowRight');
		if ((await announcer.textContent()) === before) break; // last sentence reached
	}

	// Section label, title and author come first; the article text follows the summary.
	expect(firstWords.slice(0, 3)).toEqual(['Essay', 'Why', 'John']);
	expect(firstWords.indexOf('Summary')).toBeLessThan(firstWords.indexOf('Published'));
	// Running header ("Open access…") and footers ("PLoS Medicine | www…", "August 2005…") are
	// skipped. "PLoS" appears once: "PLoS Med 2(8): e124." in the citation box, which is content.
	expect(firstWords).not.toContain('August');
	expect(firstWords).not.toContain('Open');
	expect(firstWords.filter((word) => word === 'PLoS')).toHaveLength(1);
	expect(firstWords[firstWords.indexOf('PLoS') - 1]).toBe('Citation');
});

test('a drop cap reads as part of its word ("Published")', async ({ page }) => {
	await page.goto('/');
	await clickWordInSpan(page, 'ublished research', 'ublished');
	await expect(page.getByTestId('announcer')).toContainText(': Published');
});

test('a sentence that continues in the next column is one sentence', async ({ page }) => {
	await page.goto('/');
	await clickWordInSpan(page, 'disappointment. Refutation and', 'Refutation');
	const span = page.locator('.textLayer span', { hasText: 'Here I will examine the key' }).first();
	await span.scrollIntoViewIfNeeded();
	await clickWordInSpan(page, 'Here I will examine the key', 'key');
	// The next word is at the top of the next column, in the same sentence.
	await page.keyboard.press('ArrowRight');
	await expect(page.getByTestId('announcer')).toContainText(': factors');
	expect(await page.getByTestId('sentence-box').count()).toBeGreaterThan(1);
});
