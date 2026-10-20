<script lang="ts">
	import type { Box } from './rects';

	interface Props {
		sentenceBoxes: Box[];
		wordBoxes: Box[];
		outlineBoxes: Box[];
	}

	let { sentenceBoxes, wordBoxes, outlineBoxes }: Props = $props();

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
	{#each outlineBoxes as box, i (i)}
		<div class="box outline" style={boxStyle(box)}></div>
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
		border-radius: 3px;
	}
	.sentence {
		background: rgb(186 230 253 / 0.85); /* sky-200 */
	}
	.word {
		background: rgb(56 189 248 / 0.75); /* sky-400 */
		box-shadow: 0 0 0 1px rgb(14 165 233 / 0.5);
	}
	.outline {
		outline: 1px solid rgb(99 102 241 / 0.75); /* indigo-500 */
		border-radius: 0;
	}
</style>
