/**
 * Format a relative time string for the status bar.
 */
export function formatLastSync(lastSync: string | null): string {
  if (!lastSync) return 'Never synced';

  const date = new Date(lastSync);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Last sync: just now';
  if (diffMin < 60) return `Last sync: ${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Last sync: ${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `Last sync: ${diffDays}d ago`;
}
