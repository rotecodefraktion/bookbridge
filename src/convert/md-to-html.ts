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

  // Pre-process: draw.io thumbnail links → HTML comments (preserve drawings)
  html = convertDrawioLinks(html);

  // Pre-process: YouTube thumbnail links and bare URLs → iframes
  html = convertYouTubeLinks(html);

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

/** draw.io thumbnail links → HTML comments (preserve drawings in BookStack) */
function convertDrawioLinks(md: string): string {
  // [![draw.io: alt](local-path)](baseUrl/link/ID) → HTML comment
  const drawioRegex = /\[!\[draw\.io: ([^\]]*)\]\([^)]+\)\]\(([^)]*\/link\/(\d+))\)/g;
  return md.replace(drawioRegex, (_match, _alt: string, _link: string, id: string) => {
    return `<!-- BookBridge: draw.io diagram ${id} preserved -->`;
  });
}

/** YouTube thumbnail links and bare URLs → iframe embeds */
function convertYouTubeLinks(md: string): string {
  // Convert thumbnail links: [![YouTube](thumbnail)](youtube-url) → iframe
  md = md.replace(
    /\[!\[YouTube\]\(https:\/\/img\.youtube\.com\/vi\/([^/]+)\/[^)]+\)\]\(https:\/\/www\.youtube\.com\/watch\?v=\1\)/g,
    '<iframe src="https://www.youtube.com/embed/$1" width="560" height="315" frameborder="0" allowfullscreen></iframe>',
  );

  // Convert bare YouTube URLs on their own line → iframe
  md = md.replace(
    /^(https:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+).*)$/gm,
    '<iframe src="https://www.youtube.com/embed/$2" width="560" height="315" frameborder="0" allowfullscreen></iframe>',
  );

  // Convert youtu.be short URLs on their own line → iframe
  md = md.replace(
    /^(https:\/\/youtu\.be\/([a-zA-Z0-9_-]+).*)$/gm,
    '<iframe src="https://www.youtube.com/embed/$2" width="560" height="315" frameborder="0" allowfullscreen></iframe>',
  );

  return md;
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
 * YouTube iframes are preserved as they are safe embedded content.
 */
function stripDangerousTags(html: string): string {
  // Protect YouTube iframes by replacing them with placeholders
  const youtubeIframes: string[] = [];
  let result = html.replace(
    /<iframe[^>]+src="https:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\/[^"]*"[^>]*>[\s\S]*?<\/iframe>/gi,
    (match) => {
      youtubeIframes.push(match);
      return `__YOUTUBE_IFRAME_${youtubeIframes.length - 1}__`;
    },
  );

  // Strip dangerous tags
  result = result
    .replace(/<(script|iframe|object|embed|form|input)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|iframe|object|embed|form|input)[^>]*\/?>/gi, '');

  // Restore YouTube iframes
  for (let i = 0; i < youtubeIframes.length; i++) {
    result = result.replace(`__YOUTUBE_IFRAME_${i}__`, youtubeIframes[i]);
  }

  return result;
}
