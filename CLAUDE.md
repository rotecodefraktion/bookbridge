# BookBridge — Obsidian ↔ BookStack Sync

> Obsidian Community Plugin zum bidirektionalen Sync zwischen einem Obsidian-Vault und einer BookStack-Instanz. Fokus auf saubere HTML→Markdown-Konvertierung und lokalen Download von Bildern/Anhängen.

## Tech Stack

- **Runtime:** Obsidian Plugin API (TypeScript)
- **Build:** esbuild (Obsidian-Standard)
- **Test:** Vitest (Unit), manuell (E2E im Vault)
- **API:** BookStack REST API v1 (Token Auth)
- **Konvertierung:** Turndown + Custom Rules (HTML→MD), Showdown/marked (MD→HTML)

## Project Structure

```
src/
  main.ts               Plugin-Entry (onload/onunload)
  settings.ts           SettingTab + Konfiguration
  sync/
    engine.ts           Sync-Logik (Conflict Resolution, Diff)
    pull.ts             BookStack → Obsidian
    push.ts             Obsidian → BookStack
    delete.ts           Lösch-Synchronisation
  api/
    client.ts           BookStack REST Client (requestUrl + Token Auth)
    types.ts            API Response Types
  convert/
    html-to-md.ts       Turndown + Custom Rules (Tabellen, Callouts, Code)
    md-to-html.ts       Markdown → BookStack HTML
    assets.ts           Bild/Attachment Download + URL-Rewriting
  models/
    mapping.ts          BookStack ID ↔ Obsidian Path Mapping
    frontmatter.ts      YAML Frontmatter lesen/schreiben
  ui/
    sync-status.ts      StatusBar Item
    conflict-modal.ts   Conflict Resolution Dialog
    sync-ribbon.ts      Ribbon Icon
    delete-confirm.ts   Lösch-Bestätigung Modal
  utils/
    sanitize.ts         Dateinamen-Bereinigung
    paths.ts            Pfad-Utilities (normalizePath)
styles.css              Plugin Styles
manifest.json           Obsidian Plugin Manifest
versions.json           Obsidian Versions Mapping
```

## Development Workflow

```
/requirements  → Feature-Spec aus Idee erstellen
/build FE-X    → Implementieren (Plugin-Dev → QA)
/qa            → Testen gegen Akzeptanzkriterien
/release       → GitHub Release + manifest.json Update
```

## Feature & Bug Tracking

Alle Features in `features/INDEX.md` (FE-1, FE-2, ...), Bugs in `bugs/INDEX.md` (BUG-1, BUG-2, ...).
Feature-Specs in `features/FE-X-name.md`, Bug-Reports in `bugs/BUG-X-name.md`.

## Key Conventions

- **Feature IDs:** FE-1, FE-2, etc.
- **Bug IDs:** BUG-1, BUG-2, etc.
- **Commits:** `feat(FE-X): description`, `fix(BUG-X): description`
- **Ein Feature pro Spec-Datei**
- **Obsidian API first:** `this.app.vault`, `requestUrl()`, `processFrontMatter()`
- **Keine Node.js-only Module:** Plugin muss in Desktop UND Mobile laufen
- **Human-in-the-loop:** Alle Workflows haben User-Approval-Checkpoints
- **BookStack API Docs:** https://demo.bookstackapp.com/api/docs

## Häufige Befehle

```bash
npm run dev        # esbuild watch mode → Plugin in Test-Vault
npm run build      # Production build
npm run test       # Vitest
npm run lint       # ESLint
npm run version    # Version bump + manifest.json Update
```

## Architektur-Kernregeln

- **Mapping ist die Wahrheit:** BookStack-ID ↔ Obsidian-Path in `.bookbridge.json`
- **Conflict Resolution:** Bei Änderungen auf beiden Seiten → User entscheidet (Modal)
- **Frontmatter:** `bookstack_id`, `bookstack_updated_at`, `bookstack_type` (page/chapter)
- **Inkrementeller Sync:** Nur geänderte Seiten via `updated_at`-Vergleich
- **Kein Datenverlust:** Vor destruktiven Operationen immer Backup/Bestätigung
- **Rate Limiting:** Max 10 req/s gegen BookStack API
- **Assets lokal:** Bilder/Anhänge in `{syncFolder}/_assets/{bookstack_id}/`
- **URL-Rewriting:** BookStack-URLs in Markdown auf lokale Vault-Pfade umschreiben
- **Roundtrip-stabil:** HTML→MD→HTML muss inhaltlich identisch bleiben

## Konvertierungs-Regeln

- **Turndown Custom Rules** für: komplexe Tabellen, BookStack Callouts, Code mit Syntax Highlighting, verschachtelte Listen, Drawings (als Bild-Fallback)
- **Bild-Download:** `requestUrl()` für jeden `<img src>`, speichern unter `_assets/`
- **Attachment-Download:** PDFs und andere Anhänge ebenfalls lokal, Link umschreiben
- **Fallback:** Wenn Konvertierung fehlschlägt → HTML als Code-Block einbetten + Warnung

## ⛔ Verboten

- Direkte `fs`-Zugriffe (bricht Mobile)
- `localStorage` / `sessionStorage` (nicht verfügbar in Obsidian)
- Synchrone API-Calls (blockiert UI)
- Passwörter/Tokens im Code oder in Markdown-Dateien speichern
- BookStack-Inhalte ohne User-Bestätigung überschreiben oder löschen
- `fetch()` statt `requestUrl()` (bricht CORS + Mobile)
