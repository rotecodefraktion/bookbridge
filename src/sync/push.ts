import { App, Notice, TFile, normalizePath } from 'obsidian';
import { BookStackClient } from '../api/client';
import { markdownToHtml, ReverseConversionContext } from '../convert/md-to-html';
import {
  MappingData,
  MappingEntry,
  findEntry,
  upsertEntry,
  loadMapping,
  saveMapping,
} from '../models/mapping';
import { readFrontmatter, stripFrontmatter, setFrontmatter } from '../models/frontmatter';
import {
  isBookSelected,
  computeHash,
  SyncResult,
  createEmptySyncResult,
  formatSyncSummary,
} from './engine';
import { BookBridgeSettings } from '../settings';
import { showPushConfirmModal, PushCandidate } from '../ui/push-confirm';

export async function pushSync(
  app: App,
  client: BookStackClient,
  settings: BookBridgeSettings,
  setStatus: (text: string) => void,
  singleBookId?: number,
): Promise<SyncResult> {
  const result = createEmptySyncResult();

  setStatus('Scanning local files...');
  const mapping = await loadMapping(app.vault);

  // Find all markdown files in the sync folder
  const syncFolder = normalizePath(settings.syncFolder);
  const files = app.vault.getFiles().filter(
    (f) => f.path.startsWith(syncFolder + '/') && f.extension === 'md',
  );

  // Collect candidates for pushing
  const candidates: Array<{
    file: TFile;
    frontmatter: ReturnType<typeof readFrontmatter>;
    content: string;
    hash: string;
    entry: MappingEntry | undefined;
  }> = [];

  for (const file of files) {
    const fm = readFrontmatter(app, file);
    if (!fm) continue; // no BookBridge frontmatter, skip

    // Filter by book selection
    if (singleBookId && fm.bookstack_book_id !== singleBookId) continue;
    if (
      !singleBookId &&
      !isBookSelected(fm.bookstack_book_id, settings.selectedBookIds)
    ) {
      continue;
    }

    const rawContent = await app.vault.read(file);
    const content = stripFrontmatter(rawContent);
    const hash = computeHash(content);

    const entry = findEntry(mapping, fm.bookstack_id);

    // Check if changed locally
    if (entry && entry.localHash === hash) continue; // no local changes

    candidates.push({ file, frontmatter: fm, content, hash, entry });
  }

  if (candidates.length === 0) {
    new Notice('BookBridge: No local changes to push');
    return result;
  }

  // Show confirmation modal
  const pushCandidates: PushCandidate[] = candidates.map((c) => ({
    vaultPath: c.file.path,
    bookstackId: c.frontmatter?.bookstack_id ?? null,
    pageName: c.file.basename,
    isNew: !c.entry,
  }));

  const confirmed = await showPushConfirmModal(app, pushCandidates);
  if (!confirmed) {
    new Notice('BookBridge: Push cancelled');
    return result;
  }

  // Build conversion context
  const conversionContext = buildConversionContext(mapping, settings);

  const total = candidates.length;
  let processed = 0;

  for (const candidate of candidates) {
    processed++;
    setStatus(`Pushing ${processed}/${total}: ${candidate.file.basename}`);

    try {
      await pushPage(
        app,
        client,
        mapping,
        conversionContext,
        candidate.file,
        candidate.frontmatter!,
        candidate.content,
        candidate.hash,
        candidate.entry,
        result,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({
        pageId: candidate.frontmatter?.bookstack_id ?? 0,
        pageName: candidate.file.basename,
        error: message,
      });
    }
  }

  await saveMapping(app.vault, mapping);

  const summary = formatSyncSummary(result);
  new Notice(`BookBridge: Push complete — ${summary}`);

  return result;
}

async function pushPage(
  app: App,
  client: BookStackClient,
  mapping: MappingData,
  context: ReverseConversionContext,
  file: TFile,
  frontmatter: NonNullable<ReturnType<typeof readFrontmatter>>,
  content: string,
  hash: string,
  existingEntry: MappingEntry | undefined,
  result: SyncResult,
): Promise<void> {
  const html = markdownToHtml(content, context);

  if (existingEntry) {
    // Update existing page
    const updatedPage = await client.updatePage(frontmatter.bookstack_id, {
      name: file.basename,
      html,
    });

    // Update frontmatter with new timestamp
    await setFrontmatter(app, file, {
      bookstack_id: frontmatter.bookstack_id,
      bookstack_type: 'page',
      bookstack_updated_at: updatedPage.updated_at,
      bookstack_book_id: frontmatter.bookstack_book_id,
      bookstack_chapter_id: frontmatter.bookstack_chapter_id,
    });

    // Update mapping
    existingEntry.localHash = hash;
    existingEntry.remoteHash = hash;
    existingEntry.bookstackUpdatedAt = updatedPage.updated_at;
    existingEntry.vaultPath = file.path;
    upsertEntry(mapping, existingEntry);
  } else {
    // Create new page
    const newPage = await client.createPage({
      book_id: frontmatter.bookstack_book_id,
      chapter_id: frontmatter.bookstack_chapter_id,
      name: file.basename,
      html,
    });

    // Update frontmatter
    await setFrontmatter(app, file, {
      bookstack_id: newPage.id,
      bookstack_type: 'page',
      bookstack_updated_at: newPage.updated_at,
      bookstack_book_id: newPage.book_id,
      bookstack_chapter_id: newPage.chapter_id || undefined,
    });

    // Add to mapping
    const entry: MappingEntry = {
      bookstackId: newPage.id,
      bookstackType: 'page',
      vaultPath: file.path,
      bookstackUpdatedAt: newPage.updated_at,
      bookstackBookId: newPage.book_id,
      bookstackChapterId: newPage.chapter_id || null,
      localHash: hash,
      remoteHash: hash,
    };
    upsertEntry(mapping, entry);
  }

  result.pushed++;
}

function buildConversionContext(
  mapping: MappingData,
  settings: BookBridgeSettings,
): ReverseConversionContext {
  const titleToPath = new Map<string, string>();
  const assetToUrl = new Map<string, string>();

  for (const entry of mapping.entries) {
    if (entry.bookstackType === 'page') {
      const parts = entry.vaultPath.split('/');
      const filename = parts[parts.length - 1];
      const title = filename.replace(/\.md$/, '');
      // We'd need the slug from BookStack to build the URL properly.
      // For now, use the ID-based path
      titleToPath.set(title, `/link/${entry.bookstackId}`);
    }
  }

  return {
    baseUrl: settings.baseUrl,
    titleToPath,
    assetToUrl,
  };
}
