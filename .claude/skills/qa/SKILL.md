---
model: opus
user_invocable: true
context: fork
agent: qa-engineer
---

# /qa — Quality Assurance

Teste BookBridge gegen Akzeptanzkriterien.

## Trigger
User sagt `/qa` oder `/qa FE-X`

## Workflow

### 1. Kontext laden
- Feature-Spec lesen (`features/FE-X-*.md`)
- Geänderte Dateien identifizieren (`git diff`)
- `.claude/rules/plugin.md`, `conversion.md` und `security.md` lesen

### 2. Statische Analyse
```bash
npm run lint          # ESLint
npm run build         # TypeScript Compiler
```
Bei Fehlern: **STOPP** — erst fixen lassen.

### 3. Obsidian Compliance Check
Alle geänderten `.ts`-Dateien prüfen auf:
- [ ] Kein `import * as fs` oder `import { readFileSync }`
- [ ] Kein `import * as path` (nur `normalizePath` von Obsidian)
- [ ] Kein `fetch()` (nur `requestUrl()`)
- [ ] Kein `localStorage` / `sessionStorage`
- [ ] Kein `document.querySelector` für Plugin-UI
- [ ] `manifest.json` Version korrekt
- [ ] `versions.json` aktuell

### 4. Security Check
- [ ] Keine Tokens/Secrets in Quellcode-Strings
- [ ] Keine Tokens in console.log / Fehlermeldungen
- [ ] Settings-Interface nutzt sensitive Felder korrekt
- [ ] API Client nutzt nur `requestUrl()`
- [ ] Asset-Download nur von konfigurierter Base-URL

### 5. Konvertierungsqualität
- [ ] BookStack Callouts → Obsidian Callouts
- [ ] Code-Blöcke mit Sprache erhalten
- [ ] Tabellen korrekt (oder Warnung bei Colspan/Rowspan)
- [ ] Bilder auf lokale `_assets/`-Pfade umgeschrieben
- [ ] Roundtrip-Test: HTML → MD → HTML inhaltlich stabil

### 6. Unit Tests
```bash
npm run test
```

### 7. Feature-spezifische Tests
Gegen Akzeptanzkriterien aus Feature-Spec testen:
- Jeden Punkt einzeln verifizieren
- Edge Cases: Sonderzeichen in Dateinamen, leere Seiten, fehlende Kapitel, große Bilder

### 8. QA Report

```markdown
## QA Report — FE-X

| Check | Status | Details |
|-------|--------|---------|
| Lint | ✅/❌ | |
| Build | ✅/❌ | |
| Obsidian Compliance | ✅/❌ | |
| Security | ✅/❌ | |
| Konvertierung | ✅/❌ | |
| Unit Tests | ✅/❌ | X/Y passed |
| Akzeptanzkriterien | ✅/❌ | X/Y erfüllt |

### Bugs

| # | Severity | Beschreibung | Datei |
|---|----------|-------------|-------|

### Verdict: ✅ PASS / ❌ FAIL
```

## Pass-Kriterien
- Lint + Build fehlerfrei
- Obsidian Compliance + Security bestanden
- Konvertierungsqualität bestanden
- Alle Unit Tests grün
- Keine 🔴 Critical oder 🟠 High Bugs
- Alle Akzeptanzkriterien erfüllt
