import type { Box } from '#lib/highlight/rects.js';
import type { TextRange } from '#lib/text/segment.js';

/** A page whose canvas and text layer are both drawn, with what is needed to measure them. */
export interface RenderedPage {
	canvas: HTMLCanvasElement;
	cssWidth: number;
	measure: (range: TextRange) => Box[];
}
