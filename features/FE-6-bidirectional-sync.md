# FE-6: Bidirektionaler Sync & Conflict Resolution

## User Story
Als Obsidian-Nutzer möchte ich einen bidirektionalen Sync starten, der automatisch erkennt welche Seiten wo geändert wurden und bei Konflikten mich entscheiden lässt, damit ich flexibel auf beiden Seiten arbeiten kann.

## Akzeptanzkriterien
- [ ] Command "BookBridge: Sync" — führt bidirektionalen Sync aus (respektiert Book Selection)
- [ ] Command "BookBridge: Sync Book..." → Fuzzy-Suggest Modal zur Auswahl eines einzelnen Buchs
- [ ] Ribbon Icon löst bidirektionalen Sync aus (für ausgewählte Bücher)
- [ ] Erkennt 4 Zustände pro Seite: unverändert, lokal geändert, remote geändert, beidseitig geändert (Konflikt)
- [ ] Lokal geändert → Push
- [ ] Remote geändert → Pull
- [ ] Konflikt + Strategy `ask` → Conflict Modal mit Diff-Anzeige
- [ ] Conflict Modal zeigt: lokale Version, remote Version, Diff-Highlights
- [ ] User-Optionen im Conflict Modal: "Keep Local", "Keep Remote", "Skip"
- [ ] Konflikt + Strategy `local` → lokale Version gewinnt automatisch
- [ ] Konflikt + Strategy `remote` → remote Version gewinnt automatisch
- [ ] Auto-Sync: optional, konfigurierbar (Interval in Minuten)
- [ ] Auto-Sync respektiert Conflict Strategy Setting
- [ ] Sync-Lock: nur ein Sync gleichzeitig (kein doppeltes Triggern)
- [ ] StatusBar zeigt Sync-Status: "Ready", "Syncing...", "Last sync: 5m ago"
- [ ] Nach Sync: Zusammenfassung (X pulled, Y pushed, Z conflicts)

## Technische Notizen

### Sync-Algorithmus (Bidirektional)
1. Mapping laden
2. Remote-State abrufen (Pages mit `updated_at`, gefiltert nach `selectedBookIds`)
3. Lokalen State berechnen (Hash aller Sync-Dateien)
4. Für jede gemappte Seite:
   - Remote `updated_at` > Mapping `bookstackUpdatedAt`? → Remote geändert
   - Lokaler Hash ≠ Mapping `localHash`? → Lokal geändert
   - Beides? → Konflikt
   - Keines? → Skip
5. Neue remote Pages (nicht im Mapping) → Pull
6. Neue lokale Dateien (mit `bookstack_book_id`, ohne `bookstack_id`) → Push (neue Page)
7. Konflikte auflösen (je nach Strategy)
8. Pulls ausführen → Pushes ausführen
9. Mapping aktualisieren

### Conflict Modal
```typescript
class ConflictModal extends Modal {
  // Zeigt: Dateiname, lokale vs. remote Version
  // Buttons: "Keep Local", "Keep Remote", "Skip"
  // Optional: einfacher Diff (zeilenweise Vergleich)
}
```

### Hashing
- SHA-256 des Markdown-Contents (ohne Frontmatter)
- Für lokalen State: beim Sync berechnen und im Mapping speichern
- Für remote State: aus dem HTML-Content (nach Konvertierung) berechnen

### Auto-Sync
- `window.setInterval()` mit konfigurierbarem Interval
- Registrieren in `onload()`, clearen in `onunload()`
- Nur wenn `settings.autoSync === true`
- Bei Fehler: Auto-Sync pausieren, User benachrichtigen

### Sync-Lock
```typescript
private isSyncing = false;

async sync() {
  if (this.isSyncing) {
    new Notice('Sync already in progress');
    return;
  }
  this.isSyncing = true;
  try { /* ... */ }
  finally { this.isSyncing = false; }
}
```

### Edge Cases
- Sync während User eine Datei editiert → Datei erst nach Schließen aktualisieren oder Warnung
- Netzwerk bricht während Sync ab → Teilzustand korrekt in Mapping, beim nächsten Sync fortfahren
- Mapping-Datei korrupt → Backup erstellen, neu aufbauen
- Sehr viele Konflikte → Batch-Modal ("Keep All Local" / "Keep All Remote")
- Seite auf beiden Seiten identisch geändert → kein Konflikt (Hash vergleichen)
- Timezone-Probleme bei `updated_at` → UTC normalisieren

## Abhängigkeiten
- **FE-2** — Pull-Logik
- **FE-5** — Push-Logik

## Dateien
- `src/sync/engine.ts` — Bidirektionale Sync-Logik, State Detection
- `src/ui/conflict-modal.ts` — Conflict Resolution Dialog
- `src/ui/sync-status.ts` — StatusBar Updates
- `src/ui/sync-ribbon.ts` — Ribbon Icon Handler
