import { App, Modal, Setting } from 'obsidian';

export type ConflictResolution = 'local' | 'remote' | 'skip';

export interface ConflictInfo {
  pageName: string;
  vaultPath: string;
  bookstackId: number;
  localContent: string;
  remoteContent: string;
}

export function showConflictModal(
  app: App,
  conflict: ConflictInfo,
): Promise<ConflictResolution> {
  return new Promise((resolve) => {
    const modal = new ConflictModal(app, conflict, resolve);
    modal.open();
  });
}

export function showBatchConflictModal(
  app: App,
  conflicts: ConflictInfo[],
): Promise<Map<number, ConflictResolution>> {
  return new Promise((resolve) => {
    const modal = new BatchConflictModal(app, conflicts, resolve);
    modal.open();
  });
}

class ConflictModal extends Modal {
  private conflict: ConflictInfo;
  private resolve: (resolution: ConflictResolution) => void;

  constructor(
    app: App,
    conflict: ConflictInfo,
    resolve: (resolution: ConflictResolution) => void,
  ) {
    super(app);
    this.conflict = conflict;
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('bookbridge-conflict-modal');

    contentEl.createEl('h2', { text: 'Sync Conflict' });
    contentEl.createEl('p', {
      text: `"${this.conflict.pageName}" was changed both locally and in BookStack.`,
    });

    // Diff display
    const diffContainer = contentEl.createDiv('bookbridge-conflict-diff');

    const localPanel = diffContainer.createDiv('bookbridge-conflict-panel');
    localPanel.createEl('h4', { text: 'Local (Obsidian)' });
    const localPre = localPanel.createEl('pre');
    localPre.createEl('code', {
      text: truncateForDisplay(this.conflict.localContent),
    });

    const remotePanel = diffContainer.createDiv('bookbridge-conflict-panel');
    remotePanel.createEl('h4', { text: 'Remote (BookStack)' });
    const remotePre = remotePanel.createEl('pre');
    remotePre.createEl('code', {
      text: truncateForDisplay(this.conflict.remoteContent),
    });

    // Action buttons
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Keep Local')
          .setCta()
          .onClick(() => {
            this.close();
            this.resolve('local');
          }),
      )
      .addButton((btn) =>
        btn.setButtonText('Keep Remote').onClick(() => {
          this.close();
          this.resolve('remote');
        }),
      )
      .addButton((btn) =>
        btn.setButtonText('Skip').onClick(() => {
          this.close();
          this.resolve('skip');
        }),
      );
  }

  onClose(): void {
    this.resolve('skip');
  }
}

class BatchConflictModal extends Modal {
  private conflicts: ConflictInfo[];
  private resolve: (resolutions: Map<number, ConflictResolution>) => void;
  private resolutions: Map<number, ConflictResolution>;

  constructor(
    app: App,
    conflicts: ConflictInfo[],
    resolve: (resolutions: Map<number, ConflictResolution>) => void,
  ) {
    super(app);
    this.conflicts = conflicts;
    this.resolve = resolve;
    this.resolutions = new Map();
    // Default all to skip
    for (const c of conflicts) {
      this.resolutions.set(c.bookstackId, 'skip');
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('bookbridge-batch-conflict-modal');

    contentEl.createEl('h2', { text: `${this.conflicts.length} Sync Conflicts` });

    // Bulk actions
    const bulkRow = contentEl.createDiv('bookbridge-batch-actions');
    const keepAllLocal = bulkRow.createEl('button', { text: 'Keep All Local' });
    keepAllLocal.addEventListener('click', () => {
      for (const c of this.conflicts) {
        this.resolutions.set(c.bookstackId, 'local');
      }
      this.close();
      this.resolve(this.resolutions);
    });

    const keepAllRemote = bulkRow.createEl('button', {
      text: 'Keep All Remote',
    });
    keepAllRemote.addEventListener('click', () => {
      for (const c of this.conflicts) {
        this.resolutions.set(c.bookstackId, 'remote');
      }
      this.close();
      this.resolve(this.resolutions);
    });

    // Per-conflict choices
    const list = contentEl.createDiv('bookbridge-batch-list');
    for (const conflict of this.conflicts) {
      const row = list.createDiv('bookbridge-batch-row');
      row.createEl('span', { text: conflict.pageName, cls: 'bookbridge-batch-name' });

      const select = row.createEl('select');
      select.createEl('option', { text: 'Keep Local', value: 'local' });
      select.createEl('option', { text: 'Keep Remote', value: 'remote' });
      const optSkip = select.createEl('option', { text: 'Skip', value: 'skip' });
      optSkip.selected = true;

      select.addEventListener('change', () => {
        this.resolutions.set(
          conflict.bookstackId,
          select.value as ConflictResolution,
        );
      });
    }

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText('Apply')
        .setCta()
        .onClick(() => {
          this.close();
          this.resolve(this.resolutions);
        }),
    );
  }

  onClose(): void {
    this.resolve(this.resolutions);
  }
}

function truncateForDisplay(content: string, maxLines = 30): string {
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content;
  return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
}
