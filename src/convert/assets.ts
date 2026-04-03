import { Vault, TFile, TFolder, normalizePath, requestUrl } from 'obsidian';
import { sanitizeAssetPath } from '../utils/sanitize';
import { buildAssetPath } from '../utils/paths';

export interface AssetDownloadResult {
  downloaded: number;
  skipped: number;
  errors: string[];
}

export interface AssetMapping {
  /** BookStack image URL → local vault path */
  urlToLocal: Map<string, string>;
  /** Local vault path → BookStack image URL (for push) */
  localToUrl: Map<string, string>;
}

/**
 * Extract all image URLs from HTML that belong to the BookStack instance.
 */
export function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  // Match src attributes in img tags
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    let url = match[1];

    // Convert relative URLs to absolute
    if (url.startsWith('/')) {
      url = `${baseUrl}${url}`;
    }

    // Only include URLs from our BookStack instance
    if (url.startsWith(baseUrl)) {
      urls.push(url);
    }
    // Skip external URLs and data URIs
  }

  return [...new Set(urls)]; // deduplicate
}

/**
 * Extract all attachment links from HTML.
 */
export function extractAttachmentUrls(
  html: string,
  baseUrl: string,
): string[] {
  const urls: string[] = [];
  // Match href attributes in anchor tags pointing to attachments
  const linkRegex = /<a[^>]+href=["']([^"']+\/attachments\/[^"']+)["']/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    let url = match[1];
    if (url.startsWith('/')) {
      url = `${baseUrl}${url}`;
    }
    if (url.startsWith(baseUrl)) {
      urls.push(url);
    }
  }

  return [...new Set(urls)];
}

/**
 * Download images from BookStack and save them locally.
 * Returns a mapping of BookStack URLs to local vault paths.
 */
export async function downloadImages(
  vault: Vault,
  html: string,
  baseUrl: string,
  syncFolder: string,
  assetFolder: string,
  setStatus?: (text: string) => void,
): Promise<{ markdown: string; result: AssetDownloadResult }> {
  const urls = extractImageUrls(html, baseUrl);
  const assetPath = buildAssetPath(syncFolder, assetFolder, 'gallery');
  const downloadResult: AssetDownloadResult = {
    downloaded: 0,
    skipped: 0,
    errors: [],
  };

  await ensureAssetFolder(vault, assetPath);

  let markdown = html;
  let processed = 0;

  for (const url of urls) {
    processed++;
    if (setStatus) {
      setStatus(`Downloading assets ${processed}/${urls.length}...`);
    }

    try {
      const localPath = await downloadAsset(vault, url, assetPath);
      if (localPath) {
        // Replace URL in the content with local path
        const relativePath = `${assetFolder}/gallery/${localPath.split('/').pop()}`;
        markdown = markdown.split(url).join(relativePath);
        downloadResult.downloaded++;
      } else {
        downloadResult.skipped++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      downloadResult.errors.push(`${url}: ${message}`);
    }
  }

  return { markdown, result: downloadResult };
}

/**
 * Download a single asset and save it to the vault.
 * Returns the local path or null if already exists.
 */
async function downloadAsset(
  vault: Vault,
  url: string,
  assetFolderPath: string,
): Promise<string | null> {
  const filename = extractFilename(url);
  const sanitized = sanitizeAssetPath(filename);
  const localPath = normalizePath(`${assetFolderPath}/${sanitized}`);

  // Check if already downloaded
  const existing = vault.getAbstractFileByPath(localPath);
  if (existing && existing instanceof TFile) {
    return null; // already exists, skip
  }

  const response = await requestUrl({ url });
  await vault.createBinary(localPath, response.arrayBuffer);

  return localPath;
}

/**
 * Rewrite image URLs in markdown to local paths.
 * Used after HTML→MD conversion.
 */
export function rewriteImageUrls(
  markdown: string,
  baseUrl: string,
  assetFolder: string,
): string {
  // Match markdown image syntax: ![alt](url)
  return markdown.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (match, alt: string, src: string) => {
      // Only rewrite BookStack URLs
      if (src.startsWith(baseUrl) || src.startsWith('/uploads/')) {
        const filename = extractFilename(src);
        const sanitized = sanitizeAssetPath(filename);
        return `![${alt}](${assetFolder}/gallery/${sanitized})`;
      }
      return match;
    },
  );
}

/**
 * Rewrite attachment links in markdown to local paths.
 */
export function rewriteAttachmentUrls(
  markdown: string,
  baseUrl: string,
  assetFolder: string,
): string {
  return markdown.replace(
    /\[([^\]]*)\]\(([^)]*\/attachments\/[^)]+)\)/g,
    (match, text: string, href: string) => {
      if (href.startsWith(baseUrl) || href.startsWith('/attachments/')) {
        const filename = extractFilename(href);
        const sanitized = sanitizeAssetPath(filename);
        return `[${text}](${assetFolder}/attachments/${sanitized})`;
      }
      return match;
    },
  );
}

function extractFilename(url: string): string {
  const path = url.split('?')[0]; // remove query params
  const parts = path.split('/');
  return parts[parts.length - 1] || 'file';
}

async function ensureAssetFolder(vault: Vault, path: string): Promise<void> {
  const normalized = normalizePath(path);
  const existing = vault.getAbstractFileByPath(normalized);
  if (existing && existing instanceof TFolder) return;
  if (!existing) {
    // Create parent folders recursively
    const parts = normalized.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const folder = vault.getAbstractFileByPath(current);
      if (!folder) {
        await vault.createFolder(current);
      }
    }
  }
}
