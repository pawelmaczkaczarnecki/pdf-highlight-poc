import type { TextRange } from './segment';

/** The parts of a PDF.js text item that the text model needs. */
export interface TextItemLike {
	str: string;
	hasEOL: boolean;
	/** PDF transform [a, b, c, d, x, y]; x/y is where the text starts, in PDF units (y grows upwards). */
	transform: number[];
	/** Font height in PDF units. */
	height: number;
}

/**
 * All text of one page as a single string, plus where each PDF.js text item starts in it.
 * Every highlight is described as a character range in `text`, so this is the bridge
 * between "sentence/word" and "which text-layer span to measure".
 */
export interface PageText {
	text: string;
	itemStarts: number[];
	itemLengths: number[];
}

/** A piece of a character range that falls inside one text item. Offsets are local to the item. */
export interface ItemSlice {
	itemIndex: number;
	start: number;
	end: number;
}

const LINE_BREAK = '\n';
/**
 * Marks the end of a block (title, header, footer, column). Intl.Segmenter always ends a sentence
 * at a paragraph separator, so a title never runs into the text after it.
 */
export const BLOCK_BREAK = '\u2029';

/** A font this much larger or smaller is a different block (title vs. body text). */
const FONT_SIZE_CHANGE = 1.2;
/** A vertical step this many font heights down is a gap between blocks, not the next line. */
const BLOCK_GAP_IN_LINES = 1.8;

export function buildPageText(items: TextItemLike[]): PageText {
	let text = '';
	const itemStarts: number[] = [];
	const itemLengths: number[] = [];
	// The main text of the current line: its largest item, so a small footnote marker at the end
	// of a line is not compared with the next line as if it were body text.
	let lineReference: TextItemLike | null = null;

	for (const item of items) {
		if (item.str.trim() !== '') {
			if (!lineReference) {
				lineReference = item;
			} else if (isSameLine(lineReference, item)) {
				if (item.height > lineReference.height) lineReference = item;
			} else {
				if (isBlockBreak(lineReference, item)) text += BLOCK_BREAK;
				lineReference = item;
			}
		}
		itemStarts.push(text.length);
		itemLengths.push(item.str.length);
		text += item.str;
		// The line break exists only in our model (the text layer uses <br>), so words on
		// neighbouring lines are not glued together.
		if (item.hasEOL) text += LINE_BREAK;
	}

	return { text, itemStarts, itemLengths };
}

/**
 * Whether `next` starts a new block rather than continuing `previous`. Only a change of line can
 * start a block, so a smaller footnote marker inside a sentence never breaks it.
 */
export function isBlockBreak(previous: TextItemLike, next: TextItemLike): boolean {
	const previousY = previous.transform[5];
	const nextY = next.transform[5];
	const smallerHeight = Math.min(previous.height, next.height);
	const largerHeight = Math.max(previous.height, next.height);
	if (smallerHeight <= 0) return false;

	if (isSameLine(previous, next)) return false;

	const fontSizeChanged = largerHeight / smallerHeight > FONT_SIZE_CHANGE;
	const movedUp = nextY > previousY; // next column, or back up to a header
	const largeGap = previousY - nextY > largerHeight * BLOCK_GAP_IN_LINES;
	return fontSizeChanged || movedUp || largeGap;
}

/** Half the larger font: a raised footnote marker still counts as the same line. */
function isSameLine(a: TextItemLike, b: TextItemLike): boolean {
	const largerHeight = Math.max(a.height, b.height);
	return Math.abs(b.transform[5] - a.transform[5]) < largerHeight / 2;
}

export function sliceByItems(pageText: PageText, range: TextRange): ItemSlice[] {
	const slices: ItemSlice[] = [];

	pageText.itemStarts.forEach((itemStart, itemIndex) => {
		const itemEnd = itemStart + pageText.itemLengths[itemIndex];
		const start = Math.max(range.start, itemStart);
		const end = Math.min(range.end, itemEnd);
		if (start >= end) return;
		slices.push({ itemIndex, start: start - itemStart, end: end - itemStart });
	});

	return slices;
}
