# BUG-3: Details/Summary Blöcke und Code-Block Konvertierung fehlerhaft

## GitHub Issue
https://github.com/rotecodefraktion/bookbridge/issues/3

## Symptome
1. BookStack `<details><summary>Title</summary>` Blöcke (aufklappbare Sections) verlieren ihre Struktur — der Summary-Text verschwindet oder wird als normaler Text zwischen Code-Blöcken eingefügt
2. Code-Blöcke innerhalb von `<details>` verschmelzen — Fence-Markers werden nicht korrekt geschlossen/geöffnet, der gesamte Inhalt fließt in einen einzigen Code-Block
3. Callouts innerhalb von Listen (`<li><p class="callout success">`) werden nicht als Obsidian Callouts gerendert

## Echte HTML-Struktur (aus BookStack API)
```html
<details id="bkmrk-prd-...">
  <summary>PRD</summary>
  <pre><code class="language-sql">1> select @@version
2> go
...</code></pre>
</details>
<details id="bkmrk-qas-...">
  <summary>QAS</summary>
  <pre><code class="language-sql">1> select @@version
2> go
...</code></pre>
</details>
```

Callouts in Listen:
```html
<li class="null">
  <p class="callout success"><span>qasadm</span></p>
</li>
```

## Erwartetes Verhalten

### Details/Summary → Obsidian Callout mit Title
```markdown
> [!example]- PRD
> ```sql
> 1> select @@version
> 2> go
> ```

> [!example]- QAS
> ```sql
> 1> select @@version
> 2> go
> ```
```
(Obsidian Callouts mit `-` sind standardmäßig eingeklappt, wie `<details>`)

### Callouts in Listen → korrekte Obsidian Callouts
```markdown
- > [!success]
  > qasadm
```

## Tatsächliches Verhalten
- Summary-Text ("PRD", "QAS") landet als normaler Text zwischen Code-Blöcken
- Code-Blöcke werden nicht korrekt getrennt — Fences verschmelzen
- Callouts in Listen erscheinen als roher `> [!info]` Text

## Ursache
`src/convert/html-to-md.ts` hat keine Turndown Custom Rule für:
1. `<details>` / `<summary>` Elemente
2. Callouts innerhalb von `<li>` Elementen (die bestehende Callout-Rule matcht nur top-level `<p class="callout">`)

### Betroffener Code
- `src/convert/html-to-md.ts` — fehlende Custom Rules

## Fix-Vorschlag

### 1. Details/Summary Rule
```typescript
turndown.addRule('details-summary', {
  filter: (node) => node.nodeName === 'DETAILS',
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const summary = el.querySelector('summary');
    const title = summary ? summary.textContent?.trim() || 'Details' : 'Details';
    // Remove the summary text from content (Turndown already converted it)
    // Wrap remaining content in a collapsible callout
    const body = content.replace(title, '').trim();
    const lines = body.split('\n').map(l => `> ${l}`).join('\n');
    return `\n> [!example]- ${title}\n${lines}\n\n`;
  },
});
```

### 2. Callout Rule erweitern
Die bestehende `bookstack-callout` Rule matcht nur `<p class="callout">` auf Top-Level. Sie muss auch innerhalb von `<li>` Elementen funktionieren. Turndown konvertiert `<li>` vor `<p>`, daher wird der Callout schon verarbeitet bevor die Rule greift.

Fix: Die Callout Rule muss höhere Priorität haben oder `<p class="callout">` unabhängig vom Parent-Element matchen.

## Betroffene Features
- FE-3 (HTML→Markdown Konvertierung)

## Beispiel-Seiten
- Page ID 21: "System Copy QAS 2024" — enthält Details/Summary mit SQL Code-Blöcken und Callouts in Listen

## Priorität
Hoch — betrifft alle Seiten mit aufklappbaren Sections und Callouts in Listen
