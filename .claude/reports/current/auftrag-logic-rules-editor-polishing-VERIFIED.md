# Auftrag: Logic Rules Editor — Polishing (VERIFIZIERT + OPTIMIERT)

> **Erstellt:** 2026-03-01 (Original-Auftrag)
> **Verifiziert:** 2026-03-01 (verify-plan gegen Codebase)
> **Optimiert:** 2026-03-01 (Recherche 26 Quellen + Forschung 6 Papers eingebettet)
> **Optimiert fuer:** AutomationOne Systemkontext — Serverzentrisch
> **Erstellt von:** Automation-Experte (Life-Repo)
> **Ziel-Repo:** auto-one
> **Kontext:** Der Logic Rules Editor hat 9 Fixes erhalten (2026-03-01). Grundfunktionalitaet ist gegeben — Rules werden erstellt, angezeigt, ausgefuehrt. Dieses Polishing adressiert die verbleibenden UX-Luecken und 2 echte Schema-Mismatches.
> **Vorgaenger-Auftrag:** `auftrag-logic-rules-editor-debugging.md` (9 Fixes ERLEDIGT)
> **Prioritaet:** MITTEL (1x HOCH — Days-of-Week Mismatch blockiert korrekte Zeitregeln)
> **Status:** BEREIT ZUR AUSFUEHRUNG
>
> **KRITISCH:** Der Original-Plan identifizierte 5 Schema-Mismatches, von denen **nur 2 tatsaechlich existieren**. Die anderen 3 basierten auf einer Verwechslung zwischen API-Dokumentationsmodellen (`schemas/logic.py`) und den tatsaechlichen Validierungsmodellen (`logic_validation.py`). Details im Korrektur-Protokoll am Ende.

---

## Kernprinzip: Serverzentrisch

**El Servador ist die einzige Wahrheitsquelle.** Das bedeutet konkret:
- `logic_validation.py` und `logic_engine.py` definieren was gueltig ist — nicht `schemas/logic.py` (nur OpenAPI/Doku)
- Frontend-Interfaces passen sich an Server-Feldnamen an — NICHT umgekehrt
- Alle existierenden REST-Endpoints und WebSocket-Events werden vollstaendig verdrahtet — kein "wird noch nicht aufgerufen"
- Eigene Frontend-Validierungslogik ist verboten wenn der Server bereits validiert

**Validierungskette (relevant fuer Save):**
```
Frontend → POST /v1/logic/rules (LogicRuleCreate Dict[str, Any])
  → LogicService.create_rule()
    → LogicValidator.validate_rule()
      → validate_conditions()  aus logic_validation.py  ← MASSGEBLICH
      → validate_actions()     aus logic_validation.py  ← MASSGEBLICH
```
`schemas/logic.py` liegt NICHT im Save-Pfad. `logic_validation.py` ist die Referenz fuer erlaubte Felder und Typen.

---

## Bereits erledigte Fixes (Basis)

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

## Phase 0: Schema-Fixes (VOR UX-Polishing)

> **Prioritaet:** HOCH — ohne korrekte Save/Load-Funktionalitaet sind alle UI-Verbesserungen wirkungslos.
> **KEINE Backend-Aenderungen.** Beide Fixes sind reine Frontend-Korrekturen.

### Verifizierte Nicht-Mismatches (NICHT anfassen)

verify-plan hat drei urspruenglich behauptete Mismatches widerlegt:

| Behauptung | Realitaet |
|------------|-----------|
| Time: Frontend `start_hour` (int) vs Server `start_time` (str) | `logic_validation.py TimeWindowCondition` nutzt `start_hour: int`. Engine wertet `start_hour` aus. Kein Mismatch. |
| `between` Operator fehlt im Server | `logic_validation.py:50 Literal[..., "between"]` enthaelt between. `logic_engine.py:520-529` hat between-Handler. Kein Mismatch. |
| Delay Action fehlt im Server | `logic_validation.py:244 DelayAction` existiert. `logic_engine.py:83 DelayActionExecutor` ist aktiv. Kein Mismatch. |

### Fix 0A: Days-of-Week Nummerierung

| | Frontend (IST) | Server (SOLL) |
|--|----------------|---------------|
| **Konvention** | `0 = Sunday` (JS-Konvention) | `0 = Monday` (Python `weekday()`) |
| **Quelle** | `RuleConfigPanel.vue:100 dayLabels = ['So','Mo',...]` | `logic_engine.py weekday()` |
| **Impact** | Rule "nur Montags" laeuft stattdessen Sonntags |
| **Fix** | Option A (EMPFOHLEN): `dayLabels` auf `['Mo','Di','Mi','Do','Fr','Sa','So']` umstellen. Index 0 = Montag. Folgt ISO 8601 + Python-Konvention. |

**Entscheidung (2 Optionen):**

| Option | Beschreibung | Aufwand | Empfehlung |
|--------|-------------|---------|------------|
| A: Frontend anpassen | `dayLabels = ['Mo','Di','Mi','Do','Fr','Sa','So']` (Index 0=Montag) | Gering — 1 Zeile | **EMPFOHLEN** — folgt ISO 8601 und Python `weekday()` |
| B: Mapping einbauen | `graphToRuleData()` konvertiert JS-Index → Python-Index vor dem Senden | Mittel | Fehleranfaellig, zwei Konventionen parallel |

**Konkrete Implementierung (Option A):**
1. `RuleConfigPanel.vue:100` → `dayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']`
2. Kein Mapping noetig — Index 0=Mo, 1=Di, ..., 6=So passt direkt zu Python `weekday()`
3. `RuleFlowEditor.vue:554` — `days_of_week` wird 1:1 durchgereicht → keine Aenderung noetig
4. Bestehende Rules in DB: 1 Rule ohne Time-Condition → kein Migration-Bedarf

**Verifizierung:** Save Rule mit "Montag" → Reload → "Montag" noch ausgewaehlt

**Datei:** `components/rules/RuleConfigPanel.vue`

### Fix 0B: ExecutionHistoryItem Feldnamen

Frontend-Interface muss sich an Server-Response anpassen:

| Feld | Frontend (IST) | Server liefert (SOLL) | Status |
|------|----------------|----------------------|--------|
| Rule-Referenz | `logic_rule_id` (string) | `rule_id` (UUID) | Mismatch |
| Zeitstempel | `timestamp` (string) | `triggered_at` (datetime) | Mismatch |
| Trigger-Info | `trigger_data` (Record<string, unknown>) | `trigger_reason` (string) | Mismatch + Typ |
| Rule-Name | fehlt | `rule_name` (string) | Fehlt |
| Execution-Zeit | `execution_time_ms` (number) | `execution_time_ms` (float) | Match |
| Aktionen | `actions_executed` (Record[]) | `actions_executed` (List[Dict]) | Match |
| Erfolg | `success` (boolean) | `success` (bool) | Match |
| Fehler | `error_message?` (string) | `error_message?` (str) | Match |

**Fix — Frontend-Interface an Server anpassen (serverzentrisch):**
```typescript
export interface ExecutionHistoryItem {
  id: string
  rule_id: string          // war: logic_rule_id
  rule_name: string        // NEU: vom Server geliefert
  triggered_at: string     // war: timestamp
  trigger_reason: string   // war: trigger_data (Record) — Typ-Aenderung!
  actions_executed: Record<string, unknown>[]
  success: boolean
  error_message?: string
  execution_time_ms: number
}
```
- `types/logic.ts`: Interface exakt wie oben uebernehmen
- `api/logic.ts`: `getExecutionHistory()` Response-Typ aktualisieren — Server-Feldnamen direkt uebernehmen, KEIN manuelles Mapping
- Alle Stellen die `logic_rule_id`, `timestamp` oder `trigger_data` referenzieren: Umbenennen

**Datei:** `types/logic.ts`, `api/logic.ts`

---

## Phase 1: UX-Polishing (nach Phase 0)

---

### 1A: Execution History Panel — REST-Integration

> **UX-Kontext (aus Plattform-Recherche):**
> Fuehrende IoT-Plattformen zeigen Execution History NICHT nur als Live-Stream, sondern als **Hybrid aus historischen Daten (REST) und Live-Updates (WebSocket)**:
> - **Node-RED** zeigt max 100 Nachrichten in der Debug-Sidebar, chronologisch mit expandierbaren Details, Filter nach Node/Flow
> - **Home Assistant** speichert 5 Traces pro Automation (konfigurierbar bis 20+), navigierbar mit Pfeil-Links/Rechts zwischen Runs
> - **ThingsBoard** bietet Debug-Mode mit Nachrichten-Inspektion pro Node (15-Min-Limit)
> - **GoRules** hat Simulator mit 3-Bereiche-Layout: Events-Panel, Node-Trace, Results
>
> **Wissenschaftliche Basis:**
> Corno et al. 2019 (EUDebug, IS-EUD): Step-by-Step-Simulation hilft End-Usern signifikant beim Debugging. 15 Teilnehmer konnten nach EUDebug-Nutzung Probleme erkennen die in IFTTT-artigen Plattformen nicht entdeckbar sind. → Execution History mit expandierbaren Details (Trigger-Daten, ausgefuehrte Aktionen, Timing) ist essenziell.

**Ist-Zustand:**
- LogicView.vue hat ein Collapsible Panel (Zeilen ~671-708), toggle via History-Button in der Toolbar
- Panel zeigt `logicStore.recentExecutions` — NUR WebSocket-Events der aktuellen Session (max 20)
- `logicApi.getExecutionHistory()` existiert in `api/logic.ts` — wird NIRGENDS aufgerufen
- Historische Daten (vor Session-Start) sind deshalb unsichtbar

**Bereits korrekt (nicht anfassen):**
- `recentExecutions` korrekt im Store (reactive ref, max 20 Eintraege)
- Backend-Endpoint `GET /v1/logic/execution_history` existiert (`logic.py:526-609`), Filter: `rule_id`, `success`, `start_time`, `end_time`, `limit`
- WebSocket-Subscription in LogicView.vue aktiv (`onMounted` → `logicStore.subscribeToWebSocket()`, `onUnmounted` → cleanup)
- `logic_execution` WebSocket-Event fliesst korrekt in Store

**Was zu tun ist:**

1. **`logic.store.ts`: Action `loadExecutionHistory()` hinzufuegen:**
   - Ruft `logicApi.getExecutionHistory()` auf (mit optionalem `rule_id` Filter)
   - Merged Ergebnis mit `recentExecutions`: Chronologisch sortiert nach `triggered_at` (absteigend = neueste zuerst)
   - Duplikate deduplizieren: Gleiche `id` → WebSocket-Version behalten (aktueller)
   - Limit im Frontend: **50 Eintraege** (Kompromiss: Node-RED hat 100, HA hat 5, AutomationOne braucht ~50 fuer sinnvollen Ueberblick)

2. **`LogicView.vue`: Beim Toggle des History-Panels `loadExecutionHistory()` aufrufen:**
   - Einmaliger Load beim ersten Oeffnen (nicht bei jedem Toggle)
   - Danach live via WebSocket weiter aktualisieren
   - Loading-Spinner waehrend REST-Call (analog zu bestehendem `isLoading` Pattern)

3. **`LogicView.vue`: Panel zeigt merged View:**
   - Feldnamen nach Fix 0B korrekt: `triggered_at`, `rule_name`, `trigger_reason`
   - Jeder Eintrag expandierbar (Klick → Details: `trigger_reason`, `actions_executed`, `execution_time_ms`)
   - **Farbkodierung:** Erfolg = gruen (`success: true`), Fehler = rot (`success: false`)
   - **Rule-Name** prominent anzeigen (statt nur Rule-ID)
   - **Timing** zeigen: `execution_time_ms` als "45ms" formatiert

**Ziel-Layout (basierend auf Node-RED Debug-Sidebar + Home Assistant Trace):**
```
┌─────────────────────────────────────────────────────┐
│ Execution History                    Filter ▼  🔍    │
│─────────────────────────────────────────────────────│
│ ● 14:32:05  Temperatur-Alarm          ✅ 45ms       │
│   ▸ Trigger: sht31_temp > 30°C (aktuell: 32.1°C)   │
│   ▸ Action: fan_relay → ON (PWM 80%)                │
│─────────────────────────────────────────────────────│
│ ● 14:31:05  Temperatur-Alarm          ✅ 42ms       │
│   [eingeklappt — klick zum Expandieren]              │
│─────────────────────────────────────────────────────│
│ ○ 14:28:12  Bewaesserungs-Timer       ❌ Fehler     │
│   Error: Device ESP_ABC123 offline                   │
│─────────────────────────────────────────────────────│
│ ← Aeltere laden (REST API)                          │
└─────────────────────────────────────────────────────┘
```

**Implementierungsdetails:**
- Filter-Dropdown: "Alle Regeln" (default) | einzelne Rules nach Name
- Status-Filter: "Alle" | "Nur Erfolg" | "Nur Fehler"
- "Aeltere laden" Button am Ende der Liste → naechste Seite via REST API (`offset` Parameter)
- Neueste Eintraege oben (absteigend sortiert)

**Dateien:** `shared/stores/logic.store.ts`, `views/LogicView.vue`

---

### 1B: Undo/Redo UI-Buttons + History-Luecken schliessen

> **UX-Kontext (aus Plattform-Recherche):**
> Fuer Graph-Editoren hat sich der **Snapshot-basierte Ansatz** als Standard etabliert (React Flow Pro, GoRules, Figma):
> - Der gesamte Graph-Zustand (nodes + edges + positions) wird als Snapshot gespeichert
> - Past/Future-Stacks mit max 50 Eintraegen (React Flow Empfehlung)
> - Snapshots bei **DragStop, Add, Delete, Connect** — NICHT bei Drag-waehrend-Bewegung, Zoom oder Pan
> - Keyboard: `Ctrl+Z` (Undo), `Ctrl+Shift+Z` oder `Ctrl+Y` (Redo)
> - Vue Flow hat KEIN eingebautes Undo/Redo — muss ueber `getNodes.value`/`setNodes()` selbst implementiert werden
>
> **Warum Snapshot statt Command-Pattern:**
>
> | Aspekt | Snapshot (EMPFOHLEN) | Command-Pattern |
> |--------|---------------------|----------------|
> | Komplexitaet | Niedrig — ein Array von States | Hoch — jeder Befehl braucht execute()+undo() |
> | Zuverlaessigkeit | Sehr hoch — State immer konsistent | Fehleranfaellig bei vergessenen Umkehr-Operationen |
> | Speicher | Hoeher (redundant) | Niedriger (Deltas) |
> | Empfehlung | React Flow Pro, GoRules, Figma | Photoshop, komplexe Dokumenten-Editoren |
>
> AutomationOne's `pushToHistory()` im Store nutzt bereits den Snapshot-Ansatz (korrekt) — aber die Trigger-Events sind unvollstaendig.

**Ist-Zustand:**
- `logic.store.ts` hat `pushToHistory()`, `undo()`, `redo()` (Snapshot-Ansatz, max 50 Eintraege)
- `canUndo`/`canRedo` Computed existieren bereits
- `pushToHistory()` wird NUR nach `onConnect` Events aufgerufen (RuleFlowEditor.vue:315-319)
- Node-Hinzufuegen, -Loeschen, -Verschieben erstellen KEINEN History-Snapshot

**Was zu tun ist:**

1. **`RuleFlowEditor.vue`: `pushToHistory()` in fehlende Events einbauen:**
   - `onNodeDragStop` → Snapshot (Position geaendert)
   - `addNode` (nach Drop aus Node-Palette) → Snapshot
   - `removeNodes` → Snapshot (VOR dem Entfernen, damit Undo den Node wiederherstellt)
   - `removeEdges` → Snapshot (VOR dem Entfernen)
   - NICHT bei: `onNodeDrag` (zu viele Snapshots), Zoom/Pan (keine inhaltliche Aenderung), Selection

2. **`RuleFlowEditor.vue`: Undo/Redo-Buttons in die Graph-Editor-Toolbar:**
   - Position: Links in der Toolbar (vor den bestehenden Buttons)
   - Icons: Pfeil-Links (↶) fuer Undo, Pfeil-Rechts (↷) fuer Redo
   - `disabled` Zustand: Button ausgegraut wenn `!canUndo` / `!canRedo` (visuell erkennbar)
   - Tooltip: "Rueckgaengig (Ctrl+Z)" / "Wiederholen (Ctrl+Shift+Z)"

3. **`RuleFlowEditor.vue`: Keyboard-Shortcuts:**
   - `Ctrl+Z` / `Cmd+Z` → `logicStore.undo()`
   - `Ctrl+Y` / `Cmd+Y` ODER `Ctrl+Shift+Z` / `Cmd+Shift+Z` → `logicStore.redo()`
   - Shortcuts nur aktiv wenn Graph-Editor fokussiert (nicht global, sonst Konflikte mit Browser)
   - Implementierung via `@keydown` Event-Listener auf dem Graph-Container-Element

**Snapshot-Implementierung (fuer Referenz — Store hat bereits die Grundstruktur):**
```typescript
// Konzept: Snapshot = { nodes: Node[], edges: Edge[] }
// pushToHistory() speichert aktuellen State in Past-Stack
// undo() holt letzten Past-Eintrag, pusht aktuellen State in Future-Stack
// redo() holt letzten Future-Eintrag, pusht aktuellen State in Past-Stack
// Bei neuem pushToHistory(): Future-Stack leeren (Redo nach neuer Aktion unmoeglich)
// Max 50 Eintraege im Past-Stack (aelteste fallen raus)
```

**Dateien:** `components/rules/RuleFlowEditor.vue`

---

### 1C: RuleCard.vue in LogicView einbinden

> **UX-Kontext (aus Plattform-Recherche):**
> Alle fuehrenden IoT-Plattformen zeigen Automations-Regeln als **strukturierte Cards** (nicht als einfache Listen-Items):
> - **Home Assistant**: Card mit Name, Trigger-Beschreibung, Letzte Ausfuehrung, Toggle, Drei-Punkte-Menu
> - **Grafana**: Expandierbare Cards mit Status-Dot (gruen/orange/rot), Labels, Evaluation-Intervall
> - **GoRules**: Tabellen-Zeilen mit Name, Version, Last Modified, Status
>
> **Wissenschaftliche Basis:**
> Gonçalves et al. 2021 (Behaviour & Information Technology, 20 Teilnehmer): **Information Architecture** ist das groesste UX-Problem fuer Nicht-Programmierer bei Regel-Erstellung. 247 Problem-Instanzen zeigen: Nutzer muessen den Status und die Zusammenfassung einer Regel AUF EINEN BLICK erfassen koennen. Cards mit sichtbarem Status-Label, Trigger/Action-Zusammenfassung und Quick-Actions reduzieren die kognitive Last erheblich gegenueber Dropdown-basierten Menues.
>
> Brackenbury et al. 2019 (CHI, 153 Teilnehmer, 10 Bug-Klassen): **Action Reversal** (Regel AN aber kein AUS) und **Conflicting Actions** sind die Bug-Klassen die Nutzer am schlechtesten erkennen. → Ein Error-Indikator auf der RuleCard bei `last_execution_success === false` macht Fehler sofort sichtbar.

**Ist-Zustand:**
- `RuleCard.vue` EXISTIERT (321 Zeilen) mit: `isActive` Prop + `rule-card--active` CSS-Klasse + `@keyframes rule-flash` (2s Glow), `lastTriggeredText` Computed (`formatDistanceToNow`), `executionCount` Badge, Flow-Badges
- LogicView.vue importiert `RuleCard.vue` NICHT — Landing-Page nutzt stattdessen inline Buttons/Dropdown-Items
- `RuleCard.vue` ist eine fertige, verwaiste Komponente

**Was zu tun ist:**

1. **`LogicView.vue`: `RuleCard.vue` importieren und Landing-Page Rule-Liste auf Cards umstellen:**
   - Inline Dropdown-Buttons durch `<RuleCard>` Komponenten ersetzen
   - Vertikale Liste von Cards (analog Home Assistant Automation-Karten)

2. **Daten-Binding fuer jede RuleCard:**
   - `rule` (Object) → das Rule-Objekt aus `logicStore.rules`
   - `isSelected` (Boolean) → Highlight wenn diese Rule gerade im Editor offen ist
   - `isActive` → via `logicStore.isRuleActive(rule.id)` oder `activeExecutions` Map (2s Auto-Clear via WebSocket)
   - `executionCount` → aus Rule-Objekt (`rule.execution_count`)

3. **Events verdrahten:**
   - `@select` → Rule im Editor oeffnen (Route-Navigation oder In-View-Switch)
   - `@toggle` → Rule aktivieren/deaktivieren (PUT toggle Endpoint: `PUT /v1/logic/rules/{id}/toggle`)
   - `@delete` → Rule loeschen (DELETE Endpoint, mit Bestaetigung-Dialog)
   - WebSocket `logic_execution` Event → `activeExecutions` Map aufdatieren → loest 2s Glow auf betroffener RuleCard aus

**Ziel-Layout pro RuleCard (basierend auf Plattform-Best-Practices):**
```
┌─────────────────────────────────────────────────┐
│ ● Temperatur-Alarm                  🟢 Aktiv    │
│   Wenn: Temp > 30°C (SHT31, ESP_472204)        │
│   Dann: Luefter EIN (PWM 80%)                   │
│                                                   │
│   ⏱ Zuletzt: vor 3 Minuten  │  📊 142 Mal      │
│   ─────────────────────────────────────────────  │
│   [Toggle]  [Bearbeiten]  [⋮ Mehr]              │
└─────────────────────────────────────────────────┘
```

**Dateien:** `views/LogicView.vue`

---

### 1D: UX-Polish Details

> **UX-Kontext (aus Plattform-Recherche + Forschung):**
>
> **Status-Labels:**
> Grafana nutzt farbkodierte Status-Dots mit sichtbarem Text: Gruen (Normal), Orange (Pending), Rot (Firing), Grau (NoData/Error). Home Assistant zeigt Toggle + Drei-Punkte-Menu direkt auf jeder Card. GoRules zeigt Status als Badge in der Decision-Liste.
>
> **Error-Indikatoren:**
> Brackenbury et al. 2019 (CHI, 10 Bug-Klassen, 153 Teilnehmer) zeigt: Nutzer erkennen **Conflicting Actions** und **Action Reversal** am schlechtesten. Visuelle Error-Marker direkt an der Regel-Darstellung sind der wichtigste Hebel um Nutzer auf Probleme aufmerksam zu machen — sonst bleiben Fehler unsichtbar.
>
> **Loading-States:**
> Gonçalves et al. 2021 (247 Problem-Instanzen): "Help & Technical Problems" ist ein eigenes Problem-Thema — fehlende visuelle Rueckmeldung bei Lade-/Speicher-Vorgaengen frustriert Nutzer. Progressive Feedback (Spinner → Erfolg/Fehler → Fertig) ist Pflicht.

**Was zu tun ist:**

1. **Status-Text auf RuleCards:**
   - Sichtbares Text-Label neben Status-Dot: **"Aktiv"** (gruen) oder **"Deaktiviert"** (grau)
   - Nicht nur `title`-Attribut am Dot (aktueller Zustand) — sichtbarer Text ist essenziell
   - Bei Fehler: **"Fehler"** (rot) wenn `last_execution_success === false`

2. **Error-Styling bei fehlgeschlagenen Executions:**
   - `last_execution_success === false` → roter Rand an der RuleCard ODER rotes Error-Icon
   - Feld ist im Interface vorhanden (`logic.ts`), wird visuell aktuell nicht genutzt
   - Error-Icon (z.B. Ausrufezeichen im Kreis) mit Tooltip der `error_message` zeigt
   - Verschwindet automatisch nach naechster erfolgreicher Execution

3. **Loading-States:**
   - History-Panel: Spinner waehrend `loadExecutionHistory()` (analog zu bestehendem `isLoading` fuer Rule-Fetch)
   - Config-Panel: Spinner waehrend Save/Update (falls nicht bereits vorhanden)
   - Toggle-Button: Kurzer Spinner waehrend PUT-Request, dann Status-Update

**Was bereits korrekt ist (nicht anfassen):**
- Template-Auswahl 740px Width: Playwright-Test bestaetigt — 6 Templates sichtbar, Layout korrekt
- Empty State: Flow-Illustration + CTA-Button + Template-Cards korrekt
- Terminologie: UI nutzt konsistent "Regel" (Deutsch) — korrekt fuer deutsche UI, Englisch nur in Code/API
- Loading-Spinner fuer initialen Rule-Fetch (`isLoading` State) bereits implementiert

**Dateien:** `components/rules/RuleCard.vue`, `views/LogicView.vue`

---

## UX-Wissenskontext (fuer Implementierer)

> **Dieser Abschnitt enthaelt eingebettetes Wissen aus 26 Praxis-Quellen und 6 wissenschaftlichen Papers. Der auto-one Agent hat keinen Zugriff auf das Life-Repo — alles Relevante steht hier.**

### A. Die 10 Bug-Klassen in Trigger-Action-Systemen (Brackenbury et al. 2019, CHI)

153 Teilnehmer wurden getestet, welche Bugs sie in TAP-Regeln erkennen. Die fuer AutomationOne relevantesten Bug-Klassen:

| Bug-Klasse | Beschreibung | Erkennungsrate | AutomationOne-Relevanz |
|-----------|-------------|----------------|------------------------|
| **Action Reversal** | Regel schaltet AN aber keine Regel schaltet AUS | Sehr niedrig | Warnung bei "orphaned" Regeln |
| **Conflicting Actions** | Zwei Regeln veranlassen gegensaetzliche Aktionen | Niedrig | ConflictManager-Ergebnisse im UI zeigen |
| **Loop Dependency** | Zirkulaere Abhaengigkeit zwischen Regeln | Relativ gut | LoopDetector-Ergebnisse im UI zeigen |
| **Timing Window Error** | Zeitfenster-Bedingung wird missverstanden | Mittel | time_window Condition UX verbessern |
| **Repeated Action** | Regel feuert zu oft | Mittel | RateLimiter-Ergebnisse im UI zeigen |

**Implikation fuer diesen Auftrag:** Die RuleCard sollte bei `success: false` einen sichtbaren Error-Indikator haben. ConflictManager/LoopDetector-Warnungen sollten langfristig (nicht in diesem Auftrag) als Badge auf der RuleCard erscheinen.

### B. UX-Probleme bei Regel-Erstellung (Gonçalves et al. 2021)

20 Teilnehmer (10 Programmierer, 10 Nicht-Programmierer) erstellten Smart-Home-Regeln. 247 Problem-Instanzen ergaben 10 Problem-Themen:

| Problem-Thema | Relevanz fuer diesen Auftrag |
|--------------|-------------------------------|
| **Information Architecture** (groesstes Problem fuer Nicht-Programmierer) | RuleCard mit klarer Zusammenfassung (Wenn/Dann) statt Dropdown-Listen |
| **Time-Related Tasks** (schwierig fuer beide Gruppen) | Nicht in diesem Auftrag, aber Days-of-Week Fix 0A adressiert einen Teilaspekt |
| **Simulator & Debugging** | History-Panel (1A) adressiert das Debugging-Problem teilweise |
| **Help & Technical Problems** | Loading-States (1D) geben visuelles Feedback |

**Quantitativer Benchmark:** Nicht-Programmierer hatten ∅ 16.7 Probleme pro Session, Programmierer ∅ 8.0. AutomationOne sollte durch gutes UI-Design unter 5 Probleme pro Session anpeilen.

### C. Conflict Detection Patterns (CCDF-TAP 2024 + InteractionShield 2025)

AutomationOne hat bereits serverseitig:
- **ConflictManager** — erkennt direkte Regelkonflikte (Bug-Klasse: Conflicting Actions)
- **LoopDetector** — erkennt zirkulaere Abhaengigkeiten (Bug-Klasse: Loop Dependency)
- **RateLimiter** — verhindert zu haeufige Regelausfuehrung (Bug-Klasse: Repeated Action)

Wissenschaftlich validiert:
- CCDF-TAP (Xing et al. 2024, IEEE IoT Journal): 98.85% Accuracy bei Konflikterkennung mittels Graph Neural Networks. Validiert dass AutomationOne's regelbasierter Ansatz (ConflictManager) der richtige Weg ist — GNN-basiert waere Overkill fuer die aktuelle Groessenordnung.
- InteractionShield (Wang et al. 2025): Fuehrt **Risk Scoring** ein — Konflikte werden priorisiert statt nur erkannt. Langfristig relevant: ConflictManager koennte Severity-Level vergeben und im Frontend priorisiert anzeigen.

**Fuer diesen Auftrag:** Kein Conflict-Detection-UI noetig. Aber die Error-Indikatoren (1D) sind der erste Schritt in Richtung "Probleme sichtbar machen".

### D. Execution History Best Practices (Plattform-Vergleich)

| Plattform | Max Eintraege | Filter | Expandierbar | Live-Updates |
|-----------|--------------|--------|--------------|-------------|
| **Node-RED** | 100 (FIFO) | Node, Flow, Alle | Ja (JSON expandierbar) | Ja (Debug-Nodes) |
| **Home Assistant** | 5 pro Automation (konfigurierbar) | Nur pro Automation | Ja (5 Detail-Tabs) | Ja (Trace aktualisiert) |
| **ThingsBoard** | Unbegrenzt (Debug-Mode 15 Min) | Pro Node, Pro Chain | Ja (In/Out pro Node) | Ja (Debug-Mode) |
| **GoRules** | Unbegrenzt (Simulator) | Pro Decision | Ja (Trace pro Node) | Nein (Batch) |
| **AutomationOne (Ziel)** | 50 im Frontend (REST: mehr) | Pro Rule, Status | Ja (Trigger + Actions) | Ja (WebSocket) |

### E. Snapshot-basiertes Undo/Redo (Implementierungs-Referenz)

AutomationOne's Store hat bereits die korrekte Grundstruktur. Hier die vollstaendige Event-Matrix:

| Event | Snapshot nehmen? | Begründung |
|-------|-----------------|-----------|
| `onConnect` (neue Edge) | JA ✅ (bereits implementiert) | Strukturaenderung |
| `onNodeDragStop` | JA ✅ (FEHLT — ergaenzen) | Position geaendert |
| `addNode` (Drop aus Palette) | JA ✅ (FEHLT — ergaenzen) | Neuer Node hinzugefuegt |
| `removeNodes` | JA ✅ (FEHLT — ergaenzen) | Node geloescht (Snapshot VOR Loeschung!) |
| `removeEdges` | JA ✅ (FEHLT — ergaenzen) | Edge geloescht |
| `onNodeDrag` (waehrend Bewegung) | NEIN ❌ | Zu viele Snapshots, Performance |
| Zoom / Pan | NEIN ❌ | Keine inhaltliche Aenderung |
| Selection | NEIN ❌ | Temporaer, keine Daten-Aenderung |
| Config-Panel-Aenderungen | OPTIONAL | Erst bei Panel-Close, nicht bei jedem Keystroke |

---

## Betroffene Dateien

| Datei | Pfad | Phase | Aenderungen |
|-------|------|-------|-------------|
| `RuleConfigPanel.vue` | `components/rules/RuleConfigPanel.vue` | 0A | dayLabels Korrektur (0=Mo) |
| `logic.ts` (types) | `types/logic.ts` | 0B | ExecutionHistoryItem: `rule_id`, `triggered_at`, `rule_name` |
| `api/logic.ts` | `api/logic.ts` | 0B | getExecutionHistory() Response-Typ auf Server-Feldnamen |
| `logic.store.ts` | `shared/stores/logic.store.ts` | 1A+1B | loadExecutionHistory() Action, pushToHistory() fuer Node-Events |
| `LogicView.vue` | `views/LogicView.vue` | 1A+1C+1D | REST-History bei Toggle, RuleCard einbinden, UX-Details |
| `RuleFlowEditor.vue` | `components/rules/RuleFlowEditor.vue` | 1B | Undo/Redo Buttons + Shortcuts, pushToHistory-Aufrufe erweitern |
| `RuleCard.vue` | `components/rules/RuleCard.vue` | 1D | Status-Text, Error-Styling |

**Backend-Aenderungen: KEINE.** `logic_validation.py` unterstuetzt bereits `between`, `delay`, `start_hour` (int), alle Time-Conditions korrekt.

---

## Abgrenzung

**IN diesem Auftrag:**
- Phase 0: Days-of-Week Korrektur + ExecutionHistoryItem Feldnamen
- Phase 1: History-Panel REST-Integration, Undo/Redo UI, RuleCard einbinden, UX-Details

**NICHT in diesem Auftrag:**
- Logic Rules im Monitor-Tab anzeigen (→ `auftrag-logic-rules-live-monitoring-integration.md`)
- Logic Rules im Dashboard-Editor einbetten (→ separater Auftrag)
- Backend-Aenderungen an Logic Engine oder Schemas (nicht noetig)
- Neue Condition-Typen oder Action-Typen (→ Feature-Erweiterung)
- ConflictManager/LoopDetector-UI im Frontend (→ separater Auftrag, aber wissenschaftlich validiert durch CCDF-TAP + InteractionShield)
- Progressive Disclosure fuer Config-Panels (→ separater Auftrag)
- Test-/Simulator-Button fuer Rules (→ separater Auftrag, inspiriert durch GoRules Simulator + Chen et al. 2025 WYSIWYG)

---

## Ausfuehrungsreihenfolge

```
Phase 0A: Days-of-Week Fix              → frontend-dev (5 min)
Phase 0B: Execution History Feldnamen   → frontend-dev (15 min)
Phase 1A: REST-Integration History      → frontend-dev (30 min, ABHAENGIG von 0B)
Phase 1B: Undo/Redo UI + History-Luecken → frontend-dev (30 min, UNABHAENGIG)
Phase 1C: RuleCard einbinden            → frontend-dev (20 min, UNABHAENGIG)
Phase 1D: UX-Polish Details             → frontend-dev (15 min, nach 1C)
```

Phase 1A haengt von 0B ab (Feldnamen muessen stimmen bevor REST-Daten gerendert werden). Phasen 1B und 1C sind unabhaengig und koennen parallel zu 1A laufen.

---

## Korrektur-Protokoll (Abweichungen vom Original-Plan)

| Original-Behauptung | Korrektur | Quelle |
|---------------------|-----------|--------|
| "Server `SensorCondition.operator` Regex schliesst `between` AUS" | `logic_validation.py:50` nutzt `Literal[..., "between"]` — between ist enthalten | `logic_validation.py` Zeile 50 |
| "Server `ActionType` hat NUR `actuator_command` + `notification`" | `logic_validation.py:244` hat `DelayAction`, `validate_action()` Zeile 348 handled `delay` | `logic_validation.py` Zeile 244-267 |
| "Server `TimeCondition` erwartet `start_time: str` (HH:MM)" | `logic_validation.py:93` `TimeWindowCondition` nutzt `start_hour: int` | `logic_validation.py` Zeile 93 |
| "5 Schema-Mismatches blockieren Save/Load" | Nur 2 echte Mismatches: Days-of-Week + Execution History Feldnamen | verify-plan Codebase-Analyse |
| "Backend-Schema-Fixes noetig" | KEINE Backend-Aenderungen noetig | Validierung laeuft ueber `logic_validation.py`, nicht `schemas/logic.py` |
| "Mismatch 5 hat 2 Feldnamen" | Mismatch hat 4 Felder: `rule_id`/`logic_rule_id`, `triggered_at`/`timestamp`, `trigger_reason`/`trigger_data` (Typ!), `rule_name` fehlt | API-Endpoint `logic.py:585-597` vs `types/logic.ts:147-156` |

---

## Verifizierte Fakten (kein Handlungsbedarf)

- Node-Palette: 3 Kategorien (Bedingungen, Logik, Aktionen) — funktioniert
- Config-Panel: oeffnet korrekt mit typspezifischen Feldern — funktioniert
- Connection-Validierung: Sensor/Time → Actuator/Notification blockiert — funktioniert
- WebSocket-Subscription (`logic_execution`) aktiv in LogicView
- `activeExecutions` Map mit 2s Auto-Clear im Store
- `canUndo`/`canRedo` computed im Store vorhanden
- `between` Operator: Frontend + Backend + Engine vollstaendig implementiert
- `delay` Action: Frontend + Backend + Engine vollstaendig implementiert
- Time Condition mit `start_hour` (int): Frontend + Backend konsistent
- Backend REST-Endpoints funktionsfaehig (GET rules, GET execution_history, PUT toggle, POST test)

---

## Beziehung zu anderen Auftraegen

| Auftrag | Beziehung |
|---------|-----------|
| `auftrag-logic-rules-editor-debugging.md` | Vorgaenger — 9 Fixes bilden die Basis |
| `auftrag-logic-rules-live-monitoring-integration.md` | Nachfolger — setzt Phase 0 + 1A voraus (korrekte Execution-History-Daten) |
| `auftrag-monitor-komponentenlayout-erstanalyse.md` | Parallel — definiert wo Logic Rules im Monitor erscheinen |
| `frontend-konsolidierung/auftrag-unified-monitoring-ux.md` | Tangiert — Alert-System muss mit `logic_execution` WebSocket-Events harmonieren |

---

## Wissensbasis (Quellen)

**Praxis-Recherche (26 Quellen):**
Vollstaendige Dokumentation: `wissen/iot-automation/logic-rule-builder-ux-patterns-2026.md`
- Node-RED Debug Sidebar, Home Assistant Automation Trace, ThingsBoard Rule Chain Editor, GoRules Decision Graph + Simulator, Grafana Alerting, React Flow/Vue Flow Undo/Redo

**Wissenschaftliche Papers (6 Papers):**
Vollstaendige Zusammenfassungen: `wissen/iot-automation/20*.md`
1. Brackenbury et al. 2019 (CHI) — 10 TAP-Bug-Klassen, 153 Teilnehmer
2. Corno et al. 2019 (IS-EUD) — EUDebug: Step-by-Step TAP Debugging
3. Gonçalves et al. 2021 (B&IT) — 247 UX-Probleme in Block-basierter Smart-Home-Programmierung
4. Xing et al. 2024 (IEEE IoT) — CCDF-TAP: Conflict Detection 98.85% Accuracy
5. Wang et al. 2025 — InteractionShield: Risk Scoring fuer Regelkonflikte
6. Chen et al. 2025 — WYSIWYG Experience Prototypes fuer TAP-Validierung
