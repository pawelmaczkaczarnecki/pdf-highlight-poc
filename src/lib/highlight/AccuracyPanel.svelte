<script lang="ts">
	import type { AccuracyComparison, AccuracyReport } from './accuracy.js';

	interface Props {
		comparison: AccuracyComparison | null;
		wordText: (wordIndex: number) => string;
		onSelectWord: (wordIndex: number) => void;
	}

	let { comparison, wordText, onSelectWord }: Props = $props();

	const px = (value: number) => `${value.toFixed(1)} px`;
	// Rounded down, so 763 of 764 words never reads as "100%".
	const percent = (value: number) => `${Math.floor(value * 1000) / 10}%`;

	// The highlights use glyph positions; the text-layer-only boxes are shown as the baseline they
	// improve on.
	const rows = $derived(
		comparison
			? [
					{ id: 'b', label: 'Glyph positions (used)', report: comparison.glyphs },
					{ id: 'a', label: 'Text layer only (baseline)', report: comparison.textLayer }
				]
			: []
	) as Array<{ id: string; label: string; report: AccuracyReport }>;
</script>

<section
	class="mx-4 mt-2 overflow-x-auto rounded border border-slate-200 bg-white px-3 py-2 text-xs"
	aria-label="Highlight accuracy"
	data-testid="accuracy-report"
>
	{#if !comparison}
		<p class="text-slate-500">Measuring highlight accuracy…</p>
	{:else if comparison.textLayer.measured === 0}
		<p class="text-slate-500">No words to measure on this page.</p>
	{:else}
		<p>
			<span class="font-medium">Estimated horizontal accuracy on this page</span>
			<span class="text-slate-500">
				— left/right word box edges vs. letter ink on the rendered page, on the same
				<span data-testid="accuracy-measured">{comparison.textLayer.measured}</span> of
				{comparison.textLayer.words} words for both. Glyph positions were used for
				<span data-testid="accuracy-glyph-words">{comparison.glyphPositionsUsed}</span> words (the rest
				fall back to the text layer).</span
			>
		</p>
		<table class="mt-1 w-full text-left tabular-nums">
			<thead class="text-slate-500">
				<tr>
					<th class="pr-3 font-normal">Box edges from</th>
					<th class="pr-3 font-normal">median</th>
					<th class="pr-3 font-normal">95% within</th>
					<th class="pr-3 font-normal">≤ 2 px</th>
					<th class="pr-3 font-normal">max</th>
					<th class="font-normal">largest errors</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.id)}
					<tr class={row.id === 'b' ? 'font-medium' : 'text-slate-500'}>
						<td class="pr-3">{row.label}</td>
						<td class="pr-3" data-testid="accuracy-median-{row.id}">{px(row.report.medianPx)}</td>
						<td class="pr-3">{px(row.report.p95Px)}</td>
						<td class="pr-3" data-testid="accuracy-within-2px-{row.id}"
							>{percent(row.report.within2Px)}</td
						>
						<td class="pr-3" data-testid="accuracy-max-{row.id}">{px(row.report.maxPx)}</td>
						<td>
							{#each row.report.worst.slice(0, 3) as word (word.wordIndex)}
								<button
									class="mr-1 rounded bg-amber-100 px-1 font-normal text-amber-900 hover:bg-amber-200"
									onclick={() => onSelectWord(word.wordIndex)}
									title="Highlight this word"
									>{wordText(word.wordIndex)} ({px(word.errorPx)})</button
								>
							{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
