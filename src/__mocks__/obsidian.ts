// Minimal mock of the Obsidian API for unit testing
export class TFile {
  path = '';
  name = '';
  basename = '';
  extension = '';
}

export class TFolder {
  path = '';
  name = '';
  children: (TFile | TFolder)[] = [];
}

export class Vault {
  getAbstractFileByPath(_path: string): TFile | TFolder | null {
    return null;
  }
  async create(_path: string, _content: string): Promise<TFile> {
    return new TFile();
  }
  async modify(_file: TFile, _content: string): Promise<void> {}
  async createBinary(_path: string, _data: ArrayBuffer): Promise<TFile> {
    return new TFile();
  }
  async createFolder(_path: string): Promise<void> {}
  async read(_file: TFile): Promise<string> {
    return '';
  }
  getFiles(): TFile[] {
    return [];
  }
}

export class App {
  vault = new Vault();
  metadataCache = {
    getFileCache: () => null,
  };
  fileManager = {
    processFrontMatter: async () => {},
  };
}

export class Notice {
  constructor(_message: string) {}
}

export class Plugin {
  app = new App();
  async loadData(): Promise<unknown> {
    return {};
  }
  async saveData(_data: unknown): Promise<void> {}
  addSettingTab(_tab: unknown): void {}
  addRibbonIcon(_icon: string, _title: string, _callback: () => void): void {}
  addCommand(_command: unknown): void {}
  addStatusBarItem(): { setText: (text: string) => void } {
    return { setText: () => {} };
  }
  registerInterval(_id: number): void {}
}

export class Modal {
  app: App;
  contentEl = {
    empty: () => {},
    createEl: () => ({ appendText: () => {}, createEl: () => ({}) }),
  };
  constructor(app: App) {
    this.app = app;
  }
  open(): void {}
  close(): void {}
}

export class Setting {
  constructor(_el: unknown) {}
  addButton(cb: (btn: unknown) => void): Setting {
    cb({ setButtonText: () => ({ setCta: () => ({ onClick: () => {} }), onClick: () => {} }) });
    return this;
  }
}

export class SuggestModal<T> {
  app: App;
  constructor(app: App) {
    this.app = app;
  }
  open(): void {}
  close(): void {}
  getSuggestions(_query: string): T[] { return []; }
  renderSuggestion(_item: T, _el: HTMLElement): void {}
  onChooseSuggestion(_item: T): void {}
}

export class PluginSettingTab {
  app: App;
  constructor(app: App, _plugin: unknown) {
    this.app = app;
  }
  display(): void {}
}

export function normalizePath(path: string): string {
  return path;
}

export function requestUrl(_params: unknown): Promise<{ json: unknown; text: string; arrayBuffer: ArrayBuffer }> {
  return Promise.resolve({
    json: {},
    text: '',
    arrayBuffer: new ArrayBuffer(0),
  });
}
