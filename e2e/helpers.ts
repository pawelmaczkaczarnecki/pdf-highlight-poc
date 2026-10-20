import type { Page } from '@playwright/test';

/** Clicks a word inside a text-layer span by its position in the span's text. */
export async function clickWordInSpan(page: Page, spanText: string, word: string) {
	const span = page.locator('.textLayer span', { hasText: spanText }).first();
	// Mouse clicks only reach elements inside the viewport.
	await span.scrollIntoViewIfNeeded();
	const point = await span.evaluate((element, word) => {
		const node = element.firstChild!;
		const start = node.textContent!.indexOf(word);
		const range = document.createRange();
		range.setStart(node, start);
		range.setEnd(node, start + word.length);
		const rect = range.getBoundingClientRect();
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
	}, word);
	await page.mouse.click(point.x, point.y);
	return point;
}
