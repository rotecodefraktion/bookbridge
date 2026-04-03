# FE-5: Push Sync

## User Story
Als Obsidian-Nutzer möchte ich meine lokal bearbeiteten Markdown-Dateien zurück nach BookStack synchronisieren, damit meine Änderungen auch im Web verfügbar sind.

## Akzeptanzkriterien
- [ ] Command "BookBridge: Push to BookStack" verfügbar
- [ ] Push respektiert `selectedBookIds` — nur Dateien pushen die zu ausgewählten Büchern gehören
- [ ] Command "BookBridge: Push Book..." → Fuzzy-Suggest Modal zur Auswahl eines einzelnen Buchs
- [ ] Erkennt lokal geänderte Dateien (Hash-Vergleich mit Mapping)
- [ ] Markdown → HTML Konvertierung für BookStack
- [ ] Obsidian Callouts (`> [!info]`) → BookStack Callouts (`<p class="callout info">`)
- [ ] Obsidian Wikilinks `[[Page Title]]` → BookStack interne Links (via Mapping)
- [ ] Lokale Bild-Pfade → BookStack Image-URLs (Upload wenn nötig)
- [ ] Neue lokale Dateien (mit Frontmatter `bookstack_book_id`) → neue Page in BookStack erstellen
- [ ] Bestehende Pages → `PUT /api/pages/{id}` mit HTML-Body
- [ ] Frontmatter `bookstack_updated_at` wird nach Push aktualisiert
- [ ] Mapping wird nach Push aktualisiert (neuer Hash + Timestamp)
- [ ] Fortschritts-Anzeige: StatusBar zeigt "Pushing X/Y pages..."
- [ ] Nach Push: Notice mit Zusammenfassung
- [ ] User-Bestätigung vor dem Push (Modal: "X pages will be updated")

## Technische Notizen

### BookStack API
- `PUT /api/pages/{id}` — Page aktualisieren (`{ html: "..." }`)
- `POST /api/pages` — neue Page erstellen (`{ book_id, chapter_id, name, html }`)
- `POST /api/image-gallery` — Bild hochladen (multipart/form-data)

### Markdown → HTML Konvertierung
- Bibliothek: `marked` oder `showdown`
- Custom Extensions für:
  - Obsidian Callouts → BookStack Callout `<p class="callout ...">`
  - Wikilinks → BookStack `<a href="/books/...">` (via Mapping)
  - Lokale Bilder → BookStack Image URLs

### Push-Algorithmus
1. Mapping laden
2. Alle Dateien im Sync-Ordner scannen (mit Frontmatter `bookstack_id`)
   - Filtern nach `settings.selectedBookIds` (via `bookstack_book_id` im Frontmatter)
3. Hash berechnen, mit Mapping vergleichen
4. Geänderte Dateien sammeln
5. User-Bestätigung (Modal mit Liste)
6. Für jede geänderte Datei:
   a. Markdown lesen (ohne Frontmatter)
   b. MD → HTML konvertieren
   c. Lokale Bilder hochladen (wenn nötig)
   d. `PUT /api/pages/{id}` mit HTML
   e. Frontmatter + Mapping aktualisieren
7. Mapping speichern

### Bild-Upload
1. Lokale Bilder im Markdown identifizieren (`![...](_assets/...)`)
2. Mapping prüfen: ist Bild schon in BookStack?
3. Nein → Upload via `POST /api/image-gallery` (multipart)
4. URL im HTML auf BookStack-URL setzen
5. Mapping um Bild-Eintrag erweitern

### Edge Cases
- Neue Datei ohne `bookstack_book_id` → Ignorieren oder User fragen welches Book
- Datei mit `bookstack_id` aber Page in BookStack gelöscht → 404 abfangen, User informieren
- Gleichzeitige Remote-Änderung → Conflict (→ FE-6)
- Markdown mit nicht-konvertierbaren Elementen → bestmöglich, Warnung
- Bilder die nicht mehr lokal existieren → Link beibehalten, Warnung
- Frontmatter wurde manuell verändert → Validierung vor Push

## Abhängigkeiten
- **FE-1** — API Client
- **FE-3** — Konvertierung (MD→HTML ist das Gegenstück)

## Dateien
- `src/sync/push.ts` — Push-Logik
- `src/convert/md-to-html.ts` — Markdown → HTML + Custom Extensions
- `src/convert/assets.ts` — Bild-Upload Logik (erweitern)
- `src/ui/push-confirm.ts` — Bestätigungs-Modal vor Push
