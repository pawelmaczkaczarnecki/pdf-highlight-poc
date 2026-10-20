import type { Box } from '#lib/highlight/rects.js';
import type { TextRange } from '#lib/text/segment.js';

/**
 * Where box edges come from: A = the native text layer (browser fallback font),
 * B = glyph positions from the PDF's drawing instructions (falls back to A where unsupported).
 */
export type PositionSource = 'text-layer' | 'glyphs';

/** A page whose canvas and text layer are both drawn, with what is needed to measure them. */
export interface RenderedPage {
	canvas: HTMLCanvasElement;
	cssWidth: number;
	measure: (range: TextRange, source: PositionSource) => Box[];
}
