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

  addCalloutRule(turndown);
  addCodeBlockRule(turndown);
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

/** BookStack Callouts → Obsidian Callouts */
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
      const lines = content.trim().split('\n');
      const body = lines.map((line) => `> ${line}`).join('\n');
      return `\n> [!${type}]\n${body}\n\n`;
    },
  });
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

/** BookStack Drawings → Placeholder with link */
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
      const link = drawingId
        ? `${context.baseUrl}/link/${drawingId}`
        : context.baseUrl;

      return [
        '',
        '> [!warning] BookStack Drawing',
        '> Dieses Element ist ein BookStack Drawing und kann nicht als Markdown dargestellt werden.',
        `> [Original ansehen](${link})`,
        '',
        '',
      ].join('\n');
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
