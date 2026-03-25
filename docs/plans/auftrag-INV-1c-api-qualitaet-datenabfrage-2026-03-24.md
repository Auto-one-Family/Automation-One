# Auftrag INV-1c — API-Qualitaet + Datenabfrage-Verbesserungen

> **Erstellt:** 2026-03-24
> **Grundlage:** Backend-DB-Endpunkt-Inventur (`Datenbanken/Backend-DB-Endpunkt-Inventur-2026-03-24.md`) + Auftrag 8.0 Analyse
> **Typ:** Implementierung — API-Erweiterungen + 1 Klaerung
> **Aufwand:** ~4-6h
> **Prioritaet:** MEDIUM
> **Abhaengigkeit:** Nach INV-1a (Datenintegritaet muss erst stehen)

---

## Kontext

Mehrere API-Luecken wurden sowohl in der Inventur (L1-L3) als auch in der Editor-Analyse (Auftrag 8.0) identifiziert. Diese betreffen die Abfragequalitaet fuer Zeitreihen-Daten und die Konsistenz des Datenmodells. Die Fixes hier bereiten den Boden fuer die Editor-Datenanalyse (Phase A/B) und verbessern sofort die API-Qualitaet.

---

## Fix 1: actuator_states.state Werte klaeren und vereinheitlichen

### IST-Zustand (DISKREPANZ)

Das DB-Model (`src/db/models/actuator.py`) definiert `state` als VARCHAR(20) mit Docstring-Werten:
```
idle / active / error / emergency_stop
```

Die T17-V4 Live-Verifikation am echten ESP hat aber gezeigt, dass die tatsaechlichen Runtime-Werte sind:
```
on / off / pwm / error / unknown
```

**[verify-plan Korrektur]** Die Code-Analyse zeigt: **Option C ist bestaetigt — es ist ein Bug.** Hier die vollstaendige Schreiber-Uebersicht:

| Code-Pfad | Datei | Geschriebene Werte |
|-----------|-------|-------------------|
| MQTT ActuatorStatusHandler (Hauptpfad) | `src/mqtt/handlers/actuator_handler.py:127-162` | `"on"`, `"off"`, `"pwm"`, `"error"`, `"unknown"` |
| ActuatorAlertHandler (Notfall) | `src/mqtt/handlers/actuator_alert_handler.py:160` | `"off"` |
| LWT Handler (ESP-Disconnect) | `src/mqtt/handlers/lwt_handler.py:117-121` | `"idle"` |
| Heartbeat Handler (Timeout) | `src/mqtt/handlers/heartbeat_handler.py:1514-1518` | `"idle"` |
| `clear_emergency_states` (API) | `src/db/repositories/actuator_repo.py:148-158` | `"idle"` |
| `clear_all_emergency_states_on_startup` | `src/db/repositories/actuator_repo.py:160-174` | `"idle"` |

**Zusaetzlicher Bug (KRITISCH):** Die REST-API und `monitor_data_service` lesen auf `"active"` — ein Wert der von **keinem** Schreiber jemals gesetzt wird:
- `src/api/v1/actuators.py:148`: `is_active=(state.state == "active")` → **immer False**
- `src/services/monitor_data_service.py:174`: `state.state == "active"` → **immer False**

Der `actuator_handler.py` Validator (`_validate_payload`) erlaubt explizit: `["on", "off", "pwm", "error", "unknown"]`

### Aufgabe

1. **Grep durchfuehren:** Alle Stellen im Code finden die `actuator_states.state` schreiben. Suchbegriffe: `state =`, `state=`, `"idle"`, `"active"`, `"on"`, `"off"` in Dateien die actuator_states betreffen.
2. **Dokumentieren:** Welche Werte werden tatsaechlich geschrieben, von welchem Code-Pfad?
3. **Vereinheitlichen:** Einen konsistenten Satz definieren und alle Schreiber anpassen. Empfehlung: `on/off/pwm/error/emergency_stop/unknown` (weil das dem physischen Zustand entspricht, das Frontend bereits damit arbeitet, und `pwm` ein realer ESP32-Zustand ist).
4. **LWTHandler + HeartbeatHandler:** Wenn `idle` durch `off` ersetzt wird, muessen beide `"off"` statt `"idle"` setzen. Ebenso `clear_emergency_states` und `clear_all_emergency_states_on_startup` in `actuator_repo.py`.
5. **REST-API + monitor_data_service FIXEN (KRITISCH):** `actuators.py:148` prueft auf `"active"` — muss auf `"on"` oder `"pwm"` pruefen. `monitor_data_service.py:174` ebenso. Ohne diesen Fix gibt die API immer `is_active=False` zurueck.
6. **Model-Kommentar:** Die gueltigen Werte als Kommentar oder Enum im Model dokumentieren.

### Akzeptanzkriterien

- [ ] Alle Code-Pfade die `actuator_states.state` schreiben nutzen denselben Werte-Satz
- [ ] Model hat Kommentar oder Enum mit gueltigen Werten
- [ ] Frontend-ActuatorCard zeigt korrekte Zustaende (on=gruen, off=grau, error=rot, emergency_stop=rot-blinkend)
- [ ] LWTHandler + HeartbeatHandler setzen konsistenten "aus"-Zustand
- [ ] REST-API `is_active` prueft auf `"on"` oder `"pwm"` (nicht `"active"`)
- [ ] `monitor_data_service` prueft auf `"on"` oder `"pwm"` (nicht `"active"`)

---

## Fix 2: Sensor-Data Aggregation implementieren (Finding L1 + Auftrag 8.0)

### IST-Zustand

`SensorDataQuery` (Pydantic-Schema in `src/schemas/sensor.py:576`) hat ein `aggregation`-Feld:

```python
aggregation: Optional[str] = None  # pattern: ^(none|minute|hour|day)$
```

**[verify-plan Korrektur]** Dieses Schema wird vom Endpoint **gar nicht benutzt**. Der Endpoint `query_sensor_data` (`src/api/v1/sensors.py:1225`) deklariert seine Parameter direkt als einzelne `Query(...)`-Parameter — `SensorDataQuery` ist komplett entkoppelt. Der `aggregation`-Parameter existiert also nur als toter Code im Schema, nicht am Endpoint selbst. Im Response wird `aggregation` hardcoded auf `None` gesetzt (Zeile 1327).

Bei `limit=1000` (aktuelles Cap, `le=1000`) sind 7-Tage-Charts unbrauchbar, weil nur die neuesten 1000 Punkte zurueckgegeben werden. Der Endpoint hat bereits `start_time` und `end_time` als Query-Parameter, aber ohne Aggregation bringt das bei grossen Zeitraeumen nichts.

### SOLL-Zustand

Der `aggregation`-Parameter wird umbenannt zu `resolution` (sprechender) und implementiert Server-seitige Aggregation:

```
GET /api/v1/sensors/data?resolution=1h&start_time=...&end_time=...
```

| Resolution | Aggregation | Typischer Anwendungsfall |
|-----------|-------------|--------------------------|
| `raw` (default) | Keine | Letzte Stunde, Live-View |
| `1m` | 1-Minuten-Durchschnitt | Letzte 6h |
| `5m` | 5-Minuten-Durchschnitt | Letzte 24h |
| `1h` | 1-Stunden-Durchschnitt | Letzte 7 Tage |
| `1d` | 1-Tages-Durchschnitt | Letzte 30 Tage |

### Umsetzung

SQL-Aggregation mit `date_trunc()` (PostgreSQL-nativ, performant):

```sql
SELECT
    date_trunc('hour', timestamp) AS bucket,
    AVG(processed_value) AS processed_value,
    MIN(processed_value) AS min_value,
    MAX(processed_value) AS max_value,
    COUNT(*) AS sample_count
FROM sensor_data
WHERE esp_id = :esp_id AND gpio = :gpio AND sensor_type = :type
  AND timestamp BETWEEN :start AND :end
GROUP BY bucket
ORDER BY bucket
```

**Betroffene Dateien:**
1. `src/api/v1/sensors.py` — `query_sensor_data()` Endpoint (Zeile 1225): neuen `resolution` Query-Parameter ergaenzen
2. `src/db/repositories/sensor_repo.py` — `query_data()` Methode (Zeile 487): Aggregations-Query mit `date_trunc` + `GROUP BY` ergaenzen
3. `src/schemas/sensor.py` — `SensorDataQuery.aggregation` entfernen oder durch `resolution` ersetzen (Achtung: Schema wird vom Endpoint nicht genutzt, also nur aufraumen). Neues `ResolutionEnum` definieren mit `raw/1m/5m/1h/1d`
4. Das bestehende `limit=1000` Cap bleibt fuer `resolution=raw`. Bei Aggregation entfaellt das Limit (weil die Datenmenge bereits reduziert ist).

**[verify-plan Korrektur]** Achtung: Die Endpoint-Funktion heisst `query_sensor_data`, nicht `get_sensor_data`. Das Repository heisst `sensor_repo.py`, nicht `sensor_repository.py`.

### Akzeptanzkriterien

- [ ] `GET /sensors/data?resolution=1h` liefert stuendliche Durchschnitte
- [ ] Response enthaelt `processed_value` (avg), `min_value`, `max_value`, `sample_count` pro Bucket
- [ ] `resolution=raw` verhält sich wie bisher (Rohdaten, limit=1000)
- [ ] Performance: Aggregation ueber 7 Tage Daten < 500ms
- [ ] Bestehende API-Calls ohne `resolution`-Parameter funktionieren unveraendert (Default = raw)

---

## Fix 3: Actuator-History Zeitfilter ergaenzen + Bug fixen (Finding L3)

### IST-Zustand

`GET /api/v1/actuators/{esp_id}/{gpio}/history` hat nur einen `limit`-Parameter (Default 20, Max 100). Es gibt **keinen Zeitfilter** — man bekommt immer die letzten N Eintraege, kann aber nicht nach Zeitraum filtern.

**[verify-plan Korrektur] Aktiver Bug im Endpoint:** In `src/api/v1/actuators.py:1256` wird `timestamp=entry.created_at` geschrieben, aber `ActuatorHistory` hat **kein** `created_at`-Attribut (kein TimestampMixin). Die korrekte Spalte ist `entry.timestamp`. Dies fuehrt zu einem `AttributeError` bei jeder History-Abfrage. **Muss als Teil von Fix 3 mit behoben werden.**

### SOLL-Zustand

Zwei optionale Query-Parameter ergaenzen:

```
GET /api/v1/actuators/{esp_id}/{gpio}/history?start_time=2026-03-20T00:00:00Z&end_time=2026-03-24T23:59:59Z&limit=100
```

### Umsetzung

```python
@router.get("/{esp_id}/{gpio}/history")
async def get_actuator_history(
    esp_id: str,
    gpio: int,
    limit: int = Query(20, ge=1, le=100),
    start_time: Optional[datetime] = Query(None),  # NEU
    end_time: Optional[datetime] = Query(None),     # NEU
    ...
):
```

DB-Query erweitern:
```python
query = select(ActuatorHistory).where(
    ActuatorHistory.esp_id == esp_uuid,
    ActuatorHistory.gpio == gpio
)
if start_time:
    query = query.where(ActuatorHistory.timestamp >= start_time)
if end_time:
    query = query.where(ActuatorHistory.timestamp <= end_time)
query = query.order_by(ActuatorHistory.timestamp.desc()).limit(limit)
```

**[verify-plan Korrektur]** Zusaetzlich in Zeile 1256 `entry.created_at` → `entry.timestamp` aendern.

### Akzeptanzkriterien

- [ ] `start_time` und `end_time` filtern korrekt
- [ ] Ohne Zeitfilter: Verhalten wie bisher (letzte N Eintraege)
- [ ] `limit` Max 100 bleibt bestehen (auch mit Zeitfilter)
- [ ] Timestamps sind timezone-aware (UTC)
- [ ] Bug `entry.created_at` → `entry.timestamp` behoben (actuators.py:1256)

---

## Fix 4: Sensor-Data Cursor-Pagination vorbereiten (Finding L2)

### IST-Zustand

`GET /api/v1/sensors/data` hat `limit` (Max 1000), `start_time` und `end_time`. Kein `offset`, kein Cursor. Bei grossen Datensaetzen kann man nicht "blaettern".

**[verify-plan Korrektur]** Der Endpoint hat bereits `start_time` und `end_time` — es fehlt nur die Cursor-Pagination.

### SOLL-Zustand

Cursor-basierte Pagination mit `before_timestamp`:

```
GET /api/v1/sensors/data?limit=500&before_timestamp=2026-03-24T12:00:00Z
```

Das Frontend kann dann die letzte Timestamp der aktuellen Seite als Cursor fuer die naechste Seite nutzen. Das ist performanter als OFFSET-basierte Pagination bei grossen Tabellen.

### Umsetzung

```python
before_timestamp: Optional[datetime] = Query(None, description="Cursor: nur Daten VOR diesem Zeitpunkt")
```

DB-Query:
```python
if before_timestamp:
    query = query.where(SensorData.timestamp < before_timestamp)
```

### Akzeptanzkriterien

- [ ] `before_timestamp` filtert korrekt (nur aeltere Daten)
- [ ] Ohne `before_timestamp`: Verhalten wie bisher
- [ ] Response enthaelt `has_more: true/false` und `next_cursor` (Timestamp des letzten Eintrags)
- [ ] Kompatibel mit Fix 2 (Aggregation) — Cursor bezieht sich auf Bucket-Timestamp bei Aggregation

---

## Was NICHT gemacht wird

- Kein Frontend-Umbau fuer die neuen API-Features (das kommt in Editor Datenanalyse Phase A)
- Keine neuen Widget-Typen
- Kein VPD/DewPoint/GDD-Backend (kommt in Phase B)
- Kein Stats-Endpoint Zone/Subzone-Filter (kommt in Phase A)
- Finding L4 (ai_predictions Stub) und L5 (Plugin-Registry Konsistenz) bleiben Backlog

---

## Reihenfolge

1. **Fix 1** (actuator_states Klaerung) — Zuerst, weil das die Grundlage fuer alles Weitere ist
2. **Fix 2** (Sensor-Data Aggregation) — Groesster Impact, bereitet Editor-Phase A vor
3. **Fix 3** (Actuator-History Zeitfilter) — Klein, eigenstaendig
4. **Fix 4** (Cursor-Pagination) — Baut auf Fix 2 auf (Cursor + Aggregation muessen zusammenspielen)
