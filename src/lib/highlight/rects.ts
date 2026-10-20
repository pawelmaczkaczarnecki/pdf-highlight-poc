import type { PageText } from '#lib/text/pageText.js';
import { sliceByItems } from '#lib/text/pageText.js';
import type { TextRange } from '#lib/text/segment.js';

/** A rectangle in page pixels (relative to the page's top-left corner). */
export interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/**
 * Measures where a character range is drawn, using the native PDF.js text-layer spans.
 * Each span is stretched by PDF.js to the exact width of its PDF text item, and the browser
 * lays out the characters inside it, so `Range.getClientRects()` gives their positions.
 */
export function measureRange(
	pageText: PageText,
	textDivs: HTMLElement[],
	pageElement: HTMLElement,
	range: TextRange
): Box[] {
	const origin = pageElement.getBoundingClientRect();
	const boxes: Box[] = [];

	for (const slice of sliceByItems(pageText, range)) {
		const textNode = textDivs[slice.itemIndex]?.firstChild;
		if (!textNode) continue;

		const domRange = document.createRange();
		domRange.setStart(textNode, slice.start);
		domRange.setEnd(textNode, slice.end);

		for (const rect of domRange.getClientRects()) {
			if (rect.width === 0 || rect.height === 0) continue;
			boxes.push({
				left: rect.left - origin.left,
				top: rect.top - origin.top,
				right: rect.right - origin.left,
				bottom: rect.bottom - origin.top
			});
		}
	}

	return mergeIntoLines(boxes);
}

/**
 * Joins boxes that sit on the same line into one band, like a highlighter stroke.
 * Boxes far apart horizontally (e.g. the same line height in two different columns) stay separate.
 */
export function mergeIntoLines(boxes: Box[]): Box[] {
	const merged: Box[] = [];

	for (const box of boxes) {
		const line = merged.find((candidate) => isSameLine(candidate, box));
		if (!line) {
			merged.push({ ...box });
			continue;
		}
		line.left = Math.min(line.left, box.left);
		line.top = Math.min(line.top, box.top);
		line.right = Math.max(line.right, box.right);
		line.bottom = Math.max(line.bottom, box.bottom);
	}

	return merged;
}

function isSameLine(a: Box, b: Box): boolean {
	const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
	const smallerHeight = Math.min(a.bottom - a.top, b.bottom - b.top);
	const verticallyAligned = overlap > smallerHeight / 2;

	const gap = Math.max(a.left, b.left) - Math.min(a.right, b.right);
	// A gap wider than one line height is a column gutter, not a space between words.
	const horizontallyClose = gap <= smallerHeight;

	return verticallyAligned && horizontallyClose;
}
