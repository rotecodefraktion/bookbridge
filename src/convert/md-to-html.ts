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

  // Headings (must come before inline formatting to avoid conflicts)
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Code blocks (must come before inline code to avoid conflicts)
  html = html.replace(
    /^(`{3,4})(\w*)\n([\s\S]*?)^\1$/gm,
    (_match, _fence: string, lang: string, code: string) => {
      const cls = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${cls}>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`;
    },
  );

  // Inline code (must come before bold/italic to avoid conflicts inside code spans)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold (must come before italic)
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

  // Tables
  html = convertTables(html);

  // Unordered lists — group consecutive <li> into <ul>
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = wrapConsecutiveListItems(html, 'ul');

  // Ordered lists — group consecutive <li> into <ol>
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<oli>$1</oli>');
  html = wrapConsecutiveOlItems(html);

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');

  // Blockquotes (not callouts, which were already converted)
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // Paragraphs: wrap remaining plain text lines
  html = html.replace(/^(?!<[a-z/]|$)(.+)$/gm, '<p>$1</p>');

  return html;
}

/**
 * Convert markdown tables to HTML tables.
 * Handles standard GFM tables with alignment support.
 */
function convertTables(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    // Look for a table: header row followed by separator row
    if (
      i + 1 < lines.length &&
      isTableRow(lines[i]) &&
      isTableSeparator(lines[i + 1])
    ) {
      const headerCells = parseTableRow(lines[i]);
      const alignments = parseTableAlignments(lines[i + 1]);
      i += 2;

      let tableHtml = '<table><thead><tr>';
      for (let c = 0; c < headerCells.length; c++) {
        const align = alignments[c] ? ` align="${alignments[c]}"` : '';
        tableHtml += `<th${align}>${headerCells[c]}</th>`;
      }
      tableHtml += '</tr></thead><tbody>';

      // Parse body rows
      while (i < lines.length && isTableRow(lines[i])) {
        const cells = parseTableRow(lines[i]);
        tableHtml += '<tr>';
        for (let c = 0; c < headerCells.length; c++) {
          const align = alignments[c] ? ` align="${alignments[c]}"` : '';
          const cellContent = c < cells.length ? cells[c] : '';
          tableHtml += `<td${align}>${cellContent}</td>`;
        }
        tableHtml += '</tr>';
        i++;
      }

      tableHtml += '</tbody></table>';
      result.push(tableHtml);
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join('\n');
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1;
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  // Separator cells contain only dashes, colons, spaces, and pipes
  return /^\|[\s:|-]+\|$/.test(trimmed);
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim();
  // Remove leading and trailing pipes, then split by pipe
  const inner = trimmed.slice(1, -1);
  return inner.split('|').map((cell) => cell.trim());
}

function parseTableAlignments(line: string): (string | null)[] {
  const cells = parseTableRow(line);
  return cells.map((cell) => {
    const trimmed = cell.trim();
    const left = trimmed.startsWith(':');
    const right = trimmed.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

/**
 * Wrap consecutive <li> items (from unordered lists) in <ul> tags.
 */
function wrapConsecutiveListItems(html: string, tag: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    if (line.startsWith('<li>') && line.endsWith('</li>')) {
      if (!inList) {
        result.push(`<${tag}>`);
        inList = true;
      }
      result.push(line);
    } else {
      if (inList) {
        result.push(`</${tag}>`);
        inList = false;
      }
      result.push(line);
    }
  }
  if (inList) {
    result.push(`</${tag}>`);
  }

  return result.join('\n');
}

/**
 * Wrap consecutive <oli> items (from ordered lists) in <ol> tags,
 * and convert <oli> back to <li>.
 */
function wrapConsecutiveOlItems(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    if (line.startsWith('<oli>') && line.endsWith('</oli>')) {
      if (!inList) {
        result.push('<ol>');
        inList = true;
      }
      // Convert <oli>...</oli> to <li>...</li>
      result.push(line.replace(/^<oli>/, '<li>').replace(/<\/oli>$/, '</li>'));
    } else {
      if (inList) {
        result.push('</ol>');
        inList = false;
      }
      result.push(line);
    }
  }
  if (inList) {
    result.push('</ol>');
  }

  return result.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
