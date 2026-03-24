# T18-V5: Logic Engine — Layout-Vollcheck und System-Überblick (Durchlauf 1)

**Datum:** 2026-03-11  
**Typ:** Verifikation + Dokumentation (kein Feature-Bau)  
**Ordner:** `auftraege/T18-V5-logic-vollcheck-2026-03-11/`

---

## 1. Layout-Erkundung Logic View (`/logic`)

### 1.1 Route und Struktur

- **Route:** `/logic` (Name: `logic`), Deep-Link zu einer Regel: `/logic/:ruleId` (Name: `logic-rule`).
- **Hauptkomponente:** `LogicView.vue` (`El Frontend/src/views/LogicView.vue`).

**Layout (laut Kommentar in LogicView):**

```
┌──────────────────────────────────────────────────────────────┐
│ Toolbar: [← Back] [Rule ▼] [Name] [Desc] ... [Actions]     │
├──────────┬───────────────────────────┬───────────────────────┤
│ Node     │                           │ Config Panel          │
│ Palette  │     Vue Flow Canvas       │ (when node selected)  │
├──────────┴───────────────────────────┴───────────────────────┤
│ Execution History (collapsible bottom panel)                  │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Landing (keine Regel ausgewählt, nicht „Neue Regel“)

- **Ohne Regeln:** Illustration (Bedingung → Logik → Aktion), Titel „Automatisierung“, CTA „Neue Regel erstellen“, Hinweis „Bausteine auf die Arbeitsfläche ziehen“. Darunter: Vorlagen (RuleTemplateCard) einklappbar.
- **Mit Regeln:** Sektion „Meine Regeln (N)“ mit RuleCards pro Regel; Button „Neue Regel“ (inkl. kompakte Variante im Header). Pro RuleCard: Name, Status (Aktiv/Deaktiviert/Fehler), Sensor-Badge, Aktor-Badge, letzte Ausführung, Toggle, Löschen; Klick auf Karte öffnet die Regel im Editor.

### 1.3 Toolbar

- **Links:** Zurück (RouterLink zu `/`), Rule-Selector (Dropdown mit allen Regeln, aktiv/inaktiv, Ausführungsanzahl, „LIVE“ wenn aktiv), bei „Neue Regel“: Eingaben für Name und Beschreibung.
- **Rechts:** Neu, Abbrechen (bei Neue Regel), Speichern (mit Pulse bei ungespeichert), Test, Toggle (Auge), Löschen, Trennlinie, Historie, Fit View.

### 1.4 Editor (Regel ausgewählt oder „Neue Regel“)

- **RuleNodePalette (links):** „Bausteine“, Suche, Kategorien:
  - **Bedingungen:** Sensor, Feuchtigkeit, pH, Licht, CO2, Bodenfeuchte, EC, Füllstand, Zeitfenster, Diagnose-Status.
  - **Logik:** UND, ODER.
  - **Aktionen:** Aktor steuern, Benachrichtigung, Verzögerung, Plugin ausführen, Diagnose starten.
- **Canvas:** Vue Flow, Snap-to-Grid 20×20, Drag & Drop von Palette auf Canvas; Verbindungen zwischen Nodes (Edges). Node-Klick öffnet RuleConfigPanel.
- **RuleConfigPanel (rechts):** Dynamisch je Node-Typ (s. unten). Buttons: Schließen, Knoten löschen, Knoten duplizieren.

### 1.5 RuleConfigPanel — Felder pro Node-Typ

| Node-Typ      | Felder (Kurz) |
|---------------|----------------|
| **sensor**    | ESP, GPIO (oder Sensor-Dropdown), Sensor-Typ, Operator (>, ≥, <, ≤, =, ≠, zwischen), Wert; bei „between“: min/max. |
| **time**      | Start-Stunde, End-Stunde, Tage (Mo–So). |
| **logic**     | Operator UND/OR. |
| **actuator**  | ESP, GPIO (oder Aktor-Dropdown), Befehl (ON, OFF, PWM, TOGGLE), bei PWM: Slider 0–100 %, **Auto-Abschaltung (Sek.)** (0 = dauerhaft). |
| **notification** | Kanal (WebSocket, E-Mail, Webhook), Ziel, Nachricht (Template mit Variablen). |
| **delay**     | Wartezeit (Sekunden). |
| **plugin**    | Plugin-Auswahl, dynamische Config aus Schema. |
| **diagnostics_status** | Check-Name, Erwarteter Status. |
| **run_diagnostic** | Check-Name (optional). |

**Hinweis Max Runtime / Duration:**  
- **Rule-Action:** Im Editor nur „Auto-Abschaltung (Sek.)“ im **RuleConfigPanel** beim Aktor-Node (`duration` → API `duration_seconds`).  
- **Aktor-Geräteconfig:** `max_runtime_seconds` lebt im ActuatorConfig (Device), nicht in der Regel. Für Durchlauf 4: klären, ob beide (Rule-Duration + Device-Max-Runtime) zusammenspielen.

### 1.6 DnD und Verhalten

- Drag aus Palette: `application/rulenode` mit `type`, `label`, `defaults`.
- Drop auf Canvas: neuer Node mit eindeutiger ID, Position projiziert, Verbindungen manuell ziehen (Handle → Handle).
- Graph-Änderungen setzen `hasUnsavedChanges`; Speichern ruft `editorRef.graphToRuleData()` auf und sendet conditions/actions/logic_operator an API (Create/Update).

---

## 2. Bestehende Logik (Luftbefeuchter-Regel)

- **Ort:** Eine von Robin angelegte Regel; Name/Bedingungen/Aktionen liegen in der laufenden Instanz (DB/API).
- **Struktur (allgemein):**  
  - **Bedingungen:** z. B. Sensor (SHT31, Feuchte &lt; X % oder Hysterese).  
  - **Aktionen:** z. B. Aktor (Olimex PWR Switch) ON/OFF, optional mit Auto-Abschaltung (duration).  
- **Hysterese:** Im Frontend-Typ `HysteresisCondition` (activate_above/deactivate_below etc.) vorhanden; **in der Node-Palette gibt es keinen „Hysterese“-Baustein.** Bestehende Hysterese-Regeln werden im Editor als Sensor-Node mit `operator: 'hysteresis'` und `isHysteresis: true` angezeigt. Beim **Speichern** schreibt `graphToRuleData()` nur `type: 'sensor'` (kein `type: 'hysteresis'`); Hysterese wird also beim Bearbeiten einer Hysterese-Regel derzeit als einfache Sensor-Bedingung zurückgespeichert — **Lücke für Durchlauf 2.**

---

## 3. Alle Anzeigeorte der Logic

| Ort | Komponente | Inhalt |
|-----|------------|--------|
| **LogicView** (`/logic`) | LogicView.vue | Landing (Regelliste/Vorlagen) + Editor (Palette, Canvas, ConfigPanel) + Execution History. |
| **Monitor L1** | ActiveAutomationsSection.vue | „Aktive Automatisierungen (N)“: nur **aktivierte** Regeln, Top 5 (Fehler zuerst, dann Priorität), Link „Alle Regeln“ → `/logic`. Nutzt RuleCardCompact. |
| **Monitor L2** | ZoneRulesSection.vue | „Regeln für diese Zone (N)“: `logicStore.getRulesForZone(zoneId)`. Bei >10 Regeln nur 5 + „Weitere X Regeln — Im Regeln-Tab anzeigen“. RuleCardCompact. |
| **SensorConfigPanel** (HardwareView L2) | LinkedRulesSection.vue | „Verlinkte Regeln“: Regeln, in denen dieser Sensor (esp_id + gpio) als **Quelle** vorkommt. Klick → `/logic/:ruleId`. |
| **ActuatorConfigPanel** (HardwareView L2) | LinkedRulesSection.vue | „Verlinkte Regeln“: Regeln, in denen dieser Aktor (esp_id + gpio) als **Ziel** vorkommt. |
| **DeviceDetailPanel** | LinkedRulesSection.vue | Ebenfalls LinkedRulesSection (Sensor/Aktor). |
| **Dashboard** | — | **Kein** dediziertes Logic-/Regel-Widget; nur ESPHealthWidget o. Ä. Logic-Zugang über Navigation (z. B. Sidebar) zu `/logic`. |

Datenquelle für „Verlinkte Regeln“: `logicStore.connections` (aus `extractConnections(rule)` pro Regel).

---

## 4. API / Backend (lesend)

- **GET** `/api/v1/logic/rules` — Liste, optional `enabled`, `page`, `page_size`.
- **GET** `/api/v1/logic/rules/{id}` — eine Regel.
- **POST** `/api/v1/logic/rules` — Erstellen; Body: name, description, enabled, conditions, logic_operator, actions, priority, cooldown_seconds, max_executions_per_hour.
- **PUT** `/api/v1/logic/rules/{id}` — Update.
- **DELETE** `/api/v1/logic/rules/{id}` — Löschen.
- **POST** `/api/v1/logic/rules/{id}/toggle` — An/Aus.
- **POST** `/api/v1/logic/rules/{id}/test` — Trockenlauf (Bedingungen prüfen, keine Aktion).
- **GET** `/api/v1/logic/execution_history` — Historie (rule_id, success, start_time, end_time, limit).

Struktur Regel (Frontend `LogicRule`): id, name, description, enabled, conditions, logic_operator, actions, priority, cooldown_seconds, max_executions_per_hour, last_triggered, execution_count, last_execution_success, created_at, updated_at. Conditions/Actions wie in `El Frontend/src/types/logic.ts` (sensor, time_window, hysteresis, compound, diagnostics_status, actuator, notification, delay, plugin, run_diagnostic).

---

## 5. Was funktioniert

- Landing listet Regeln (RuleCards), Empty State und Vorlagen klar getrennt.
- Rule-Selector, Neu, Speichern, Abbrechen, Toggle, Löschen in Toolbar.
- Editor: Palette mit allen genannten Node-Typen, DnD auf Canvas, Edges ziehen, Node-Klick öffnet RuleConfigPanel.
- RuleConfigPanel: pro Node-Typ passende Felder (ESP/GPIO, Sensor/Aktor device-aware), Auto-Abschaltung beim Aktor.
- Speichern/Update: `graphToRuleData()` → conditions/actions/logic_operator; Create/Update über logic.store.
- Test-Button: Aufruf `logicStore.testRule(ruleId)`.
- Execution History: einblendbar, Filter nach Regel und Status (Erfolg/Fehler), Lazy-Load.
- Monitor L1: ActiveAutomationsSection zeigt aktive Regeln, Link zu `/logic`.
- Monitor L2: ZoneRulesSection zeigt Zonen-Regeln, Link zu `/logic`.
- LinkedRulesSection in Sensor-/Aktor-Config: verlinkte Regeln, Deep-Link zu `/logic/:ruleId`.
- Deep-Link `/logic/:ruleId` lädt die Regel in den Editor; Breadcrumb (dashStore.breadcrumb.ruleName) gesetzt.
- WebSocket: logicStore abonniert Logic-Events; „LIVE“-Anzeige bei aktiver Ausführung.

---

## 6. Was fehlt oder unklar

- **Hysterese:** Kein Paletten-Item „Hysterese“; bestehende Hysterese-Regeln werden als Sensor-Node mit Hysterese-Daten angezeigt, aber `graphToRuleData()` schreibt nur `type: 'sensor'` zurück → Hysterese geht beim Speichern verloren. Für Durchlauf 2: HysteresisCondition in graphToRuleData berücksichtigen und/oder eigenen Hysterese-Node in der Palette.
- **HysteresisConditionEvaluator (Backend):** Laut Vollanalyse ggf. nicht in der Default-Liste der LogicEngine — im Bericht festgehalten; für Durchlauf 2 prüfen.
- **Max Runtime:** Rule-Action „Auto-Abschaltung (Sek.)“ nur im RuleConfigPanel (Aktor-Node). Ob und wie ActuatorConfig.`max_runtime_seconds` mit Rule-`duration_seconds` zusammenspielt, für Durchlauf 4 dokumentieren.
- **Screenshots:** Noch keine automatisierten Screenshots; Ordner und Liste in `screenshots/README.md` angelegt. Screenshots manuell oder per Playwright ergänzen (siehe README im Screenshot-Ordner).

---

## 7. Screenshot-Liste (geplant)

| Nr | Dateiname | Inhalt |
|----|-----------|--------|
| 01 | 01-logic-landing.png | Landing ohne Regeln (Empty State) |
| 02 | 02-logic-landing-mit-regeln.png | Landing mit Regelliste |
| 03 | 03-editor-canvas-leer.png | Editor, leeres Canvas + Palette |
| 04 | 04-editor-mit-regel.png | Editor mit geöffneter Regel (z. B. Luftbefeuchter) |
| 05 | 05-rule-card-toggle.png | RuleCard (Toggle, Status) |
| 06 | 06-rule-config-panel-sensor.png | ConfigPanel Sensor-Node |
| 07 | 07-rule-config-panel-actuator.png | ConfigPanel Aktor-Node (mit Auto-Abschaltung) |
| 08 | 08-toolbar-actions.png | Toolbar Buttons |
| 09 | 09-execution-history.png | Execution History Panel |
| 10 | 10-monitor-l1-rules.png | Monitor L1 — Aktive Automatisierungen |
| 11 | 11-monitor-l2-zone-rules.png | Monitor L2 — Regeln für diese Zone |
| 12 | 12-actuator-config-linked-rules.png | ActuatorConfigPanel — Verlinkte Regeln |
| 13 | 13-sensor-config-linked-rules.png | SensorConfigPanel — Verlinkte Regeln |

Screenshots liegen in `auftraege/T18-V5-logic-vollcheck-2026-03-11/screenshots/` (README dort für Namenskonvention und optionale Playwright-Erweiterung).

---

## 8. Referenzen (Code)

- **Views:** `El Frontend/src/views/LogicView.vue`
- **Rules:** `El Frontend/src/components/rules/RuleFlowEditor.vue`, `RuleNodePalette.vue`, `RuleConfigPanel.vue`, `RuleCard.vue`, `RuleTemplateCard.vue`
- **Monitor:** `El Frontend/src/components/monitor/ActiveAutomationsSection.vue`, `ZoneRulesSection.vue`; `RuleCardCompact.vue` unter `El Frontend/src/components/logic/RuleCardCompact.vue`
- **Config-Panels:** `El Frontend/src/components/devices/LinkedRulesSection.vue`, `SensorConfigPanel.vue`, `ActuatorConfigPanel.vue`
- **State/Types:** `El Frontend/src/shared/stores/logic.store.ts`, `El Frontend/src/types/logic.ts`, `El Frontend/src/api/logic.ts`
- **Backend:** `El Servador/god_kaiser_server/src/api/v1/logic.py`, `src/schemas/logic.py`, `src/services/logic_engine.py`

---

**Ende Bericht T18-V5 (Durchlauf 1).**
