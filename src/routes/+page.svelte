<script lang="ts">
	import type { PDFDocumentProxy } from 'pdfjs-dist';
	import { loadPdf } from '#lib/pdf/pdfjs.js';
	import PdfPage from '#lib/pdf/PdfPage.svelte';
	import type { PageText } from '#lib/text/pageText.js';
	import { splitSentences, splitWords, type Sentence, type Word } from '#lib/text/segment.js';

	const SAMPLE_PDF_URL = '/sample.pdf';
	const SCALE = 1.5;

	let pdf = $state<PDFDocumentProxy | null>(null);
	let sentences = $state<Sentence[]>([]);
	let words = $state<Word[]>([]);
	let currentWordIndex = $state(40);

	const currentWord = $derived(words[currentWordIndex] ?? null);
	const currentSentence = $derived(currentWord ? sentences[currentWord.sentenceIndex] : null);

	loadPdf({ url: SAMPLE_PDF_URL }).then((loaded) => (pdf = loaded));

	function handleTextReady(pageText: PageText) {
		sentences = splitSentences(pageText.text);
		words = splitWords(pageText.text, sentences);
	}
</script>

<main class="flex min-h-screen flex-col items-center gap-4 bg-slate-100 p-6">
	{#if pdf}
		<PdfPage
			{pdf}
			pageNumber={1}
			scale={SCALE}
			sentenceRange={currentSentence}
			wordRange={currentWord}
			onTextReady={handleTextReady}
		/>
	{:else}
		<p>Loading…</p>
	{/if}
</main>
