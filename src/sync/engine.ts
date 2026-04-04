import { MappingEntry } from '../models/mapping';

/**
 * Compute a simple hash of content for change detection.
 * Uses a basic string hash since we don't need cryptographic strength
 * and SubtleCrypto is async.
 */
export function computeHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Convert to unsigned hex string
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export type ChangeState =
  | 'unchanged'
  | 'local_changed'
  | 'remote_changed'
  | 'conflict'
  | 'new_remote'
  | 'new_local'
  | 'deleted_remote'
  | 'deleted_local';

export interface SyncAction {
  state: ChangeState;
  entry: MappingEntry | null;
  bookstackId: number;
  vaultPath: string | null;
  bookName?: string;
  chapterName?: string | null;
  pageName?: string;
  remoteUpdatedAt?: string;
}

/**
 * Determine the sync state for a page that exists in the mapping.
 */
export function detectChangeState(
  entry: MappingEntry,
  localHash: string | null,
  remoteUpdatedAt: string | null,
): ChangeState {
  const localChanged = localHash !== null && localHash !== entry.localHash;
  const remoteChanged =
    remoteUpdatedAt !== null && remoteUpdatedAt !== entry.bookstackUpdatedAt;

  if (localHash === null) return 'deleted_local';
  if (remoteUpdatedAt === null) return 'deleted_remote';
  if (localChanged && remoteChanged) return 'conflict';
  if (localChanged) return 'local_changed';
  if (remoteChanged) return 'remote_changed';
  return 'unchanged';
}

/**
 * Filter book IDs based on settings.
 * Empty selectedBookIds means "all books" — returns true for everything.
 * A sentinel value of -1 means "no books selected".
 */
export function isBookSelected(
  bookId: number,
  selectedBookIds: number[],
): boolean {
  if (selectedBookIds.length === 0) return true;
  if (selectedBookIds.includes(-1)) return false;
  return selectedBookIds.includes(bookId);
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  skipped: number;
  conflicts: number;
  errors: SyncError[];
}

export interface SyncError {
  pageId: number;
  pageName: string;
  error: string;
}

export function createEmptySyncResult(): SyncResult {
  return { pulled: 0, pushed: 0, skipped: 0, conflicts: 0, errors: [] };
}

export function formatSyncSummary(result: SyncResult): string {
  const parts: string[] = [];
  if (result.pulled > 0) parts.push(`${result.pulled} pulled`);
  if (result.pushed > 0) parts.push(`${result.pushed} pushed`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  if (result.conflicts > 0) parts.push(`${result.conflicts} conflicts`);
  if (result.errors.length > 0) parts.push(`${result.errors.length} errors`);
  return parts.length > 0 ? parts.join(', ') : 'No changes';
}
