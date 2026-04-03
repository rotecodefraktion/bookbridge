import { App, TFile } from 'obsidian';

export interface BookBridgeFrontmatter {
  bookstack_id: number;
  bookstack_type: 'page' | 'chapter';
  bookstack_updated_at: string;
  bookstack_book_id: number;
  bookstack_chapter_id?: number;
}

/**
 * Set BookBridge frontmatter on a file.
 */
export async function setFrontmatter(
  app: App,
  file: TFile,
  data: BookBridgeFrontmatter,
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm) => {
    fm.bookstack_id = data.bookstack_id;
    fm.bookstack_type = data.bookstack_type;
    fm.bookstack_updated_at = data.bookstack_updated_at;
    fm.bookstack_book_id = data.bookstack_book_id;
    if (data.bookstack_chapter_id) {
      fm.bookstack_chapter_id = data.bookstack_chapter_id;
    }
  });
}

/**
 * Read BookBridge frontmatter from a file.
 * Returns null if the file doesn't have BookBridge frontmatter.
 */
export function readFrontmatter(
  app: App,
  file: TFile,
): BookBridgeFrontmatter | null {
  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter;

  if (!fm || typeof fm.bookstack_id !== 'number') {
    return null;
  }

  return {
    bookstack_id: fm.bookstack_id,
    bookstack_type: fm.bookstack_type || 'page',
    bookstack_updated_at: fm.bookstack_updated_at || '',
    bookstack_book_id: fm.bookstack_book_id || 0,
    bookstack_chapter_id: fm.bookstack_chapter_id,
  };
}

/**
 * Strip frontmatter from markdown content to get pure content for hashing.
 */
export function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n/);
  if (match) {
    return content.slice(match[0].length);
  }
  return content;
}
