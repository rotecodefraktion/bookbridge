import { App, Notice, TFile, normalizePath } from 'obsidian';
import { BookStackClient } from '../api/client';
import {
  MappingData,
  MappingEntry,
  findEntry,
  findEntryByPath,
  loadMapping,
  saveMapping,
} from '../models/mapping';
import { readFrontmatter, stripFrontmatter } from '../models/frontmatter';
import {
  isBookSelected,
  computeHash,
  detectChangeState,
  ChangeState,
  SyncResult,
  createEmptySyncResult,
  formatSyncSummary,
} from './engine';
import { pullSync } from './pull';
import { pushSync, deriveBookAndChapter } from './push';
import { BookBridgeSettings } from '../settings';
import {
  ConflictInfo,
  ConflictResolution,
  showConflictModal,
  showBatchConflictModal,
} from '../ui/conflict-modal';
import { deleteSync } from './delete';

interface SyncItem {
  bookstackId: number;
  entry: MappingEntry | null;
  state: ChangeState;
  localFile: TFile | null;
  localHash: string | null;
  remoteUpdatedAt: string | null;
}

export async function bidirectionalSync(
  app: App,
  client: BookStackClient,
  settings: BookBridgeSettings,
  setStatus: (text: string) => void,
  singleBookId?: number,
): Promise<SyncResult> {
  const result = createEmptySyncResult();

  setStatus('Loading mapping...');
  const mapping = await loadMapping(app.vault);

  // Step 1: Get remote state
  setStatus('Loading remote state...');
  const books = await client.getAllBooks();
  const selectedBooks = singleBookId
    ? books.filter((b) => b.id === singleBookId)
    : books.filter((b) => isBookSelected(b.id, settings.selectedBookIds));

  // Collect all remote page IDs with their updated_at
  const remotePages = new Map<number, { updatedAt: string; bookId: number }>();

  for (const book of selectedBooks) {
    const contents = await client.getBookContents(book.id);
    for (const item of contents.contents) {
      if (item.type === 'page') {
        // We need the full page to get updated_at; for now use a lightweight check
        remotePages.set(item.id, { updatedAt: item.updated_at, bookId: book.id });
      } else if (item.type === 'chapter' && item.pages) {
        for (const page of item.pages) {
          remotePages.set(page.id, { updatedAt: page.updated_at, bookId: book.id });
        }
      }
    }
  }

  // Step 2: Calculate local state
  setStatus('Scanning local files...');
  const syncFolder = normalizePath(settings.syncFolder);
  const localFiles = app.vault.getFiles().filter(
    (f) => f.path.startsWith(syncFolder + '/') && f.extension === 'md',
  );

  const localByBookstackId = new Map<number, { file: TFile; hash: string }>();
  for (const file of localFiles) {
    if (file.name === '_index.md') continue;

    const cache = app.metadataCache.getFileCache(file);
    const rawFm = cache?.frontmatter;
    if (rawFm?.bookstack_type === 'book' || rawFm?.bookstack_type === 'chapter') continue;

    const fm = readFrontmatter(app, file);
    if (!fm) continue;

    if (singleBookId && fm.bookstack_book_id !== singleBookId) continue;
    if (!singleBookId && !isBookSelected(fm.bookstack_book_id, settings.selectedBookIds)) {
      continue;
    }

    const content = await app.vault.read(file);
    const stripped = stripFrontmatter(content);
    const hash = computeHash(stripped);
    localByBookstackId.set(fm.bookstack_id, { file, hash });
  }

  // Step 2b: Detect new local files (no frontmatter, not in mapping)
  const newLocalItems: SyncItem[] = [];
  for (const file of localFiles) {
    if (file.name === '_index.md') continue;

    const cache2 = app.metadataCache.getFileCache(file);
    const rawFm2 = cache2?.frontmatter;
    if (rawFm2?.bookstack_type === 'book' || rawFm2?.bookstack_type === 'chapter') continue;

    const fm = readFrontmatter(app, file);
    if (fm) continue; // already handled above

    // Skip if already tracked in mapping by path
    if (findEntryByPath(mapping, file.path)) continue;

    // Must have valid book/chapter structure
    const derived = deriveBookAndChapter(file.path, syncFolder);
    if (!derived) continue;

    // Skip empty files
    const rawContent = await app.vault.read(file);
    const stripped = stripFrontmatter(rawContent);
    if (stripped.trim().length === 0) continue;

    newLocalItems.push({
      bookstackId: 0,
      entry: null,
      state: 'new_local',
      localFile: file,
      localHash: computeHash(stripped),
      remoteUpdatedAt: null,
    });
  }

  if (newLocalItems.length > 0) {
    console.log(`BookBridge: Bidirectional sync found ${newLocalItems.length} new local files`);
  }

  // Step 3: Determine sync actions
  const syncItems: SyncItem[] = [];

  // Check mapped entries
  for (const entry of mapping.entries) {
    if (singleBookId && entry.bookstackBookId !== singleBookId) continue;
    if (!singleBookId && !isBookSelected(entry.bookstackBookId, settings.selectedBookIds)) {
      continue;
    }

    const local = localByBookstackId.get(entry.bookstackId);
    const remote = remotePages.get(entry.bookstackId);

    // For remote change detection, we need to fetch the actual updated_at
    // We'll do a lazy check: if the page still exists remotely
    const localHash = local?.hash ?? null;
    const remoteUpdatedAt = remote ? remote.updatedAt : null;

    const state = detectChangeState(
      entry,
      localHash,
      remoteUpdatedAt,
    );

    syncItems.push({
      bookstackId: entry.bookstackId,
      entry,
      state,
      localFile: local?.file ?? null,
      localHash,
      remoteUpdatedAt,
    });
  }

  // New remote pages (not in mapping)
  for (const [pageId, info] of remotePages) {
    if (!findEntry(mapping, pageId)) {
      syncItems.push({
        bookstackId: pageId,
        entry: null,
        state: 'new_remote',
        localFile: null,
        localHash: null,
        remoteUpdatedAt: info.updatedAt,
      });
    }
  }

  // Categorize actions
  const toPull = syncItems.filter(
    (s) => s.state === 'remote_changed' || s.state === 'new_remote',
  );
  const toPush = syncItems.filter((s) => s.state === 'local_changed');
  const newLocal = newLocalItems;
  const conflicts = syncItems.filter((s) => s.state === 'conflict');
  const deletedRemote = syncItems.filter((s) => s.state === 'deleted_remote');
  const deletedLocal = syncItems.filter((s) => s.state === 'deleted_local');
  const unchanged = syncItems.filter((s) => s.state === 'unchanged');

  console.log(
    `BookBridge: Bidirectional sync — ${unchanged.length} unchanged, ${toPull.length} pull, ${toPush.length} push, ${newLocal.length} new local, ${conflicts.length} conflicts`,
  );

  // Step 4: Handle conflicts
  if (conflicts.length > 0) {
    await handleConflicts(
      app,
      client,
      settings,
      mapping,
      conflicts,
      toPull,
      toPush,
      result,
    );
  }

  // Step 5: Execute pull for remote-changed pages
  const needsPush = toPush.length > 0 || newLocal.length > 0;
  if (toPull.length > 0 || needsPush) {
    setStatus(`Syncing: ${toPull.length} pull, ${toPush.length} push, ${newLocal.length} new local...`);

    // Pull
    if (toPull.length > 0) {
      const pullResult = await pullSync(
        app,
        client,
        settings,
        setStatus,
        singleBookId,
      );
      result.pulled += pullResult.pulled;
      result.errors.push(...pullResult.errors);
    }

    // Push (includes both changed and new local files — pushSync scans independently)
    if (needsPush) {
      const pushResult = await pushSync(
        app,
        client,
        settings,
        setStatus,
        singleBookId,
      );
      result.pushed += pushResult.pushed;
      result.errors.push(...pushResult.errors);
    }
  }

  // Step 6: Handle deletions (always requires confirmation)
  if (deletedRemote.length > 0 || deletedLocal.length > 0) {
    const remotePageIdSet = new Set(remotePages.keys());
    const deleteResult = await deleteSync(
      app,
      client,
      settings,
      mapping,
      remotePageIdSet,
      setStatus,
      singleBookId,
    );

    if (deleteResult.errors.length > 0) {
      result.errors.push(
        ...deleteResult.errors.map((e) => ({
          pageId: 0,
          pageName: '',
          error: e,
        })),
      );
    }

    await saveMapping(app.vault, mapping);
  }

  const summary = formatSyncSummary(result);
  new Notice(`BookBridge: Sync complete — ${summary}`);

  return result;
}

async function handleConflicts(
  app: App,
  client: BookStackClient,
  settings: BookBridgeSettings,
  mapping: MappingData,
  conflicts: SyncItem[],
  toPull: SyncItem[],
  toPush: SyncItem[],
  result: SyncResult,
): Promise<void> {
  const strategy = settings.conflictStrategy;

  if (strategy === 'local') {
    // Local wins → push all conflicts
    toPush.push(...conflicts);
    result.conflicts += conflicts.length;
    return;
  }

  if (strategy === 'remote') {
    // Remote wins → pull all conflicts
    toPull.push(...conflicts);
    result.conflicts += conflicts.length;
    return;
  }

  // strategy === 'ask'
  if (conflicts.length === 1) {
    const conflict = conflicts[0];
    const info = await buildConflictInfo(app, client, conflict);
    if (info) {
      const resolution = await showConflictModal(app, info);
      applyResolution(conflict, resolution, toPull, toPush);
      result.conflicts++;
    }
  } else {
    // Multiple conflicts → batch modal
    const infos: ConflictInfo[] = [];
    for (const conflict of conflicts) {
      const info = await buildConflictInfo(app, client, conflict);
      if (info) infos.push(info);
    }

    if (infos.length > 0) {
      const resolutions = await showBatchConflictModal(app, infos);
      for (const conflict of conflicts) {
        const resolution = resolutions.get(conflict.bookstackId) ?? 'skip';
        applyResolution(conflict, resolution, toPull, toPush);
        result.conflicts++;
      }
    }
  }
}

async function buildConflictInfo(
  app: App,
  client: BookStackClient,
  item: SyncItem,
): Promise<ConflictInfo | null> {
  if (!item.localFile || !item.entry) return null;

  const localContent = stripFrontmatter(await app.vault.read(item.localFile));

  let remoteContent = '';
  try {
    const page = await client.getPage(item.bookstackId);
    remoteContent = page.html || '';
  } catch {
    remoteContent = '(Could not fetch remote content)';
  }

  return {
    pageName: item.localFile.basename,
    vaultPath: item.localFile.path,
    bookstackId: item.bookstackId,
    localContent,
    remoteContent,
  };
}

function applyResolution(
  item: SyncItem,
  resolution: ConflictResolution,
  toPull: SyncItem[],
  toPush: SyncItem[],
): void {
  if (resolution === 'local') {
    toPush.push(item);
  } else if (resolution === 'remote') {
    toPull.push(item);
  }
  // 'skip' → do nothing
}
