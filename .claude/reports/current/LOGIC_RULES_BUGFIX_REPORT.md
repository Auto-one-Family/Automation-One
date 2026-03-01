# Logic Rules Editor — Bug-Fix Report

> **Datum:** 2026-03-01
> **Agent:** AutoOps Debug & Fix
> **Build:** Vite Build erfolgreich (9.22s)
> **Revision:** 2 (Verifikation + 2 zusaetzliche Fixes)

---

## Zusammenfassung

7 Original-Bugs verifiziert und gefixt, 1 Scroll-Problem behoben, 2 zusaetzliche Probleme bei Verifikation entdeckt und gefixt. Alle Fixes im Frontend — kein Server-Code geaendert.

## Geaenderte Dateien

| Datei | Aenderungen |
|-------|-------------|
| `El Frontend/src/types/logic.ts` | Bug 5: `execution_count`, `last_execution_success` zu LogicRule; `duration_seconds` zu ActuatorAction; `has_prev` zu Pagination |
| `El Frontend/src/components/rules/RuleFlowEditor.vue` | Bug 4b: PWM `value * 100` bei Laden; Bug 1: hysteresis/compound Handler + try-catch; Bug 4c: Immer Logic-Node; `duration_seconds` Fallback; **NEU:** Compound dangling-ID Fix + nodeRow Positionierung |
| `El Frontend/src/components/rules/RuleConfigPanel.vue` | Bug 4a: Fallback fuer unbekannte ESP-IDs im Dropdown |
| `El Frontend/src/views/LogicView.vue` | Bug 2: `execution_count` + `last_triggered` im Dropdown; Scroll-Fix: Landing-Page scrollbar; **NEU:** Content max-width 520→740px |

---

## Bug-Details

### Bug 5 — Frontend LogicRule Type [GEFIXT + VERIFIZIERT]
- `execution_count?: number` und `last_execution_success?: boolean | null` zum Interface hinzugefuegt
- `duration_seconds?: number` als Backend-Alias zu ActuatorAction
- Pagination: `has_prev?: boolean` neben bestehendem `has_previous` (abwaertskompatibel)
- **Backend-Match:** `schemas/logic.py` L399-404 bestaetigt `execution_count` + `last_execution_success`
- **Backend-Match:** `models/logic_validation.py` L226 bestaetigt `duration_seconds`

### Bug 4b — PWM-Wert Degradation [GEFIXT + VERIFIZIERT — KRITISCH]
- **Problem:** Backend sendet `value: 0.5` (0-1 Range), `ruleToGraph()` speicherte direkt als `pwmValue: 0.5`, Slider zeigte "0.5%", `graphToRuleData()` rechnete `/100` → `0.005`. Jeder Save teilte durch 100.
- **Fix:** `ruleToGraph()` konvertiert jetzt `aa.value * 100` zu `pwmValue` (0-100 fuer Slider). `graphToRuleData()` teilt weiterhin durch 100 zurueck → Roundtrip stabil.
- **Roundtrip-Beweis:** API 0.5 → *100 → Slider 50% → /100 → API 0.5 ✓
- **Zeile:** RuleFlowEditor.vue:463

### Bug 4a — ESP-ID Aufloesung [GEFIXT + VERIFIZIERT]
- **Problem:** Config-Panel zeigte "-- ESP waehlen --" wenn die in der Rule gespeicherte `esp_id` nicht im aktuellen ESP-Store existiert (z.B. Mock-Devices neu generiert)
- **Fix:** `espDevices` computed prueft ob `localData.espId` in der Device-Liste existiert. Falls nicht: wird als `{id} (nicht gefunden)` an Position 0 eingefuegt.
- **Zeile:** RuleConfigPanel.vue:141-152

### Bug 1 — ruleToGraph() Edge-Cases [GEFIXT + VERIFIZIERT]
- **hysteresis:** Neuer Handler erstellt Sensor-Node mit `isHysteresis: true` Flag und allen Hysterese-Parametern
- **compound:** Rekursives Flattening — Sub-Conditions als individuelle Sensor-Nodes gerendert
- **try-catch:** Watch um `ruleToGraph()` abgesichert — bei Fehler: Toast + leerer Canvas statt stilles Scheitern
- **Zeilen:** RuleFlowEditor.vue:376-418 (handler), :588-613 (try-catch)

### Bug 4c — Connection-Validierung Konsistenz [GEFIXT + VERIFIZIERT]
- **Problem:** `ruleToGraph()` erstellte bei 1 Condition keinen Logic-Node (direkte Sensor→Actuator Edge), aber `isValidConnection()` blockierte genau diese manuelle Verbindung.
- **Fix:** `ruleToGraph()` erstellt JETZT IMMER einen Logic-Node, unabhaengig von der Condition-Anzahl. Graph-Struktur ist konsistent: Conditions → Logic → Actions.
- **Zeile:** RuleFlowEditor.vue:422-446

### Bug 2 — Execution-Info im Dropdown [GEFIXT + VERIFIZIERT]
- `execution_count` als "Nx" Badge im Rule-Dropdown
- `last_triggered` als relative Zeit ("vor 5m", "vor 2h", "vor 3d")
- `formatRelativeTime()` Hilfsfunktion hinzugefuegt
- CSS fuer `.rule-selector__dropdown-count` und `.rule-selector__dropdown-time`
- **Zeilen:** LogicView.vue:397-402 (template), :319-328 (formatRelativeTime), :908-921 (CSS)

### Scroll-Bug — Landing-Page [GEFIXT + VERIFIZIERT]
- **Problem:** `.rules-empty` hatte `overflow: hidden` → Wenn Templates + Rule-Liste den Viewport ueberschritten, konnte nicht gescrollt werden.
- **Fix:** `overflow-y: auto`, `align-items: flex-start` + Padding fuer Scroll-Bereich.
- **Zeile:** LogicView.vue:1107-1116

---

## Zusaetzliche Fixes (bei Verifikation entdeckt)

### Compound Condition — Dangling Edge [NEU GEFIXT]
- **Problem:** `cond-${i}` wurde fuer JEDE Condition in `conditionIds` gepusht (L345), aber Compound-Handler erstellte keinen Node fuer die Parent-ID — nur Sub-Nodes (`cond-${i}-sub-${j}`). Ergebnis: Edge `e-cond-${i}-logic-0` zeigte auf nicht existierenden Node.
- **Fix:** `conditionIds.push(id)` wird jetzt nur noch innerhalb der jeweiligen Handler ausgefuehrt (sensor, time, hysteresis). Compound pusht nur die Sub-IDs. Zusaetzlich: `nodeRow`-Counter statt `i` fuer Y-Positionierung, damit Sub-Conditions korrekt gestapelt werden.
- **Zeile:** RuleFlowEditor.vue:341-420

### Templates Content-Width Constraint [NEU GEFIXT]
- **Problem:** `.rules-empty__content` hatte `max-width: 520px`, aber die Templates-Section definierte `max-width: 720px`. Parent limitierte → Templates-Grid war zu eng fuer 3 Spalten.
- **Fix:** `max-width` auf 740px erhoeht. Templates-Grid kann jetzt bei ausreichender Breite 3 Karten pro Reihe anzeigen.
- **Zeile:** LogicView.vue:1157

---

## Nicht geaendert (bewusst)

- **Server-Code:** Kein Backend-Fix noetig — API-Responses sind korrekt
- **Undo/Redo UI:** Store-Logik existiert, UI-Buttons fehlen. Low Priority, eigener Auftrag.
- **isNodeActive():** Node-Level Flash nicht implementiert (visuelles Feedback). Medium Priority, eigener Auftrag.
- **Execution History "Alle anzeigen":** REST-Endpoint existiert, wird im UI noch nicht genutzt. Low Priority.

## Verifikation

- `npx vite build` → Erfolgreich (9.22s)
- Docker Rebuild → el-frontend + el-servador Container healthy
- Backend-Schema Match → `execution_count`, `last_execution_success`, `duration_seconds` bestaetigt
- Roundtrip PWM → API 0.5 ↔ Slider 50 stabil
- Compound Condition → Keine dangling Edges mehr
- Alle 9 Fixes (7 Original + 2 Verifikations-Fixes) im Build verifiziert
