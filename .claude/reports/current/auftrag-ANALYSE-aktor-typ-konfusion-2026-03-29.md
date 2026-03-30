# ANALYSE-Auftrag: Aktor-Typ-Konfusion (actuator_type Mismatch)

> **Typ:** Reine Analyse — KEIN Code aendern
> **Finding:** F-V4-02 (MEDIUM) aus T17-V4 Verifikation (2026-03-10)
> **ESP:** ESP_EA5484 | **Zone:** Zelt Wohnzimmer
> **Datum:** 2026-03-29
> **Agent:** Backend + Frontend parallel analysieren, Firmware nachrangig
> **Ergebnis:** Strukturierter Bericht mit exaktem Root-Cause, betroffenen Stellen, und Loesungsempfehlung

---

## Kontext und Problemstellung

Im Live-System wurde waehrend der T17-V4 Verifikation (Hardware-Test mit ESP_EA5484) folgendes beobachtet:

- **actuator_configs.actuator_type** = `"digital"` fuer den Aktor auf GPIO 14 (Olimex PWR Switch, physisch ein Relay)
- **actuator_states.actuator_type** = `"relay"` fuer denselben Aktor

Das sind zwei Tabellen die denselben Aktor beschreiben, aber unterschiedliche Typ-Werte tragen.

**Warum ist das ein Problem?**

AutomationOne hat ein **Zwei-Typ-System** by design:

- **Server-Typen** (internes Schema): `digital`, `pwm`, `servo` — definiert in `ACTUATOR_TYPES` (schemas/actuator.py:49)
- **ESP32-Typen** (physische Geraete): `pump`, `valve`, `relay`, `pwm` — definiert in `ESP32_ACTUATOR_TYPES` (schemas/actuator.py:52)
- **Mapping** ESP32→Server: `pump→digital`, `valve→digital`, `relay→digital`, `pwm→pwm` (schemas/actuator.py:56-63)
- **Default-Wert** fuer actuator_type: `"digital"` (schemas/actuator.py:98-99)
- **Validator** `normalize_actuator_type()`: mappt ESP32-Typen auf Server-Typen (schemas/actuator.py:71-81)

Das Frontend behandelt `"digital"` bereits korrekt: `getActuatorTypeInfo()` in `labels.ts:106` mappt `"digital"` explizit auf `{ label: 'Relais', icon: 'ToggleRight' }`. Die urspruengliche Annahme eines falschen Fallback-Icons war falsch.

**Die eigentliche Frage ist nicht "Woher kommt digital?" (Antwort: by design), sondern:**
1. **Ist das Zwei-Typ-System architektonisch gewollt oder ein Architektur-Fehler?**
2. **Warum haben actuator_configs und actuator_states unterschiedliche Typ-Werte?** — configs hat den normalisierten Server-Typ (`"digital"`), states hat moeglicherweise den ESP32-Typ (`"relay"`) weil actuator_states den Typ ungefiltert aus dem MQTT-Payload uebernimmt.
3. **Ist der Dualismus ueberall konsistent durchgehalten?**

---

## Analyse-Block 1: Backend — Datenbank-Zustand und Schreibpfade

### 1.1 Aktueller DB-Zustand fuer ESP_EA5484

SQL-Abfragen ausfuehren und Ergebnisse VOLLSTAENDIG dokumentieren:

```sql
-- Alle actuator_configs fuer ESP_EA5484
SELECT
  ac.id,
  ac.gpio,
  ac.actuator_type,
  ac.actuator_name,
  ac.enabled,
  ac.min_value,
  ac.max_value,
  ac.default_value,
  ac.created_at
FROM actuator_configs ac
JOIN esp_devices e ON ac.esp_id = e.id
WHERE e.esp_identifier = 'ESP_EA5484'
ORDER BY ac.gpio;

-- Zugehoerige actuator_states fuer denselben ESP
SELECT
  ast.gpio,
  ast.actuator_type,
  ast.state,
  ast.current_value,
  ast.last_command,
  ast.last_command_timestamp,
  ast.data_source
FROM actuator_states ast
JOIN esp_devices e ON ast.esp_id = e.id
WHERE e.esp_identifier = 'ESP_EA5484'
ORDER BY ast.gpio;

-- Letzten 20 Eintraege in actuator_history fuer ESP_EA5484
SELECT
  ah.gpio,
  ah.actuator_type,
  ah.command_type,
  ah.value,
  ah.issued_by,
  ah.success,
  ah.timestamp
FROM actuator_history ah
JOIN esp_devices e ON ah.esp_id = e.id
WHERE e.esp_identifier = 'ESP_EA5484'
ORDER BY ah.timestamp DESC
LIMIT 20;
```

**Fragen die beantwortet werden muessen:**
- Welcher actuator_type steht TATSAECHLICH in actuator_configs fuer GPIO 14?
- Welcher actuator_type steht in actuator_states fuer GPIO 14?
- Stimmt der actuator_type in actuator_history mit configs oder states ueberein?
- Gibt es noch andere ESPs oder Aktoren in der DB bei denen actuator_type = "digital" vorkommt?

```sql
-- Globale Suche: Wie viele Aktoren haben actuator_type = 'digital'?
SELECT
  e.esp_identifier,
  ac.gpio,
  ac.actuator_name,
  ac.actuator_type,
  ac.created_at
FROM actuator_configs ac
JOIN esp_devices e ON ac.esp_id = e.id
WHERE ac.actuator_type = 'digital'
ORDER BY ac.created_at;

-- Zum Vergleich: Alle vorkommenden actuator_type-Werte in actuator_configs
SELECT DISTINCT actuator_type, COUNT(*) as anzahl
FROM actuator_configs
GROUP BY actuator_type
ORDER BY anzahl DESC;

-- Alle vorkommenden actuator_type-Werte in actuator_states
SELECT DISTINCT actuator_type, COUNT(*) as anzahl
FROM actuator_states
GROUP BY actuator_type
ORDER BY anzahl DESC;
```

### 1.2 Wer schreibt actuator_type in actuator_states?

Die Tabellen `actuator_configs` und `actuator_states` haben beide eine `actuator_type`-Spalte. Es ist unklar ob diese synchron gehalten werden oder unabhaengig befuellt werden.

Folgende Stellen im Backend-Code analysieren:

**actuator_states Schreibpfade — alle Stellen finden wo ActuatorState-Rows angelegt oder aktualisiert werden:**

- `src/mqtt/handlers/actuator_handler.py` — empfaengt Aktor-Status vom ESP via MQTT, schreibt actuator_states
- `src/mqtt/handlers/lwt_handler.py` — setzt actuator_states auf `off` beim Offline-Gehen eines ESP
- `src/mqtt/handlers/heartbeat_handler.py` — koennte actuator_states initialisieren
- `src/api/v1/actuators.py` — API-Endpoints fuer Aktor-Befehle, schreibt ggf. actuator_states
- `src/services/logic/actions/actuator_executor.py` — Logic-Engine-Actions
- `src/services/simulation/actuator_handler.py` — Simulations-Handler (moeglicherweise anderes Schreibverhalten als MQTT-Handler)

Fuer jede Stelle dokumentieren:
- Woher kommt der `actuator_type`-Wert der in actuator_states geschrieben wird?
- Wird er aus `actuator_configs` gelesen (Source of Truth)?
- Oder kommt er aus dem MQTT-Payload der vom ESP gesendet wird?
- Oder ist er hardcoded?

**Kritische Frage:** Wenn der ESP-Firmware `actuator_type="relay"` in seinem MQTT-Status-Payload sendet, und der Backend-Handler diesen Wert direkt in actuator_states schreibt, erklaert das den Mismatch: actuator_configs hat "digital" (gesetzt beim Anlegen), actuator_states hat "relay" (gesetzt durch ESP-Firmware-Payload).

### 1.3 Wer schreibt actuator_type in actuator_configs?

Alle Stellen im Backend-Code analysieren wo `ActuatorConfig`-Rows angelegt werden:

- `src/api/v1/actuators.py` — `POST /api/v1/actuators/{esp_id}/{gpio}` (Funktion `create_or_update_actuator`, Zeile ~404) (User legt Aktor an)
- `src/mqtt/handlers/heartbeat_handler.py` — Auto-Erstellung bei Heartbeat wenn Aktor noch nicht in DB?
- `src/mqtt/handlers/config_handler.py` — Config-Response-Handling
- Alembic-Migrationen — gibt es eine Migration die `actuator_type` auf "digital" gesetzt hat?

**Kernfragen:**
- Das Pydantic-Schema ist `ActuatorConfigCreate` (erbt von `ActuatorConfigBase`). Der Validator `normalize_actuator_type()` mappt ESP32-Typen (relay/pump/valve) auf Server-Typen (digital/pwm/servo). Default ist `"digital"`. Pruefen: Laesst der Validator auch ESP32-Typen ungemappt durch, oder wird IMMER normalisiert?
- Gibt es neben dem Pydantic-Validator auch ein CHECK-Constraint auf DB-Ebene? Oder akzeptiert VARCHAR(50) beliebige Werte?
- Gibt es eine Alembic-Migration die `actuator_type` auf "digital" gesetzt oder den Validator eingefuehrt hat?
- Was sendet das Frontend im Create-Request? Einen ESP32-Typ (relay/pump) oder bereits den Server-Typ (digital)?
- **Debug-Router pruefen:** `POST /debug/mock-esp/{esp_id}/actuators` ist ein weiterer Create-Pfad fuer Aktoren. Nutzt dieser das gleiche Schema (`ActuatorConfigCreate`) oder ein anderes?

### 1.4 SafetyService und Config-Push — Verwendung von actuator_type

Pruefen welche Backend-Services `actuator_type` aktiv nutzen (nicht nur speichern):

- `src/services/safety_service.py` — nutzt actuator_type fuer Safety-Checks? (z.B. andere Limits fuer pump vs. relay)
- `src/services/config_builder.py` (`build_combined_config()`) — wird actuator_type in den Config-Push an den ESP eingebaut? Wird der normalisierte Server-Typ oder der originale ESP32-Typ gesendet?
- `src/services/logic/` (mit Unterordnern `actions/`, `conditions/`, `safety/`) — nutzen Actions actuator_type? Insbesondere `actions/actuator_executor.py`.
- `src/mqtt/handlers/actuator_handler.py` — filtert oder brancht nach actuator_type?
- `src/services/simulation/actuator_handler.py` — schreibt der Simulations-Handler actuator_type anders als der MQTT-Handler?

Fuer jeden Treffer dokumentieren: Wird `actuator_configs.actuator_type` gelesen oder `actuator_states.actuator_type`? Sind die konsistent?

---

## Analyse-Block 2: Frontend — Herkunft beim Erstellen und Anzeige

### 2.1 Aktor-Erstellungs-Dialog

Den Code des Modals zum Anlegen eines neuen Aktors analysieren. Wahrscheinlich `AddActuatorModal.vue` oder aehnlich.

Dokumentieren:
- Welche Felder hat das Formular fuer einen neuen Aktor?
- Gibt es ein Dropdown oder Input fuer `actuator_type`?
- Welche Werte sind auswaehlbar? Sind "relay/pump/valve/pwm" als Optionen vorhanden?
- Oder gibt es stattdessen ein Feld fuer "Interface-Typ" (digital/pwm/analog) das faelschlicherweise als actuator_type an das Backend gesendet wird?
- Welches Pydantic-Feld wird im POST-Request als `actuator_type` mitgesendet? Exaktes Beispiel des Request-Payloads dokumentieren.

**Hypothese pruefen:** Das Frontend unterscheidet moeglicherweise zwischen "Aktor-Typ" (was der Verbraucher ist: Pumpe/Ventil/...) und "Ansteuerungs-Typ" (wie der GPIO arbeitet: digital/pwm). Wenn das Formular "Ansteuerungs-Typ" als actuator_type sendet, entsteht das "digital"-Problem.

### 2.2 ActuatorCard, ActuatorCardWidget und ActuatorConfigPanel — welche Quelle wird gelesen

Es gibt zwei relevante Aktor-Karten-Komponenten:
- `components/devices/ActuatorCard.vue` — Device-Ansicht (HardwareView)
- `components/dashboard-widgets/ActuatorCardWidget.vue` — Dashboard-Widget

Beide koennten actuator_type nutzen. Zusaetzlich `ActuatorConfigPanel.vue` analysieren:

- Welche Store-Property wird fuer den Icon-Lookup verwendet? `actuator.actuator_type`?
- Woher kommen die Aktor-Daten im Pinia-Store? Aus dem `/actuators` GET-Endpoint (actuator_configs) oder aus dem WebSocket (actuator_states)?
- Gibt es eine Stelle wo actuator_configs und actuator_states zusammengefuehrt werden? (z.B. in einem Composable oder Store-Getter)

**Erwarteter Befund:** Wenn der Store Daten aus actuator_configs laedt (REST-API) und actuator_states (WebSocket/MQTT) separat behandelt, koennte ActuatorCard entweder den einen oder den anderen Typ anzeigen — je nachdem welche Quelle bevorzugt wird.

### 2.3 Pinia Store — Aktor-Datenmodell

Den Pinia-Store fuer Aktoren analysieren (`shared/stores/actuator.store.ts`):

- Welches Interface beschreibt einen Aktor? Gibt es einen `actuator_type`-Property?
- Werden actuator_configs und actuator_states in einem einzigen Objekt zusammengefuehrt (Merge)?
- Wenn zusammengefuehrt: Welcher `actuator_type`-Wert "gewinnt"? Der aus configs (REST) oder der aus states (WS-Event)?
- WS-Event `actuator_status` — welche Felder enthaelt er? Enthaelt er `actuator_type`?

---

## Analyse-Block 3: Firmware — Was sendet der ESP als actuator_type?

### 3.1 Aktor-Status MQTT-Payload

Den Code analysieren der MQTT-Status-Nachrichten fuer Aktoren publiziert.
Topic-Schema: `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status`

Dokumentieren:
- Welche Felder enthaelt der JSON-Payload?
- Insbesondere: Enthaelt er ein Feld `actuator_type`? Wenn ja, mit welchem Wert?
- Woher stammt dieser Wert — aus der NVS-Konfiguration oder aus einer hardcodierten Konstante in der Firmware?

**NVS-Schema fuer Aktoren:** Das bekannte NVS-Schema fuer Sensoren ist `sen_{i}_gpio/type/name/...`. Das analoge Schema fuer Aktoren ist noch unbekannt. Dokumentieren:
- Wie heissen die NVS-Keys fuer Aktoren? (`act_{i}_type`? `act_{i}_gpio`?)
- Welcher Wert wird fuer `type` eines digital-geschalteten Relays in NVS gespeichert? "relay" oder "digital"?

### 3.2 Config-Push Verarbeitung in der Firmware

Den Code analysieren der einen eingehenden Config-Push verarbeitet (`config_manager.cpp` oder `main.cpp` MQTT-Command-Handler):

- Welches Feld aus dem Config-Push-JSON wird als actuator_type in NVS gespeichert?
- Ist das der Wert aus `actuator_configs.actuator_type` (Backend-DB) oder ein anderer Wert?
- Gibt es eine Mapping-Logik (z.B. "relay" → GPIO_OUTPUT_DIGITAL)?

---

## Analyse-Block 4: Herkunft von "digital" — Hypothesen pruefen

Folgende Hypothesen systematisch pruefen und jeweils mit Code-Belegen bestaetigen oder widerlegen:

**H1 — "digital" ist das korrekte Ergebnis der Server-Normalisierung:**
Der Pydantic-Validator `normalize_actuator_type()` mappt ESP32-Typen auf Server-Typen: `relay→digital`, `pump→digital`, `valve→digital`. Wenn das Frontend `"relay"` sendet, landet `"digital"` in actuator_configs. Das waere by design.
- Pruefen: Was genau sendet das Frontend im Create-Request? ESP32-Typ oder Server-Typ?
- Pruefen: Durchlaeuft JEDER Schreibpfad (API, Heartbeat-AutoCreate, Debug-Router) denselben Validator?
- Pruefen: Gibt es Alembic-Migrationen die actuator_type nachtraeglich gesetzt haben?

**H2 — actuator_states schreibt ESP32-Typ ungefiltert:**
Die Firmware sendet `"relay"` als actuator_type in MQTT-Status-Payloads. Der Backend-Handler (`actuator_handler.py`) schreibt diesen Wert direkt in actuator_states, ohne den `normalize_actuator_type()` Validator anzuwenden. Ergebnis: configs="digital" (normalisiert), states="relay" (raw ESP32-Typ).
- Pruefen: Welchen Wert sendet die Firmware im MQTT-Status-Payload?
- Pruefen: Liest der actuator_handler den Typ aus dem MQTT-Payload oder aus actuator_configs?
- Pruefen: Wendet der Handler den Normalisierer an bevor er schreibt?

**H3 — Zwei Handler-Dateien mit unterschiedlichem Verhalten:**
Es gibt `src/mqtt/handlers/actuator_handler.py` (MQTT) UND `src/services/simulation/actuator_handler.py` (Simulation). Wenn diese den actuator_type unterschiedlich behandeln, koennte das den Mismatch erklaeren.
- Pruefen: Schreiben beide Handler actuator_states? Mit welchem Typ-Wert?
- Pruefen: Nutzt der Simulations-Handler den Normalisierer?

**H4 — Das Zwei-Typ-System ist nicht ueberall konsistent durchgehalten:**
Manche Stellen im Code erwarten Server-Typen (digital/pwm/servo), andere ESP32-Typen (relay/pump/valve/pwm). Wenn Services oder Frontend-Logik den Typ aus der falschen Quelle lesen (configs vs. states), entstehen Inkonsistenzen.
- Pruefen: Welche Services/Endpoints lesen aus actuator_configs vs. actuator_states?
- Pruefen: Gibt es Stellen die den Typ VERGLEICHEN (z.B. Safety-Checks) und dabei configs vs. states mischen?
- Pruefen: Ist das Zwei-Typ-System (Server vs. ESP32) architektonisch dokumentiert oder gewachsen?

---

## Ergebnis-Format

Bericht als separate Datei erstellen:
`.claude/reports/current/BERICHT-AKTOR-TYP-KONFUSION-2026-03-29.md`

Struktur:

```
# Bericht: Aktor-Typ-Konfusion — IST-Zustand (2026-03-29)

## 1. DB-Zustand
- actuator_configs: [exakte Tabelle mit allen Feldern]
- actuator_states: [exakte Tabelle]
- actuator_history: [letzte 10 Eintraege]
- Globale Verteilung actuator_type-Werte: [configs vs. states]

## 2. Schreibpfade actuator_states.actuator_type
- Wer schreibt, woher kommt der Wert (configs/MQTT-Payload/hardcoded)

## 3. Schreibpfade actuator_configs.actuator_type
- Create-Endpoint Pydantic-Schema
- Validierung vorhanden: ja/nein
- Welche Werte sind moeglich

## 4. Frontend Aktor-Erstellungs-Flow
- Formular-Felder und Request-Payload
- Wo "digital" herkommt wenn es vom FE stammt

## 5. Firmware MQTT-Payload
- Exaktes JSON-Beispiel actuator/status-Payload
- NVS-Schema Aktoren

## 6. Hypothesen-Auswertung
- H1/H2/H3/H4: BESTAETIGT / WIDERLEGT mit Code-Verweis (Datei:Zeile)

## 7. Root Cause
- "digital" in actuator_configs ist by design (Server-Normalisierung). Die Frage ist: Warum hat actuator_states einen anderen Typ-Wert?
- Sind configs und states strukturell entkoppelt? Wer haelt die konsistent?
- Ist das Zwei-Typ-System (Server: digital/pwm/servo vs. ESP32: relay/pump/valve/pwm) architektonisch gewollt und dokumentiert, oder gewachsen?

## 8. Betroffene Stellen (vollstaendige Liste)
- Alle Stellen im Code die actuator_type lesen ODER schreiben
- Jede Stelle: Datei:Zeile, liest/schreibt, aus welcher Quelle

## 9. Loesungsempfehlung
- Welche der 4 Optionen ist die richtige:
  a) Zwei-Typ-System beibehalten, aber actuator_states MUSS ebenfalls den normalisierten Server-Typ verwenden (actuator_handler wendet normalize_actuator_type an)
  b) Zwei-Typ-System aufloesen: Nur noch ESP32-Typen (relay/pump/valve/pwm) ueberall verwenden, Server-Normalisierung entfernen
  c) actuator_configs als einzige Source of Truth fuer actuator_type, actuator_states.actuator_type wird bei Schreiboperationen stets aus configs befuellt
  d) Kombination — oder anderer Vorschlag basierend auf dem tatsaechlichen Befund

- Aufwand-Schaetzung fuer die empfohlene Loesung
- Abhaengigkeiten zu anderen offenen Auftraegen
```

---

## Einschraenkungen

- **Nur analysieren, NICHTS aendern.** Kein Code-Fix, keine DB-Migration, kein Config-Push.
- Jede Aussage mit konkretem Code-Verweis belegen (Datei:Zeile oder Datei + Funktionsname).
- Wenn eine Frage nicht beantwortbar ist (z.B. kein DB-Zugang in dieser Session), das explizit dokumentieren.
- Fokus auf die Root-Cause-Frage: **Warum haben actuator_configs und actuator_states unterschiedliche Typ-Werte, und ist das Zwei-Typ-System (Server vs. ESP32) ueberall konsistent durchgehalten?** — nicht auf alle anderen Aktor-Bugs.
- F-V4-02 war als MEDIUM eingestuft — kein Show-Stopper, aber Dateninkonsistenz die spaetere Features (Aktor-Analytics, Phase P8-A6) beeinflussen wuerde. Daher gruendliche Analyse jetzt, Fix-Auftrag folgt separat.
