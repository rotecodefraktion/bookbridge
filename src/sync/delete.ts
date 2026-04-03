import { App, TFile } from 'obsidian';
import { BookStackClient, BookStackNotFoundError } from '../api/client';
import {
  MappingData,
  removeEntry,
} from '../models/mapping';
import { isBookSelected } from './engine';
import { BookBridgeSettings } from '../settings';
import {
  DeleteCandidate,
  DeleteResolution,
  showDeleteConfirmModal,
} from '../ui/delete-confirm';

export interface DeleteResult {
  deletedRemote: number;
  deletedLocal: number;
  unlinked: number;
  errors: string[];
}

/**
 * Detect and handle deletions in both directions.
 * Always requires user confirmation — never auto-deletes.
 */
export async function deleteSync(
  app: App,
  client: BookStackClient,
  settings: BookBridgeSettings,
  mapping: MappingData,
  remotePageIds: Set<number>,
  setStatus: (text: string) => void,
  singleBookId?: number,
): Promise<DeleteResult> {
  const result: DeleteResult = {
    deletedRemote: 0,
    deletedLocal: 0,
    unlinked: 0,
    errors: [],
  };

  const candidates: DeleteCandidate[] = [];

  // Check for deletions in both directions
  for (const entry of mapping.entries) {
    if (entry.bookstackType !== 'page') continue;

    // Filter by book selection
    if (singleBookId && entry.bookstackBookId !== singleBookId) continue;
    if (!singleBookId && !isBookSelected(entry.bookstackBookId, settings.selectedBookIds)) {
      continue;
    }

    const localFile = app.vault.getAbstractFileByPath(entry.vaultPath);
    const existsRemotely = remotePageIds.has(entry.bookstackId);

    // Locally deleted
    if (!localFile && existsRemotely) {
      candidates.push({
        bookstackId: entry.bookstackId,
        pageName: extractPageName(entry.vaultPath),
        vaultPath: entry.vaultPath,
        direction: 'local_deleted',
      });
    }

    // Remotely deleted
    if (localFile && !existsRemotely) {
      candidates.push({
        bookstackId: entry.bookstackId,
        pageName: extractPageName(entry.vaultPath),
        vaultPath: entry.vaultPath,
        direction: 'remote_deleted',
      });
    }
  }

  if (candidates.length === 0) return result;

  // Show confirmation modal — always, regardless of conflict strategy
  setStatus('Awaiting delete confirmation...');
  const resolutions = await showDeleteConfirmModal(app, candidates);

  // Execute resolutions
  for (const resolution of resolutions) {
    const candidate = candidates.find(
      (c) => c.bookstackId === resolution.bookstackId,
    );
    if (!candidate) continue;

    try {
      await executeDeleteResolution(
        app,
        client,
        mapping,
        candidate,
        resolution,
        result,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${candidate.pageName}: ${message}`);
    }
  }

  return result;
}

async function executeDeleteResolution(
  app: App,
  client: BookStackClient,
  mapping: MappingData,
  candidate: DeleteCandidate,
  resolution: DeleteResolution,
  result: DeleteResult,
): Promise<void> {
  if (resolution.action === 'skip') return;

  if (resolution.action === 'unlink') {
    removeEntry(mapping, candidate.bookstackId);
    result.unlinked++;
    return;
  }

  // action === 'delete'
  if (candidate.direction === 'local_deleted') {
    // Delete from BookStack
    try {
      await client.deletePage(candidate.bookstackId);
    } catch (error) {
      if (!(error instanceof BookStackNotFoundError)) {
        throw error;
      }
      // Already deleted, that's fine
    }
    removeEntry(mapping, candidate.bookstackId);
    result.deletedRemote++;
  } else {
    // direction === 'remote_deleted' → delete local file
    if (candidate.vaultPath) {
      const file = app.vault.getAbstractFileByPath(candidate.vaultPath);
      if (file && file instanceof TFile) {
        await app.vault.trash(file, true); // move to system trash
      }
    }
    removeEntry(mapping, candidate.bookstackId);
    result.deletedLocal++;
  }
}

function extractPageName(vaultPath: string): string {
  const parts = vaultPath.split('/');
  const filename = parts[parts.length - 1];
  return filename.replace(/\.md$/, '');
}
