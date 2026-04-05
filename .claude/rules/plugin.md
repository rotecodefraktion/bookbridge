# Obsidian Plugin Rules

## Obsidian API — Pflicht-Patterns

### Plugin Lifecycle
```typescript
export default class BookBridgePlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new BookBridgeSettingTab(this.app, this));
    this.addRibbonIcon('book-open', 'BookBridge Sync', () => this.sync());
    this.addStatusBarItem().setText('BookBridge: Ready');
    this.addCommand({ id: 'sync', name: 'Sync with BookStack', callback: () => this.sync() });
  }
  async onunload() { /* Cleanup: Intervals, Event Listeners */ }
}
```

### Vault API (statt fs)
```typescript
// Datei erstellen/überschreiben
await this.app.vault.create(path, content);
await this.app.vault.modify(file, content);

// Datei lesen
const content = await this.app.vault.read(file);

// Ordner erstellen
await this.app.vault.createFolder(path);

// Datei finden
const file = this.app.vault.getAbstractFileByPath(path);

// Binärdateien (Bilder, PDFs)
await this.app.vault.createBinary(path, arrayBuffer);
```

### Frontmatter
```typescript
await this.app.fileManager.processFrontMatter(file, (fm) => {
  fm.bookstack_id = page.id;
  fm.bookstack_type = 'page';
  fm.bookstack_updated_at = page.updated_at;
  fm.bookstack_book_id = page.book_id;
  fm.bookstack_chapter_id = page.chapter_id;
});
```

### HTTP Requests (statt fetch)
```typescript
import { requestUrl, RequestUrlParam } from 'obsidian';

const response = await requestUrl({
  url: `${this.settings.baseUrl}/api/pages/${id}`,
  headers: {
    'Authorization': `Token ${this.settings.tokenId}:${this.settings.tokenSecret}`
  }
});
```

### Settings Interface
```typescript
interface BookBridgeSettings {
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  syncFolder: string;          // Default: 'BookStack'
  downloadAssets: boolean;     // Default: true
  assetFolder: string;         // Default: '_assets'
  syncMode: 'pull' | 'push' | 'bidirectional';
  conflictStrategy: 'ask' | 'local' | 'remote';
  autoSync: boolean;
  autoSyncInterval: number;    // Minuten
}
```

## BookStack API Client

```typescript
class BookStackClient {
  constructor(private baseUrl: string, private tokenId: string, private tokenSecret: string) {}

  private async request(endpoint: string, method = 'GET', body?: unknown) {
    const response = await requestUrl({
      url: `${this.baseUrl}/api/${endpoint}`,
      method,
      headers: {
        'Authorization': `Token ${this.tokenId}:${this.tokenSecret}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json;
  }

  async getBooks() { return this.request('books'); }
  async getBook(id: number) { return this.request(`books/${id}`); }
  async getChapters(bookId: number) { return this.request(`chapters?filter[book_id]=${bookId}`); }
  async getPage(id: number) { return this.request(`pages/${id}`); }
  async getPageExportMarkdown(id: number) { return this.request(`pages/${id}/export/markdown`); }
  async getPageExportHtml(id: number) { return this.request(`pages/${id}/export/html`); }
  async createPage(data: object) { return this.request('pages', 'POST', data); }
  async updatePage(id: number, data: object) { return this.request(`pages/${id}`, 'PUT', data); }
  async getImage(id: number) { return this.request(`image-gallery/${id}`); }
  async getAttachment(id: number) { return this.request(`attachments/${id}`); }
}
```

## Vault-Ordnerstruktur

```
{syncFolder}/
├── _assets/
│   ├── {bookstack_image_id}.png
│   └── {bookstack_attachment_id}.pdf
├── Book Name/
│   ├── Page 1.md
│   └── Chapter Name/
│       └── Page 2.md
```

## TypeScript Standards

- **Strict mode** — `"strict": true` in tsconfig.json
- **Kein `any`** — immer typisieren, notfalls `unknown` + Type Guard
- **Kein `@ts-ignore`** — Typ-Probleme lösen, nicht ignorieren
- **Interfaces statt Type Aliases** für Objekte
- **Enum vermeiden** — `const` Objekte oder Union Types bevorzugen

## Mapping-Datei

`.bookbridge.json` im Vault-Root:
```json
{
  "version": 1,
  "lastSync": "2026-04-03T10:00:00Z",
  "entries": [
    {
      "bookstackId": 42,
      "bookstackType": "page",
      "vaultPath": "BookStack/My Book/Chapter 1/Page Title.md",
      "bookstackUpdatedAt": "2026-04-03T09:30:00Z",
      "localHash": "sha256...",
      "remoteHash": "sha256..."
    }
  ]
}
```

## ⛔ Verbotene Patterns

- `import * as fs from 'fs'` oder `import { readFileSync }`
- `import * as path from 'path'` (nur `normalizePath` von Obsidian)
- `fetch()` oder `XMLHttpRequest` (nur `requestUrl()`)
- `localStorage` / `sessionStorage`
- `document.querySelector` für Plugin-UI (Obsidian Components nutzen)
- `require('child_process')` oder andere Node.js-only APIs
