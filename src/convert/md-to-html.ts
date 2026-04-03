export interface ReverseConversionContext {
  baseUrl: string;
  /** Map of local page title → BookStack page path (for wikilink rewriting) */
  titleToPath: Map<string, string>;
  /** Map of local asset path → BookStack image URL */
  assetToUrl: Map<string, string>;
}

/**
 * Convert Obsidian Markdown to BookStack-compatible HTML.
 * Uses a simple regex-based approach to avoid heavy dependencies.
 * For complex cases, a proper parser (marked/showdown) should be used.
 */
export function markdownToHtml(
  markdown: string,
  context: ReverseConversionContext,
): string {
  if (!markdown || !markdown.trim()) return '';

  let html = markdown;

  // Pre-process: Obsidian callouts → BookStack callouts
  html = convertCallouts(html);

  // Pre-process: Wikilinks → HTML links
  html = convertWikilinks(html, context);

  // Pre-process: Local image paths → BookStack URLs
  html = convertLocalImages(html, context);

  // Convert markdown to HTML using basic rules
  html = convertBasicMarkdown(html);

  return html;
}

/** Obsidian Callouts → BookStack Callout paragraphs */
function convertCallouts(md: string): string {
  // Match > [!type]\n> content lines
  const calloutRegex = /^> \[!(info|warning|danger|success)\]\s*\n((?:^>.*\n?)*)/gm;

  return md.replace(calloutRegex, (_match, type: string, body: string) => {
    const content = body
      .split('\n')
      .map((line: string) => line.replace(/^>\s?/, ''))
      .join('\n')
      .trim();
    return `<p class="callout ${type}">${content}</p>\n`;
  });
}

/** Obsidian Wikilinks → HTML anchor tags */
function convertWikilinks(
  md: string,
  context: ReverseConversionContext,
): string {
  // [[Title|Display]] or [[Title]]
  return md.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, title: string, display: string | undefined) => {
      const linkText = display || title;
      const path = context.titleToPath.get(title);
      if (path) {
        return `<a href="${context.baseUrl}${path}">${linkText}</a>`;
      }
      // No mapping → keep as plain text
      return linkText;
    },
  );
}

/** Local image paths → BookStack image URLs */
function convertLocalImages(
  md: string,
  context: ReverseConversionContext,
): string {
  // ![alt](local/path.png)
  return md.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, alt: string, src: string) => {
      const bookstackUrl = context.assetToUrl.get(src);
      if (bookstackUrl) {
        return `![${alt}](${bookstackUrl})`;
      }
      return _match; // keep original if no mapping
    },
  );
}

/**
 * Basic Markdown → HTML conversion.
 * This is a simplified converter. For production use with complex markdown,
 * consider using marked or showdown.
 */
function convertBasicMarkdown(md: string): string {
  let html = md;

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Code blocks
  html = html.replace(
    /^(`{3,4})(\w*)\n([\s\S]*?)^\1$/gm,
    (_match, _fence: string, lang: string, code: string) => {
      const cls = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${cls}>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`;
    },
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');

  // Images (remaining after local image conversion)
  html = html.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1">',
  );

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
  );

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');

  // Blockquotes (not callouts, which were already converted)
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // Paragraphs: wrap remaining plain text lines
  html = html.replace(/^(?!<[a-z/]|$)(.+)$/gm, '<p>$1</p>');

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
