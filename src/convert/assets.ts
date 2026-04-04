import { Vault, TFile, TFolder, normalizePath, requestUrl } from 'obsidian';
import { sanitizeAssetPath } from '../utils/sanitize';
import { buildAssetPath } from '../utils/paths';
import { BookStackClient } from '../api/client';

export interface AssetDownloadResult {
  downloaded: number;
  skipped: number;
  errors: string[];
}

/**
 * Download all images found in HTML and save them locally.
 * Returns a Map of original image URLs → local vault-relative paths.
 */
export async function downloadImages(
  vault: Vault,
  html: string,
  baseUrl: string,
  syncFolder: string,
  assetFolder: string,
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  const urls = extractImageUrls(html, baseUrl);
  if (urls.length === 0) return urlMap;

  const galleryPath = buildAssetPath(syncFolder, assetFolder, 'gallery');
  await ensureAssetFolder(vault, galleryPath);

  for (const originalUrl of urls) {
    const filename = extractFilename(originalUrl);
    const sanitized = sanitizeAssetPath(filename);
    const localPath = normalizePath(`${galleryPath}/${sanitized}`);
    const relativePath = `${syncFolder}/${assetFolder}/gallery/${sanitized}`;

    try {
      // Skip if already downloaded
      const existing = vault.getAbstractFileByPath(localPath);
      if (existing && existing instanceof TFile) {
        urlMap.set(originalUrl, relativePath);
        continue;
      }

      // Normalize BookStack image URLs to use configured baseUrl
      // (HTML may contain old/different host:port combinations)
      const downloadUrl = normalizeBookStackUrl(originalUrl, baseUrl);
      const response = await requestUrl({ url: downloadUrl });
      await vault.createBinary(localPath, response.arrayBuffer);
      urlMap.set(originalUrl, relativePath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // On case-insensitive filesystems (macOS), the file may already exist
      // with different casing — treat as successful skip
      if (msg.includes('File already exists')) {
        urlMap.set(originalUrl, relativePath);
        continue;
      }
      console.warn(`BookBridge: Failed to download image: ${msg}`);
    }
  }

  return urlMap;
}

/**
 * Download attachments for a page and save them locally.
 * Returns a Map of attachment ID → local vault-relative path.
 */
export async function downloadAttachments(
  vault: Vault,
  client: BookStackClient,
  pageId: number,
  syncFolder: string,
  assetFolder: string,
): Promise<Map<number, string>> {
  const idMap = new Map<number, string>();

  let attachments: { id: number; name: string; extension: string; external: boolean }[];
  try {
    const response = await client.getAttachmentsForPage(pageId);
    attachments = response.data;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`BookBridge: Failed to list attachments for page ${pageId}: ${msg}`);
    return idMap;
  }

  if (attachments.length === 0) return idMap;

  const attachmentPath = buildAssetPath(syncFolder, assetFolder, 'attachments');
  await ensureAssetFolder(vault, attachmentPath);

  for (const attachment of attachments) {
    if (attachment.external) continue;

    // Build filename — avoid double extensions
    const name = attachment.name;
    const ext = attachment.extension ? `.${attachment.extension}` : '';
    const rawName = name.endsWith(ext) ? name : `${name}${ext}`;
    const sanitized = sanitizeAssetPath(rawName);
    const localPath = normalizePath(`${attachmentPath}/${sanitized}`);
    const relativePath = `${syncFolder}/${assetFolder}/attachments/${sanitized}`;

    try {
      // Skip if already downloaded
      const existing = vault.getAbstractFileByPath(localPath);
      if (existing && existing instanceof TFile) {
        idMap.set(attachment.id, relativePath);
        continue;
      }

      // Fetch attachment detail and decode content
      const detail = await client.getAttachment(attachment.id);
      if (!detail.content) {
        console.warn(`BookBridge: Attachment ${attachment.id} has no content`);
        continue;
      }

      const binary = base64ToArrayBuffer(detail.content);
      if (binary.byteLength === 0) {
        console.warn(`BookBridge: Attachment ${attachment.id} decoded to empty content`);
        continue;
      }

      await vault.createBinary(localPath, binary);
      idMap.set(attachment.id, relativePath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('File already exists')) {
        idMap.set(attachment.id, relativePath);
        continue;
      }
      console.warn(`BookBridge: Failed to download attachment ${attachment.id} (${attachment.name}): ${msg}`);
    }
  }

  return idMap;
}

/**
 * Rewrite all BookStack asset URLs in markdown to local paths.
 * - imageMap: original full URL → local path
 * - attachmentMap: attachment ID → local path
 */
export function rewriteAssetUrls(
  markdown: string,
  imageMap: Map<string, string>,
  attachmentMap: Map<number, string>,
  baseUrl: string,
): string {
  let result = markdown;

  // Helper: look up a URL in imageMap, trying both absolute and baseUrl-prefixed forms
  const findLocalPath = (src: string): string | undefined => {
    const direct = imageMap.get(src);
    if (direct) return direct;
    // If src is relative, try with baseUrl prefix
    if (src.startsWith('/')) {
      return imageMap.get(`${baseUrl}${src}`);
    }
    return undefined;
  };

  // First: rewrite any remaining linked images [![alt](img-url)](link-url) → ![alt](local-path)
  // (The Turndown linked-image rule should prevent most of these, but handle edge cases)
  result = result.replace(
    /\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g,
    (match, alt: string, imgSrc: string, _linkHref: string) => {
      const localPath = findLocalPath(imgSrc);
      if (localPath) {
        return `![${alt}](${localPath})`;
      }
      return match;
    },
  );

  // Then: rewrite standalone images ![alt](url) → ![alt](local-path)
  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (match, alt: string, src: string) => {
      const localPath = findLocalPath(src);
      if (localPath) {
        return `![${alt}](${localPath})`;
      }
      return match;
    },
  );

  // Rewrite attachments: [text](http://.../attachments/7) → [text](local-path)
  result = result.replace(
    /\[([^\]]*)\]\(([^)]*\/attachments\/(\d+)[^)]*)\)/g,
    (match, text: string, _href: string, idStr: string) => {
      const id = parseInt(idStr, 10);
      const localPath = attachmentMap.get(id);
      if (localPath) {
        return `[${text}](${localPath})`;
      }
      return match;
    },
  );

  return result;
}

/**
 * Extract all image URLs from HTML (absolute and relative).
 * Relative URLs (starting with /) are converted to absolute using baseUrl.
 */
function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    let url = match[1];
    // Skip data URIs
    if (url.startsWith('data:')) continue;
    // Convert relative URLs to absolute
    if (url.startsWith('/')) {
      url = `${baseUrl}${url}`;
    }
    // Only include http(s) URLs (after potential conversion)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      urls.push(url);
    }
  }
  return [...new Set(urls)];
}

/**
 * Normalize a BookStack URL to use the configured baseUrl.
 * HTML content may contain URLs with old/different host:port (e.g. after APP_URL change).
 * Replaces the origin (scheme+host+port) with baseUrl for any URL containing /uploads/.
 */
function normalizeBookStackUrl(url: string, baseUrl: string): string {
  const uploadsIndex = url.indexOf('/uploads/');
  if (uploadsIndex !== -1) {
    return `${baseUrl}${url.substring(uploadsIndex)}`;
  }
  return url;
}

function extractFilename(url: string): string {
  const path = url.split('?')[0];
  const parts = path.split('/');
  return parts[parts.length - 1] || 'file';
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

async function ensureAssetFolder(vault: Vault, path: string): Promise<void> {
  const normalized = normalizePath(path);
  const existing = vault.getAbstractFileByPath(normalized);
  if (existing && existing instanceof TFolder) return;
  if (!existing) {
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
