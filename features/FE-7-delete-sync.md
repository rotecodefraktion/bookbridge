# FE-7: Delete Sync

## User Story
Als Obsidian-Nutzer möchte ich, dass gelöschte Seiten auf einer Seite auch auf der anderen Seite entfernt werden (nach Bestätigung), damit beide Systeme konsistent bleiben.

## Akzeptanzkriterien
- [ ] Erkennt lokal gelöschte Dateien (im Mapping, aber nicht mehr im Vault)
- [ ] Erkennt remote gelöschte Pages (im Mapping, aber 404 bei API-Call)
- [ ] Lokal gelöscht → Bestätigungs-Modal: "Delete page '{name}' from BookStack?"
- [ ] Remote gelöscht → Bestätigungs-Modal: "Remove local file '{name}'?"
- [ ] User-Optionen: "Delete", "Keep (unlink)", "Skip"
- [ ] "Keep (unlink)" → Mapping-Eintrag entfernen, Datei/Page behalten
- [ ] Nach Löschung: Mapping-Eintrag entfernen
- [ ] Zugehörige Assets (Bilder, Attachments) ebenfalls löschen (nach Bestätigung)
- [ ] Batch-Löschung: Bei mehreren → Übersichts-Modal mit Checkboxen
- [ ] Nie automatisch löschen — immer User-Bestätigung, auch bei `local`/`remote` Conflict Strategy
- [ ] Gelöschte Books/Chapters → alle enthaltenen Pages als gelöscht behandeln

## Technische Notizen

### BookStack API
- `DELETE /api/pages/{id}` — Page löschen
- `GET /api/pages/{id}` → 404 = gelöscht (oder `GET /api/recyclebin` prüfen)

### Erkennung: Lokal gelöscht
1. Mapping-Einträge durchgehen
2. Für jeden Eintrag: `vault.getAbstractFileByPath(vaultPath)` prüfen
3. Datei nicht gefunden → lokal gelöscht

### Erkennung: Remote gelöscht
1. Beim Sync: Page-Liste von BookStack abrufen
2. Mapping-Einträge die nicht in der Page-Liste sind → remote gelöscht
3. Alternativ: einzelnen `GET /api/pages/{id}` → 404

### Delete-Bestätigung Modal
```typescript
class DeleteConfirmModal extends Modal {
  // Liste der zu löschenden Dateien/Pages
  // Checkboxen: einzeln an/abwählen
  // Buttons: "Delete Selected", "Unlink All", "Cancel"
  // Warnung: "This action cannot be undone"
}
```

### Asset-Cleanup
- Wenn Page gelöscht wird: zugehörige Assets identifizieren
- Prüfen ob Assets von anderen Pages referenziert werden
- Nur nicht-referenzierte Assets löschen
- Asset-Löschung separat bestätigen lassen

### Edge Cases
- Datei gelöscht aber nicht gespeichert (Obsidian Trash) → Trash prüfen
- Page gelöscht und neu erstellt mit gleicher ID → BookStack vergibt neue ID, also kein Problem
- Ganzes Book gelöscht → alle Pages + Chapters als gelöscht erkennen
- Chapter gelöscht → Pages darunter werden zu Book-Level Pages (BookStack Verhalten prüfen)
- Offline-Löschung → beim nächsten Sync erkennen
- Race Condition: Page wird gelöscht während Sync läuft → 404 graceful handlen
- Assets die von mehreren Pages genutzt werden → nicht löschen

## Abhängigkeiten
- **FE-6** — wird als Teil des bidirektionalen Syncs aufgerufen

## Dateien
- `src/sync/delete.ts` — Lösch-Erkennung und Ausführung
- `src/ui/delete-confirm.ts` — Lösch-Bestätigungs-Modal
