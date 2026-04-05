import { Notice, Plugin, SuggestModal, App } from 'obsidian';
import { BookBridgeSettings, BookBridgeSettingTab, DEFAULT_SETTINGS } from './settings';
import { BookStackClient, BookStackAuthError } from './api/client';
import { BookStackBook } from './api/types';
import { pullSync } from './sync/pull';
import { pushSync } from './sync/push';
import { bidirectionalSync } from './sync/bidirectional';
import { showHttpWarningModal } from './ui/http-warning-modal';

class BookSuggestModal extends SuggestModal<BookStackBook> {
  private books: BookStackBook[];
  private onSelect: (book: BookStackBook) => void;

  constructor(
    app: App,
    books: BookStackBook[],
    onSelect: (book: BookStackBook) => void,
  ) {
    super(app);
    this.books = books;
    this.onSelect = onSelect;
  }

  getSuggestions(query: string): BookStackBook[] {
    const lower = query.toLowerCase();
    return this.books.filter((b) =>
      b.name.toLowerCase().includes(lower),
    );
  }

  renderSuggestion(book: BookStackBook, el: HTMLElement): void {
    el.createEl('div', { text: book.name });
    el.createEl('small', { text: book.description || 'No description' });
  }

  onChooseSuggestion(book: BookStackBook): void {
    this.onSelect(book);
  }
}

export default class BookBridgePlugin extends Plugin {
  settings: BookBridgeSettings = DEFAULT_SETTINGS;
  private statusBarEl: HTMLElement | null = null;
  private autoSyncInterval: number | null = null;
  private isSyncing = false;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new BookBridgeSettingTab(this.app, this));

    this.statusBarEl = this.addStatusBarItem();
    this.setStatus('Ready');

    this.addRibbonIcon('book-open', 'BookBridge Sync', async () => {
      await this.sync();
    });

    this.addCommand({
      id: 'bookbridge-sync',
      name: 'Sync with BookStack',
      callback: async () => {
        await this.sync();
      },
    });

    this.addCommand({
      id: 'bookbridge-pull',
      name: 'Pull from BookStack',
      callback: async () => {
        await this.pull();
      },
    });

    this.addCommand({
      id: 'bookbridge-pull-book',
      name: 'Pull Book...',
      callback: async () => {
        await this.pullSingleBook();
      },
    });

    this.addCommand({
      id: 'bookbridge-push',
      name: 'Push to BookStack',
      callback: async () => {
        await this.push();
      },
    });

    this.addCommand({
      id: 'bookbridge-push-book',
      name: 'Push Book...',
      callback: async () => {
        await this.pushSingleBook();
      },
    });

    this.addCommand({
      id: 'bookbridge-sync-book',
      name: 'Sync Book...',
      callback: async () => {
        await this.syncSingleBook();
      },
    });

    this.configureAutoSync();
  }

  onunload(): void {
    this.clearAutoSync();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  setStatus(text: string): void {
    if (this.statusBarEl) {
      this.statusBarEl.setText(`BookBridge: ${text}`);
    }
  }

  async createClient(): Promise<BookStackClient | null> {
    const { baseUrl, tokenId, tokenSecret } = this.settings;
    if (!baseUrl || !tokenId || !tokenSecret) {
      new Notice('BookBridge: Please configure connection in settings');
      return null;
    }

    // Security: warn about HTTP connections (except localhost)
    if (baseUrl.startsWith('http://') && !this.isLocalUrl(baseUrl)) {
      const confirmed = await showHttpWarningModal(this.app);
      if (!confirmed) {
        new Notice('BookBridge: Connection cancelled — use HTTPS for secure connections');
        return null;
      }
    }

    return new BookStackClient(baseUrl, tokenId, tokenSecret);
  }

  private isLocalUrl(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.local');
    } catch {
      return false;
    }
  }

  configureAutoSync(): void {
    this.clearAutoSync();

    if (this.settings.autoSync && this.settings.autoSyncInterval > 0) {
      const intervalMs = this.settings.autoSyncInterval * 60 * 1000;
      this.autoSyncInterval = window.setInterval(async () => {
        await this.sync();
      }, intervalMs);
      this.registerInterval(this.autoSyncInterval);
    }
  }

  private clearAutoSync(): void {
    if (this.autoSyncInterval !== null) {
      window.clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  private async showBookSelector(
    onSelect: (book: BookStackBook) => void,
  ): Promise<void> {
    const client = await this.createClient();
    if (!client) return;

    try {
      const books = await client.getAllBooks();
      new BookSuggestModal(this.app, books, onSelect).open();
    } catch (error) {
      this.handleSyncError(error);
    }
  }

  async sync(): Promise<void> {
    if (this.isSyncing) {
      new Notice('BookBridge: Sync already in progress');
      return;
    }

    const client = await this.createClient();
    if (!client) return;

    this.isSyncing = true;
    this.setStatus('Syncing...');

    try {
      await bidirectionalSync(
        this.app,
        client,
        this.settings,
        (s) => this.setStatus(s),
      );
    } catch (error) {
      this.handleSyncError(error);
    } finally {
      this.isSyncing = false;
      this.setStatus('Ready');
    }
  }

  async pull(): Promise<void> {
    if (this.isSyncing) {
      new Notice('BookBridge: Sync already in progress');
      return;
    }

    const client = await this.createClient();
    if (!client) return;

    this.isSyncing = true;
    this.setStatus('Pulling...');

    try {
      await pullSync(
        this.app,
        client,
        this.settings,
        (s) => this.setStatus(s),
      );
    } catch (error) {
      this.handleSyncError(error);
    } finally {
      this.isSyncing = false;
      this.setStatus('Ready');
    }
  }

  private async pullSingleBook(): Promise<void> {
    await this.showBookSelector(async (book) => {
      if (this.isSyncing) {
        new Notice('BookBridge: Sync already in progress');
        return;
      }

      const client = await this.createClient();
      if (!client) return;

      this.isSyncing = true;
      this.setStatus(`Pulling ${book.name}...`);

      try {
        await pullSync(
          this.app,
          client,
          this.settings,
          (s) => this.setStatus(s),
          book.id,
        );
      } catch (error) {
        this.handleSyncError(error);
      } finally {
        this.isSyncing = false;
        this.setStatus('Ready');
      }
    });
  }

  async push(): Promise<void> {
    if (this.isSyncing) {
      new Notice('BookBridge: Sync already in progress');
      return;
    }

    const client = await this.createClient();
    if (!client) return;

    this.isSyncing = true;
    this.setStatus('Pushing...');

    try {
      await pushSync(
        this.app,
        client,
        this.settings,
        (s) => this.setStatus(s),
      );
    } catch (error) {
      this.handleSyncError(error);
    } finally {
      this.isSyncing = false;
      this.setStatus('Ready');
    }
  }

  private async pushSingleBook(): Promise<void> {
    await this.showBookSelector(async (book) => {
      if (this.isSyncing) {
        new Notice('BookBridge: Sync already in progress');
        return;
      }

      const client = await this.createClient();
      if (!client) return;

      this.isSyncing = true;
      this.setStatus(`Pushing ${book.name}...`);

      try {
        await pushSync(
          this.app,
          client,
          this.settings,
          (s) => this.setStatus(s),
          book.id,
        );
      } catch (error) {
        this.handleSyncError(error);
      } finally {
        this.isSyncing = false;
        this.setStatus('Ready');
      }
    });
  }

  private async syncSingleBook(): Promise<void> {
    await this.showBookSelector(async (book) => {
      if (this.isSyncing) {
        new Notice('BookBridge: Sync already in progress');
        return;
      }

      const client = await this.createClient();
      if (!client) return;

      this.isSyncing = true;
      this.setStatus(`Syncing ${book.name}...`);

      try {
        await bidirectionalSync(
          this.app,
          client,
          this.settings,
          (s) => this.setStatus(s),
          book.id,
        );
      } catch (error) {
        this.handleSyncError(error);
      } finally {
        this.isSyncing = false;
        this.setStatus('Ready');
      }
    });
  }

  private handleSyncError(error: unknown): void {
    if (error instanceof BookStackAuthError) {
      new Notice('BookBridge: Authentication failed. Check your API token in settings.');
      this.clearAutoSync();
    } else {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`BookBridge: Sync failed — ${message}`);
    }
  }
}
