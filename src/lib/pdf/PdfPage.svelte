<script lang="ts">
	import 'pdfjs-dist/web/pdf_viewer.css';
	import {
		TextLayer,
		type PageViewport,
		type PDFDocumentProxy,
		type PDFPageProxy
	} from 'pdfjs-dist';
	import type { TextItem } from 'pdfjs-dist/types/src/display/api';
	import HighlightLayer from '#lib/highlight/HighlightLayer.svelte';
	import { measureRange, offsetAtPoint } from '#lib/highlight/rects.js';
	import type { RenderedPage } from './renderedPage.js';
	import { buildPageText, type PageText } from '#lib/text/pageText.js';
	import type { TextRange } from '#lib/text/segment.js';

	interface Props {
		pdf: PDFDocumentProxy;
		pageNumber: number;
		scale: number;
		sentenceRange: TextRange | null;
		wordRange: TextRange | null;
		/** Ranges drawn as thin outlines, e.g. every word on the page to inspect accuracy. */
		outlineRanges: TextRange[];
		onTextReady: (pageText: PageText) => void;
		onTextClick: (offset: number) => void;
		onRendered: (page: RenderedPage) => void;
	}

	let {
		pdf,
		pageNumber,
		scale,
		sentenceRange,
		wordRange,
		outlineRanges,
		onTextReady,
		onTextClick,
		onRendered
	}: Props = $props();

	let pageElement: HTMLDivElement | undefined;
	let canvas: HTMLCanvasElement;
	let textLayerElement: HTMLDivElement;

	let size = $state({ width: 0, height: 0 });
	let totalScaleFactor = $state(1);
	let pageText = $state<PageText | null>(null);
	let textDivs: HTMLElement[] = [];
	let errorMessage = $state<string | null>(null);

	const sentenceBoxes = $derived(
		pageText && pageElement && sentenceRange
			? measureRange(pageText, textDivs, pageElement, sentenceRange)
			: []
	);
	const wordBoxes = $derived(
		pageText && pageElement && wordRange
			? measureRange(pageText, textDivs, pageElement, wordRange)
			: []
	);

	const outlineBoxes = $derived(
		pageText && pageElement
			? outlineRanges.flatMap((range) => measureRange(pageText!, textDivs, pageElement!, range))
			: []
	);

	function handleClick(event: MouseEvent) {
		if (!pageText) return;
		// A drag that selected text is not a "start reading here" click.
		if (window.getSelection()?.isCollapsed === false) return;
		const offset = offsetAtPoint(pageText, textDivs, event.clientX, event.clientY);
		if (offset !== null) onTextClick(offset);
	}

	$effect(() => {
		let cancelled = false;
		const cleanups: Array<() => void> = [];

		renderPage(pdf, pageNumber, scale, cleanups, () => cancelled).catch((error: unknown) => {
			if (cancelled) return;
			errorMessage = error instanceof Error ? error.message : String(error);
		});

		return () => {
			cancelled = true;
			cleanups.forEach((cleanup) => cleanup());
		};
	});

	async function renderPage(
		pdf: PDFDocumentProxy,
		pageNumber: number,
		scale: number,
		cleanups: Array<() => void>,
		isCancelled: () => boolean
	): Promise<void> {
		pageText = null;
		errorMessage = null;

		const page = await pdf.getPage(pageNumber);
		if (isCancelled()) return;
		const viewport = page.getViewport({ scale });
		size = { width: Math.floor(viewport.width), height: Math.floor(viewport.height) };
		// PDF.js sizes the text layer from this variable; it must include the page's user unit.
		totalScaleFactor = viewport.scale * viewport.userUnit;

		// Waiting for both together means a cancelled canvas render is never an unhandled rejection.
		await Promise.all([
			renderCanvas(page, viewport, cleanups),
			renderTextLayer(page, viewport, cleanups, isCancelled)
		]);
		if (isCancelled() || !pageText || !pageElement) return;

		const renderedText = pageText;
		const element = pageElement;
		onRendered({
			canvas,
			cssWidth: size.width,
			measure: (range) => measureRange(renderedText, textDivs, element, range)
		});
	}

	function renderCanvas(
		page: PDFPageProxy,
		viewport: PageViewport,
		cleanups: Array<() => void>
	): Promise<void> {
		// Draw at the screen's pixel density so the page is sharp on HiDPI screens. Only the canvas
		// bitmap is scaled; the text layer and our overlay stay in CSS pixels.
		const pixelRatio = window.devicePixelRatio || 1;
		canvas.width = Math.floor(viewport.width * pixelRatio);
		canvas.height = Math.floor(viewport.height * pixelRatio);
		const renderTask = page.render({
			canvas,
			viewport,
			transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0]
		});
		cleanups.push(() => renderTask.cancel());
		return renderTask.promise;
	}

	async function renderTextLayer(
		page: PDFPageProxy,
		viewport: PageViewport,
		cleanups: Array<() => void>,
		isCancelled: () => boolean
	): Promise<void> {
		const textContent = await page.getTextContent();
		if (isCancelled()) return;

		// The text layer div has no Svelte-managed children; PDF.js owns its content.
		// eslint-disable-next-line svelte/no-dom-manipulating
		textLayerElement.replaceChildren();
		const textLayer = new TextLayer({
			textContentSource: textContent,
			container: textLayerElement,
			viewport
		});
		cleanups.push(() => textLayer.cancel());
		await textLayer.render();
		if (isCancelled()) return;

		// textDivs[i] is the span for the i-th text item (empty items included), so offsets in
		// PageText map onto spans by index.
		const items = textContent.items.filter((item): item is TextItem => 'str' in item);
		textDivs = textLayer.textDivs;
		pageText = buildPageText(items);
		onTextReady(pageText);
	}
</script>

<!-- Clicks land on the native text layer spans; keyboard users have the reader controls. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	bind:this={pageElement}
	onclick={handleClick}
	data-testid="pdf-page"
	class="page"
	style="width:{size.width}px;height:{size.height}px;--total-scale-factor:{totalScaleFactor};--scale-round-x:1px;--scale-round-y:1px"
>
	<canvas bind:this={canvas} style="width:{size.width}px;height:{size.height}px"></canvas>
	<div bind:this={textLayerElement} class="textLayer"></div>
	<HighlightLayer {sentenceBoxes} {wordBoxes} {outlineBoxes} />
	{#if errorMessage}
		<p class="error" role="alert">Could not render this page: {errorMessage}</p>
	{/if}
</div>

<style>
	.page {
		position: relative;
		background: white;
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.2);
	}
	canvas {
		position: absolute;
		inset: 0;
	}
	.error {
		position: absolute;
		inset: 1rem;
		color: rgb(185 28 28);
	}
</style>
