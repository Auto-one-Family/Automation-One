# Bericht AUT-190 — Frontend-Verifikation FE-01/02/03

**Datum:** 2026-04-26
**Erstellt von:** TM + Frontend-Spezialist (Explore) + Backend-Spezialist (Explore)
**Commit-Stand:** `ac5ca7b5f32766eea255b1d3a35dbb566a793ba4` (Fri Apr 24 02:05:55 2026 +0200)

---

## Executive Summary

- **FE-01:** TEILWEISE — ~8 von ursprünglich 14 fehlenden Interfaces noch offen; ca. 6 wurden in Commit `ce574ca8` nachgerüstet (`rule_degraded`, `rule_recovered`, `DeviceRediscoveredEvent` u. a.). Verbleibende Lücken: `sensor_config_deleted`, `actuator_config_deleted`, `notification_updated`, `notification_unread_count`, `device_context_changed` (in MessageType-Union, aber kein Interface), plus `sensor_config_created`, `sensor_config_updated`, `esp_diagnostics` (weder Union-Eintrag noch Interface).
- **FE-02:** IMPLEMENTIERT — Frontend-Interface enthält alle drei Felder (optional, Phase 3); Sensor-Matching 3-stufig erweitert (config_id → Adresse → Legacy); Server sendet alle drei Felder im WS-Payload. Kein Handlungsbedarf.
- **FE-03:** OFFEN — `allow_methods=["*"]` in `main.py:1185` hartkodiert; `CORSSettings.allow_methods` existiert (konfigurierbar via `CORS_ALLOW_METHODS`), wird aber nie gelesen. Ebenfalls betroffen: `allow_headers` und `allow_credentials`.

---

## FE-01 — WS MessageType Interface-Lücken

### Status
**TEILWEISE**

### Aktueller Zähler

- **MessageTypes gesamt:** 44 (in `El Frontend/src/types/index.ts`, MessageType-Union, Zeile 431–493)
- **Mit TypeScript-Interface in `websocket-events.ts`:** ~31
- **Noch ohne dediziertes Interface:** ~8 (davon 5 in der Union, 3 nicht mal in der Union)

### Interfaces vorhanden (Auswahl, `websocket-events.ts`)

| MessageType | Interface | Zeile |
|---|---|---|
| `sensor_data` | `SensorDataEvent` | :43 |
| `actuator_status` | `ActuatorStatusEvent` | :66 |
| `actuator_response` | `ActuatorResponseEvent` | :609 |
| `actuator_alert` | `ActuatorAlertEvent` | :628 |
| `esp_health` | `ESPHealthEvent` | :85 |
| `esp_discovered` | `DeviceDiscoveredEvent` | :168 |
| `device_approved` | `DeviceApprovedEvent` | :578 |
| `device_rejected` | `DeviceRejectedEvent` | :594 |
| `zone_assignment` | `ZoneAssignmentEvent` | :646 |
| `subzone_assignment` | `SubzoneAssignmentEvent` | :668 |
| `config_response` | `ConfigResponseEvent` | :130 |
| `logic_execution` | `LogicExecutionEvent` | :686 |
| `error_event` | `ErrorEvent` | :188 |
| `system_event` | `SystemEvent` | :704 |
| `rule_degraded` | `RuleDegradedEvent` | :755 |
| `rule_recovered` | `RuleRecoveredEvent` | :773 |
| `notification` | `NotificationEvent` | :735 |
| + ~14 weitere | (ActuatorCommandEvent, ConfigPublishedEvent, SequenceStartedEvent etc.) | :307ff |

### Noch ohne dediziertes Interface (offene Lücken)

| MessageType | In MessageType-Union? | Handler vorhanden? | Art der Lücke |
|---|---|---|---|
| `sensor_config_deleted` | JA | JA (`esp.ts:1592–1598`) | Nur inline-typed im Handler, kein Interface in `websocket-events.ts` |
| `actuator_config_deleted` | JA | JA (`esp.ts:1644–1646`) | Nur inline-typed im Handler |
| `notification_updated` | JA | JA (`esp.ts:2011`) | Kein Interface — `NotificationEvent` deckt `notification` ab, nicht `notification_updated` |
| `notification_unread_count` | JA | JA (`esp.ts:2012`) | Kein Interface |
| `device_context_changed` | JA | JA (`esp.ts:1998`) | Kein Interface, nicht in `WebSocketEvent`-Union |
| `sensor_config_created` | NEIN | NEIN | Weder Union-Eintrag noch Interface noch Handler |
| `sensor_config_updated` | NEIN | NEIN | Weder Union-Eintrag noch Interface noch Handler |
| `esp_diagnostics` | NEIN | NEIN | Weder Union-Eintrag noch Interface noch Handler |

### Code-Evidenz

**Datei:** `El Frontend/src/types/websocket-events.ts`
**Commit:** `ce574ca8` (Fri Apr 24 02:05:55 2026)

Beispiel für ein Interface MIT Eintrag (`sensor_data`, Zeile 43):
```typescript
export interface SensorDataEvent {
  type: 'sensor_data'
  data: {
    esp_id: string
    gpio: number
    sensor_type: string
    value: number
    unit: string
    quality: string
    timestamp: number
    config_id?: string
    i2c_address?: number
    onewire_address?: string
  }
}
```

Beispiel für Handler OHNE Interface (`sensor_config_deleted`, `esp.ts:1592–1598`):
```typescript
ws.on('sensor_config_deleted', (payload: { esp_id: string; gpio: number; sensor_type: string }) => {
  // inline-typed, kein Import aus websocket-events.ts
  ...
})
```

**Erklärung:** Die 5 MessageTypes in der Union (`sensor_config_deleted`, `actuator_config_deleted`, `notification_updated`, `notification_unread_count`, `device_context_changed`) werden aktiv behandelt, haben aber keine zentralen Interface-Definitionen in `websocket-events.ts` — Typen sind nur lokal im Handler inliniert. Die 3 fehlenden Union-Einträge (`sensor_config_created`, `sensor_config_updated`, `esp_diagnostics`) fehlen vollständig.

### Empfehlung

Fünf `interface`-Definitionen in `websocket-events.ts` nachtragen und in die `WebSocketEvent`-Union einbinden. Drei neue Union-Einträge prüfen (ob vom Server gesendet) und dann ebenfalls nachtragen. Prio: MEDIUM — keine Runtime-Lücke, aber fehlende IDE-Unterstützung und Typsicherheit bei künftigen Handler-Änderungen.

---

## FE-02 — SensorDataEvent fehlende Felder (Cross-Layer)

### Frontend-Interface — IMPLEMENTIERT

**Datei:** `El Frontend/src/types/websocket-events.ts`, Zeile 43–64
**Commit:** `ce574ca8` (Fri Apr 24 02:05:55 2026)

```typescript
export interface SensorDataEvent {
  type: 'sensor_data'
  data: {
    esp_id: string
    gpio: number
    sensor_type: string
    value: number
    unit: string
    quality: string
    timestamp: number
    // Address-based matching for multi-sensor GPIOs (Phase 3)
    config_id?: string        // ← vorhanden
    i2c_address?: number      // ← vorhanden
    onewire_address?: string  // ← vorhanden
  }
}
```

Alle drei Felder sind als optional markiert (Phase-3-Kommentar). Die ursprüngliche Lücke ist geschlossen.

### Store-Matching — IMPLEMENTIERT

**Datei:** `El Frontend/src/shared/stores/sensor.store.ts`, Zeile 120–144
**Commit:** `ce574ca8` (Fri Apr 24 02:05:55 2026)

```typescript
function matchSensorToEvent(sensor: MockSensor, data: SensorDataPayload): boolean {
  // Primary: config_id match (most unique key)
  if (data.config_id && sensor.config_id) {
    return sensor.config_id === data.config_id
  }
  // Base: gpio + sensor_type must match
  if (
    sensor.gpio !== data.gpio ||
    normalizeSensorType(sensor.sensor_type) !== normalizeSensorType(data.sensor_type)
  ) {
    return false
  }
  // Address differentiation when available
  if (data.i2c_address != null && sensor.i2c_address != null) {
    return sensor.i2c_address === data.i2c_address
  }
  if (data.onewire_address && sensor.onewire_address) {
    return sensor.onewire_address === data.onewire_address
  }
  // Legacy: no address in event → first match (backward compatibility)
  return true
}
```

Das Matching ist dreistufig: (1) `config_id` als Primary-Key, (2) `gpio + sensor_type + Adresse` als Secondary-Key, (3) Legacy-Fallback ohne Adresse für ältere Events. Der DS18B20-Multi-Instance-Bug (NB6) ist damit für neue Events behoben; bei Legacy-Events ohne Adressfelder bleibt das First-Match-Verhalten als expliziter Fallback.

### Server-Payload — IMPLEMENTIERT

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`, Zeile 550–569
**Commit:** `9267764e9f38713d7b5a235ea4e0e6c5812e6088` (Tue Apr 21 10:43:05 2026)

```python
await ws_manager.broadcast(
    "sensor_data",
    {
        "esp_id": esp_id_str,
        "message": message,
        "severity": "info",
        "device_id": esp_id_str,
        "gpio": gpio,
        "sensor_type": sensor_type,
        "value": display_value,
        "unit": unit,
        "quality": quality,
        "timestamp": esp32_timestamp_raw,
        "zone_id": zone_id,
        "subzone_id": subzone_id,
        "config_id": str(sensor_config.id) if sensor_config else None,   # ← vorhanden
        "i2c_address": i2c_address if i2c_address else None,             # ← vorhanden
        "onewire_address": onewire_address if onewire_address else None, # ← vorhanden
    },
)
```

Alle drei Felder werden gesendet. **Hinweis:** Der VPD-Broadcast-Pfad (Zeile ~813–829 derselben Datei) enthält diese Felder nicht — das ist ein separater Broadcast für berechnete VPD-Werte und nicht Teil des regulären `sensor_data`-Pfades.

**Gesamtbewertung FE-02:** Vollständig implementiert. Kein Handlungsbedarf.

---

## FE-03 — CORS allow_methods Hardcoding

### Status
**OFFEN**

### allow_methods hartkodiert in main.py

**Datei:** `El Servador/god_kaiser_server/src/main.py`, Zeile 1181–1188
**Commit:** `5c34c3f60e3882c39a3da4b1a5fbc3a1b2431f38` (Fri Apr 24 02:05:50 2026)

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,   # ← korrekt aus CORSSettings
    allow_credentials=True,                # ← hartkodiert (ignoriert CORSSettings.allow_credentials)
    allow_methods=["*"],                   # ← hartkodiert (ignoriert CORSSettings.allow_methods)
    allow_headers=["*"],                   # ← hartkodiert (ignoriert CORSSettings.allow_headers)
    expose_headers=["X-Request-ID"],
)
```

### CORSSettings-Objekt vorhanden

**Datei:** `El Servador/god_kaiser_server/src/core/config.py`, Zeile 118–131
**Commit:** `5c34c3f60e3882c39a3da4b1a5fbc3a1b2431f38` (Fri Apr 24 02:05:50 2026)

```python
class CORSSettings(BaseSettings):
    """CORS configuration settings"""
    allowed_origins: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:5173"],
        alias="CORS_ALLOWED_ORIGINS",
    )
    allow_credentials: bool = Field(default=True, alias="CORS_ALLOW_CREDENTIALS")
    allow_methods: List[str] = Field(
        default=["GET", "POST", "PUT", "DELETE", "PATCH"], alias="CORS_ALLOW_METHODS"
    )
    allow_headers: List[str] = Field(default=["*"], alias="CORS_ALLOW_HEADERS")
```

Das `CORSSettings`-Objekt ist eingebunden als `settings.cors` (config.py, Zeile ~896). Die Hilfseigenschaft `settings.cors_origins` delegiert zu `settings.cors.allowed_origins` (Zeile ~913–915) — nur `allow_origins` wird korrekt gelesen.

**Erklärung:** `CORSSettings.allow_methods`, `.allow_headers` und `.allow_credentials` sind vollständig implementiert und per Umgebungsvariable (`CORS_ALLOW_METHODS` etc.) konfigurierbar — haben aber keinerlei Wirkung, weil `main.py` diese Properties nie liest und stattdessen Literale (`["*"]`, `True`) verwendet. Die Klasse ist für drei von vier CORS-Parametern wirkungslos.

### Empfehlung

```python
# main.py Zeile 1181-1188 — Fix:
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors.allow_credentials,
    allow_methods=settings.cors.allow_methods,
    allow_headers=settings.cors.allow_headers,
    expose_headers=["X-Request-ID"],
)
```

Prio: LOW — kein Sicherheitsproblem solange `["*"]` für die Zielumgebung akzeptabel ist, aber inkonsistente Konfiguration erhöht das Risiko bei Umgebungs-Differenzierung (Dev vs. Prod). Einzeiliger Fix.

---

## Anhang: Konsultierte Spezialisten-Agenten

- **Frontend-Spezialist (Explore):** FE-01 Interface-Zählung + FE-02-FE Interface/Matching-Analyse — Befund: FE-02 vollständig implementiert, FE-01 teilweise (ca. 8 offen)
- **Backend-Spezialist (Explore):** FE-02-BE Server-Payload + FE-03 CORS-Analyse — Befund: FE-02-BE vollständig implementiert, FE-03 offen (3 von 4 CORS-Parametern ignorieren CORSSettings)

---

## Folge-Empfehlungen

- **FE-01:** 5 fehlende Interface-Definitionen in `websocket-events.ts` nachtragen (`sensor_config_deleted`, `actuator_config_deleted`, `notification_updated`, `notification_unread_count`, `device_context_changed`) + 3 fehlende Union-Einträge klären — Prio **MEDIUM** — Schicht **Frontend**
- **FE-03:** `main.py` CORS-Middleware auf `settings.cors.*` umstellen (3 Zeilen) — Prio **LOW** — Schicht **Backend**
- **FE-02 VPD-Pfad (Nebenbefund):** VPD-Broadcast in `sensor_handler.py:~813–829` sendet keine `config_id`/Adressfelder — prüfen ob das intentional ist oder Folge-Fix nötig — Prio **LOW** — Schicht **Backend**
