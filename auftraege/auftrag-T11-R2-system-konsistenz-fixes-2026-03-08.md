# Auftrag T11-R2: System-Konsistenz-Fixes — BUG-06 bis BUG-11 + Alert-Storm

> **Bezug:** T11-R2 System-Konsistenz Dev-Report (Robin, 2026-03-08)
> **Vorgaenger:** T10-Fix-A bis Fix-E (bereits implementiert). T11 Frontend-Audit aktiv.
> **Prioritaet:** KRITISCH (BUG-06, BUG-07, BUG-08) + HOCH (Alert-Storm) + MITTEL (BUG-09) + NIEDRIG (BUG-10, BUG-11)
> **Bereich:** El Servador (Backend) + El Frontend (Vue 3)
> **Datum:** 2026-03-08
> **Geschaetzter Aufwand:** ~8-12h gesamt (Fix-A: 1-2h, Fix-B: 2-3h, Fix-C: 1-2h, Fix-D: 1h)
> **Abhaengigkeit:** T10-Fix-A bis Fix-E vorausgesetzt (config_id-basierter Lookup, config_id-basiertes DELETE)

---

## Uebersicht der Bugs

| # | Severity | Kurzname | Schicht | Root Cause (Zusammenfassung) |
|---|----------|----------|---------|------------------------------|
| BUG-06 | KRITISCH | Status-Desync | Server: heartbeat_handler | pending_approval-Pfad setzt update_status() nicht auf "online" — status bleibt pending, last_seen wird aktualisiert, Frontend sieht "online" (via Fallback), Server-API prueft status-Feld → 403 |
| BUG-07 | KRITISCH | Device-Delete 500 | Server: notification_repo | `.astext` auf JSON-Spalte statt JSONB — AttributeError bei Device-Delete |
| BUG-08 | HOCH | MultipleResultsFound | Server: sensor_repo | get_by_esp_gpio_and_type() filtert nicht nach onewire_address — 110 Exceptions in 30 Min |
| Alert-Storm | HOCH | 14 Alerts/h | Server: notification-pipeline | Dedup-Fingerprint matcht nicht (BUG-08-Feedback-Loop + 60s-Fenster zu kurz) |
| BUG-09 | MITTEL | Subzone-Namen NULL | Server/Frontend: Config-Panel | Namen werden beim Setzen nicht korrekt persistiert |
| BUG-10 | NIEDRIG | Heartbeat Epoch-Null | Frontend: DeviceSettings | last_seen=NULL → "01.01.1970, 01:00" statt "—" |
| BUG-11 | NIEDRIG | Acknowledged toter Code | Server: Notification-Lifecycle | ISA-18.2 acknowledged-Status wird nie genutzt (0 Rows) |

---

## Architektur-Kontext (AutomationOne)

AutomationOne hat drei Schichten:
- **El Trabajante** (ESP32 Firmware): Sensoren + Aktoren, sendet per MQTT
- **El Servador** (FastAPI + Python): Backend, PostgreSQL, MQTT-Handler, 170+ REST-Endpoints
- **El Frontend** (Vue 3 + TypeScript): Dashboard, Pinia Stores, WebSocket-Client

**Relevante Architektur-Entscheidungen:**
- `config_id` (Format `cfg_{uuid}`) ist der primäre Identifier fuer sensor_configs — seit T10-Fix-A/B
- DB-Schema: `sensor_configs.sensor_name` (nicht `.name`), KEINE unit-Spalte, UNIQUE auf `(esp_id, gpio, sensor_type, onewire_address, i2c_address)`
- `device_id` ist der externe String-Identifier (z.B. "ESP_472204"), `id` ist der interne UUID-Primaerschluessel
- Dual-Storage: `simulation_config` = Write-Through Cache via `rebuild_simulation_config()`. DB ist autoritativ.
- WebSocket: Double-Dispatch gefixt (T09-Fix-A) — `useWebSocket.on()` registriert nur noch einmal
- ISA-18.2 Alert-Lifecycle: active → acknowledged → resolved. Jeweils eigener Endpunkt.
- Soft-Delete: `esp_devices.deleted_at` Timestamp. `sensor_configs` werden physisch geloescht (cascade).

---

## Fix-Gruppe A: Status-Desync + Device-Delete 500 (KRITISCH)

> **Reihenfolge:** Fix-A vor allen anderen — beide Bugs blockieren Basis-Funktionalitaet.
> **Dateien:** heartbeat_handler.py, notification_repo.py, notification.py (Model)

---

### BUG-06: Status-Desync bei pending_approval (KRITISCH)

#### IST-Zustand

In `heartbeat_handler.py` (Z. 164-174) gibt es einen Sonderpfad fuer Devices im Status `pending_approval`. Dieser Pfad ruft `_update_pending_heartbeat()` auf und kehrt dann mit `return` zurueck, OHNE `update_status(device, "online")` aufzurufen.

Gleichzeitig aktualisiert `_update_pending_heartbeat()` das `last_seen`-Feld via Metadata-Flush. Das Frontend berechnet in `useESPStatus.ts` den Online-Status mit einer 3-Prioritaeten-Logik:
- **Prioritaet 1** (Z. 81-84): Explizite Status-Werte (`error`, `safemode`, `online`, `offline`)
- **Prioritaet 2** (Z. 88-95): Status `approved` mit `last_seen`-Fallback (< 5 Min = online)
- **Prioritaet 3** (Z. 98-103): Kein expliziter Status → `last_seen`-Timing (< 90s = online, < 5min = stale)

**ACHTUNG:** `pending_approval` wird in keiner dieser Prioritaeten explizit behandelt. Es faellt durch zu Prioritaet 3, wo `last_seen` < 90s das Device als `'online'` anzeigt. Der `ESPStatus`-Typ kennt nur: `'online' | 'stale' | 'offline' | 'error' | 'safemode' | 'unknown'` — `'pending_approval'` ist KEIN gueltiger Status-Wert im Frontend.

Wenn ein Client dann eine API-Anfrage stellt, prueft der Server das `status`-Feld in der Datenbank. Da dieses noch `pending_approval` ist, gibt er 403 zurueck. Das Frontend zeigt aber den Device als "online" an — der User sieht keinerlei Hinweis auf den eigentlichen Status.

**Warum dieser Fix wichtig ist:** Ein Device im Status `pending_approval` hat per Definition noch keine Admin-Freigabe erhalten. Es soll NICHT automatisch auf "online" gesetzt werden. Der Fehler ist nicht, dass kein `update_status("online")` aufgerufen wird — der Fehler ist, dass `last_seen` aktualisiert wird ohne den Status zu aendern, und das Frontend `last_seen` als Fallback fuer den Online-Status nutzt. Das fuehrt zu einer irrefuehrenden Darstellung.

#### SOLL-Zustand

**Option A (empfohlen): Frontend-Fallback entfernen / Status-Feld autoritativ machen.**
Das Frontend soll niemals eigenstændig "online" berechnen wenn der Server-Status etwas anderes meldet. `useESPStatus.ts` muss den `status`-Wert aus der API-Antwort verwenden — NICHT `last_seen` als Override.

**Option B: pending_approval im heartbeat_handler explizit behandeln.**
`last_seen` nur dann aktualisieren, wenn der Admin bereits zugestimmt hat. Wenn der Status `pending_approval` ist: last_seen NICHT aktualisieren (oder separat fuer Heartbeat-Tracking verwenden, ohne Frontend-Sichtbarkeit).

**Empfehlung fuer diesen Auftrag: Option A** — weniger riskant, keine Backend-Logik-Aenderung nötig. Der Status kommt vom Server via REST oder WebSocket. Das Frontend soll diesen Wert respektieren, nicht überschreiben.

#### Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `El Frontend/src/composables/useESPStatus.ts` | `getESPStatus()` (Z. 77-107): `pending_approval` als eigene Prioritaet einfuegen → `'unknown'` statt Fallthrough zu Heartbeat-Timing |
| `El Frontend/src/stores/esp.ts` | Pruefen ob Status-Feld korrekt vom Server uebernommen wird (kein Override). **Hinweis:** Store heisst `esp.ts`, nicht `esp.store.ts`. `device.store.ts` existiert NICHT. |
| Optional: `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` (Z. 164-174) | last_seen nur aktualisieren wenn status != pending_approval, ODER pending_approval explizit in WS-Broadcast mitsenden |

#### Konkreter Fix (Frontend)

> **[verify-plan Korrektur]:** Der Pseudo-Code unten war falsch. Die echte `getESPStatus()`-Funktion in `useESPStatus.ts` (Z. 77-107) hat 3 Prioritaeten. `pending_approval` faellt durch zu Prioritaet 3 (Z. 98-103), wo `last_seen < 90s` → `'online'` zurueckgibt. Der Fix muss `pending_approval` als eigene Prioritaet ZWISCHEN Priority 1 und 2 einfuegen.

```typescript
// useESPStatus.ts — getESPStatus() — ECHTE Funktion (Z. 77-107)
// Priority 1: Explicit status (error, safemode, online, offline)
// Priority 2: 'approved' status + last_seen fallback
// Priority 3: No explicit status → heartbeat timing ← pending_approval landet HIER

// SOLL (Fix): pending_approval als eigene Prioritaet einfuegen:
export function getESPStatus(device: ESPDevice): ESPStatus {
  // Priority 1: Explicit error/safemode/online/offline (unveraendert)
  if (device.status === 'error' || ...) return 'error'
  if (device.status === 'online' || device.connected === true) return 'online'
  if (device.status === 'offline') return 'offline'

  // NEU: Priority 1.5 — pending_approval immer als 'unknown' anzeigen
  // (oder neuen ESPStatus-Wert 'pending' einfuehren)
  if (device.status === 'pending_approval') return 'unknown'  // NICHT 'online'!

  // Priority 2+3: approved / heartbeat timing (unveraendert)
  // ...
}
```

**ACHTUNG:** Der `ESPStatus`-Typ (`'online' | 'stale' | 'offline' | 'error' | 'safemode' | 'unknown'`) kennt keinen Wert `'pending_approval'`. Entweder auf `'unknown'` mappen oder den Typ erweitern. `return device.status` wuerde TypeScript-Fehler verursachen da `'pending_approval'` nicht im Union-Typ ist.

Wenn `last_seen` fuer den Heartbeat-Freshness-Indikator benoetigt wird (z.B. "Heartbeat veraltet"), das GETRENNT von `computedStatus` behandeln — als separate visuelle Warnung, nicht als Status-Override.

#### Akzeptanzkriterien

1. Device mit `status = 'pending_approval'` in DB zeigt Frontend-Status "Ausstehend" oder "Wartet auf Genehmigung" — NICHT "online"
2. Device mit `status = 'pending_approval'` zeigt korrekten 403-Fehler wenn API-Anfragen gestellt werden
3. Kein false-positive "online" durch last_seen-Fallback
4. Bestehende Tests gruen (kein Regression fuer echte online/offline-Devices)
5. `useESPStatus.ts` hat KEINEN Pfad mehr der `last_seen` als Status-Override nutzt

---

### BUG-07: Device-Delete gibt 500 (KRITISCH)

#### IST-Zustand

In `El Servador/god_kaiser_server/src/db/repositories/notification_repo.py`, Zeile 621, wird `.astext` auf eine JSON-Spalte angewendet (`Notification.extra_data["esp_id"].astext == esp_id`). Die Spalte `extra_data` ist in `El Servador/god_kaiser_server/src/db/models/notification.py:139` als `mapped_column(JSON, default=dict, nullable=False)` definiert. **Hinweis:** `nullable=False` (nicht `nullable=True` wie im TM-Bericht).

`.astext` ist ein SQLAlchemy-Operator, der nur fuer **JSONB**-Spalten (PostgreSQL-spezifisch) verfuegbar ist. Auf einer `JSON`-Spalte gibt es diesen Operator nicht → `AttributeError` → 500.

Dieser Fehler tritt spezifisch beim Device-Delete auf, weil `notification_repo` aufgerufen wird um Notifications fuer das Device zu bereinigen oder zu pruefen, bevor das Device geloescht wird.

**Warum JSON vs. JSONB relevant ist:** PostgreSQL kennt zwei JSON-Typen:
- `JSON`: Speichert als Text, keine direkte Operatoren-Unterstuetzung. `.astext`, `->>`, `@>` sind NICHT verfuegbar.
- `JSONB`: Speichert als binaeres Format, indizierbar, unterstuetzt alle JSON-Operatoren inkl. `.astext`. Performance-Vorteil bei Abfragen.

Da AutomationOne PostgreSQL nutzt und die `extra_data`-Spalte bereits fuer strukturierte Daten verwendet wird (Notification-Kontext, Sensor-Referenzen), sollte diese Spalte JSONB sein.

#### SOLL-Zustand

**Schritt 1:** `notification.py` — Column-Typ auf JSONB aendern:

```python
# notification.py
from sqlalchemy.dialects.postgresql import JSONB  # Import hinzufuegen

class Notification(Base):
    # ...
    # VORHER:
    # extra_data = Column(JSON, nullable=True)
    # NACHHER:
    extra_data = Column(JSONB, nullable=True)
```

**Schritt 2:** Alembic-Migration erstellen:

```python
# alembic/versions/change_notification_extra_data_to_jsonb.py
"""Change notification extra_data from JSON to JSONB

Revision ID: (generiert)
"""
from alembic import op

def upgrade():
    op.alter_column(
        'notifications',
        'extra_data',
        type_=JSONB(),
        postgresql_using='extra_data::jsonb'
    )

def downgrade():
    op.alter_column(
        'notifications',
        'extra_data',
        type_=JSON(),
        postgresql_using='extra_data::text'
    )
```

**Wichtig:** `postgresql_using='extra_data::jsonb'` ist zwingend noetwendig — PostgreSQL kann den Typ nicht automatisch konvertieren ohne expliziten CAST.

**Schritt 3:** `notification_repo.py` pruefe Zeile ~621 — ist `.astext` die richtige Methode?

Bei JSONB ist das korrekte Pattern:
```python
# Zugriff auf ein String-Feld in JSONB:
Notification.extra_data['key'].astext  # JSONB: funktioniert
# NICHT: Notification.extra_data['key'].as_string()  # falsche Syntax
```

Alternativ kann `cast(Notification.extra_data['key'], String)` verwendet werden — robuster als `.astext`.

**Schritt 4:** Alle anderen Stellen in `notification_repo.py` die `.astext` auf `extra_data` verwenden auf JSONB-Syntax pruefen.

#### Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `El Servador/god_kaiser_server/src/db/models/notification.py` (Z. 139) | `mapped_column(JSON)` → `mapped_column(JSONB)` + Import `from sqlalchemy.dialects.postgresql import JSONB` |
| `El Servador/god_kaiser_server/alembic/versions/change_notification_extra_data_to_jsonb.py` | NEU: Migration JSON → JSONB mit `postgresql_using` |
| `El Servador/god_kaiser_server/src/db/repositories/notification_repo.py` (Z. 621) | `.astext` Verwendung bestaetigt: `Notification.extra_data["esp_id"].astext == esp_id` |

#### Akzeptanzkriterien

1. `DELETE /api/v1/devices/{device_id}` gibt 204 (kein 500) bei Devices mit assoziierten Notifications
2. Migration laeuft sauber durch (`alembic upgrade head`)
3. `SELECT pg_typeof(extra_data) FROM notifications LIMIT 1` gibt `jsonb` zurueck
4. Existing Notification-Tests bleiben gruen (JSONB ist abwaertskompatibel zu JSON-Daten)
5. Loki zeigt keine `AttributeError` mehr nach Device-Delete

---

## Fix-Gruppe B: MultipleResultsFound + Alert-Storm (HOCH)

> **Reihenfolge:** Fix-B nach Fix-A. BUG-08 ist die Root Cause des Alert-Storms — Storm reduziert sich nach BUG-08-Fix signifikant.
> **Abhaengigkeit:** Baut auf T10-Fix-A auf (get_by_config_id existiert bereits).

---

### BUG-08: MultipleResultsFound bei OneWire-Sensoren (HOCH)

#### IST-Zustand

In `sensor_repo.py` gibt es eine Methode `get_by_esp_gpio_and_type(esp_id, gpio, sensor_type)` die `scalar_one_or_none()` nutzt. Bei OneWire-Sensoren (z.B. mehrere DS18B20 auf GPIO 4) gibt es **mehrere sensor_configs mit identischem `(esp_id, gpio, sensor_type)`** — sie unterscheiden sich nur durch `onewire_address`.

```
sensor_type | gpio | onewire_address     | config_id
------------|------|---------------------|----------
ds18b20     |  4   | 28FF123456789012    | cfg_aaa...
ds18b20     |  4   | 28FF987654321098    | cfg_bbb...
```

`scalar_one_or_none()` auf `(esp_id, gpio=4, sensor_type='ds18b20')` findet 2 Rows → crasht mit `MultipleResultsFound`.

Dieser Fehler tritt mit hoher Frequenz auf (110 Exceptions in 30 Min), weil `get_by_esp_gpio_and_type()` aus dem MQTT-Handler (sensor_handler) bei JEDEM eingehenden Sensor-Reading aufgerufen wird. Bei 2 DS18B20 die abwechselnd Daten senden → ~2-4 Crashes/Minute permanent.

**[verify-plan Korrektur] ACHTUNG — sensor_handler.py hat bereits 3-Way-Branching:**
Der MQTT-Handler `sensor_handler.py` (Z. 188-227) nutzt **bereits** separate Lookup-Methoden:
1. I2C → `sensor_repo.get_by_esp_gpio_type_and_i2c()` (4-way, Z. 195)
2. OneWire → `sensor_repo.get_by_esp_gpio_type_and_onewire()` (4-way, Z. 208)
3. Standard → `sensor_repo.get_by_esp_gpio_and_type()` (3-way, Z. 220)

Beide 4-way Methoden existieren bereits in `sensor_repo.py` (Z. 864-902, Z. 904-938).

**Der Bug tritt NUR auf wenn:** Das MQTT-Payload KEIN `onewire_address`-Feld enthaelt (z.B. Firmware sendet es nicht) → Fallthrough zu 3-way Lookup → `scalar_one_or_none()` crasht bei 2+ DS18B20. Die Root Cause ist NICHT fehlende Methoden, sondern entweder:
a) Firmware sendet `onewire_address` nicht im Payload (Firmware-Check noetig!)
b) `get_by_esp_gpio_and_type()` (Z. 86-109) nutzt `scalar_one_or_none()` ohne Safety-Guard

#### SOLL-Zustand

**[verify-plan Korrektur] Der sensor_handler hat bereits 3-Way-Branching (Z. 188-227). Der vorgeschlagene Fix (Parameter an get_by_esp_gpio_and_type hinzufuegen) ist REDUNDANT — separate 4-way Methoden existieren schon. Stattdessen:**

**Schritt 1 (Root-Cause):** Pruefen WARUM OneWire-Sensoren den 3-way Fallback treffen:
- Firmware-Check: Sendet El Trabajante `onewire_address` im MQTT-Payload?
- Pruefe `El Trabajante/src/` nach dem Payload-Format fuer DS18B20-Sensoren
- Falls Firmware KEIN `onewire_address` sendet: Firmware-Fix noetig (NICHT Server-Fix)

**Schritt 2 (Safety-Guard):** `get_by_esp_gpio_and_type()` (Z. 86-109 in `sensor_repo.py`) absichern:
- `scalar_one_or_none()` durch sichere Variante ersetzen (wie bei `get_by_esp_and_gpio()` Z. 44-66)

```python
# sensor_repo.py Z. 86-109 — SOLL (crash-safe):
async def get_by_esp_gpio_and_type(
    self, esp_id: uuid.UUID, gpio: int, sensor_type: str
) -> Optional[SensorConfig]:
    stmt = select(SensorConfig).where(
        SensorConfig.esp_id == esp_id,
        SensorConfig.gpio == gpio,
        func.lower(SensorConfig.sensor_type) == sensor_type.lower(),
    )
    result = await self.session.execute(stmt)
    rows = list(result.scalars().all())
    if len(rows) > 1:
        logger.warning(
            "Multiple configs for esp=%s gpio=%s type=%s: %d Treffer. "
            "OneWire/I2C ohne Adresse? Verwende ersten Treffer.",
            esp_id, gpio, sensor_type, len(rows),
        )
        return rows[0]
    return rows[0] if rows else None
```

**Schritt 3 (sensor_handler.py):** Ist bereits korrekt implementiert (Z. 184-227). KEIN Umbau noetig.
Der Handler liest bereits `onewire_address = payload.get("onewire_address")` (Z. 184) und `i2c_address = payload.get("i2c_address")` (Z. 186).

**Schritt 4:** Andere Aufrufer von `get_by_esp_gpio_and_type()` im Codebase pruefen — diese koennten ebenfalls crashen:
- `sensor_repo.py` Z. 559 (update_calibration)
- `sensor_repo.py` Z. 606 (get_calibration)
- Weitere Aufrufer via Grep pruefen

#### Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py` (Z. 86-109) | `scalar_one_or_none()` → sichere List-Variante mit Warning bei len > 1 |
| `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` | **KEIN Umbau noetig** — 3-Way-Branching bereits implementiert (Z. 188-227) |
| Firmware-Check: `El Trabajante/src/` | Pruefen ob DS18B20-Payload `onewire_address` enthaelt |
| Andere Aufrufer von `get_by_esp_gpio_and_type()` | sensor_repo.py Z. 559, 606 — ebenfalls crash-safe machen |
| Tests | Neuer Test: 2 DS18B20 auf GPIO 4 → kein MultipleResultsFound |

#### Akzeptanzkriterien

1. Mit 2x DS18B20 auf GPIO 4: Loki zeigt 0 `MultipleResultsFound`-Errors in 30 Minuten
2. Sensor-Daten beider DS18B20 werden in `sensor_data` gespeichert (verschiedene `sensor_config_id`)
3. Bestehende Tests gruen (108+)
4. MQTT-Handler loggt WARNING (nicht ERROR) wenn onewire_address fehlt aber mehrere Treffer existieren
5. Neuer Test: `test_sensor_repo_no_multiple_results_found_two_ds18b20()` prueft korrekte Differenzierung per onewire_address

---

### Alert-Storm: 14 neue Alerts/Stunde (HOCH)

#### IST-Zustand

Das Notification-System erzeugt ~14 neue Alerts pro Stunde (ca. 1 alle 4 Minuten). Ursache ist eine Kombination aus:

1. **BUG-08-Feedback-Loop:** Jede `MultipleResultsFound`-Exception erzeugt einen Error-Alert. Bei 110 Exceptions/30 Min = ~220 Exceptions/h werden Alerts erzeugt, von denen viele durch den Dedup-Fingerprint geblockt werden — aber nicht alle.

2. **Dedup-Fingerprint matcht nicht:** Der Fingerprint wird aus Alerttyp + ESP-ID + Sensor-Typ + Wert berechnet. Da der Wert bei Fehler-Alerts variiert (z.B. Traceback-Ausschnitt oder Timestamp), sind viele Fingerprints eindeutig → kein Dedup → neuer Alert.

3. **60s-Dedup-Fenster zu kurz:** Bei einem Alarm der alle 4 Minuten feuert (z.B. Heartbeat-Timeout-Alert) und einem 60s-Fenster: nach 60s ist der Dedup abgelaufen → neuer Alert. Fuer Low-Frequenz-Fehler sollte das Fenster laenger sein.

**ISA-18.2 Kontext:** Das ISA-18.2 Standard fuer Alarm-Management empfiehlt max. 6 Alarms/h/Operator. Bei 14 Alerts/h wird dieser Grenzwert deutlich ueberschritten. Jeder Alert ueber dem Limit reduziert die Operator-Aufmerksamkeit und ist kontraproduktiv.

#### SOLL-Zustand

**Fix Teil 1 (kurzfristig): Dedup-Fingerprint robuster machen**

Der Fingerprint fuer Error-Alerts sollte NICHT den variablen Wert (Traceback, Timestamp) enthalten. Stattdessen: nur Alerttyp + ESP-ID + Fehler-Kategorie.

```python
# notification_router.py oder alert_dedup_service.py
def compute_fingerprint(alert_type: str, esp_id: str, sensor_type: str, value: float | None) -> str:
    """
    Fingerprint fuer Dedup. Fuer Error-Alerts: value NICHT einbeziehen,
    weil Tracebacks und Timestamps immer variieren.
    """
    if alert_type in ('sensor_error', 'device_error', 'system_error'):
        # Error-Alerts: nur nach Typ + Geraet deduplizieren
        fingerprint_data = f"{alert_type}:{esp_id}:{sensor_type}"
    else:
        # Schwellwert-Alerts: Wert kann einbezogen werden (ist stabler)
        fingerprint_data = f"{alert_type}:{esp_id}:{sensor_type}:{round(value or 0, 1)}"

    return hashlib.sha256(fingerprint_data.encode()).hexdigest()[:16]
```

**Fix Teil 2 (kurzfristig): Dedup-Fenster je nach Alert-Typ konfigurierbar**

```python
# Konfiguration (config.py oder alert_config):
ALERT_DEDUP_WINDOWS = {
    'sensor_error': 300,       # 5 Minuten fuer Fehler-Alerts (vorher: 60s)
    'device_offline': 300,     # 5 Minuten fuer Offline-Alerts
    'sensor_threshold': 60,    # 60 Sekunden fuer Schwellwert-Alerts (unveraendert)
    'default': 120,            # 2 Minuten Default
}
```

**Fix Teil 3 (mittelfristig, nach BUG-08-Fix): Alert-Storm-Monitor**

Nach dem BUG-08-Fix sollte die Alert-Rate automatisch sinken, weil die `MultipleResultsFound`-Fehler aufhoeren. Zur Verifikation: `SELECT COUNT(*), created_at::date FROM notifications GROUP BY created_at::date ORDER BY created_at::date DESC LIMIT 7;`

**Fix Teil 4: Bestehende duplicate Alerts bereinigen**

```sql
-- Alle aktiven Alerts die durch BUG-08-Feedback-Loop entstanden sind bereinigen:
UPDATE notifications
SET status = 'resolved', resolved_at = NOW()
WHERE status = 'active'
AND title LIKE '%MultipleResultsFound%'
AND created_at > NOW() - INTERVAL '24 hours';
```

#### Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `El Servador/god_kaiser_server/src/services/notification_router.py` (Z. ~110) | Fingerprint ohne variablen Wert fuer Error-Alerts. **Hinweis:** `alert_dedup_service.py` existiert NICHT — Dedup-Logik ist in `notification_router.py` und `notification_repo.py` (Z. 207). |
| `El Servador/god_kaiser_server/src/core/config.py` | `ALERT_DEDUP_WINDOWS` Dictionary mit Typ-spezifischen Fenstern. **Hinweis:** `alert_config.py` existiert NICHT — Config ist in `core/config.py`. |
| Einmalige DB-Bereinigung | SQL-Update fuer bestehende Duplicate-Alerts (manuell oder Script) |

#### Akzeptanzkriterien

1. Alert-Rate nach Fix unter 6/h (ISA-18.2 Grenzwert)
2. Zwei identische `sensor_error`-Alerts fuer gleichen ESP innerhalb von 5 Min → NUR 1 Alert wird erstellt
3. `MultipleResultsFound`-Alerts koennen nach BUG-08-Fix manuell als resolved gesetzt werden
4. Dedup-Fenster fuer Error-Alerts ist in Konfiguration nachvollziehbar dokumentiert

---

## Fix-Gruppe C: Subzone-Namen NULL (MITTEL)

> **Reihenfolge:** Fix-C nach Fix-A und Fix-B. Unabhaengig von Fix-B aber sinnvoll nach Fix-A (stabiler System-Zustand).
> **Bereich:** El Servador (Backend) + El Frontend

---

### BUG-09: Subzone-Namen NULL in subzone_configs (MITTEL)

#### IST-Zustand

5 von 7 `subzone_configs`-Eintraegen haben `subzone_name = NULL`. Das Config-Panel zeigt fuer Subzonen mit NULL-Namen entweder einen leeren String, "Unbekannte Subzone" oder einen Fehler.

**Ursache (Hypothese):** Beim Setzen der Subzone-Zuordnung in `SubzoneAssignmentSection.vue` wird die `subzone_id` korrekt gespeichert, aber `subzone_name` wird entweder:
a) nicht mitgesendet (Frontend sendet nur ID, nicht Namen)
b) im Backend nicht korrekt persistiert (Service setzt subzone_name nicht)
c) erst bei einem separaten "Rename"-Aufruf gesetzt, der nicht immer aufgerufen wird

**DB-Schema `subzone_configs`:**

> **[verify-plan Korrektur]:** Schema weicht vom TM-Bericht ab. Echtes Schema aus `El Servador/god_kaiser_server/src/db/models/subzone.py`:

```sql
CREATE TABLE subzone_configs (
    id UUID PRIMARY KEY,
    esp_id VARCHAR(50) REFERENCES esp_devices(device_id),  -- pro ESP, NICHT pro Zone!
    subzone_id VARCHAR(50) NOT NULL,      -- z.B. 'irrigation_section_A'
    subzone_name VARCHAR(100),            -- kann NULL sein (100 Zeichen, NICHT 255)
    parent_zone_id VARCHAR(50) NOT NULL,  -- String, NICHT UUID
    assigned_gpios JSON,                  -- JSON Array, NICHT INTEGER[]
    safe_mode_active BOOLEAN DEFAULT TRUE,
    sensor_count INTEGER DEFAULT 0,
    actuator_count INTEGER DEFAULT 0,
    UNIQUE (esp_id, subzone_id)
);
```

**Wichtig:** SubzoneConfig ist per ESP (hat `esp_id` FK), NICHT per Zone. Das beeinflusst die Fix-Logik.

**Auswirkung:** Sensoren mit `subzone_id` zeigen in `SensorCard.vue` (Subzone-Badge) und in `ESPSettingsSheet` ("Geraete nach Subzone") keinen Subzone-Namen an. Das macht die Subzone-Struktur fuer den Nutzer unsichtbar.

#### SOLL-Zustand

**Schritt 1 (Backend): Subzone-Namen beim Erstellen einer Subzone setzen**

Bei `POST /api/v1/subzones` und beim impliziten Erstellen einer Subzone via Sensor-Zuweisung MUSS `subzone_name` gesetzt werden. Falls kein Name angegeben: Fallback auf "Subzone {N}" (auto-increment).

```python
# subzone_service.py oder subzone_repo.py
async def create_subzone(zone_id: str, name: str | None = None) -> SubzoneConfig:
    if name is None or name.strip() == '':
        # Auto-Name generieren
        count = await self.get_subzone_count_for_zone(zone_id)
        name = f"Subzone {count + 1}"
    return SubzoneConfig(zone_id=zone_id, subzone_name=name, ...)
```

**Schritt 2 (Backend): Bestehende NULL-Eintraege reparieren**

```python
# In einer Alembic-Migration oder als einmaliges Script:
# UPDATE subzone_configs SET subzone_name = 'Subzone ' || ROW_NUMBER() OVER (
#     PARTITION BY zone_id ORDER BY id
# ) WHERE subzone_name IS NULL;
```

**Schritt 3 (Frontend: SubzoneAssignmentSection.vue):** Pruefen ob beim "Neue Subzone erstellen"-Dialog ein Name-Feld vorhanden ist und dieser korrekt an die API gesendet wird.

```typescript
// SubzoneAssignmentSection.vue
async function createSubzone(zoneName: string) {
  const response = await subzonesApi.create({
    zone_id: props.zoneId,
    subzone_name: zoneName.trim() || `Subzone ${existingSubzones.value.length + 1}`
  })
  // ...
}
```

**Schritt 4 (Frontend: SensorCard.vue + ESPSettingsSheet):** Fallback-Anzeige wenn `subzone_name` NULL ist:

```typescript
// SensorCard.vue — subzoneLabel computed
const subzoneLabel = computed(() => {
  if (!props.subzoneName) return 'Keine Subzone'
  return props.subzoneName
})
```

#### Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `El Servador/god_kaiser_server/src/services/subzone_service.py` | Auto-Name-Generierung fuer neue Subzonen. **Hinweis:** SubzoneConfig ist per ESP (`esp_id`), nicht per Zone. |
| `El Servador/god_kaiser_server/src/db/repositories/subzone_repo.py` | `create()` mit Name-Fallback |
| `El Servador/god_kaiser_server/alembic/versions/fix_null_subzone_names.py` | Einmalige Migration: NULL → 'Subzone N'. **PARTITION BY esp_id** (nicht zone_id) |
| `El Frontend/src/components/devices/SubzoneAssignmentSection.vue` | Name-Feld im Create-Dialog, korrekte API-Payload |
| `El Frontend/src/components/devices/SensorCard.vue` | Fallback "Keine Subzone" statt leeres Badge |
| `El Frontend/src/components/esp/ESPSettingsSheet.vue` | Fallback fuer NULL-Namen in "Geraete nach Subzone" |

#### Akzeptanzkriterien

1. `SELECT COUNT(*) FROM subzone_configs WHERE subzone_name IS NULL` → 0 nach Migration
2. Neue Subzone ohne Namen bekommt automatisch "Subzone N" als Namen
3. SensorCard zeigt bei Sensor mit Subzone-Zuweisung den Subzone-Namen (nicht leer)
4. ESPSettingsSheet "Geraete nach Subzone" zeigt Namen fuer alle Subzonen
5. SubzoneAssignmentSection sendet `subzone_name` in API-Payload mit

---

## Fix-Gruppe D: Kosmetische Fixes (NIEDRIG)

> **Reihenfolge:** Fix-D kann parallel zu Fix-C oder danach umgesetzt werden. Keine Abhaengigkeiten.
> **Bereich:** El Frontend (Vue 3)

---

### BUG-10: Heartbeat Epoch-Null → "01.01.1970" (NIEDRIG)

#### IST-Zustand

Im Device-Settings-Panel (ESPSettingsSheet oder DeviceDetailPanel) wird `last_seen` angezeigt. Wenn ein Device noch keinen Heartbeat empfangen hat, ist `last_seen = NULL` in der DB. Das Frontend gibt diese NULL an eine Datumsfunktion weiter, die daraus den Unix-Epoch-0 berechnet (1. Januar 1970, 01:00 Uhr in UTC+1) und anzeigt.

Das tritt auf bei:
- Frisch erstellten Devices (pending_approval, noch kein Heartbeat)
- Devices die sehr lange offline waren und aus Cache-Daten angezeigt werden
- Mock-Devices die noch nie einen Heartbeat gesendet haben

#### SOLL-Zustand

```typescript
// Hilfsfunktion in dateUtils.ts oder inline:
function formatLastSeen(lastSeen: string | null | undefined): string {
  if (!lastSeen) return '—'  // NULL → Dash
  const date = new Date(lastSeen)
  // Epoch-0 Guard: Timestamps vor 2020 sind wahrscheinlich falsch
  if (date.getFullYear() < 2020) return 'Nie'
  return date.toLocaleString('de-DE')
}
```

**Wo anwenden:** ESPSettingsSheet, DeviceDetailPanel, DeviceMiniCard (wenn last_seen dort angezeigt wird), alle anderen Stellen die `last_seen` fuer Anzeige formatieren.

**Warum "Nie" statt "—" fuer Epoch-0:** "—" bedeutet "kein Wert bekannt" (NULL in DB). "Nie" bedeutet "Wert war vorhanden aber ist epoch=0" (technischer Fehler). Diese Unterscheidung hilft beim Debugging.

#### Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `El Frontend/src/utils/formatters.ts` | `formatLastSeen()` Hilfsfunktion mit NULL-Guard + Epoch-0-Guard. **Hinweis:** `dateUtils.ts` existiert NICHT — die Formatierungsfunktionen sind in `formatters.ts`. Dort existiert bereits `formatRelativeTime()` (Z. 34) mit NULL-Guard (`if (!date) return 'Nie'`), aber OHNE Epoch-0-Guard. |
| `El Frontend/src/components/esp/ESPSettingsSheet.vue` | `formatLastSeen(device.last_seen)` statt direkter Date-Formatierung |
| `El Frontend/src/components/dashboard/DeviceMiniCard.vue` (falls last_seen angezeigt) | Gleicher Fix |

#### Akzeptanzkriterien

1. Device mit `last_seen = NULL` zeigt "—" (nicht "01.01.1970")
2. Device mit `last_seen = '1970-01-01T00:00:00Z'` zeigt "Nie" (nicht "01.01.1970")
3. Device mit aktuellem `last_seen` zeigt korrektes Datum auf Deutsch (z.B. "08.03.2026, 14:32")
4. Kein Build-Fehler durch TypeScript (null-Safety pruefen)

---

### BUG-11: Acknowledged-Status ist toter Code (NIEDRIG)

#### IST-Zustand

Das Notification-System implementiert den ISA-18.2 Alert-Lifecycle: `active` → `acknowledged` → `resolved`. Der Status `acknowledged` ist im Backend definiert und als DB-Spalte vorhanden, wird aber nie genutzt. `SELECT COUNT(*) FROM notifications WHERE status = 'acknowledged'` liefert 0 Rows.

**[verify-plan Korrektur] Der gesamte acknowledge-Flow ist BEREITS IMPLEMENTIERT:**

| Schicht | Datei | Status |
|---------|-------|--------|
| Backend API | `notifications.py` Z. 355-394: `PATCH /{notification_id}/acknowledge` | EXISTS ✅ |
| Backend Repo | `notification_repo.py` Z. 284: `acknowledge_alert()` Methode | EXISTS ✅ |
| Frontend Store | `alert-center.store.ts` Z. 141: `acknowledgeAlert()` Action | EXISTS ✅ |
| Frontend API | `notifications.ts` Z. 304: `acknowledgeAlert()` Client | EXISTS ✅ |
| NotificationDrawer | Z. 95: `alertStore.acknowledgeAlert(id)` | EXISTS ✅ |
| QuickAlertPanel | Z. 116: `alertStore.acknowledgeAlert(id)`, Z. 123: Batch-Ack | EXISTS ✅ |

**Alle drei Hypothesen (a, b, c) sind FALSCH.** Die Pipeline existiert End-to-End.

**Warum 0 acknowledged Rows?** Moegliche Gruende (muessen geprueft werden):
a) Feature wurde nie mit echtem Traffic getestet (nur DEV-Umgebung)
b) API-Call schlaegt still fehl (Auth, Status-Validierung, DB-Error)
c) Frontend-UI-Element ist nicht sichtbar/erreichbar fuer User
d) Alle Alerts werden direkt als "resolved" markiert (Resolve-Button wird bevorzugt)

**Empfehlung:** Statt Code zu schreiben, zuerst manuellen Test durchfuehren:
1. Alert erzeugen (oder bestehenden aktiven Alert finden)
2. In QuickAlertPanel auf "Bestaetigen (Acknowledge)" klicken
3. Network-Tab pruefen: Wird PATCH-Request gesendet? Antwort?
4. DB pruefen: `SELECT status FROM notifications WHERE id = '...'`

**ISA-18.2 Hintergrund:** Der `acknowledged`-Status ist wichtig fuer Mehrbenutzersysteme — ein Operator bestaetigt dass er den Alert gesehen hat (`acknowledged`), ein anderer loest ihn auf (`resolved`). Ohne acknowledged kann nicht nachvollzogen werden ob ein Alert gesehen wurde. Fuer AutomationOne (Einzelbenutzer-System im DEV-Stadium) ist dieser Flow weniger kritisch, sollte aber korrekt funktionieren.

#### SOLL-Zustand

**[verify-plan Korrektur] Alle Code-Pfade existieren bereits. Kein neuer Code noetig.**

**Einziger Schritt:** Manueller End-to-End-Test:

1. Server starten, aktiven Alert in DB finden oder erzeugen
2. In QuickAlertPanel "Bestaetigen" klicken
3. Network-Tab: PATCH `/api/v1/notifications/{id}/acknowledge` pruefen
4. DB: `SELECT id, status, acknowledged_at FROM notifications WHERE status = 'acknowledged'`
5. Falls 0 Rows: Response-Body und Server-Logs analysieren

**Falls Test zeigt dass Button-Click nicht ankommt:**
- `alert-center.store.ts` Z. 141-143: Pruefen ob `notificationsApi.acknowledgeAlert(id)` den richtigen Pfad aufruft
- `notifications.ts` Z. 304: Pruefen ob API-Client-Methode korrekt implementiert ist (PATCH, nicht POST)

**Falls Test zeigt dass Backend fehlschlaegt:**
- `notifications.py` Z. 365-394: `acknowledge_alert()` — pruefen ob Auth-Dependency oder Status-Validierung den Request blockiert
- `notification_repo.py` Z. 284: `acknowledge_alert()` — pruefen ob DB-Commit erfolgt

**Empfehlung:** Dies ist ein Test/Debug-Task, kein Implementierungs-Task. Aufwand: 15-30 Minuten statt 1h.

#### Betroffene Dateien (abhaengig von Analyse-Ergebnis)

| Datei | Aenderung |
|-------|-----------|
| `El Servador/god_kaiser_server/src/api/v1/notifications.py` (Z. 355-394) | Endpoint EXISTS — nur testen, nicht neu schreiben |
| `El Frontend/src/components/notifications/NotificationDrawer.vue` (Z. 95) | Ack-Button EXISTS — nur E2E-Pfad verifizieren |
| `El Frontend/src/components/quick-action/QuickAlertPanel.vue` (Z. 116, 123-136) | Ack + Batch-Ack EXISTS — nur E2E-Pfad verifizieren |
| `El Servador/god_kaiser_server/src/db/repositories/notification_repo.py` (Z. 284) | `acknowledge_alert()` EXISTS — nur testen |

#### Akzeptanzkriterien

1. "Bestätigen"-Button in NotificationDrawer oder QuickAlertPanel → Alert wechselt zu `acknowledged` (nicht direkt zu `resolved`)
2. `SELECT COUNT(*) FROM notifications WHERE status = 'acknowledged'` > 0 nach einem Ack
3. ODER: Dokumentation erklaert warum acknowledged nicht implementiert ist (Design-Entscheidung)
4. `AlertInvalidStateTransition` wird korrekt geworfen wenn acknowledged → active transition versucht wird

---

## Reihenfolge und Abhaengigkeiten

```
Fix-A (KRITISCH): BUG-06 + BUG-07 (unabhaengig voneinander, parallel moeglich)
  │
  ├── BUG-06: useESPStatus.ts last_seen-Fallback entfernen
  │          heartbeat_handler.py pending_approval-Pfad (optional)
  │
  └── BUG-07: notification.py JSON → JSONB
              Alembic-Migration
              notification_repo.py .astext pruefen
  │
  ▼
Fix-B (HOCH): BUG-08 + Alert-Storm (Alert-Storm NACH BUG-08-Fix)
  │
  ├── BUG-08: sensor_repo.py onewire_address/i2c_address erweitern
  │           sensor_handler.py Payload-Felder lesen
  │
  └── Alert-Storm: Fingerprint robuster, Dedup-Fenster anpassen
                   Cleanup bestehender Duplicate-Alerts
  │
  ▼
Fix-C (MITTEL): BUG-09 (Subzone-Namen NULL)
  │
  └── subzone_service.py Auto-Namen
      Alembic-Migration NULL-Cleanup
      SubzoneAssignmentSection.vue Name-Feld
      SensorCard.vue Fallback-Anzeige
  │
  ▼
Fix-D (NIEDRIG): BUG-10 + BUG-11 (parallel moeglich)
  │
  ├── BUG-10: formatLastSeen() Hilfsfunktion
  │
  └── BUG-11: Analyse → minimaler Fix oder Dokumentation
```

---

## Gesamte Verifikation nach allen Fixes

### Loki-Verifikation (nach Fix-B)

| Query | Erwartetes Ergebnis nach Fix |
|-------|------------------------------|
| `{compose_service="el-servador"} \|= "MultipleResultsFound"` | 0 Treffer in 30 Min |
| `{compose_service="el-servador"} \|= "AttributeError"` | 0 Treffer (kein .astext auf JSON) |
| `{compose_service="el-servador"} \|= "offset-naive"` | 0 Treffer (BUG-02 — war schon bekannt) |

### DB-Verifikation (nach Fix-C)

```sql
-- Alle Subzone-Namen gefuellt?
SELECT COUNT(*) FROM subzone_configs WHERE subzone_name IS NULL;
-- Erwartet: 0

-- Notification-Typ JSONB?
SELECT pg_typeof(extra_data) FROM notifications LIMIT 1;
-- Erwartet: jsonb

-- Alert-Frequenz nach Fix-B?
SELECT COUNT(*) FROM notifications WHERE created_at > NOW() - INTERVAL '1 hour';
-- Erwartet: < 6 (ISA-18.2 Grenzwert)
```

### Frontend-Verifikation (nach Fix-A, Fix-C, Fix-D)

| Test | Erwartetes Ergebnis |
|------|---------------------|
| Device mit status=pending_approval: Frontend-Status | "Ausstehend" oder "Wartet auf Genehmigung" — NICHT "online" |
| DELETE /devices/{id} mit Notifications | 204 (kein 500) |
| Device mit last_seen=NULL | Zeigt "—" |
| Device mit last_seen='1970-01-01' | Zeigt "Nie" |
| Sensor mit Subzone-Zuweisung | SensorCard zeigt Subzone-Namen |
| Ack-Button in Notification-Drawer | Alert → acknowledged (kein direktes resolved) |

### Test-Ausfuehrung

```bash
# [verify-plan Korrektur] Pfade waren falsch. Korrekte Befehle:

# Backend-Tests nach Fix-A und Fix-B:
cd "El Servador/god_kaiser_server" && pytest tests/ -v --tb=short -x  # Erwartet: alle gruen

# Backend Lint:
cd "El Servador/god_kaiser_server" && ruff check .  # Keine Errors

# Frontend-Build nach Fix-A, Fix-C, Fix-D:
cd "El Frontend" && npx vue-tsc --noEmit  # Erwartet: 0 Type-Fehler
cd "El Frontend" && npm run build          # Erwartet: Build erfolgreich
```

---

## Was NICHT gemacht wird

- Kein Umbau der kompletten heartbeat_handler-Logik — nur den pending_approval-Fallback im Frontend fixen
- Kein Umbau des Alert-Systems — nur Fingerprint und Dedup-Fenster anpassen
- Keine neuen Datenbank-Tabellen oder Schema-Aenderungen ausser den definierten (JSON→JSONB, NULL-Cleanup)
- Kein ISA-18.2-Vollausbau — nur den einen acknowledged-Pfad reparieren oder dokumentieren
- Keine Aenderungen an: Sensor-Erstellung, Device-Erstellung, Firmware, Wokwi-Integration
- Keine Aenderungen an T10-Fix-A bis Fix-E (config_id-basierter Lookup und DELETE) — diese bleiben unveraendert

---

## Geschaetzter Aufwand pro Fix-Gruppe

| Gruppe | Bugs | Aufwand |
|--------|------|---------|
| Fix-A | BUG-06 + BUG-07 | 1-2h |
| Fix-B | BUG-08 + Alert-Storm | 1-2h (reduziert: sensor_handler bereits korrekt, nur sensor_repo Safety-Guard + Firmware-Check) |
| Fix-C | BUG-09 | 1-2h |
| Fix-D | BUG-10 + BUG-11 | 30min (reduziert: BUG-11 ist nur Test/Debug, kein neuer Code. BUG-10 nur Epoch-Guard in formatters.ts) |
| **Gesamt** | 6 Bugs + Alert-Storm | **~4-6h** (reduziert von 5-8h durch bereits existierenden Code) |

---

## Naechste Schritte nach diesem Auftrag

1. Verifikation: Loki-Queries + DB-Queries aus "Gesamte Verifikation" ausfuehren
2. T11-Auftrag (Frontend-Audit) kann starten sobald Fix-A + Fix-B abgeschlossen sind
3. Wokwi Full-Stack DS18B20-Test (T10-Wokwi-Fullstack-Auftrag) kann starten sobald BUG-08 gefixt ist
4. ISA-18.2 acknowledged-Flow (BUG-11): Entscheidung ob vollstaendig implementiert oder dokumentiert
