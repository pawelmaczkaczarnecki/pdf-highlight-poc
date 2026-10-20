import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';
import { clickWordInSpan } from './helpers';

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

test('a word with a hidden space after a ligature is one word ("confirmation")', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByTestId('word-box').first()).toBeInViewport();

	await clickWordInSpan(page, 'rmation) of research discoveries', 'con');

	await expect(page.getByTestId('announcer')).toContainText(': confirmation');
	// One box from "con" to "rmation", not a box ending after the ligature.
	await expect(page.getByTestId('word-box')).toHaveCount(1);
});

/** A one-page PDF with one sentence; `box` is the media box, `crop` the visible area. */
function pdfWithSentence(box: string, crop: string, y: number): Buffer {
	const content = `BT /F1 12 Tf 100 ${y} Td (Visible body sentence.) Tj ET`;
	return Buffer.from(
		'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
			'2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
			`3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[${box}]/CropBox[${crop}]` +
			'/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>endobj\n' +
			`4 0 obj<</Length ${content.length}>>stream\n${content}\nendstream endobj\n` +
			'5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
			'trailer<</Root 1 0 R>>\n%%EOF\n'
	);
}

for (const [name, box, crop, y] of [
	['an uncropped page', '0 0 600 300', '0 0 600 300', 150],
	['a page cropped to its upper half', '0 0 600 600', '0 300 600 600', 450]
] as const) {
	test(`text in the middle of ${name} is read, not taken for a header or footer`, async ({
		page
	}) => {
		await page.goto('/');
		await expect(page.getByTestId('word-box').first()).toBeVisible();
		await page.locator('input[type="file"]').setInputFiles({
			name: 'one-sentence.pdf',
			mimeType: 'application/pdf',
			buffer: pdfWithSentence(box, crop, y)
		});

		await expect(page.getByTestId('reading-status')).toContainText('word 1 of 3');
		await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
		await expect(page.getByTestId('word-box')).toBeVisible();
	});
}
