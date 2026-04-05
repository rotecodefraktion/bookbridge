import TurndownService from 'turndown';
import { gfm } from '@joplin/turndown-plugin-gfm';

export interface ConversionContext {
  baseUrl: string;
  /** Map of BookStack page slug → local vault page title (for internal link rewriting) */
  slugToTitle: Map<string, string>;
}

export function createTurndownService(context: ConversionContext): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });

  turndown.use(gfm);

  addYouTubeRule(turndown);
  addCalloutRule(turndown);
  addCodeBlockRule(turndown);
  addDetailsSummaryRule(turndown);
  addLinkedImageRule(turndown);
  addInternalLinkRule(turndown, context);
  addDrawingRule(turndown, context);
  addComplexTableWarningRule(turndown);

  return turndown;
}

export function htmlToMarkdown(html: string, context: ConversionContext): string {
  if (!html || !html.trim()) return '';

  const turndown = createTurndownService(context);

  try {
    return turndown.turndown(html);
  } catch (error) {
    // Fallback: embed as HTML code block
    const message = error instanceof Error ? error.message : String(error);
    return [
      '<!-- BookBridge: Konvertierung fehlgeschlagen -->',
      `<!-- Error: ${message} -->`,
      '```html',
      html,
      '```',
    ].join('\n');
  }
}

/** YouTube iframes → Markdown thumbnail links */
function addYouTubeRule(turndown: TurndownService): void {
  turndown.addRule('youtube-embed', {
    filter: (node: HTMLElement) => {
      if (node.nodeName !== 'IFRAME') return false;
      const src = node.getAttribute('src') || '';
      return /youtube\.com\/embed\/|youtube-nocookie\.com\/embed\//.test(src);
    },
    replacement: (_content: string, node: Node) => {
      const el = node as HTMLElement;
      const src = el.getAttribute('src') || '';
      const videoId = src.match(/embed\/([^?&#]+)/)?.[1];
      if (!videoId) return '';
      return `\n[![YouTube](https://img.youtube.com/vi/${videoId}/maxresdefault.jpg)](https://www.youtube.com/watch?v=${videoId})\n`;
    },
  });
}

/** BookStack Callouts → Obsidian Callouts (or inline if inside a table) */
function addCalloutRule(turndown: TurndownService): void {
  turndown.addRule('bookstack-callout', {
    filter: (node: HTMLElement) => {
      return (
        node.nodeName === 'P' &&
        node.classList.contains('callout') &&
        hasCalloutType(node)
      );
    },
    replacement: (content: string, node: Node) => {
      const el = node as HTMLElement;
      const type = getCalloutType(el);
      const text = content.trim();

      // Inside a table cell: callout block syntax doesn't work, use inline badge
      if (isInsideTable(el)) {
        const emoji = calloutEmoji(type);
        return text ? `${emoji} ${text}` : emoji;
      }

      const lines = text.split('\n');
      const body = lines.map((line) => `> ${line}`).join('\n');
      return `\n> [!${type}]\n${body}\n\n`;
    },
  });
}

function isInsideTable(node: HTMLElement): boolean {
  let current: HTMLElement | null = node.parentElement;
  while (current) {
    if (current.nodeName === 'TD' || current.nodeName === 'TH') return true;
    current = current.parentElement;
  }
  return false;
}

function calloutEmoji(type: string): string {
  switch (type) {
    case 'danger': return '🔴';
    case 'warning': return '🟡';
    case 'success': return '🟢';
    case 'info': return '🔵';
    default: return '🔵';
  }
}

function hasCalloutType(node: HTMLElement): boolean {
  return (
    node.classList.contains('info') ||
    node.classList.contains('warning') ||
    node.classList.contains('danger') ||
    node.classList.contains('success')
  );
}

function getCalloutType(node: HTMLElement): string {
  if (node.classList.contains('warning')) return 'warning';
  if (node.classList.contains('danger')) return 'danger';
  if (node.classList.contains('success')) return 'success';
  return 'info';
}

/** Code blocks with language preservation */
function addCodeBlockRule(turndown: TurndownService): void {
  turndown.addRule('fenced-code-with-language', {
    filter: (node: HTMLElement) => {
      return (
        node.nodeName === 'PRE' &&
        node.firstChild !== null &&
        (node.firstChild as HTMLElement).nodeName === 'CODE'
      );
    },
    replacement: (_content: string, node: Node) => {
      const codeEl = (node as HTMLElement).querySelector('code');
      if (!codeEl) return _content;

      const code = codeEl.textContent || '';
      const lang = extractLanguage(codeEl);
      const fence = code.includes('```') ? '````' : '```';

      return `\n${fence}${lang}\n${code.replace(/\n$/, '')}\n${fence}\n\n`;
    },
  });
}

function extractLanguage(codeEl: HTMLElement): string {
  const className = codeEl.getAttribute('class') || '';
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : '';
}

/**
 * Strip <a> wrappers around <img> tags.
 * BookStack wraps images in links (often to the image itself).
 * Without this rule, Turndown produces [![alt](src)](href) which is hard
 * to rewrite reliably with regex. This rule outputs just ![alt](src).
 */
function addLinkedImageRule(turndown: TurndownService): void {
  turndown.addRule('linked-image', {
    filter: (node: HTMLElement) => {
      if (node.nodeName !== 'A') return false;
      const children = node.childNodes;
      // Match <a> that contains exactly one <img> (possibly with whitespace text nodes)
      let imgCount = 0;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.nodeType === 1 && (child as HTMLElement).nodeName === 'IMG') {
          imgCount++;
        } else if (child.nodeType === 3 && (child.textContent || '').trim() !== '') {
          return false; // has meaningful text content besides the image
        }
      }
      return imgCount === 1;
    },
    replacement: (_content: string, node: Node) => {
      const el = node as HTMLElement;
      const img = el.querySelector('img');
      if (!img) return _content;

      const src = img.getAttribute('src') || '';
      const alt = img.getAttribute('alt') || '';
      return `![${alt}](${src})`;
    },
  });
}

/** BookStack <details><summary> → Obsidian foldable callouts */
function addDetailsSummaryRule(turndown: TurndownService): void {
  turndown.addRule('details-summary', {
    filter: (node: HTMLElement) => node.nodeName === 'DETAILS',
    replacement: (content: string, node: Node) => {
      const el = node as HTMLElement;
      const summaryEl = el.querySelector('summary');
      const title = summaryEl
        ? (summaryEl.textContent || '').trim()
        : 'Details';

      // Turndown already converted the summary as plain text at the start
      let body = content.trim();
      if (body.startsWith(title)) {
        body = body.substring(title.length).trim();
      }

      // Wrap in foldable callout (- = collapsed by default, like <details>)
      const lines = body.split('\n').map((l) => `> ${l}`).join('\n');
      return `\n> [!example]- ${title}\n${lines}\n\n`;
    },
  });
}

/** BookStack internal links → Obsidian wikilinks or full URLs */
function addInternalLinkRule(
  turndown: TurndownService,
  context: ConversionContext,
): void {
  turndown.addRule('internal-link', {
    filter: (node: HTMLElement) => {
      if (node.nodeName !== 'A') return false;
      const href = node.getAttribute('href') || '';
      return (
        href.startsWith('/books/') ||
        href.startsWith(`${context.baseUrl}/books/`)
      );
    },
    replacement: (content: string, node: Node) => {
      const el = node as HTMLElement;
      const href = el.getAttribute('href') || '';

      // Extract page slug from URL
      const slug = extractPageSlug(href);
      if (slug) {
        const title = context.slugToTitle.get(slug);
        if (title) {
          // Link text matches title → simple wikilink
          if (content.trim() === title) {
            return `[[${title}]]`;
          }
          // Different display text
          return `[[${title}|${content}]]`;
        }
      }

      // Not in mapping → keep as full URL
      const fullUrl = href.startsWith('/')
        ? `${context.baseUrl}${href}`
        : href;
      return `[${content}](${fullUrl})`;
    },
  });
}

function extractPageSlug(href: string): string | null {
  // Pattern: /books/{book-slug}/page/{page-slug}
  const match = href.match(/\/books\/[^/]+\/page\/([^/?#]+)/);
  return match ? match[1] : null;
}

/** BookStack Drawings → Clickable PNG thumbnail with edit link */
function addDrawingRule(
  turndown: TurndownService,
  context: ConversionContext,
): void {
  turndown.addRule('bookstack-drawing', {
    filter: (node: HTMLElement) => {
      return (
        node.nodeName === 'DIV' &&
        (node.classList.contains('drawing-manager') ||
          node.hasAttribute('drawio-diagram'))
      );
    },
    replacement: (_content: string, node: Node) => {
      const el = node as HTMLElement;
      const drawingId = el.getAttribute('drawio-diagram') || '';
      const img = el.querySelector('img');
      const imgSrc = img ? (img.getAttribute('src') || '') : '';
      const imgAlt = img ? (img.getAttribute('alt') || 'draw.io diagram') : 'draw.io diagram';

      const editLink = drawingId
        ? `${context.baseUrl}/link/${drawingId}`
        : context.baseUrl;

      if (imgSrc) {
        // Clickable PNG preview with link to BookStack editor
        return `\n[![draw.io: ${imgAlt}](${imgSrc})](${editLink})\n`;
      }

      // Fallback: no image available
      return `\n[draw.io Zeichnung bearbeiten](${editLink})\n`;
    },
  });
}

/** Warn about complex tables with colspan/rowspan */
function addComplexTableWarningRule(turndown: TurndownService): void {
  turndown.addRule('complex-table-warning', {
    filter: (node: HTMLElement) => {
      if (node.nodeName !== 'TABLE') return false;
      const cells = node.querySelectorAll('td, th');
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (
          (cell.getAttribute('colspan') && cell.getAttribute('colspan') !== '1') ||
          (cell.getAttribute('rowspan') && cell.getAttribute('rowspan') !== '1')
        ) {
          return true;
        }
      }
      return false;
    },
    replacement: (content: string) => {
      return `\n<!-- BookBridge: Tabelle enthält Colspan/Rowspan — Layout kann abweichen -->\n${content}\n`;
    },
  });
}
