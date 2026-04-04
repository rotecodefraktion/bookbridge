# BUG-4: Push cannot create new pages without bookstack_id

**Status:** fixed
**Feature:** FE-5 (Push Sync)
**Severity:** high

## Problem

`pushSync` in `src/sync/push.ts` skipped all files without `bookstack_id` frontmatter (line 52: `if (!fm) continue;`). This made it impossible to create new BookStack pages from Obsidian -- only files that had already been pulled from BookStack could be pushed back.

## Root Cause

The push loop only processed files that already had BookBridge frontmatter. Files created locally in the sync folder were silently ignored.

## Fix

Modified `pushSync` to:

1. **Detect new files** (no frontmatter, not yet in mapping) in the sync folder
2. **Derive book/chapter from folder path**:
   - `{syncFolder}/{BookName}/Page.md` -> book "BookName", no chapter
   - `{syncFolder}/{BookName}/{ChapterName}/Page.md` -> book "BookName", chapter "ChapterName"
3. **Look up BookStack IDs by name** using `client.getAllBooks()` and `client.getBookContents(bookId)`
4. **Create the page** via `client.createPage()`
5. **Set frontmatter** on the file after creation
6. **Update mapping** with the new entry

New files appear in the push confirmation modal with `[NEW]` badge.

### Additional fixes (2026-04-03)

- **Book selection filtering for new files**: New files without frontmatter were not filtered by `singleBookId` or `selectedBookIds`. Now resolves book name to ID before adding as candidate and applies the same filtering as existing files.
- **Debug logging**: Added `console.log` at key decision points throughout the push flow (scanning, candidate selection, book/chapter resolution, page creation, errors) to enable runtime debugging.
- **Markdown-to-HTML table conversion**: `md-to-html.ts` was missing GFM table support entirely. Added `convertTables()` with alignment support.
- **List wrapping**: Consecutive `<li>` items are now wrapped in proper `<ul>`/`<ol>` tags instead of being bare list items.

## Files Changed

- `src/sync/push.ts` — book selection filtering for new files, debug logging
- `src/convert/md-to-html.ts` — table conversion, list wrapping
