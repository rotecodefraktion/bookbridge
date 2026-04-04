# BUG-1: PDF Attachments not downloaded during pull

## Beschreibung
Beim Pull einer BookStack-Seite, die ein PDF-Attachment enthält, wird die PDF-Datei nicht heruntergeladen. Der Markdown-Link zeigt weiterhin auf die BookStack-URL statt auf eine lokale Datei. In Obsidian ist das PDF damit nicht verfügbar.

## Schritte zum Reproduzieren
1. BookStack-Seite mit PDF-Attachment erstellen (z.B. `Patch2019.pdf`)
2. Pull Sync ausführen
3. Seite in Obsidian öffnen

## Erwartetes Verhalten
- PDF wird unter `{syncFolder}/_assets/attachments/Patch2019.pdf` gespeichert
- Markdown-Link zeigt auf lokalen Pfad: `[Patch2019.pdf](_assets/attachments/Patch2019.pdf)`
- PDF ist in Obsidian klickbar und öffnet sich

## Tatsächliches Verhalten
- PDF wird nicht heruntergeladen
- Link zeigt weiterhin auf BookStack-URL oder ist ein toter Link
- Kein Asset-Ordner für Attachments angelegt

## Beispiel
- BookStack-Seite: `http://bookstack.local:6875/books/xylem/page/2019/` (Page ID: 36, Book ID: 9, Chapter ID: 15)
- Obsidian-Datei: `BookStack/Xylem/Patches/2019.md`
- Erwartetes PDF: `BookStack/_assets/attachments/Patch2019.pdf`

## Ursache
`src/convert/assets.ts` behandelt aktuell nur Bilder (`<img src="...">`). BookStack Attachments werden über die Attachments API (`/api/attachments/{id}`) bereitgestellt und sind im HTML als reguläre `<a href="...">` Links eingebettet — diese werden beim Pull nicht als downloadbare Assets erkannt.

### Betroffener Code
- `src/convert/assets.ts` — `extractAttachmentUrls()` existiert, wird aber im Pull-Flow nicht aufgerufen
- `src/sync/pull.ts` — ruft nur `downloadImages()` auf, kein Attachment-Download

## Fix-Vorschlag
1. Attachments der Seite via `GET /api/pages/{id}` → `attachments` Feld oder `GET /api/attachments?filter[uploaded_to]={pageId}` abrufen
2. Für jedes Attachment: Binärinhalt via `GET /api/attachments/{id}` herunterladen (Feld `content` bei nicht-externen Attachments)
3. Speichern unter `{syncFolder}/_assets/attachments/{filename}`
4. Link im Markdown umschreiben auf lokalen Pfad
5. Attachment-Mapping erweitern (damit Push die URLs zurückschreiben kann)

## Betroffene Features
- **FE-4** (Asset Download) — Attachment-Download fehlt
- **FE-2** (Pull Sync) — Attachment-Download nicht integriert

## Priorität
Hoch — PDFs sind ein häufiger Anwendungsfall in BookStack
