# Auftrag R20-P11 — Actuator Config: Skip Unchanged (Remove+Re-Add Zyklus)

**Typ:** Bugfix — Firmware (El Trabajante)
**Schwere:** HIGH
**Erstellt:** 2026-03-26
**Status:** IMPLEMENTIERT (2026-03-28)
**Ziel-Agent:** esp32-dev
**Aufwand:** ~1-2h
**Abhaengigkeit:** Keine — unabhaengig

---

## Hintergrund und Root Cause

Der Server sendet bei jedem Config-Push die komplette Sensor- und Aktor-Konfiguration
per MQTT an den ESP. Bei **Sensoren** prueft die Firmware ob sich etwas geaendert hat
und loggt korrekt `"Updating existing sensor on GPIO X"` — kein Entfernen, kein Neuanlegen.

Bei **Aktoren** fehlt diese Pruefung. In `configureActuator()` (Zeile 217-234 in
`src/services/actuator/actuator_manager.cpp`) wird **immer** `removeActuator()` aufgerufen,
selbst bei unveraenderter Config. Der existierende Check `bool type_changed =
(existing->config.actuator_type != config.actuator_type)` in Zeile 224 wird nicht genutzt
um eine Skip-Logik abzuleiten.

**Beobachtet im Live-System (ESP_EA5484, GPIO 14, Relay "Luftbefeuchter"):**

Der Config-Push passiert 3x innerhalb von 10 Minuten (Boot, Subzone-Assign, erneuter
Subzone-Assign). Jedes Mal:

```
Actuator Manager: Runtime reconfiguration on GPIO 14
Actuator Manager: Removing actuator on GPIO 14
  Stopping actuator before removal
Releasing GPIO 14 (was: actuator/Luftbefeuchter)
Pin 14 verification failed - expected HIGH, got LOW    <-- GPIO kurz undefiniert
Pin 14 may not be in safe state after release
GPIOManager: Pin 14 released to safe mode
Actuator configurations saved successfully (0 actuators)  <-- kurz 0 Aktoren!
Actuator removed from GPIO 14
GPIOManager: Pin 14 allocated to Luftbefeuchter
PumpActuator initialized on GPIO 14
Actuator configurations saved successfully (1 actuators)
Actuator reconfigured on GPIO 14 type: relay
```

**Konsequenzen:**

1. **GPIO-Glitch:** Der Aktor-Pin wird kurz freigegeben und geht in Safe-Mode.
   Bei einem Relay/Pumpe kann das eine kurze Schaltflanke verursachen — ungewollt.
2. **NVS-Verschleiss:** Bei jedem Config-Push werden 2 NVS-Writes ausgefuehrt
   (0 Aktoren speichern via `removeActuator()` Zeile 319, dann n Aktoren speichern
   via `configureActuator()` Zeile 277). NVS hat begrenzte Schreibzyklen.
3. **Zustandsverlust:** Falls der Aktor gerade ON war, wird er durch Remove+Re-Add
   auf OFF zurueckgesetzt. Das ist besonders kritisch bei laufenden Bewaesserungen
   oder Belueftungen.
4. **Log-Spam:** 12 Zeilen Log pro Config-Push statt 1 Zeile "no changes".

---

## IST-Zustand

**Datei:** `src/services/actuator/actuator_manager.cpp`

**Aufrufkette:** MQTT-Nachricht → `handleActuatorConfig(const String& payload, const String& correlation_id)` (Zeile 739, MQTT-Parser) → `configureActuator(const ActuatorConfig& config)` (Zeile 187, eigentliche Logik).

**Der Fix muss in `configureActuator()` erfolgen**, nicht in `handleActuatorConfig()`.

Aktuelles Verhalten in `configureActuator()` (Pseudocode, vereinfacht):
```cpp
bool ActuatorManager::configureActuator(const ActuatorConfig& config) {
    // Zeile 198-202: active=false → Deaktivierung/Entfernung (BEIBEHALTEN)
    if (!config.active) {
        removeActuator(config.gpio);
        return true;
    }

    RegisteredActuator* existing = findActuator(config.gpio);
    if (existing) {
        // Zeile 224: type_changed wird berechnet, aber...
        bool type_changed = (existing->config.actuator_type != config.actuator_type);

        // ...es wird IMMER removeActuator() aufgerufen (Zeile 217-234)
        removeActuator(config.gpio);   // GPIO release, NVS write (0 Aktoren)
    }

    // Immer neu erstellen
    createActuator(config);            // GPIO allocate, NVS write (n Aktoren)
}
```

**Vergleich: So macht es der SensorManager (korrekt):**
```
Sensor Manager: Updating existing sensor on GPIO 4     <-- kein Remove
Sensor Manager: Updated sensor on GPIO 4 (ds18b20)     <-- nur Update
```

---

## SOLL-Zustand

### Schritt 1 — Vergleich vor Rekonfiguration

In `configureActuator()` pruefen ob sich die Konfiguration tatsaechlich geaendert hat.
Die Logik baut auf dem bereits existierenden `type_changed`-Check (Zeile 224) auf.

**Alle von `parseActuatorDefinition()` geparsten Felder muessen verglichen werden:**

| Feld (ActuatorConfig Struct) | Beschreibung |
|------------------------------|-------------|
| `gpio` | Pin-Nummer (implizit, da `findActuator(gpio)` darauf sucht) |
| `aux_gpio` | Hilfs-Pin (z.B. Richtung bei H-Bruecke) |
| `actuator_type` | relay, pump, valve, pwm |
| `actuator_name` | Anzeigename (Feld heisst `actuator_name`, NICHT `name`) |
| `subzone_id` | Subzone-Zuordnung — haeufigster Trigger fuer Config-Push! |
| `critical` | Safety-Einstufung |
| `inverted_logic` | Active-HIGH vs Active-LOW (Feld heisst `inverted_logic`, NICHT `inverted`) |
| `default_state` | Startzustand nach Boot |
| `default_pwm` | Standard-PWM-Wert |

**Hinweis:** `active` wird bereits separat behandelt (Zeile 198-202, vor dem Vergleich)
und ist daher NICHT Teil des Changed-Checks. `runtime_protection` (Struct mit
`max_runtime_ms`) wird von `parseActuatorDefinition()` nicht geparst und muss daher
ebenfalls nicht verglichen werden.

```cpp
bool ActuatorManager::configureActuator(const ActuatorConfig& config) {
    // --- active=false Behandlung bleibt UNVERAENDERT (Zeile 198-202) ---
    if (!config.active) {
        removeActuator(config.gpio);
        return true;
    }

    RegisteredActuator* existing = findActuator(config.gpio);
    if (existing) {
        // Vergleich: Hat sich etwas strukturell geaendert?
        bool type_changed = (existing->config.actuator_type != config.actuator_type);
        bool gpio_changed = (existing->config.aux_gpio != config.aux_gpio);
        bool structural_changed = type_changed || gpio_changed;

        // Vergleich: Hat sich etwas an der Config geaendert (kein Remove noetig)?
        bool name_changed = (existing->config.actuator_name != config.actuator_name);
        bool subzone_changed = (existing->config.subzone_id != config.subzone_id);
        bool critical_changed = (existing->config.critical != config.critical);
        bool invert_changed = (existing->config.inverted_logic != config.inverted_logic);
        bool default_state_changed = (existing->config.default_state != config.default_state);
        bool default_pwm_changed = (existing->config.default_pwm != config.default_pwm);

        bool soft_changed = name_changed || subzone_changed || critical_changed
                         || invert_changed || default_state_changed || default_pwm_changed;

        if (!structural_changed && !soft_changed) {
            // Nichts zu tun — Config ist identisch
            LOG_INFO("ACTUATOR", "Actuator on GPIO %d unchanged, skipping reconfiguration",
                     config.gpio);
            return true;
        }

        if (structural_changed) {
            // Typ oder aux_gpio geaendert → voller Remove+Re-Add-Zyklus noetig
            LOG_INFO("ACTUATOR", "Actuator on GPIO %d type/aux changed, full reconfiguration",
                     config.gpio);
            removeActuator(config.gpio);
            // Fall-through zu createActuator() unten
        } else {
            // Nur Soft-Felder geaendert → Schritt 3 (Soft-Update)
            goto soft_update;
        }
    }

    // Neuer Aktor oder nach Remove: erstellen
    createActuator(config);
    return true;

soft_update:
    // Schritt 3 — siehe unten
    ...
}
```

### Schritt 2 — NVS-Write nur bei Aenderung

Aktuell wird `configManager.saveActuatorConfig(actuators, count)` bei jedem Config-Push
2x aufgerufen (nach Remove mit 0, nach Add mit n). Nach Schritt 1 passiert kein
NVS-Write mehr wenn sich nichts aendert, weil der `return true`-Pfad vor dem Remove liegt.

**Wichtig:** Die korrekte Save-Methode ist `configManager.saveActuatorConfig(actuators, count)`
(mit Parametern), NICHT `saveActuatorConfigs()` (ohne Parameter, existiert nicht).

### Schritt 3 — Soft-Update fuer nicht-strukturelle Aenderungen

Falls sich nur Name, Subzone, Critical, Inverted-Logic, Default-State oder Default-PWM
aendern (aber nicht GPIO oder Typ), reicht ein In-Place-Update der Config-Felder ohne
Remove+Re-Add. Das vermeidet GPIO-Glitches bei harmlosen Config-Aenderungen.

```cpp
soft_update:
    // Soft-Felder direkt auf dem existierenden Aktor aktualisieren
    existing->config.actuator_name = config.actuator_name;
    existing->config.subzone_id = config.subzone_id;
    existing->config.critical = config.critical;
    existing->config.inverted_logic = config.inverted_logic;
    existing->config.default_state = config.default_state;
    existing->config.default_pwm = config.default_pwm;

    // NVS einmal schreiben
    configManager.saveActuatorConfig(actuators, count);

    LOG_INFO("ACTUATOR", "Actuator on GPIO %d config updated (soft, no GPIO change)",
             config.gpio);
    return true;
```

**Warum `subzone_id` besonders wichtig ist:** Subzone-Reassignment ist der haeufigste
Trigger fuer Config-Push im Live-System. Ohne `subzone_id` im Vergleich werden ca. 90%
der unnuetigen Remove+Re-Adds nicht verhindert.

---

## Was NICHT geaendert werden darf

- Die Remove+Re-Add-Logik selbst (wird weiterhin benoetigt wenn sich der Typ aendert,
  z.B. von Relay auf PWM — anderer Aktor-Typ braucht andere Instanz)
- Die `active=false` Behandlung in Zeile 198-202 (muss VOR dem Vergleich bleiben)
- SafetyController und Emergency-Stop-Pfade
- Die GPIO-Manager Pin-Allokation (bleibt wie sie ist, wird nur seltener aufgerufen)
- `handleActuatorConfig()` (Zeile 739) — der MQTT-Parser bleibt unveraendert
- Sensor-Manager (funktioniert bereits korrekt)
- MQTT-Topic-Struktur

---

## Akzeptanzkriterien

- [ ] Bei Config-Push ohne Aenderungen: Log zeigt "unchanged, skipping" statt
      Remove+Re-Add-Zyklus
- [ ] GPIO bleibt stabil — kein kurzzeitiges Release wenn sich nichts aendert
- [ ] NVS wird nicht beschrieben wenn sich nichts aendert (0 Writes statt 2)
- [ ] Bei Subzone-Aenderung: Soft-Update ohne GPIO-Release, NVS 1x geschrieben
- [ ] Bei tatsaechlicher Typ-Aenderung (z.B. Relay→PWM) funktioniert Remove+Re-Add
      weiterhin korrekt
- [ ] Bei `active=false` Config: Aktor wird weiterhin entfernt (bestehende Logik)
- [ ] Ein laufender Aktor (ON) bleibt ON wenn der Config-Push nur identische Daten sendet
- [ ] Alle 9 geparsten Felder werden verglichen (gpio implizit, aux_gpio, actuator_type,
      actuator_name, subzone_id, critical, inverted_logic, default_state, default_pwm)
- [ ] Firmware kompiliert ohne Errors
- [ ] Config-Response wird weiterhin korrekt gesendet (unabhaengig von P9 SafePublish)

---

> Erstellt von: automation-experte (basierend auf Live-ESP-Log ESP_EA5484)
> Korrigiert: 2026-03-27 (Verifikation: 6 API-Referenzen, 5 fehlende Felder, Agent-Name)
> Roadmap-Referenz: R20-P11 — Neuer Befund aus Boot-Log-Analyse 2026-03-26
