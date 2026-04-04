import { Vault, normalizePath } from 'obsidian';

export interface MappingEntry {
  bookstackId: number;
  bookstackType: 'page' | 'chapter' | 'book';
  vaultPath: string;
  bookstackUpdatedAt: string;
  bookstackBookId: number;
  bookstackChapterId: number | null;
  localHash: string;
  remoteHash: string;
}

export interface MappingData {
  version: number;
  lastSync: string;
  entries: MappingEntry[];
}

const MAPPING_FILE = '.bookbridge.json';
const MAPPING_VERSION = 1;

export function createEmptyMapping(): MappingData {
  return {
    version: MAPPING_VERSION,
    lastSync: new Date().toISOString(),
    entries: [],
  };
}

export async function loadMapping(vault: Vault): Promise<MappingData> {
  const path = normalizePath(MAPPING_FILE);

  const exists = await vault.adapter.exists(path);
  if (!exists) {
    return createEmptyMapping();
  }

  try {
    const content = await vault.adapter.read(path);
    const data = JSON.parse(content) as MappingData;

    if (data.version !== MAPPING_VERSION) {
      // Future: handle migration
      return createEmptyMapping();
    }

    return data;
  } catch {
    return createEmptyMapping();
  }
}

export async function saveMapping(
  vault: Vault,
  mapping: MappingData,
): Promise<void> {
  const path = normalizePath(MAPPING_FILE);
  mapping.lastSync = new Date().toISOString();

  const content = JSON.stringify(mapping, null, 2);
  await vault.adapter.write(path, content);
}

export function findEntry(
  mapping: MappingData,
  bookstackId: number,
): MappingEntry | undefined {
  return mapping.entries.find((e) => e.bookstackId === bookstackId);
}

export function findEntryByPath(
  mapping: MappingData,
  vaultPath: string,
): MappingEntry | undefined {
  return mapping.entries.find((e) => e.vaultPath === vaultPath);
}

export function upsertEntry(
  mapping: MappingData,
  entry: MappingEntry,
): void {
  const idx = mapping.entries.findIndex(
    (e) => e.bookstackId === entry.bookstackId,
  );
  if (idx >= 0) {
    mapping.entries[idx] = entry;
  } else {
    mapping.entries.push(entry);
  }
}

export function removeEntry(
  mapping: MappingData,
  bookstackId: number,
): void {
  mapping.entries = mapping.entries.filter(
    (e) => e.bookstackId !== bookstackId,
  );
}

/**
 * Build a slug→title map for internal link rewriting during HTML→MD conversion.
 */
export function buildSlugToTitleMap(
  mapping: MappingData,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of mapping.entries) {
    if (entry.bookstackType === 'page') {
      // Extract title from vault path: "Folder/Book/Chapter/Title.md" → "Title"
      const parts = entry.vaultPath.split('/');
      const filename = parts[parts.length - 1];
      const title = filename.replace(/\.md$/, '');
      // We don't have the slug stored, so this map is populated during pull
      map.set(String(entry.bookstackId), title);
    }
  }
  return map;
}
