import { marked } from 'marked';

export interface ReverseConversionContext {
  baseUrl: string;
  /** Map of local page title → BookStack page path (for wikilink rewriting) */
  titleToPath: Map<string, string>;
  /** Map of local asset path → BookStack image URL */
  assetToUrl: Map<string, string>;
}

/**
 * Convert Obsidian Markdown to BookStack-compatible HTML.
 * Pre-processes callouts, wikilinks, and local images, then uses
 * the marked library for robust Markdown → HTML conversion.
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

  // Security: strip dangerous tags for defense-in-depth
  html = stripDangerousTags(html);

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
 * Convert Markdown to HTML using the marked library.
 * Replaces the previous regex-based approach for robust handling of
 * footnotes, definition lists, nested lists, and other edge cases.
 */
function convertBasicMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/**
 * Strip dangerous HTML tags (script, iframe, object, embed, form, input)
 * for defense-in-depth. BookStack sanitizes server-side, but we prevent
 * dangerous content from being generated in the first place.
 */
function stripDangerousTags(html: string): string {
  return html
    .replace(/<(script|iframe|object|embed|form|input)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|iframe|object|embed|form|input)[^>]*\/?>/gi, '');
}
