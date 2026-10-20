import type { Box } from './rects.js';
import type { TextRange } from '#lib/text/segment.js';

/** Where one character's glyph is drawn, in page CSS pixels (y grows downwards). */
export interface GlyphEdge {
	left: number;
	right: number;
	baseline: number;
}

/**
 * Approach B: keep the text-layer boxes' vertical extent (one per line), but take their left and
 * right edges from the glyph positions in the PDF instead of the browser's fallback font.
 * Falls back to the text-layer boxes unchanged when any character of the range has no trusted
 * glyph position, or a line cannot be matched to glyphs.
 */
export function glyphRefinedBoxes(
	lineBoxes: Box[],
	range: TextRange,
	text: string,
	edgeAt: (offset: number) => GlyphEdge | null
): Box[] {
	const edges: GlyphEdge[] = [];
	for (let offset = range.start; offset < range.end; offset++) {
		if (/\s/.test(text[offset])) continue;
		const edge = edgeAt(offset);
		if (!edge) return lineBoxes;
		edges.push(edge);
	}

	const refined: Box[] = [];
	for (const box of lineBoxes) {
		// The baseline sits inside the line box, above the descenders.
		const onThisLine = edges.filter(
			(edge) =>
				edge.baseline >= box.top && edge.baseline <= box.bottom + (box.bottom - box.top) * 0.3
		);
		if (onThisLine.length === 0) return lineBoxes;
		refined.push({
			...box,
			left: Math.min(...onThisLine.map((edge) => edge.left)),
			right: Math.max(...onThisLine.map((edge) => edge.right))
		});
	}
	return refined;
}
