import type { Box } from './rects.js';

/** Pixels of one horizontal strip of the canvas, as returned by getImageData. */
export interface PixelStrip {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

export interface InkExtent {
	left: number;
	right: number;
}

export interface WordAccuracy {
	wordIndex: number;
	/** The larger of the left and right edge errors, in CSS pixels. */
	errorPx: number;
}

export interface AccuracyReport {
	words: number;
	measured: number;
	medianPx: number;
	p95Px: number;
	within1Px: number;
	within2Px: number;
	maxPx: number;
	worst: WordAccuracy[];
}

/** Colour difference (sum of channel differences) above which a pixel counts as ink. */
const INK_THRESHOLD = 90;
/** How far around each box edge we look for the word space, as a share of the line height. */
const EDGE_WINDOW_SHARE = 0.5;
/** How far beyond the box we read pixels, in CSS pixels. */
const SEARCH_MARGIN_PX = 24;
const WORST_COUNT = 5;

/**
 * The most common colour in the strip. Text is thin, so the background (white paper, or a
 * coloured panel behind white text) covers most of the pixels.
 */
export function backgroundColor(strip: PixelStrip): [number, number, number] {
	const counts = new Map<number, number>();
	let best = 0;
	let bestCount = 0;
	for (let i = 0; i < strip.data.length; i += 4) {
		const key = (strip.data[i] << 16) | (strip.data[i + 1] << 8) | strip.data[i + 2];
		const count = (counts.get(key) ?? 0) + 1;
		counts.set(key, count);
		if (count > bestCount) {
			best = key;
			bestCount = count;
		}
	}
	return [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}

/** For each column of the strip: does it contain any pixel clearly different from the background? */
export function inkColumns(strip: PixelStrip): boolean[] {
	const [r, g, b] = backgroundColor(strip);
	const columns: boolean[] = [];
	for (let x = 0; x < strip.width; x++) {
		let ink = false;
		for (let y = 0; y < strip.height && !ink; y++) {
			const i = (y * strip.width + x) * 4;
			const difference =
				Math.abs(strip.data[i] - r) +
				Math.abs(strip.data[i + 1] - g) +
				Math.abs(strip.data[i + 2] - b);
			ink = difference > INK_THRESHOLD;
		}
		columns.push(ink);
	}
	return columns;
}

export interface EdgeErrors {
	left: number;
	right: number;
}

/**
 * How far each box edge is from the real start/end of the word's ink, in columns, or null when
 * the word spaces cannot be confirmed (then the word is reported as not measured).
 * Around each edge we take the widest blank run within `window` columns: for a word with spaces
 * on both sides, that run is the word space. The ink starts right after the space on the left
 * and ends right before the space on the right. Gaps between letters are narrower, so a shifted
 * box still finds the real space and reports the shift as an error.
 */
export function edgeErrors(
	columns: boolean[],
	leftEdge: number,
	rightEdge: number,
	window: number
): EdgeErrors | null {
	// Each search stays on its own half of the word, so in a one-letter word the left edge
	// cannot pick up the space after the word.
	const middle = Math.round((leftEdge + rightEdge) / 2);
	const leftGap = widestBlankRun(columns, leftEdge - window, Math.min(leftEdge + window, middle));
	const rightGap = widestBlankRun(
		columns,
		Math.max(rightEdge - window, middle),
		rightEdge + window
	);
	if (!leftGap || !rightGap) return null;

	const inkStart = leftGap.end;
	const inkEnd = rightGap.start;
	// Confirm that the two gaps really are word spaces: inside one word every gap between letters
	// is narrower than the spaces around it. A box sitting on letter gaps fails this check.
	const narrowestEdgeGap = Math.min(leftGap.end - leftGap.start, rightGap.end - rightGap.start);
	const widestInnerGap = widestBlankRun(columns, inkStart, inkEnd);
	if (widestInnerGap && widestInnerGap.end - widestInnerGap.start >= narrowestEdgeGap) return null;

	return { left: Math.abs(inkStart - leftEdge), right: Math.abs(inkEnd - rightEdge) };
}

/**
 * The widest run of blank columns that has at least one column in [from, to). Runs are measured
 * over their full length, so a word space cut by the window edge does not look narrower.
 * `end` is the first column after the run.
 */
function widestBlankRun(
	columns: boolean[],
	from: number,
	to: number
): { start: number; end: number } | null {
	let best: { start: number; end: number } | null = null;
	let x = Math.max(0, from);
	const last = Math.min(columns.length, to);

	while (x < last) {
		if (columns[x]) {
			x++;
			continue;
		}
		let start = x;
		while (start > 0 && !columns[start - 1]) start--;
		let end = x;
		while (end < columns.length && !columns[end]) end++;
		if (!best || end - start > best.end - best.start) best = { start, end };
		x = end;
	}
	return best;
}

/** Only words with a space (or line edge) on both sides can be measured without punctuation noise. */
export function isSpaceSeparated(text: string, range: { start: number; end: number }): boolean {
	const before = text[range.start - 1];
	const after = text[range.end];
	return (before === undefined || /\s/.test(before)) && (after === undefined || /\s/.test(after));
}

export interface ComparedWord {
	wordIndex: number;
	textLayer: Box[];
	glyphs: Box[];
}

export interface AccuracyComparison {
	textLayer: AccuracyReport;
	glyphs: AccuracyReport;
	/** Words whose B boxes really came from glyph positions (the rest fell back to A). */
	glyphPositionsUsed: number;
}

/**
 * Measures approach A (text layer) and B (glyph positions) on exactly the same words: a word
 * counts only if it can be measured with both, so the two summaries are directly comparable.
 */
export function compareAccuracy(
	canvas: HTMLCanvasElement,
	cssWidth: number,
	totalWords: number,
	words: ComparedWord[]
): AccuracyComparison {
	const context = canvas.getContext('2d');
	const ratio = canvas.width / cssWidth;
	const textLayer: WordAccuracy[] = [];
	const glyphs: WordAccuracy[] = [];
	let glyphPositionsUsed = 0;

	for (const word of words) {
		if (!sameBoxes(word.textLayer, word.glyphs)) glyphPositionsUsed++;
		if (!context || word.textLayer.length !== 1 || word.glyphs.length !== 1) continue;
		const errorA = measureWord(context, ratio, word.textLayer[0]);
		const errorB = measureWord(context, ratio, word.glyphs[0]);
		if (errorA === null || errorB === null) continue;
		textLayer.push({ wordIndex: word.wordIndex, errorPx: errorA });
		glyphs.push({ wordIndex: word.wordIndex, errorPx: errorB });
	}

	return {
		textLayer: summarize(totalWords, textLayer),
		glyphs: summarize(totalWords, glyphs),
		glyphPositionsUsed
	};
}

function sameBoxes(a: Box[], b: Box[]): boolean {
	return (
		a.length === b.length && a.every((box, i) => box.left === b[i].left && box.right === b[i].right)
	);
}

function measureWord(context: CanvasRenderingContext2D, ratio: number, box: Box): number | null {
	// The middle part of the line only, so ascenders and descenders of other lines are not counted.
	const height = box.bottom - box.top;
	const x0 = Math.max(0, Math.floor((box.left - SEARCH_MARGIN_PX) * ratio));
	const x1 = Math.min(context.canvas.width, Math.ceil((box.right + SEARCH_MARGIN_PX) * ratio));
	const y0 = Math.floor((box.top + height * 0.15) * ratio);
	const y1 = Math.ceil((box.bottom - height * 0.15) * ratio);
	if (x1 <= x0 || y1 <= y0) return null;

	const strip = context.getImageData(x0, y0, x1 - x0, y1 - y0);
	const toColumn = (cssX: number) => Math.round(cssX * ratio) - x0;
	const window = Math.ceil(height * EDGE_WINDOW_SHARE * ratio);
	const errors = edgeErrors(inkColumns(strip), toColumn(box.left), toColumn(box.right), window);
	if (!errors) return null;

	return Math.max(errors.left, errors.right) / ratio;
}

export function summarize(words: number, results: WordAccuracy[]): AccuracyReport {
	const errors = results.map((result) => result.errorPx).sort((a, b) => a - b);
	const share = (limit: number) =>
		errors.length ? errors.filter((error) => error <= limit).length / errors.length : 0;

	return {
		words,
		measured: errors.length,
		medianPx: percentile(errors, 0.5),
		p95Px: percentile(errors, 0.95),
		within1Px: share(1),
		within2Px: share(2),
		maxPx: errors.length ? errors[errors.length - 1] : 0,
		worst: [...results].sort((a, b) => b.errorPx - a.errorPx).slice(0, WORST_COUNT)
	};
}

function percentile(sorted: number[], fraction: number): number {
	if (sorted.length === 0) return 0;
	const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
	return sorted[Math.max(0, index)];
}
