# BUG-2: Image/Attachment URLs broken, assets at wrong location, empty PDFs

## GitHub Issue
https://github.com/rotecodefraktion/bookbridge/issues/2

## Symptome
1. Bild-Links zeigen auf BookStack statt lokal (`http://localhost:6875/uploads/images/...`)
2. PDF-Attachments sind leer (0 Bytes)
3. Dateinamen doppelt: `Patch2019.pdf.pdf`
4. `_assets` im Vault-Root statt in `BookStack/_assets`
5. Attachment-Datei `7` statt `Patch2019.pdf`

## Root Causes

| Bug | Datei:Zeile | Ursache |
|-----|-------------|---------|
| Bild-URLs nicht umgeschrieben | `pull.ts:167` | `downloadImages()` Return-Value verworfen |
| Falsche Asset-Pfade | `assets.ts:107,164,185,238-250` | `syncFolder` Prefix fehlt |
| Leere PDFs | `client.ts:196` | Binary als JSON geparst |
| Doppelte Extension | `assets.ts:230-231` | `name` enthält Extension, nochmal angehängt |
| Dateiname `7` | `assets.ts:184` | `extractFilename(/attachments/7)` → `"7"` |

## Betroffene Features
- FE-2 (Pull Sync), FE-4 (Asset Download)

## Priorität
Kritisch — alle Assets beim Pull sind betroffen
