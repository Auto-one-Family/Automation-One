# Git Commit Plan
**Erstellt:** 2026-02-26
**Branch:** master (up to date with origin/master)
**Ungepushte Commits:** 0
**Änderungen gesamt:** 8 modified, 1 untracked, 0 staged

---

## Commit 1: docs(skills): update dashboard navigation references

**Was:** Aktualisiert die Skill-Wissensdatenbanken für frontend-debug und frontend-development. Die Dashboard-Navigation wurde in einem vorherigen Commit von "Drei-Stufen-Zoom" (useZoomNavigation) auf "Zwei-Stufen-Navigation" (route-based, useSwipeNavigation) umgestellt — die Skill-Dokumentation zieht hier nach.

**Dateien:**
- `.claude/skills/frontend-debug/SKILL.md` – Referenzen ZoomNavigation → SwipeNavigation, Dashboard-Kette 3-Stufen → 2-Stufen
- `.claude/skills/frontend-development/SKILL.md` – Composable-Listing und Changelog: useZoomNavigation → useSwipeNavigation

**Befehle:**
```bash
git add .claude/skills/frontend-debug/SKILL.md .claude/skills/frontend-development/SKILL.md
git commit -m "$(cat <<'EOF'
docs(skills): update dashboard navigation references to route-based model

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Commit 2: feat(frontend): add sensor grouping helpers and normalize type labels

**Was:** Erweitert sensorDefaults.ts um ~350 Zeilen neue Funktionalität: `groupSensorsByBaseType()` löst Multi-Value-Devices (SHT31, BME280) in individuelle Wertzeilen auf, `aggregateZoneSensors()` berechnet Zonen-Durchschnitte, `formatAggregatedValue()` formatiert diese für den Header. Zusätzlich werden alle SENSOR_TYPE_CONFIG Labels gekürzt (Geräte-Suffix entfernt: "Temperatur (SHT31)" → "Temperatur"), Units normalisiert ("% RH" → "%RH"), und MULTI_VALUE_DEVICES Labels angeglichen. Package-lock.json bereinigt peer-dependency Flags.

**Dateien:**
- `El Frontend/src/utils/sensorDefaults.ts` – Neue Interfaces (RawSensor, GroupedSensor, ZoneAggregation), 3 neue Export-Funktionen, Label-Kürzungen, Unit-Normalisierung
- `El Frontend/package-lock.json` – Entfernt `"peer": true` Flags bei 15 Packages (vue, chart.js, vite, vitest, typescript u.a.)

**Befehle:**
```bash
git add "El Frontend/src/utils/sensorDefaults.ts" "El Frontend/package-lock.json"
git commit -m "$(cat <<'EOF'
feat(frontend): add sensor grouping helpers and normalize type labels

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Commit 3: feat(dashboard): overhaul DeviceMiniCard and UnassignedDropBar sensor display

**Was:** DeviceMiniCard: Sensor-Anzeige nutzt jetzt `groupSensorsByBaseType()` statt roher sensor_name-Iteration. Multi-Value-Devices (SHT31) zeigen alle Werte als separate Zeilen mit korrekten Icons. Spark-Bars komplett entfernt (Template + CSS). "Öffnen"-Button durch Drill-Down-Chevron (ChevronRight) ersetzt. Wert-Qualität wird per Textfarbe signalisiert statt per Spark-Bar. Hover-Effekt erweitert um scale(1.01). UnassignedDropBar: Badge-Text von "SIM"/"HW" auf nur "MOCK" vereinheitlicht (kein Badge für Real-Devices). Sensor/Actuator-Counts ersetzt durch kompakte Sensor-Summary ("22°C  45%RH"). Neue CSS-Klasse für Sensor-Summary-Zeile.

**Dateien:**
- `El Frontend/src/components/dashboard/DeviceMiniCard.vue` – Neue Imports (ChevronRight, Waves, Cloud, ToggleLeft, Layers, groupSensorsByBaseType, RawSensor), Sensor-Display-Logik komplett überarbeitet, Spark-Bars entfernt, Chevron-Hint statt Öffnen-Button, Quality-Coloring
- `El Frontend/src/components/dashboard/UnassignedDropBar.vue` – Badge-Text SIM→MOCK, getSensorSummary() statt getSensorCount/getActuatorCount, neue sensor-summary CSS

**Befehle:**
```bash
git add "El Frontend/src/components/dashboard/DeviceMiniCard.vue" "El Frontend/src/components/dashboard/UnassignedDropBar.vue"
git commit -m "$(cat <<'EOF'
feat(dashboard): overhaul DeviceMiniCard and UnassignedDropBar sensor display

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Commit 4: feat(dashboard): add zone aggregation, subzone chips, sorting, and collapse persistence

**Was:** ZonePlate: Zone-Header zeigt jetzt aggregierte Sensorwerte (Ø 22°C  45%RH), farbigen Status-Dot (grün/gelb/rot) statt nur Text, und Subzone-Filter-Chips bei vorhandenen Subzonen. Empty-State nutzt EmptyState-Pattern mit PackageOpen-Icon statt einfachem Text. HardwareView: Zonen werden nach Status sortiert (Offline/Error zuerst, leere zuletzt, alphabetisch innerhalb). Accordion-Collapse-State wird in localStorage persistiert. Zonen mit Offline-Devices werden beim Laden immer aufgeklappt.

**Dateien:**
- `El Frontend/src/components/dashboard/ZonePlate.vue` – Neue Imports (PackageOpen, EmptyState, aggregateZoneSensors, formatAggregatedValue, getESPStatus), Aggregation + Status-Dot + Subzone-Chips (Template + ~100 Zeilen CSS), Subzone-Filter-Logik, EmptyState für leere Zonen
- `El Frontend/src/views/HardwareView.vue` – Zone-Sortierung (D1), localStorage Collapse-Persistenz (D3), Offline-Zonen immer aufgeklappt

**Befehle:**
```bash
git add "El Frontend/src/components/dashboard/ZonePlate.vue" "El Frontend/src/views/HardwareView.vue"
git commit -m "$(cat <<'EOF'
feat(dashboard): add zone aggregation, subzone chips, sorting, and collapse persistence

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Commit 5: docs(reports): add overview tab redesign task specification

**Was:** Fügt die Auftrags-Spezifikation für das HardwareView Level-1 Redesign hinzu. Dokumentiert IST-Zustand, 7 identifizierte Probleme, 4 Implementierungs-Blöcke (A-D), SOLL-Mockups und Verifikationskriterien.

**Dateien:**
- `.claude/reports/current/auftrag_kurz.md` – Vollständige Task-Spezifikation (654 Zeilen)

**Befehle:**
```bash
git add .claude/reports/current/auftrag_kurz.md
git commit -m "$(cat <<'EOF'
docs(reports): add overview tab redesign task specification

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Abschluss

**Nach allen Commits:**
```bash
# Status prüfen
git status

# Push
git push origin master
```

**Zusammenfassung:**
| # | Commit | Dateien | Typ |
|---|--------|---------|-----|
| 1 | `docs(skills): update dashboard navigation references` | 2 | docs |
| 2 | `feat(frontend): add sensor grouping helpers and normalize type labels` | 2 | feat |
| 3 | `feat(dashboard): overhaul DeviceMiniCard and UnassignedDropBar sensor display` | 2 | feat |
| 4 | `feat(dashboard): add zone aggregation, subzone chips, sorting, and collapse persistence` | 2 | feat |
| 5 | `docs(reports): add overview tab redesign task specification` | 1 | docs |

**Hinweise:**
- **Reihenfolge beachten:** Commit 2 (sensorDefaults.ts) MUSS vor Commit 3 und 4, da DeviceMiniCard, UnassignedDropBar und ZonePlate die neuen Exports (`groupSensorsByBaseType`, `RawSensor`, `aggregateZoneSensors`, `formatAggregatedValue`) nutzen
- Commit 1 und 5 sind unabhängig und können in beliebiger Reihenfolge
- package-lock.json in Commit 2 entfernt nur `"peer": true` Flags — kein Paket hinzugefügt/entfernt
