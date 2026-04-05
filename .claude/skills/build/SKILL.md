---
model: opus
user_invocable: true
context: fork
agent: plugin-dev
---

# /build — Feature implementieren

Implementiere ein Feature für BookBridge.

## Trigger
User sagt `/build FE-X`

## Workflow

1. **Kontext laden:**
   - `features/FE-X-*.md` lesen (Feature-Spec)
   - `features/INDEX.md` lesen (Abhängigkeiten prüfen)
   - `.claude/rules/plugin.md` lesen (Obsidian Patterns)
   - `.claude/rules/conversion.md` lesen (Konvertierungs-Regeln)
   - Relevanten bestehenden Code lesen

2. **Plan erstellen:**
   - Welche Dateien werden erstellt/geändert?
   - In welcher Reihenfolge?
   - Welche Turndown Custom Rules werden gebraucht?
   - Welche Tests werden gebraucht?

3. **Plan dem User zeigen** — Approval abwarten

4. **Implementieren** (ein Schritt nach dem anderen):
   - TypeScript strict mode beachten
   - `requestUrl()` statt `fetch()`
   - `this.app.vault` statt `fs`
   - `createBinary()` für Bilder/Anhänge
   - `processFrontMatter()` für Frontmatter
   - Fehlerbehandlung auf jedem API-Call
   - Konvertierungs-Fallback bei fehlgeschlagener Umwandlung
   - Mapping aktuell halten

5. **Build + Lint prüfen:**
   ```bash
   npm run lint
   npm run build
   ```

6. **QA triggern:** User auf `/qa` hinweisen

## Implementierungszusammenfassung

Am Ende jeder Build-Session:

```markdown
## Implementierung FE-X

### Erstellt
- `src/convert/html-to-md.ts` — Turndown mit Custom Rules

### Geändert
- `src/main.ts` — Neuer Command registriert
- `src/settings.ts` — Neue Option hinzugefügt

### Akzeptanzkriterien
- [x] Kriterium 1
- [x] Kriterium 2
- [ ] Kriterium 3 (braucht Follow-up)

### Build Status
- Lint: ✅
- Build: ✅
- Tests: ⚠️ (neue Tests nötig)
```
