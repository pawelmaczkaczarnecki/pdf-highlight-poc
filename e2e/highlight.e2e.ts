import { expect, test, type Page } from './fixtures';
import { clickWordInSpan } from './helpers';

interface InkEdges {
	boxLeft: number;
	boxRight: number;
	inkLeft: number | null;
	inkRight: number | null;
}

/**
 * Independent accuracy check: reads the rendered canvas pixels (what the user actually sees)
 * and finds where the word's ink starts and ends. The box comes from the text layer, so this
 * does not just re-measure the same DOM range.
 *
 * It starts at the middle of the box and walks outwards until it meets a blank gap at least as
 * wide as `minGapPx` (a space between words), so the result does not depend on the box edges.
 */
async function measureInkAround(page: Page, testId: string, minGapPx: number) {
	return page.evaluate(
		({ testId, minGapPx }): InkEdges => {
			const SEARCH_PX = 40;
			const canvas = document.querySelector('canvas')!;
			const origin = canvas.parentElement!.getBoundingClientRect();
			const box = document.querySelector(`[data-testid="${testId}"]`)!.getBoundingClientRect();
			const ratio = canvas.width / origin.width;
			const context = canvas.getContext('2d')!;

			const left = box.left - origin.left;
			const right = box.right - origin.left;
			// Skip the top and bottom of the box so neighbouring lines are not counted.
			const top = box.top - origin.top + box.height * 0.15;
			const bottom = box.bottom - origin.top - box.height * 0.15;

			const x0 = Math.max(0, Math.floor((left - SEARCH_PX) * ratio));
			const x1 = Math.min(canvas.width, Math.ceil((right + SEARCH_PX) * ratio));
			const y0 = Math.floor(top * ratio);
			const y1 = Math.ceil(bottom * ratio);
			const { data, width, height } = context.getImageData(x0, y0, x1 - x0, y1 - y0);

			const hasInk = (column: number) => {
				for (let y = 0; y < height; y++) {
					const i = (y * width + column) * 4;
					// Anti-aliased letter edges are light grey, so anything clearly darker than white is ink.
					if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 220) return true;
				}
				return false;
			};

			const minGap = Math.ceil(minGapPx * ratio);
			const walk = (from: number, step: 1 | -1): number | null => {
				let lastInk: number | null = null;
				let blankRun = 0;
				for (let x = from; x >= 0 && x < width && blankRun < minGap; x += step) {
					if (hasInk(x)) {
						lastInk = x;
						blankRun = 0;
					} else {
						blankRun++;
					}
				}
				return lastInk;
			};

			const middle = Math.round(((left + right) / 2) * ratio) - x0;
			const inkLeft = walk(middle, -1);
			const inkRight = walk(middle, 1);
			const toCss = (column: number) => (x0 + column) / ratio;

			return {
				boxLeft: left,
				boxRight: right,
				inkLeft: inkLeft === null ? null : toCss(inkLeft),
				inkRight: inkRight === null ? null : toCss(inkRight + 1)
			};
		},
		{ testId, minGapPx }
	);
}

test('highlights the current sentence and word on the rendered page', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByTestId('word-box')).toHaveCount(1);
	// "Refutation and controversy … research [4,5]." spans several lines: one band per line.
	await clickWordInSpan(page, 'Refutation and', 'Refutation');
	await expect(page.getByTestId('sentence-box').first()).toBeVisible();
	expect(await page.getByTestId('sentence-box').count()).toBeGreaterThan(1);
});

test('word box edges match the ink of a body-text word on the canvas', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('word-box')).toHaveCount(1);
	await clickWordInSpan(page, 'controversy is seen across the', 'range');

	// A gap of 3 px is wider than the space between letters and narrower than a word space here.
	const edges = await measureInkAround(page, 'word-box', 3);
	expect(edges.inkLeft).not.toBeNull();
	expect(edges.inkRight).not.toBeNull();

	const MAX_EDGE_ERROR_PX = 2;
	expect(Math.abs(edges.inkLeft! - edges.boxLeft)).toBeLessThanOrEqual(MAX_EDGE_ERROR_PX);
	expect(Math.abs(edges.inkRight! - edges.boxRight)).toBeLessThanOrEqual(MAX_EDGE_ERROR_PX);
});
