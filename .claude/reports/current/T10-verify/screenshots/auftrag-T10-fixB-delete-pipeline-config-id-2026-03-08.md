# Auftrag T10-Fix-B: DELETE-Pipeline per config_id UUID statt GPIO

> **Bezug:** T10-Verifikationsbericht Phase 9 — NB-T10-05 CRITICAL, NB-T10-06 MEDIUM, NB-T09-09 REGRESSION
> **Prioritaet:** KRITISCH — Einzelsensor-Loeschung ist zerstoerend (Mass-Delete)
> **Bereich:** El Servador (Backend) + El Frontend (Vue 3)
> **Datum:** 2026-03-08
> **Abhaengigkeit:** T10-Fix-A muss ZUERST umgesetzt werden (get_by_config_id)

---

## Problem (IST)

### Bug NB-T10-05 CRITICAL: DELETE loescht ALLE Sensoren auf dem GPIO statt nur einen

**Szenario:** 6 I2C-Sensoren auf GPIO 0 (2x SHT31 + BMP280 = 6 Sub-Configs). User klickt "Sensor entfernen" auf EINEM Sensor. Ergebnis: ALLE 6 Sensoren auf GPIO 0 werden geloescht.

**Screenshot S31** zeigt das Ergebnis: Statt 6 Sensoren nur noch 1 (der DS18B20 auf GPIO 4, der einzige der NICHT auf GPIO 0 liegt).

**Ursache Backend:** Der DELETE-Endpoint `DELETE /api/v1/debug/mock-esp/{id}/sensors/{gpio}` identifiziert Sensoren per GPIO-Nummer. Er loescht ALLE `sensor_configs` WHERE `gpio = {gpio}`. Bei GPIO 0 trifft das 6 Datensaetze statt 1.

### Bug NB-T10-06 MEDIUM: Frontend sendet GPIO statt UUID

**Szenario:** SensorConfigPanel hat einen "Sensor entfernen"-Button. Beim Klick wird `deleteSensor(gpio)` aufgerufen, nicht `deleteSensor(configId)`.

**URL im Network-Tab:** `DELETE /api/v1/.../sensors/0` — die `0` ist die GPIO-Nummer, nicht die UUID.

### Bug NB-T09-09 REGRESSION: DELETE-Fix aus T09 nicht wirksam

In T09-Fix-A wurde `deleteSensor(espId, configId: string)` als Fix spezifiziert. Der Frontend-Code nutzt aber weiterhin GPIO als Parameter in der URL.

---

## SOLL-Zustand

### Strategie: config_id (UUID) als einziger DELETE-Identifier

Die bestehende Delete-Pipeline nutzt eine Kette: Frontend → API → Repository → Dual-Storage-Rebuild → Scheduler-Stop → WebSocket-Broadcast. Der GPIO muss an JEDER Stelle durch `config_id` ersetzt werden.

### 1. Backend: Neuer DELETE-Endpoint per config_id

```python
# sensors.py (API) — NEUER Endpoint
@router.delete("/sensors/config/{config_id}", status_code=204)
async def delete_sensor_by_config_id(
    config_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Loescht genau EINEN Sensor per config_id (UUID).

    Die config_id hat das Format 'cfg_{uuid}' und ist global eindeutig.
    Dieser Endpoint ersetzt das alte DELETE per GPIO, welches bei I2C-Sensoren
    (die sich GPIO 0 teilen) alle Sensoren auf dem GPIO loeschte.
    """
    sensor_repo = SensorRepository(db)
    config = await sensor_repo.get_by_config_id(config_id)
    if not config:
        raise HTTPException(status_code=404, detail=f"Sensor config {config_id} not found")

    esp_id = config.esp_id

    # Physisch loeschen (sensor_configs werden physisch geloescht, nicht soft-deleted)
    await sensor_repo.delete(config)
    await db.commit()

    # Dual-Storage: simulation_config neu aufbauen
    await rebuild_simulation_config(esp_id, db)

    # Scheduler: Simulation fuer diesen Sensor stoppen
    # (scheduler.stop_sensor muss config_id akzeptieren)

    # WebSocket: Broadcast an alle Clients
    # (damit L1 MiniCard, L2 Satellites, Monitor aktualisiert werden)
```

### 2. Backend: Debug-Endpoint ebenfalls per config_id

```python
# debug.py — BESTEHENDEN Endpoint ERGAENZEN oder ERSETZEN
@router.delete("/debug/mock-esp/{esp_id}/sensors/{config_id}")
async def delete_mock_sensor_by_config_id(esp_id: str, config_id: str, ...):
    """Loescht genau EINEN Mock-Sensor per config_id.

    WICHTIG: Der alte Endpoint per GPIO (`/sensors/{gpio}`) darf NICHT mehr
    genutzt werden, weil er bei I2C-Sensoren (alle auf GPIO 0) einen
    Mass-Delete ausloest. Entweder den alten Endpoint entfernen oder
    so aendern, dass er bei >1 Treffer einen 409 Conflict zurueckgibt
    mit der Nachricht: "Mehrere Sensoren auf GPIO 0. Bitte per config_id loeschen."
    """
```

**Empfehlung:** Den alten GPIO-basierten DELETE-Endpoint NICHT sofort entfernen, sondern einen Guard einbauen:
```python
# Alter Endpoint — Safety Guard
sensors_on_gpio = await sensor_repo.get_by_esp_and_gpio(esp_id, gpio)
if len(sensors_on_gpio) > 1:
    raise HTTPException(
        status_code=409,
        detail=f"{len(sensors_on_gpio)} Sensoren auf GPIO {gpio}. "
               f"Bitte per config_id loeschen: DELETE /sensors/config/{{config_id}}"
    )
# Nur wenn genau 1 Sensor → altes Verhalten beibehalten (Abwaertskompatibilitaet)
```

### 3. Frontend: SensorConfigPanel DELETE-Methode

Die Datei `SensorConfigPanel.vue` hat einen "Sensor entfernen"-Button. Die Delete-Funktion muss `config_id` statt `gpio` senden:

```typescript
// SensorConfigPanel.vue — DELETE-Handler
async function handleDeleteSensor() {
  // VORHER (FALSCH):
  // await espApi.deleteSensor(espId, gpio)

  // NACHHER (RICHTIG):
  await espApi.deleteSensorByConfigId(props.configId)
  // props.configId kommt aus der Event-Kette:
  // SensorColumn → ESPOrbitalLayout → DeviceDetailView → HardwareView
  // (wurde in T09-Fix-A etabliert: alle Events fuehren {configId, gpio, sensorType} mit)
}
```

### 4. Frontend: API-Modul esp.ts

```typescript
// api/esp.ts — NEUE Methode
export async function deleteSensorByConfigId(configId: string): Promise<void> {
  await api.delete(`/sensors/config/${configId}`)
}
```

Die alte Methode `deleteSensor(espId, gpio)` kann bestehen bleiben aber als `@deprecated` markiert werden.

### 5. Delete-Pipeline-Kette (Komplett-Uebersicht)

Die korrekte Kette nach dem Fix:

```
User klickt "Sensor entfernen" in SensorConfigPanel
  → SensorConfigPanel.handleDeleteSensor()
    → espApi.deleteSensorByConfigId(configId)      // config_id UUID
      → DELETE /api/v1/sensors/config/{config_id}   // Backend API
        → sensor_repo.get_by_config_id(config_id)   // Genau 1 Treffer
        → sensor_repo.delete(config)                 // Physisch loeschen
        → db.commit()
        → rebuild_simulation_config(esp_id)          // Dual-Storage-Sync
        → scheduler.stop_sensor(config_id)           // Simulation stoppen
        → ws_broadcast("sensor_removed", {config_id, esp_id})  // Frontend-Update
```

---

## Was NICHT gemacht wird

- Keine Aenderung an Device-Delete (Cascade-Delete fuer sensor_configs bei Device-Delete funktioniert korrekt — T10 Phase 10 BESTANDEN)
- Keine Aenderung an Sensor-Erstellung (AddSensorModal funktioniert korrekt)
- Kein Soft-Delete fuer sensor_configs — physisches Loeschen ist hier korrekt (sensor_data bleibt via SET NULL erhalten)
- Keine Aenderung am Frontend-Routing (Config-Panel-Oeffnung ist T10-Fix-C)

---

## Akzeptanzkriterien

1. **Einzel-Delete:** Bei 6 I2C-Sensoren auf GPIO 0 → "Sensor entfernen" auf einem Sensor loescht GENAU 1 Sensor, die anderen 5 bleiben
2. **config_id in URL:** Network-Tab zeigt `DELETE /sensors/config/cfg_...` (UUID), NICHT `/sensors/0` (GPIO)
3. **Dual-Storage-Sync:** Nach Delete eines von 6 Sensoren: DB zeigt 5, simulation_config zeigt 5
4. **Frontend-Update:** L2 Satellites aktualisieren sich (6→5), MiniCard aktualisiert sich
5. **Alter Endpoint Guard:** `DELETE /sensors/{gpio}` bei >1 Sensor auf GPIO gibt 409 statt Mass-Delete
6. **Neuer Test:** `test_delete_single_sensor_from_shared_gpio()` — 4 Sensoren auf GPIO 0 erstellen, 1 loeschen, pruefen dass 3 uebrig sind
7. **Regressions-Test:** Device-Delete (Soft-Delete + Cascade) funktioniert weiterhin (T10 Phase 10 darf nicht regressieren)

---

## Betroffene Dateien (geschaetzt)

| Datei | Aenderung |
|-------|-----------|
| `sensors.py` (API) | Neuer DELETE-Endpoint per config_id |
| `debug.py` | Mock-Sensor DELETE per config_id + Guard auf altem Endpoint |
| `sensor_repo.py` | Nutzt `get_by_config_id()` aus Fix-A |
| `SensorConfigPanel.vue` | `handleDeleteSensor()` nutzt configId statt gpio |
| `esp.ts` (API) | `deleteSensorByConfigId(configId)` NEU |
| Tests | Einzel-Delete + Mass-Delete-Prevention |
