# FE-8: Kapitel-Index & Navigation

## Problem

BookStack organisiert Seiten in Kapitel innerhalb von Büchern. Beim Pull werden Kapitel als Ordner im Vault abgebildet, aber:
1. Es gibt keine Übersichtsdatei die die Seiten eines Kapitels zusammenfasst
2. Einzelne Seiten haben keine Rücklinks zum Kapitel oder Prev/Next-Navigation
3. In Obsidian's Graph View sind die Seiten isoliert

## Lösung

### 1. Kapitel-Index-Dateien

Beim Pull pro Kapitel eine `{KapitelName}.md` im Kapitel-Ordner generieren.

**Beispiel:** `BookStack/Consolut Internal/FRUN Setup/FRUN Setup.md`

```yaml
---
bookstack_type: chapter
bookstack_id: 2
bookstack_book_id: 2
---
```

```markdown
# FRUN Setup

- [[FRUN decision model]]
- [[FRUN Security]]
- [[FRUN vs CCT]]
```

### 2. Buch-Index-Dateien

Beim Pull pro Buch eine `{BuchName}.md` im Buch-Ordner generieren.

**Beispiel:** `BookStack/Consolut Internal/Consolut Internal.md`

```yaml
---
bookstack_type: book
bookstack_id: 2
---
```

```markdown
# Consolut Internal

## Kapitel

- [[FRUN Setup]]
- [[Azure Dokumentation]]
- [[System Copy]]
```

### 3. Navigationszeile in jeder Seite

Beim Pull in jede Seite eine Navigationszeile als erste Zeile nach dem Frontmatter einfügen:

```markdown
↑ [[FRUN Setup]] · ← [[FRUN decision model]] · → [[FRUN vs CCT]]
```

Drei Elemente:
- **↑ Kapitel-Link** — zurück zur Kapitel-Übersicht
- **← Vorherige Seite** — vorherige Seite im Kapitel (nach BookStack priority)
- **→ Nächste Seite** — nächste Seite im Kapitel (nach BookStack priority)

Für die erste Seite im Kapitel entfällt `←`, für die letzte `→`:
```markdown
↑ [[FRUN Setup]] · → [[FRUN Security]]
```

Für Seiten die direkt einem Buch zugeordnet sind (ohne Kapitel) zeigt `↑` auf den Buch-Index.

### Pull-Verhalten

1. Kapitel/Buch-Metadaten aus `collectPages` sammeln (Reihenfolge via priority)
2. Nach dem Pull aller Seiten: Index-Dateien erstellen/aktualisieren
3. Navigationszeile in jede Seite einfügen (nach Frontmatter, vor dem Inhalt)
4. Bei Re-Pull: Index und Navigation nur aktualisieren wenn sich die Seitenliste oder Reihenfolge geändert hat

### Push-Verhalten

- Index-Dateien (`bookstack_type: chapter` oder `bookstack_type: book` im Frontmatter) werden beim Push NICHT als neue Seiten nach BookStack gepusht
- Die Navigationszeile wird vor dem Push aus dem Markdown entfernt (erkennbar am `↑ [[...]]` Pattern am Anfang)

## Betroffene Dateien

- `src/sync/pull.ts` — Index-Dateien generieren, Navigationszeile einfügen
- `src/sync/push.ts` — Index-Dateien überspringen, Navigationszeile vor Push entfernen
- `src/sync/bidirectional.ts` — Index-Dateien bei Kandidaten-Erkennung überspringen

## Akzeptanzkriterien

- [ ] Beim Pull wird pro Kapitel eine `{KapitelName}.md` mit Wikilinks erstellt
- [ ] Beim Pull wird pro Buch eine `{BuchName}.md` mit Wikilinks zu Kapiteln erstellt
- [ ] Jede Seite hat eine Navigationszeile: ↑ Kapitel · ← Prev · → Next
- [ ] Reihenfolge der Seiten basiert auf BookStack priority
- [ ] Index-Dateien werden beim Push nicht als neue Seiten erstellt
- [ ] Navigationszeile wird vor dem Push entfernt
- [ ] Bei Re-Pull werden Index und Navigation nur bei Änderungen aktualisiert

## Abhängigkeiten

FE-2 (Pull Sync), FE-5 (Push Sync)
