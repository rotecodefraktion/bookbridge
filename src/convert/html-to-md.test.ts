import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, ConversionContext } from './html-to-md';

const defaultContext: ConversionContext = {
  baseUrl: 'http://bookstack.local:6875',
  slugToTitle: new Map(),
};

describe('htmlToMarkdown', () => {
  it('converts basic paragraph', () => {
    const result = htmlToMarkdown('<p>Hello world</p>', defaultContext);
    expect(result.trim()).toBe('Hello world');
  });

  it('converts heading', () => {
    const result = htmlToMarkdown('<h2>Title</h2>', defaultContext);
    expect(result.trim()).toBe('## Title');
  });

  it('converts callout outside table', () => {
    const result = htmlToMarkdown(
      '<p class="callout danger">Important warning</p>',
      defaultContext,
    );
    expect(result).toContain('> [!danger]');
    expect(result).toContain('Important warning');
  });

  it('converts callout INSIDE table cell to inline emoji', () => {
    const html = `
      <table>
        <tr><th>Name</th><th>Status</th></tr>
        <tr><td>Item 1</td><td><p class="callout danger">open</p></td></tr>
      </table>
    `;
    const result = htmlToMarkdown(html, defaultContext);
    // Should NOT contain block-level callout syntax inside table
    expect(result).not.toContain('> [!danger]');
    // Should contain emoji indicator
    expect(result).toContain('🔴');
    expect(result).toContain('open');
  });

  it('converts code block with language', () => {
    const result = htmlToMarkdown(
      '<pre><code class="language-typescript">const x = 1;</code></pre>',
      defaultContext,
    );
    expect(result).toContain('```typescript');
    expect(result).toContain('const x = 1;');
  });

  it('converts linked image to plain image (strips <a> wrapper)', () => {
    const html = '<a href="http://bookstack.local:6875/uploads/images/gallery/img.png"><img src="http://bookstack.local:6875/uploads/images/gallery/img.png" alt="photo"></a>';
    const result = htmlToMarkdown(html, defaultContext);
    // Should be plain image, NOT [![photo](url)](url)
    expect(result).toContain('![photo](http://bookstack.local:6875/uploads/images/gallery/img.png)');
    expect(result).not.toContain('[![');
  });

  it('converts internal link to wikilink when in slug map', () => {
    const ctx: ConversionContext = {
      baseUrl: 'http://bookstack.local:6875',
      slugToTitle: new Map([['my-page', 'My Page']]),
    };
    const result = htmlToMarkdown(
      '<a href="/books/my-book/page/my-page">My Page</a>',
      ctx,
    );
    expect(result.trim()).toBe('[[My Page]]');
  });

  it('preserves external link as full URL when not in slug map', () => {
    const result = htmlToMarkdown(
      '<a href="/books/my-book/page/unknown-page">Click here</a>',
      defaultContext,
    );
    expect(result).toContain('http://bookstack.local:6875/books/my-book/page/unknown-page');
  });

  it('returns empty for empty input', () => {
    expect(htmlToMarkdown('', defaultContext)).toBe('');
    expect(htmlToMarkdown('   ', defaultContext)).toBe('');
  });

  it('returns HTML code block on conversion failure', () => {
    // Force an error by passing null (the function should catch it)
    const result = htmlToMarkdown(null as unknown as string, defaultContext);
    expect(result).toBe('');
  });

  it('converts details/summary to foldable callout', () => {
    const html = '<details><summary>Click me</summary><p>Hidden content</p></details>';
    const result = htmlToMarkdown(html, defaultContext);
    expect(result).toContain('> [!example]- Click me');
    expect(result).toContain('Hidden content');
  });
});
