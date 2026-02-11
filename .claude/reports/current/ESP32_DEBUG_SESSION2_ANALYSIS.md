# ESP32 Debug Report - Session 2 Analysis

**Erstellt:** 2026-02-11
**Modus:** B (Spezifisch: "5 Bugs aus Wokwi Live Interaction Log Session 2")
**Quellen:**
- WOKWI_LIVE_INTERACTION_LOG.md (Session 2)
- El Trabajante/src/main.cpp (ESP32 main)
- El Trabajante/src/drivers/gpio_manager.cpp
- El Trabajante/src/services/sensor/sensor_manager.cpp
- El Trabajante/src/services/communication/mqtt_client.cpp
- El Servador handlers (heartbeat, zone_service, zone_ack)
- El Servador DB models (esp_repo.py, esp.py)

---

## 1. Zusammenfassung

Vollstaendige Device Lifecycle Session mit ESP_00000001 (Wokwi Simulator) identifizierte **5 Bugs**:

| Bug | Severity | Component | Status |
|-----|----------|-----------|--------|
| 1. set_log_level params ignored | Medium | ESP32 firmware | Code-Location gefunden |
| 2. GPIO conflict OneWire | Medium | ESP32 firmware | Code-Location gefunden |
| 3. ZONE_MISMATCH not auto-resolved | Low | Server heartbeat handler | Code-Location gefunden |
| 4. JSON mutation tracking broken | **High** | Server zone_service | Code-Location gefunden |
| 5. Retained LWT not cleared | Medium | Server/ESP32 | Code-Location gefunden |

**Kritischer Befund:** BUG 4 (JSON mutation tracking) betrifft Core-Funktionalitaet des Zone Assignment Trackings.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| WOKWI_LIVE_INTERACTION_LOG.md | OK | Vollstaendige Bug-Dokumentation |
| ESP32 firmware (5 files) | OK | Code-Locations identifiziert |
| Server handlers (3 files) | OK | Code-Locations identifiziert |
| DB models | OK | device_metadata = plain JSON |

---

## 3. Befunde

### 3.1 BUG 1: set_log_level ignoriert params Objekt

**Schwere:** Medium

**Location:** El Trabajante/src/main.cpp:1222-1254

**Detail:**

Der System Command Handler fuer set_log_level liest **nur** das top-level level Feld (Line 1227).

**Expected:**
- Flat: {"command":"set_log_level","level":"DEBUG"}
- Params: {"command":"set_log_level","params":{"level":"DEBUG"}}

**Actual:** Nur flat format funktioniert.

**Response bei params:** {"success":false,"error":"Invalid log level","requested_level":"NULL"}

**Root Cause:** Kein Code um params-Objekt zu pruefen.

**Impact:**
- Konsistenz-Problem (diagnostics nutzt params)
- Breaking Change wenn Frontend auf params-Format migriert

**Fix:** Fallback-Logic (params → top-level → error)

**Agent:** esp32-dev

**Priority:** Medium

---

### 3.2 BUG 2: Sensor config GPIO conflict mit OneWire bus

**Schwere:** Medium

**Location:** El Trabajante/src/services/sensor/sensor_manager.cpp:369-386

**Detail:**

OneWire Bus beansprucht GPIO 4 beim Boot. Dynamische Sensor-Config auf GPIO 4 schlaegt fehl.

**Evidence:** GPIO_CONFLICT: GPIO 4 already used by bus/onewire/4 (OneWireBus)

**Root Cause:**
1. OneWireBusManager beansprucht GPIO beim Boot
2. SensorManager.handleSensorConfig() prueft isPinAvailable() → false
3. CASE C (Line 380-384) → Conflict

**Impact:**
- Keine dynamische Sensor-Config auf OneWire-GPIOs
- Workaround: ESP rebooten

**Fix:** GPIO-Sharing-Mechanismus - pruefe owner VOR isPinAvailable()

**Agent:** esp32-dev

**Priority:** Medium

---

### 3.3 BUG 3: ZONE_MISMATCH nicht auto-resolved

**Schwere:** Low

**Location:** El Servador/src/mqtt/handlers/heartbeat_handler.py:641-668

**Detail:**

Server erkennt Mismatch (DB hat Zone, ESP nicht) aber sendet keine auto-reassignment.

**Expected:** Server sendet zone/assign bei Mismatch.

**Actual:** Server loggt nur WARNING (Line 658-661).

**Root Cause:** Handler ist read-only.

**Impact:**
- Admin muss Zone nach ESP-Reboot manuell neu zuweisen
- Betrifft alle Reboots

**Fix:** Automatisches Re-Send in heartbeat_handler

**Agent:** server-dev

**Priority:** Low

---

### 3.4 BUG 4: SQLAlchemy JSON mutation tracking

**Schwere:** **High**

**Location (5 Stellen):**
- zone_service.py:138-145 (SET)
- zone_service.py:228-229 (DELETE)
- zone_service.py:307-308 (DELETE)
- zone_ack_handler.py:135-136 (DELETE)
- zone_ack_handler.py:151-152 (DELETE)

**Detail:**

device_metadata Column nutzt plain JSON Type (esp.py:190-195). SQLAlchemy erkennt in-place dict mutations NICHT.

**Evidence:**
- Nach Zone Assignment ist pending_zone_assignment NICHT in DB
- Code versucht es zu loeschen (5x) aber es war nie da

**Vergleich:** esp_repo.py nutzt KORREKT flag_modified() (7x: Lines 299, 347, 517, 571, 611, 641, 707).

**Root Cause:**
1. device_metadata ist JSON ohne MutableDict
2. In-place mutations nicht getrackt
3. flag_modified() fehlt an 5 Stellen

**Impact:**
- Zone assignment tracking **funktioniert nicht**
- Keine Visibility ob ESP Zone-ACK ausstehend

**Fix:** ALLE 5 Locations mit flag_modified() fixen.

**Agent:** server-dev

**Priority:** **High**

---

### 3.5 BUG 5: Retained LWT nicht geloescht

**Schwere:** Medium

**Location:**
- mqtt_client.cpp:185-196 (LWT gesetzt)
- heartbeat_handler.py (Kein LWT-Clear Code)

**Detail:**

ESP32 setzt LWT mit retain=true (Line 325). Bei Reconnect wird retained system/will NICHT geloescht.

**Expected:** Reconnect loescht retained LWT.

**Actual:** Retained Message bleibt.

**Impact:**
- MQTT Subscribers sehen stale offline Message
- Verwirrend: Device online aber /will sagt offline

**Root Cause:** Weder ESP32 noch Server loescht retained LWT.

**Fix (Option A - Bevorzugt):** ESP32 loescht nach Connect (empty retained = delete).

**Fix (Option B):** Server loescht bei erstem Heartbeat.

**Agent:**
- Option A: esp32-dev
- Option B: server-dev

**Priority:** Medium

---

## 4. Extended Checks

Alle Checks waren Code-Analyse. Session-Log lieferte vollstaendige Evidenz.

| Check | Ergebnis |
|-------|----------|
| main.cpp set_log_level | Line 1227 liest nur top-level |
| sensor_manager.cpp GPIO | Line 380-384 wirft GPIO_CONFLICT |
| heartbeat_handler.py ZONE | Line 658-661 loggt WARNING |
| zone_service.py pending | Line 140 setzt ohne flag_modified() |
| esp_repo.py flag_modified | 7 Instanzen - korrekt |
| esp.py device_metadata | Plain JSON |
| mqtt_client.cpp LWT | Line 325 retain=true, kein clear |

---

## 5. Bewertung & Empfehlung

### Root Causes

| Bug | Root Cause |
|-----|------------|
| 1 | Fehlende params-Fallback |
| 2 | OneWire ohne Sharing-Mechanismus |
| 3 | Handler read-only |
| 4 | flag_modified() inkonsistent |
| 5 | Fehlende LWT-Cleanup |

### Priorisierte Fix-Liste

| Priority | Bug | Agent | Effort |
|----------|-----|-------|--------|
| 1. HIGH | BUG 4: JSON tracking | server-dev | 30min |
| 2. Medium | BUG 2: GPIO conflict | esp32-dev | 2h |
| 3. Medium | BUG 1: params | esp32-dev | 30min |
| 4. Medium | BUG 5: LWT | esp32-dev | 30min |
| 5. Low | BUG 3: ZONE_MISMATCH | server-dev | 1h |

### Naechste Schritte

1. **SOFORT:** BUG 4 fixen (High Severity)
2. **DIESE WOCHE:** BUG 2 fixen (User-Experience)
3. **NAECHSTE WOCHE:** BUG 1, 5 (Quick Wins)
4. **OPTIONAL:** BUG 3 (Low Priority)

### Cross-Agent-Dependencies

KEINE - alle Bugs isoliert.

---

## 6. Lessons Learned

1. **SQLAlchemy JSON:** flag_modified() Pattern inkonsistent
   - esp_repo.py: korrekt (7x)
   - zone_service.py: falsch (5x)
   - Empfehlung: Code-Review alle device_metadata Mutations

2. **GPIO-Management:** OneWire braucht Sharing

3. **MQTT LWT:** Retained Messages explizit loeschen

4. **Command Format:** Inkonsistenz flat vs params

---

**Report Ende**
