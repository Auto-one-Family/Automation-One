# Bericht: Aktor-Typ-Konfusion — IST-Zustand (2026-03-30)

> **Finding:** F-V4-02 (MEDIUM) aus T17-V4 Verifikation (2026-03-10)
> **Analysiert:** 2026-03-30
> **Analyst:** server-dev + frontend-dev Parallelanalyse

---

## 1. DB-Zustand (statisch aus Code-Analyse)

Da kein direkter DB-Zugang in dieser Session besteht, basiert der Zustand auf
Code-Analyse der Schreibpfade. Der beobachtete Mismatch aus T17-V4 war:

| Tabelle              | Spalte         | Wert       | Quelle               |
|----------------------|----------------|------------|----------------------|
| `actuator_configs`   | `actuator_type`| `"digital"`| Pydantic-Normalisierer |
| `actuator_states`    | `actuator_type`| `"relay"`  | Raw MQTT-Payload       |

**Globale Verteilung (erwartet):**
- `actuator_configs.actuator_type`: Ausschließlich `"digital"` oder `"pwm"` (Server-Typen)
  → weil Pydantic-Validator ALLE Schreibpfade durch `normalize_actuator_type()` schleust
- `actuator_states.actuator_type`: `"relay"`, `"pump"`, `"valve"`, `"pwm"` (ESP32-Typen)
  → weil kein Normalisierer angewendet wird

---

## 2. Schreibpfade `actuator_states.actuator_type`

### 2.1 Primärpfad: MQTT-Handler (Real-ESP)

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/actuator_handler.py`

```
Zeile 124:
actuator_type = payload.get("actuator_type", payload.get("type", "unknown"))
```

- **Woher kommt der Wert?** Direkt aus dem MQTT-Payload des ESP32
- **Firmware-Payload-Key:** Die Firmware sendet `"type"`, NICHT `"actuator_type"`
  (Beweis: `actuator_manager.cpp:881`: `payload += "\"type\":\"" + config.actuator_type + "\",";`)
- **Fallback greift:** `payload.get("actuator_type", ...)` → kein `"actuator_type"` im Payload,
  daher Fallback auf `payload.get("type", "unknown")` = `"relay"` (ESP32-Typ aus NVS)
- **Normalisierung:** KEINE. Kein Aufruf von `normalize_actuator_type()`.
- **Ergebnis:** `actuator_states.actuator_type = "relay"` (roher ESP32-Typ)

Schreibort:
```python
# actuator_handler.py Zeile 152-162
actuator_state = await actuator_repo.update_state(
    esp_id=esp_device.id,
    gpio=gpio,
    actuator_type=actuator_type,   # <-- ESP32-Typ, unnormalisiert
    ...
)
```

WebSocket-Broadcast Zeile 224-234: sendet ebenfalls `"actuator_type": "relay"` ungefiltert.

### 2.2 Sekundärpfad: Simulation-Handler (Mock-ESP)

**Datei:** `El Servador/god_kaiser_server/src/services/simulation/actuator_handler.py`

```python
# Zeile 668
actuator_type = await self._get_actuator_type(esp_id, gpio)
```

Implementierung `_get_actuator_type()` (Zeilen 700-730):
- Liest aus `device_metadata.simulation_config.actuators.{gpio}.actuator_type`
- **Default-Wert:** `"relay"` (ESP32-Typ, Zeile 723+730)
- Kein `normalize_actuator_type()` Aufruf

Status-Payload (Zeilen 677-679):
```python
"actuator_type": actuator_type,
"type": actuator_type,  # Alias — sendet BEIDE Keys
```

→ Der Simulation-Handler sendet `"actuator_type": "relay"` direkt.
Der MQTT-Handler liest dann `payload.get("actuator_type", ...)` → trifft direkt,
kein Fallback nötig. Ergebnis gleich: `actuator_states.actuator_type = "relay"`.

### 2.3 Nicht gefundene Schreibpfade

- `lwt_handler.py`: Setzt `actuator_states` auf `"off"` bei Offline-Gehen (kein type-Change)
- `heartbeat_handler.py`: Kein direktes Schreiben von `actuator_states.actuator_type` (bestätigt via Grep)
- Logic Engine `actuator_executor.py`: Schreibt Commands, nicht States direkt

---

## 3. Schreibpfade `actuator_configs.actuator_type`

### 3.1 REST-Endpoint (Hauptpfad)

**Datei:** `El Servador/god_kaiser_server/src/api/v1/actuators.py`, Funktion `create_or_update_actuator` (Zeile 414)

- Request-Schema: `ActuatorConfigCreate` erbt von `ActuatorConfigBase`
- Pydantic `field_validator("actuator_type")` in `ActuatorConfigBase` (schemas/actuator.py:109-123):

```python
@field_validator("actuator_type")
@classmethod
def validate_actuator_type(cls, v: str) -> str:
    v = v.lower()
    if v not in ALL_ACTUATOR_TYPES:
        raise ValueError(...)
    return normalize_actuator_type(v)  # <-- NORMALISIERUNG HIER
```

- Mapping: `"relay"` → `"digital"`, `"pump"` → `"digital"`, `"valve"` → `"digital"`, `"pwm"` → `"pwm"`
- Default-Wert: `"digital"` (schemas/actuator.py:98-99)
- **Ergebnis:** `actuator_configs.actuator_type = "digital"` ✅

### 3.2 ActuatorConfigUpdate — KEIN actuator_type-Feld

`ActuatorConfigUpdate` (schemas/actuator.py:212-241) enthält **kein** `actuator_type`-Feld.
Der Typ kann nachträglich via PATCH/PUT nicht geändert werden. Konsistent.

### 3.3 DB-Constraint

Kein CHECK-Constraint auf DB-Ebene (basierend auf Alembic-Migrations-Analyse).
Die Spalte ist `VARCHAR` — akzeptiert beliebige Strings. Die Validierung liegt
**ausschließlich** im Pydantic-Layer.

---

## 4. Frontend Aktor-Erstellungs-Flow

**Datei:** `El Frontend/src/components/esp/AddActuatorModal.vue`

### 4.1 Formular-Felder

Das Dropdown `Aktor-Typ` zeigt ESP32-Typen an:
```typescript
// actuatorDefaults.ts:46
export type ActuatorCategoryId = 'pump' | 'valve' | 'relay' | 'pwm'
```
Optionen: `pump`, `valve`, `relay`, `pwm` (alle ESP32-Typen, via `getActuatorTypeOptions()`)

Default beim Öffnen: `"relay"` (AddActuatorModal.vue:53)

### 4.2 Request-Payload (Real-ESP)

`esp.ts:909-925` baut `ActuatorConfigCreate`:
```typescript
const realConfig: ActuatorConfigCreate = {
  esp_id: deviceId,
  gpio: config.gpio,
  actuator_type: config.actuator_type,  // "relay" (ESP32-Typ vom Dropdown)
  ...
}
await actuatorsApi.createOrUpdate(deviceId, config.gpio, realConfig)
```

**Der Request sendet ESP32-Typ `"relay"` an das Backend.**
Das Backend normalisiert via Pydantic: `"relay"` → `"digital"`.
Ergebnis: `actuator_configs.actuator_type = "digital"`.

### 4.3 Frontend-Display

`labels.ts` mappt `"digital"` explizit:
```typescript
'digital': { label: 'Relais', icon: 'ToggleRight' }
```

Das Frontend zeigt also korrekt "Relais" an, obwohl der Store-Wert `"digital"` ist.
**Keine Display-Bug.** Das war eine frühere Fehldiagnose.

### 4.4 WebSocket State-Update

`ActuatorStore.handleActuatorStatus()` (actuator.store.ts:107-136) aktualisiert
beim WS-Event NUR: `state`, `pwm_value`, `emergency_stopped`, `last_command_at`.
**`actuator_type` wird NICHT aus dem WS-Event aktualisiert.**

Der Store behält den Wert aus dem initialen `fetchDevice()` REST-Call
(`actuator_configs.actuator_type = "digital"`).

---

## 5. Firmware MQTT-Payload (Analyse)

### 5.1 Status-Payload Struktur

**Datei:** `El Trabajante/src/services/actuator/actuator_manager.cpp:866-888`

```cpp
String ActuatorManager::buildStatusPayload(...) {
  ...
  payload += "\"type\":\"" + config.actuator_type + "\",";  // Zeile 881
  ...
}
```

**Beispiel-Payload (ESP_EA5484 GPIO 14, Olimex PWR Switch):**
```json
{
  "esp_id": "ESP_EA5484",
  "gpio": 14,
  "type": "relay",        // <-- "type", NICHT "actuator_type"
  "state": true,
  "pwm": 255,
  "runtime_ms": 0,
  "emergency": "normal",
  "ts": 1743300000
}
```

### 5.2 NVS-Schreibpfad für actuator_type

**Datei:** `El Trabajante/src/services/actuator/actuator_manager.cpp:707-711` (Config-Parsing)
**Datei:** `El Servador/god_kaiser_server/src/core/config_mapping.py:284-295`

Der Config-Push vom Server enthält:
```python
# config_mapping.py DEFAULT_ACTUATOR_MAPPINGS:
{
    "source": "actuator_type",
    "target": "actuator_type",
    "transform": "actuator_type_to_esp32",  # "digital" → "relay"
}
```

**Der Server konvertiert RÜCKWÄRTS:** `"digital"` → `"relay"` via `map_actuator_type_for_esp32()`.
Der ESP32 empfängt `"actuator_type": "relay"` im Config-Push und speichert `"relay"` in NVS.

### 5.3 JSON Key-Inkonsistenz

| Quelle                    | Verwendet Key   | Wert     |
|---------------------------|-----------------|----------|
| Real-ESP Firmware         | `"type"`        | `"relay"`|
| Simulation-Handler        | `"actuator_type"` + `"type"` | `"relay"` |
| MQTT-Handler liest:       | `"actuator_type"` (Prio 1), dann `"type"` (Fallback) | `"relay"` |

Real-ESP trifft immer den Fallback-Pfad. Simulation trifft den Primärpfad.
**Funktionell identisch, strukturell inkonsistent.**

---

## 6. Hypothesen-Auswertung

### H1 — `"digital"` ist das korrekte Ergebnis der Server-Normalisierung: **BESTÄTIGT** ✅

- Frontend sendet `"relay"` → Pydantic normalisiert → `actuator_configs.actuator_type = "digital"`
- Alle Schreibpfade für `actuator_configs` (API, Update) durchlaufen denselben Validator
- Exception: `ActuatorConfigUpdate` hat kein `actuator_type`-Feld (by design OK)
- Alembic-Migrationen: Kein Hinweis auf nachträgliche type-Setzung (keine spezifischen Data-Migrations sichtbar)

### H2 — `actuator_states` schreibt ESP32-Typ ungefiltert: **BESTÄTIGT** ✅

- **Root Cause:** `actuator_handler.py:124` liest `actuator_type` direkt aus MQTT-Payload
- **Verstärkt durch:** Firmware sendet `"type"`-Key, Backend-Fallback landet bei ESP32-Typ
- **Kein** `normalize_actuator_type()` Aufruf vor `actuator_repo.update_state()`
- Ergebnis: `actuator_states.actuator_type = "relay"` (ESP32-Typ)

### H3 — Zwei Handler-Dateien mit unterschiedlichem Verhalten: **TEILWEISE BESTÄTIGT** ⚠️

- Simulation-Handler liest `actuator_type` aus `simulation_config`, default `"relay"` (ESP32-Typ)
- MQTT-Handler liest aus MQTT-Payload, landet bei `"relay"` via Fallback
- **Gleiche Outcome** (kein normalize), aber via verschiedene Code-Pfade
- Simulation sendet `"actuator_type"` UND `"type"` Alias → backend-handler trifft Primärpfad
- Real-ESP sendet nur `"type"` → backend-handler trifft Fallback-Pfad

### H4 — Zwei-Typ-System nicht ueberall konsistent: **BESTÄTIGT** ✅

Das System hat drei Ebenen mit unterschiedlichem Typ-Verständnis:

| Ebene                          | Type-Space    | Wo definiert |
|-------------------------------|---------------|--------------|
| `actuator_configs` (DB)        | Server-Typ (`digital`) | schemas/actuator.py |
| `actuator_states` (DB)         | ESP32-Typ (`relay`) | actuator_handler.py (kein Normalisierer) |
| Config-Push (Server→ESP32)     | ESP32-Typ (`relay`) | config_mapping.py (Reverse-Map) |
| `actuator_history` (DB)        | ESP32-Typ (`relay`) | actuator_handler.py:167-181 (gleiche Quelle) |
| Frontend-Store (Pinia)         | Server-Typ (`digital`) | REST-API load, WS-Update ignoriert type |
| WebSocket-Broadcast            | ESP32-Typ (`relay`) | actuator_handler.py:224 ungefiltert |

**Das System ist by-design bidirektional gemappt** (schemas/actuator.py ist explizit dokumentiert,
config_mapping.py hat explicit Reverse-Map), aber **`actuator_states` setzt den Normalisierer nicht
ein** — obwohl er direkt verfügbar ist.

---

## 7. Root Cause

### Primäre Ursache (H2, nachgewiesen)

**`actuator_handler.py:124`** liest `actuator_type` direkt aus dem MQTT-Payload ohne Normalisierung.

```python
# AKTUELL (fehlerhaft für Konsistenz):
actuator_type = payload.get("actuator_type", payload.get("type", "unknown"))
# Wert: "relay" (ESP32-Typ)
```

Es gibt zwei Möglichkeiten, das zu beheben (siehe Abschnitt 9), aber die Frage ist:
**Welcher Type-Space soll `actuator_states.actuator_type` haben?**

### Sekundäre Ursache (Firmware-Key-Inkonsistenz)

Die Firmware sendet `"type"` statt `"actuator_type"`. Der Backend-Handler kompensiert mit Fallback.
Das ist ein separates Problem (Protokoll-Inkonsistenz), das unabhängig vom Type-Space-Problem besteht.

### Architekturelle Ursache (H4)

Das Zwei-Typ-System ist **in `schemas/actuator.py` explizit dokumentiert und gewollt**:
```python
# Server-side actuator types (internal classification)
ACTUATOR_TYPES = ["digital", "pwm", "servo"]
# El Trabajante ESP32 actuator types
ESP32_ACTUATOR_TYPES = ["pump", "valve", "pwm", "relay"]
```

Die Grenze `ESP32↔Server` ist durch `normalize_actuator_type()` und `map_actuator_type_for_esp32()`
klar definiert. Aber `actuator_states` ist eine Grenzzone — semantisch eine Server-Tabelle
(managed by Server), befüllt mit ESP32-Daten (via MQTT) ohne Normalisierung.

**Das Zwei-Typ-System ist gewollt und gut durchdacht — aber `actuator_states` fällt
zwischen zwei Stühle: Es ist eine Server-Tabelle mit ESP32-Typ-Daten.**

---

## 8. Betroffene Stellen (vollständige Liste)

| Datei | Zeile | Aktion | Quelle | Type-Space |
|-------|-------|--------|--------|------------|
| `schemas/actuator.py` | 109-123 | SCHREIBT `actuator_configs.actuator_type` | Pydantic validate | Server-Typ |
| `actuator_handler.py` | 124 | LIEST aus MQTT-Payload | Fallback via `"type"` | ESP32-Typ |
| `actuator_handler.py` | 152-162 | SCHREIBT `actuator_states.actuator_type` | unnormalisiert | ESP32-Typ |
| `actuator_handler.py` | 167-181 | SCHREIBT `actuator_history.actuator_type` | unnormalisiert | ESP32-Typ |
| `actuator_handler.py` | 224-234 | WS-BROADCAST `actuator_type` | ESP32-Typ | ESP32-Typ |
| `config_mapping.py` | 284-295 | LIEST `actuator_configs.actuator_type` | transformiert zu ESP32 | Reverse-Map |
| `config_mapping.py` | 100-140 | `map_actuator_type_for_esp32()` | Server→ESP32 | Reverse-Map |
| `simulation/actuator_handler.py` | 668 | LIEST type aus `simulation_config` | default `"relay"` | ESP32-Typ |
| `simulation/actuator_handler.py` | 678-679 | WS-PUBLISH status | ESP32-Typ | ESP32-Typ |
| `actuator_manager.cpp` | 881 | FIRMWARE: status payload `"type"` | NVS gespeicherter Typ | ESP32-Typ |
| `actuator_manager.cpp` | 707-711 | FIRMWARE: liest `actuator_type` aus Config-Push | JSON-Feld | ESP32-Typ |
| `AddActuatorModal.vue` | 53, 56-68 | FORMULAR: default `"relay"`, Dropdown ESP32-Typen | User-Input | ESP32-Typ |
| `esp.ts` | 909-925 | POST-Request: `actuator_type` = ESP32-Typ | Pinia→API | ESP32-Typ→normalisiert |
| `actuator.store.ts` | 107-136 | LIEST `actuator_type` aus WS-Event (aber nutzt ihn nicht) | WS-Payload ignoriert | N/A |

---

## 9. Lösungsempfehlung

### Empfehlung: Option C — actuator_configs als Source of Truth (1 Zeile Fix)

**Statt** den `actuator_type` aus dem MQTT-Payload zu lesen, sollte `actuator_handler.py`
den Typ **aus `actuator_configs`** holen (die bereits vorhanden ist, Step 5 im Handler):

```python
# actuator_handler.py Zeile 124 (aktuell):
actuator_type = payload.get("actuator_type", payload.get("type", "unknown"))

# Option C (empfohlen):
actuator_type = actuator_config.actuator_type if actuator_config else \
    normalize_actuator_type(payload.get("actuator_type", payload.get("type", "unknown")))
```

**Begründung:**
- `actuator_config` ist bereits in Step 5 geladen (Zeile 116-122)
- `actuator_configs.actuator_type` ist die normalisierte Server-Side Truth
- Edge case: Wenn kein config vorhanden (Zeile 118: "Updating state without config"),
  Fallback auf normalize (statt raw)
- **Aufwand: 2 Zeilen Änderung in einer Datei**

### Alternative: Option A — normalize_actuator_type() im Handler anwenden

```python
# Option A:
raw_type = payload.get("actuator_type", payload.get("type", "unknown"))
actuator_type = normalize_actuator_type(raw_type) if raw_type != "unknown" else "unknown"
```

Einfacher, aber verliert die semantische Bedeutung (pump vs. relay beide → digital).
Für `actuator_history` kann es sinnvoll sein, den originalen ESP32-Typ zu behalten.

### Empfehlung pro Tabelle

| Tabelle | Empfohlener Type-Space | Begründung |
|---------|------------------------|------------|
| `actuator_configs` | Server-Typ (`digital`) | Source of Truth für Server-Logik — UNVERÄNDERT |
| `actuator_states` | Server-Typ (`digital`) | Server-Tabelle, Konsistenz mit configs gewollt |
| `actuator_history` | **ESP32-Typ (`relay`)** | Historisches Audit-Log — Originalwert wertvoller |

→ **Nur `actuator_states` beheben** (Option C). `actuator_history` so lassen.

### Nebenfix: Firmware JSON-Key

Firmware sollte zusätzlich `"actuator_type"` senden (neben `"type"`):
```cpp
// actuator_manager.cpp:881 — zusätzlich:
payload += "\"actuator_type\":\"" + config.actuator_type + "\",";
```
Damit trifft der Backend-Handler den Primärpfad statt den Fallback.
**Niedriger Priorität** (Fallback funktioniert korrekt, aber Protokoll wird klarer).

### Schätzung

- **Option C** (Backend, 1 Datei): ~30min Implementation + Test
- **Firmware-Key-Fix**: ~15min + PIO-Build + Flash-Test
- **Gesamt:** 1h inkl. pytest + Hardware-Verifikation

### Abhängigkeiten zu offenen Aufträgen

- **P8-A6 (Aktor-Analytics):** Wird `actuator_history.actuator_type` auswerten.
  Wenn analytics nach Server-Typ filtern (`"digital"`), würde aktuell kein Eintrag matchen
  (alle haben ESP32-Typ `"relay"`). **Nach Fix von `actuator_states` wäre history unberührt.**
  Analytics auf history: entweder ESP32-Typen nutzen ODER separate Normalisierung in analytics-query.
- **Logic Engine:** `actuator_executor.py` schreibt commands via `actuator_type` aus `actuator_configs`
  (Server-Typ). Nicht betroffen vom aktuellen Mismatch.
- **Safety-Service:** Prüft commands gegen configs (Server-Typ). Nicht betroffen.

---

## Zusammenfassung

Das **Zwei-Typ-System ist architektonisch korrekt und gewollt** — mit klar definierten Mapping-Funktionen
in beide Richtungen. Der Mismatch ist ein **Implementierungslücke** in `actuator_handler.py`:
Die Tabelle `actuator_states` ist eine Server-Tabelle, wird aber mit unnormalisierten ESP32-Daten
aus dem MQTT-Payload gefüllt. Ein 1-Zeilen-Fix behebt den Mismatch ohne Architektur-Änderungen.

Die Firmware-JSON-Key-Inkonsistenz (`"type"` statt `"actuator_type"`) ist ein separates,
niedrig-priorisiertes Problem — der Backend-Fallback kompensiert es korrekt.
