# Git Commit Plan — Merge & Push
**Erstellt:** 2026-03-02
**Branch:** master
**Status:** 7 Remote-Commits behind, 5 lokale Dateien modified, 1 untracked

---

## Situation

### Remote (7 Commits auf origin/master, lokal nicht vorhanden)
| Commit | Typ | Beschreibung |
|--------|-----|--------------|
| `8ef7624` | feat(frontend) | keep-alive view state + per-layout debounce |
| `f2ee0f5` | fix(frontend) | CSS hardcoded → design tokens in widgets |
| `9f23507` | feat(frontend) | MonitorView dashboard section → compact card |
| `a4d59c7` | feat(frontend) | LogicView rules-first layout |
| `400e710` | fix(firmware) | Wokwi diagram pin references |
| `a64448a` | docs(ci) | Wokwi testing docs + nightly schedule |
| `93bf14f` | docs(reports) | dashboard + logic UX final polish report |

### Lokale Änderungen (5 Dateien modified, 1 untracked)
| Datei | Änderung |
|-------|----------|
| `TimeRangeSelector.vue` | 12h Preset zum TimeRange-Selector hinzugefügt |
| `ActuatorCard.vue` | Toggle-Button im Monitor-Mode ausgeblendet (read-only) |
| `SensorCard.vue` | Quality-Text-Label, Sparkline-Slot, Unit-Fallback via getSensorUnit |
| `dashboard.store.ts` | sensorId/actuatorId Format `-gpio` → `:` Separator |
| `MonitorView.vue` | LiveLineChart Sparklines, CSV-Export Verbesserungen, MinMax-Timestamps, Zone-Actuator-Display, Hero-Section Erweiterung |
| `MONITOR_L2_L3_E2E_VERIFICATION.md` | Verifikations-Report (untracked) |

### Konflikt-Analyse
| Datei | Überlappung | Risiko |
|-------|-------------|--------|
| `MonitorView.vue` | Lokal: Sparklines, CSV, Stats — Remote: Dashboard-Card | Niedrig (verschiedene Sektionen) |
| `dashboard.store.ts` | Lokal: sensorId Zeile 580-648 — Remote: Debounce Zeile 372-427 | Kein Konflikt |
| Andere 3 Dateien | Nur lokal geändert | Kein Konflikt |

---

## Merge-Strategie

```
1. git stash push -m "MonitorView L2/L3 improvements"
2. git pull origin master   (Fast-Forward)
3. git stash pop            (Konflikte falls nötig lösen)
4. git add + commit (feat)
5. git add + commit (docs)
6. git push origin master
```

---

## Commit 1: feat(frontend): MonitorView L2/L3 improvements

**Was:** Sparkline-Charts in SensorCards, Quality-Labels, 12h Time-Preset,
CSV-Export Fix, Min/Max-Timestamps, ActuatorCard read-only in Monitor, sensorId-Format Fix.

**Dateien:** TimeRangeSelector.vue, ActuatorCard.vue, SensorCard.vue, dashboard.store.ts, MonitorView.vue

## Commit 2: docs(reports): add Monitor L2/L3 E2E verification report

**Was:** Verifikations-Report.

**Datei:** MONITOR_L2_L3_E2E_VERIFICATION.md

---

| # | Commit | Dateien | Typ |
|---|--------|---------|-----|
| 1 | `feat(frontend): MonitorView L2/L3 improvements` | 5 | feat |
| 2 | `docs(reports): add Monitor L2/L3 E2E verification report` | 1 | docs |
