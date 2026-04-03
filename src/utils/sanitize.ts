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
 * Prevents path traversal attacks.
 */
export function sanitizeAssetPath(filename: string): string {
  // Remove path traversal
  let sanitized = filename.replace(/\.\./g, '').replace(/^[/\\]+/, '');
  // Extract just the filename part
  const parts = sanitized.split(/[/\\]/);
  sanitized = parts[parts.length - 1] || 'file';
  return sanitizeFileName(sanitized);
}
