# Auftrag L4: Logic Engine Polish

**Ziel-Repo:** auto-one (El Frontend + El Servador)
**Typ:** Frontend-UX (4 Bloecke) + Backend-Fix (1 Block)
**Prioritaet:** MEDIUM
**Datum:** 2026-03-29 (korrigiert 2026-03-30)
**Geschaetzter Aufwand:** ~2h (reduziert — 3 von 5 Aufgaben sind teilweise/komplett erledigt)
**Abhaengigkeit:** L2 (Hysterese-Haertung), L3 (Duration/MaxRuntime Labels)
**Blockiert durch:** L2, L3

---

## Auftragsziel

Die Logic Engine ist nach L2 und L3 funktional produktionsreif. Dieser Auftrag verbessert die UX fuer den Regel-Editor und das Monitoring — ohne neue Funktionen zu bauen, sondern bestehende Bausteine besser zu verknuepfen.

**5 Aufgaben, alle unabhaengig voneinander:**

| # | Block | Schicht | Aufwand | Typ | Status |
|---|-------|---------|---------|-----|--------|
| L4-BE-1 | DiagnosticsEvaluator session_factory Fix | Backend | 10min | Bug-Fix | OFFEN — Evaluator registriert, aber session_factory fehlt |
| L4-FE-1 | Sensor/Aktor-Auswahl: Zone/Subzone-Hierarchie im Rule Builder | Frontend | 1.5h | UX-Verbesserung (Paradigmen-Entscheidung noetig) | OFFEN |
| L4-FE-2 | Vorlagen fuer Klimasteuerung | Frontend | 1h | Feature-Polish (Palette-Mechanismus beachten) | OFFEN |
| L4-FE-3 | Execution History: Trigger-Kontext immer sichtbar | Frontend | 10min | Kosmetik | FAST ERLEDIGT — Funktion existiert, nur ausklappbar statt immer sichtbar |
| L4-FE-4 | Monitor L2 Regel-Status Live-Update verifizieren | Frontend | 15min | Verifikation | WAHRSCHEINLICH ERLEDIGT — WS-Handler + Store + Reaktivitaet vorhanden |

Die Bloecke koennen einzeln committed werden. Reihenfolge-Empfehlung: L4-BE-1 zuerst (schnell), dann L4-FE-4 (Verifikation), L4-FE-3 (Kosmetik), L4-FE-2, L4-FE-1 zuletzt (groesste Aenderung).

---

## System-Kontext

### Logic Engine Uebersicht (relevant fuer L4)

Die Logic Engine in El Servador wertet Cross-ESP-Regeln aus. Regeln werden im Frontend im **Rule Builder** (Vue 3, VueFlow-basierter Graph-Editor) erstellt und im **Monitor L2** (HardwareView, Zone-Detailansicht) angezeigt. Execution History wird in **LogicView.vue** (nicht MonitorView) gerendert.

**Relevante Frontend-Dateien:**

| Datei | Zeilen | Rolle |
|-------|--------|-------|
| `El Frontend/src/components/rules/RuleFlowEditor.vue` | ~1968 | Haupteditor — Graph, Save, Load |
| `El Frontend/src/components/rules/RuleConfigPanel.vue` | ~1199 | Node-Konfiguration (rechte Sidebar) |
| `El Frontend/src/components/rules/RuleNodePalette.vue` | 558 | Drag-Palette links |
| `El Frontend/src/types/logic.ts` | 349 | TypeScript-Typen fuer Conditions/Actions |
| `El Frontend/src/shared/stores/logic.store.ts` | 710 | Pinia Store: Regeln + Execution History |
| `El Frontend/src/api/logic.ts` | 169 | API Client |
| `El Frontend/src/views/LogicView.vue` | — | Logic-Uebersicht + Execution History (Zeilen 842-883) |
| `El Frontend/src/views/MonitorView.vue` | ~3490 | Monitor L1/L2 (Zone-Tiles, L2 Detail) |
| `El Frontend/src/composables/useSensorOptions.ts` | — | Sensor-Optionen mit Zone/Subzone-Gruppierung |

**Relevante Backend-Dateien:**

| Datei | Zeilen | Rolle |
|-------|--------|-------|
| `El Servador/.../services/logic_service.py` | 499 | CRUD, Rule-Test (`/logic/rules/{id}/test`) |
| `El Servador/.../services/logic/conditions/diagnostics_evaluator.py` | 103 | Diagnose-Condition |

**Relevante DB-Tabellen:**

| Tabelle | Felder (relevant) |
|---------|--------------------|
| `cross_esp_logic` | id, rule_name, trigger_conditions (JSON), actions (JSON) |
| `logic_execution_history` | rule_id, trigger_data (JSON), actions_executed (JSON), success, error_message, created_at |

**WebSocket-Event:** `logic_execution` wird nach jeder Regel-Ausfuehrung gebroadcasted (in `logic_engine.py` via `WebSocket broadcast: logic_execution`). Das Event traegt `rule_id`, `success`, `timestamp` und optional Trigger-Kontext. Der Frontend-Handler in `logic.store.ts:437-485` ist **vollstaendig implementiert** — empfaengt Events, aktualisiert recentExecutions, merged in executionHistory, markiert activeExecutions, aktualisiert last_triggered/execution_count.

---

## Block L4-BE-1: DiagnosticsEvaluator session_factory Fix

**Aufwand:** 10 Minuten
**Datei:** `El Servador/god_kaiser_server/src/services/logic_service.py`

### Problem

Die Logic Engine hat **3 Stellen** wo Condition-Evaluatoren registriert werden:
1. `main.py:629-656` — Produktiv (Server-Start)
2. `logic_engine.py:73-84` — Fallback (wenn Engine ohne explizite Evaluatoren aufgerufen wird)
3. `logic_service.py:68-78` — Rule-Test (fuer `POST /logic/rules/{id}/test`)

`DiagnosticsConditionEvaluator` **IST registriert** in `logic_service.py:73` — aber **ohne `session_factory` Parameter**. Der Evaluator warnt bei fehlendem session_factory (Zeile 76-78 im Evaluator: `"no session factory configured"` → `return None`). Konsequenz: Rule-Tests mit `diagnostics_status`-Conditions werden still als `None` (falsy) ausgewertet.

In `main.py:641-642` wird der Evaluator korrekt mit `session_factory=get_session` instanziert. Die `logic_service.py`-Instanzierung fehlt dieser Parameter.

### IST-Zustand

```python
# logic_service.py:73 (vereinfacht)
diagnostics_eval = DiagnosticsConditionEvaluator()  # FEHLT: session_factory
compound_eval = CompoundConditionEvaluator([...])    # vorhanden
```

### SOLL-Zustand

```python
diagnostics_eval = DiagnosticsConditionEvaluator(session_factory=session_factory)
compound_eval = CompoundConditionEvaluator([...inkl. diagnostics_eval...])
```

**Vorbedingung pruefen:** Ist `session_factory` in `LogicService.__init__` verfuegbar? LogicService erhaelt ein `logic_repo` (Repository) aber keine explizite `session_factory`. Moegliche Loesungen:
1. `session_factory` als zusaetzlichen Parameter an LogicService uebergeben (analog zu main.py)
2. Aus dem Repository die Session-Factory ableiten (falls `logic_repo.session` als Factory-Ersatz nutzbar ist)
3. Direkt `get_session` importieren (falls im Modul erreichbar)

Option 1 ist die sauberste Loesung. Pruefen wie `main.py` den LogicService instanziert und ob dort `session_factory` bereits verfuegbar ist.

### Akzeptanzkriterien L4-BE-1

- [ ] `DiagnosticsConditionEvaluator` in `logic_service.py` erhaelt `session_factory` Parameter
- [ ] `CompoundConditionEvaluator` in `logic_service.py` erhaelt DiagnosticsEval als Sub-Evaluator (pruefen ob bereits der Fall)
- [ ] `POST /logic/rules/{id}/test` fuer eine Regel mit `diagnostics_status`-Condition gibt korrektes Ergebnis (kein stiller None-Return mehr)
- [ ] Keine bestehenden Tests brechen

---

## Block L4-FE-1: Sensor/Aktor-Auswahl mit Zone/Subzone-Hierarchie im Rule Builder

**Aufwand:** ~1.5h
**Dateien:** `RuleConfigPanel.vue`, `useSensorOptions.ts` (lesen), `RuleFlowEditor.vue` (ggf.)

### Problem

Im Rule Builder (RuleConfigPanel) waehlt der User beim Erstellen einer Sensor-Condition den Sensor. Die aktuelle Auswahl ist zwar 2-stufig (ESP-Dropdown → geraetespezifisches Sensor-Dropdown), zeigt aber keinen Zone/Subzone-Kontext. Bei vielen ESPs und Sensoren fehlt der Zusammenhang: In welcher Zone liegt dieser Sensor?

### IST-Zustand (KORRIGIERT)

Die Sensor-Auswahl im RuleConfigPanel ist **bereits 2-stufig:**
1. **ESP-Dropdown:** Auswahl des ESP-Geraets
2. **Sensor-Dropdown:** Nur Sensoren des gewaehlten ESP, Format: `SHT31 Temperatur (GPIO 0)`

Die eigene `availableSensors` Computed Property (`RuleConfigPanel.vue:196-207`) berechnet die Sensor-Liste basierend auf dem gewaehlten ESP. **Kein `useSensorOptions` Composable** in Verwendung — eigene Logik.

Aktor-Auswahl: Analog ESP-first, dann Aktoren des gewaehlten ESP.

### Paradigmen-Entscheidung (VOR Implementierung)

Es gibt einen **Paradigmen-Konflikt** zwischen zwei Auswahl-Mustern:

| Muster | Ablauf | Vorteil | Nachteil |
|--------|--------|---------|----------|
| **ESP-first (aktuell)** | ESP → Sensoren des ESP | Direkte Geraete-Zuordnung, klar fuer Hardware-Regeln | Kein Zone-Kontext sichtbar |
| **Zone-first (useSensorOptions)** | Zone → Subzone → Sensor (ESP aufgeloest) | Logischer Kontext, konsistent mit Dashboard-Widgets | Bricht bestehendes Interaktionsmuster, ESP-Bezug geht verloren |
| **Hybrid** | ESP-first beibehalten, aber Zone-Label am Sensor anzeigen | Minimale Aenderung, Zone-Kontext vorhanden | Kein Gruppierungsgewinn |

**Empfehlung:** Hybrid-Ansatz — bestehendes ESP-first-Pattern beibehalten, aber im Sensor-Dropdown das Zone-Label als Kontext-Info ergaenzen (z.B. `SHT31 Temperatur (GPIO 0) — Zelt Wohnzimmer`). Das bricht kein bestehendes Muster und liefert den gewuenschten Kontext.

Falls Zone-first gewuenscht: Das erfordert einen UX-Paradigmenwechsel — die ESP-Vorauswahl wuerde entfallen und durch Zone-Auswahl ersetzt. Die `save/load`-Logik (graphToRuleData/ruleToGraph) muesste das 3-teilige `sensorId` Format (`espId:gpio:sensorType`) in die separaten Felder (`esp_id`, `gpio`, `sensor_type`) konvertieren. useSensorOptions kann per `filterZoneId` auf eine Zone eingeschraenkt werden.

### SOLL-Zustand (Hybrid-Variante)

Sensor-Dropdown: Bestehendes ESP-first-Muster beibehalten. Im Sensor-Label die Zone ergaenzen (aus ESP → Zone-Zuordnung im Store).

**Alternativ** (falls Zone-first entschieden wird): `useSensorOptions` Composable importieren, `groupedSensorOptions` mit `<optgroup>` rendern, ESP-Dropdown entfernen, sensorId-Parsing fuer save/load ergaenzen.

**Aktor-Auswahl:** Analog — Zone-Label ergaenzen oder auf Zone-first umbauen.

**Was NICHT geaendert wird:**
- Die interne Datenstruktur der Logic-Conditions (`esp_id`, `gpio`, `sensor_type` als separate Felder) bleibt unveraendert
- Die Save/Load-Logik in `graphToRuleData()` / `ruleToGraph()` bleibt unveraendert (bei Hybrid)
- Der Graph selbst (VueFlow Nodes) bleibt unveraendert

### Akzeptanzkriterien L4-FE-1

- [ ] Paradigmen-Entscheidung (Hybrid vs. Zone-first) getroffen und dokumentiert
- [ ] Sensor-Dropdown zeigt Zone-Kontext (entweder als Label oder als Optgroup)
- [ ] Aktor-Dropdown zeigt Zone-Kontext
- [ ] Bestehende Regeln laden weiterhin korrekt (save/load Roundtrip unveraendert)
- [ ] Kein TypeScript-Compilerfehler (vue-tsc clean)

---

## Block L4-FE-2: Klimasteuerungs-Vorlagen

**Aufwand:** ~1h (erhoet wegen Palette-Mechanismus)
**Datei:** `RuleNodePalette.vue` (primaer), ggf. `RuleFlowEditor.vue`

### Hintergrund

Der Rule Builder bietet eine Drag-Palette (`RuleNodePalette.vue`) von der Nodes in den Graph gezogen werden. Vorlagen sind vorkonfigurierte Regelstrukturen die dem User einen Startpunkt geben.

Die Deep Dive Analyse hat bestaetigt dass zwei Betriebsmodi der Hysterese-Engine produktionsreif sind:

**Heating-Modus (Befeuchtung):** `activate_below` + `deactivate_above`
- Typisches Beispiel: Luftfeuchte unter 45% → Befeuchter AN; ueber 55% → AUS
- Deadband verhindert Flattern: Im Bereich 45-55% keine Aenderung

**Cooling-Modus (Kuehlung):** `activate_above` + `deactivate_below`
- Typisches Beispiel: Temperatur ueber 28°C → Luefter AN; unter 24°C → AUS
- Deadband: 24-28°C keine Aenderung

### Technische Einschraenkung: Palette-Mechanismus

**WICHTIG:** Die Palette (`RuleNodePalette.vue`) arbeitet mit **einzelnen Nodes** — der `onDragStart`-Handler uebertraegt genau einen Node-Typ. Es gibt **keinen Mechanismus** um vorkonfigurierte Multi-Node-Graphen (Condition + Action zusammen) aus der Palette zu draggen.

Zusaetzlich: Im RuleConfigPanel wird Hysterese **NICHT** als eigener Node-Typ realisiert, sondern als `operator: 'hysteresis'` **innerhalb eines Sensor-Nodes**. Die Palette hat keinen separaten `hysteresis`-Node-Typ. Die HysteresisCondition-Felder (activate_above/below, deactivate_above/below) sind im RuleConfigPanel bereits implementiert (Zeilen 408-460) und werden bei `operator: 'hysteresis'` eingeblendet.

### IST-Zustand

Pruefen: Was ist bereits vorhanden in `RuleNodePalette.vue` (558 Zeilen)?
1. Gibt es bereits Template-Eintraege in der Palette?
2. Welches Format haben bestehende Templates (JSON-Struktur)?
3. Gibt es einen "Vorlagen"-Bereich oder Tab?

### SOLL-Zustand

Zwei Implementierungs-Optionen:

**Option A: Einzelne Sensor-Nodes mit Hysterese-Preset (einfacher)**
Templates als **vorkonfigurierte Sensor-Nodes** mit `operator: 'hysteresis'` und vorausgefuellten Schwellwerten. Der User drag-t einen Sensor-Node, der bereits Hysterese-Operator + Schwellwerte hat. Der User muss nur noch ESP/Sensor auswaehlen und eine Actuator-Action-Node manuell hinzufuegen.

Template-Daten (intern im onDragStart-Payload):
```json
{
  "nodeType": "sensor",
  "preset": "humidity_hysteresis",
  "label": "Befeuchtung (Hysterese)",
  "defaults": {
    "operator": "hysteresis",
    "sensor_type": "sht31_humidity",
    "activate_below": 45,
    "deactivate_above": 55
  }
}
```

```json
{
  "nodeType": "sensor",
  "preset": "cooling_hysteresis",
  "label": "Kuehlung (Hysterese)",
  "defaults": {
    "operator": "hysteresis",
    "sensor_type": "sht31_temp",
    "activate_above": 28,
    "deactivate_below": 24
  }
}
```

**Option B: Multi-Node-Template (komplexer)**
Klick auf Template erzeugt sowohl Sensor-Condition als auch Actuator-Action im Graph. Erfordert neuen Mechanismus: Statt einzelnem Node-Drag ein "Klick → 2 Nodes + Edge erzeugen" Pattern in `RuleFlowEditor.vue`. Aufwand deutlich hoeher (~2h extra).

**Empfehlung:** Option A — ein Template ist im Kern ein vorkonfigurierter Sensor-Node. In der Palette als separaten "Vorlagen"-Bereich darstellen (visuell abgesetzt, z.B. mit Trennlinie und Label "Klimasteuerung"). Tooltip oder Description erklaert was die Vorlage tut.

**Was NICHT geaendert wird:**
- Das Backend-Datenmodell fuer Regeln bleibt unveraendert
- Templates sind rein Frontend-seitig (keine API-Calls)
- Bestehende Custom-Nodes in der Palette bleiben unveraendert
- Der Drag-Mechanismus selbst bleibt unveraendert (ein Node pro Drag)

### Akzeptanzkriterien L4-FE-2

- [ ] Template "Befeuchtung (Hysterese)" in der Palette verfuegbar
- [ ] Template "Kuehlung (Hysterese)" in der Palette verfuegbar
- [ ] Drag auf Template erzeugt vorkonfigurierte Sensor-Node im Graph mit `operator: 'hysteresis'`
- [ ] Vorausgefuellte Schwellwerte sind korrekt (activate_below=45, deactivate_above=55 fuer Befeuchtung; activate_above=28, deactivate_below=24 fuer Kuehlung)
- [ ] `esp_id` und `gpio` im Template bleiben leer (nicht vorausgefuellt — User muss Sensor waehlen)
- [ ] Kein TypeScript-Compilerfehler

---

## Block L4-FE-3: Execution History Trigger-Kontext immer sichtbar machen

**Aufwand:** ~10min (Kosmetik — Grundfunktion bereits vorhanden)
**Datei:** `El Frontend/src/views/LogicView.vue` (Zeilen 842-883)

### IST-Zustand (KORRIGIERT — Funktion existiert bereits)

Die Execution History in `LogicView.vue:863-877` zeigt **bereits:**
- **trigger_reason** (Zeile 866) — String aus `trigger_data` (aufbereitet im Backend: `logic.py:596-599`)
- **actions_executed** mit `formatActionSummary()` (Zeile 870-871) — menschenlesbare Zusammenfassung
- **error_message** (Zeile 875) — bei Fehlschlag

Diese Informationen sind als **ausklappbares Detail** implementiert (`v-if="expandedHistoryId === exec.id"` — click-to-expand).

### SOLL-Zustand

Entscheidung: Soll der Trigger-Kontext **immer sichtbar** sein (statt ausklappbar)?

**Falls ja:** Den `v-if="expandedHistoryId === exec.id"` Guard entfernen oder durch `v-show` ersetzen. Die Daten sind kurz genug (1-2 Zeilen) um immer angezeigt zu werden. Alternativ: Kompakter Einzeiler unter dem Haupteintrag, expandable Detail nur fuer ausfuehrlichere Informationen.

**Falls nein:** L4-FE-3 ist **bereits erledigt** — keine Aenderung noetig.

**Visuelles Design (falls Aenderung gewuenscht):**
- Kompakter Zusatz unter dem Haupteintrag (kleiner Text, gedaempfte Farbe)
- Trigger-Wert mit Einheit: `SENSOR_TYPE_CONFIG[sensorType]?.unit` aus `sensorDefaults.ts`
- Graceful Degradation: Wenn `trigger_data` oder `actions_executed` leer → Zeile nicht anzeigen

**Was NICHT geaendert wird:**
- Backend-API und DB-Schema (Daten sind bereits vorhanden und werden bereits geliefert)
- Die Haupt-History-Liste und ihre Struktur
- Pagination/Filterung der History
- Der Rendering-Ort bleibt LogicView.vue (NICHT MonitorView)

### Akzeptanzkriterien L4-FE-3

- [ ] Trigger-Kontext (Sensor-Wert + Aktor-Befehl) ist ohne Klick sichtbar (falls Aenderung gewuenscht)
- [ ] Einheit des Sensor-Werts korrekt aus `SENSOR_TYPE_CONFIG` (z.B. "%" fuer Humidity, "°C" fuer Temperatur)
- [ ] Fehlende `trigger_data` / `actions_executed` fuehren zu keinem Anzeigefehler (graceful)
- [ ] Kein TypeScript-Compilerfehler

---

## Block L4-FE-4: Monitor L2 Regel-Status Live-Update verifizieren

**Aufwand:** ~15min (reine Verifikation — Implementierung wahrscheinlich vollstaendig)
**Typ:** IST-Analyse + Verifikation

### IST-Zustand (KORRIGIERT — Implementierung vorhanden)

Basierend auf der Analyse ist die gesamte Pipeline **bereits implementiert:**

1. **WebSocket-Event-Handler:** `logic.store.ts:437-485` empfaengt `logic_execution` Events
2. **Store-Update:** Handler aktualisiert `recentExecutions`, merged in `executionHistory`, markiert `activeExecutions` fuer visuelles Feedback, aktualisiert `last_triggered` + `execution_count` am Rule-Objekt
3. **MonitorView L2:** Nutzt `logicStore.isRuleActive` reaktiv (Pinia computed)
4. **Verbindung:** Event → Store-Mutation → Pinia-Reaktivitaet → Template-Update — die gesamte Kette ist vorhanden

**Szenario A (Idealfall) ist wahrscheinlich.** Die Aufgabe reduziert sich auf Verifikation auf dem Live-System.

### Verifikations-Schritte

1. Im Browser Console-Log pruefen ob `logic_execution` Events ankommen (WebSocket-Debug)
2. Eine Regel manuell triggern (z.B. per Rule-Test API oder echten Sensor-Wert)
3. Im Monitor L2 pruefen ob sich der Regel-Status ohne Page-Reload aktualisiert
4. Falls es nicht funktioniert: Die 4 Stellen der Pipeline einzeln pruefen (Event → Handler → Store → Template)

**Was NICHT geaendert wird:**
- Das WebSocket-Protokoll und die Backend-Payload-Struktur
- Die grundlegende Architektur von MonitorView L2
- Andere WebSocket-Events

### Akzeptanzkriterien L4-FE-4

- [ ] IST-Analyse dokumentiert (ein Satz pro Punkt: was ist vorhanden, was fehlt)
- [ ] `logic_execution` WebSocket-Event wird im Frontend empfangen (Console-Nachweis)
- [ ] Nach Regel-Ausfuehrung aktualisiert sich der Regel-Status in Monitor L2 ohne Page-Reload
- [ ] Kein TypeScript-Compilerfehler (falls Aenderungen noetig)

---

## Einschraenkungen (was NICHT gemacht wird)

- **Kein neues Backend-Feature:** L4 baut nur auf bestehenden Daten und Endpoints auf. Keine neuen DB-Tabellen, keine neuen API-Endpoints.
- **Keine Redesign der Logic-Engine-UI:** RuleFlowEditor-Graph, VueFlow-Nodes und die grundlegende Editor-Struktur bleiben unveraendert.
- **Keine Alert-Threshold-Sync (P8-A3):** Das ist ein separater Auftrag NACH L4.
- **Kein Aktor-Analytics (P8-A6):** Ebenfalls separater Auftrag.
- **Keine neuen Sensor-Typen:** Die Templates verwenden `sht31_humidity` und `sht31_temp` als Beispiele — kein neuer Sensor-Support.
- **Kein LTTB / Chart-Erweiterung:** L4 beruehrt keine Chart-Logik.

---

## Reihenfolge-Empfehlung

```
1. L4-BE-1: DiagnosticsEvaluator session_factory (10min) — schnell, klarer Scope
2. L4-FE-4: Monitor L2 Verifikation (15min) — pruefen was da ist
3. L4-FE-3: Execution History Kosmetik (10min) — trivial, falls Aenderung gewuenscht
4. L4-FE-2: Klimasteuerungs-Vorlagen (1h) — Sensor-Node-Presets in Palette
5. L4-FE-1: Zone-Kontext in Sensor-Auswahl (1.5h) — groesste Aenderung, zum Schluss
```

---

## Zusammenfassung der Korrekturen (2026-03-30)

| Finding | Korrektur |
|---------|-----------|
| L4-BE-1 IST falsch — Evaluator ist registriert | Korrigiert: Problem ist fehlender `session_factory` Parameter, nicht fehlende Registrierung |
| L4-FE-1 IST falsch — ist bereits 2-stufig | Korrigiert: ESP→Sensor existiert, Paradigmen-Entscheidung ESP-first vs Zone-first ergaenzt |
| L4-FE-2 Palette-Mechanismus ignoriert | Korrigiert: Nur Einzel-Nodes, Hysterese als `operator: 'hysteresis'` in Sensor-Node, 2 Optionen dokumentiert |
| L4-FE-3 bereits implementiert | Korrigiert: LogicView.vue:863-877 zeigt trigger_reason + actions + error, nur ausklappbar statt immer sichtbar |
| L4-FE-4 bereits implementiert | Korrigiert: Gesamte WS-Pipeline vorhanden (Store:437-485), reduziert auf Verifikation |
| Zeilenzahlen falsch | Korrigiert: RuleFlowEditor ~1968 (war ~1400), RuleConfigPanel ~1199 (war ~900) |
| Aufwand ueberschaetzt | Korrigiert: ~2h statt ~3-4h (3 Aufgaben sind fast/komplett erledigt) |
| Execution History Rendering-Ort | Korrigiert: LogicView.vue, nicht MonitorView oder unbekannt |

---

## Verknuepfte Folge-Auftraege (NACH L4)

| Auftrag | Abhaengigkeit | Beschreibung |
|---------|--------------|--------------|
| **L5** Live-Verifikation | L1+L2+L3+L4 | Kompletter Hysterese-Zyklus auf Pi 5 mit echtem Befeuchter |
| **P8-A3** Alert Threshold Sync | L4 | Alert-Schwellwerte mit Logic-Regeln verknuepfen |
| **P8-A6** Aktor-Analytics Pipeline | L4 | Runtime-KPIs, Timeline, Korrelation |

---

*Ende Auftrag L4 Logic Engine Polish — 2026-03-29, korrigiert 2026-03-30.*
