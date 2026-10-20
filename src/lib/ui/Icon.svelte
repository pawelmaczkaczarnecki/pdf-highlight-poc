<script lang="ts" module>
	/** Small inline icons (24×24, stroked with the current text colour); no icon library needed. */
	const PATHS = {
		logo: 'M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z',
		open: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 17v-6M9 14l3-3 3 3',
		previousPage: 'M19 12H5M12 19l-7-7 7-7',
		nextPage: 'M5 12h14M12 5l7 7-7 7',
		previousSentence: 'M19 20 9 12l10-8zM5 19V5',
		previousWord: 'M15 18l-6-6 6-6',
		nextWord: 'M9 18l6-6-6-6',
		nextSentence: 'M5 4l10 8-10 8zM19 5v14',
		play: 'M8 5v14l11-7z',
		pause: 'M7 5h3v14H7zM14 5h3v14h-3z'
	} as const;

	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	let { name, class: className = 'h-4 w-4' }: { name: IconName; class?: string } = $props();
	const filled = $derived(name === 'play' || name === 'pause');
</script>

<svg
	class={className}
	viewBox="0 0 24 24"
	fill={filled ? 'currentColor' : 'none'}
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d={PATHS[name]} />
</svg>
