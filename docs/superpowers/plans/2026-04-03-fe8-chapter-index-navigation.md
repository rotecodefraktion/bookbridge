# FE-8: Kapitel-Index & Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate chapter/book index files and prev/next navigation links during pull, skip them during push.

**Architecture:** Extend `collectPages` to also collect chapter/book metadata with priority ordering. After pulling all pages, generate index files and inject navigation lines. On push, filter out index files and strip navigation lines before converting to HTML.

**Tech Stack:** TypeScript, Obsidian Vault API (`vault.adapter` for index files), BookStack REST API

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/sync/pull.ts` | Modify | Add `ChapterInfo`/`BookInfo` types, extend `collectPages`, add `generateIndexFiles`, add `injectNavigation` |
| `src/sync/push.ts` | Modify | Skip index files, strip nav lines before push |
| `src/sync/bidirectional.ts` | Modify | Skip index files in candidate detection |
| `src/api/types.ts` | Modify | Add `priority` field to content types |
| `src/sync/pull.test.ts` | Create | Test nav line generation and stripping |

---

### Task 1: Add `priority` to API types

**Files:**
- Modify: `src/api/types.ts:30-45`

- [ ] **Step 1: Add priority to BookStackBookContentItem**

In `BookStackBookContentItem`, add after `updated_at`:
```typescript
priority: number;
```

- [ ] **Step 2: Add priority to BookStackBookContentPage**

In `BookStackBookContentPage`, add after `updated_at`:
```typescript
priority: number;
```

- [ ] **Step 3: Run build to verify**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add src/api/types.ts
git commit -m "feat(FE-8): add priority field to BookStack content types"
```

---

### Task 2: Extend `collectPages` to collect chapter and book structure

**Files:**
- Modify: `src/sync/pull.ts`

- [ ] **Step 1: Add ChapterInfo and BookInfo interfaces**

Add after the `PageInfo` interface:
```typescript
interface ChapterInfo {
  id: number;
  name: string;
  bookId: number;
  bookName: string;
  priority: number;
  /** Page IDs in this chapter, sorted by priority */
  pageIds: number[];
}

interface BookContentsInfo {
  id: number;
  name: string;
  chapters: ChapterInfo[];
  /** Direct page IDs (not in any chapter), sorted by priority */
  directPageIds: number[];
}
```

- [ ] **Step 2: Add priority to PageInfo**

Add `priority: number;` to the `PageInfo` interface.

- [ ] **Step 3: Extend collectPages to return structured data**

Change `collectPages` signature to return both pages and structure:
```typescript
interface CollectResult {
  pages: PageInfo[];
  books: BookContentsInfo[];
}

async function collectPages(
  client: BookStackClient,
  books: BookStackBook[],
): Promise<CollectResult> {
```

Inside the function, capture priority for each page and build the `BookContentsInfo` array:
```typescript
const allPages: PageInfo[] = [];
const bookInfos: BookContentsInfo[] = [];

for (const book of books) {
  const contents = await client.getBookContents(book.id);
  const chapters: ChapterInfo[] = [];
  const directPageIds: number[] = [];

  for (const item of contents.contents) {
    if (item.type === 'page') {
      allPages.push({
        id: item.id,
        name: item.name,
        slug: item.slug,
        bookId: book.id,
        bookName: book.name,
        chapterId: null,
        chapterName: null,
        draft: false,
        updatedAt: item.updated_at,
        priority: item.priority,
      });
      directPageIds.push(item.id);
    } else if (item.type === 'chapter' && item.pages) {
      const pageIds: number[] = [];
      const sortedPages = [...item.pages].sort((a, b) => a.priority - b.priority);
      for (const page of sortedPages) {
        allPages.push({
          id: page.id,
          name: page.name,
          slug: page.slug,
          bookId: book.id,
          bookName: book.name,
          chapterId: item.id,
          chapterName: item.name,
          draft: page.draft,
          updatedAt: page.updated_at,
          priority: page.priority,
        });
        pageIds.push(page.id);
      }
      chapters.push({
        id: item.id,
        name: item.name,
        bookId: book.id,
        bookName: book.name,
        priority: item.priority,
        pageIds,
      });
    }
  }

  chapters.sort((a, b) => a.priority - b.priority);
  bookInfos.push({
    id: book.id,
    name: book.name,
    chapters,
    directPageIds,
  });
}

return { pages: allPages, books: bookInfos };
```

- [ ] **Step 4: Update pullSync to use new return type**

Change:
```typescript
const pages = await collectPages(client, selectedBooks);
```
To:
```typescript
const { pages, books: bookStructure } = await collectPages(client, selectedBooks);
```

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git add src/sync/pull.ts
git commit -m "feat(FE-8): extend collectPages with chapter/book structure and priority"
```

---

### Task 3: Generate chapter and book index files after pull

**Files:**
- Modify: `src/sync/pull.ts`

- [ ] **Step 1: Write the generateIndexFiles function**

Add this function to `pull.ts`:
```typescript
async function generateIndexFiles(
  app: App,
  settings: BookBridgeSettings,
  pages: PageInfo[],
  bookStructure: BookContentsInfo[],
): Promise<void> {
  const pageById = new Map<number, PageInfo>();
  for (const p of pages) {
    pageById.set(p.id, p);
  }

  for (const book of bookStructure) {
    const bookFolder = sanitizeFileName(book.name);
    const bookPath = normalizePath(
      `${settings.syncFolder}/${bookFolder}/${bookFolder}.md`,
    );

    // Build book index content
    const bookLines = [`# ${book.name}`, ''];
    if (book.chapters.length > 0) {
      bookLines.push('## Kapitel', '');
      for (const ch of book.chapters) {
        bookLines.push(`- [[${ch.name}]]`);
      }
    }
    if (book.directPageIds.length > 0) {
      if (book.chapters.length > 0) bookLines.push('', '## Seiten', '');
      for (const pid of book.directPageIds) {
        const p = pageById.get(pid);
        if (p) bookLines.push(`- [[${p.name}]]`);
      }
    }

    const bookContent = bookLines.join('\n') + '\n';
    await writeIndexFile(app, bookPath, bookContent, 'book', book.id, book.id);

    // Chapter indexes
    for (const chapter of book.chapters) {
      const chapterFolder = sanitizeFileName(chapter.name);
      const chapterPath = normalizePath(
        `${settings.syncFolder}/${bookFolder}/${chapterFolder}/${chapterFolder}.md`,
      );

      const chLines = [`# ${chapter.name}`, ''];
      for (const pid of chapter.pageIds) {
        const p = pageById.get(pid);
        if (p) chLines.push(`- [[${p.name}]]`);
      }

      const chContent = chLines.join('\n') + '\n';
      await writeIndexFile(app, chapterPath, chContent, 'chapter', chapter.id, book.id);
    }
  }
}

async function writeIndexFile(
  app: App,
  path: string,
  content: string,
  type: 'book' | 'chapter',
  id: number,
  bookId: number,
): Promise<void> {
  const frontmatter = type === 'book'
    ? `---\nbookstack_type: book\nbookstack_id: ${id}\n---\n`
    : `---\nbookstack_type: chapter\nbookstack_id: ${id}\nbookstack_book_id: ${bookId}\n---\n`;

  const fullContent = frontmatter + content;

  // Use adapter to bypass vault index issues
  const normalized = normalizePath(path);
  const exists = await app.vault.adapter.exists(normalized);
  if (exists) {
    const existing = await app.vault.adapter.read(normalized);
    if (existing === fullContent) return; // unchanged
  }
  await app.vault.adapter.write(normalized, fullContent);
  console.log(`BookBridge: Generated index: ${normalized}`);
}
```

- [ ] **Step 2: Call generateIndexFiles in pullSync**

Add after `await saveMapping(app.vault, mapping);` (line ~94):
```typescript
// Generate book and chapter index files
setStatus('Generating index files...');
await generateIndexFiles(app, settings, pages, bookStructure);
```

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add src/sync/pull.ts
git commit -m "feat(FE-8): generate book and chapter index files on pull"
```

---

### Task 4: Inject navigation lines into pulled pages

**Files:**
- Modify: `src/sync/pull.ts`

- [ ] **Step 1: Write the injectNavigation function**

Add to `pull.ts`:
```typescript
async function injectNavigation(
  app: App,
  settings: BookBridgeSettings,
  pages: PageInfo[],
  bookStructure: BookContentsInfo[],
): Promise<void> {
  const pageById = new Map<number, PageInfo>();
  for (const p of pages) {
    pageById.set(p.id, p);
  }

  for (const book of bookStructure) {
    const bookFolder = sanitizeFileName(book.name);

    // Navigate direct book pages
    for (let i = 0; i < book.directPageIds.length; i++) {
      const page = pageById.get(book.directPageIds[i]);
      if (!page) continue;
      const prev = i > 0 ? pageById.get(book.directPageIds[i - 1]) : null;
      const next = i < book.directPageIds.length - 1 ? pageById.get(book.directPageIds[i + 1]) : null;
      await writeNavLine(app, settings, page, book.name, prev, next);
    }

    // Navigate chapter pages
    for (const chapter of book.chapters) {
      for (let i = 0; i < chapter.pageIds.length; i++) {
        const page = pageById.get(chapter.pageIds[i]);
        if (!page) continue;
        const prev = i > 0 ? pageById.get(chapter.pageIds[i - 1]) : null;
        const next = i < chapter.pageIds.length - 1 ? pageById.get(chapter.pageIds[i + 1]) : null;
        await writeNavLine(app, settings, page, chapter.name, prev, next);
      }
    }
  }
}

async function writeNavLine(
  app: App,
  settings: BookBridgeSettings,
  page: PageInfo,
  parentName: string,
  prev: PageInfo | null,
  next: PageInfo | null,
): Promise<void> {
  const bookFolder = sanitizeFileName(page.bookName);
  const chapterFolder = page.chapterName ? sanitizeFileName(page.chapterName) : null;
  const pageName = sanitizeFileName(page.name);
  const vaultPath = buildPagePath(settings.syncFolder, bookFolder, chapterFolder, pageName);

  const normalized = normalizePath(vaultPath);
  const exists = await app.vault.adapter.exists(normalized);
  if (!exists) return;

  const content = await app.vault.adapter.read(normalized);

  // Build nav line
  const parts = [`\u2191 [[${parentName}]]`];
  if (prev) parts.push(`\u2190 [[${prev.name}]]`);
  if (next) parts.push(`\u2192 [[${next.name}]]`);
  const navLine = parts.join(' \u00B7 ');

  // Strip existing nav line (starts with ↑ after frontmatter)
  const stripped = content.replace(/^(---\n[\s\S]*?\n---\n)\u2191 \[\[.*\n\n?/, '$1');

  // Inject after frontmatter
  const injected = stripped.replace(/^(---\n[\s\S]*?\n---\n)/, `$1${navLine}\n\n`);

  if (injected !== content) {
    await app.vault.adapter.write(normalized, injected);
  }
}
```

- [ ] **Step 2: Export `buildNavLine` for testing and call in pullSync**

Add after `generateIndexFiles` call:
```typescript
// Inject prev/next navigation into pages
setStatus('Injecting navigation...');
await injectNavigation(app, settings, pages, bookStructure);
```

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add src/sync/pull.ts
git commit -m "feat(FE-8): inject prev/next navigation lines into pulled pages"
```

---

### Task 5: Skip index files and strip nav lines during push

**Files:**
- Modify: `src/sync/push.ts`
- Modify: `src/sync/bidirectional.ts`

- [ ] **Step 1: Skip index files in pushSync**

In `pushSync`, in the `for (const file of files)` loop, add at the top before `readFrontmatter`:
```typescript
// Skip index files (book/chapter indexes generated by pull)
const fm = readFrontmatter(app, file);
if (fm && (fm.bookstack_type === 'book' || fm.bookstack_type === 'chapter')) {
  console.log(`BookBridge: Push skipping index file "${file.path}"`);
  continue;
}
```

Note: The existing `readFrontmatter` call needs adjustment — it currently returns `null` for files with `bookstack_type: 'book'` or `'chapter'` because `BookBridgeFrontmatter` only allows `'page' | 'chapter'`. Check if `readFrontmatter` returns a valid object for `bookstack_type: book`. If not, read frontmatter manually via `metadataCache`:

```typescript
const cache = app.metadataCache.getFileCache(file);
const rawFm = cache?.frontmatter;
if (rawFm?.bookstack_type === 'book' || rawFm?.bookstack_type === 'chapter') {
  console.log(`BookBridge: Push skipping index file "${file.path}"`);
  continue;
}
```

- [ ] **Step 2: Strip nav lines before push content hashing**

In `pushSync`, after reading content and stripping frontmatter, also strip the navigation line:
```typescript
const rawContent = await app.vault.read(file);
let content = stripFrontmatter(rawContent);
// Strip navigation line (starts with ↑ [[)
content = content.replace(/^\u2191 \[\[.*\]\].*\n\n?/, '');
const hash = computeHash(content);
```

Apply this to BOTH branches (existing frontmatter files AND new files without frontmatter).

- [ ] **Step 3: Strip nav line in pushPage and pushNewPage before markdownToHtml**

In `pushPage` and `pushNewPage`, the `content` parameter already has frontmatter stripped. Add nav stripping:
```typescript
// Strip navigation line before converting to HTML
const cleanContent = content.replace(/^\u2191 \[\[.*\]\].*\n\n?/, '');
const html = markdownToHtml(cleanContent, pushContext);
```

- [ ] **Step 4: Skip index files in bidirectional.ts**

In `bidirectional.ts`, in the "Step 2b" loop for new local files, add the same check:
```typescript
// Skip index files
const cache = app.metadataCache.getFileCache(file);
const rawFm = cache?.frontmatter;
if (rawFm?.bookstack_type === 'book' || rawFm?.bookstack_type === 'chapter') continue;
```

Also in the "Step 2" loop (existing frontmatter files), add the same skip.

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git add src/sync/push.ts src/sync/bidirectional.ts
git commit -m "feat(FE-8): skip index files and strip nav lines during push"
```

---

### Task 6: Write tests

**Files:**
- Create: `src/sync/navigation.test.ts`

- [ ] **Step 1: Write tests for nav line generation and stripping**

```typescript
import { describe, it, expect } from 'vitest';

describe('navigation line', () => {
  const NAV_REGEX = /^\u2191 \[\[.*\]\].*\n\n?/;

  it('strips nav line from content', () => {
    const content = '↑ [[FRUN Setup]] · ← [[FRUN decision model]] · → [[FRUN vs CCT]]\n\n# DRDB Setup\n\nContent here';
    const stripped = content.replace(NAV_REGEX, '');
    expect(stripped).toBe('# DRDB Setup\n\nContent here');
  });

  it('preserves content without nav line', () => {
    const content = '# DRDB Setup\n\nContent here';
    const stripped = content.replace(NAV_REGEX, '');
    expect(stripped).toBe(content);
  });

  it('builds correct nav line with all elements', () => {
    const parts = ['↑ [[FRUN Setup]]', '← [[FRUN decision model]]', '→ [[FRUN vs CCT]]'];
    const navLine = parts.join(' · ');
    expect(navLine).toBe('↑ [[FRUN Setup]] · ← [[FRUN decision model]] · → [[FRUN vs CCT]]');
  });

  it('builds nav line for first page (no prev)', () => {
    const parts = ['↑ [[FRUN Setup]]', '→ [[FRUN Security]]'];
    const navLine = parts.join(' · ');
    expect(navLine).toBe('↑ [[FRUN Setup]] · → [[FRUN Security]]');
  });

  it('builds nav line for last page (no next)', () => {
    const parts = ['↑ [[FRUN Setup]]', '← [[FRUN Security]]'];
    const navLine = parts.join(' · ');
    expect(navLine).toBe('↑ [[FRUN Setup]] · ← [[FRUN Security]]');
  });

  it('builds nav line for single page in chapter', () => {
    const parts = ['↑ [[Azure Dokumentation]]'];
    const navLine = parts.join(' · ');
    expect(navLine).toBe('↑ [[Azure Dokumentation]]');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/sync/navigation.test.ts
git commit -m "test(FE-8): add navigation line unit tests"
```

---

### Task 7: Integration test against real API

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Test pull with real BookStack**

Verify by running pull in Obsidian and checking:
1. Console shows `BookBridge: Generated index: BookStack/Consolut Internal/Consolut Internal.md`
2. Index files contain correct wikilinks
3. Pages have nav lines: `↑ [[FRUN Setup]] · ← [[prev]] · → [[next]]`
4. Second pull doesn't regenerate unchanged indexes

- [ ] **Step 4: Test push doesn't push index files**

1. Run push — index files should not appear as candidates
2. Console shows `BookBridge: Push skipping index file "..."`
3. Nav lines should not appear in BookStack HTML

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(FE-8): chapter index files and page navigation"
```
