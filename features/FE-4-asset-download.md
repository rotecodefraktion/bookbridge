# FE-4: Asset Download

## User Story
Als Obsidian-Nutzer möchte ich, dass Bilder und Anhänge aus BookStack automatisch lokal heruntergeladen werden, damit ich sie offline betrachten kann und die Markdown-Dateien korrekte lokale Bild-Pfade haben.

## Akzeptanzkriterien
- [ ] Bilder aus BookStack-HTML werden erkannt und heruntergeladen
- [ ] Bilder gespeichert unter `{syncFolder}/_assets/gallery/{filename}`
- [ ] Attachments gespeichert unter `{syncFolder}/_assets/attachments/{filename}`
- [ ] Markdown-Bild-Links zeigen auf lokale Pfade: `![alt](_assets/gallery/image.png)`
- [ ] Attachment-Links zeigen auf lokale Pfade: `[name](_assets/attachments/file.pdf)`
- [ ] Duplikaterkennung: gleicher Dateiname → nicht erneut downloaden
- [ ] Nur URLs von der konfigurierten BookStack-Instanz werden heruntergeladen
- [ ] Externe URLs (andere Domains) bleiben unverändert
- [ ] Dateinamen werden sanitized (keine Path Traversal)
- [ ] Download via `requestUrl()` als ArrayBuffer → `vault.createBinary()`
- [ ] Fortschritt: StatusBar zeigt "Downloading assets X/Y..."
- [ ] Fehler bei einzelnen Assets: weitermachen, am Ende zusammenfassen
- [ ] Setting `downloadAssets: false` → keine Assets herunterladen, URLs beibehalten

## Technische Notizen

### BookStack API
- Bilder: `GET /api/image-gallery/{id}` → Metadaten inkl. URL
- Bilder direkt: URL aus `<img src="...">` → `requestUrl()` für Download
- Attachments: `GET /api/attachments/{id}` → Metadaten + Download-Link

### Bild-Erkennung im HTML
1. Alle `<img src="...">` parsen
2. Absolute BookStack-URLs erkennen (`{baseUrl}/uploads/images/...`)
3. Relative URLs zu absolut konvertieren
4. Externe URLs (andere Domain) → ignorieren

### Download-Flow
```
HTML parsen → URLs extrahieren → filtern (nur BookStack) →
Download (requestUrl) → lokal speichern (createBinary) →
URL im Markdown ersetzen (auf lokalen Pfad)
```

### Asset-Ordnerstruktur
```
{syncFolder}/_assets/
├── gallery/          # Bilder aus BookStack Image Gallery
│   ├── image-42.png
│   └── screenshot-2026.jpg
├── attachments/      # BookStack Attachments (PDFs etc.)
│   └── report-2024.pdf
└── drawings/         # BookStack Drawings (Screenshots/Fallback)
    └── drawing-7.png
```

### URL-Rewriting
- BookStack URL: `https://books.example.com/uploads/images/gallery/2026-04/image.png`
- Lokaler Pfad: `_assets/gallery/image.png`
- Im Markdown: `![Alt Text](_assets/gallery/image.png)`

### Edge Cases
- Gleicher Dateiname, verschiedene Bilder → Hash-Suffix anhängen
- Sehr große Bilder (>10MB) → Download trotzdem, aber Warnung
- Kaputte Bild-URLs (404) → Warnung, Markdown-Link auf Original belassen
- SVG-Bilder → als Datei speichern (nicht inline)
- Data-URIs (`data:image/png;base64,...`) → dekodieren und speichern
- Bilder in Tabellen → korrekt mit lokalem Pfad ersetzen
- Attachment ohne Dateiendung → MIME-Type prüfen, Extension ergänzen

## Abhängigkeiten
- **FE-2** — wird während Pull Sync aufgerufen
- **FE-3** — nach HTML→MD Konvertierung, URL-Rewriting im Markdown

## Dateien
- `src/convert/assets.ts` — Download + URL-Rewriting Logik
- `src/utils/sanitize.ts` — Dateinamen-Bereinigung (erweitern)
