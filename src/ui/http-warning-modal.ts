import { App, Modal, Setting } from 'obsidian';

export function showHttpWarningModal(app: App): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new HttpWarningModal(app, resolve);
    modal.open();
  });
}

class HttpWarningModal extends Modal {
  private resolve: (confirmed: boolean) => void;
  private resolved = false;

  constructor(app: App, resolve: (confirmed: boolean) => void) {
    super(app);
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: '\u26a0\ufe0f Unsichere Verbindung' });
    contentEl.createEl('p', {
      text: 'Die BookStack URL verwendet HTTP statt HTTPS. Dein API-Token wird unverschl\u00fcsselt \u00fcbertragen und kann von Dritten mitgelesen werden.',
    });
    contentEl.createEl('p', {
      text: 'F\u00fcr lokale Entwicklung (localhost) ist das akzeptabel. F\u00fcr Server im Internet sollte HTTPS verwendet werden.',
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Trotzdem verbinden')
          .setWarning()
          .onClick(() => {
            this.resolved = true;
            this.resolve(true);
            this.close();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText('Abbrechen').onClick(() => {
          this.resolved = true;
          this.resolve(false);
          this.close();
        }),
      );
  }

  onClose(): void {
    if (!this.resolved) {
      this.resolve(false);
    }
  }
}
