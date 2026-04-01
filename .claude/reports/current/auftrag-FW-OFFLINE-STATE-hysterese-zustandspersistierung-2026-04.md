# FW-OFFLINE-STATE — Hysterese Zustandspersistierung: activateOfflineMode + NVS + Config-Push Sync

> **Typ:** Analyse + Fix (Diagnose-Schritt ist Pflicht vor der Implementierung)
> **Prio:** HIGH
> **Schicht:** Firmware (El Trabajante) + Backend minimal (El Servador)
> **Aufwand:** ~4-6h (Schritt 0: ~1h Diagnose, Schritt 1-3: ~3-5h Implementierung)
> **Empfohlener Agent:** esp32-dev (Schritt 0-2), server-dev (Schritt 3)
> **Datum:** 2026-04-01

---

## Zusammenfassung

Das Offline-Safety-System (SAFETY-P4) hat einen Initialisierungsfehler: Der Hysterese-Zustand
(`is_active` pro Offline-Rule) wird beim Wechsel in den Offline-Modus nicht korrekt aus dem
echten Aktor-Laufzeitstatus abgeleitet. Robins Live-Beobachtung zeigt genau das:

- Server stoppen wenn Regel NICHT aktiv (Feuchte >= 45%, Aktor AUS) → Offline funktioniert korrekt
- Server stoppen wenn Regel AKTIV war (Feuchte < 45%, Aktor war AN, Feuchte jetzt z.B. 48%) → KEINE Regel funktioniert mehr

Das bedeutet: Wenn beim Disconnect der Aktor an war und die Feuchte sich inzwischen in den Deadband-Bereich
bewegt hat, arbeitet `evaluateOfflineRules()` mit einem falsch initialisierten `is_active=false`. Die Regel
denkt die Aktivierungs-Schwelle wurde noch nicht unterschritten, obwohl der Aktor bereits laeuft. Das Ergebnis
ist entweder sofortiges falsches Abschalten oder ein direkt ausgeloester Toggle.

**Dieser Auftrag ist UNABHAENGIG von FIX-FW-OFFLINE-SAFETY (2026-03-31).** Jener Auftrag behandelt den
Dual-Modus-Toggle-Bug. Dieser Auftrag behandelt die falsche Initialisierung von `is_active` beim
activateOfflineMode-Uebergang und die fehlende NVS-Persistenz des Zustands.

---

## Hintergrund: Wie das System aufgebaut ist

### evaluateOfflineRules() — KORREKT und STATEFUL

Die Evaluierungsschleife in `offline_mode_manager.cpp` (Zeile 161-193) ist architektonisch korrekt.
Sie implementiert eine vollstaendige stateful Hysterese:

```
bool new_state = rule.is_active;    // Ausgangswert = aktueller Zustand

// Heating-Pfad (wenn Modus HEATING):
if (!rule.is_active && val < rule.activate_below)  → new_state = true
if (rule.is_active  && val > rule.deactivate_above) → new_state = false

// Cooling-Pfad (wenn Modus COOLING):
if (!rule.is_active && val > rule.activate_above)  → new_state = true
if (rule.is_active  && val < rule.deactivate_below) → new_state = false

// Wenn new_state != rule.is_active → Zustandswechsel (Aktor schalten)
// Sonst: Deadband → keine Aktion
```

Das ist genau richtig. Im Deadband (Wert zwischen den Schwellen) passiert nichts. `is_active` bestimmt
ob der Aktor aktuell an ist. Wenn `is_active` falsch gesetzt ist, schaltet die Logik falsch.

### activateOfflineMode() — Mechanismus EXISTIERT, liefert aber falsches Ergebnis

Die Funktion `activateOfflineMode()` (Zeile 320-356) hat BEREITS eine vollstaendige current_state-
Initialisierung mit Diagnose-Log:

```cpp
ActuatorConfig cfg = actuatorManager.getActuatorConfig(offline_rules_[i].actuator_gpio);
if (cfg.gpio != 255) {
    offline_rules_[i].is_active = cfg.current_state;
    LOG_I(TAG, "... is_active initialized from hardware state -> ON/OFF");
}
```

`current_state` in `ActuatorConfig` ist explizit als "Live state tracking" deklariert — NICHT
`default_state`. `controlActuatorBinary()` refresht via `actuator->config = actuator->driver->getConfig()`
nach jedem Befehl. Die Architektur ist also korrekt designed.

**Trotzdem funktioniert es nicht.** Robins Live-Test zeigt, dass der Aktor-Zustand beim Offline-
Uebergang nicht korrekt in `is_active` ankommt. Die Diagnose muss klaeren WARUM.

### Das eigentliche Problem: is_active bei NVS-Load und Config-Parse immer false

Unabhaengig vom activateOfflineMode()-Bug gibt es zwei weitere Stellen wo `is_active` falsch
initialisiert wird:

**Stelle 1 — parseOfflineRules() (Zeile ~239):**
Wenn der Server einen Config-Push mit `offline_rules` sendet, wird `is_active` auf `false` gesetzt —
unabhaengig davon was der Aktor zu diesem Zeitpunkt tatsaechlich macht.

**Stelle 2 — loadOfflineRulesFromNVS() (Zeile ~288):**
Wenn Rules aus dem NVS geladen werden (z.B. nach Power-Cycle), wird `is_active` auf `false` gesetzt.
Es existiert kein NVS-Key `ofr_{i}_state`. Die vorhandenen NVS-Keys sind:
- `ofr_count` — Anzahl der Rules
- `ofr_{i}_en` — Rule aktiviert
- `ofr_{i}_agpio` — Aktor-GPIO
- `ofr_{i}_sgpio` — Sensor-GPIO
- `ofr_{i}_svtyp` — sensor_value_type
- `ofr_{i}_actb` / `ofr_{i}_deaa` — Heizen-Schwellen
- `ofr_{i}_acta` / `ofr_{i}_deab` — Kuehlen-Schwellen
- `ofr_{i}_mode` — Modus (Heating/Cooling)

---

## Vorbedingung: Bestehendes Diagnose-Log auswerten

**BEVOR der Agent mit Schritt 0 beginnt**, muss Robin das bereits vorhandene Diagnose-Log im
Serial-Monitor beobachten. Das Log lautet:

```
[SAFETY-P4] Rule N: actuator GPIO X is_active initialized from hardware state -> ON/OFF
```

Robin reproduziert den Problemfall:
1. Regel aktiv (Feuchte < 45%, Befeuchter AN)
2. Feuchte steigt auf ~48% (Deadband)
3. Server stoppen
4. Serial-Monitor beobachten: Was zeigt das Log fuer `is_active`?

**Moegliche Ergebnisse:**
- Log zeigt `is_active -> ON` aber Offline-Regeln funktionieren trotzdem nicht → Bug liegt
  NACH activateOfflineMode() (z.B. wird is_active spaeter ueberschrieben)
- Log zeigt `is_active -> OFF` obwohl Aktor physisch AN ist → `cfg.current_state` liefert
  falschen Wert (Driver-Bug oder Race-Condition)
- Log erscheint gar nicht → `cfg.gpio == 255` (Aktor nicht gefunden, GPIO-Mismatch zwischen
  Offline-Rule und ActuatorManager)

Robin meldet das Ergebnis an den Agent bevor die Implementierung beginnt.

---

## Schritt 0: Erweiterte Diagnose (nur falls bestehendes Log nicht ausreicht)

**Datei:** `src/services/safety/offline_mode_manager.cpp`, Funktion `activateOfflineMode()` (Zeile ~320-356)

Nur ausfuehren wenn Robins Log-Beobachtung (Vorbedingung) nicht eindeutig klaert wo der Fehler liegt.

### Moegliche echte Ursachen (pruefen in dieser Reihenfolge)

**Ursache A — Driver-getConfig() liefert current_state=false nach Wokwi-Reboot oder nach
bestimmten Aktor-Kommandos:**
`controlActuatorBinary()` refresht `config` via `actuator->driver->getConfig()`. Pruefen ob
`getConfig()` bei allen 4 Aktor-Treibern (Relay, Pump, Valve, PWM) den `current_state` korrekt
zurueckgibt — insbesondere nach einem Binary-ON-Befehl via MQTT.

**Ursache B — Race-Condition zwischen MQTT-Command-Verarbeitung und activateOfflineMode():**
Wenn der letzte Server-Befehl (ON) per MQTT noch nicht vollstaendig verarbeitet war bevor der
Heartbeat-Timeout den Offline-Uebergang ausloest, koennte `current_state` den alten Wert haben.
Pruefen: Wird activateOfflineMode() im selben Thread/Task wie MQTT-Command-Handling ausgefuehrt?

**Ursache C — GPIO-Mismatch:**
Die Offline-Rule hat `actuator_gpio=X`, aber der ActuatorManager kennt den Aktor unter einem
anderen GPIO (z.B. weil die Rule den logischen GPIO speichert, der Manager aber den physischen).
Pruefen: `getActuatorConfig(gpio)` — macht es einen exakten GPIO-Match?

**Zusaetzliches Diagnose-Log (nur falls noetig):**

```cpp
// VOR der bestehenden is_active-Zuweisung einfuegen:
for (int i = 0; i < offline_rule_count_; i++) {
    ActuatorConfig cfg = actuatorManager.getActuatorConfig(offline_rules_[i].actuator_gpio);
    LOG_I(TAG, "[SAFETY-P4-DIAG] Rule %d: rule.actuator_gpio=%d, "
          "cfg.gpio=%d (255=not found), cfg.current_state=%s, "
          "cfg.default_state=%s, digitalRead(%d)=%d",
          i,
          offline_rules_[i].actuator_gpio,
          cfg.gpio,
          cfg.current_state ? "ON" : "OFF",
          cfg.default_state ? "ON" : "OFF",
          offline_rules_[i].actuator_gpio,
          digitalRead(offline_rules_[i].actuator_gpio));
}
```

Das zeigt alle drei Informationsquellen gleichzeitig: Config-State, Default-State, und echten
Hardware-Pin-Zustand. Damit ist sofort sichtbar welche Quelle den falschen Wert liefert.

**Ergebnis der Diagnose:** Der Agent dokumentiert in einem kurzen Code-Kommentar vor dem Fix
welche Ursache (A, B oder C) zutrifft und welchen Wert jede Quelle geliefert hat.

---

## Schritt 1: activateOfflineMode() Fix — Basierend auf Diagnose-Ergebnis

**Datei:** `src/services/safety/offline_mode_manager.cpp`, Funktion `activateOfflineMode()`

**Ziel:** Sicherstellen dass `is_active` pro Rule korrekt mit dem ECHTEN aktuellen Aktor-Zustand
initialisiert wird.

### Wenn Ursache A (Driver-getConfig liefert falschen current_state):

Den betroffenen Aktor-Treiber fixen. In der entsprechenden `getConfig()`-Methode (z.B. in
`relay_driver.cpp` oder `pump_driver.cpp`) sicherstellen dass `current_state` nach jedem
`controlBinary()`-Aufruf korrekt aktualisiert wird.

### Wenn Ursache B (Race-Condition):

`activateOfflineMode()` muss den Aktor-State NACH dem letzten MQTT-Command lesen. Falls noetig:
- Pruefen ob ein Mutex/Semaphore den MQTT-Handler und den Offline-Transition synchronisiert
- Oder als Workaround: `digitalRead(gpio)` als Fallback verwenden wenn `cfg.current_state`
  suspekt ist (Hardware-Pin luegt nicht)

### Wenn Ursache C (GPIO-Mismatch):

Den GPIO-Wert in der Offline-Rule und im ActuatorManager abgleichen. Falls es einen Typ-
Mismatch gibt (logisch vs. physisch), den Lookup in `getActuatorConfig()` korrigieren.

### Fallback-Strategie (unabhaengig von der Ursache):

Falls der root cause nicht sofort behebbar ist, als Workaround in activateOfflineMode()
`digitalRead(gpio)` als zusaetzlichen Check einbauen:

```cpp
for (int i = 0; i < offline_rule_count_; i++) {
    ActuatorConfig cfg = actuatorManager.getActuatorConfig(offline_rules_[i].actuator_gpio);
    if (cfg.gpio != 255) {
        offline_rules_[i].is_active = cfg.current_state;
    } else {
        // Fallback: Hardware-Pin direkt lesen
        int pin_state = digitalRead(offline_rules_[i].actuator_gpio);
        offline_rules_[i].is_active = (pin_state == HIGH);
    }
    LOG_I(TAG, "[SAFETY-P4] activateOfflineMode: Rule %d actuator GPIO %d "
          "cfg.current_state=%s, is_active=%s",
          i,
          offline_rules_[i].actuator_gpio,
          (cfg.gpio != 255) ? (cfg.current_state ? "ON" : "OFF") : "N/A",
          offline_rules_[i].is_active ? "true" : "false");
}
```

### Validierung nach Schritt 1:

Serial-Monitor beim Wechsel in Offline-Mode (Server stoppen):
- Jede Regel muss `is_active` korrekt anzeigen
- Wenn Aktor gerade AN: `is_active=true`
- Wenn Aktor gerade AUS: `is_active=false`
- Der nachfolgende evaluateOfflineRules()-Zyklus darf keinen sofortigen Toggle ausloesen wenn
  der Sensorwert im Deadband liegt

---

## Schritt 2: NVS-Persistenz fuer is_active — Power-Cycle-Szenario

**Dateien:**
- `src/services/safety/offline_mode_manager.cpp` — evaluateOfflineRules(), saveOfflineRulesToNVS(), loadOfflineRulesFromNVS(), parseOfflineRules()
- NVS Namespace: `"offline"` (bereits vorhanden)

**Ziel:** `is_active` wird in NVS geschrieben wenn sich der Zustand aendert, so dass nach
einem Power-Cycle die Regeln mit dem zuletzt bekannten Zustand starten.

### Wichtig: Shadow-Copy-Konsistenz

`saveOfflineRulesToNVS()` verwendet eine Shadow-Copy ueber den kompletten `OfflineRule`-Struct
(inkl. `is_active`). Wenn `is_active` geaendert wird, muss die Shadow-Copy korrekt aktualisiert
werden, damit der naechste Vergleich stimmt. Es gibt zwei Optionen:

**Option A (empfohlen): is_active in den bestehenden Save/Load-Zyklus integrieren.**
In `saveOfflineRulesToNVS()` den neuen Key `ofr_{i}_state` mitschreiben. In `loadOfflineRulesFromNVS()`
den Key mitlesen. Die Shadow-Copy enthaelt den gesamten Struct inkl. is_active — Konsistenz ist
automatisch gegeben. Der separate NVS-Write in evaluateOfflineRules() (2a unten) entfaellt,
stattdessen wird nach jedem Zustandswechsel `saveOfflineRulesToNVS()` aufgerufen.

**Option B: Separater NVS-Write in evaluateOfflineRules().**
`is_active` wird separat geschrieben, OHNE die Shadow-Copy zu aktualisieren. Das ist einfacher
aber inkonsistent mit dem Pattern. In diesem Fall muss die Shadow-Copy den is_active-Wert
AUSKLAMMERN beim Vergleich, oder der Struct-Compare muss um is_active bereinigt werden.

**Der Agent soll Option A oder B waehlen und die Wahl kurz im Code kommentieren.**

### 2a: NVS-Key fuer is_active schreiben

**Bei Option A:** In `saveOfflineRulesToNVS()`, nach den bestehenden Keys, den State mitschreiben:

```cpp
char state_key[16];
snprintf(state_key, sizeof(state_key), "ofr_%d_state", i);
storageManager.putUInt8(state_key, offline_rules_[i].is_active ? 1 : 0);
```

**Bei Option B:** In `evaluateOfflineRules()` (Zeile 161-193), direkt nach dem Zustandswechsel:

```cpp
if (new_state != rule.is_active) {
    bool success = actuatorManager.controlActuatorBinary(rule.actuator_gpio, new_state);
    if (success || !new_state) {
        rule.is_active = new_state;

        // is_active in NVS persistieren (nur bei Zustandswechsel — Wear-Schutz
        // durch die Bedingung "new_state != rule.is_active")
        char state_key[16];
        snprintf(state_key, sizeof(state_key), "ofr_%d_state", i);
        if (storageManager.beginNamespace("offline", false)) {
            storageManager.putUInt8(state_key, rule.is_active ? 1 : 0);
            storageManager.endNamespace();
        }
    }
}
```

**Wear-Schutz:** NVS wird nur bei tatsaechlichem Zustandswechsel beschrieben.
Hysterese-Uebergaenge passieren selten (typisch 1-2x pro Stunde). Realistische Write-Frequenz:
<< 10 Writes/Tag pro Rule. NVS-Wear ist kein Problem.

### 2b: is_active aus NVS laden in loadOfflineRulesFromNVS()

In `loadOfflineRulesFromNVS()` (Zeile ~288), nach dem Laden der Rule-Konfiguration, den
gespeicherten Zustand laden statt hardcoded false zu setzen:

```cpp
// NACH dem Laden aller anderen Keys fuer Rule i:
char state_key[16];
snprintf(state_key, sizeof(state_key), "ofr_%d_state", i);
if (storageManager.keyExists(state_key)) {
    uint8_t saved_state = storageManager.getUInt8(state_key, 0);
    rules[i].is_active = (saved_state == 1);
    LOG_I(TAG, "[CONFIG] NVS Rule %d: is_active=%s (aus NVS geladen)",
          i, rules[i].is_active ? "true" : "false");
} else {
    rules[i].is_active = false;  // Kein gespeicherter Zustand → Sicherheits-Default
    LOG_D(TAG, "[CONFIG] NVS Rule %d: is_active=false (kein NVS-Key, Default)", i);
}
```

### 2c: parseOfflineRules() — is_active NICHT blind ueberschreiben

In `parseOfflineRules()` (Zeile ~239), wenn ein Config-Push die Rules neu parst, das Feld
`is_active` NICHT auf false setzen. Stattdessen:

- Wenn der Server ein `current_state_active`-Feld im Rule-Payload mitsendet (Schritt 3) →
  diesen Wert verwenden
- Wenn nicht → bestehenden `is_active`-Wert BEHALTEN

```cpp
// SOLL in parseOfflineRules() fuer jede Rule i:
// (Zeile "rule.is_active = false;" ENTFERNEN und ersetzen durch:)

if (doc[i].containsKey("current_state_active")) {
    rule.is_active = doc[i]["current_state_active"].as<bool>();
} else {
    // Bestehenden Wert beibehalten — ist entweder aus NVS (loadFromNVS lief vorher)
    // oder false (erster Boot ohne NVS-Eintrag)
    // rule.is_active bleibt unveraendert
}
```

**Achtung Shadow-Copy:** Wenn `is_active` beim Config-Push nicht mehr resettet wird, aendert
sich der Struct-Inhalt bei einem Push wo NUR die Schwellwerte aktualisiert werden weniger als
vorher. Die Shadow-Copy muss trotzdem korrekt aktualisiert werden. Sicherstellen dass nach
`parseOfflineRules()` die Shadow-Copy den neuen Struct-Zustand (inkl. beibehaltenes is_active)
korrekt widerspiegelt. Falls `parseOfflineRules()` den Shadow-Copy-Sync selbst macht, ist
das bereits abgedeckt. Falls nicht, muss der Agent das nachholen.

---

## Schritt 3: Config-Push erweitern — Server sendet aktuellen Hysterese-State (BACKEND)

**Datei:** `god_kaiser_server/src/services/config_builder.py`
**Funktion:** `_extract_offline_rule()` (~Zeile 421)

**Ziel:** Der Server weiss aus seiner Datenbank (hysteresis_evaluator hat DB-Persistenz ueber
die Tabelle `logic_hysteresis_states`) ob eine Logic-Engine-Hysterese-Regel gerade aktiv ist.
Dieses Wissen soll in den Config-Push einfliessen, damit der ESP beim Config-Push-Empfang
den Server-seitigen Zustand uebernimmt.

**Hintergrund Server-Persistenz:** Die Logic-Engine-Hysterese (`hysteresis_evaluator.py`) speichert
ihren Zustand in der Datenbank. `_persist_state()` und `load_states_from_db()` sind implementiert.
Das DB-Modell `LogicHysteresisState` existiert (Migration `add_logic_hysteresis_states.py`).

### Wichtig: async/sync Kontext pruefen

`_extract_offline_rule()` hat aktuell die Signatur:
```python
def _extract_offline_rule(self, rule, esp_id) -> Optional[Dict]
```

Das ist eine synchrone Methode. Fuer einen DB-Query muss sie zu `async def` werden:
```python
async def _extract_offline_rule(self, rule, esp_id) -> Optional[Dict]
```

**Der Agent MUSS pruefen:** Ist die aufrufende Methode (die `_extract_offline_rule()` bei
~Zeile 334 aufruft) bereits `async`? Falls ja, nur `await` vor den Aufruf setzen. Falls nein,
muss die gesamte Aufrufkette bis zur naechsten async-Methode angepasst werden.

### Was zu tun ist:

In `_extract_offline_rule()` nach dem Extrahieren der Schwellenwerte den aktuellen Hysterese-Zustand
der entsprechenden Logic-Regel aus der DB laden:

```python
# In _extract_offline_rule(self, rule, esp_id):
# Nach dem Extrahieren von activate_below, deactivate_above etc.:

# Aktuellen Hysterese-State fuer diese Rule aus der DB laden
current_state_active = False
try:
    # LogicHysteresisState abfragen — Key-Format pruefen:
    # hysteresis_evaluator speichert States per "{rule_id}:{condition_index}"
    # Den passenden State-Eintrag fuer diese Rule finden
    hysteresis_state = await self._get_hysteresis_state_for_rule(rule.id)
    if hysteresis_state is not None:
        current_state_active = hysteresis_state.is_active
except Exception as e:
    logger.warning(f"Could not load hysteresis state for rule {rule.id}: {e}")
    # Fallback: false — sicherer als ein falscher Zustand

offline_rule_dict["current_state_active"] = current_state_active
```

Die Hilfsmethode `_get_hysteresis_state_for_rule(rule_id)` muss die DB-Tabelle abfragen die
`add_logic_hysteresis_states.py` erstellt hat. Die `HysteresisConditionEvaluator`-Klasse hat
bereits `load_states_from_db()` — diesen Code als Vorlage fuer die Query verwenden.

**Wichtig:** Diese Methode ist nur fuer den Fall relevant wo eine Logic-Engine-Regel DIREKT mit
einer Offline-Rule korrespondiert. Wenn keine entsprechende Logic-Regel existiert (z.B. Offline-Rule
ohne Server-Pendant), bleibt `current_state_active = False`. Der ESP-seitige NVS-Wert (Schritt 2)
ist der primaere Mechanismus fuer Zustandskontinuitaet.

**ESP-seitig (parseOfflineRules):** Bereits in Schritt 2c beschrieben — das Feld auslesen.

---

## Akzeptanzkriterien

Die folgenden Szenarien muessen alle bestanden sein bevor der Fix als erledigt gilt.
Jedes Szenario muss im Serial-Monitor verfolgt werden koennen.

**AK-1 — Diagnoselog (Vorbedingung oder Schritt 0 Output):**
- Serial-Monitor zeigt bei jedem Wechsel in OFFLINE_ACTIVE eine Zeile pro Rule:
  `[SAFETY-P4] Rule N: actuator GPIO X is_active initialized from hardware state -> ON/OFF`
- Die `is_active`-Werte stimmen mit dem tatsaechlichen Aktor-Zustand ueberein

**AK-2 — Warmstart, Regel nicht aktiv:**
- Feuchte >= 45% (obere Schwelle), Aktor AUS, Server wird gestoppt
- Serial zeigt: `is_active=false` fuer die Feuchte-Regel
- Feuchte faellt unter 40% (activate_below) → Aktor schaltet EIN
- Feuchte steigt auf 48% (Deadband) → Aktor bleibt AN (KEINE Aktion)
- Feuchte steigt auf 52% (deactivate_above) → Aktor schaltet AUS

**AK-3 — Warmstart, Regel aktiv (Robins Problemfall):**
- Feuchte war < 40%, Aktor laeuft, Feuchte jetzt 48% (im Deadband), Server wird gestoppt
- Serial zeigt: `is_active=true` fuer die Feuchte-Regel
- Keine Aktion im Deadband — Aktor bleibt AN
- Feuchte steigt auf 52% → Aktor schaltet AUS (korrekte Deaktivierung)
- Feuchte faellt auf 38% → Aktor schaltet wieder EIN

**AK-4 — Power-Cycle, Server offline:**
- Aktor war AN, ESP wird stromlos gemacht, Server bleibt offline
- Nach Power-Cycle: Serial zeigt NVS-Load mit `is_active=true` fuer die entsprechende Regel
- Offline-Mode startet sofort (nach 30s Grace Period)
- Feuchte-Sensor liefert Wert im Deadband → Aktor bleibt AN (korrekt)

**AK-5 — Power-Cycle, Server online:**
- Aktor war AN, ESP wird stromlos gemacht
- Nach Power-Cycle: ESP verbindet mit Server, Server sendet Config-Push mit `current_state_active=true`
- Serial zeigt: `is_active=true` aus Config-Push uebernommen

**AK-6 — Keine Regression bei inaktiver Regel:**
- Feuchte liegt dauerhaft im normalen Bereich (keine Schwellen unterschritten/ueberschritten)
- Server wird gestoppt → Offline-Mode aktiv
- Feuchte bleibt im normalen Bereich → kein Aktor-Toggle, kein unerwuenschtes Schalten

---

## Einschraenkungen

- **Nur diese Dateien aendern:**
  - `src/services/safety/offline_mode_manager.cpp`
  - `src/services/safety/offline_mode_manager.h` (nur falls neue Methoden-Signaturen noetig)
  - `src/services/actuator/actuator_manager.h` / `actuator_manager.cpp` (nur falls
    `getActuatorCurrentState()` fehlt und ergaenzt werden muss)
  - Backend: `god_kaiser_server/src/services/config_builder.py` (nur `_extract_offline_rule()`)

- **evaluateOfflineRules()-Kernlogik NICHT umschreiben** — sie ist korrekt. Nur `is_active`-Initialisierung
  und NVS-Write nach Zustandswechsel werden hinzugefuegt.

- **NVS-Key-Schema unveraendert lassen** — nur einen neuen Key `ofr_{i}_state` hinzufuegen,
  keine bestehenden Keys umbenennen oder entfernen.

- **StorageManager-API korrekt verwenden:**
  - `putUInt8()` (NICHT putUChar)
  - `getUInt8()` (NICHT getUChar)
  - `keyExists()` (NICHT hasKey)
  - `endNamespace()` (NICHT end)

- **requiresCalibration()-Guard NICHT aendern** — er filtert Sensor-Typen die Kalibrierung
  brauchen korrekt aus den Offline-Rules heraus.

- **Keine neuen Dateien erstellen** — alles in den genannten bestehenden Dateien aendern.

- **Schritt 0 ist PFLICHT** — nicht direkt mit Schritt 1 beginnen. Das bestehende Log
  `[SAFETY-P4] Rule N: ...` im Serial-Monitor beobachten. Falls das nicht ausreicht, das
  erweiterte Diagnose-Log einbauen. Erst nach dokumentierter Root-Cause mit Schritt 1 beginnen.

- **Abhaengigkeit zu FIX-FW-OFFLINE-SAFETY:** Dieser Auftrag kann unabhaengig laufen, aber der
  Dual-Modus-Toggle-Bug (Bug 1 in jenem Auftrag) verstaerkt jeden is_active-Fehler. Fuer
  aussagekraeftige AK-Tests sollte FIX-FW-OFFLINE-SAFETY ebenfalls eingespielt sein oder der
  Testaufbau explizit einen Single-Modus (nur Cooling oder nur Heating) verwenden.

---

## Reihenfolge der Implementierung

```
0. Robin: Bestehendes Diagnose-Log im Serial-Monitor beobachten + Ergebnis melden
1. Schritt 0 — Falls noetig: Erweitertes Diagnose-Logging einbauen + bauen + flashen + Live-Test
2. Diagnose-Ergebnis dokumentieren (Kommentar im Code oder Notiz an Robin)
3. Schritt 1 — activateOfflineMode() Fix basierend auf Diagnose-Ergebnis
4. Schritt 2 — NVS is_active persistieren (save + load + parse, Shadow-Copy-Strategie dokumentieren)
5. AK-1 + AK-2 + AK-3 + AK-4 testen (Warmstart + Power-Cycle)
6. Schritt 3 — Backend Config-Push Erweiterung (async-Kontext pruefen)
7. AK-5 testen (Server-Push Sync)
8. AK-6 testen (Keine Regression)
```
