import { describe, it, expect } from 'vitest';

describe('navigation line', () => {
  const NAV_REGEX = /^↑ \[\[.*\]\].*\n\n?/;

  it('strips full nav line from content', () => {
    const content = '↑ [[FRUN Setup]] · ← [[FRUN decision model]] · → [[FRUN vs CCT]]\n\n# DRDB Setup\n\nContent here';
    const stripped = content.replace(NAV_REGEX, '');
    expect(stripped).toBe('# DRDB Setup\n\nContent here');
  });

  it('strips nav line with only next link', () => {
    const content = '↑ [[FRUN Setup]] · → [[FRUN Security]]\n\n# First Page\n\nContent';
    const stripped = content.replace(NAV_REGEX, '');
    expect(stripped).toBe('# First Page\n\nContent');
  });

  it('strips nav line with only prev link', () => {
    const content = '↑ [[FRUN Setup]] · ← [[FRUN Security]]\n\n# Last Page\n\nContent';
    const stripped = content.replace(NAV_REGEX, '');
    expect(stripped).toBe('# Last Page\n\nContent');
  });

  it('strips nav line for single page in chapter', () => {
    const content = '↑ [[Azure Dokumentation]]\n\n# Network Landscape\n\nContent';
    const stripped = content.replace(NAV_REGEX, '');
    expect(stripped).toBe('# Network Landscape\n\nContent');
  });

  it('preserves content without nav line', () => {
    const content = '# DRDB Setup\n\nContent here';
    const stripped = content.replace(NAV_REGEX, '');
    expect(stripped).toBe(content);
  });

  it('does not strip partial matches in middle of content', () => {
    const content = '# Title\n\nSome text with ↑ [[link]] in it\n\nMore';
    const stripped = content.replace(NAV_REGEX, '');
    expect(stripped).toBe(content);
  });

  it('handles nav line with single newline', () => {
    const content = '↑ [[Parent]]\n# Title';
    const stripped = content.replace(NAV_REGEX, '');
    expect(stripped).toBe('# Title');
  });
});
