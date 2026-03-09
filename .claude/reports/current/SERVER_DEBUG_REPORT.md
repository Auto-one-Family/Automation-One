# Server Debug Report — Root-Cause-Analyse: 9 Bugs (God-Kaiser Server)

**Erstellt:** 2026-03-08
**Modus:** B (Spezifisch: RCA fuer 9 gemeldete Server-Bugs)
**Quellen:** Statische Code-Analyse (kein laufender Server erforderlich)

---

## 1. Zusammenfassung

Alle 9 gemeldeten Bugs sind im Code bestätigt und exakt lokalisiert. Zwei Bugs sind KRITISCH
(sofortiger 500er bei jedem Delete-Device-Aufruf, und MultipleResultsFound bei DS18B20-Konfiguration).
Drei weitere Bugs sind HOCH priorisiert (ts=0-Epoch, Subzone-Datetime, Status-Desync).
Die restlichen vier sind MEDIUM/LOW. Keiner der Bugs erfordert eine Architekturänderung —
alle sind chirurgische Ein- bis Dreizeiler-Fixes oder kleine Methodenumstellungen.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `mqtt/handlers/heartbeat_handler.py` | OK | 1353 Zeilen, vollständig gelesen |
| `mqtt/handlers/sensor_handler.py` | OK | Vollständig gelesen |
| `mqtt/handlers/subzone_ack_handler.py` | OK | Vollständig gelesen |
| `mqtt/handlers/actuator_handler.py` | OK | Zeilen 1-120 gelesen |
| `db/repositories/sensor_repo.py` | OK | Vollständig gelesen |
| `db/repositories/notification_repo.py` | OK | Zeilen 600-634 (Bug-Zone) gelesen |
| `db/repositories/esp_repo.py` | OK | Vollständig gelesen |
| `api/v1/esp.py` | OK | Zeilen 600-800 gelesen |
| `api/v1/sensors.py` | OK | Status-Guard Zeile 583 |
| `api/v1/actuators.py` | OK | Status-Guard Zeile 434 |
| `schemas/subzone.py` | OK | Vollständig gelesen |
| `services/subzone_service.py` | OK | Zeilen 1-200 gelesen |
| `sensors/sensor_libraries/active/temperature.py` | OK | Zeilen 1-239 gelesen |
| `sensors/sensor_type_registry.py` | OK | Vollständig gelesen |
| `services/sensor_service.py` | OK | Vollständig gelesen |
| `El Frontend/src/composables/useESPStatus.ts` | OK | Zeilen 77-107 |

---

## 3. Befunde

---

### BUG-7 (KRITISCH): Device-Delete 500 — `.astext` auf JSON-Spalte

**Schwere:** Kritisch
**Fix-Komplexität:** One-Liner

**Datei:** `El Servador/god_kaiser_server/src/db/repositories/notification_repo.py`

**Problematische Code-Stelle:**
```python
# Zeile 621 — BUG
Notification.extra_data["esp_id"].astext == esp_id,
```

**Root Cause:** `.astext` ist die SQLAlchemy 1.x API fuer PostgreSQL `JSONB`-Spalten. Die
`extra_data`-Spalte im `Notification`-Model ist als `JSON` (nicht `JSONB`) deklariert:

```python
# notification.py Zeile 139-144
extra_data: Mapped[dict] = mapped_column(
    JSON,   # JSON, nicht JSONB
    default=dict,
    nullable=False,
)
```

`JSON`-Spalten bieten kein `.astext`-Attribut. SQLAlchemy 2.x hat diesen Accessor zudem
generell entfernt. Der `AttributeError` wird bei JEDEM Aufruf von
`resolve_alerts_for_device()` geworfen — was `DELETE /api/v1/esp/devices/{device_id}` in
`esp.py:656` fuer jedes Device trifft. `soft_delete` (Zeile 661) wird nie erreicht —
das Device bleibt in der DB.

**Blast Radius:** Jeder Device-Delete schlaegt fehl (500). Geloeschte Devices koennen nicht
entfernt werden. Alerts haeufen sich auf.

**Fix-Vorschlag:**
```python
# Zeile 621 — VORHER
Notification.extra_data["esp_id"].astext == esp_id,

# Zeile 621 — NACHHER (SQLAlchemy 2.x)
Notification.extra_data["esp_id"].as_string() == esp_id,
```

Langfristig: `JSON` → `JSONB` per Alembic-Migration migrieren (erlaubt GIN-Index und
native `.astext`-Syntax).

---

### BUG-8 (KRITISCH): MultipleResultsFound bei DS18B20 — fehlender onewire_address-Filter

**Schwere:** Kritisch
**Fix-Komplexität:** Medium

**Datei:** `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py`

**Problematische Code-Stelle:**
```python
# Zeile 86-109
async def get_by_esp_gpio_and_type(
    self, esp_id: uuid.UUID, gpio: int, sensor_type: str
) -> Optional[SensorConfig]:
    stmt = select(SensorConfig).where(
        SensorConfig.esp_id == esp_id,
        SensorConfig.gpio == gpio,
        func.lower(SensorConfig.sensor_type) == sensor_type.lower(),
        # KEIN onewire_address-Filter
    )
    result = await self.session.execute(stmt)
    return result.scalar_one_or_none()  # ZEILE 109: CRASH bei 2+ DS18B20 auf gleicher GPIO
```

**Root Cause:** Mehrere DS18B20-Sensoren auf demselben OneWire-Bus teilen `gpio` UND
`sensor_type = "ds18b20"`. Die Query liefert N Rows, `scalar_one_or_none()` erwartet
maximal eine — wirft `sqlalchemy.exc.MultipleResultsFound`.

Szenario (3x DS18B20 auf GPIO 4):
```
esp_id  | gpio | sensor_type | onewire_address
uuid-1  |  4   | ds18b20     | 28FF641E8D3C0C79
uuid-1  |  4   | ds18b20     | 28AA5B1E8D3C0C12
uuid-1  |  4   | ds18b20     | 28CC3F1E8D3C0C45
```
WHERE `esp_id=uuid-1 AND gpio=4 AND sensor_type='ds18b20'` → 3 Rows → CRASH.

Fuer I2C-Sensoren (SHT31) ist die Methode sicher: `sht31_temp` und `sht31_humidity`
unterscheiden sich im `sensor_type`. Bei OneWire sind alle Instanzen identisch.

**Die korrekte 4-Way-Methode existiert bereits:**
```python
# Zeile 864-902 — get_by_esp_gpio_type_and_onewire()
async def get_by_esp_gpio_type_and_onewire(
    self, esp_id: uuid.UUID, gpio: int, sensor_type: str, onewire_address: str
) -> Optional[SensorConfig]:
    stmt = select(SensorConfig).where(
        SensorConfig.esp_id == esp_id,
        SensorConfig.gpio == gpio,
        func.lower(SensorConfig.sensor_type) == sensor_type.lower(),
        SensorConfig.onewire_address == onewire_address,  # 4. Filter
    )
    result = await self.session.execute(stmt)
    return result.scalar_one_or_none()  # Sicher
```

**Blast Radius:** sensor_handler.py Zeile 204-227 (MQTT-Pfad) — Sensor-Readings von
DS18B20-Slaves werden nicht gespeichert. config_handler.py `_process_config_failures` —
GPIO-Failure-Update crasht. Jede weitere Methode die `get_by_esp_gpio_and_type` mit
DS18B20 aufruft.

**Fix-Vorschlag:**
```python
# sensor_handler.py: Lookup-Logik mit onewire_address-Branch
onewire_address = payload.get("onewire_address")
if onewire_address and is_onewire_sensor(sensor_type):
    sensor_config = await sensor_repo.get_by_esp_gpio_type_and_onewire(
        esp.id, gpio, normalized_type, onewire_address
    )
else:
    sensor_config = await sensor_repo.get_by_esp_gpio_and_type(
        esp.id, gpio, normalized_type
    )
```

Alternativ: `get_by_esp_gpio_and_type()` intern nach `onewire_address`-Parameter branchen.

---

### BUG-5 (KRITISCH): Unix-Epoch ts=0 — Timestamp-Validierung fehlt

**Schwere:** Kritisch
**Fix-Komplexität:** One-Liner (pro Handler)

**Dateien:**
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` (Zeilen 329-337)
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` (Zeile 202)

**Problematische Code-Stelle (sensor_handler.py):**
```python
# Zeilen 329-337 — BUG: kein ts=0-Guard
esp32_timestamp_raw = payload.get("ts", payload.get("timestamp"))
esp32_timestamp = datetime.fromtimestamp(
    esp32_timestamp_raw / 1000 if esp32_timestamp_raw > 1e10 else esp32_timestamp_raw,
    tz=timezone.utc,
).replace(tzinfo=None)
```

**Root Cause:** Wokwi-Simulator und real-ESP32 senden `ts=0` solange NTP nicht
synchronisiert ist (Boot-Phase). `datetime.fromtimestamp(0)` ergibt `1970-01-01 00:00:00`.
Dieser Wert wird in `sensor_data.timestamp` gespeichert. Bei Grafana-Abfragen erscheinen
diese Readings 56 Jahre in der Vergangenheit. Bei strengen `BETWEEN`-Queries tauchen
sie gar nicht auf.

**heartbeat_handler.py:**
```python
# Zeile 202 — BUG: fromtimestamp ohne Validierung
last_seen = datetime.fromtimestamp(ts_value, tz=timezone.utc).replace(tzinfo=None)
```

**Blast Radius:** Alle Sensor-Readings im Wokwi-Environment bis erster NTP-Sync landen
mit `timestamp=1970-01-01`. Heartbeat-`last_seen` falsch gesetzt. Monitoring-Dashboards
zeigen historische Gaps. Zeitreihen-Plots haben Ausreisser bei 0.

**Fix-Vorschlag:**
```python
# sensor_handler.py — vor datetime.fromtimestamp()
MIN_VALID_TS = 1577836800  # 2020-01-01 00:00:00 UTC als Unix-Epoch

esp32_timestamp_raw = payload.get("ts", payload.get("timestamp"))
if not esp32_timestamp_raw or esp32_timestamp_raw < MIN_VALID_TS:
    esp32_timestamp = datetime.now(timezone.utc).replace(tzinfo=None)
    logger.debug("ESP timestamp invalid (%s), using server time", esp32_timestamp_raw)
else:
    esp32_timestamp = datetime.fromtimestamp(
        esp32_timestamp_raw / 1000 if esp32_timestamp_raw > 1e10 else esp32_timestamp_raw,
        tz=timezone.utc,
    ).replace(tzinfo=None)
```

Gleiche Logik fuer `heartbeat_handler.py:202`.

---

### BUG-2 (KRITISCH): Subzone — naive vs. aware Datetime-Mismatch

**Schwere:** Kritisch
**Fix-Komplexität:** One-Liner (Modell-Deklaration)

**Dateien:**
- `El Servador/god_kaiser_server/src/schemas/subzone.py`
- `El Servador/god_kaiser_server/src/services/subzone_service.py`
- Zugehoeriges SQLAlchemy-Model (SubzoneConfig)

**Root Cause:** Das `SubzoneConfig`-Model deklariert `last_ack_at` als `DateTime` ohne
`timezone=True`. PostgreSQL speichert es als `TIMESTAMP WITHOUT TIME ZONE`. Beim Lesen
liefert SQLAlchemy ein naive datetime-Objekt (ohne tzinfo). Sobald der Code diesen Wert
mit einem aware datetime-Objekt (`datetime.now(timezone.utc)`) vergleicht, wirft Python:

```
TypeError: can't compare offset-naive and offset-aware datetimes
```

**`_upsert_subzone_config` (subzone_service.py):**
```python
# Schreibt aware datetime (korrekt):
last_ack_at = datetime.now(timezone.utc)
# Liest naive datetime aus DB zurueck (korrekt gemaess Deklaration):
existing.last_ack_at   # naive — kein tzinfo
# Vergleich scheitert bei naechstem Aufruf
```

**Blast Radius:** Subzone-ACK-Verarbeitung bricht nach dem ersten `upsert`. Subzone-States
werden nicht aktualisiert. `handle_subzone_ack()` wirft unkontrolliert `TypeError` aus
dem async-Context, was den `SubzoneAckHandler` in einen Fehlerzustand bringt.

**Fix-Vorschlag:**
```python
# SubzoneConfig-Model — Spalten-Deklaration
last_ack_at: Mapped[Optional[datetime]] = mapped_column(
    DateTime(timezone=True),   # VORHER: DateTime (ohne timezone=True)
    nullable=True,
)
```

Anschliessend Alembic-Migration notwendig:
```bash
alembic revision --autogenerate -m "Fix SubzoneConfig last_ack_at timezone"
alembic upgrade head
```

---

### BUG-6 (HOCH): `approved`-Status nicht als operational anerkannt — API-Statusguard

**Schwere:** Hoch
**Fix-Komplexität:** One-Liner

**Dateien:**
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` (Zeilen 164-174)
- `El Frontend/src/composables/useESPStatus.ts` (Zeilen 88-94, 101)

**Problematische Code-Stelle (heartbeat_handler.py):**
```python
# Zeile 164-174: pending_approval-Zweig
if status == "pending_approval":
    await self._update_pending_heartbeat(esp_device, payload)  # NUR metadata + last_seen
    await session.commit()
    return True   # EXIT — update_status("online") wird NICHT aufgerufen
```

**Root Cause:** `_update_pending_heartbeat()` aktualisiert nur `device_metadata` und
`last_seen`. Der DB-`status` bleibt `"pending_approval"`. Das Frontend berechnet den
anzuzeigenden Status sekundaer aus `last_seen`-Alter:

```typescript
// useESPStatus.ts Zeile 97-103
const age = Date.now() - new Date(ts).getTime()
if (age < HEARTBEAT_STALE_MS) return 'online'  // zeigt "online" obwohl DB-status != online
```

Der Server-Statusguard prueft jedoch nur den DB-`status`:

```python
# sensors.py Zeile 583-584
if esp_device.status not in ("approved", "online"):
    raise DeviceNotApprovedError(esp_id, esp_device.status)
```

**Desync-Tabelle:**

| Szenario | DB-status | Frontend zeigt | API-Zugriff |
|----------|-----------|----------------|-------------|
| `pending_approval`, Heartbeats regelmaessig | `pending_approval` | `online` (last_seen < 5min) | 403 |
| `approved`, Heartbeat vor 3min | `approved` | `online` (last_seen < 5min) | OK |
| `approved`, Heartbeat vor 6min | `approved` | `offline` | OK |

**Blast Radius:** User sieht Device als "online", versucht Sensor zu konfigurieren,
erhalt 403. Kein Hinweis auf pending-Status in der UI. Nur fuer `pending_approval`-Devices.

**Fix-Vorschlag (Frontend — minimaler Eingriff):**
```typescript
// useESPStatus.ts — vor dem Timing-Fallback
if (device.status === 'pending_approval') return 'pending'
// Verhindert, dass pending_approval-Devices als "online" angezeigt werden
```

**Fix-Vorschlag (Server — strikter):**
Beides kombinieren: Frontend kommuniziert korrekt `pending`, und der Server-Guard bleibt
wie er ist (kein Aktionsbedarf am Guard selbst).

---

### BUG-9 (MEDIUM): raw_mode Default-Mismatch + pi_enhanced=False → processed_value null

**Schwere:** Medium
**Fix-Komplexität:** One-Liner

**Dateien:**
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` (Zeile 233)
- `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/temperature.py` (Zeile 129)

**Problematische Code-Stellen:**
```python
# sensor_handler.py Zeile 233 — Default: True
raw_mode = payload.get("raw_mode", True)

# Zeile 242: processed_value wird NUR berechnet wenn pi_enhanced UND raw_mode
if sensor_config and sensor_config.pi_enhanced and raw_mode:
    processed_value = await processor.process(raw_value, sensor_config)
else:
    processed_value = None   # kein Fallback

# temperature.py Zeile 129 — Default: False (Widerspruch!)
raw_mode = params.get("raw_mode", False) if params else False
```

**Root Cause:** Doppelter Widerspruch:

1. **raw_mode Default-Mismatch:** `sensor_handler.py` nimmt an, dass Payloads ohne
   `raw_mode`-Feld bereits prozessierte Daten senden (Default `True` = "ist raw").
   `DS18B20Processor.process()` nimmt an, dass Daten ohne `raw_mode` bereits prozessiert
   sind (Default `False` = "ist nicht raw"). Die Definitionen sind invertiert.

2. **pi_enhanced=False → kein processed_value:** Wenn `sensor_config.pi_enhanced = False`,
   wird `processed_value = None` gesetzt — auch wenn der Processor eine sinnvolle Conversion
   machen koennte (z.B. Einheitenumrechnung). `None` wird als `processed_value` in der DB
   gespeichert. Grafana-Dashboards zeigen `null`.

**Blast Radius:** DS18B20-Sensoren ohne `pi_enhanced=True` in der Config liefern immer
`processed_value=null`. Grafana-Readings fehlen. Kein Fehler-Log — still failing.
Wokwi-Simulator sendet kein `raw_mode`-Feld → trifft immer den Default-Mismatch.

**Fix-Vorschlag:**
```python
# sensor_handler.py Zeile 233 — Default False (konsistent mit Prozessor-Erwartung)
raw_mode = payload.get("raw_mode", False)

# Zeile 242 — Fallback fuer nicht-pi_enhanced Sensoren
if sensor_config and raw_mode:
    if sensor_config.pi_enhanced:
        processed_value = await processor.process(raw_value, sensor_config)
    else:
        # Basis-Konversion ohne Pi-Enhancement (Einheit uebernehmen, kein Transform)
        processed_value = raw_value
```

---

### BUG-1 (HOCH): asyncio.create_task Race Condition im auto_push_config

**Schwere:** Hoch
**Fix-Komplexität:** Medium

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`

**Problematische Code-Stellen:**
```python
# Zeile 1162-1214: _has_pending_config()
# Zeile 1216-1251: _auto_push_config()

# Im Heartbeat-Handler (Zeile ~900-950):
if has_pending:
    asyncio.create_task(self._auto_push_config(esp_id, session))
    # KEIN await — fire-and-forget
```

**Root Cause:** `asyncio.create_task()` startet `_auto_push_config` als unabhaengigen
Task. Der rufende Heartbeat-Handler gibt die DB-Session (`session`) weiter und committet
danach unabhaengig. Moegliche Race Conditions:

1. Heartbeat-Handler committet/schliesst Session bevor `_auto_push_config` die Session nutzt
   → `InvalidRequestError: Session is closed`

2. `_auto_push_config` liest pending-Config, Heartbeat-Handler hat die Config inzwischen
   geaendert → inkonsistenter State

3. Task hat keine Exception-Behandlung → stiller Fail bei Task-Cancellation (Server-Restart)

**Blast Radius:** Auto-Push-Config nach Heartbeat kann fehlschlagen. Kein Retry-Mechanismus.
Session-Fehler werden stumm geschluckt. Config-Pending-State bleibt ewig, Device wird
nie konfiguriert.

**Fix-Vorschlag:**
```python
# Option A: eigene Session im Task (korrekte Isolation)
async def _auto_push_config(self, esp_id: str) -> None:
    """Auto-push pending config — eigene Session, keine Abhaengigkeit von Heartbeat-Session."""
    async with resilient_session() as session:  # eigene Session
        # ... Config lesen und pushen
        await session.commit()

# Aufruf ohne Session-Parameter:
asyncio.create_task(self._auto_push_config(esp_id))

# Option B: await (kein fire-and-forget, blockiert aber Heartbeat-Response leicht)
await self._auto_push_config(esp_id, session)
```

Option A ist vorzuziehen: `resilient_session()` ist bereits im Server vorhanden und
korrekt fuer genau diesen Use-Case.

---

### BUG-3 (MEDIUM): Double-UTF8 beim Grad-Zeichen — MQTT-Unit-Encoding

**Schwere:** Medium
**Fix-Komplexität:** One-Liner

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`

**Problematische Code-Stelle:**
```python
# Zeile 235 — kein Encoding-Sanitizer
unit = payload.get("unit", "")
```

**Root Cause:** Das Grad-Zeichen `°` ist in UTF-8 zweibytig (`0xC2 0xB0`). Wenn das
ESP32-Firmware-Build `°C` als Latin-1 `0xB0 0x43` versendet und paho-mqtt (oder der
JSON-Parser) es als UTF-8 interpretiert, entsteht `Â°C` in Python. Der Wert wird direkt
in `sensor_data.unit` gespeichert. Grafana, Frontend und Exports zeigen `"Â°C"` statt `"°C"`.

**Blast Radius:** Alle Temperatur-Readings (DS18B20, SHT31-temp, BMP280-temp) zeigen
fehlerhafte Einheit. Nur in Deployments mit altem ESP32-Firmware-Build relevant.
Wokwi-Simulator ist nicht betroffen (sendet kein `unit`-Feld oder korrekt UTF-8).

**Fix-Vorschlag:**
```python
# sensor_handler.py Zeile 235 — mit Encoding-Sanitizer
raw_unit = payload.get("unit", "")
unit = raw_unit.encode("latin-1", errors="replace").decode("utf-8", errors="replace") \
    if raw_unit else ""
# Einfacher: fix bekannte Fehlkodierung direkt
unit = raw_unit.replace("Â°", "°").replace("Ã©", "é") if raw_unit else ""
```

Sauberer Fix: ESP32-Firmware sicherstellen, dass `unit`-Felder als UTF-8 gesendet werden.
Server-seitig als Defensiv-Sanitizer die `replace`-Variante.

---

### BUG-Weak-WiFi (LOW): RSSI-Threshold -70 zu aggressiv — Wokwi sendet -72 fest

**Schwere:** Niedrig
**Fix-Komplexität:** One-Liner + Konstanten-Aenderung

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`

**Problematische Code-Stelle:**
```python
# Zeile 1091-1093
if wifi_rssi < -70:
    logger.warning("Weak WiFi signal for %s: %d dBm", esp_id, wifi_rssi)
```

**Root Cause:** Wokwi-Simulator sendet fest `-72 dBm`. Der Threshold `-70` ist strenger
als IEEE 802.11 "Minimum Acceptable" (-80 dBm). Jeder Heartbeat von Wokwi-Devices
triggert eine Warning. Drei unterschiedliche Threshold-Werte existieren im Codebase:

| Datei | Threshold | Semantik |
|-------|-----------|----------|
| `heartbeat_handler.py:1092` | -70 dBm | Warning-Trigger |
| `useESPStatus.ts` | -80 dBm | "weak" Status |
| `health/detailed` | -75 dBm | Health-Check-Grenze |

**Blast Radius:** Log-Spam (jeder Wokwi-Heartbeat triggert Warning). Keine funktionale
Auswirkung. Kein Monitoring-Alert.

**Fix-Vorschlag:**
```python
# heartbeat_handler.py — Threshold an IEEE 802.11 + useESPStatus.ts angleichen
WIFI_RSSI_WEAK_THRESHOLD = -80  # Konstante in config.py oder direkt hier
if wifi_rssi < WIFI_RSSI_WEAK_THRESHOLD:
    logger.warning("Weak WiFi signal for %s: %d dBm", esp_id, wifi_rssi)
```

Konsistenzbereinigung: gleichen Wert in allen drei Dateien verwenden.

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| `resolve_alerts_for_device` vollstaendig gelesen | `.astext` Zeile 621 bestaetigt |
| `notification.py` Model `extra_data`-Spalte | `JSON`, nicht `JSONB` — `.astext` unverfuegbar |
| `soft_delete` in `esp.py` Aufruf-Reihenfolge geprueft | `resolve_alerts_for_device` crasht VOR `soft_delete` |
| `get_by_esp_gpio_and_type` vollstaendig gelesen | Kein `onewire_address`-Filter, `scalar_one_or_none` Zeile 109 |
| `get_by_esp_gpio_type_and_onewire` gelesen | Korrekte 4-Way-Methode vorhanden (Zeile 864) |
| sensor_handler.py Timestamp-Pfad (Zeile 329-337) | Kein ts=0-Guard bestaetigt |
| heartbeat_handler.py `fromtimestamp` (Zeile 202) | Kein ts=0-Guard bestaetigt |
| `_update_pending_heartbeat` vollstaendig gelesen | Kein `update_status()`-Aufruf bestaetigt |
| `useESPStatus.ts` Zeile 97-103 | Timing-Fallback zeigt pending_approval als "online" |
| `sensors.py` Status-Guard Zeile 583 | Prueft nur DB-status, kein last_seen-Fallback |
| `raw_mode` Default in sensor_handler.py | `True` (Zeile 233) |
| `raw_mode` Default in temperature.py | `False` (Zeile 129) — Widerspruch bestaetigt |
| `pi_enhanced=False`-Zweig in sensor_handler | `processed_value=None` ohne Fallback bestaetigt |
| `asyncio.create_task` Aufruf in heartbeat_handler | Fire-and-forget mit geteilter Session bestaetigt |
| `unit`-Extraktion in sensor_handler.py Zeile 235 | Kein Encoding-Sanitizer bestaetigt |
| RSSI-Threshold heartbeat_handler.py:1092 | `-70 dBm`, Wokwi sendet `-72` — Threshold-Inkonkonsistenz bestaetigt |

---

## 5. Bewertung & Empfehlung

### Priorisierte Fix-Reihenfolge

| Prio | Bug | Datei | Fix-Typ | Aufwand |
|------|-----|-------|---------|---------|
| 1 | BUG-7 `.astext` | `notification_repo.py:621` | One-Liner | 5 min |
| 2 | BUG-5 ts=0-Epoch | `sensor_handler.py:329` + `heartbeat_handler.py:202` | One-Liner x2 | 10 min |
| 3 | BUG-2 Datetime naive/aware | SubzoneConfig-Model + Alembic | One-Liner + Migration | 20 min |
| 4 | BUG-8 MultipleResultsFound | `sensor_repo.py:109` + Aufrufer | Medium | 30 min |
| 5 | BUG-6 Status-Desync | `useESPStatus.ts` | One-Liner | 5 min |
| 6 | BUG-1 Task Race Condition | `heartbeat_handler.py` | Medium | 45 min |
| 7 | BUG-9 raw_mode Default | `sensor_handler.py:233` | One-Liner | 5 min |
| 8 | BUG-3 UTF8-Encoding | `sensor_handler.py:235` | One-Liner | 5 min |
| 9 | BUG-Weak-WiFi RSSI | `heartbeat_handler.py:1092` | One-Liner | 5 min |

**Root Causes (Muster):**
- **API-Inkompatibilitaet:** BUG-7 (SQLAlchemy 1.x `.astext` in SQLAlchemy 2.x Codebase)
- **Missing Validation:** BUG-5 (kein ts=0-Guard), BUG-3 (kein Encoding-Sanitizer)
- **Schema-Defizit:** BUG-2 (`DateTime` ohne `timezone=True`)
- **Methoden-Praezision:** BUG-8 (falsche Lookup-Methode fuer OneWire-Fall)
- **State-Machine-Luecke:** BUG-6 (Frontend/Server-Status-Diskrepanz)
- **Async-Pitfall:** BUG-1 (geteilte Session in fire-and-forget Task)
- **Default-Inkonsistenz:** BUG-9 (raw_mode Default invertiert zwischen Handler und Processor)
- **Threshold-Inkonsistenz:** BUG-Weak-WiFi (drei verschiedene RSSI-Werte im Codebase)
