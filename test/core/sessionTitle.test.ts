import { describe, expect, it } from 'vitest';
import { extractSessionTitle } from '../../src/core/sessionTitle';

const AI_1 = '{"type":"ai-title","aiTitle":"First"}';
const AI_2 = '{"type":"ai-title","aiTitle":"Second"}';
const CUSTOM = '{"type":"custom-title","customTitle":"Mine"}';

describe('extractSessionTitle', () => {
  it("uses Claude's latest title and skips broken lines", () => {
    expect(extractSessionTitle([AI_1, '{broken', AI_2].join('\n'))).toBe('Second');
  });

  it('prefers a title the user set', () => {
    expect(extractSessionTitle([CUSTOM, AI_1, AI_2].join('\n'))).toBe('Mine');
  });

  it('returns undefined when there is no title', () => {
    expect(extractSessionTitle('{"type":"user"}\n')).toBeUndefined();
  });
});
