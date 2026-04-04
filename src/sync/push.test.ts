import { describe, it, expect } from 'vitest';
import { deriveBookAndChapter, resolveBookId } from './push';

describe('deriveBookAndChapter', () => {
  const syncFolder = 'BookStack';

  it('derives book name from direct child', () => {
    const result = deriveBookAndChapter(
      'BookStack/Private Notes/Markdown Cheat Sheet.md',
      syncFolder,
    );
    expect(result).toEqual({
      bookName: 'Private Notes',
      chapterName: null,
    });
  });

  it('derives book and chapter from nested path', () => {
    const result = deriveBookAndChapter(
      'BookStack/My Book/Chapter 1/Page Title.md',
      syncFolder,
    );
    expect(result).toEqual({
      bookName: 'My Book',
      chapterName: 'Chapter 1',
    });
  });

  it('returns null for file directly in syncFolder', () => {
    const result = deriveBookAndChapter(
      'BookStack/orphan.md',
      syncFolder,
    );
    expect(result).toBeNull();
  });

  it('returns null for deeply nested file', () => {
    const result = deriveBookAndChapter(
      'BookStack/Book/Chapter/SubFolder/Page.md',
      syncFolder,
    );
    expect(result).toBeNull();
  });

  it('returns null for file outside syncFolder', () => {
    const result = deriveBookAndChapter(
      'Other/Book/Page.md',
      syncFolder,
    );
    expect(result).toBeNull();
  });
});

describe('resolveBookId', () => {
  const books = [
    { id: 1, name: 'Private Notes', slug: 'private-notes', description: '', created_at: '', updated_at: '', created_by: 0, updated_by: 0, owned_by: 0 },
    { id: 2, name: 'Xylem', slug: 'xylem', description: '', created_at: '', updated_at: '', created_by: 0, updated_by: 0, owned_by: 0 },
  ];

  it('finds book by exact name', async () => {
    const id = await resolveBookId('Private Notes', books);
    expect(id).toBe(1);
  });

  it('finds book case-insensitively', async () => {
    const id = await resolveBookId('private notes', books);
    expect(id).toBe(1);
  });

  it('returns null for unknown book', async () => {
    const id = await resolveBookId('NonExistent', books);
    expect(id).toBeNull();
  });
});
