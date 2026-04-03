import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type BookBridgePlugin from './main';
import { BookStackClient } from './api/client';
import { BookStackBook } from './api/types';

export type SyncMode = 'pull' | 'push' | 'bidirectional';
export type ConflictStrategy = 'ask' | 'local' | 'remote';

export interface BookBridgeSettings {
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  syncFolder: string;
  downloadAssets: boolean;
  assetFolder: string;
  syncMode: SyncMode;
  conflictStrategy: ConflictStrategy;
  autoSync: boolean;
  autoSyncInterval: number;
  selectedBookIds: number[];
}

export const DEFAULT_SETTINGS: BookBridgeSettings = {
  baseUrl: '',
  tokenId: '',
  tokenSecret: '',
  syncFolder: 'BookStack',
  downloadAssets: true,
  assetFolder: '_assets',
  syncMode: 'bidirectional',
  conflictStrategy: 'ask',
  autoSync: false,
  autoSyncInterval: 30,
  selectedBookIds: [],
};

export class BookBridgeSettingTab extends PluginSettingTab {
  plugin: BookBridgePlugin;
  private bookListContainer: HTMLElement | null = null;

  constructor(app: App, plugin: BookBridgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'BookBridge Settings' });

    // --- Connection ---
    containerEl.createEl('h3', { text: 'Connection' });

    new Setting(containerEl)
      .setName('BookStack URL')
      .setDesc('Base URL of your BookStack instance (e.g. https://books.example.com)')
      .addText((text) =>
        text
          .setPlaceholder('https://books.example.com')
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value.trim().replace(/\/+$/, '');
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('API Token ID')
      .setDesc('Your BookStack API Token ID')
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('Token ID')
          .setValue(this.plugin.settings.tokenId)
          .onChange(async (value) => {
            this.plugin.settings.tokenId = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('API Token Secret')
      .setDesc('Your BookStack API Token Secret')
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('Token Secret')
          .setValue(this.plugin.settings.tokenSecret)
          .onChange(async (value) => {
            this.plugin.settings.tokenSecret = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Test Connection')
      .setDesc('Verify your BookStack connection')
      .addButton((button) =>
        button.setButtonText('Test').onClick(async () => {
          await this.testConnection();
        }),
      );

    // --- Sync Settings ---
    containerEl.createEl('h3', { text: 'Sync' });

    new Setting(containerEl)
      .setName('Sync Folder')
      .setDesc('Vault folder for synced BookStack content')
      .addText((text) =>
        text
          .setPlaceholder('BookStack')
          .setValue(this.plugin.settings.syncFolder)
          .onChange(async (value) => {
            this.plugin.settings.syncFolder = value.trim() || 'BookStack';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Sync Mode')
      .setDesc('Direction of synchronization')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('bidirectional', 'Bidirectional')
          .addOption('pull', 'Pull only (BookStack → Obsidian)')
          .addOption('push', 'Push only (Obsidian → BookStack)')
          .setValue(this.plugin.settings.syncMode)
          .onChange(async (value) => {
            this.plugin.settings.syncMode = value as SyncMode;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Conflict Strategy')
      .setDesc('How to handle conflicts when both sides changed')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('ask', 'Ask me (show diff)')
          .addOption('local', 'Local wins (Obsidian)')
          .addOption('remote', 'Remote wins (BookStack)')
          .setValue(this.plugin.settings.conflictStrategy)
          .onChange(async (value) => {
            this.plugin.settings.conflictStrategy = value as ConflictStrategy;
            await this.plugin.saveSettings();
          }),
      );

    // --- Assets ---
    containerEl.createEl('h3', { text: 'Assets' });

    new Setting(containerEl)
      .setName('Download Assets')
      .setDesc('Download images and attachments locally')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.downloadAssets)
          .onChange(async (value) => {
            this.plugin.settings.downloadAssets = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Asset Folder')
      .setDesc('Subfolder name for downloaded assets')
      .addText((text) =>
        text
          .setPlaceholder('_assets')
          .setValue(this.plugin.settings.assetFolder)
          .onChange(async (value) => {
            this.plugin.settings.assetFolder = value.trim() || '_assets';
            await this.plugin.saveSettings();
          }),
      );

    // --- Auto Sync ---
    containerEl.createEl('h3', { text: 'Auto Sync' });

    new Setting(containerEl)
      .setName('Enable Auto Sync')
      .setDesc('Automatically sync at a regular interval')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoSync)
          .onChange(async (value) => {
            this.plugin.settings.autoSync = value;
            await this.plugin.saveSettings();
            this.plugin.configureAutoSync();
          }),
      );

    new Setting(containerEl)
      .setName('Auto Sync Interval')
      .setDesc('Interval in minutes between automatic syncs')
      .addText((text) =>
        text
          .setPlaceholder('30')
          .setValue(String(this.plugin.settings.autoSyncInterval))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.autoSyncInterval = num;
              await this.plugin.saveSettings();
              this.plugin.configureAutoSync();
            }
          }),
      );

    // --- Book Selection ---
    containerEl.createEl('h3', { text: 'Book Selection' });

    new Setting(containerEl)
      .setName('Select Books to Sync')
      .setDesc(
        'Choose which books to sync. Leave empty to sync all books. Click "Load Books" after testing connection.',
      )
      .addButton((button) =>
        button.setButtonText('Load Books').onClick(async () => {
          await this.loadBookSelection();
        }),
      );

    this.bookListContainer = containerEl.createDiv('bookbridge-book-list');
    this.renderBookSelection([]);
  }

  private async testConnection(): Promise<void> {
    const { baseUrl, tokenId, tokenSecret } = this.plugin.settings;

    if (!baseUrl) {
      new Notice('BookBridge: Please enter a BookStack URL');
      return;
    }

    if (!baseUrl.startsWith('https://')) {
      if (baseUrl.startsWith('http://')) {
        new Notice('BookBridge: Warning — using HTTP is insecure. HTTPS recommended.');
      } else {
        new Notice('BookBridge: URL must start with https://');
        return;
      }
    }

    if (!tokenId || !tokenSecret) {
      new Notice('BookBridge: Please enter API Token ID and Secret');
      return;
    }

    try {
      const client = new BookStackClient(baseUrl, tokenId, tokenSecret);
      await client.testConnection();
      new Notice('BookBridge: Connection successful!');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`BookBridge: Connection failed — ${message}`);
    }
  }

  private async loadBookSelection(): Promise<void> {
    const { baseUrl, tokenId, tokenSecret } = this.plugin.settings;

    if (!baseUrl || !tokenId || !tokenSecret) {
      new Notice('BookBridge: Configure connection first');
      return;
    }

    try {
      const client = new BookStackClient(baseUrl, tokenId, tokenSecret);
      const books = await client.getAllBooks();
      this.renderBookSelection(books);
      new Notice(`BookBridge: Loaded ${books.length} books`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`BookBridge: Failed to load books — ${message}`);
    }
  }

  private renderBookSelection(books: BookStackBook[]): void {
    if (!this.bookListContainer) return;
    this.bookListContainer.empty();

    if (books.length === 0) {
      this.bookListContainer.createEl('p', {
        text: 'No books loaded. Click "Load Books" to fetch the list.',
        cls: 'bookbridge-book-list-empty',
      });
      return;
    }

    const selected = new Set(this.plugin.settings.selectedBookIds);
    const allSelected = selected.size === 0;

    // Select All / Deselect All buttons
    const buttonRow = this.bookListContainer.createDiv('bookbridge-book-list-actions');

    const selectAllBtn = buttonRow.createEl('button', { text: 'Select All' });
    selectAllBtn.addEventListener('click', async () => {
      this.plugin.settings.selectedBookIds = [];
      await this.plugin.saveSettings();
      this.renderBookSelection(books);
    });

    const deselectAllBtn = buttonRow.createEl('button', { text: 'Deselect All' });
    deselectAllBtn.addEventListener('click', async () => {
      this.plugin.settings.selectedBookIds = [-1]; // sentinel: explicit empty selection
      await this.plugin.saveSettings();
      this.renderBookSelection(books);
    });

    // Info text
    if (allSelected) {
      this.bookListContainer.createEl('p', {
        text: 'All books will be synced (none specifically selected).',
        cls: 'bookbridge-book-list-info',
      });
    }

    // Book checkboxes
    const list = this.bookListContainer.createDiv('bookbridge-book-checkboxes');

    for (const book of books) {
      const isChecked = allSelected || selected.has(book.id);

      const row = list.createDiv('bookbridge-book-row');
      const checkbox = row.createEl('input', { type: 'checkbox' });
      checkbox.checked = isChecked;
      checkbox.dataset.bookId = String(book.id);

      row.createEl('label', { text: book.name });

      checkbox.addEventListener('change', async () => {
        await this.toggleBook(book.id, checkbox.checked, books);
      });
    }
  }

  private async toggleBook(
    bookId: number,
    checked: boolean,
    allBooks: BookStackBook[],
  ): Promise<void> {
    let selected = new Set(this.plugin.settings.selectedBookIds);

    // If currently "all" (empty array) and user unchecks one,
    // switch to explicit list with all except the unchecked one
    if (selected.size === 0 && !checked) {
      selected = new Set(allBooks.map((b) => b.id));
      selected.delete(bookId);
    } else if (checked) {
      selected.add(bookId);
      selected.delete(-1); // remove sentinel if present
      // If all books are now selected, revert to empty (= all)
      if (selected.size === allBooks.length) {
        selected.clear();
      }
    } else {
      selected.delete(bookId);
      if (selected.size === 0) {
        selected.add(-1); // sentinel for "none selected"
      }
    }

    this.plugin.settings.selectedBookIds = Array.from(selected);
    await this.plugin.saveSettings();
  }
}
