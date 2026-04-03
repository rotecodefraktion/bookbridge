import { App, Modal, Setting } from 'obsidian';

export type DeleteAction = 'delete' | 'unlink' | 'skip';

export interface DeleteCandidate {
  bookstackId: number;
  pageName: string;
  vaultPath: string | null;
  direction: 'local_deleted' | 'remote_deleted';
}

export interface DeleteResolution {
  bookstackId: number;
  action: DeleteAction;
}

export function showDeleteConfirmModal(
  app: App,
  candidates: DeleteCandidate[],
): Promise<DeleteResolution[]> {
  return new Promise((resolve) => {
    const modal = new DeleteConfirmModal(app, candidates, resolve);
    modal.open();
  });
}

class DeleteConfirmModal extends Modal {
  private candidates: DeleteCandidate[];
  private resolve: (resolutions: DeleteResolution[]) => void;
  private actions: Map<number, DeleteAction>;

  constructor(
    app: App,
    candidates: DeleteCandidate[],
    resolve: (resolutions: DeleteResolution[]) => void,
  ) {
    super(app);
    this.candidates = candidates;
    this.resolve = resolve;
    this.actions = new Map();
    for (const c of candidates) {
      this.actions.set(c.bookstackId, 'skip');
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('bookbridge-delete-modal');

    contentEl.createEl('h2', { text: 'Delete Synchronization' });

    const localDeleted = this.candidates.filter(
      (c) => c.direction === 'local_deleted',
    );
    const remoteDeleted = this.candidates.filter(
      (c) => c.direction === 'remote_deleted',
    );

    if (localDeleted.length > 0) {
      contentEl.createEl('h3', { text: 'Locally Deleted' });
      contentEl.createEl('p', {
        text: 'These files were deleted from Obsidian. Delete from BookStack too?',
        cls: 'bookbridge-delete-desc',
      });
      this.renderCandidateList(contentEl, localDeleted);
    }

    if (remoteDeleted.length > 0) {
      contentEl.createEl('h3', { text: 'Remotely Deleted' });
      contentEl.createEl('p', {
        text: 'These pages were deleted from BookStack. Remove local files?',
        cls: 'bookbridge-delete-desc',
      });
      this.renderCandidateList(contentEl, remoteDeleted);
    }

    contentEl.createEl('p', {
      text: '⚠ This action cannot be undone.',
      cls: 'bookbridge-delete-warning',
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Apply')
          .setCta()
          .onClick(() => {
            this.close();
            this.resolve(this.buildResolutions());
          }),
      )
      .addButton((btn) =>
        btn.setButtonText('Cancel').onClick(() => {
          this.close();
          this.resolve(
            this.candidates.map((c) => ({
              bookstackId: c.bookstackId,
              action: 'skip' as DeleteAction,
            })),
          );
        }),
      );
  }

  private renderCandidateList(
    container: HTMLElement,
    candidates: DeleteCandidate[],
  ): void {
    const list = container.createDiv('bookbridge-delete-list');

    for (const candidate of candidates) {
      const row = list.createDiv('bookbridge-delete-row');
      row.createEl('span', {
        text: candidate.pageName,
        cls: 'bookbridge-delete-name',
      });

      const select = row.createEl('select');
      select.createEl('option', { text: 'Skip', value: 'skip' });
      select.createEl('option', { text: 'Delete', value: 'delete' });
      select.createEl('option', {
        text: 'Keep (unlink)',
        value: 'unlink',
      });

      select.addEventListener('change', () => {
        this.actions.set(candidate.bookstackId, select.value as DeleteAction);
      });
    }
  }

  private buildResolutions(): DeleteResolution[] {
    return this.candidates.map((c) => ({
      bookstackId: c.bookstackId,
      action: this.actions.get(c.bookstackId) ?? 'skip',
    }));
  }

  onClose(): void {
    this.resolve(
      this.candidates.map((c) => ({
        bookstackId: c.bookstackId,
        action: 'skip' as DeleteAction,
      })),
    );
  }
}
