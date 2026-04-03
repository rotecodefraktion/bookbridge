import { normalizePath } from 'obsidian';

/**
 * Build the vault path for a BookStack page.
 */
export function buildPagePath(
  syncFolder: string,
  bookName: string,
  chapterName: string | null,
  pageName: string,
): string {
  const parts = [syncFolder, bookName];
  if (chapterName) {
    parts.push(chapterName);
  }
  parts.push(`${pageName}.md`);
  return normalizePath(parts.join('/'));
}

/**
 * Build the vault path for the assets folder.
 */
export function buildAssetPath(
  syncFolder: string,
  assetFolder: string,
  subfolder: 'gallery' | 'attachments' | 'drawings',
): string {
  return normalizePath(`${syncFolder}/${assetFolder}/${subfolder}`);
}
