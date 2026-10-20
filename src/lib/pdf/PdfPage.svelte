<script lang="ts">
	import 'pdfjs-dist/web/pdf_viewer.css';
	import { TextLayer, type PDFDocumentProxy } from 'pdfjs-dist';
	import type { TextItem } from 'pdfjs-dist/types/src/display/api';
	import HighlightLayer from '#lib/highlight/HighlightLayer.svelte';
	import { measureRange } from '#lib/highlight/rects.js';
	import { buildPageText, type PageText } from '#lib/text/pageText.js';
	import type { TextRange } from '#lib/text/segment.js';

	interface Props {
		pdf: PDFDocumentProxy;
		pageNumber: number;
		scale: number;
		sentenceRange: TextRange | null;
		wordRange: TextRange | null;
		onTextReady: (pageText: PageText) => void;
	}

	let { pdf, pageNumber, scale, sentenceRange, wordRange, onTextReady }: Props = $props();

	let pageElement: HTMLDivElement | undefined;
	let canvas: HTMLCanvasElement;
	let textLayerElement: HTMLDivElement;

	let size = $state({ width: 0, height: 0 });
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

		// Draw the canvas at the screen's pixel density so the page is sharp on HiDPI screens.
		const pixelRatio = window.devicePixelRatio || 1;
		canvas.width = Math.floor(viewport.width * pixelRatio);
		canvas.height = Math.floor(viewport.height * pixelRatio);
		const renderTask = page.render({
			canvas,
			viewport,
			transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0]
		});
		cleanups.push(() => renderTask.cancel());

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

		// textDivs[i] is the span for the i-th text item, so offsets in PageText map onto spans.
		const items = textContent.items.filter((item): item is TextItem => 'str' in item);
		textDivs = textLayer.textDivs;
		pageText = buildPageText(items);
		onTextReady(pageText);

		await renderTask.promise;
	}
</script>

<div
	bind:this={pageElement}
	class="page"
	style="width:{size.width}px;height:{size.height}px;--total-scale-factor:{scale};--scale-round-x:1px;--scale-round-y:1px"
>
	<canvas bind:this={canvas} style="width:{size.width}px;height:{size.height}px"></canvas>
	<div bind:this={textLayerElement} class="textLayer"></div>
	<HighlightLayer {sentenceBoxes} {wordBoxes} />
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
