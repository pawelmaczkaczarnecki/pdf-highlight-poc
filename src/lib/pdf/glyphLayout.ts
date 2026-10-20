import type { TextRange } from '#lib/text/segment.js';

/** Operator codes this module reads (values of pdfjs-dist's OPS). */
export interface TextOps {
	save: number;
	restore: number;
	transform: number;
	beginText: number;
	setFont: number;
	setTextMatrix: number;
	setCharSpacing: number;
	setWordSpacing: number;
	setHScale: number;
	setLeading: number;
	moveText: number;
	setLeadingMoveText: number;
	nextLine: number;
	showText: number;
}

export interface OperatorListLike {
	fnArray: number[];
	argsArray: unknown[][];
}

interface GlyphLike {
	unicode: string;
	width: number;
	isSpace: boolean;
}

/** One drawn glyph, horizontally positioned in PDF page space (the page's own units, y up). */
export interface PositionedGlyph {
	text: string;
	left: number;
	right: number;
	baseline: number;
	/** Font size in page space, used to judge gaps relative to the text size. */
	emSize: number;
	/**
	 * False when the position cannot be trusted: unknown or Type3 font, or rotated/skewed text.
	 * Callers then keep using the text-layer position.
	 */
	supported: boolean;
}

type Matrix = [number, number, number, number, number, number];

interface TextState {
	/** Current transformation matrix: from user space to page space. */
	ctm: Matrix;
	textMatrix: Matrix;
	lineX: number;
	lineY: number;
	x: number;
	y: number;
	fontSize: number;
	fontScale: number;
	fontSupported: boolean;
	charSpacing: number;
	wordSpacing: number;
	horizontalScale: number;
	leading: number;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const DEFAULT_FONT_SCALE = 0.001;

/**
 * Replays the text-positioning part of a PDF page's drawing instructions, the same arithmetic the
 * PDF.js canvas renderer uses for horizontal text: where each glyph starts and how far it advances.
 * Images, paths, rotation and vertical text are ignored.
 */
export function positionGlyphs(
	operatorList: OperatorListLike,
	ops: TextOps,
	fontScaleOf: (fontName: string) => number | undefined
): PositionedGlyph[] {
	const glyphs: PositionedGlyph[] = [];
	const savedStates: TextState[] = [];
	let state: TextState = {
		ctm: IDENTITY,
		textMatrix: IDENTITY,
		lineX: 0,
		lineY: 0,
		x: 0,
		y: 0,
		fontSize: 0,
		fontScale: DEFAULT_FONT_SCALE,
		fontSupported: false,
		charSpacing: 0,
		wordSpacing: 0,
		horizontalScale: 1,
		leading: 0
	};

	const moveText = (dx: number, dy: number) => {
		state.lineX += dx;
		state.lineY += dy;
		state.x = state.lineX;
		state.y = state.lineY;
	};

	operatorList.fnArray.forEach((fn, index) => {
		const args = operatorList.argsArray[index] ?? [];
		switch (fn) {
			case ops.save:
				savedStates.push({ ...state });
				break;
			case ops.restore:
				state = savedStates.pop() ?? state;
				break;
			case ops.transform:
				state.ctm = multiply(state.ctm, args as unknown as Matrix);
				break;
			case ops.beginText:
				state.textMatrix = IDENTITY;
				state.lineX = state.lineY = state.x = state.y = 0;
				break;
			case ops.setFont: {
				const fontScale = fontScaleOf(args[0] as string);
				state.fontSize = Math.abs(args[1] as number);
				state.fontScale = fontScale ?? DEFAULT_FONT_SCALE;
				state.fontSupported = fontScale !== undefined;
				break;
			}
			case ops.setTextMatrix:
				state.textMatrix = Array.from(args[0] as ArrayLike<number>) as Matrix;
				state.lineX = state.lineY = state.x = state.y = 0;
				break;
			case ops.setCharSpacing:
				state.charSpacing = args[0] as number;
				break;
			case ops.setWordSpacing:
				state.wordSpacing = args[0] as number;
				break;
			case ops.setHScale:
				state.horizontalScale = (args[0] as number) / 100;
				break;
			case ops.setLeading:
				state.leading = -(args[0] as number);
				break;
			case ops.moveText:
				moveText(args[0] as number, args[1] as number);
				break;
			case ops.setLeadingMoveText:
				state.leading = args[1] as number;
				moveText(args[0] as number, args[1] as number);
				break;
			case ops.nextLine:
				moveText(0, state.leading);
				break;
			case ops.showText:
				state.x += showText(state, args[0] as Array<GlyphLike | number>, glyphs);
				break;
		}
	});

	return glyphs;
}

/** Positions one run of glyphs and returns how far the text position advanced. */
function showText(
	state: TextState,
	run: Array<GlyphLike | number>,
	glyphs: PositionedGlyph[]
): number {
	// Text space → page space: first the text matrix, then the current transformation matrix.
	const toPage = multiply(state.ctm, state.textMatrix);
	const [a, b, c, d] = toPage;
	const upright = a > 0 && d > 0 && Math.abs(b) < 1e-6 * a && Math.abs(c) < 1e-6 * d;
	const supported = state.fontSupported && upright;
	const baseline = apply(toPage, state.x, state.y)[1];
	const emSize = state.fontSize * Math.hypot(c, d);
	let advance = 0;

	for (const glyph of run) {
		if (typeof glyph === 'number') {
			// TJ adjustment: thousandths of the font size, positive moves left.
			advance -= (glyph * state.fontSize) / 1000;
			continue;
		}
		const width = glyph.width * state.fontSize * state.fontScale;
		const left = state.x + advance * state.horizontalScale;
		const right = left + width * state.horizontalScale;
		glyphs.push({
			text: glyph.unicode,
			left: apply(toPage, left, state.y)[0],
			right: apply(toPage, right, state.y)[0],
			baseline,
			emSize,
			supported
		});
		advance += width + state.charSpacing + (glyph.isSpace ? state.wordSpacing : 0);
	}

	return advance * state.horizontalScale;
}

/** outer ∘ inner: a point is transformed by `inner` first, then by `outer` (like canvas transform()). */
function multiply(outer: Matrix, inner: Matrix): Matrix {
	const [a1, b1, c1, d1, e1, f1] = outer;
	const [a2, b2, c2, d2, e2, f2] = inner;
	return [
		a1 * a2 + c1 * b2,
		b1 * a2 + d1 * b2,
		a1 * c2 + c1 * d2,
		b1 * c2 + d1 * d2,
		a1 * e2 + c1 * f2 + e1,
		b1 * e2 + d1 * f2 + f1
	];
}

function apply(matrix: Matrix, x: number, y: number): [number, number] {
	const [a, b, c, d, e, f] = matrix;
	return [a * x + c * y + e, b * x + d * y + f];
}

/** A space this much narrower than the font size (in em) is not visible as a gap. */
const HIDDEN_GAP_EM = 0.08;

/**
 * Finds spaces that exist in the text but not on the page: a space glyph is drawn, yet the next
 * letter starts where the previous one ended (e.g. after a "ﬁ" ligature some typesetters move back
 * and draw a space over it, so "conﬁ rmation" is extracted for what looks like "confirmation").
 * Returns them as ranges of `pageText`. If the drawn glyphs cannot be matched to the text 1:1,
 * returns nothing rather than guessing.
 */
export function findHiddenSpaces(pageText: string, glyphs: PositionedGlyph[]): TextRange[] {
	const glyphAt = alignGlyphsToText(pageText, glyphs);
	if (!glyphAt) return [];
	const textOffsets = nonSpaceOffsets(pageText);

	const hidden: TextRange[] = [];
	for (let i = 0; i + 1 < textOffsets.length; i++) {
		const previousIndex = glyphAt[textOffsets[i]];
		const nextIndex = glyphAt[textOffsets[i + 1]];
		// Only a glyph drawn in between (the space) can be hidden; adjacent glyphs have no space.
		if (nextIndex - previousIndex < 2) continue;

		const previous = glyphs[previousIndex];
		const next = glyphs[nextIndex];
		if (!previous.supported || !next.supported) continue;
		const sameLine = Math.abs(next.baseline - previous.baseline) < previous.emSize * 0.3;
		const visibleGap = next.left - previous.right;
		if (!sameLine || visibleGap >= previous.emSize * HIDDEN_GAP_EM) continue;

		const start = textOffsets[i] + 1;
		const end = textOffsets[i + 1];
		if (end > start && /^\s+$/.test(pageText.slice(start, end))) hidden.push({ start, end });
	}
	return hidden;
}

/**
 * For every character of `pageText`, the index of the glyph that drew it (-1 for whitespace).
 * Null when the drawn glyphs are not exactly this text (same characters, same order), because
 * then positions cannot be attributed to characters safely.
 */
export function alignGlyphsToText(pageText: string, glyphs: PositionedGlyph[]): Int32Array | null {
	const textOffsets = nonSpaceOffsets(pageText);
	const drawn = glyphs.flatMap((glyph, glyphIndex) =>
		[...glyph.text].filter((char) => !/\s/.test(char)).map((char) => ({ char, glyphIndex }))
	);
	const matchesText =
		drawn.length === textOffsets.length &&
		drawn.every(({ char }, i) => char === pageText[textOffsets[i]]);
	if (!matchesText) return null;

	const glyphAt = new Int32Array(pageText.length).fill(-1);
	textOffsets.forEach((offset, i) => (glyphAt[offset] = drawn[i].glyphIndex));
	return glyphAt;
}

function nonSpaceOffsets(text: string): number[] {
	const offsets: number[] = [];
	for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) offsets.push(i);
	return offsets;
}
