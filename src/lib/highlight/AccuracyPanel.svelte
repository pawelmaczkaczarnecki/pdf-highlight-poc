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
					{ id: 'glyphs', label: 'Glyph positions (used)', report: comparison.glyphs },
					{ id: 'text-layer', label: 'Text layer only (baseline)', report: comparison.textLayer }
				]
			: []
	) as Array<{ id: string; label: string; report: AccuracyReport }>;
</script>

<section
	class="rounded-xl bg-white/90 px-4 py-3 text-xs shadow-sm ring-1 ring-slate-200"
	aria-label="Highlight accuracy"
	data-testid="accuracy-report"
>
	{#if !comparison}
		<p class="flex items-center gap-2 text-slate-500">
			<span class="h-3 w-3 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"
			></span>
			Measuring highlight accuracy…
		</p>
	{:else if comparison.textLayer.measured === 0}
		<p class="text-slate-500">No words to measure on this page.</p>
	{:else}
		<p class="text-slate-600">
			<span class="font-semibold text-slate-900">Highlight accuracy on this page</span>
			<span class="text-slate-500">
				— left/right word box edges vs. letter ink on the rendered page, on the same
				<span data-testid="accuracy-measured">{comparison.textLayer.measured}</span> of
				{comparison.textLayer.words} words for both. Glyph positions were used for
				<span data-testid="accuracy-glyph-words">{comparison.glyphPositionsUsed}</span> words (the rest
				fall back to the text layer).</span
			>
		</p>
		<div class="mt-2 overflow-x-auto">
			<table class="w-full text-left tabular-nums">
				<thead class="text-[11px] tracking-wide text-slate-400 uppercase">
					<tr>
						<th class="py-1 pr-4 font-medium">Box edges from</th>
						<th class="py-1 pr-4 font-medium">median</th>
						<th class="py-1 pr-4 font-medium">95% within</th>
						<th class="py-1 pr-4 font-medium">≤ 2 px</th>
						<th class="py-1 pr-4 font-medium">max</th>
						<th class="py-1 font-medium">largest errors</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.id)}
						<tr class={row.id === 'glyphs' ? 'text-slate-900' : 'text-slate-400'}>
							<td class="py-1 pr-4">
								<span class="inline-flex items-center gap-1.5 font-medium">
									<span
										class="h-2 w-2 rounded-full {row.id === 'glyphs'
											? 'bg-sky-500'
											: 'bg-slate-300'}"
									></span>
									{row.label}
								</span>
							</td>
							<td class="py-1 pr-4 font-semibold" data-testid="accuracy-median-{row.id}"
								>{px(row.report.medianPx)}</td
							>
							<td class="py-1 pr-4">{px(row.report.p95Px)}</td>
							<td class="py-1 pr-4" data-testid="accuracy-within-2px-{row.id}"
								>{percent(row.report.within2Px)}</td
							>
							<td class="py-1 pr-4" data-testid="accuracy-max-{row.id}">{px(row.report.maxPx)}</td>
							<td class="py-1">
								<span class="flex flex-wrap gap-1">
									{#each row.report.worst.slice(0, 3) as word (word.wordIndex)}
										<button
											class="rounded-full px-2 py-0.5 font-normal ring-1 transition {row.id ===
											'glyphs'
												? 'bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100'
												: 'bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100'}"
											onclick={() => onSelectWord(word.wordIndex)}
											title="Highlight this word"
											>{wordText(word.wordIndex)} · {px(word.errorPx)}</button
										>
									{/each}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
