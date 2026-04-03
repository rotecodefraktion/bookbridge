import { App, Modal, Setting } from 'obsidian';

export interface PushCandidate {
  vaultPath: string;
  bookstackId: number | null;
  pageName: string;
  isNew: boolean;
}

export function showPushConfirmModal(
  app: App,
  candidates: PushCandidate[],
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new PushConfirmModal(app, candidates, resolve);
    modal.open();
  });
}

class PushConfirmModal extends Modal {
  private candidates: PushCandidate[];
  private resolve: (confirmed: boolean) => void;

  constructor(
    app: App,
    candidates: PushCandidate[],
    resolve: (confirmed: boolean) => void,
  ) {
    super(app);
    this.candidates = candidates;
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Push to BookStack' });

    const newCount = this.candidates.filter((c) => c.isNew).length;
    const updateCount = this.candidates.length - newCount;

    const summary = contentEl.createEl('p');
    if (updateCount > 0) {
      summary.appendText(`${updateCount} page(s) will be updated. `);
    }
    if (newCount > 0) {
      summary.appendText(`${newCount} new page(s) will be created.`);
    }

    const list = contentEl.createEl('ul', { cls: 'bookbridge-push-list' });
    for (const candidate of this.candidates) {
      const li = list.createEl('li');
      const label = candidate.isNew ? '[NEW] ' : '[UPDATE] ';
      li.createEl('span', { text: label, cls: 'bookbridge-push-badge' });
      li.appendText(candidate.pageName);
    }

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Push')
          .setCta()
          .onClick(() => {
            this.close();
            this.resolve(true);
          }),
      )
      .addButton((btn) =>
        btn.setButtonText('Cancel').onClick(() => {
          this.close();
          this.resolve(false);
        }),
      );
  }

  onClose(): void {
    this.resolve(false);
  }
}
