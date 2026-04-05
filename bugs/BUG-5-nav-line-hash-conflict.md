# BUG-5: Falsche Konflikte nach Pull durch Navigation-Line im Hash

## Status: fixed

## Problem

Nach jedem Pull erkennt der bidirektionale Sync alle Seiten als Konflikte, obwohl keine Änderungen vorgenommen wurden.

## Root Cause

`pullPage` berechnet den Content-Hash und speichert ihn im Mapping. Danach fügt `injectNavigation` eine Navigationszeile (`↑ [[...]] · ← [[...]] · → [[...]]`) in die Datei ein. Beim nächsten Sync berechnet `bidirectional.ts` den Hash aus der Datei inkl. Navigationszeile → Hash stimmt nicht mehr → falsche Konflikte.

## Fix

Shared `stripNavLine()` Utility in `src/models/frontmatter.ts`. Wird in `bidirectional.ts` (3 Stellen) und `push.ts` (4 Stellen) vor der Hash-Berechnung aufgerufen.

## Betroffene Dateien

- `src/models/frontmatter.ts` — `stripNavLine()` hinzugefügt
- `src/sync/bidirectional.ts` — `stripNavLine()` vor Hash-Berechnung
- `src/sync/push.ts` — inline Regex durch `stripNavLine()` ersetzt

## Fixed in

- Commit: `be2022c`
- GH Issue: #17
