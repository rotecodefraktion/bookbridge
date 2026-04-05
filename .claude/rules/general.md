# General Rules

## ⚠️ PRIO 1 — Keine Ausnahmen

**Claude schreibt NIEMALS selbst Code.** Keine Edits, keine Writes, keine Inline-Fixes — auch nicht für "einfache" Änderungen. Claude orchestriert ausschließlich und delegiert alle Code-Änderungen an Subagenten. Dies gilt für jede Dateigröße, Komplexität und Dringlichkeit. Es gibt keine Ausnahmen von dieser Regel.

## Feature Tracking

- Features werden in `features/INDEX.md` getrackt
- Jedes Feature hat eine sequentielle ID: FE-1, FE-2, ...
- Feature-Specs leben in `features/FE-X-name.md`
- Jeder Skill liest INDEX.md am Start und aktualisiert es am Ende

## Bug Tracking

- Bugs werden in `bugs/INDEX.md` getrackt
- Jeder Bug hat eine sequentielle ID: BUG-1, BUG-2, ...
- Bug-Reports leben in `bugs/BUG-X-name.md`

## Git Conventions

- **Feature-Branch:** `feature/FE-X-short-name`
- **Bugfix-Branch:** `fix/BUG-X-short-name`
- **Commits:** Conventional Commits mit ID-Referenz
  - `feat(FE-X): add pull sync for pages`
  - `fix(BUG-X): handle 401 token refresh`
  - `refactor(FE-X): extract API client`
  - `test(FE-X): add sync engine unit tests`
  - `docs(FE-X): update README setup section`
- **Ein Commit pro logischer Änderung** — nicht alles in einen Commit quetschen

## Human-in-the-Loop

- Architekturentscheidungen → User fragen
- Neue Dependencies → User Approval
- Breaking Changes an der Sync-Logik → User Approval
- Löschen/Überschreiben von Dateien → User Approval
- Skill-Handoffs sind user-initiiert, nie automatisch

## Dateien lesen, nicht raten

- Immer erst bestehenden Code lesen bevor Änderungen gemacht werden
- Nie annehmen wie eine Datei aussieht — erst lesen, dann ändern
- Bei Unklarheit: fragen statt raten

## Code Quality

- `npm run lint` muss fehlerfrei sein vor jedem Commit
- `npm run build` muss erfolgreich durchlaufen
- `npm run test` muss grün sein
- TypeScript strict mode — kein `any`, keine `@ts-ignore`
