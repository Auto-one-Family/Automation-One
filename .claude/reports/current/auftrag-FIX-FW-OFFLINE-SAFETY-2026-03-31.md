# FIX-FW-OFFLINE-SAFETY — Offline-Rule Hysterese, RuntimeProtection, NVS, Timing, Logging

> **Typ:** Fix (Analyse abgeschlossen, alle Code-Stellen bekannt)
> **Prio:** CRITICAL
> **Schicht:** Firmware (El Trabajante)
> **Aufwand:** ~6-8h
> **Empfohlener Agent:** esp32-dev
> **Datum:** 2026-03-31
> **Quelle:** Live-Test ESP_EA5484 + Code-Analyse mit exakten Referenzen

---

## Zusammenfassung

Das Offline-Safety-System (SAFETY-P4) hat 5 zusammenhaengende Bugs die sich gegenseitig verstaerken. Der Kern: Die Offline-Rule-Hysterese togglet den Aktor alle ~5s zwischen ON und OFF bei konstantem Sensorwert, die RuntimeProtection blockiert dann jede Aktivierung, und der NVS-Namespace existiert nicht. Alle Code-Stellen sind durch die Analyse verifiziert.

**Abhaengigkeitskette der Bugs:**
```
Bug 1 (Dual-Modus-Logik) + Bug 2 (is_active ohne Bestaetigung)
    → Toggle alle ~5s
    → Bug 3 (RuntimeProtection erschoepft 60 Aktivierungen/h)
    → Pumpe blockiert permanent
    → SafePublish-Spam (MQTT offline)
    → Bug 4 (NVS nie beschrieben → kein Persistence)
    → Bug 5 (5s Intervall zu schnell fuer Klimasteuerung)
```

---

## Bug 1: Dual-Modus-Logik — Heizen UND Kuehlen gleichzeitig aktiv (ROOT CAUSE)

### IST-Zustand

**Datei:** `src/services/safety/offline_mode_manager.cpp`, Zeile 157-189

```cpp
bool new_state = rule.is_active;

// Heating mode: activate_below / deactivate_above
bool has_heating = (rule.activate_below != 0.0f || rule.deactivate_above != 0.0f);
if (has_heating) {
    if (!rule.is_active && val < rule.activate_below) new_state = true;
    if (rule.is_active && val > rule.deactivate_above) new_state = false;
}

// Cooling mode: activate_above / deactivate_below
bool has_cooling = (rule.activate_above != 0.0f || rule.deactivate_below != 0.0f);
if (has_cooling) {
    if (!rule.is_active && val > rule.activate_above) new_state = true;
    if (rule.is_active && val < rule.deactivate_below) new_state = false;
}
```

### Problem

Die Pruefung `rule.activate_below != 0.0f || rule.deactivate_above != 0.0f` aktiviert den Heiz-Pfad sobald IRGENDEIN Heiz-Schwellenwert ungleich 0 ist. Analog fuer Kuehlen. Wenn der Server-Payload oder die NVS-Defaults fuer BEIDE Paare Werte ungleich 0 liefern, laufen **beide Pfade in derselben Evaluation**.

Konkretes Szenario mit val=42.5°C und invertierten/ueberlappenden Schwellen:
- Zyklus 1 (is_active=false): Heiz-Block sagt ON (42.5 < activate_below) → new_state=true
- Zyklus 1: Kuehl-Block sagt auch ON (42.5 > activate_above) → new_state bleibt true
- is_active wird true, aber Pumpe wird von RuntimeProtection geblockt (→ Bug 2)
- Zyklus 2 (is_active=true): Heiz-Block sagt OFF (42.5 > deactivate_above, wenn deactivate_above < 42.5)
- new_state=false, is_active wird false
- Zyklus 3: Wieder ON → **Endlos-Toggle**

Zusaetzlich: Wenn `deactivate_above <= activate_below` (invertierte Schwellen), gibt es KEIN Deadband. Jeder Wert triggert abwechselnd Ein und Aus.

### SOLL-Zustand

Pro Offline-Rule darf nur **EIN** Modus aktiv sein (Heizen ODER Kuehlen). Die Rule-Struktur braucht ein explizites Modus-Feld. Im Deadband zwischen den Schwellen darf KEINE Zustandsaenderung stattfinden.

### Fix

**Schritt 1:** Modus-Feld in `OfflineRule` Struct hinzufuegen

**Datei:** `src/models/offline_rule.h`

```cpp
// IST (Zeile 15-28) — VERIFIZIERT gegen echten Code:
static const uint8_t MAX_OFFLINE_RULES = 8;

struct OfflineRule {
    bool    enabled;              // [Korrektur] Feld existiert in echtem Code, Plan-IST fehlte es
    uint8_t actuator_gpio;        // [Korrektur] Reihenfolge: actuator_gpio VOR sensor_gpio
    uint8_t sensor_gpio;
    char    sensor_value_type[24];  // [Korrektur] Name & Groesse: sensor_value_type[24], nicht sensor_type[16]
    float   activate_below;       // Heating mode
    float   deactivate_above;     // Heating mode
    float   activate_above;       // Cooling mode
    float   deactivate_below;     // Cooling mode
    bool    is_active;
    bool    server_override;
};

// SOLL — inkl. mode-Feld, alle bestehenden Felder erhalten:
enum OfflineRuleMode : uint8_t {
    MODE_HEATING = 0,   // activate_below / deactivate_above
    MODE_COOLING = 1    // activate_above / deactivate_below
};

struct OfflineRule {
    bool    enabled;              // [Korrektur] unveraendert behalten
    uint8_t actuator_gpio;        // [Korrektur] Reihenfolge wie in echtem Code
    uint8_t sensor_gpio;
    char    sensor_value_type[24];  // [Korrektur] korrekter Name & Groesse
    float   activate_below;       // Nur relevant bei MODE_HEATING
    float   deactivate_above;     // Nur relevant bei MODE_HEATING
    float   activate_above;       // Nur relevant bei MODE_COOLING
    float   deactivate_below;     // Nur relevant bei MODE_COOLING
    OfflineRuleMode mode;         // NEU: Expliziter Modus
    bool    is_active;
    bool    server_override;
};
```

**Schritt 2:** Modus aus Config-Push parsen

Beim Parsen der Offline-Rules aus dem Config-Push (`parseOfflineRules()` in `offline_mode_manager.cpp`) den Modus bestimmen:

```cpp
// Modus-Erkennung: Wenn activate_below gesetzt → Heating, sonst Cooling
if (rule.activate_below != 0.0f || rule.deactivate_above != 0.0f) {
    rule.mode = MODE_HEATING;
    rule.activate_above = 0.0f;   // Kuehlen-Werte explizit loeschen
    rule.deactivate_below = 0.0f;
} else {
    rule.mode = MODE_COOLING;
    rule.activate_below = 0.0f;   // Heizen-Werte explizit loeschen
    rule.deactivate_above = 0.0f;
}
```

**Schritt 3:** Evaluation nur fuer aktiven Modus

**Datei:** `src/services/safety/offline_mode_manager.cpp`, Zeile 157-189 ersetzen:

```cpp
bool new_state = rule.is_active;

if (rule.mode == MODE_HEATING) {
    // Heating: Einschalten wenn Wert UNTER activate_below faellt
    //          Ausschalten wenn Wert UEBER deactivate_above steigt
    //          Deadband dazwischen: KEINE Aenderung
    if (!rule.is_active && val < rule.activate_below) {
        new_state = true;
    } else if (rule.is_active && val > rule.deactivate_above) {
        new_state = false;
    }
    // Sonst: new_state bleibt rule.is_active (Deadband)
} else {  // MODE_COOLING
    // Cooling: Einschalten wenn Wert UEBER activate_above steigt
    //          Ausschalten wenn Wert UNTER deactivate_below faellt
    //          Deadband dazwischen: KEINE Aenderung
    if (!rule.is_active && val > rule.activate_above) {
        new_state = true;
    } else if (rule.is_active && val < rule.deactivate_below) {
        new_state = false;
    }
    // Sonst: new_state bleibt rule.is_active (Deadband)
}
```

**Schritt 4:** Schwellenwert-Validierung beim Parsen

Nach dem Parsen die Schwellenwerte validieren:

```cpp
// Heizen: deactivate_above MUSS groesser als activate_below sein (sonst kein Deadband)
if (rule.mode == MODE_HEATING && rule.deactivate_above <= rule.activate_below) {
    LOG_W(TAG, "Rule %d: Invalid heating thresholds (deactivate_above %.1f <= activate_below %.1f) — skipping",
          i, rule.deactivate_above, rule.activate_below);
    continue;  // Rule ignorieren
}
// Kuehlen: activate_above MUSS groesser als deactivate_below sein
if (rule.mode == MODE_COOLING && rule.activate_above <= rule.deactivate_below) {
    LOG_W(TAG, "Rule %d: Invalid cooling thresholds (activate_above %.1f <= deactivate_below %.1f) — skipping",
          i, rule.activate_above, rule.deactivate_below);
    continue;
}
```

---

## Bug 2: `is_active` wird gesetzt BEVOR der Aktor bestaetigt (VERSTAERKT TOGGLE)

### IST-Zustand

**Datei:** `src/services/safety/offline_mode_manager.cpp`, Zeile 181-188

```cpp
if (new_state != rule.is_active) {
    rule.is_active = new_state;                                    // ← HIER: State gesetzt
    actuatorManager.controlActuatorBinary(rule.actuator_gpio, new_state);  // ← DANACH: Aktor geschaltet
    LOG_I(TAG, String("[SAFETY-P4] Rule ") + String(i) + ...
```

### Problem

`rule.is_active` wird auf `true` gesetzt, BEVOR `controlActuatorBinary()` aufgerufen wird. Wenn die Pumpe durch `PumpActuator::canActivate()` geblockt wird:
- `rule.is_active = true` (obwohl Pumpe AUS bleibt)
- Naechster Zyklus: `is_active` ist `true`, Deaktivierungs-Bedingung greift → `is_active = false`
- → Endlos-Toggle zwischen `true` (geblockt) und `false`

Das Log behauptet "GPIO 14 -> ON" obwohl die Pumpe nie eingeschaltet wurde.

### Fix

`is_active` nur setzen wenn `controlActuatorBinary()` tatsaechlich `true` zurueckgibt:

```cpp
// SOLL (Zeile 181-188 ersetzen):
if (new_state != rule.is_active) {
    bool success = actuatorManager.controlActuatorBinary(rule.actuator_gpio, new_state);
    if (success) {
        rule.is_active = new_state;
        LOG_I(TAG, "[SAFETY-P4] Rule %d [%s] state=%s→%s: GPIO %d %s (sensor GPIO %d = %.2f, threshold=%.1f)",
              i,
              rule.mode == MODE_HEATING ? "HEATING" : "COOLING",
              rule.is_active ? "ON" : "OFF",
              new_state ? "ON" : "OFF",
              rule.actuator_gpio,
              new_state ? "ON" : "OFF",
              rule.sensor_gpio,
              val,
              rule.mode == MODE_HEATING ?
                  (new_state ? rule.activate_below : rule.deactivate_above) :
                  (new_state ? rule.activate_above : rule.deactivate_below));
    } else {
        LOG_W(TAG, "[SAFETY-P4] Rule %d: Actuator GPIO %d %s BLOCKED (sensor GPIO %d = %.2f)",
              i, rule.actuator_gpio, new_state ? "ON" : "OFF", rule.sensor_gpio, val);
        // is_active bleibt UNVERAENDERT — kein Toggle
    }
}
```

**WICHTIG:** Fuer OFF-Befehle (`new_state == false`) sollte `is_active` IMMER gesetzt werden, auch wenn `controlActuatorBinary` fehlschlaegt. Grund: Ein Aktor der nicht abgeschaltet werden kann ist ein groesseres Sicherheitsrisiko als ein Aktor der nicht eingeschaltet werden kann. Deshalb:

```cpp
if (new_state != rule.is_active) {
    bool success = actuatorManager.controlActuatorBinary(rule.actuator_gpio, new_state);
    if (success || !new_state) {
        // Erfolg ODER OFF-Befehl (OFF immer akzeptieren fuer Safety)
        rule.is_active = new_state;
        // ... Log mit Erfolg ...
    } else {
        // ON-Befehl gescheitert
        // is_active bleibt false — kein Toggle
        // ... Log mit BLOCKED ...
    }
}
```

---

## Bug 3: RuntimeProtection erschoepft bei Toggle (FOLGE-BUG)

### IST-Zustand

**Datei:** `src/services/actuator/actuator_drivers/pump_actuator.h`, Zeile 10-15

```cpp
struct RuntimeProtection {
    unsigned long max_runtime_ms = 3600000UL;      // 1h continuous runtime cap
    uint16_t max_activations_per_hour = 60;        // Duty-cycle protection
    unsigned long cooldown_ms = 30000UL;           // 30s cooldown after cutoff
    unsigned long activation_window_ms = 3600000UL;
};
```

**Datei:** `src/services/actuator/actuator_drivers/pump_actuator.cpp`, Zeile 169-196 — `canActivate()`:
- 60 Aktivierungen pro Stunde Limit
- 30s Cooldown nach max_runtime_ms Ueberschreitung
- Activation-History wird bei erfolgreichem ON inkrementiert

### Problem

Bei Toggle alle 5s verbraucht die Pumpe 60 erfolgreiche Aktivierungen in 5 Minuten (60 * 5s = 300s). Danach blockiert `canActivate()` JEDEN weiteren ON-Versuch fuer den Rest der Stunde.

**ABER:** Das ist ein FOLGE-BUG. Wenn Bug 1 und Bug 2 gefixt sind, gibt es kein Toggle mehr, und die RuntimeProtection wird nie erschoepft. **Kein separater Fix noetig.**

### Optionaler Verbesserungsvorschlag (nach Bug 1+2 Fix)

`setRuntimeProtection()` wird aktuell NIRGENDS aufgerufen (Analyse-Ergebnis). Die Defaults gelten immer. Fuer Offline-Rules koennte ein separater Zaehler oder ein lockerer Modus sinnvoll sein — aber das ist erst relevant NACH dem Toggle-Fix und sollte bewusst entschieden werden.

**Empfehlung:** Erst Bug 1+2 fixen, dann im Live-Test pruefen ob RuntimeProtection noch Probleme macht. Falls ja: `max_activations_per_hour` per Config-Push konfigurierbar machen (Auftrag SAFETY-P4-NVS-FINAL behandelt Config-Push-Themen).

---

## Bug 4: NVS Namespace `NOT_FOUND`

### IST-Zustand

**Datei:** `src/services/safety/offline_mode_manager.cpp`, Zeile 244-248

```cpp
void OfflineModeManager::loadOfflineRulesFromNVS() {
    if (!storageManager.beginNamespace("offline", true)) {   // ← READ-ONLY
        offline_rule_count_ = 0;
        LOG_D(TAG, "[CONFIG] NVS namespace 'offline' not found - no rules loaded");
```

### Problem

`beginNamespace("offline", true)` oeffnet mit Read-Only. Wenn der Namespace noch nie existiert hat (kein vorheriger Write), schlaegt `nvs_open()` mit `ESP_ERR_NVS_NOT_FOUND` fehl. Die Meldung `[E][Preferences.cpp:50] begin(): nvs_open failed: NOT_FOUND` erscheint alle 60s im Log.

Der Namespace wird erst bei `saveOfflineRulesToNVS()` mit `beginNamespace("offline", false)` (Read-Write) angelegt. Aber wenn nie ein Config-Push mit Offline-Rules angekommen ist, passiert das nie.

### Fix

Beim Boot einmal mit Read-Write oeffnen um den Namespace zu garantieren:

**Option A (einfach):** In `loadOfflineRulesFromNVS()` immer Read-Write oeffnen:

```cpp
void OfflineModeManager::loadOfflineRulesFromNVS() {
    // Read-Write oeffnen — erstellt Namespace automatisch falls nicht vorhanden
    if (!storageManager.beginNamespace("offline", false)) {
        offline_rule_count_ = 0;
        LOG_W(TAG, "[CONFIG] NVS namespace 'offline' could not be opened");
        return;
    }
    // ... rest der Load-Logik ...
}
```

**Option B (sauberer):** Einmal beim Boot garantieren und danach Read-Only verwenden:

```cpp
// In der Boot-Sequenz (z.B. setup() oder initSafety()):
void OfflineModeManager::initNVS() {
    // Namespace erstellen falls nicht vorhanden
    if (storageManager.beginNamespace("offline", false)) {
        // Pruefen ob Keys existieren
        if (!storageManager.hasKey("ofr_count")) {
            storageManager.putUInt("ofr_count", 0);
        }
        storageManager.end();
    }
}
```

**Empfehlung:** Option A ist einfacher und sicherer. NVS Read-Write hat keinen relevanten Performance-Nachteil bei lesenden Zugriffen.

### NVS und Custom Partition Table

Nach RTOS-IMPL wurde eine Custom Partition Table eingefuehrt (1.5MB App Partition). Pruefen ob die NVS-Partition korrekt konfiguriert ist:
- NVS-Partition muss in `partitions_custom.csv` vorhanden sein [Korrektur: echte Datei heisst `partitions_custom.csv`, nicht `partitions.csv`]
- Mindestens 20KB fuer NVS (Offline-Rules brauchen ~1.7KB)
- Falls die Partition geaendert wurde: `pio run -t erase` einmal ausfuehren

---

## Bug 5: Evaluierungs-Intervall zu kurz (5000ms)

### IST-Zustand

**Datei:** `src/tasks/safety_task.cpp`, Zeile 96-104

```cpp
static unsigned long last_offline_eval = 0;
static const unsigned long OFFLINE_EVAL_INTERVAL_MS = 5000;
if (offlineModeManager.isOfflineActive()) {
    if (millis() - last_offline_eval > OFFLINE_EVAL_INTERVAL_MS) {
        last_offline_eval = millis();
        offlineModeManager.evaluateOfflineRules();
```

### Problem

5 Sekunden ist fuer Klimasteuerung (Temperatur, Feuchtigkeit) viel zu schnell. Raumtemperatur aendert sich in Sekunden um weniger als 0.1°C. 5s erzeugt:
- Unnoetige CPU/GPIO-Last
- Schnelles Erschoepfen der RuntimeProtection bei Toggle-Bug
- Log-Spam (SAFETY-P4 Log alle 5s)
- Sensor-Rauschen kann zu Flattern fuehren (±0.1°C zwischen Zyklen)

### Fix

Intervall auf 30 Sekunden erhoehen (Standard fuer Klimasteuerung). Optional als Konstante im Header definieren fuer spaetere Konfigurierbarkeit:

```cpp
// IST:
static const unsigned long OFFLINE_EVAL_INTERVAL_MS = 5000;

// SOLL:
static const unsigned long OFFLINE_EVAL_INTERVAL_MS = 30000;  // 30s fuer Klimasteuerung
```

**Zusaetzlich:** Backoff nach fehlgeschlagenem ON-Versuch. Wenn der Aktor nicht geschaltet werden konnte (RuntimeProtection, Emergency-Stop), soll die naechste Evaluation doppelt so lange warten (max 120s):

```cpp
// In evaluateOfflineRules(), nach fehlgeschlagenem ON:
static unsigned long backoff_ms = 0;

if (!success && new_state) {
    // ON fehlgeschlagen → Backoff verdoppeln (max 120s)
    backoff_ms = min(backoff_ms == 0 ? OFFLINE_EVAL_INTERVAL_MS : backoff_ms * 2, 120000UL);
} else {
    backoff_ms = 0;  // Reset bei Erfolg oder OFF
}

// In safety_task.cpp:
unsigned long effective_interval = OFFLINE_EVAL_INTERVAL_MS + offlineModeManager.getBackoffMs();
if (millis() - last_offline_eval > effective_interval) { ... }
```

> **[Korrektur]** `getBackoffMs()` und `backoff_ms_` existieren noch nicht in `OfflineModeManager`. Beides muss in `offline_mode_manager.h` hinzugefuegt werden (Member-Variable + public Getter). `static backoff_ms` innerhalb von `evaluateOfflineRules()` scheidet aus, da der Wert in `safety_task.cpp` benoetigt wird. `offline_mode_manager.h` ist daher ebenfalls eine betroffene Datei (Tabelle unten ergaenzt).
>
> Zusaetzlich: Die Variablen `last_offline_eval` und `OFFLINE_EVAL_INTERVAL_MS` liegen in `safety_task.cpp` in einem Block-Scope `{}` (Zeilen 96-105). Der Backoff-Aufruf muss innerhalb desselben Blocks oder als Methoden-Parameter umgesetzt werden.

---

## Verbesserung: Log-Format (SAFETY-P4)

### IST-Zustand

```
[SAFETY-P4] Rule 0: GPIO 14 -> ON (sensor GPIO 0 = 42.57)
```

Fehlt: Modus, Schwellenwerte, vorheriger State, ob Aktor-Schaltung erfolgreich war.

### SOLL-Zustand

Bereits in Bug 2 Fix integriert. Zusammenfassung der Log-Formate:

```
// Erfolgreiche Zustandsaenderung:
[SAFETY-P4] Rule 0 [HEATING] OFF→ON: GPIO 14 ON (sensor GPIO 0 = 42.57, threshold<45.0)

// Deadband (keine Aenderung):
[SAFETY-P4] Rule 0 [HEATING] ON=ON: GPIO 14 HOLD (sensor GPIO 0 = 52.30, deadband 45.0-55.0)

// Aktor blockiert:
[SAFETY-P4] Rule 0 [HEATING] OFF→ON BLOCKED: GPIO 14 (sensor GPIO 0 = 42.57, threshold<45.0)

// Deaktivierung:
[SAFETY-P4] Rule 0 [HEATING] ON→OFF: GPIO 14 OFF (sensor GPIO 0 = 56.10, threshold>55.0)
```

**HINWEIS:** Deadband-Log nur bei Debug-Level (`LOG_D`), nicht bei jedem 30s-Zyklus.

---

## Implementierungs-Reihenfolge

1. **Bug 1** — Modus-Feld + Modus-Erkennung + Evaluations-Logik (~2h)
   - `offline_rule.h`: OfflineRuleMode enum + mode Feld
   - `offline_mode_manager.cpp`: parseOfflineRules() Modus-Erkennung + Validierung
   - `offline_mode_manager.cpp`: evaluateOfflineRules() nur aktiven Modus verwenden
2. **Bug 2** — is_active erst nach Bestaetigung (~1h)
   - `offline_mode_manager.cpp`: Zeile 181-188 ersetzen
   - Log-Format verbessern (gleiche Stelle)
3. **Bug 4** — NVS Read-Write (~30min)
   - `offline_mode_manager.cpp`: loadOfflineRulesFromNVS() auf Read-Write umstellen
   - Partition Table pruefen
4. **Bug 5** — Evaluierungs-Intervall + Backoff (~1h)
   - `safety_task.cpp`: Intervall auf 30000ms
   - Backoff-Logik in evaluateOfflineRules()
5. **NVS-Schema anpassen** — mode-Feld in NVS speichern/laden (~30min)
   - `saveOfflineRulesToNVS()`: mode-Feld speichern
   - `loadOfflineRulesFromNVS()`: mode-Feld laden
6. **Testen** (~2h)
   - Einzel-Rule Heating: Temperatur unter/ueber Schwelle → korrekt ON/OFF/Deadband
   - Einzel-Rule Cooling: analog
   - RuntimeProtection: Bei Deadband KEINE Aktivierung → Zaehler bleibt bei 0
   - NVS: Boot → Namespace existiert → kein NOT_FOUND im Log
   - Backoff: Bei fehlgeschlagenem ON → naechste Evaluation nach doppeltem Intervall

---

## Akzeptanzkriterien

- [ ] Nur EIN Modus (Heating ODER Cooling) pro Offline-Rule aktiv
- [ ] Invertierte Schwellenwerte werden beim Parsen abgelehnt (Warning-Log)
- [ ] `is_active` wird NUR gesetzt wenn Aktor tatsaechlich geschaltet wurde (Ausnahme: OFF-Befehle)
- [ ] Kein Toggle-Verhalten bei konstantem Sensorwert im Deadband
- [ ] NVS `NOT_FOUND` erscheint NICHT mehr im Log
- [ ] Evaluierungs-Intervall >= 30 Sekunden
- [ ] Backoff bei fehlgeschlagenem ON
- [ ] Log zeigt Modus, Schwellenwerte, State-Uebergang und Erfolg/Blockiert

---

## Abgrenzung

- **NICHT:** MQTT-Reconnect (→ separater Auftrag ANALYSE-FIX-FW-MQTT-RECONNECT)
- **NICHT:** clean_session Fix (→ SAFETY-P4-NVS-FINAL)
- **NICHT:** Server-seitige Logic Engine Hysterese-Haertung (→ L2)
- **NICHT:** Frontend Logic Builder UX (→ eigener Auftrag)
- **NICHT:** Multi-Rule Konfliktaufloesung (niedrige Prio, nur 1 Rule im Einsatz)
- **NICHT:** RuntimeProtection per Config-Push konfigurierbar machen (Folgeauftrag falls noetig)
- **NICHT:** soil_moisture Alias-Luecke (→ ANALYSE-P4-GUARD-NORM)

---

## Betroffene Dateien (komplett)

| Datei | Aenderung |
|-------|-----------|
| `src/models/offline_rule.h` | OfflineRuleMode enum + mode Feld (bestehende Felder `enabled`, `actuator_gpio`, `sensor_gpio`, `sensor_value_type[24]` unveraendert lassen) |
| `src/services/safety/offline_mode_manager.cpp` | parseOfflineRules (Modus-Erkennung), evaluateOfflineRules (Ein-Modus-Logik, is_active-Fix, Logging), loadOfflineRulesFromNVS (Read-Write), saveOfflineRulesToNVS (mode-Feld) |
| `src/services/safety/offline_mode_manager.h` | [Korrektur NEU] `backoff_ms_` Member-Variable + `getBackoffMs()` public Getter fuer Bug-5-Backoff |
| `src/tasks/safety_task.cpp` | OFFLINE_EVAL_INTERVAL_MS = 30000, Backoff-Support (innerhalb des bestehenden Block-Scopes Zeilen 96-105) |
