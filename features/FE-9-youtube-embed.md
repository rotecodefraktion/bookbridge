# FE-9: YouTube Video Einbindung

## Problem

BookStack unterstützt eingebettete YouTube-Videos via `<iframe>`. Beim Pull werden diese iframes entweder:
1. Von Turndown komplett entfernt (da iframe ein "dangerous tag" ist nach SEC-2 Fix)
2. Oder als Raw-HTML durchgereicht, was in Obsidian nicht rendert

Umgekehrt: Wenn ein User in Obsidian einen YouTube-Link einfügt, wird dieser beim Push nicht als Embed nach BookStack konvertiert.

## Lösung

### Pull: BookStack → Obsidian (HTML → Markdown)

BookStack YouTube Embed Formate im HTML:
- `<iframe src="https://www.youtube.com/embed/VIDEO_ID" ...></iframe>`
- `<iframe src="https://www.youtube-nocookie.com/embed/VIDEO_ID" ...></iframe>`

Konvertierung in Obsidian-kompatibles Format:

**Option A — Obsidian-nativer Embed (empfohlen):**
Obsidian kann iframes nicht nativ rendern. Stattdessen einen Markdown-Link mit Thumbnail erzeugen:
```markdown
[![YouTube: Video Title](https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg)](https://www.youtube.com/watch?v=VIDEO_ID)
```

**Option B — Obsidian Iframe Plugin kompatibel:**
Falls der User das "Iframe" Community Plugin nutzt:
```markdown
<iframe src="https://www.youtube.com/embed/VIDEO_ID" width="560" height="315"></iframe>
```
Erfordert Ausnahme in `stripDangerousTags` für YouTube-iframes.

**Empfehlung:** Option A als Default, Option B als Setting.

### Push: Obsidian → BookStack (Markdown → HTML)

YouTube-Links im Markdown erkennen und als BookStack-kompatibles iframe konvertieren:

Eingabe (Markdown):
```markdown
[![YouTube: Title](https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg)](https://www.youtube.com/watch?v=VIDEO_ID)
```

Oder einfacher YouTube-Link:
```markdown
https://www.youtube.com/watch?v=VIDEO_ID
```

Ausgabe (HTML für BookStack):
```html
<iframe src="https://www.youtube.com/embed/VIDEO_ID" width="560" height="315" frameborder="0" allowfullscreen></iframe>
```

### Turndown Custom Rule

Neue Regel in `html-to-md.ts`:
```typescript
addYouTubeRule(turndown): void {
  turndown.addRule('youtube-embed', {
    filter: (node) => {
      return node.nodeName === 'IFRAME' &&
        (node.getAttribute('src') || '').match(/youtube\.com\/embed\/|youtube-nocookie\.com\/embed\//);
    },
    replacement: (_content, node) => {
      const src = node.getAttribute('src') || '';
      const videoId = src.match(/embed\/([^?&#]+)/)?.[1];
      if (!videoId) return '';
      return `\n[![YouTube](https://img.youtube.com/vi/${videoId}/maxresdefault.jpg)](https://www.youtube.com/watch?v=${videoId})\n`;
    },
  });
}
```

### SEC-2 Anpassung

`stripDangerousTags` in `md-to-html.ts` muss YouTube-iframes ausnehmen:
- iframes mit `src` die auf `youtube.com/embed/` oder `youtube-nocookie.com/embed/` zeigen, beibehalten
- Alle anderen iframes weiterhin entfernen

### marked Extension

In `md-to-html.ts` eine marked Extension hinzufügen die YouTube-URLs in iframes konvertiert:
- Bare URLs: `https://www.youtube.com/watch?v=VIDEO_ID` → iframe
- Thumbnail-Links: `[![...](thumbnail)](youtube-url)` → iframe

## Betroffene Dateien

- `src/convert/html-to-md.ts` — Turndown YouTube Rule
- `src/convert/md-to-html.ts` — marked Extension + SEC-2 YouTube Ausnahme
- `src/settings.ts` — Optional: Setting für YouTube Embed Modus (Thumbnail vs iframe)

## Akzeptanzkriterien

- [ ] YouTube iframes im BookStack HTML werden beim Pull als Thumbnail-Links in Obsidian dargestellt
- [ ] Thumbnail-Links werden beim Push als YouTube iframes nach BookStack konvertiert
- [ ] Bare YouTube URLs im Markdown werden beim Push als iframes konvertiert
- [ ] SEC-2 stripDangerousTags behält YouTube-iframes bei, entfernt alle anderen
- [ ] Roundtrip-stabil: YouTube embed → pull → push → YouTube embed

## Abhängigkeiten

FE-3 (HTML→Markdown), FE-5 (Push Sync)
