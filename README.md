# BookBridge

Obsidian Community Plugin für bidirektionalen Sync zwischen einem Obsidian-Vault und einer [BookStack](https://www.bookstackapp.com/)-Instanz.

## Features

- **Pull Sync** — BookStack-Seiten als Markdown in den Vault herunterladen
- **Push Sync** — Lokale Änderungen zurück nach BookStack synchronisieren
- **Bidirektionaler Sync** — Automatische Erkennung von Änderungen auf beiden Seiten
- **Conflict Resolution** — Bei Konflikten: Diff-Anzeige und manuelle Entscheidung (Local/Remote/Skip)
- **Delete Sync** — Gelöschte Seiten erkennen und nach Bestätigung synchronisieren
- **Asset Download** — Bilder und Anhänge lokal speichern, URLs automatisch umschreiben
- **HTML→Markdown Konvertierung** — BookStack Callouts, Code-Blöcke, Tabellen, interne Links
- **Book Selection** — Einzelne oder alle Bücher zum Sync auswählen
- **Auto-Sync** — Optionaler automatischer Sync in konfigurierbarem Intervall

## Installation

### Manuell

1. Erstelle den Ordner `{vault}/.obsidian/plugins/bookbridge/`
2. Kopiere `main.js`, `manifest.json` und `styles.css` in diesen Ordner
3. Aktiviere das Plugin in den Obsidian-Einstellungen unter *Community Plugins*

### Aus Source bauen

```bash
git clone https://github.com/your-repo/obsidian-bookbridge.git
cd obsidian-bookbridge
npm install
npm run build
```

Kopiere anschließend `main.js`, `manifest.json` und `styles.css` in deinen Plugin-Ordner.

## Konfiguration

1. Öffne die Plugin-Einstellungen unter *Einstellungen → BookBridge*
2. Trage die **BookStack URL** ein (z.B. `https://books.example.com`)
3. Erstelle in BookStack unter *Einstellungen → API Tokens* ein neues Token
4. Trage **Token ID** und **Token Secret** ein
5. Klicke **Test** um die Verbindung zu prüfen
6. Optional: Klicke **Load Books** um die Buchauswahl zu konfigurieren

### Einstellungen

| Einstellung | Standard | Beschreibung |
|-------------|----------|--------------|
| BookStack URL | — | Base URL deiner BookStack-Instanz |
| API Token ID / Secret | — | BookStack API Token |
| Sync Folder | `BookStack` | Vault-Ordner für synchronisierte Inhalte |
| Sync Mode | Bidirectional | Pull only, Push only, oder Bidirektional |
| Conflict Strategy | Ask | Ask (Diff anzeigen), Local wins, Remote wins |
| Download Assets | An | Bilder und Anhänge lokal speichern |
| Asset Folder | `_assets` | Unterordner für heruntergeladene Assets |
| Auto Sync | Aus | Automatischer Sync |
| Auto Sync Interval | 30 min | Intervall zwischen automatischen Syncs |
| Book Selection | Alle | Auswahl der zu synchronisierenden Bücher |

## Verwendung

### Commands

| Command | Beschreibung |
|---------|-------------|
| **Sync with BookStack** | Bidirektionaler Sync aller ausgewählten Bücher |
| **Pull from BookStack** | Nur herunterladen (BookStack → Obsidian) |
| **Push to BookStack** | Nur hochladen (Obsidian → BookStack) |
| **Sync Book...** | Einzelnes Buch bidirektional syncen (Fuzzy-Suche) |
| **Pull Book...** | Einzelnes Buch herunterladen (Fuzzy-Suche) |
| **Push Book...** | Einzelnes Buch hochladen (Fuzzy-Suche) |

Zusätzlich kann der Sync über das **Ribbon Icon** (Buch-Symbol in der Sidebar) ausgelöst werden.

### Vault-Struktur

```
BookStack/
├── _assets/
│   ├── gallery/          # Bilder
│   └── attachments/      # PDFs und andere Anhänge
├── Buch A/
│   ├── Seite 1.md
│   └── Kapitel X/
│       └── Seite 2.md
└── Buch B/
    └── Seite 3.md
```

### Frontmatter

Jede synchronisierte Datei erhält automatisch Frontmatter-Metadaten:

```yaml
---
bookstack_id: 42
bookstack_type: page
bookstack_updated_at: "2026-04-03T10:00:00Z"
bookstack_book_id: 5
bookstack_chapter_id: 12
---
```

### Konflikte

Wenn eine Seite sowohl lokal als auch in BookStack geändert wurde:

- **Ask** (Standard): Ein Modal zeigt beide Versionen nebeneinander. Du entscheidest: *Keep Local*, *Keep Remote* oder *Skip*.
- **Local wins**: Lokale Version wird automatisch nach BookStack gepusht.
- **Remote wins**: BookStack-Version überschreibt die lokale Datei.

Bei mehreren Konflikten gleichzeitig erscheint ein Batch-Modal mit Optionen für jede Datei.

### Löschungen

Gelöschte Seiten werden erkannt und dem User zur Bestätigung angezeigt — es wird nie automatisch gelöscht. Optionen pro Datei:

- **Delete** — Auf der anderen Seite ebenfalls löschen
- **Keep (unlink)** — Behalten, aber aus dem Sync entfernen
- **Skip** — Nichts tun

## Konvertierung

### BookStack → Obsidian (HTML → Markdown)

- BookStack Callouts (`info`, `warning`, `danger`, `success`) → Obsidian Callouts (`> [!info]`)
- Code-Blöcke mit Syntax Highlighting bleiben erhalten
- Interne BookStack-Links → Obsidian `[[Wikilinks]]` (wenn Zielseite im Sync)
- BookStack Drawings → Platzhalter mit Link zum Original
- Tabellen mit Colspan/Rowspan → Markdown-Tabelle mit Warnung
- GFM: Tabellen, Strikethrough, Task Lists

### Obsidian → BookStack (Markdown → HTML)

- Obsidian Callouts → BookStack Callout-Klassen
- Wikilinks → BookStack interne Links
- Lokale Bilder → BookStack Image Gallery URLs

## Entwicklung

```bash
npm run dev        # esbuild watch mode
npm run build      # Production build
npm run test       # Vitest
npm run lint       # ESLint
```

## Lizenz

MIT
