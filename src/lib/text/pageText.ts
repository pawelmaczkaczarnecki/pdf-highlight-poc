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
	/** Blocks (title, paragraph, header…) in content order; their reading order is `readingRank`. */
	blocks: TextBlock[];
	/** Whitespace that is not a word boundary on the page (after a drop cap: "P⏎ublished"). */
	joins: TextRange[];
}

/** A run of text between two block breaks. Positions are in PDF units (y grows upwards). */
export interface TextBlock {
	start: number;
	end: number;
	/** Where reading of the block starts: its first line (a block can continue in the next column). */
	firstLeft: number;
	firstTop: number;
	/** Highest and lowest baseline of the block. */
	top: number;
	bottom: number;
	/** Running header or footer: read aloud by no TTS reader, so skipped. */
	isPageFurniture: boolean;
	/** Position in reading order: columns left to right, top to bottom within a column. */
	readingRank: number;
}

export interface PageSize {
	width: number;
	height: number;
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

/** Headers and footers live in these bands at the top and bottom of the page. */
const HEADER_BAND = 0.05;
const FOOTER_BAND = 0.05;
/** Blocks whose left edges are closer than this (share of page width) are in the same column. */
const COLUMN_GAP = 0.15;
/** A drop cap is a single capital at least this many times taller than the text it starts. */
const DROP_CAP_SCALE = 2;
const ENDS_SENTENCE = /[.!?:]["”’)\]]*\s*$/;

/** A font this much larger or smaller is a different block (title vs. body text). */
const FONT_SIZE_CHANGE = 1.2;
/** A vertical step this many font heights down is a gap between blocks, not the next line. */
const BLOCK_GAP_IN_LINES = 1.8;

export function buildPageText(items: TextItemLike[], pageSize?: PageSize): PageText {
	let text = '';
	const itemStarts: number[] = [];
	const itemLengths: number[] = [];
	const joins: TextRange[] = [];
	const blocks: Array<Omit<TextBlock, 'isPageFurniture' | 'readingRank'>> = [];
	// The main text of the current line: its largest item, so a small footnote marker at the end
	// of a line is not compared with the next line as if it were body text.
	let lineReference: TextItemLike | null = null;

	const startBlock = (first: TextItemLike) =>
		blocks.push({
			start: text.length,
			end: text.length,
			firstLeft: first.transform[4],
			firstTop: first.transform[5],
			top: -Infinity,
			bottom: Infinity
		});
	// Headers and footers always form their own blocks, even when the text before them does not
	// end a sentence.
	const bandOf = (item: TextItemLike) =>
		pageSize ? pageBand(item.transform[5], pageSize) : 'body';

	for (const item of items) {
		if (item.str.trim() !== '') {
			if (!lineReference) {
				startBlock(item);
				lineReference = item;
			} else if (isSameLine(lineReference, item)) {
				if (item.height > lineReference.height) lineReference = item;
			} else if (isDropCap(lineReference, item)) {
				// "P" + "ublished": one word, and the drop cap's block simply continues.
				joins.push({ start: lastNonSpace(text) + 1, end: text.length });
				lineReference = item;
			} else {
				const endsSentence = ENDS_SENTENCE.test(text);
				const changesBand = bandOf(lineReference) !== bandOf(item);
				if (changesBand || isBlockBreak(lineReference, item, endsSentence)) {
					text += BLOCK_BREAK;
					startBlock(item);
				}
				lineReference = item;
			}
			const block = blocks[blocks.length - 1];
			block.top = Math.max(block.top, item.transform[5]);
			block.bottom = Math.min(block.bottom, item.transform[5]);
		}
		itemStarts.push(text.length);
		itemLengths.push(item.str.length);
		text += item.str;
		// The line break exists only in our model (the text layer uses <br>), so words on
		// neighbouring lines are not glued together.
		if (item.hasEOL) text += LINE_BREAK;
		if (blocks.length) blocks[blocks.length - 1].end = text.length;
	}

	return { text, itemStarts, itemLengths, blocks: orderBlocks(blocks, pageSize), joins };
}

function isDropCap(previous: TextItemLike, next: TextItemLike): boolean {
	return (
		/^\p{Lu}$/u.test(previous.str.trim()) &&
		previous.height >= next.height * DROP_CAP_SCALE &&
		/^\p{Ll}/u.test(next.str.trimStart())
	);
}

function lastNonSpace(text: string): number {
	let i = text.length - 1;
	while (i >= 0 && /\s/.test(text[i])) i--;
	return i;
}

/**
 * Marks headers/footers and gives every block its place in reading order: blocks are grouped
 * into columns by their left edge, columns are read left to right, each from top to bottom.
 * Without a page size (e.g. in unit tests) content order is kept.
 */
function orderBlocks(
	blocks: Array<Omit<TextBlock, 'isPageFurniture' | 'readingRank'>>,
	pageSize?: PageSize
): TextBlock[] {
	if (!pageSize) {
		return blocks.map((block, index) => ({ ...block, isPageFurniture: false, readingRank: index }));
	}
	const withFlags = blocks.map((block) => ({
		...block,
		isPageFurniture:
			pageBand(block.top, pageSize) !== 'body' &&
			pageBand(block.top, pageSize) === pageBand(block.bottom, pageSize)
	}));

	const columnOf = columnIndexer(
		withFlags.filter((block) => !block.isPageFurniture).map((block) => block.firstLeft),
		pageSize.width * COLUMN_GAP
	);
	const order = withFlags
		.map((block, index) => ({ block, index }))
		.sort(
			(a, b) =>
				Number(a.block.isPageFurniture) - Number(b.block.isPageFurniture) ||
				columnOf(a.block.firstLeft) - columnOf(b.block.firstLeft) ||
				b.block.firstTop - a.block.firstTop
		);
	const rankOf = new Map(order.map(({ index }, rank) => [index, rank]));
	return withFlags.map((block, index) => ({ ...block, readingRank: rankOf.get(index)! }));
}

function pageBand(y: number, pageSize: PageSize): 'header' | 'footer' | 'body' {
	if (y > pageSize.height * (1 - HEADER_BAND)) return 'header';
	if (y < pageSize.height * FOOTER_BAND) return 'footer';
	return 'body';
}

/** Groups left edges into columns: a gap wider than `minGap` starts the next column. */
function columnIndexer(lefts: number[], minGap: number): (left: number) => number {
	const starts: number[] = [];
	for (const left of [...lefts].sort((a, b) => a - b)) {
		if (starts.length === 0 || left - starts[starts.length - 1] > minGap) starts.push(left);
	}
	return (left) => {
		let column = 0;
		starts.forEach((start, index) => {
			if (left >= start - minGap / 2) column = index;
		});
		return column;
	};
}

/**
 * Whether `next` starts a new block rather than continuing `previous`. Only a change of line can
 * start a block, so a smaller footnote marker inside a sentence never breaks it.
 */
export function isBlockBreak(
	previous: TextItemLike,
	next: TextItemLike,
	previousEndsSentence = true
): boolean {
	const previousY = previous.transform[5];
	const nextY = next.transform[5];
	const smallerHeight = Math.min(previous.height, next.height);
	const largerHeight = Math.max(previous.height, next.height);
	if (smallerHeight <= 0) return false;

	if (isSameLine(previous, next)) return false;

	const fontSizeChanged = largerHeight / smallerHeight > FONT_SIZE_CHANGE;
	if (fontSizeChanged) return true;
	// Moving up the page: the top of the next column, or a header. A sentence that has not ended
	// continues in the next column.
	if (nextY > previousY) return previousEndsSentence;
	return previousY - nextY > largerHeight * BLOCK_GAP_IN_LINES;
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
