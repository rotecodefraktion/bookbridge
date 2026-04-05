# Security Rules

## Token-Handling

- Tokens werden über `this.saveData()` gespeichert (Obsidian encrypted storage)
- Settings UI: Token-Felder als `type: 'password'` in der SettingTab
- Tokens nie in:
  - console.log oder console.error
  - Markdown-Dateien oder Frontmatter
  - Fehlermeldungen (Notice)
  - Sync-Log Dateien
  - Git Commits

## API Security

- **Nur `requestUrl()`** — nie `fetch()`, nie `XMLHttpRequest`
- **Base URL validieren:** Muss mit `https://` beginnen (Warnung bei `http://`)
- **Rate Limiting:** Max 10 Requests/Sekunde gegen BookStack API
- **Timeout:** 30 Sekunden pro Request, konfigurierbar
- **Retry:** Max 3 Retries bei 429 (Too Many Requests), exponential backoff
- **Bei 401:** Auto-Sync sofort stoppen, User via Notice benachrichtigen

## Conflict Handling

- **Default:** `ask` — User entscheidet bei jedem Konflikt (Modal mit Diff)
- **Optionen:** `local` (Obsidian gewinnt), `remote` (BookStack gewinnt)
- **Nie automatisch überschreiben** ohne User-Einstellung
- **Lösch-Konflikte:** Immer User-Bestätigung, auch bei `local`/`remote` Strategie

## Asset Security

- Nur Bilder/Anhänge von der konfigurierten BookStack-Instanz herunterladen
- URLs validieren: Muss mit `settings.baseUrl` beginnen
- Keine externen URLs herunterladen die in BookStack-HTML eingebettet sind
- Dateinamen sanitizen: Keine Path Traversal (`../`)

## Code Review Triggers

Diese Änderungen erfordern besondere Aufmerksamkeit:
- API Client (Token-Handling, Request-Logik)
- Settings Interface (neue Felder, Validierung)
- Sync Engine (Conflict Resolution, Lösch-Logik)
- Conversion Rules (neue Turndown Rules, Asset-Handling)
- Neue Dependencies (besonders solche mit Network-Zugriff)
- Mapping-Datei Schema-Änderungen
