/** Characters not allowed in Obsidian file/folder names */
const INVALID_CHARS = /[/\\:*?"<>|#^[\]]/g;

/** Max filename length (without extension) */
const MAX_NAME_LENGTH = 200;

/**
 * Sanitize a string for use as a file or folder name in Obsidian.
 * Removes invalid characters and trims to max length.
 */
export function sanitizeFileName(name: string): string {
  let sanitized = name
    .replace(INVALID_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (sanitized.length > MAX_NAME_LENGTH) {
    sanitized = sanitized.substring(0, MAX_NAME_LENGTH).trim();
  }

  // Fallback for empty names
  if (!sanitized) {
    sanitized = 'Untitled';
  }

  return sanitized;
}

/**
 * Make a filename unique by appending a suffix if it already exists in the set.
 * Returns the unique name and adds it to the set.
 */
export function makeUnique(name: string, existing: Set<string>): string {
  if (!existing.has(name)) {
    existing.add(name);
    return name;
  }

  let counter = 2;
  let candidate = `${name} (${counter})`;
  while (existing.has(candidate)) {
    counter++;
    candidate = `${name} (${counter})`;
  }

  existing.add(candidate);
  return candidate;
}

/**
 * Sanitize a path for use in asset downloads.
 * Prevents path traversal attacks by extracting the basename
 * and rejecting directory traversal names.
 */
export function sanitizeAssetPath(filename: string): string {
  // Remove leading slashes
  let sanitized = filename.replace(/^[/\\]+/, '');
  // Extract just the filename part (basename)
  const parts = sanitized.split(/[/\\]/);
  sanitized = parts[parts.length - 1] || 'file';
  // Reject directory traversal names
  if (sanitized === '.' || sanitized === '..') {
    sanitized = 'file';
  }
  return sanitizeFileName(sanitized);
}
