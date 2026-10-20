<script lang="ts">
	import type { Box } from './rects';

	let { sentenceBoxes, wordBoxes }: { sentenceBoxes: Box[]; wordBoxes: Box[] } = $props();

	function boxStyle(box: Box): string {
		return `left:${box.left}px;top:${box.top}px;width:${box.right - box.left}px;height:${box.bottom - box.top}px`;
	}
</script>

<!-- Our own layer above the native PDF.js layers. It never takes clicks, so text selection
     and click-to-read keep working on the text layer underneath. -->
<div class="highlightLayer" aria-hidden="true">
	{#each sentenceBoxes as box, i (i)}
		<div class="box sentence" data-testid="sentence-box" style={boxStyle(box)}></div>
	{/each}
	{#each wordBoxes as box, i (i)}
		<div class="box word" data-testid="word-box" style={boxStyle(box)}></div>
	{/each}
</div>

<style>
	.highlightLayer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 2;
		/* Multiply darkens the colour under the text instead of covering it. */
		mix-blend-mode: multiply;
	}
	.box {
		position: absolute;
		border-radius: 2px;
	}
	.sentence {
		background: rgb(191 219 254);
	}
	.word {
		background: rgb(96 165 250);
	}
</style>
