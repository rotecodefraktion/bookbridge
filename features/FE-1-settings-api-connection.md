# FE-1: Settings & API Connection

## User Story
Als Obsidian-Nutzer möchte ich meine BookStack-Instanz konfigurieren und die Verbindung testen, damit ich sicher bin, dass der Sync funktionieren wird.

## Akzeptanzkriterien
- [ ] Settings Tab mit Feldern: Base URL, Token ID, Token Secret, Sync Folder, Download Assets, Sync Mode, Conflict Strategy, Auto Sync, Auto Sync Interval, Book Selection
- [ ] Book Selection UI: nach erfolgreichem Connection Test → Liste aller Bücher laden, Multi-Select (Checkboxen) zum An-/Abwählen einzelner Bücher
- [ ] Option "Alle Bücher syncen" (Default) oder "Nur ausgewählte Bücher"
- [ ] Ausgewählte Book-IDs werden in Settings persistiert (`selectedBookIds: number[]`, leer = alle)
- [ ] Token-Felder als Passwort-Inputs (maskiert)
- [ ] "Connection Test"-Button in Settings → ruft `/api/books` auf und zeigt Erfolg/Fehler als Notice
- [ ] Base URL Validierung: muss mit `https://` beginnen (Warnung bei `http://`)
- [ ] Settings werden via `this.loadData()` / `this.saveData()` persistiert
- [ ] Plugin registriert Ribbon Icon (`book-open`), StatusBar Item, und Sync Command
- [ ] BookStack API Client als eigene Klasse mit Token Auth Header
- [ ] Rate Limiting: max 10 req/s (Token Bucket oder einfacher Delay)
- [ ] Timeout: 30s pro Request (konfigurierbar)
- [ ] Retry bei 429 (Too Many Requests): max 3 Retries, exponential backoff
- [ ] Bei 401: Notice an User, Auto-Sync stoppen falls aktiv
- [ ] Tokens erscheinen nirgends in Logs, Notices oder Dateien

## Technische Notizen

### BookStack API
- `GET /api/books` — Connection Test (listet alle Bücher)
- Auth Header: `Authorization: Token {tokenId}:{tokenSecret}`
- Basis für alle weiteren API-Calls

### Obsidian API
- `Plugin` Klasse: `onload()`, `onunload()`, `loadData()`, `saveData()`
- `PluginSettingTab` für Settings UI
- `requestUrl()` für HTTP Requests
- `addRibbonIcon()`, `addStatusBarItem()`, `addCommand()`
- `Notice` für User-Feedback

### Settings Interface
```typescript
interface BookBridgeSettings {
  baseUrl: string;           // z.B. "https://books.example.com"
  tokenId: string;
  tokenSecret: string;
  syncFolder: string;        // Default: "BookStack"
  downloadAssets: boolean;   // Default: true
  assetFolder: string;       // Default: "_assets"
  syncMode: 'pull' | 'push' | 'bidirectional';
  conflictStrategy: 'ask' | 'local' | 'remote';
  autoSync: boolean;         // Default: false
  autoSyncInterval: number;  // Default: 30 (Minuten)
  selectedBookIds: number[]; // Default: [] (leer = alle Bücher)
}
```

### Rate Limiter
Einfache Implementierung mit Timestamp-Queue:
- Vor jedem Request prüfen ob 10 Requests in letzter Sekunde
- Falls ja: `await sleep(delay)` bis Slot frei
- In `api/client.ts` als private Methode

### Book Selection UI
- Nach Connection Test: `GET /api/books` → Liste aller Bücher mit Name + ID
- Checkboxen pro Buch, "Select All" / "Deselect All" Buttons
- Persistiert als `selectedBookIds: number[]` in Settings
- Leeres Array = alle Bücher (Opt-out statt Opt-in)
- Neue Bücher (nach letztem Settings-Öffnen) → standardmäßig inkludiert wenn `selectedBookIds` leer
- Wenn `selectedBookIds` nicht leer und neues Buch erscheint → nicht automatisch inkludiert

### Edge Cases
- Leere/ungültige Base URL → Settings-Validierung, Sync blockieren
- Abgelaufene Tokens → 401 abfangen, Notice, Auto-Sync stoppen
- BookStack nicht erreichbar → Timeout, Retry, dann Notice
- User ändert Settings während Sync läuft → Sync mit alten Settings beenden
- Sehr viele Bücher (Pagination) → `?count=500&offset=0` unterstützen
- Buch aus Selection entfernt → bestehende lokale Dateien bleiben, werden aber nicht mehr gesynct
- Buch zur Selection hinzugefügt → beim nächsten Sync komplett pullen

## Abhängigkeiten
- Keine — dies ist das Fundament für alle anderen Features

## Dateien
- `src/main.ts` — Plugin Entry
- `src/settings.ts` — SettingTab + Interface
- `src/api/client.ts` — BookStack REST Client
- `src/api/types.ts` — API Response Types
