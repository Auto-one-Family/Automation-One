# T18-V5: Logic Engine — Layout-Vollcheck und System-Überblick (Durchlauf 1)

**Datum:** 2026-03-11  
**Typ:** Verifikation + Dokumentation (kein Feature-Bau)  
**Bezug:** ROADMAP-LOGIC-ENGINE-INTENSIV-2026-03-11, Durchlauf 1 von 5

---

## 1. Kurzfassung

Dieser Bericht dokumentiert den **Ist-Zustand** der Logic-Engine-UI und aller Anzeigeorte im Frontend. Basis: Code-Analyse (El Frontend + El Servador). Screenshots sind beim manuellen Durchklicken oder per Playwright in den Ordner `screenshots/` zu legen (siehe Abschnitt 6).

---

## 2. Layout-Erkundung Logic View (`/logic`)

### 2.1 Routen

| Route | Komponente | Beschreibung |
|-------|------------|--------------|
| `/logic` | LogicView.vue | Landing: Regelliste oder leere Ansicht + Vorlagen |
| `/logic/:ruleId` | LogicView.vue | Editor mit ausgewählter Regel (Deep-Link) |

- **Deep-Link:** Beim Öffnen von `/logic/:ruleId` wird die Regel aus den Store-Daten geladen; Breadcrumb wird mit `ruleName` gesetzt.
- **URL-Sync:** Beim Wechsel der Regel wird `router.replace({ name: 'logic-rule', params: { ruleId } })` aufgerufen; beim „Neue Regel“ wird auf `name: 'logic'` gewechselt.

### 2.2 Zustände (Landing vs. Editor)

- **Landing** (`!selectedRule && !isCreatingNew`):
  - **Mit Regeln:** Sektion „Meine Regeln (N)“ mit RuleCards, Button „Neue Regel“.
  - **Ohne Regeln:** Illustration (Bedingung → Logik → Aktion), Titel „Automatisierung“, CTA „Neue Regel erstellen“, Hinweis „Bausteine auf die Arbeitsfläche ziehen und verbinden“.
  - **Templates:** Immer darunter, einklappbar („Vorlagen & Schnellstart“), `ruleTemplates` aus `@/config/rule-templates`, Klick auf Vorlage → `useTemplate()` → Editor mit geladenem Graphen.

- **Editor** (`selectedRule || isCreatingNew`):
  - **Toolbar links:** Zurück (RouterLink `/`), Rule-Selector (Dropdown mit allen Regeln, Aktiv-Status, Execution-Count, „LIVE“ wenn aktiv), bei neuer Regel: Eingabefelder Name + Beschreibung.
  - **Toolbar rechts:** Neu, Abbrechen (nur bei neuer Regel), Speichern, Test, Toggle (Aktiv/Deaktiviert), Löschen, History, Fit View.
  - **Inhalt:** RuleNodePalette (links), RuleFlowEditor (Mitte), RuleConfigPanel (rechts, nur bei ausgewähltem Node).
  - **Execution History:** Umschaltbarer unterer Bereich (Filter: Regel, Status Erfolg/Fehler).

### 2.3 RuleCard (Landing)

- Pro Regel: Name, Status (Aktiv / Deaktiviert / Fehler), Sensor-Badge (z. B. SHT31 &lt; 40), Aktor-Badge (Befehl), „Zuletzt ausgelöst“, Toggle, Löschen.
- Klick auf Karte → `selectRule(rule.id)` → Editor mit dieser Regel.
- `RuleCard` nutzt `rule.conditions` / `rule.actions` für Badges und `last_triggered` für die Anzeige.

### 2.4 RuleFlowEditor (Canvas)

- **Vue Flow:** Nodes, Edges, Snap-to-Grid 20×20, animierte Smoothstep-Edges.
- **Node-Typen (aus RuleNodePalette):**
  - **Bedingungen:** sensor (verschiedene Presets: Temperatur, Feuchtigkeit, pH, Licht, CO2, Bodenfeuchte, EC), time (Zeitfenster).
  - **Logik:** logic (AND/OR).
  - **Aktionen:** actuator, notification, delay, plugin, diagnostics_status, run_diagnostic.
- **DnD:** Palette-Items werden auf den Canvas gezogen; `onDrop` erzeugt Node mit `type` und `defaults` aus dem Palette-Item. Edges über Vue Flow Handles (source → target).
- **Konfiguration:** Klick auf Node öffnet RuleConfigPanel mit typabhängigen Feldern (s. unten). Änderungen → `update:data` → `hasUnsavedChanges = true`.

### 2.5 RuleConfigPanel (pro Node-Typ)

| Node-Typ | Wichtige Felder |
|----------|------------------|
| **sensor** | ESP, GPIO, Sensor-Typ, Operator, Wert (ggf. min/max bei „between“) |
| **time** | Start-/Endstunde, Tage (Mo–So) |
| **logic** | AND/OR |
| **actuator** | ESP, GPIO, Befehl (ON/OFF/PWM/TOGGLE), PWM-Wert (0–100 %), **Auto-Abschaltung (Sek.)** — 0 = dauerhaft |
| **notification** | Kanal (websocket/email/webhook), Ziel, Nachricht (Template mit {value}, {sensor_type}, …) |
| **delay** | Sekunden |
| **plugin** | Plugin-Auswahl (API), dynamische Config aus Schema |

- **Max Runtime / Dauer:** Im **Rule-Editor** ist „Auto-Abschaltung (Sek.)“ nur im **Actuator-Node** vorhanden (`duration` → Backend `duration_seconds`). Das ist die **pro Regel/Aktion** definierte Laufzeit. Die **geräteweise** maximale Laufzeit heißt **max_runtime_seconds** und wird im **ActuatorConfigPanel** (Hardware-Konfiguration des Aktors) gesetzt – nicht im RuleConfigPanel.

---

## 3. Bestehende Logik (Luftbefeuchter-Regel) — Struktur

- **Editor:** Regel öffnen → Graph mit mindestens einem Sensor-Node (z. B. SHT31 &lt; 40), ggf. Logic-Node, und Actuator-Node (z. B. Olimex PWR Switch).
- **API/Struktur (allgemein):**
  - **GET** `/api/v1/logic/rules`: Liste mit Pagination, optional `enabled`.
  - **GET** `/api/v1/logic/rules/{id}`: Einzelregel.
  - **LogicRule:** `id`, `name`, `description`, `enabled`, `conditions`, `logic_operator`, `actions`, `priority`, `cooldown_seconds`, `max_executions_per_hour`, `last_triggered`, `execution_count`, `last_execution_success`, `created_at`, `updated_at`.
- **Bedingungen:** z. B. `{ type: "sensor"|"sensor_threshold", esp_id, gpio, sensor_type, operator, value }` oder `time_window`, oder `compound` mit `conditions[]`.
- **Aktionen:** z. B. `{ type: "actuator"|"actuator_command", esp_id, gpio, command, value?, duration? }`.
- **Hysterese:** Typ `hysteresis` mit `activate_above`/`deactivate_below` (oder activate_below/deactivate_above). Im **Backend** ist **HysteresisConditionEvaluator** in **main.py** in der **Default-Liste** der Condition-Evaluatoren enthalten (Zeilen 631, 650–655). Die ältere Vollanalyse („nicht in Default-Liste“) trifft damit nicht mehr zu.

---

## 4. Alle Anzeigeorte der Logic

| Ort | Komponente | Datenquelle | Inhalt |
|-----|------------|--------------|--------|
| **Route /logic** | LogicView | logicStore.rules | Landing: Regelliste (RuleCard) oder leere Ansicht + Vorlagen. Editor bei ausgewählter/neuer Regel. |
| **Monitor L1** | ActiveAutomationsSection | logicStore.enabledRules | „Aktive Automatisierungen (N)“: bis zu 5 Regeln (RuleCardCompact), sortiert nach Fehler → Priorität → Name. Link „Zum Regeln-Tab“. Klick auf Regel → `/logic/:ruleId`. |
| **Monitor L2** | ZoneRulesSection | logicStore.getRulesForZone(zoneId) | „Regeln für diese Zone (N)“: nur wenn `zoneId` gesetzt. Bis 10 Regeln voll, darüber 5 + „Weitere X Regeln — Im Regeln-Tab anzeigen“. RuleCardCompact, Klick → `/logic/:ruleId`. |
| **SensorConfigPanel** (Hardware L2) | LinkedRulesSection | logicStore.connections (Filter: sourceEspId + sourceGpio) | „Verknüpfte Regeln“: Regeln, die diesen Sensor als **Quelle** nutzen. Klick → `/logic/:ruleId`. |
| **ActuatorConfigPanel** (Hardware L2) | LinkedRulesSection | logicStore.connections (Filter: targetEspId + targetGpio) | „Verknüpfte Regeln“: Regeln, die diesen Aktor als **Ziel** nutzen. Klick → `/logic/:ruleId`. |
| **DeviceDetailPanel** (Inventory) | LinkedRulesSection | wie oben, espId + gpio aus Kontext | Gleiche Logik wie in Config-Panels. |
| **Dashboard** | — | — | **Kein** dediziertes Logic-/Regel-Widget im Dashboard-Builder. Dashboard-Store hat nur `ruleName` im Breadcrumb-Kontext. Logic erscheint im Monitor (L1/L2) und unter `/logic`. |

- **Konsistenz:** Regelliste und Regel-Details kommen überall aus dem gleichen `logicStore` (fetchRules, getRuleById, getRulesForZone, connections). LinkedRulesSection nutzt `logicStore.connections`, die aus `extractConnections(rule)` pro Regel erzeugt werden (Sensor→Aktor-Paare).

---

## 5. Was funktioniert / Was fehlt oder unklar

### 5.1 Funktioniert

- **Landing:** Listet Regeln als RuleCards, leere Ansicht mit Illustration und CTA, Vorlagen einklappbar.
- **Editor:** Rule-Selector, Neue Regel, Speichern, Test, Toggle, Löschen, History, Fit View.
- **DnD:** Node-Palette → Canvas, Edges verbinden, RuleConfigPanel bei Node-Klick, Änderungen setzen `hasUnsavedChanges`.
- **RuleCard:** Toggle und Löschen auf der Karte; Klick öffnet Editor.
- **Monitor L1:** ActiveAutomationsSection zeigt aktive Regeln, Link zum Regeln-Tab, Navigation zu `/logic/:ruleId`.
- **Monitor L2:** ZoneRulesSection zeigt Regeln für gewählte Zone, gleiche Navigation.
- **LinkedRulesSection:** In Sensor-/Aktor-Config und DeviceDetailPanel, Filter nach espId+gpio, Deep-Link zur Regel.
- **Backend:** HysteresisConditionEvaluator ist in main.py in der Standard-Liste der Condition-Evaluatoren.

### 5.2 Fehlt oder unklar (für spätere Durchläufe)

- **Screenshots:** Noch keine Screenshots im Ordner – müssen manuell oder per Playwright ergänzt werden (siehe Liste unten).
- **Hysterese-UI:** Ob und wo im RuleFlowEditor/RuleConfigPanel ein Hysteresis-Node oder -Config angeboten wird, wurde nicht im Detail geprüft (Types/Backend unterstützen `hysteresis`).
- **Max Runtime vs. Duration:** Zwei Konzepte: (1) **Rule-Action:** „Auto-Abschaltung (Sek.)“ im Actuator-Node (`duration`/`duration_seconds`) – wie lange bei dieser Regel der Aktor ein bleibt. (2) **Aktor-Hardware:** `max_runtime_seconds` im ActuatorConfigPanel – Sicherheits-Obergrenze des Geräts. Für Durchlauf 4 dokumentiert.
- **Execution History:** Wird nur aus dem Store gefüllt (loadExecutionHistory); ob REST `GET /api/v1/logic/execution_history` korrekt angebunden ist, nicht verifiziert.

---

## 6. Screenshot-Liste (vorgesehene Dateien)

Screenshots in `screenshots/` mit folgender Namenskonvention ablegen:

| Datei | Inhalt |
|-------|--------|
| `01-logic-landing.png` | Route `/logic` — initialer Zustand (mit Regeln: Regelliste; ohne: leere Ansicht) |
| `02-logic-landing-with-rules.png` | Landing mit mindestens einer RuleCard (Name, Status, Badges, Toggle) |
| `03-editor-canvas.png` | Editor geöffnet: Palette links, Canvas Mitte, eine Regel geladen |
| `04-editor-node-palette.png` | Node-Palette mit Kategorien Bedingungen / Logik / Aktionen |
| `05-editor-dnd-node.png` | Canvas mit gezogenem Node (z. B. Sensor + Actuator verbunden) |
| `06-rule-config-panel-sensor.png` | RuleConfigPanel bei ausgewähltem Sensor-Node |
| `07-rule-config-panel-actuator.png` | RuleConfigPanel bei ausgewähltem Actuator-Node (inkl. Auto-Abschaltung) |
| `08-rule-config-panel-time.png` | RuleConfigPanel bei Zeitfenster-Node |
| `09-toolbar-buttons.png` | Toolbar mit Neu, Speichern, Test, Toggle, Löschen, History |
| `10-monitor-l1-rules.png` | Monitor L1 — Sektion „Aktive Automatisierungen“ mit RuleCardCompact(s) |
| `11-monitor-l2-zone-rules.png` | Monitor L2 — Zone gewählt, „Regeln für diese Zone“ |
| `12-actuator-config-linked-rules.png` | ActuatorConfigPanel — Bereich „Verknüpfte Regeln“ (LinkedRulesSection) |
| `13-sensor-config-linked-rules.png` | SensorConfigPanel — Bereich „Verknüpfte Regeln“ |
| `14-execution-history.png` | LogicView — ausgeklappte Execution History mit Filter |

---

## 7. Referenzen (Code)

- **LogicView:** `El Frontend/src/views/LogicView.vue`
- **RuleFlowEditor:** `El Frontend/src/components/rules/RuleFlowEditor.vue`
- **RuleNodePalette:** `El Frontend/src/components/rules/RuleNodePalette.vue`
- **RuleConfigPanel:** `El Frontend/src/components/rules/RuleConfigPanel.vue`
- **RuleCard / RuleCardCompact:** `El Frontend/src/components/rules/RuleCard.vue`, `El Frontend/src/components/logic/RuleCardCompact.vue`
- **ActiveAutomationsSection / ZoneRulesSection:** `El Frontend/src/components/monitor/ActiveAutomationsSection.vue`, `ZoneRulesSection.vue`
- **LinkedRulesSection:** `El Frontend/src/components/devices/LinkedRulesSection.vue`
- **logic.store:** `El Frontend/src/shared/stores/logic.store.ts`
- **Types:** `El Frontend/src/types/logic.ts`
- **Router:** `path: 'logic'`, `path: 'logic/:ruleId'` in `El Frontend/src/router/index.ts`
- **Backend Logic:** `El Servador/god_kaiser_server/src/services/logic_engine.py`, `main.py` (Condition-Evaluators inkl. Hysteresis)

---

*Ende T18-V5 Abschlussbericht Durchlauf 1.*
