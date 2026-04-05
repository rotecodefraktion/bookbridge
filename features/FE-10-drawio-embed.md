# FE-10: draw.io Zeichnungen — PNG-Vorschau mit externem Link

## Problem

BookStack hat einen integrierten draw.io Editor. Zeichnungen werden als `<div drawio-diagram="ID">` mit einem eingebetteten PNG-Vorschaubild gespeichert:

```html
<div drawio-diagram="281" contenteditable="false">
  <img src="http://bookstack.local:6875/uploads/images/drawio/2024-01/drawing-5-1706014134.png" alt="drawing-5-1706014134.png">
</div>
```

Aktuell zeigt BookBridge einen Warn-Callout:
```markdown
> [!warning] BookStack Drawing
> Dieses Element ist ein BookStack Drawing und kann nicht als Markdown dargestellt werden.
> [Original ansehen](http://bookstack.local:6875/link/281)
```

Das ist funktional aber nicht optimal — die PNG-Vorschau geht verloren und der User sieht nur einen Warnhinweis statt der Zeichnung.

## Lösung

### Pull: BookStack → Obsidian

Das PNG-Vorschaubild herunterladen und als Bild mit externem Link zur BookStack-Bearbeitungsseite anzeigen:

```markdown
[![draw.io: drawing-5-1706014134.png](BookStack/Attachments/drawings/drawing-5-1706014134.png)](http://bookstack.local:6875/link/281)
```

In Obsidian sieht der User:
- Das **PNG-Vorschaubild** der Zeichnung (klickbar)
- Ein Klick öffnet die **BookStack-Seite** wo die Zeichnung bearbeitet werden kann

#### Implementierung

1. **Turndown Rule anpassen** (`addDrawingRule` in `html-to-md.ts`):
   - `<div drawio-diagram="ID">` enthält ein `<img src="...">` Kind-Element
   - Die `src` URL des `<img>` extrahieren
   - Drawing-ID aus dem `drawio-diagram` Attribut lesen
   - Markdown ausgeben: `[![draw.io: {filename}]({local_path})]({baseUrl}/link/{id})`

2. **PNG herunterladen** (`assets.ts`):
   - draw.io PNGs liegen unter `/uploads/images/drawio/`
   - In `downloadImages` werden diese bereits erfasst (sind normale `<img>` Tags)
   - Speichern unter `{syncFolder}/{assetFolder}/drawings/` (neuer Unterordner)
   - Alternativ: Im bestehenden `gallery/` Ordner belassen (einfacher)

3. **URL-Rewriting** (`rewriteAssetUrls`):
   - Die draw.io PNG URLs werden wie normale Bilder behandelt
   - Lokaler Pfad ersetzt die BookStack URL

#### Ergebnis in Obsidian

```markdown
[![draw.io: drawing-5-1706014134.png](BookStack/Attachments/gallery/drawing-5-1706014134.png)](http://bookstack.local:6875/link/281)
```

- Reading View: Klickbares Vorschaubild → öffnet BookStack im Browser
- Graph View: Bild-Datei ist verlinkt

### Push: Obsidian → BookStack

draw.io Zeichnungen können in Obsidian **nicht bearbeitet** werden — sie sind nur als PNG-Vorschau dargestellt. Beim Push:

- Das `[![draw.io: ...](local)]({baseUrl}/link/{id})` Pattern erkennen
- **Nicht konvertieren** — die Zeichnung existiert bereits in BookStack
- Den Markdown-Block beim Push ignorieren oder als Kommentar in das HTML einfügen:
  ```html
  <!-- BookBridge: draw.io diagram {id} preserved -->
  ```
- Die Zeichnung bleibt in BookStack unverändert erhalten

### Roundtrip

- Pull: `<div drawio-diagram>` + `<img>` → `[![draw.io: ...](png)](link)`
- Push: `[![draw.io: ...](png)](link)` → HTML-Kommentar (Zeichnung bleibt in BookStack)
- Nicht roundtrip-fähig im strengen Sinne, aber die Zeichnung geht nie verloren

## Betroffene Dateien

- `src/convert/html-to-md.ts` — `addDrawingRule` anpassen: PNG extrahieren statt Warn-Callout
- `src/convert/assets.ts` — draw.io PNGs werden automatisch über `downloadImages` erfasst (kein extra Code nötig falls `gallery/` Ordner genutzt wird)
- `src/convert/md-to-html.ts` — draw.io Pattern beim Push erkennen und als Kommentar durchreichen

## Akzeptanzkriterien

- [ ] draw.io Zeichnungen werden als klickbares PNG-Vorschaubild in Obsidian angezeigt
- [ ] PNG wird lokal heruntergeladen (wie andere Bilder)
- [ ] Klick auf das Bild öffnet die BookStack-Seite zur Bearbeitung
- [ ] Beim Push wird die draw.io Zeichnung nicht überschrieben
- [ ] Vorhandene Zeichnungen in BookStack bleiben erhalten

## Abhängigkeiten

FE-3 (HTML→Markdown), FE-4 (Asset Download), FE-5 (Push Sync)
