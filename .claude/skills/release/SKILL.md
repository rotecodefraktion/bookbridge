---
model: sonnet
user_invocable: true
---

# /release — GitHub Release erstellen

Erstelle ein Release für BookBridge.

## Trigger
User sagt `/release` oder `/release X.Y.Z`

## Voraussetzungen
- Letzte QA muss ✅ PASS sein
- Alle geplanten Features für diese Version sind done
- `npm run build` erfolgreich
- Working Tree sauber (`git status` clean)

## Workflow

### 1. Version bestimmen
- `manifest.json` → aktuelle Version lesen
- Semantic Versioning:
  - **patch** (0.1.0 → 0.1.1): Bugfixes
  - **minor** (0.1.0 → 0.2.0): Neue Features, rückwärtskompatibel
  - **major** (0.1.0 → 1.0.0): Breaking Changes
- User bestätigt Version

### 2. Dateien aktualisieren
```bash
# manifest.json — version + minAppVersion
# package.json — version
# versions.json — neue Version → minAppVersion Mapping
```

### 3. Changelog
- `CHANGELOG.md` aktualisieren (falls vorhanden)
- Änderungen aus `features/INDEX.md` und `git log` zusammenfassen

### 4. Build + Final Check
```bash
npm run lint
npm run test
npm run build
```

### 5. Commit + Tag
```bash
git add manifest.json package.json versions.json CHANGELOG.md
git commit -m "chore: release vX.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin main --tags
```

### 6. GitHub Release
```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
  --notes "Release Notes hier" \
  main.js manifest.json styles.css
```

Obsidian Community Plugins lesen `main.js`, `manifest.json` und `styles.css` aus dem GitHub Release.

### 7. User informieren
- Release URL anzeigen
- Hinweis: Falls Community Plugin → PR an obsidian-releases Repo nötig (erstmalig)
