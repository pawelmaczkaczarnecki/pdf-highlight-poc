import { describe, expect, it } from 'vitest';
import type { TextRange } from './segment';

describe('TextRange', () => {
	it('describes a half-open character range', () => {
		const range: TextRange = { start: 0, end: 5 };
		expect('Hello world'.slice(range.start, range.end)).toBe('Hello');
	});
});
