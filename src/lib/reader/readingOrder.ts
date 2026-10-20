import type { TextBlock } from '#lib/text/pageText.js';
import type { Sentence } from '#lib/text/segment.js';

/**
 * Puts sentences in reading order (by their block's `readingRank`) and drops those in running
 * headers and footers. Sentences never cross a block break, so each belongs to one block.
 * Indexes are renumbered; without blocks the content order is kept.
 */
export function orderSentences(sentences: Sentence[], blocks: TextBlock[]): Sentence[] {
	if (blocks.length === 0) return sentences;
	const blockOf = (offset: number) =>
		blocks.find((block) => offset >= block.start && offset < block.end);

	return sentences
		.map((sentence) => ({ sentence, block: blockOf(sentence.start) }))
		.filter(({ block }) => !block?.isPageFurniture)
		.sort(
			(a, b) =>
				(a.block?.readingRank ?? Infinity) - (b.block?.readingRank ?? Infinity) ||
				a.sentence.start - b.sentence.start
		)
		.map(({ sentence }, index) => ({ ...sentence, index }));
}
