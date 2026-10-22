import { describe, expect, it } from 'vitest';
import { withTimeout } from '../../src/core/async';

describe('withTimeout', () => {
  it('gives the value when it comes in time', async () => {
    expect(await withTimeout(Promise.resolve(7), 50, undefined)).toBe(7);
  });

  it('gives the fallback when the value is too slow', async () => {
    const never = new Promise<number>(() => undefined);
    expect(await withTimeout(never, 10, -1)).toBe(-1);
  });

  it('gives the fallback when the promise fails', async () => {
    expect(await withTimeout(Promise.reject(new Error('x')), 50, -1)).toBe(-1);
  });
});
