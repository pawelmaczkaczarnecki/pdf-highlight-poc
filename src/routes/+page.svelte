<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import type { PDFDocumentProxy } from 'pdfjs-dist';
	import { loadPdf, type PdfSource } from '#lib/pdf/pdfjs.js';
	import PdfPage from '#lib/pdf/PdfPage.svelte';
	import type { RenderedPage } from '#lib/pdf/renderedPage.js';
	import AccuracyPanel from '#lib/highlight/AccuracyPanel.svelte';
	import {
		compareAccuracy,
		isSpaceSeparated,
		type AccuracyComparison
	} from '#lib/highlight/accuracy.js';
	import { Reader } from '#lib/reader/reader.svelte.js';
	import type { PageText } from '#lib/text/pageText.js';
	import type { TextRange } from '#lib/text/segment.js';

	const SAMPLE_PDF_URL = '/sample.pdf';
	const SCALE = 1.5;
	const SPEEDS = [120, 180, 240, 320];
	/** Space kept between the current word and the edges of the visible area when following it. */
	const FOLLOW_MARGIN_PX = 24;
	const CONTROL =
		'rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 disabled:opacity-40';

	const reader = new Reader();

	let pdf = $state<PDFDocumentProxy | null>(null);
	let fileName = $state('sample.pdf');
	let pageNumber = $state(1);
	let loadError = $state<string | null>(null);
	let showAllWords = $state(false);
	let pageText = $state<PageText | null>(null);
	let accuracy = $state<AccuracyComparison | null>(null);
	let toolbar: HTMLElement;
	let documentArea: HTMLElement;

	const outlineRanges = $derived(showAllWords ? reader.words : []);
	/**
	 * What a screen reader hears. During playback it stays "Playing" instead of announcing every
	 * word several times a second; on pause and manual navigation it names the current word.
	 */
	const announcement = $derived.by(() => {
		if (reader.playing) return 'Playing';
		if (!reader.currentWord) return '';
		const position = `word ${reader.wordIndex + 1} of ${reader.words.length}`;
		return `Paused at ${position}: ${wordText(reader.wordIndex)}`;
	});

	// Only the latest "open" counts: an older file that finishes loading later is thrown away.
	let latestOpenRequest = 0;

	// Follow the reading position like a TTS reader: when the current word moves out of the visible
	// area (playback, keys, a click in the accuracy report), scroll just enough to bring it back.
	$effect(() => {
		if (!reader.currentWord) return;
		tick().then(keepCurrentWordInView);
	});

	openDocument('sample.pdf', async () => ({ url: SAMPLE_PDF_URL }));
	onDestroy(() => reader.pause());

	async function openDocument(name: string, readSource: () => Promise<PdfSource>) {
		const request = ++latestOpenRequest;
		const isStale = () => request !== latestOpenRequest;
		reader.clear();
		accuracy = null;
		pageText = null;
		loadError = null;

		try {
			const loaded = await loadPdf(await readSource());
			if (isStale()) {
				await loaded.loadingTask.destroy();
				return;
			}
			const previous = pdf;
			fileName = name;
			pageNumber = 1;
			pdf = loaded;
			// Free the old document's worker resources once the page has switched to the new one.
			await previous?.loadingTask.destroy();
		} catch (error) {
			if (isStale()) return;
			loadError = `Could not open ${name}: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	async function handleFileChange(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;
		await openDocument(file.name, async () => ({ data: await file.arrayBuffer() }));
	}

	function goToPage(next: number) {
		if (!pdf || next < 1 || next > pdf.numPages) return;
		reader.clear();
		accuracy = null;
		pageText = null;
		pageNumber = next;
	}

	function handleTextReady(text: PageText, hiddenSpaces: TextRange[]) {
		pageText = text;
		accuracy = null;
		reader.loadText(text, hiddenSpaces);
	}

	function handleRendered(page: RenderedPage) {
		if (!pageText) return;
		const text = pageText.text;
		const measurable = reader.words
			.filter((word) => isSpaceSeparated(text, word))
			.map((word) => ({
				wordIndex: word.index,
				textLayer: page.measure(word, 'text-layer'),
				glyphs: page.measure(word, 'glyphs')
			}));
		accuracy = compareAccuracy(page.canvas, page.cssWidth, reader.words.length, measurable);
	}

	function keepCurrentWordInView() {
		const word = documentArea?.querySelector('[data-testid="word-box"]');
		if (!word) return;
		const box = word.getBoundingClientRect();

		// The toolbar is sticky and its height changes with the screen width.
		const visibleTop = toolbar.getBoundingClientRect().bottom + FOLLOW_MARGIN_PX;
		const visibleBottom = window.innerHeight - FOLLOW_MARGIN_PX;
		if (box.top < visibleTop) window.scrollBy({ top: box.top - visibleTop });
		else if (box.bottom > visibleBottom) window.scrollBy({ top: box.bottom - visibleBottom });

		// On narrow screens the document area scrolls sideways on its own.
		const area = documentArea.getBoundingClientRect();
		if (box.left < area.left + FOLLOW_MARGIN_PX) {
			documentArea.scrollLeft -= area.left + FOLLOW_MARGIN_PX - box.left;
		} else if (box.right > area.right - FOLLOW_MARGIN_PX) {
			documentArea.scrollLeft += box.right - (area.right - FOLLOW_MARGIN_PX);
		}
	}

	function wordText(wordIndex: number): string {
		const word = reader.words[wordIndex];
		if (!word || !pageText) return '';
		// Show the word as it reads: one line ("-⏎" → "-"), no hidden space, plain letters for
		// ligatures ("ﬁ" → "fi").
		return pageText.text
			.slice(word.start, word.end)
			.replace('-\n', '-')
			.replace(/\s+/g, '')
			.normalize('NFKC');
	}

	function handleKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		// Typing in a form field must not control playback.
		if (target.closest('input, select, textarea, [contenteditable]')) return;
		// Space on a focused button or link is that control's own activation.
		if (event.key === ' ' && target.closest('button, a')) return;

		const actions: Record<string, () => void> = {
			' ': () => reader.togglePlay(),
			ArrowRight: () => (event.shiftKey ? reader.nextSentence() : reader.nextWord()),
			ArrowLeft: () => (event.shiftKey ? reader.previousSentence() : reader.previousWord())
		};
		const action = actions[event.key];
		if (!action) return;
		event.preventDefault();
		action();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="min-h-screen bg-slate-100 text-slate-900">
	<header
		bind:this={toolbar}
		class="sticky top-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-200 bg-white px-4 py-2 text-sm shadow-sm"
	>
		<label class="flex items-center gap-2">
			<span class="font-medium">PDF</span>
			<input
				type="file"
				accept="application/pdf"
				onchange={handleFileChange}
				class="max-w-56 text-xs file:mr-2 file:rounded file:border-0 file:bg-slate-200 file:px-2 file:py-1"
			/>
		</label>

		<nav class="flex items-center gap-1" aria-label="Pages">
			<button
				class={CONTROL}
				onclick={() => goToPage(pageNumber - 1)}
				disabled={!pdf || pageNumber <= 1}
				aria-label="Previous page">‹</button
			>
			<span class="tabular-nums" data-testid="page-indicator"
				>Page {pageNumber} / {pdf?.numPages ?? '–'}</span
			>
			<button
				class={CONTROL}
				onclick={() => goToPage(pageNumber + 1)}
				disabled={!pdf || pageNumber >= pdf.numPages}
				aria-label="Next page">›</button
			>
		</nav>

		<!-- Wraps on narrow screens, so the speed control moves to its own row instead of overflowing. -->
		<div class="flex flex-wrap items-center gap-1" role="group" aria-label="Reading">
			<button
				class={CONTROL}
				onclick={() => reader.previousSentence()}
				disabled={!reader.words.length}
				aria-label="Previous sentence"
				title="Previous sentence (Shift+←)">⏮</button
			>
			<button
				class={CONTROL}
				onclick={() => reader.previousWord()}
				disabled={!reader.words.length}
				aria-label="Previous word"
				title="Previous word (←)">◀</button
			>
			<button
				class="{CONTROL} w-20 bg-blue-600 text-white hover:bg-blue-700"
				onclick={() => reader.togglePlay()}
				disabled={!reader.words.length}
				title="Play / pause (Space)">{reader.playing ? 'Pause' : 'Play'}</button
			>
			<button
				class={CONTROL}
				onclick={() => reader.nextWord()}
				disabled={!reader.words.length}
				aria-label="Next word"
				title="Next word (→)">▶</button
			>
			<button
				class={CONTROL}
				onclick={() => reader.nextSentence()}
				disabled={!reader.words.length}
				aria-label="Next sentence"
				title="Next sentence (Shift+→)">⏭</button
			>
			<label class="ml-2 flex items-center gap-1">
				<span>Speed</span>
				<select
					value={reader.wordsPerMinute}
					onchange={(event) => reader.setWordsPerMinute(Number(event.currentTarget.value))}
					class="rounded border border-slate-300 px-1"
				>
					{#each SPEEDS as speed (speed)}
						<option value={speed}>{speed} wpm</option>
					{/each}
				</select>
			</label>
		</div>

		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={showAllWords} />
			<span>Show all word boxes</span>
		</label>
	</header>

	<p class="px-4 pt-2 text-xs text-slate-500" data-testid="reading-status">
		{fileName} ·
		{#if !pageText}
			loading page…
		{:else if reader.words.length === 0}
			No selectable text on this page (scanned pages without a text layer are not supported).
		{:else}
			word {reader.wordIndex + 1} of {reader.words.length}, sentence
			{(reader.currentWord?.sentenceIndex ?? 0) + 1} of {reader.sentences.length} · click a word to start
			there · Space play/pause · ←/→ word · Shift+←/→ sentence
		{/if}
	</p>
	<p class="sr-only" aria-live="polite" data-testid="announcer">{announcement}</p>

	{#if pdf && !loadError}
		<AccuracyPanel
			comparison={accuracy}
			{wordText}
			onSelectWord={(wordIndex) => reader.goToWord(wordIndex)}
		/>
	{/if}

	<!-- Only the document scrolls sideways on narrow screens; the controls keep the screen width. -->
	<main bind:this={documentArea} class="overflow-x-auto p-4">
		<div class="mx-auto w-fit">
			{#if loadError}
				<p role="alert" class="text-red-700">{loadError}</p>
			{:else if pdf}
				<PdfPage
					{pdf}
					{pageNumber}
					scale={SCALE}
					sentenceRange={reader.currentSentence}
					wordRange={reader.currentWord}
					{outlineRanges}
					onTextReady={handleTextReady}
					onTextClick={(offset) => reader.goToOffset(offset)}
					onRendered={handleRendered}
				/>
			{:else}
				<p>Loading…</p>
			{/if}
		</div>
	</main>
</div>
