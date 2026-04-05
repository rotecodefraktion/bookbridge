# Conversion Rules — HTML ↔ Markdown

## HTML → Markdown (Pull: BookStack → Obsidian)

### Turndown Setup
```typescript
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
});
turndown.use(gfm); // Tabellen, Strikethrough, Task Lists
```

### Custom Rules (Pflicht)

#### BookStack Callouts
BookStack nutzt `<p class="callout info|warning|danger|success">`. Umwandeln in Obsidian Callouts:
```markdown
> [!info]
> Callout-Text
```

#### Code-Blöcke mit Sprache
BookStack: `<pre><code class="language-typescript">`. Sicherstellen dass die Sprache erhalten bleibt:
````markdown
```typescript
code here
```
````

#### Komplexe Tabellen
- Colspan/Rowspan → Warnung als Kommentar, Tabelle so gut wie möglich abbilden
- Verschachtelte Tabellen → Flach machen oder als HTML-Block belassen mit Warnung
- Leere Zellen korrekt als `|  |` darstellen

#### BookStack Drawings
- Drawings können nicht als Markdown dargestellt werden
- Fallback: Als Bild exportieren (Screenshot via API wenn verfügbar) oder Platzhalter:
```markdown
> [!warning] BookStack Drawing
> Dieses Element ist ein BookStack Drawing und kann nicht als Markdown dargestellt werden.
> [Original ansehen]({bookstack_url}/link/{id})
```

#### Interne Links
- BookStack-interne Links (`/books/slug/page/slug`) → Obsidian Wikilinks `[[Page Title]]`
- Nur wenn Ziel-Seite im Mapping existiert, sonst BookStack-URL belassen

### Fallback-Strategie
Wenn Turndown bei einem Element scheitert:
1. HTML als fenced Code-Block einbetten
2. Kommentar davor: `<!-- BookBridge: Konvertierung fehlgeschlagen -->`
3. Warning in Sync-Log schreiben

## Bild & Attachment Download

### Bild-Handling (Pull)
1. Alle `<img src="...">` im HTML identifizieren
2. Absolute BookStack-URLs erkennen (`{baseUrl}/uploads/images/...`)
3. Bild via `requestUrl()` herunterladen (als ArrayBuffer)
4. Speichern unter `{syncFolder}/_assets/{image_filename}`
5. Markdown-Link umschreiben: `![alt](_assets/image_filename.png)`
6. Duplikate erkennen (gleicher Dateiname) → nicht erneut downloaden

```typescript
async function downloadImage(url: string, vault: Vault, assetPath: string): Promise<string> {
  const response = await requestUrl({ url });
  const filename = url.split('/').pop() || 'image.png';
  const localPath = `${assetPath}/${filename}`;

  if (!vault.getAbstractFileByPath(localPath)) {
    await vault.createBinary(localPath, response.arrayBuffer);
  }
  return localPath;
}
```

### Attachment-Handling (Pull)
1. BookStack Attachments via `/api/attachments/{id}` abrufen
2. Binärinhalt herunterladen
3. Speichern unter `{syncFolder}/_assets/{attachment_filename}`
4. Link im Markdown umschreiben: `[Dateiname](_assets/dateiname.pdf)`

### Bild-Upload (Push)
1. Lokale Bilder im Markdown identifizieren (`![](_assets/...)`)
2. Prüfen ob Bild schon in BookStack existiert (via Mapping)
3. Neues Bild: Upload via BookStack Image Gallery API
4. Markdown-Link zurück auf BookStack-URL umschreiben

### Asset-Ordner
```
{syncFolder}/_assets/
├── gallery/          # BookStack Image Gallery Bilder
│   ├── image-42.png
│   └── image-43.jpg
├── attachments/      # BookStack Attachments (PDFs etc.)
│   └── report-2024.pdf
└── drawings/         # BookStack Drawings (Screenshots/Fallback)
    └── drawing-7.png
```

## Markdown → HTML (Push: Obsidian → BookStack)

### Konvertierung
- Marked oder Showdown für MD→HTML
- Obsidian Callouts → BookStack Callout-Klassen
- Obsidian Wikilinks `[[Page]]` → BookStack interne Links (via Mapping)
- Lokale Bild-Pfade → BookStack Image-URLs (via Upload oder bestehendes Mapping)

### Roundtrip-Stabilität
**Kritisch:** HTML → MD → HTML muss inhaltlich identisch sein.
- Nach jeder Konvertierung: Normalisierung (Whitespace, Entity-Encoding)
- Testfälle für jeden Custom Rule: HTML → MD → HTML → Vergleich
- Bei Roundtrip-Bruch: Bug-Report (BUG-X) mit HTML-Input und MD-Output
