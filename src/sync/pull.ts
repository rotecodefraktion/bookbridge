import { App, Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { BookStackClient } from '../api/client';
import { BookStackBook } from '../api/types';
import { htmlToMarkdown, ConversionContext } from '../convert/html-to-md';
import { downloadImages, downloadAttachments, rewriteAssetUrls } from '../convert/assets';
import {
  MappingData,
  MappingEntry,
  findEntry,
  upsertEntry,
  loadMapping,
  saveMapping,
} from '../models/mapping';
import { setFrontmatter, stripFrontmatter } from '../models/frontmatter';
import { sanitizeFileName } from '../utils/sanitize';
import { buildPagePath } from '../utils/paths';
import {
  isBookSelected,
  computeHash,
  SyncResult,
  createEmptySyncResult,
  formatSyncSummary,
} from './engine';
import { BookBridgeSettings } from '../settings';

interface PageInfo {
  id: number;
  name: string;
  slug: string;
  bookId: number;
  bookName: string;
  chapterId: number | null;
  chapterName: string | null;
  draft: boolean;
  updatedAt: string;
  priority: number;
}

interface ChapterInfo {
  id: number;
  name: string;
  bookId: number;
  bookName: string;
  priority: number;
  pageIds: number[];
}

interface BookContentsInfo {
  id: number;
  name: string;
  chapters: ChapterInfo[];
  directPageIds: number[];
}

interface CollectResult {
  pages: PageInfo[];
  books: BookContentsInfo[];
}

export async function pullSync(
  app: App,
  client: BookStackClient,
  settings: BookBridgeSettings,
  setStatus: (text: string) => void,
  singleBookId?: number,
): Promise<SyncResult> {
  const result = createEmptySyncResult();

  setStatus('Loading books...');
  const books = await client.getAllBooks();

  // Filter by selection
  const selectedBooks = singleBookId
    ? books.filter((b) => b.id === singleBookId)
    : books.filter((b) => isBookSelected(b.id, settings.selectedBookIds));

  if (selectedBooks.length === 0) {
    new Notice('BookBridge: No books to pull');
    return result;
  }

  // Collect all pages from selected books
  setStatus('Loading book contents...');
  const { pages, books: bookStructure } = await collectPages(client, selectedBooks);

  const mapping = await loadMapping(app.vault);

  // Build slug→title map for internal link conversion
  const slugToTitle = buildSlugToTitle(pages, mapping);

  const conversionContext: ConversionContext = {
    baseUrl: settings.baseUrl,
    slugToTitle,
  };

  // Ensure sync folder exists
  await ensureFolder(app, settings.syncFolder);

  const total = pages.length;
  let processed = 0;

  console.log(`BookBridge: Pull starting, ${selectedBooks.length} books, ${total} pages`);

  for (const page of pages) {
    processed++;
    setStatus(`Pulling ${processed}/${total}: ${page.name}`);

    try {
      await pullPage(app, client, settings, mapping, conversionContext, page, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ pageId: page.id, pageName: page.name, error: message });
    }
  }

  await saveMapping(app.vault, mapping);

  setStatus('Generating index files...');
  await generateIndexFiles(app, settings, pages, bookStructure);

  setStatus('Injecting navigation...');
  await injectNavigation(app, settings, pages, bookStructure);

  const summary = formatSyncSummary(result);
  console.log(`BookBridge: Pull complete — ${result.pulled} pulled, ${result.skipped} skipped, ${result.errors.length} errors`);
  new Notice(`BookBridge: Pull complete — ${summary}`);

  return result;
}

async function collectPages(
  client: BookStackClient,
  books: BookStackBook[],
): Promise<CollectResult> {
  const pages: PageInfo[] = [];
  const bookInfos: BookContentsInfo[] = [];

  for (const book of books) {
    const contents = await client.getBookContents(book.id);
    const chapters: ChapterInfo[] = [];
    const directPageIds: number[] = [];

    for (const item of contents.contents) {
      if (item.type === 'page') {
        directPageIds.push(item.id);
        pages.push({
          id: item.id,
          name: item.name,
          slug: item.slug,
          bookId: book.id,
          bookName: book.name,
          chapterId: null,
          chapterName: null,
          draft: false,
          updatedAt: item.updated_at,
          priority: item.priority,
        });
      } else if (item.type === 'chapter' && item.pages) {
        const sortedPages = [...item.pages].sort((a, b) => a.priority - b.priority);
        const chapterPageIds: number[] = [];

        for (const page of sortedPages) {
          chapterPageIds.push(page.id);
          pages.push({
            id: page.id,
            name: page.name,
            slug: page.slug,
            bookId: book.id,
            bookName: book.name,
            chapterId: item.id,
            chapterName: item.name,
            draft: page.draft,
            updatedAt: page.updated_at,
            priority: page.priority,
          });
        }

        chapters.push({
          id: item.id,
          name: item.name,
          bookId: book.id,
          bookName: book.name,
          priority: item.priority,
          pageIds: chapterPageIds,
        });
      }
    }

    // Sort chapters by priority
    chapters.sort((a, b) => a.priority - b.priority);

    bookInfos.push({
      id: book.id,
      name: book.name,
      chapters,
      directPageIds,
    });
  }

  return { pages, books: bookInfos };
}

async function pullPage(
  app: App,
  client: BookStackClient,
  settings: BookBridgeSettings,
  mapping: MappingData,
  context: ConversionContext,
  page: PageInfo,
  result: SyncResult,
): Promise<void> {
  // Check if page needs updating using date from book contents API (no extra request)
  const existing = findEntry(mapping, page.id);

  if (existing && existing.bookstackUpdatedAt === page.updatedAt) {
    // No changes on remote side — skip without fetching full page
    console.log(`BookBridge: Skipping unchanged page: ${page.name}`);
    result.skipped++;
    return;
  }

  // Fetch full page details only when page actually needs updating
  console.log(`BookBridge: Pulling page: ${page.name}`);
  const fullPage = await client.getPage(page.id);

  // Get HTML content for conversion
  const html = fullPage.html || '';
  let markdown = htmlToMarkdown(html, context);

  // Download assets and rewrite URLs
  if (settings.downloadAssets) {
    // Download images (uses original HTML to find URLs)
    const imageMap = await downloadImages(
      app.vault,
      html,
      settings.baseUrl,
      settings.syncFolder,
      settings.assetFolder,
    );

    // Download attachments via API
    const attachmentMap = await downloadAttachments(
      app.vault,
      client,
      page.id,
      settings.syncFolder,
      settings.assetFolder,
    );

    // Rewrite all BookStack URLs in markdown to local paths
    markdown = rewriteAssetUrls(markdown, imageMap, attachmentMap, settings.baseUrl);
  }

  // Build vault path
  const bookFolder = sanitizeFileName(page.bookName);
  const chapterFolder = page.chapterName
    ? sanitizeFileName(page.chapterName)
    : null;
  const pageName = sanitizeFileName(page.name);

  const vaultPath = buildPagePath(
    settings.syncFolder,
    bookFolder,
    chapterFolder,
    pageName,
  );

  // Ensure parent folders exist
  const folderPath = vaultPath.substring(0, vaultPath.lastIndexOf('/'));
  await ensureFolder(app, folderPath);

  // Create or update file
  const file = await createOrModify(app, vaultPath, markdown);
  await setFrontmatter(app, file, {
    bookstack_id: page.id,
    bookstack_type: 'page',
    bookstack_updated_at: fullPage.updated_at,
    bookstack_book_id: page.bookId,
    bookstack_chapter_id: page.chapterId ?? undefined,
  });

  // Re-compute hash after frontmatter processing to match what bidirectional sync will compute
  const finalContent = await app.vault.read(file);
  const finalStripped = stripFrontmatter(finalContent);
  const finalHash = computeHash(finalStripped);

  // Update mapping
  const entry: MappingEntry = {
    bookstackId: page.id,
    bookstackType: 'page',
    vaultPath,
    bookstackUpdatedAt: fullPage.updated_at,
    bookstackBookId: page.bookId,
    bookstackChapterId: page.chapterId,
    localHash: finalHash,
    remoteHash: finalHash,
  };
  upsertEntry(mapping, entry);

  result.pulled++;
}

function buildSlugToTitle(
  pages: PageInfo[],
  mapping: MappingData,
): Map<string, string> {
  const map = new Map<string, string>();

  // From current page list
  for (const page of pages) {
    map.set(page.slug, page.name);
  }

  // Also include entries from mapping that may not be in current pull scope
  for (const entry of mapping.entries) {
    if (entry.bookstackType === 'page') {
      const parts = entry.vaultPath.split('/');
      const filename = parts[parts.length - 1];
      const title = filename.replace(/\.md$/, '');
      // We store the ID as key for mapping-based lookups
      map.set(String(entry.bookstackId), title);
    }
  }

  return map;
}

/**
 * Create or update a file, handling case-insensitive filesystem mismatches.
 * On macOS, getAbstractFileByPath may not find a file that exists with different casing,
 * so vault.create() would fail with "File already exists". In that case, fall back to modify.
 */
async function createOrModify(app: App, vaultPath: string, content: string): Promise<TFile> {
  const existing = app.vault.getAbstractFileByPath(vaultPath);
  if (existing && existing instanceof TFile) {
    await app.vault.modify(existing, content);
    return existing;
  }

  try {
    return await app.vault.create(vaultPath, content);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('File already exists')) {
      // Case-insensitive filesystem: file exists but path lookup failed.
      // Find the file by scanning the parent folder.
      const folderPath = vaultPath.substring(0, vaultPath.lastIndexOf('/'));
      const fileName = vaultPath.substring(vaultPath.lastIndexOf('/') + 1);
      const folder = app.vault.getAbstractFileByPath(folderPath);
      if (folder && folder instanceof TFolder) {
        const match = folder.children.find(
          (f) => f instanceof TFile && f.name.toLowerCase() === fileName.toLowerCase(),
        );
        if (match && match instanceof TFile) {
          await app.vault.modify(match, content);
          return match;
        }
      }
    }
    throw error;
  }
}

async function generateIndexFiles(
  app: App,
  settings: BookBridgeSettings,
  pages: PageInfo[],
  bookStructure: BookContentsInfo[],
): Promise<void> {
  // Build a page lookup by ID for collision checks
  const pageById = new Map<number, PageInfo>();
  for (const page of pages) {
    pageById.set(page.id, page);
  }

  for (const book of bookStructure) {
    const bookFolder = sanitizeFileName(book.name);

    // Check for naming collision between book index and direct pages or chapters
    const bookHasCollision =
      book.directPageIds.some((pid) => {
        const p = pageById.get(pid);
        return p !== undefined && sanitizeFileName(p.name) === bookFolder;
      }) ||
      book.chapters.some(
        (ch) => sanitizeFileName(ch.name) === bookFolder,
      );
    const bookFileName = bookHasCollision
      ? `${bookFolder} (Index)`
      : bookFolder;

    const bookIndexPath = normalizePath(
      `${settings.syncFolder}/${bookFolder}/${bookFileName}.md`,
    );

    // Pre-compute chapter file names (needed for book index wikilinks)
    const chapterFileNames = new Map<number, string>();
    for (const chapter of book.chapters) {
      const chapterFolder = sanitizeFileName(chapter.name);
      const chapterHasCollision = chapter.pageIds.some((pid) => {
        const p = pageById.get(pid);
        return p !== undefined && sanitizeFileName(p.name) === chapterFolder;
      });
      chapterFileNames.set(
        chapter.id,
        chapterHasCollision ? `${chapterFolder} (Index)` : chapterFolder,
      );
    }

    // Build book index content
    const bookLines: string[] = [];
    bookLines.push(`# ${book.name}`);
    bookLines.push('');

    if (book.chapters.length > 0) {
      bookLines.push('## Kapitel');
      bookLines.push('');
      for (const chapter of book.chapters) {
        const chapterLinkName = chapterFileNames.get(chapter.id) ?? sanitizeFileName(chapter.name);
        bookLines.push(`- [[${chapterLinkName}]]`);
      }
      bookLines.push('');
    }

    if (book.directPageIds.length > 0) {
      bookLines.push('## Seiten');
      bookLines.push('');
      for (const pageId of book.directPageIds) {
        const page = pageById.get(pageId);
        if (page) {
          const pageSanitized = sanitizeFileName(page.name);
          bookLines.push(`- [[${pageSanitized}]]`);
        }
      }
      bookLines.push('');
    }

    const bookContent = bookLines.join('\n');
    const bookFolderPath = normalizePath(`${settings.syncFolder}/${bookFolder}`);
    await ensureFolder(app, bookFolderPath);
    await writeIndexFile(app, bookIndexPath, bookContent, 'book', book.id, book.id);

    // Generate chapter index files
    for (const chapter of book.chapters) {
      const chapterFolder = sanitizeFileName(chapter.name);
      const chapterFileName = chapterFileNames.get(chapter.id) ?? chapterFolder;
      const chapterIndexPath = normalizePath(
        `${settings.syncFolder}/${bookFolder}/${chapterFolder}/${chapterFileName}.md`,
      );

      const chapterLines: string[] = [];
      chapterLines.push(`# ${chapter.name}`);
      chapterLines.push('');

      for (const pageId of chapter.pageIds) {
        const page = pageById.get(pageId);
        if (page) {
          const pageSanitized = sanitizeFileName(page.name);
          chapterLines.push(`- [[${pageSanitized}]]`);
        }
      }
      chapterLines.push('');

      const chapterContent = chapterLines.join('\n');
      const chapterFolderPath = normalizePath(
        `${settings.syncFolder}/${bookFolder}/${chapterFolder}`,
      );
      await ensureFolder(app, chapterFolderPath);
      await writeIndexFile(
        app,
        chapterIndexPath,
        chapterContent,
        'chapter',
        chapter.id,
        chapter.bookId,
      );
    }
  }
}

async function writeIndexFile(
  app: App,
  path: string,
  content: string,
  type: 'book' | 'chapter',
  id: number,
  bookId: number,
): Promise<void> {
  // Build frontmatter manually (these are not tracked in mapping)
  const fmLines = ['---'];
  fmLines.push(`bookstack_type: ${type}`);
  fmLines.push(`bookstack_id: ${id}`);
  if (type === 'chapter') {
    fmLines.push(`bookstack_book_id: ${bookId}`);
  }
  fmLines.push('---');
  fmLines.push('');

  const fullContent = fmLines.join('\n') + content;

  // Only write if content changed
  const exists = await app.vault.adapter.exists(path);
  if (exists) {
    const existing = await app.vault.adapter.read(path);
    if (existing === fullContent) {
      return;
    }
  }

  await app.vault.adapter.write(path, fullContent);
  console.log(`BookBridge: Generated index: ${path}`);
}

async function injectNavigation(
  app: App,
  settings: BookBridgeSettings,
  pages: PageInfo[],
  bookStructure: BookContentsInfo[],
): Promise<void> {
  const pageMap = new Map<number, PageInfo>();
  for (const page of pages) {
    pageMap.set(page.id, page);
  }

  for (const book of bookStructure) {
    // Direct pages in book
    for (let i = 0; i < book.directPageIds.length; i++) {
      const page = pageMap.get(book.directPageIds[i]);
      if (!page) continue;
      const prev = i > 0 ? pageMap.get(book.directPageIds[i - 1]) ?? null : null;
      const next = i < book.directPageIds.length - 1 ? pageMap.get(book.directPageIds[i + 1]) ?? null : null;
      await writeNavLine(app, settings, page, book.name, prev, next);
    }

    // Pages in chapters
    for (const chapter of book.chapters) {
      for (let i = 0; i < chapter.pageIds.length; i++) {
        const page = pageMap.get(chapter.pageIds[i]);
        if (!page) continue;
        const prev = i > 0 ? pageMap.get(chapter.pageIds[i - 1]) ?? null : null;
        const next = i < chapter.pageIds.length - 1 ? pageMap.get(chapter.pageIds[i + 1]) ?? null : null;
        await writeNavLine(app, settings, page, chapter.name, prev, next);
      }
    }
  }
}

async function writeNavLine(
  app: App,
  settings: BookBridgeSettings,
  page: PageInfo,
  parentName: string,
  prev: PageInfo | null,
  next: PageInfo | null,
): Promise<void> {
  const bookFolder = sanitizeFileName(page.bookName);
  const chapterFolder = page.chapterName ? sanitizeFileName(page.chapterName) : null;
  const pageName = sanitizeFileName(page.name);
  const vaultPath = buildPagePath(settings.syncFolder, bookFolder, chapterFolder, pageName);
  const normalizedPath = normalizePath(vaultPath);

  const exists = await app.vault.adapter.exists(normalizedPath);
  if (!exists) return;

  const content = await app.vault.adapter.read(normalizedPath);

  // Build nav line
  const parentSanitized = sanitizeFileName(parentName);
  let navLine = `↑ [[${parentSanitized}]]`;
  if (prev) {
    navLine += ` · ← [[${sanitizeFileName(prev.name)}]]`;
  }
  if (next) {
    navLine += ` · → [[${sanitizeFileName(next.name)}]]`;
  }

  // Strip existing nav line (line starting with ↑ after frontmatter)
  const stripped = content.replace(
    /^(---\n[\s\S]*?\n---\n)↑ \[\[.*\n\n?/,
    '$1',
  );

  // Inject new nav line after frontmatter
  const injected = stripped.replace(
    /^(---\n[\s\S]*?\n---\n)/,
    `$1${navLine}\n\n`,
  );

  // Only write if content changed
  if (injected === content) return;

  await app.vault.adapter.write(normalizedPath, injected);
  console.log(`BookBridge: Injected navigation: ${normalizedPath}`);
}

async function ensureFolder(app: App, path: string): Promise<void> {
  const normalized = normalizePath(path);
  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing && existing instanceof TFolder) return;
  if (!existing) {
    // Create parent directories recursively, one level at a time
    const parts = normalized.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const folder = app.vault.getAbstractFileByPath(current);
      if (!folder) {
        try {
          await app.vault.createFolder(current);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          // Folder may already exist on case-insensitive filesystem
          if (!msg.includes('Folder already exists')) {
            throw error;
          }
        }
      }
    }
  }
}
