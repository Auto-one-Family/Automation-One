# Auftrag R1-BE: Logic Engine Backend — IST-Zustand-Analyse

**Ziel-Repo:** auto-one (El Servador)
**Typ:** Reine Analyse — KEIN Code aendern
**Prioritaet:** HIGH
**Datum:** 2026-04-01
**Geschaetzter Aufwand:** ~2h
**Abhaengigkeit:** Keine
**Blockiert:** R2 (Datenmodell-Redesign), R4 (Backend-Anpassung)

---

## Auftragsziel

Den **kompletten IST-Zustand** der Logic Engine im Backend dokumentieren — mit Fokus auf das **Datenmodell**, die **Evaluierungs-Pipeline** und die **Erweiterbarkeit fuer Action-Routing**. Die Analyse soll ALLE Fragen beantworten die fuer das Redesign (R2/R4) noetig sind.

**Ergebnis:** Ein Analyse-Bericht mit exakten Dateiverweisen, Zeilennummern, Datenstrukturen und Code-Snippets.

**Wichtig:** Eine fruehere Architektur-Analyse hat den groben Datenfluss (MQTT → SensorHandler → LogicEngine → ActuatorExecutor → MQTT) und die Evaluator/Executor-Trennung bereits dokumentiert. Dieser Auftrag geht TIEFER in die konkreten Datenstrukturen (JSON-Formate, DB-Spalten, API-Schemas) und analysiert spezifisch wo das System erweitert werden muesste um Action-Routing (welche Condition triggert welche Action) und bidirektionale Aktoren (AN wenn TRUE, AUS wenn FALSE) zu ermoeglichen.

---

## System-Kontext

AutomationOne ist ein 3-schichtiges IoT-Framework:
- **El Trabajante** (ESP32 Firmware, C++) — Sensoren auslesen, Aktoren schalten, MQTT-Kommunikation
- **El Servador** (FastAPI Backend, Python) — PostgreSQL (31 Tabellen), MQTT-Broker (Mosquitto), Logic Engine als Background-Service
- **El Frontend** (Vue 3 Dashboard, TypeScript) — Visualisierung, Konfiguration, Rule Builder

Die Logic Engine ist ein Background-Service im **El Servador**. Der Datenfluss:
1. ESP32 sendet Sensor-Daten per MQTT (`kaiser/{k}/esp/{e}/sensor/{gpio}/data`)
2. `SensorHandler.handle_sensor_data()` empfaengt die Daten, speichert sie in die DB
3. `LogicEngine.evaluate_sensor_data()` wird per `asyncio.create_task()` gestartet (non-blocking)
4. Alle aktivierten Regeln werden aus der DB geladen (`cross_esp_logic` Tabelle)
5. Pro Regel: Conditions evaluieren → wenn TRUE → Actions ausfuehren
6. `ActuatorActionExecutor` sendet MQTT-Befehle (`kaiser/{k}/esp/{e}/actuator/{gpio}/command`)
7. ESP32 empfaengt und schaltet den Aktor

### Bekanntes Problem (Kontext fuer die Analyse)

Der Rule Builder hat aktuell fundamentale UX-Probleme auf die diese Analyse eingeht:

1. **Einseitige Aktorsteuerung:** Einfache Operatoren (>, <, etc.) schalten einen Aktor nur AN oder nur AUS — nie beides. Nur der Hysterese-Operator hat einen eingebauten AUS-Mechanismus (ueber ein `_hysteresis_just_deactivated` Flag das im Evaluator gesetzt wird und die Engine veranlasst, OFF-Kopien aller Actions zu senden).

2. **Flaches Datenmodell:** Das Backend speichert Regeln als `trigger_conditions[]` (flache Liste aller Bedingungen) + `actions[]` (flache Liste aller Aktionen). Wenn Bedingungen TRUE → ALLE Actions feuern. Es gibt keine Zuordnung "Condition X triggert Action Y". Die Graph-Topologie aus dem Frontend (welcher Sensor-Knoten zu welchem Aktor-Knoten verbunden ist) geht bei der Serialisierung verloren.

3. **Hysterese Dual-Modus:** Der HysteresisConditionEvaluator hat zwei Modi — Cooling (`activate_above` + `deactivate_below`) und Heating (`activate_below` + `deactivate_above`). Im Code wird `activate_above` + `deactivate_below` ZUERST geprueft (Zeile ~225). Wenn beide Paare gesetzt sind, wird Heating ignoriert. Das Frontend zeigt aber BEIDE Eingabefelder und suggeriert dass beides gleichzeitig funktioniert.

4. **Offline-Rules auf ESP:** Bei Netzwerkverlust fuehrt der ESP lokal Offline-Rules aus. Diese werden vom Server per Config-Push uebertragen. Aktuell werden NUR Hysterese-Conditions als Offline-Rules extrahiert (`_extract_offline_rule()` in `config_builder.py`). Aenderungen am Hysterese-Datenmodell muessen mit dieser Extraktion kompatibel bleiben.

### Bekannte Backend-Dateien

| Datei | Zeilen (ca.) | Rolle |
|-------|--------------|-------|
| `god_kaiser_server/src/services/logic_engine.py` | ~1067 | Haupt-Engine: evaluate_sensor_data, _evaluate_rule |
| `god_kaiser_server/src/services/logic/conditions/sensor_evaluator.py` | 200 | Sensor-Condition: >, <, ==, between |
| `god_kaiser_server/src/services/logic/conditions/hysteresis_evaluator.py` | 389 | Hysterese: Heating/Cooling State-Machine |
| `god_kaiser_server/src/services/logic/conditions/time_evaluator.py` | 122 | Zeitfenster-Condition |
| `god_kaiser_server/src/services/logic/conditions/compound_evaluator.py` | 107 | AND/OR Compound-Logic |
| `god_kaiser_server/src/services/logic/conditions/diagnostics_evaluator.py` | 102 | System-Health-Condition |
| `god_kaiser_server/src/services/logic/actions/actuator_executor.py` | 155 | Aktor-Befehle senden |
| `god_kaiser_server/src/services/logic/actions/delay_executor.py` | 86 | Verzoegerung |
| `god_kaiser_server/src/services/logic/actions/notification_executor.py` | 244 | Benachrichtigungen |
| `god_kaiser_server/src/services/logic/actions/sequence_executor.py` | 875 | Sequenz-Ausfuehrung (mehrstufige Action-Ketten) |
| `god_kaiser_server/src/services/logic/actions/plugin_executor.py` | 106 | Plugin-Actions |
| `god_kaiser_server/src/services/logic/actions/diagnostics_executor.py` | 89 | Diagnose-Actions |
| `god_kaiser_server/src/services/logic/safety/loop_detector.py` | 236 | Loop-Detektion (Safety-Subsystem) |
| `god_kaiser_server/src/services/logic/safety/rate_limiter.py` | 211 | Rate-Limiting (Safety-Subsystem) |
| `god_kaiser_server/src/services/logic/safety/conflict_manager.py` | 280 | Konflikt-Management (Safety-Subsystem) |
| `god_kaiser_server/src/services/logic/validator.py` | — | Rule-Validierung |
| `god_kaiser_server/src/services/logic_service.py` | 504 | CRUD, Rule-Test |
| `god_kaiser_server/src/services/config_builder.py` | — | Config-Push + Offline-Rule-Extraktion |
| `god_kaiser_server/src/db/models/logic.py` | — | SQLAlchemy Models (cross_esp_logic, logic_execution_history, logic_hysteresis_states) |
| `god_kaiser_server/src/db/models/logic_validation.py` | — | Validierungs-Model |
| `god_kaiser_server/src/db/repositories/logic_repo.py` | 300 | Repository-Layer fuer Logic-DB-Zugriffe |
| `god_kaiser_server/src/schemas/logic.py` | 678 | Pydantic-Schemas fuer API-Validierung |
| `god_kaiser_server/src/api/v1/logic.py` | — | REST-Endpoints fuer Regeln |

**Hinweis:** Pfade pruefen — `god_kaiser_server/src/services/logic/` koennte leicht anders strukturiert sein (z.B. `src/services/logic_engine/conditions/`).

---

## Analyse-Bloecke (8 Stueck)

Jeden Block als eigenen Abschnitt im Bericht dokumentieren.

---

### Block 1: Datenmodell — cross_esp_logic Tabelle (KERNANALYSE)

**Dateien:** `god_kaiser_server/src/db/models/logic.py`, `god_kaiser_server/src/db/repositories/logic_repo.py`, Alembic Migration

**Fragen:**
1. Wie sieht das SQLAlchemy Model fuer `cross_esp_logic` aus? ALLE Spalten auflisten:
   - Spaltenname, Typ, nullable, default, constraints
2. **trigger_conditions** — Wie sieht die JSON-Struktur aus?
   - Beispiel-JSON fuer eine einfache Sensor-Condition (z.B. > 40)
   - Beispiel-JSON fuer eine Hysterese-Condition
   - Beispiel-JSON fuer eine Compound-Condition (AND mit 2 Sensor-Conditions)
   - Beispiel-JSON fuer eine Zeitfenster-Condition
   - Welche Felder hat jede Condition? (`type`, `esp_id`, `gpio`, `sensor_type`, `operator`, `value`, ...)
3. **actions** — Wie sieht die JSON-Struktur aus?
   - Beispiel-JSON fuer eine Actuator-Action (ON mit Duration)
   - Beispiel-JSON fuer eine Notification-Action
   - Welche Felder hat jede Action? (`type`, `esp_id`, `gpio`, `command`, `duration_seconds`, ...)
4. **Compound-Operator:** Wo wird AND/OR gespeichert? In der `trigger_conditions` JSON oder als separates Feld?
5. **Gibt es ein Routing-Feld?** Irgendeine Zuordnung welche Condition welche Action triggert? (Vermutlich: NEIN)
6. Wie werden Regeln via API erstellt/aktualisiert? (`POST /logic/rules`, `PUT /logic/rules/{id}`)
   - Welches JSON-Format erwartet die API?
   - Wird das JSON validiert? (Pydantic Schema? JSON Schema?)
7. Gibt es neben `cross_esp_logic` weitere relevante Tabellen?
   - `logic_execution_history` — Struktur und Felder
   - `logic_hysteresis_states` — **[Korrektur: EXISTIERT]** (Zeile 357 in `db/models/logic.py`). Frage ist nicht ob, sondern: Welche Felder hat sie? Wird sie tatsaechlich beschrieben und gelesen, oder ist sie nur angelegt aber nicht genutzt?
   - Andere?

**Bewertung:**
- Kann `trigger_conditions` erweitert werden um ein Routing-Feld aufzunehmen OHNE Migration?
- Wie schmerzhaft waere eine Schema-Migration? (Bestehende JSON-Daten bleiben kompatibel?)
- Gibt es Validierung die neue Felder ablehnen wuerde?

---

### Block 2: Evaluierungs-Pipeline — _evaluate_rule() im Detail

**Datei:** `logic_engine.py`

**Fragen:**
1. **Trigger-Matching:** Wie wird entschieden welche Regeln fuer eingehende Sensor-Daten evaluiert werden?
   - `get_rules_by_trigger_sensor(esp_id, gpio, sensor_type)` — wie genau funktioniert das?
   - Was passiert wenn eine Regel auf Sensor A UND Sensor B reagieren soll? Wird sie bei JEDEM Sensor-Event evaluiert?
2. **Condition-Evaluierung:** Wie wird `_check_conditions_modular()` aufgerufen?
   - Wird jede Condition einzeln evaluiert?
   - Werden die Ergebnisse dann per AND/OR zusammengerechnet?
   - Wie wird der Compound-Operator angewendet?
3. **Action-Ausfuehrung:** `_execute_actions()` — wie werden Actions ausgefuehrt?
   - Sequentiell oder parallel?
   - Werden ALLE Actions ausgefuehrt oder nur bestimmte?
   - **KRITISCH:** Gibt es irgendeine Logik die bestimmte Actions NICHT ausfuehrt basierend auf welche Condition TRUE war?
4. **Hysterese-Deaktivierung:** Der `_hysteresis_just_deactivated` Bypass:
   - Wie genau funktioniert er? (Zeilen + Code-Snippet)
   - Wird er nur bei Hysterese ausgeloest oder auch bei anderen Condition-Typen?
   - Welche Actions werden bei Deaktivierung gesendet? (OFF-Kopien ALLER Actions?)
5. **Context-Objekt:** Was enthaelt der `context` der an Evaluatoren uebergeben wird?
   - Welche Keys? (sensor_data, sensor_values, rule_id, condition_index, ...)
   - Kann der Context um Routing-Informationen erweitert werden?

**[Korrektur: Safety-Subsystem nicht im Plan erwaehnt]**
Im realen System existiert `god_kaiser_server/src/services/logic/safety/` mit:
- `loop_detector.py` (236 Zeilen) — Erkennt Regelschleifen (A triggert B triggert A)
- `rate_limiter.py` (211 Zeilen) — Begrenzt Trigger-Frequenz pro Regel
- `conflict_manager.py` (280 Zeilen) — Erkennt Konflikte zwischen Regeln (z.B. zwei Regeln steuern denselben Aktor gegenlaeufig)

Block 2 muss dokumentieren: Wann werden diese Safety-Checks aufgerufen? Vor oder nach `_execute_actions()`? Koennen sie Actions blockieren?

**Bewertung:**
- An welcher Stelle muesste Action-Routing eingefuegt werden? (Vermutlich in `_execute_actions()`)
- Kann die Evaluierung pro Condition ein Ergebnis liefern das bestimmt welche Actions feuern?
- Wie schwierig waere es, einen "ELSE"-Pfad einzufuehren (Bedingung FALSE → andere Actions)?
- Interagiert Action-Routing mit dem Safety-Subsystem? (conflict_manager muss ggf. erweitertes Routing kennen)

---

### Block 3: HysteresisConditionEvaluator — Dual-Modus Analyse

**Datei:** `god_kaiser_server/src/services/logic/conditions/hysteresis_evaluator.py` (389 Zeilen)

**Fragen:**
1. **Modus-Erkennung:** Wie wird bestimmt ob Heating oder Cooling Modus?
   - Exakte Zeilen wo `activate_above` vs. `activate_below` geprueft wird
   - Was passiert wenn BEIDE Paare gesetzt sind? (Welcher hat Vorrang?)
   - Gibt es eine explizite "Modus"-Property oder wird es implizit aus den Feldern abgeleitet?
2. **State-Machine:** Wie funktioniert die State-Transition?
   - OFF → ON: Welche Bedingung?
   - ON → OFF: Welche Bedingung?
   - Deadband: Wie wird es berechnet?
3. **Sensor-Matching:** `_matches_sensor()`:
   - Welche Felder werden verglichen? (esp_id, gpio, sensor_type)
   - Werden i2c_address und onewire_address beruecksichtigt?
   - Was passiert bei nicht-matchendem Sensor? (Alter State zurueckgeben?)
4. **Return-Wert:** Was gibt `evaluate()` zurueck?
   - True/False/None?
   - Gibt es Zusatzinformationen im Context (z.B. `_hysteresis_just_deactivated`)?
5. **Koennte die Hysterese in ZWEI unabhaengige Pfade aufgeteilt werden?**
   - Pfad A: Kuehlung → spezifische Actions
   - Pfad B: Heizung → spezifische Actions
   - Was muesste sich aendern? (Zwei separate Conditions? Oder eine Condition mit zwei Ergebnis-Typen?)

**Bewertung:**
- Ist der Dual-Modus ein "Feature" oder ein "Bug"? (UI zeigt beides, Backend ignoriert eines)
- Beste Loesung: Zwei separate Hysterese-Conditions? Oder ein Modus-Toggle?
- Auswirkung auf Offline-Rules wenn der Modus sich aendert?

---

### Block 4: SensorConditionEvaluator — Einfache Operatoren

**Datei:** `sensor_evaluator.py` (201 Zeilen erwartet)

**Fragen:**
1. Welche Operatoren werden unterstuetzt? ALLE auflisten:
   - Interner Name, Vergleichslogik, Anzahl Werte (1 oder 2)
2. Was gibt `evaluate()` zurueck? True/False/None?
3. Gibt es einen "Inverse"-Mechanismus? (z.B. "TRUE wenn > 40" → automatisch "FALSE wenn <= 40")
   - Vermutlich NEIN — aber exakt pruefen
4. Gibt es Zusatzinformationen im Return oder Context?
5. Wie wird der `between`-Operator implementiert? (Zwei Werte: lower + upper bound)

**Bewertung:**
- Koennte der SensorEvaluator einen "Inverse"-Modus bekommen?
- Oder ist es besser, die Inverse-Logik in der Engine selbst zu loesen (ELSE-Pfad)?
- Welcher Ansatz passt besser zum bestehenden Code?

---

### Block 5: CompoundConditionEvaluator — AND/OR

**Datei:** `compound_evaluator.py` (105 Zeilen erwartet)

**Fragen:**
1. Wie werden Sub-Conditions evaluiert?
   - Werden sie sequentiell oder parallel evaluiert?
   - Short-circuit bei AND (erstes FALSE → sofort FALSE)?
   - Short-circuit bei OR (erstes TRUE → sofort TRUE)?
2. Wie wird `condition_index` gesetzt?
   - Aktueller Code: Wird der Index pro Sub-Condition korrekt hochgezaehlt?
   - Oder ist er immer 0? (Bekannter Verdacht: In `logic_engine.py` wurde `condition_index` hardcoded auf 0 gesetzt. Wenn das noch so ist, kollidieren Hysterese-State-Keys bei Compound-Regeln mit mehreren Conditions, weil alle den Key `"{rule_id}:0"` bekommen statt `"{rule_id}:0"`, `"{rule_id}:1"`, etc.)
3. Kann der CompoundEvaluator verschachtelt werden? (Compound in Compound?)
4. Gibt es eine Unterscheidung welche Sub-Condition TRUE war?
   - D.h. kann man nach der Evaluierung sagen: "Condition 0 war TRUE, Condition 1 war FALSE"?
   - Das waere die Basis fuer Action-Routing

**Bewertung:**
- Koennte der CompoundEvaluator ein Detail-Ergebnis liefern (statt nur True/False)?
- Z.B. `{"result": True, "details": [{"index": 0, "result": True}, {"index": 1, "result": False}]}`
- Das wuerde Action-Routing ermoeglichen

---

### Block 6: ActuatorActionExecutor — Befehlslogik

**Datei:** `actuator_executor.py` (156 Zeilen erwartet)

**Fragen:**
1. Wie wird ein Aktor-Befehl ausgefuehrt?
   - Welche Felder aus der Action werden gelesen? (esp_id, gpio, command, value, duration)
   - Wie wird der MQTT-Befehl konstruiert?
   - Wird der Befehl immer "ON" oder "OFF" sein? Oder gibt es differenziertere Befehle?
2. **Duration-Handling:**
   - Wie wird `duration_seconds` an den ESP uebergeben?
   - Wird `duration_seconds` = 0 als "kein Limit" interpretiert?
3. **Subzone-Filter:** Was ist das? Wann wird eine Action uebersprungen?
4. **KRITISCH: Wird bei Hysterese-Deaktivierung eine OFF-Kopie erstellt?**
   - Wer erstellt die OFF-Kopie — der Executor oder die Engine?
   - Wie wird das Kommando invertiert? (ON → OFF, PWM-Wert → 0?)
5. Gibt es einen Mechanismus um den Befehl abhaengig vom Evaluierungs-Ergebnis zu aendern?
   - Z.B. "wenn Bedingung TRUE → ON, wenn FALSE → OFF" — im selben Action-Objekt?

**Bewertung:**
- Koennte der Executor eine "bidirektionale" Action unterstuetzen?
- Z.B. `{"type": "actuator", "command_on": "ON", "command_off": "OFF", "bidirectional": true}`
- Welche Aenderungen waeren dafuer noetig in Engine + Executor?

---

### Block 7: Config-Builder — Offline-Rule-Extraktion

**Datei:** `config_builder.py` (Funktion `_build_offline_rules()` und `_extract_offline_rule()`)

**Fragen:**
1. Wie werden Logic-Rules zu Offline-Rules konvertiert?
   - Welche Conditions werden unterstuetzt? (Nur Hysterese? Oder auch einfache Operatoren?)
   - Welche Felder werden extrahiert?
   - Was wird gefiltert? (soil_moisture Guard, analog-Sensor-Guard, VIRTUAL-Guard)
2. Wie sieht eine Offline-Rule im Config-Push aus? (JSON-Format)
3. Wird der Compound-Operator beruecksichtigt? (AND/OR bei mehreren Conditions)
4. **Wie viele Offline-Rules pro Regel?** Kann eine Server-Regel mehrere ESP-Offline-Rules erzeugen?
5. Welche ESP-Firmware-Strukturen empfangen die Offline-Rules?
   - `offline_rule.h` Datenstruktur
   - Maximale Anzahl (vermutlich 8 — pruefen)
   - NVS-Speicherformat

**Bewertung:**
- Wenn Hysterese zukuenftig ZWEI Pfade hat (Kuehlung + Heizung), muessten ZWEI Offline-Rules pro Condition erzeugt werden — ist das im Framework moeglich?
- Koennte die Offline-Rule-Extraktion auch einfache Operatoren unterstuetzen (z.B. "> 40 → ON")? Einschraenkung: Die Firmware hat `applyLocalConversion()` — digitale Sensoren (SHT31, DS18B20, BMP280) liefern physikalische Werte (°C, %RH), aber analoge Sensoren (pH, EC, Bodenfeuchte) liefern RAW ADC-Werte (0-4095). Ein Schwellwert "pH > 7.5" wuerde gegen ADC-Rohwert 2048 verglichen → falsches Ergebnis. Offline-Rules fuer analoge Sensoren sind daher NICHT sicher.
- Gibt es Kapazitaetsgrenzen? (NVS-Speicher, max Regel-Anzahl)

---

### Block 8: REST-API — Regel-CRUD und Rule-Test

**Dateien:** `god_kaiser_server/src/api/v1/logic.py`, `god_kaiser_server/src/services/logic_service.py`, `god_kaiser_server/src/schemas/logic.py` (678 Zeilen Pydantic-Schemas)

**Fragen:**
1. Welche Endpoints existieren fuer die Logic Engine? ALLE auflisten:
   - Method, Path, Beschreibung, Auth-Level
2. **POST /logic/rules (Create):**
   - Welches Request-Schema? (Pydantic Model oder freies JSON?)
   - Welche Felder sind Pflicht, welche optional?
   - Wird `trigger_conditions` validiert? Falls ja: Gegen welches Schema?
   - Werden unbekannte Felder in `trigger_conditions` oder `actions` akzeptiert oder abgelehnt?
3. **PUT /logic/rules/{id} (Update):**
   - Gleiche Fragen wie Create
4. **POST /logic/rules/{id}/test (Rule-Test):**
   - Was genau macht der Test? (Trockenlauf? Echte Sensor-Daten? Mock?)
   - Welche Evaluatoren werden verwendet?
5. **Gibt es Validierung die neue/unbekannte Felder in trigger_conditions oder actions ablehnt?**
   - Das ist kritisch fuer die Erweiterbarkeit: Wenn die API ein `"routing"` Feld im JSON ablehnt, dann muesste die API zuerst angepasst werden

**Bewertung:**
- Wie streng ist die API-Validierung? Passiert JSON durch oder wird es gegen ein Schema geprueft?
- Koennte man ein `routing` Feld in der JSON-Payload unterbringen OHNE API-Aenderung? (Wenn JSON frei ist: Ja)
- Welche Pydantic-Modelle muessten erweitert werden?

---

## Ergebnis-Format

Der Analyse-Bericht soll als Markdown-Datei abgelegt werden. Format:

```markdown
# R1-BE Analyse-Bericht: Logic Engine Backend IST-Zustand

## Block 1: Datenmodell — cross_esp_logic
### Dateien & Zeilen
### Befunde
### Beispiel-JSON (trigger_conditions)
### Beispiel-JSON (actions)
### Bewertung

## Block 2: Evaluierungs-Pipeline
(gleiche Struktur)

...

## Zusammenfassung
### Architektur-Staerken
### Architektur-Schwaechen / Erweiterungspunkte
### Empfehlung fuer R2/R4
```

**Bericht ablegen:** Als Markdown-Datei (nach Abschluss der Analyse an Robin uebergeben)

---

## Was NICHT gemacht wird

- KEIN Code aendern
- KEINE Fixes implementieren
- KEINE neuen Dateien im auto-one Repo erstellen
- KEINE Frontend-Analyse (das ist R1-FE)
- KEINE Performance-Analyse oder Lasttest
- KEIN UX-Design vorschlagen (das ist R2)

---

## Akzeptanzkriterien

- [ ] Alle 8 Bloecke vollstaendig beantwortet mit Datei:Zeile Referenzen
- [ ] `cross_esp_logic` Model komplett dokumentiert (alle Spalten + JSON-Beispiele)
- [ ] trigger_conditions JSON-Struktur fuer ALLE Condition-Typen dokumentiert (Sensor, Hysterese, Time, Compound, Diagnostics)
- [ ] actions JSON-Struktur fuer ALLE Action-Typen dokumentiert (Actuator, Delay, Notification, Sequence)
- [ ] Evaluierungs-Pfad von Condition-Ergebnis zu Action-Ausfuehrung exakt nachgezeichnet
- [ ] Hysterese Dual-Modus Vorrang-Logik mit exakten Zeilennummern dokumentiert
- [ ] Offline-Rule-Extraktion vollstaendig dokumentiert inkl. Filter-Logik
- [ ] Erweiterungspunkte fuer Action-Routing klar identifiziert
- [ ] API-Validierung geprueft (akzeptiert oder lehnt unbekannte JSON-Felder ab?)
- [ ] Bericht als Markdown abgelegt

---

**Ende Auftrag R1-BE.**
