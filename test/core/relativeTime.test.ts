import { describe, expect, it } from 'vitest';
import { formatRelative } from '../../src/core/relativeTime';

describe('formatRelative', () => {
  it('says "now" under a minute', () => {
    expect(formatRelative(30_000)).toBe('now');
  });

  it('uses minutes, hours and days', () => {
    expect(formatRelative(27 * 60_000)).toBe('27m');
    expect(formatRelative(3 * 3_600_000)).toBe('3h');
    expect(formatRelative(26 * 3_600_000)).toBe('1d');
  });
});
