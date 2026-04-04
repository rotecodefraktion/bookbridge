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
  const pages = await collectPages(client, selectedBooks);

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

  const summary = formatSyncSummary(result);
  console.log(`BookBridge: Pull complete — ${result.pulled} pulled, ${result.skipped} skipped, ${result.errors.length} errors`);
  new Notice(`BookBridge: Pull complete — ${summary}`);

  return result;
}

async function collectPages(
  client: BookStackClient,
  books: BookStackBook[],
): Promise<PageInfo[]> {
  const pages: PageInfo[] = [];

  for (const book of books) {
    const contents = await client.getBookContents(book.id);

    for (const item of contents.contents) {
      if (item.type === 'page') {
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
        });
      } else if (item.type === 'chapter' && item.pages) {
        for (const page of item.pages) {
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
          });
        }
      }
    }
  }

  return pages;
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
