# FE-2: Pull Sync (Pages)

## User Story
Als Obsidian-Nutzer möchte ich alle Seiten aus meiner BookStack-Instanz als Markdown-Dateien in meinen Vault synchronisieren, damit ich sie offline lesen und bearbeiten kann.

## Akzeptanzkriterien
- [ ] Command "BookBridge: Pull from BookStack" verfügbar
- [ ] Books werden gemäß `selectedBookIds` gefiltert (leer = alle)
- [ ] Command "BookBridge: Pull Book..." → Fuzzy-Suggest Modal zur Auswahl eines einzelnen Buchs für Ad-hoc Pull
- [ ] Alle (ausgewählten) Books, Chapters und Pages werden abgerufen
- [ ] Ordnerstruktur: `{syncFolder}/{Book Name}/{Chapter Name}/{Page Title}.md`
- [ ] Seiten ohne Chapter direkt unter `{syncFolder}/{Book Name}/{Page Title}.md`
- [ ] Frontmatter wird gesetzt: `bookstack_id`, `bookstack_type`, `bookstack_updated_at`, `bookstack_book_id`, `bookstack_chapter_id`
- [ ] Mapping-Datei `.bookbridge.json` wird erstellt/aktualisiert
- [ ] Inkrementeller Sync: nur Seiten mit neuerem `updated_at` als im Mapping
- [ ] Erster Sync: alle Seiten herunterladen
- [ ] Dateinamen werden sanitized (keine ungültigen Zeichen)
- [ ] Fortschritts-Anzeige: StatusBar zeigt "Syncing X/Y pages..."
- [ ] Nach Sync: Notice mit Zusammenfassung ("Pulled X new, Y updated pages")
- [ ] Bei Fehler einzelner Seiten: weitermachen, Fehler am Ende zusammenfassen

## Technische Notizen

### BookStack API Endpoints
- `GET /api/books` — alle Bücher (mit Pagination)
- `GET /api/books/{id}` — Buch-Details inkl. Contents (Chapters + Pages)
- `GET /api/chapters?filter[book_id]={id}` — Chapters eines Buchs
- `GET /api/pages/{id}` — Page-Details inkl. `html` Body
- `GET /api/pages/{id}/export/html` — Full HTML Export (für Konvertierung)

### Obsidian API
- `vault.create(path, content)` — neue Datei erstellen
- `vault.modify(file, content)` — bestehende Datei aktualisieren
- `vault.createFolder(path)` — Ordner erstellen
- `vault.getAbstractFileByPath(path)` — Datei suchen
- `fileManager.processFrontMatter()` — Frontmatter setzen

### Sync-Algorithmus (Pull)
1. Alle Books abrufen (`GET /api/books?count=500`)
2. Filtern nach `settings.selectedBookIds` (leer = alle behalten)
3. Für jedes (ausgewählte) Book: Contents abrufen (`GET /api/books/{id}`)
4. Daraus Liste aller Pages mit deren Book/Chapter-Zuordnung
5. Mapping laden (`.bookbridge.json`)
6. Für jede Page:
   a. Ist `updated_at` neuer als im Mapping? → Herunterladen
   b. Page HTML abrufen (`GET /api/pages/{id}`)
   c. HTML → Markdown konvertieren (FE-3)
   d. Datei erstellen/aktualisieren im Vault
   e. Frontmatter setzen
   f. Mapping aktualisieren
7. Mapping speichern

### Ad-hoc Single-Book Pull
- Command "BookBridge: Pull Book..." → `SuggestModal` mit Liste aller Bücher
- User wählt ein Buch → Pull nur für dieses Buch (unabhängig von `selectedBookIds`)
- Nützlich für einmaligen Pull ohne dauerhaft die Selection zu ändern

### Mapping-Datei `.bookbridge.json`
```json
{
  "version": 1,
  "lastSync": "2026-04-03T10:00:00Z",
  "entries": [{
    "bookstackId": 42,
    "bookstackType": "page",
    "vaultPath": "BookStack/My Book/Chapter 1/Page Title.md",
    "bookstackUpdatedAt": "2026-04-03T09:30:00Z",
    "localHash": "sha256...",
    "remoteHash": "sha256..."
  }]
}
```

### Edge Cases
- Doppelte Page-Titel im selben Chapter → Suffix anhängen (`Page (2).md`)
- Sonderzeichen in Titeln → sanitize (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)
- Sehr lange Titel → auf 200 Zeichen kürzen
- Leere Pages (kein Content) → Datei mit nur Frontmatter erstellen
- Bücher ohne Chapters → Pages direkt unter Book-Ordner
- Pagination: BookStack limitiert auf 500 Einträge pro Request
- Umbenannte Pages/Books → alte Datei umbenennen (via Mapping)
- Gelöschte Pages → in FE-7 behandelt, hier nur neue/geänderte

## Abhängigkeiten
- **FE-1** — API Client, Settings
- **FE-3** — HTML→Markdown Konvertierung (kann initial als Plaintext-Fallback starten)

## Dateien
- `src/sync/pull.ts` — Pull-Logik
- `src/sync/engine.ts` — Shared Sync-Utilities (Mapping, Hashing)
- `src/models/mapping.ts` — Mapping lesen/schreiben
- `src/models/frontmatter.ts` — Frontmatter Helpers
- `src/utils/sanitize.ts` — Dateinamen-Bereinigung
