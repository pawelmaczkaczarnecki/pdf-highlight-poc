<script lang="ts">
	import type { PositionSource } from '#lib/pdf/renderedPage.js';
	import type { AccuracyComparison, AccuracyReport } from './accuracy.js';

	interface Props {
		comparison: AccuracyComparison | null;
		active: PositionSource;
		wordText: (wordIndex: number) => string;
		onSelectWord: (wordIndex: number) => void;
	}

	let { comparison, active, wordText, onSelectWord }: Props = $props();

	const px = (value: number) => `${value.toFixed(1)} px`;
	// Rounded down, so 763 of 764 words never reads as "100%".
	const percent = (value: number) => `${Math.floor(value * 1000) / 10}%`;

	const rows = $derived(
		comparison
			? [
					{ source: 'text-layer', id: 'a', label: 'A · text layer', report: comparison.textLayer },
					{ source: 'glyphs', id: 'b', label: 'B · glyph positions', report: comparison.glyphs }
				]
			: []
	) as Array<{ source: PositionSource; id: string; label: string; report: AccuracyReport }>;
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
				{comparison.textLayer.words} words for both. B used glyph positions for
				<span data-testid="accuracy-glyph-words">{comparison.glyphPositionsUsed}</span> words (the rest
				fall back to A).</span
			>
		</p>
		<table class="mt-1 w-full text-left tabular-nums">
			<thead class="text-slate-500">
				<tr>
					<th class="pr-3 font-normal">Box edges</th>
					<th class="pr-3 font-normal">median</th>
					<th class="pr-3 font-normal">95% within</th>
					<th class="pr-3 font-normal">≤ 2 px</th>
					<th class="pr-3 font-normal">max</th>
					<th class="font-normal">largest errors</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.id)}
					<tr class={row.source === active ? 'font-medium' : ''}>
						<td class="pr-3">{row.label}{row.source === active ? ' (shown)' : ''}</td>
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
