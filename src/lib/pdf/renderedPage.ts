import type { Box } from '#lib/highlight/rects.js';
import type { TextRange } from '#lib/text/segment.js';

/**
 * Where box edges come from. 'glyphs': glyph positions from the PDF's drawing instructions, used
 * for the highlights (with text-layer edges wherever a glyph position cannot be trusted).
 * 'text-layer': the native text layer alone (browser fallback font), measured as the baseline.
 */
export type PositionSource = 'text-layer' | 'glyphs';

/** A page whose canvas and text layer are both drawn, with what is needed to measure them. */
export interface RenderedPage {
	canvas: HTMLCanvasElement;
	cssWidth: number;
	measure: (range: TextRange, source: PositionSource) => Box[];
}
