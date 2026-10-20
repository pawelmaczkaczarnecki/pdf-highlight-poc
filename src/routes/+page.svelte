<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import type { PDFDocumentProxy } from 'pdfjs-dist';
	import { loadPdf, type PdfSource } from '#lib/pdf/pdfjs.js';
	import PdfPage from '#lib/pdf/PdfPage.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import type { RenderedPage } from '#lib/pdf/renderedPage.js';
	import AccuracyPanel from '#lib/highlight/AccuracyPanel.svelte';
	import {
		compareAccuracy,
		isSpaceSeparated,
		type AccuracyComparison
	} from '#lib/highlight/accuracy.js';
	import { Reader } from '#lib/reader/reader.svelte.js';
	import { preferredVoices } from '#lib/reader/speech.js';
	import type { PageText } from '#lib/text/pageText.js';
	import type { TextRange } from '#lib/text/segment.js';

	const SAMPLE_PDF_URL = '/sample.pdf';
	const SCALE = 1.5;
	const SPEEDS = [120, 180, 240, 320];
	const SILENT = 'silent';
	/** Space kept between the current word and the edges of the visible area when following it. */
	const FOLLOW_MARGIN_PX = 24;
	const ICON_BUTTON =
		'inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition hover:bg-white hover:text-slate-900 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-sky-500 disabled:pointer-events-none disabled:opacity-35';
	const KEY =
		'rounded border border-slate-300 bg-white px-1.5 py-0.5 font-sans text-[10px] font-semibold text-slate-600 shadow-[0_1px_0_rgb(203_213_225)]';

	const reader = new Reader();

	let pdf = $state<PDFDocumentProxy | null>(null);
	let fileName = $state('sample.pdf');
	let pageNumber = $state(1);
	let loadError = $state<string | null>(null);
	let showAllWords = $state(false);
	let pageText = $state<PageText | null>(null);
	let accuracy = $state<AccuracyComparison | null>(null);
	let voices = $state<SpeechSynthesisVoice[]>([]);
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

	// Reading aloud is opt-in: silent reading (timer) is the default because it behaves the same
	// everywhere, while voices depend on the viewer's system. Voices load asynchronously.
	onMount(() => {
		if (window.speechSynthesis === undefined) return;
		const loadVoices = () => (voices = preferredVoices(speechSynthesis.getVoices()));
		loadVoices();
		speechSynthesis.addEventListener('voiceschanged', loadVoices);
		return () => speechSynthesis.removeEventListener('voiceschanged', loadVoices);
	});

	function handleVoiceChange(value: string) {
		if (value === SILENT) reader.setNarration('silent');
		else reader.setNarration('voice', value);
	}

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

<svelte:head>
	<title>Read-Along PDF</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-b from-slate-50 to-slate-200 text-slate-800 antialiased">
	<header
		bind:this={toolbar}
		class="sticky top-0 z-20 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-slate-200/80 bg-white/80 px-4 py-2.5 text-sm shadow-sm backdrop-blur-md"
	>
		<div class="flex items-center gap-2 pr-2">
			<span
				class="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm"
			>
				<Icon name="logo" class="h-4.5 w-4.5" />
			</span>
			<span class="text-base font-semibold tracking-tight text-slate-900">Read-Along PDF</span>
		</div>

		<label
			class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-slate-900 px-3.5 font-medium text-white shadow-sm transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky-500 hover:bg-slate-700"
		>
			<Icon name="open" />
			<span>Open PDF</span>
			<input type="file" accept="application/pdf" onchange={handleFileChange} class="sr-only" />
		</label>

		<nav
			class="flex items-center gap-0.5 rounded-full bg-slate-100 p-1 ring-1 ring-slate-200"
			aria-label="Pages"
		>
			<button
				class={ICON_BUTTON}
				onclick={() => goToPage(pageNumber - 1)}
				disabled={!pdf || pageNumber <= 1}
				aria-label="Previous page"
				title="Previous page"><Icon name="previousPage" /></button
			>
			<span
				class="min-w-20 text-center text-xs font-medium text-slate-600 tabular-nums"
				data-testid="page-indicator">Page {pageNumber} / {pdf?.numPages ?? '–'}</span
			>
			<button
				class={ICON_BUTTON}
				onclick={() => goToPage(pageNumber + 1)}
				disabled={!pdf || pageNumber >= pdf.numPages}
				aria-label="Next page"
				title="Next page"><Icon name="nextPage" /></button
			>
		</nav>

		<!-- Wraps on narrow screens, so the speed control moves to its own row instead of overflowing. -->
		<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Reading">
			<div class="flex items-center gap-0.5 rounded-full bg-slate-100 p-1 ring-1 ring-slate-200">
				<button
					class={ICON_BUTTON}
					onclick={() => reader.previousSentence()}
					disabled={!reader.words.length}
					aria-label="Previous sentence"
					title="Previous sentence (Shift+←)"><Icon name="previousSentence" /></button
				>
				<button
					class={ICON_BUTTON}
					onclick={() => reader.previousWord()}
					disabled={!reader.words.length}
					aria-label="Previous word"
					title="Previous word (←)"><Icon name="previousWord" /></button
				>
				<button
					class="mx-1 inline-flex h-8 w-24 items-center justify-center gap-1.5 rounded-full bg-sky-600 font-semibold text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
					onclick={() => reader.togglePlay()}
					disabled={!reader.words.length}
					title="Play / pause (Space)"
					><Icon name={reader.playing ? 'pause' : 'play'} />{reader.playing
						? 'Pause'
						: 'Play'}</button
				>
				<button
					class={ICON_BUTTON}
					onclick={() => reader.nextWord()}
					disabled={!reader.words.length}
					aria-label="Next word"
					title="Next word (→)"><Icon name="nextWord" /></button
				>
				<button
					class={ICON_BUTTON}
					onclick={() => reader.nextSentence()}
					disabled={!reader.words.length}
					aria-label="Next sentence"
					title="Next sentence (Shift+→)"><Icon name="nextSentence" /></button
				>
			</div>
			<label class="flex items-center gap-1.5 text-xs font-medium text-slate-600">
				<span>Speed</span>
				<select
					value={reader.wordsPerMinute}
					onchange={(event) => reader.setWordsPerMinute(Number(event.currentTarget.value))}
					class="h-8 rounded-full border-0 bg-slate-100 px-3 text-sm text-slate-800 ring-1 ring-slate-200 focus-visible:outline-2 focus-visible:outline-sky-500"
				>
					{#each SPEEDS as speed (speed)}
						<option value={speed}>{speed} wpm</option>
					{/each}
				</select>
			</label>
			<label class="flex items-center gap-1.5 text-xs font-medium text-slate-600">
				<span class="sr-only sm:not-sr-only">Read aloud</span>
				<select
					value={reader.narration === 'voice' && reader.voiceURI ? reader.voiceURI : SILENT}
					onchange={(event) => handleVoiceChange(event.currentTarget.value)}
					class="h-8 max-w-48 rounded-full border-0 bg-slate-100 px-3 text-sm text-slate-800 ring-1 ring-slate-200 focus-visible:outline-2 focus-visible:outline-sky-500"
					data-testid="voice"
					title="Voices are provided by your operating system and browser"
				>
					<option value={SILENT}>Voice off</option>
					{#each voices as voice (voice.voiceURI)}
						<option value={voice.voiceURI}>{voice.name}</option>
					{/each}
				</select>
			</label>
		</div>

		<label
			class="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 select-none"
		>
			<input type="checkbox" bind:checked={showAllWords} class="h-4 w-4 rounded accent-sky-600" />
			<span>Show all word boxes</span>
		</label>
	</header>

	<div class="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-4">
		<div
			class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500"
			data-testid="reading-status"
		>
			<span
				class="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 shadow-sm ring-1 ring-slate-200"
				>{fileName}</span
			>
			{#if !pageText}
				<span>loading page…</span>
			{:else if reader.words.length === 0}
				<span class="text-amber-700"
					>No selectable text on this page (scanned pages without a text layer are not supported).</span
				>
			{:else}
				<span class="flex items-center gap-2 tabular-nums">
					<span class="h-1.5 w-28 overflow-hidden rounded-full bg-slate-300/70" aria-hidden="true">
						<span
							class="block h-full rounded-full bg-sky-500 transition-[width] duration-200"
							style="width:{((reader.wordIndex + 1) / reader.words.length) * 100}%"
						></span>
					</span>
					word {reader.wordIndex + 1} of {reader.words.length}, sentence
					{(reader.currentWord?.sentenceIndex ?? 0) + 1} of {reader.sentences.length}
				</span>
				<span class="hidden items-center gap-1.5 md:flex">
					click a word to start there ·
					<kbd class={KEY}>Space</kbd> play/pause ·
					<kbd class={KEY}>←</kbd><kbd class={KEY}>→</kbd> word ·
					<kbd class={KEY}>Shift</kbd>+<kbd class={KEY}>←</kbd><kbd class={KEY}>→</kbd> sentence
				</span>
			{/if}
		</div>
		{#if reader.narrationNotice}
			<p
				class="w-fit rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200"
			>
				{reader.narrationNotice}
			</p>
		{/if}
		<p class="sr-only" aria-live="polite" data-testid="announcer">{announcement}</p>
	</div>

	<!-- Only the document scrolls sideways on narrow screens; the controls keep the screen width. -->
	<main bind:this={documentArea} class="overflow-x-auto px-4 py-6">
		<div class="mx-auto w-fit">
			{#if loadError}
				<p
					role="alert"
					class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200"
				>
					{loadError}
				</p>
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
				<p class="flex items-center gap-2 py-24 text-sm text-slate-500">
					<span
						class="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"
					></span>
					Loading…
				</p>
			{/if}
		</div>
	</main>

	{#if pdf && !loadError}
		<div class="mx-auto max-w-5xl px-4 pb-10">
			<AccuracyPanel
				comparison={accuracy}
				{wordText}
				onSelectWord={(wordIndex) => reader.goToWord(wordIndex)}
			/>
		</div>
	{/if}
</div>
