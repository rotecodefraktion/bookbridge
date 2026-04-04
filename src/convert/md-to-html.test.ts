import { describe, it, expect } from 'vitest';
import { markdownToHtml, ReverseConversionContext } from './md-to-html';

const defaultContext: ReverseConversionContext = {
  baseUrl: 'http://bookstack.local:6875',
  titleToPath: new Map(),
  assetToUrl: new Map(),
};

describe('markdownToHtml', () => {
  it('converts heading', () => {
    const result = markdownToHtml('## My Title', defaultContext);
    expect(result).toContain('<h2>My Title</h2>');
  });

  it('converts bold', () => {
    const result = markdownToHtml('**bold**', defaultContext);
    expect(result).toContain('<strong>bold</strong>');
  });

  it('converts italic', () => {
    const result = markdownToHtml('*italic*', defaultContext);
    expect(result).toContain('<em>italic</em>');
  });

  it('converts inline code', () => {
    const result = markdownToHtml('use `code` here', defaultContext);
    expect(result).toContain('<code>code</code>');
  });

  it('converts fenced code block', () => {
    const md = '```typescript\nconst x = 1;\n```';
    const result = markdownToHtml(md, defaultContext);
    expect(result).toContain('<pre><code class="language-typescript">');
    expect(result).toContain('const x = 1;');
  });

  it('converts link', () => {
    const result = markdownToHtml('[Guide](https://example.com)', defaultContext);
    expect(result).toContain('<a href="https://example.com">Guide</a>');
  });

  it('converts image', () => {
    const result = markdownToHtml('![alt](https://example.com/img.png)', defaultContext);
    expect(result).toContain('<img src="https://example.com/img.png" alt="alt">');
  });

  it('converts callout to BookStack callout paragraph', () => {
    const md = '> [!danger]\n> Important warning';
    const result = markdownToHtml(md, defaultContext);
    expect(result).toContain('<p class="callout danger">');
    expect(result).toContain('Important warning');
  });

  it('converts wikilink to HTML anchor when in map', () => {
    const ctx: ReverseConversionContext = {
      baseUrl: 'http://bookstack.local:6875',
      titleToPath: new Map([['My Page', '/link/42']]),
      assetToUrl: new Map(),
    };
    const result = markdownToHtml('See [[My Page]]', ctx);
    expect(result).toContain('<a href="http://bookstack.local:6875/link/42">My Page</a>');
  });

  it('returns empty for empty input', () => {
    expect(markdownToHtml('', defaultContext)).toBe('');
    expect(markdownToHtml('   ', defaultContext)).toBe('');
  });
});
