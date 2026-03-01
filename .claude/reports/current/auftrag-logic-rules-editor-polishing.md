# Auftrag: Logic Rules Editor — Polishing, Analyse & verbleibende Fixes

> **Erstellt:** 2026-03-01
> **Erstellt von:** Automation-Experte (Life-Repo)
> **Ziel-Repo:** auto-one
> **Kontext:** Der Logic Rules Editor hat 9 Fixes erhalten (2026-03-01). Grundfunktionalitaet ist gegeben — Rules werden erstellt, angezeigt, ausgefuehrt. Dieses Polishing adressiert die verbleibenden UX-Luecken und offenen Punkte aus dem Debugging-Auftrag.
> **Vorgaenger-Auftrag:** `auftrag-logic-rules-editor-debugging.md` (9 Fixes ERLEDIGT)
> **Prioritaet:** MITTEL — Grundfunktionalitaet steht, jetzt kommt UX-Qualitaet
> **Status:** VERIFIZIERT — verify-plan 2026-03-01: Schema-Mismatches entdeckt (HOCH), Anforderungen praezisiert, teilweise bereits implementiert
> **verify-plan Ergebnis:** 5 Schema-Mismatches (Frontend↔Server) blockieren Save/Load. Muessen VOR UX-Polishing gefixt werden. Details siehe neue Sektionen unten.

---

## Zusammenfassung: Was wurde bereits gefixt (2026-03-01)

Diese 9 Fixes sind erledigt und bilden die Grundlage fuer dieses Polishing:

| # | Fix | Datei |
|---|-----|-------|
| 1 | ruleToGraph() Edge-Cases (hysteresis, compound, try-catch) | RuleFlowEditor.vue |
| 2 | Execution-Info (execution_count, last_triggered) im Dropdown | LogicView.vue |
| 3 | ESP-ID Fallback bei unbekannten Devices | RuleConfigPanel.vue |
| 4 | PWM-Wert Degradation (0.5 → 0.005 bei jedem Save) | RuleFlowEditor.vue |
| 5 | Connection-Validierung — immer Logic-Node erstellen | RuleFlowEditor.vue |
| 6 | TypeScript Interfaces erweitert (execution_count, duration_seconds, has_prev) | logic.ts |
| 7 | Scroll-Bug Landing-Page | LogicView.vue |
| 8 | Compound Condition Dangling Edge | RuleFlowEditor.vue |
| 9 | Templates Content-Width 520px → 740px | LogicView.vue |

---

## Verbleibende Anforderungen

### A: Execution History Panel — REST-Integration & Type-Fixes

**[verify-plan Korrektur 2026-03-01]:** Das Panel existiert BEREITS teilweise. LogicView.vue hat ein Collapsible Panel (Zeilen ~671-708), umschaltbar via History-Button in der Toolbar. Es zeigt `logicStore.recentExecutions` — aber NUR WebSocket-Events der aktuellen Session. Die Aussage "KEINEN sichtbaren Ort" ist FALSCH.

**Was TATSAECHLICH fehlt:**
- REST-API-Integration: `logicApi.getExecutionHistory()` existiert in `api/logic.ts` (Methode vorhanden), wird aber NIRGENDS aufgerufen → historische Daten (vor Session-Start) sind unsichtbar
- **Type-Mismatch Frontend ↔ Server:** Frontend `ExecutionHistoryItem` hat `logic_rule_id` + `timestamp`, Server liefert `rule_id` + `triggered_at` → REST-Antworten werden nicht korrekt gemappt
- Panel zeigt nur WebSocket-Events (max 20 im Store), kein Paging/Scrolling fuer historische Daten

**Robins Anforderung (angepasst):**
- REST-API `GET /v1/logic/execution_history` beim Oeffnen des Panels aufrufen (historische Daten laden)
- WebSocket-Events (`logic_execution`) weiterhin fuer Live-Updates nutzen (bereits implementiert)
- Merged View: Historische + Live-Daten zusammen anzeigen, chronologisch sortiert
- Muss sich nahtlos in die bestehende dunkle UI einfuegen (Panel-Layout ist bereits vorhanden)

**Konkrete Fixes:**
- `api/logic.ts`: Feldnamen-Mapping bei `getExecutionHistory()` Response: `rule_id` → `logic_rule_id`, `triggered_at` → `timestamp`
- `logic.store.ts`: Action hinzufuegen die REST-History laedt und mit `recentExecutions` merged
- `LogicView.vue`: Beim Toggle des History-Panels REST-Daten nachladen

**Verifiziert (kein Handlungsbedarf):**
- ✅ `recentExecutions` korrekt im Store exportiert (reactive ref, max 20 Eintraege)
- ✅ Backend-Endpoint `GET /v1/logic/execution_history` existiert (logic.py:526-609), unterstuetzt Filter: rule_id, success, start_time, end_time, limit
- ✅ WebSocket-Subscription in LogicView.vue aktiv (onMounted → `logicStore.subscribeToWebSocket()`, onUnmounted → cleanup)

### B: Node CRUD Vollpruefung + Schema-Mismatches (aus Debugging-Auftrag Bug 4)

**[verify-plan Korrektur 2026-03-01]:** Playwright-Test zeigt: Node CRUD funktioniert grundsaetzlich. Palette hat 3 Kategorien (Bedingungen: 9 Typen inkl. Sensor, Time, Hysteresis etc.; Logik: AND/OR; Aktionen: Actuator, Notification, Delay). Config-Panel oeffnet korrekt mit typspezifischen Feldern. Loeschen/Duplizieren via Footer-Buttons im Config-Panel. Connection-Validierung (`logicStore.isValidConnection()`) blockiert Sensor/Time→Actuator/Notification direkt — FUNKTIONIERT.

**KRITISCH — Schema-Mismatches Frontend ↔ Server (Save bricht oder speichert falsche Daten):**

| Feld | Frontend sendet | Server erwartet | Impact |
|------|----------------|-----------------|--------|
| Time Condition Format | `start_hour: 8` (number) | `start_time: "08:00"` (HH:MM string) | Save schlaegt fehl oder ignoriert Zeitfenster |
| Days of Week | `0 = Sunday` (JS-Konvention) | `0 = Monday` (Pydantic-Schema) | Falsche Tage werden aktiviert |
| `between` Operator | In `SensorCondition.operator` Union enthalten | Pydantic Regex `^(>\|<\|>=\|<=\|==\|!=)$` schliesst `between` AUS | 422 Validation Error bei Save |
| Delay Action | Frontend hat Delay-Node in Palette | Server `ActionType` hat NUR `actuator_command` + `notification` | Save mit Delay schlaegt fehl |

**Robins Anforderung (erweitert):**
- Jeder Node-Typ (Sensor, Time, Logic, Actuator, Notification, **Delay**) muss:
  - Per Drag aus Palette erstellbar sein (**verifiziert ✅**)
  - Per Klick konfigurierbar sein (Config-Panel oeffnet mit korrekten Feldern) (**verifiziert ✅**)
  - Per Delete-Button oder Entf-Taste loeschbar sein (**verifiziert ✅ — Footer-Buttons**)
  - Korrekte Werte nach Save + Reload zeigen (**BLOCKED durch Schema-Mismatches ⚠️**)
- Connection-Validierung: Sensor/Time DARF NICHT direkt mit Actuator/Notification verbunden werden (**verifiziert ✅**)
- Visuelles Feedback fuer erlaubte/verbotene Drop-Zonen (noch offen)
- **NEU:** Schema-Mismatches zwischen `graphToRuleData()` Output und Server-Pydantic-Schemas fixen

### C: Undo/Redo UI-Buttons + History-Luecken

**Was fehlt:** `logic.store.ts` hat `pushToHistory()`, `undo()`, `redo()` (Command Pattern, max 50 Eintraege) — aber es gibt KEINE sichtbaren UI-Buttons dafuer. **Korrekt.**

**[verify-plan Ergaenzung 2026-03-01]:** `pushToHistory()` wird aktuell NUR nach `onConnect` Events aufgerufen (RuleFlowEditor.vue:315-319). Node-Hinzufuegen, -Loeschen und -Verschieben erstellen KEINEN History-Snapshot → Undo nach Node-Add/Delete ist wirkungslos.

**Robins Anforderung (erweitert):**
- Undo/Redo Buttons in der Graph-Editor Toolbar (Pfeil-Links, Pfeil-Rechts)
- Buttons korrekt enabled/disabled (Undo grau wenn History leer, Redo grau wenn kein Forward-State)
- Nach Node-Hinzufuegen, -Loeschen, -Verschieben: History-Snapshot erstellen → **`pushToHistory()` Aufrufe in `onNodeDragStop`, `addNode` (nach Drop), `removeNodes` einbauen**
- Keyboard-Shortcuts: Ctrl+Z (Undo), Ctrl+Y oder Ctrl+Shift+Z (Redo)
- Store-Funktionen `canUndo`/`canRedo` (computed) existieren bereits — direkt fuer Button-Disabling nutzbar

### D: Visuelles Feedback bei Rule-Ausfuehrung (aus Debugging-Auftrag Bug 2 — teilweise offen)

**[verify-plan Korrektur 2026-03-01]:** `RuleCard.vue` EXISTIERT (321 Zeilen) und HAT bereits:
- `isActive` Prop + `rule-card--active` CSS-Klasse mit `@keyframes rule-flash` Animation (2s Glow)
- `lastTriggeredText` Computed mit `date-fns` `formatDistanceToNow` ("vor X Min")
- `executionCount` Badge
- Flow-Badges fuer Condition/Action Zusammenfassung
- **ABER:** `RuleCard.vue` wird in `LogicView.vue` NICHT importiert! Die Rule-Liste nutzt stattdessen inline Buttons/Dropdown-Items. RuleCard ist eine verwaiste Komponente.

**Was TATSAECHLICH fehlt:**
- RuleCard.vue in LogicView.vue einbinden (Landing-Page Rule-Liste als Cards statt Buttons)
- ODER: Flash/Glow-Logik direkt in die bestehenden Dropdown-Items der LogicView integrieren
- Graph-Editor zeigt KEINE Node-Animation bei Execution (weiterhin offen)
- `activeExecutions` Map im Store funktioniert (2s Auto-Clear) — aber kein UI konsumiert sie ausser dem Dropdown LIVE-Badge

**Robins Anforderung (angepasst):**
- **Option 1 (empfohlen):** RuleCard.vue in LogicView Landing-Page einbinden — Komponente ist fertig, braucht nur Import + Daten-Binding
- **Option 2:** Flash-Logik in bestehende Dropdown-Items einbauen (weniger Aufwand, schlechtere UX)
- Graph-Editor (optional/spaeter): Nodes blinken sequenziell auf bei Execution
- Alle Daten kommen ueber WebSocket (`logic_execution` Event) — KEIN Polling (**verifiziert ✅, Store hat `activeExecutions` Map + `recentExecutions` Array**)

### E: UX-Polish & Konsistenz

**Was fehlt:** Kleine aber wichtige UX-Details die bei schnellem Debugging untergegangen sind.

**[verify-plan Status-Update 2026-03-01]:** Mehrere Punkte sind BEREITS implementiert:

**Robins Anforderung (mit Status):**
- Status-Text auf RuleCards: "Aktiv" / "Deaktiviert" neben dem Status-Dot → **Offen.** RuleCard.vue hat `title`-Attribut am Dot, aber keinen sichtbaren Text-Label. LogicView Dropdown zeigt nur farbigen Dot
- Fehlgeschlagene Executions: Roter Rand oder Error-Icon → **Offen.** `last_execution_success` ist im Interface vorhanden, wird aber visuell nicht genutzt (kein roter Rand, kein Error-Icon)
- Template-Auswahl: Content-Width Fix (740px) verifizieren → **Erledigt ✅.** Playwright-Test bestaetigt: 6 Templates sichtbar, Layout korrekt, Cards gut lesbar
- Loading-States: Skeleton-Loading oder Spinner bei API-Calls → **Teilweise erledigt ✅.** LogicView hat Loading-Spinner fuer initialen Rule-Fetch (`isLoading` State). Kein Skeleton-Loading fuer History-Panel oder Config-Panel
- Leerer Zustand: Sinnvolle Empty-State-Anzeige → **Erledigt ✅.** Playwright-Test bestaetigt: Flow-Illustration, CTA-Button, Template-Cards im Empty State sichtbar
- Terminologie: "Rule" durchgehend → **Hinweis:** UI nutzt konsequent "Regel" (deutsch) in Labels/Buttons. Das ist konsistent und korrekt fuer deutsche UI. Englisch "Rule" nur in Code/API

---

## Betroffene Dateien

**[verify-plan Korrektur 2026-03-01]:** Tabelle erweitert und praezisiert.

| Datei | Pfad | Aenderungen |
|-------|------|-------------|
| `LogicView.vue` | `views/LogicView.vue` | History-Panel REST-Integration, RuleCard-Import, UX-Polish |
| `RuleFlowEditor.vue` | `components/rules/RuleFlowEditor.vue` | Undo/Redo Buttons + Keyboard-Shortcuts, pushToHistory-Aufrufe erweitern, graphToRuleData Schema-Fixes (Time, Between, Delay) |
| `RuleConfigPanel.vue` | `components/rules/RuleConfigPanel.vue` | Config-Panel pro Node-Typ verifiziert ✅ — ggf. Time-Format-Konvertierung |
| `RuleCard.vue` | `components/rules/RuleCard.vue` | **Existiert BEREITS mit Flash-Animation** — muss in LogicView importiert werden |
| `logic.store.ts` | `shared/stores/logic.store.ts` | History-Snapshots bei Node Add/Delete/Move, REST-History-Action hinzufuegen |
| `logic.ts` (types) | `types/logic.ts` | ExecutionHistoryItem Feldnamen an Server anpassen (`rule_id`/`triggered_at`), `between` Operator pruefen |
| `api/logic.ts` | `api/logic.ts` | **NEU in Liste:** Response-Mapping fuer ExecutionHistory Feldnamen |
| `logic.py` (schemas) | `El Servador/.../schemas/logic.py` | **NEU — Backend-Fix noetig:** `between` in Operator-Regex aufnehmen, `delay` ActionType |

---

## Abgrenzung

**IN diesem Auftrag:**
- LogicView-interne UX-Verbesserungen
- Execution-History-Anzeige
- Node-CRUD-Vollpruefung
- Undo/Redo UI
- Visuelles Feedback

**NICHT in diesem Auftrag:**
- Logic Rules im Monitor-Tab anzeigen (→ `auftrag-logic-rules-live-monitoring-integration.md`)
- Logic Rules im Dashboard-Editor einbetten (→ separater Auftrag)
- ~~Backend-Aenderungen an der Logic Engine (→ Backend-Verifikation)~~ **[verify-plan Korrektur]:** Backend-Schema-Fixes (between Operator, delay ActionType, Time-Format) sind DOCH noetig — ohne sie funktioniert Save nicht korrekt. Minimale Pydantic-Schema-Anpassungen gehoeren in diesen Auftrag.
- Neue Condition-Typen oder Action-Typen (→ Feature-Erweiterung)

---

## [NEU] Schema-Mismatches Frontend ↔ Server (verify-plan Fund 2026-03-01)

> **Prioritaet:** HOCH — diese Mismatches verhindern korrektes Save/Load von Rules

Diese Diskrepanzen wurden durch Code-Vergleich von `graphToRuleData()` (RuleFlowEditor.vue), `types/logic.ts`, `api/logic.ts` gegen `El Servador/god_kaiser_server/src/schemas/logic.py` identifiziert.

### Mismatch 1: Time Condition Format

| | Frontend | Server |
|--|---------|--------|
| **Felder** | `start_hour: number`, `end_hour: number` | `start_time: str` (HH:MM), `end_time: str` (HH:MM) |
| **Quelle** | `graphToRuleData()` Zeile ~553, `TimeCondition` Interface | `schemas/logic.py` TimeCondition Pydantic Model |
| **Fix** | Frontend muss `start_hour` → `start_time: "${hour}:00"` konvertieren ODER Server akzeptiert beides |

### Mismatch 2: Days of Week Nummerierung

| | Frontend | Server |
|--|---------|--------|
| **Konvention** | `0 = Sunday, 6 = Saturday` (JavaScript Date Standard) | `0 = Monday, 6 = Sunday` (Pydantic-Schema Kommentar) |
| **Impact** | Rule die "nur Montags" laufen soll, laeuft stattdessen Sonntags |
| **Fix** | Einheitliche Konvention festlegen und Mapping einbauen |

### Mismatch 3: `between` Operator

| | Frontend | Server |
|--|---------|--------|
| **Status** | `SensorCondition.operator` Union enthaelt `'between'` | Pydantic Regex: `^(>|<|>=|<=|==|!=)$` — `between` FEHLT |
| **Impact** | User waehlt "between" in Config-Panel → 422 Validation Error beim Save |
| **Fix** | Server-Regex erweitern: `^(>|<|>=|<=|==|!=|between)$` + Backend-Logic fuer between-Auswertung pruefen |

### Mismatch 4: Delay Action Type

| | Frontend | Server |
|--|---------|--------|
| **Status** | Palette hat Delay-Node, `DelayAction` Interface mit `type: 'delay'` | `ActionType` Enum: nur `actuator_command`, `notification` — kein `delay` |
| **Impact** | Rule mit Delay-Action schlaegt beim Save fehl |
| **Fix** | Server `ActionType` um `delay` erweitern + Executor implementieren, ODER Delay-Node aus Frontend-Palette entfernen |

### Mismatch 5: Execution History Feldnamen

| | Frontend | Server |
|--|---------|--------|
| **Felder** | `logic_rule_id`, `timestamp`, `entries` | `rule_id`, `triggered_at`, `entries` |
| **Quelle** | `types/logic.ts` ExecutionHistoryItem | `schemas/logic.py` ExecutionHistoryEntry |
| **Impact** | REST-Response wird nicht korrekt in TypeScript-Interfaces gemappt |
| **Fix** | Entweder Frontend-Interfaces anpassen ODER Response-Transformer in `api/logic.ts` |

### Empfehlung

Schema-Mismatches 1-4 MUESSEN vor dem UX-Polishing gefixt werden — ohne korrekte Save/Load-Funktionalitaet sind alle UI-Verbesserungen wirkungslos. Mismatch 5 blockiert die History-Panel REST-Integration (Abschnitt A).

**Reihenfolge:** Schema-Fixes → Save/Load verifizieren → UX-Polishing (A-E)

---

## [NEU] Verifizierungs-Ergebnisse (verify-plan 2026-03-01)

> Zusammenfassung aller Pruefungen: Codebase-Analyse, Playwright-Tests, DB-Queries, Server-Schema-Vergleich

### Playwright-Tests (Frontend Live)

| Test | Ergebnis |
|------|----------|
| Login + Navigation zu Logic-View | ✅ |
| Landing-Page: Empty State mit Flow-Illustration | ✅ |
| Landing-Page: 6 Templates sichtbar (740px Width) | ✅ |
| Node-Palette: 3 Kategorien (Bedingungen, Logik, Aktionen) | ✅ |
| Config-Panel: Oeffnet mit typspezifischen Feldern | ✅ |
| Execution History Panel: Toggle-Button in Toolbar | ✅ |
| Execution History Panel: Panel oeffnet sich | ✅ (leer — keine Executions vorhanden) |
| Rule Save + Reload | ⚠️ Nicht getestet (Schema-Mismatches blockieren) |

### Datenbank-Status

| Tabelle | Eintraege |
|---------|-----------|
| `cross_esp_logic` (Rules) | 1 Rule ("Test Temperatur Rule", disabled, nie getriggert) |
| `logic_execution_history` | 0 Eintraege |

### Server-Endpoints

| Endpoint | Status |
|----------|--------|
| `GET /v1/logic/rules` | ✅ funktioniert (liefert 1 Rule mit execution_count=0) |
| `GET /v1/logic/execution_history` | ✅ funktioniert (liefert leere entries[], success_rate=null) |
| `POST /v1/logic/rules` | ⚠️ Schema-Validierung hat Mismatches (siehe oben) |
| `PUT /v1/logic/rules/{id}/toggle` | ✅ funktioniert |
| `POST /v1/logic/rules/{id}/test` | ✅ Endpoint existiert |

---

## Beziehung zu anderen Auftraegen

| Auftrag | Beziehung |
|---------|-----------|
| `auftrag-logic-rules-editor-debugging.md` | Vorgaenger — 9 Fixes bilden die Basis |
| `auftrag-logic-rules-live-monitoring-integration.md` | Nachfolger — setzt funktionierenden Editor voraus |
| `auftrag-monitor-komponentenlayout-erstanalyse.md` | Parallel — definiert wo Logic Rules im Monitor erscheinen |
| `frontend-konsolidierung/auftrag-unified-monitoring-ux.md` | Tangiert — Alert-System muss mit Execution-Events harmonieren |
