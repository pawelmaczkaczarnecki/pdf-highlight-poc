import type { TextRange } from './segment';

/** The parts of a PDF.js text item that the text model needs. */
export interface TextItemLike {
	str: string;
	hasEOL: boolean;
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

export function buildPageText(items: TextItemLike[]): PageText {
	let text = '';
	const itemStarts: number[] = [];
	const itemLengths: number[] = [];

	for (const item of items) {
		itemStarts.push(text.length);
		itemLengths.push(item.str.length);
		text += item.str;
		// The line break exists only in our model (the text layer uses <br>), so words on
		// neighbouring lines are not glued together.
		if (item.hasEOL) text += LINE_BREAK;
	}

	return { text, itemStarts, itemLengths };
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
