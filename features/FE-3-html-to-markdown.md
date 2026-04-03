# FE-3: HTML→Markdown Konvertierung

## User Story
Als Obsidian-Nutzer möchte ich, dass BookStack-HTML sauber in Obsidian-kompatibles Markdown konvertiert wird, damit ich die Inhalte nativ in Obsidian lesen und bearbeiten kann.

## Akzeptanzkriterien
- [ ] Turndown mit GFM-Plugin als Basis (Tabellen, Strikethrough, Task Lists)
- [ ] Headings: ATX-Style (`# H1`, `## H2`, ...)
- [ ] Code-Blöcke: Fenced mit Sprache erhalten (`\`\`\`typescript`)
- [ ] Bullet Lists: `-` als Marker
- [ ] BookStack Callouts (`<p class="callout info|warning|danger|success">`) → Obsidian Callouts (`> [!info]`)
- [ ] Komplexe Tabellen: Colspan/Rowspan als Kommentar-Warnung, bestmöglich abbilden
- [ ] Verschachtelte Listen korrekt konvertiert
- [ ] Interne BookStack-Links → Obsidian Wikilinks `[[Page Title]]` (wenn Ziel im Mapping)
- [ ] BookStack Drawings → Platzhalter mit Link zum Original
- [ ] Fallback bei Konvertierungsfehler: HTML als Code-Block + Warnung
- [ ] Roundtrip-Test: HTML→MD→HTML muss inhaltlich identisch sein (normalisiert)

## Technische Notizen

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
turndown.use(gfm);
```

### Custom Rules

#### 1. BookStack Callouts
```
Input:  <p class="callout info">Important info here</p>
Output: > [!info]
        > Important info here
```
Varianten: `info`, `warning`, `danger`, `success`

#### 2. Code-Blöcke mit Sprache
```
Input:  <pre><code class="language-typescript">const x = 1;</code></pre>
Output: ```typescript
        const x = 1;
        ```
```

#### 3. Interne Links
```
Input:  <a href="/books/my-book/page/my-page">My Page</a>
Output: [[My Page]]  (wenn im Mapping)
        [My Page](https://bookstack.example.com/books/my-book/page/my-page)  (wenn nicht im Mapping)
```

#### 4. BookStack Drawings
```
Output: > [!warning] BookStack Drawing
        > Dieses Element ist ein BookStack Drawing und kann nicht als Markdown dargestellt werden.
        > [Original ansehen](https://bookstack.example.com/link/{id})
```

#### 5. Tabellen mit Colspan/Rowspan
```
Output: <!-- BookBridge: Tabelle enthält Colspan/Rowspan — Layout kann abweichen -->
        | Col 1 | Col 2 |
        |-------|-------|
        | ...   | ...   |
```

### Fallback-Strategie
Bei fehlgeschlagener Konvertierung eines Elements:
1. Element als HTML-Code-Block einbetten
2. Kommentar: `<!-- BookBridge: Konvertierung fehlgeschlagen -->`
3. Warning in Sync-Log

### Edge Cases
- Leerer HTML-Body → leerer Markdown-String
- Nur Whitespace → leerer Markdown-String
- HTML-Entities (`&amp;`, `&lt;`) → korrekt dekodieren
- Verschachtelte Blockquotes → korrekt abbilden
- Bilder innerhalb Tabellen → Markdown-Bild-Syntax in Zelle
- `<br>` in Absätzen → korrekt als Zeilenumbruch
- `<div>`-basiertes Layout (kein semantisches HTML) → bestmöglich abbilden

## Abhängigkeiten
- **FE-2** — wird von Pull Sync aufgerufen
- Wird von **FE-5** (Push) für Roundtrip-Tests benötigt

## Dateien
- `src/convert/html-to-md.ts` — Turndown + Custom Rules
- `src/convert/md-to-html.ts` — Reverse (für FE-5, Grundlage hier legen)

## Dependencies (npm)
- `turndown` — HTML→Markdown
- `@joplin/turndown-plugin-gfm` — GFM Support (Tabellen, Strikethrough)
