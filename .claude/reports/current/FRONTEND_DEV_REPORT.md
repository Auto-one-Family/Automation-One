# Frontend Dev Report: Sidebar-Navigation Kalibrierung und Sensor-Zeitreihen

## Modus: B (Implementierung)

## Auftrag
Zwei neue Sidebar-Links ergaenzen fuer bereits implementierte Views:
- `/calibration` (CalibrationView, requiresAdmin: true)
- `/sensor-history` (SensorHistoryView, kein Admin-Requirement)

## Codebase-Analyse

### Analysierte Dateien
- `El Frontend/src/shared/design/layout/Sidebar.vue` — Sidebar-Komponente (vollstaendig gelesen)
- `El Frontend/src/router/index.ts` — Router-Konfiguration (vollstaendig gelesen)

### Gefundene Patterns

**Navigations-Struktur:**
- Zwei Sektionen: Hauptnavigation ("Navigation") und Admin-Section ("Administration")
- Admin-Section ist in `<template v-if="authStore.isAdmin">` eingewickelt
- Jeder Link hat exakt dieselbe Struktur: `RouterLink > sidebar__link-indicator + Icon + span`
- Icons aus `lucide-vue-next`, alle als Named Imports im Script-Block

**Bestehende Links (Hauptnavigation):**
- `/hardware` → `Cpu` Icon → "Hardware"
- `/logic` → `Workflow` Icon → "Regeln"
- `/sensors` → `Activity` Icon → "Komponenten"

**Bestehende Links (Admin-Section):**
- `/system-monitor` → `Monitor` Icon → "System"
- `/users` → `Users` Icon → "Benutzer"
- `/maintenance` → `Wrench` Icon → "Wartung"

**Route-Analyse:**
- `calibration`: `meta: { requiresAdmin: true, title: 'Kalibrierung' }` → Admin-Section
- `sensor-history`: `meta: { title: 'Sensor-Zeitreihen' }` → Hauptnavigation

## Qualitaetspruefung (8-Dimensionen)

| # | Dimension | Ergebnis |
|---|-----------|----------|
| 1 | Struktur & Einbindung | Datei `shared/design/layout/Sidebar.vue` — korrekt. `@/` Alias fuer Imports bereits vorhanden. |
| 2 | Namenskonvention | Neue Icons `TrendingUp`, `SlidersHorizontal` aus lucide-vue-next — PascalCase korrekt. |
| 3 | Rueckwaertskompatibilitaet | Keine bestehenden Links geaendert. Nur neue Links hinzugefuegt. |
| 4 | Wiederverwendbarkeit | Exakt dasselbe RouterLink-Pattern wie alle anderen Links verwendet. |
| 5 | Speicher & Ressourcen | Nur zwei statische RouterLinks — kein Overhead. |
| 6 | Fehlertoleranz | RouterLink mit `isActive()` Funktion — gleiches Error-Handling wie alle anderen Links. |
| 7 | Seiteneffekte | Keine. Nur Templates erweitert, kein neuer reaktiver State. |
| 8 | Industrielles Niveau | TypeScript strict, Named Imports, Dark Theme only, kein Light Mode. |

## Cross-Layer Impact

Keine Cross-Layer-Aenderungen. Nur die Sidebar-Navigation wurde erweitert. Die Views und Routes waren bereits implementiert.

## Ergebnis

### Geaenderte Datei
`El Frontend/src/shared/design/layout/Sidebar.vue`

**Aenderungen:**
1. Icons `TrendingUp` und `SlidersHorizontal` zu lucide-vue-next Imports hinzugefuegt (Zeilen 20-21)
2. RouterLink fuer `/sensor-history` in Hauptnavigation nach `/sensors` eingefuegt (Zeilen 105-113)
   - Icon: `TrendingUp` (passt zu Zeitreihen/Charts)
   - Label: "Zeitreihen" (kurz, konsistent mit anderen Labels)
3. RouterLink fuer `/calibration` in Admin-Section nach `/maintenance` eingefuegt (Zeilen 150-158)
   - Icon: `SlidersHorizontal` (passt zu Kalibrierung/Einstellungen)
   - Label: "Kalibrierung" (klar, aus Meta title uebernommen)
   - Korrekt innerhalb `<template v-if="authStore.isAdmin">` — folgt dem requiresAdmin Pattern

## Verifikation

Build-Ergebnis: **ERFOLGREICH**
```
✓ 2358 modules transformed.
✓ built in 42.57s
```
Keine TypeScript-Fehler, keine Build-Warnings.

## Empfehlung
Kein weiterer Agent noetig. Die Sidebar-Links sind funktionsfaehig und beide Views waren bereits vollstaendig implementiert.
