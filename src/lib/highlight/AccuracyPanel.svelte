<script lang="ts">
	import type { AccuracyReport } from './accuracy.js';

	interface Props {
		report: AccuracyReport | null;
		wordText: (wordIndex: number) => string;
		onSelectWord: (wordIndex: number) => void;
	}

	let { report, wordText, onSelectWord }: Props = $props();

	const px = (value: number) => `${value.toFixed(1)} px`;
	const percent = (value: number) => `${Math.round(value * 100)}%`;
</script>

<section
	class="mx-4 mt-2 rounded border border-slate-200 bg-white px-3 py-2 text-xs"
	aria-label="Highlight accuracy"
	data-testid="accuracy-report"
>
	{#if !report}
		<p class="text-slate-500">Measuring highlight accuracy…</p>
	{:else if report.measured === 0}
		<p class="text-slate-500">No words to measure on this page.</p>
	{:else}
		<p>
			<span class="font-medium">Estimated horizontal accuracy on this page</span>
			<span class="text-slate-500">
				(left/right word box edges vs. letter ink on the rendered page;
				<span data-testid="accuracy-measured">{report.measured}</span> of {report.words} words could be
				measured):</span
			>
			median error <strong data-testid="accuracy-median">{px(report.medianPx)}</strong>, 95% of
			words within <strong>{px(report.p95Px)}</strong>,
			<strong data-testid="accuracy-within-2px">{percent(report.within2Px)}</strong> within 2 px.
		</p>
		<p class="mt-1 text-slate-500">
			Largest errors:
			{#each report.worst as word (word.wordIndex)}
				<button
					class="mr-1 rounded bg-amber-100 px-1 text-amber-900 hover:bg-amber-200"
					onclick={() => onSelectWord(word.wordIndex)}
					title="Highlight this word">{wordText(word.wordIndex)} ({px(word.errorPx)})</button
				>
			{/each}
		</p>
	{/if}
</section>
