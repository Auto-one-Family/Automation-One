# Auftrag T10-Fix-B: DELETE-Pipeline per config_id UUID statt GPIO

> **Bezug:** T10-Verifikationsbericht Phase 9 — NB-T10-05 CRITICAL, NB-T10-06 MEDIUM, NB-T09-09 REGRESSION
> **Prioritaet:** KRITISCH — Einzelsensor-Loeschung ist zerstoerend (Mass-Delete)
> **Bereich:** El Servador (Backend) + El Frontend (Vue 3)
> **Datum:** 2026-03-08
> **Abhaengigkeit:** ~~T10-Fix-A muss ZUERST umgesetzt werden (get_by_config_id)~~ **[KORREKTUR verify-plan]:** Fix-A Abhaengigkeit entfaellt weitgehend. `BaseRepository.get_by_id(id: uuid.UUID)` existiert bereits und wird im bestehenden DELETE-Endpoint `sensors.py:934` genutzt. Kein separates `get_by_config_id()` noetig.

---

## Problem (IST)

### Bug NB-T10-05 CRITICAL: DELETE loescht ALLE Sensoren auf dem GPIO statt nur einen

**Szenario:** 6 I2C-Sensoren auf GPIO 0 (2x SHT31 + BMP280 = 6 Sub-Configs). User klickt "Sensor entfernen" auf EINEM Sensor. Ergebnis: ALLE 6 Sensoren auf GPIO 0 werden geloescht.

**Screenshot S31** zeigt das Ergebnis: Statt 6 Sensoren nur noch 1 (der DS18B20 auf GPIO 4, der einzige der NICHT auf GPIO 0 liegt).

**Ursache Backend:** Der DELETE-Endpoint `DELETE /api/v1/debug/mock-esp/{id}/sensors/{gpio}` identifiziert Sensoren per GPIO-Nummer. Er loescht ALLE `sensor_configs` WHERE `gpio = {gpio}`. Bei GPIO 0 trifft das 6 Datensaetze statt 1.

**[KORREKTUR verify-plan]:** Der Haupt-DELETE-Endpoint `DELETE /api/v1/sensors/{esp_id}/{config_id}` in `sensors.py:892-995` arbeitet BEREITS per UUID (Primary Key). Das Mass-Delete-Problem existiert NUR im **Debug-Endpoint** `debug.py:1092` (`/mock-esp/{esp_id}/sensors/{gpio}`). Der Bug ist also auf den Mock-ESP-Pfad beschraenkt.

### Bug NB-T10-06 MEDIUM: Frontend sendet GPIO statt UUID

**Szenario:** SensorConfigPanel hat einen "Sensor entfernen"-Button. Beim Klick wird `deleteSensor(gpio)` aufgerufen, nicht `deleteSensor(configId)`.

**URL im Network-Tab:** `DELETE /api/v1/.../sensors/0` — die `0` ist die GPIO-Nummer, nicht die UUID.

**[KORREKTUR verify-plan]:** SensorConfigPanel.vue (Zeile 268-284) hat BEREITS zwei Code-Pfade:
- **Mock-ESP** (Zeile 271): `espStore.removeSensor(props.espId, props.gpio)` → `debugApi.removeSensor(espId, gpio)` → `DELETE /debug/mock-esp/{id}/sensors/{gpio}` — **HIER ist der Bug (GPIO)**
- **Real-ESP** (Zeile 273): `sensorsApi.delete(props.espId, props.configId)` → `DELETE /sensors/{esp_id}/{config_id}` — **BEREITS per UUID korrekt**
NB-T10-06 betrifft also NUR den Mock-Pfad. Der Screenshot S31 stammt von einem Mock-ESP.

### Bug NB-T09-09 REGRESSION: DELETE-Fix aus T09 nicht wirksam

In T09-Fix-A wurde `deleteSensor(espId, configId: string)` als Fix spezifiziert. Der Frontend-Code nutzt aber weiterhin GPIO als Parameter in der URL.

---

## SOLL-Zustand

### Strategie: config_id (UUID) als einziger DELETE-Identifier

~~Die bestehende Delete-Pipeline nutzt eine Kette: Frontend → API → Repository → Dual-Storage-Rebuild → Scheduler-Stop → WebSocket-Broadcast. Der GPIO muss an JEDER Stelle durch `config_id` ersetzt werden.~~

**[KORREKTUR verify-plan]:** Die Haupt-Pipeline (`sensors.py`) arbeitet BEREITS per UUID. Der Fix beschraenkt sich auf:
1. **debug.py** Mock-Delete-Endpoint: GPIO → config_id umstellen (oder Guard)
2. **Frontend Mock-Pfad:** `espStore.removeSensor(espId, gpio)` → per config_id aufrufen
3. **`api/debug.ts`:** `removeSensor(espId, gpio)` → neuen Endpoint oder config_id-Parameter
Das Format ist `uuid.UUID` (DB Primary Key), NICHT `cfg_{uuid}`.

### ~~1. Backend: Neuer DELETE-Endpoint per config_id~~ [BEREITS IMPLEMENTIERT]

**[KORREKTUR verify-plan]:** Dieser Abschnitt ist KOMPLETT REDUNDANT. Der Endpoint existiert bereits:

```python
# sensors.py:892-995 — EXISTIERT BEREITS (T08-Fix-D)
@router.delete("/{esp_id}/{config_id}", response_model=SensorConfigResponse)
async def delete_sensor(esp_id: str, config_id: uuid.UUID, db: DBSession, current_user: OperatorUser):
    # 1. sensor_repo.get_by_id(config_id)        — BaseRepository (geerbt)
    # 2. sensor_repo.delete(sensor.id)            — physisch loeschen
    # 3. subzone_service.remove_gpio_from_all_subzones()  — Subzone-Cleanup
    # 4. esp_repo.rebuild_simulation_config()     — Dual-Storage-Sync
    # 5. db.commit()
    # 6. scheduler_service.remove_job(esp_id, gpio)  — APScheduler
    # 7. sim_scheduler.remove_job(job_id)         — Mock-Simulation
    # 8. config_builder.build_combined_config()   — MQTT Config-Publish
```

**KEIN neuer Endpoint noetig. Kein `cfg_{uuid}`-Format — config_id ist `uuid.UUID` (DB Primary Key).**
**Kein `get_by_config_id()` — heisst `BaseRepository.get_by_id()`.**
**Kein `scheduler.stop_sensor(config_id)` — heisst `scheduler_service.remove_job(esp_id, gpio)` und `sim_scheduler._scheduler.remove_job(job_id)` mit `job_id = f"mock_{esp_id}_sensor_cfg_{config_id}"`.**

### 2. Backend: Debug-Endpoint — DER EIGENTLICHE FIX

**[KORREKTUR verify-plan]:** Dies ist der KERN des Bugs. Der Debug-Endpoint `debug.py:1092-1170` (`DELETE /mock-esp/{esp_id}/sensors/{gpio}`) ist der einzige Endpoint der noch per GPIO loescht.

**IST-Zustand (debug.py:1140-1154):**
```python
# debug.py:1140-1154 — AKTUELLER Code (Mass-Delete Bug!)
sensor_repo = SensorRepository(db)
if sensor_type:
    cfg = await sensor_repo.get_by_esp_gpio_and_type(device.id, gpio, sensor_type)
    if cfg:
        await sensor_repo.delete(cfg.id)
        deleted_count = 1
else:
    # HIER IST DER BUG: Loescht ALLE auf diesem GPIO!
    all_on_gpio = await sensor_repo.get_all_by_esp_and_gpio(device.id, gpio)
    for cfg in all_on_gpio:
        await sensor_repo.delete(cfg.id)
        deleted_count += 1
```

**Zwei Optionen fuer den Fix:**

**Option A (Guard):** `else`-Zweig aendern: bei >1 Sensor 409 zurueckgeben
```python
# Guard statt Mass-Delete
all_on_gpio = await sensor_repo.get_all_by_esp_and_gpio(device.id, gpio)
if len(all_on_gpio) > 1:
    raise HTTPException(
        status_code=409,
        detail=f"{len(all_on_gpio)} Sensoren auf GPIO {gpio}. "
               f"Bitte per sensor_type spezifizieren oder DELETE /sensors/{{esp_id}}/{{config_id}} nutzen."
    )
```
**Hinweis:** `get_all_by_esp_and_gpio()` erwartet `esp_id: uuid.UUID` (DB-PK), NICHT den device_id String. `device.id` (nach `get_mock_device()`) ist korrekt.

**Option B (Neuer Endpoint):** Neuen Debug-Delete per config_id analog zu `sensors.py` — oder einfach Frontend auf den bestehenden `DELETE /sensors/{esp_id}/{config_id}` umleiten (der existiert bereits und macht alles korrekt).

### 3. Frontend: SensorConfigPanel DELETE-Methode — NUR Mock-Pfad betroffen

**[KORREKTUR verify-plan]:** SensorConfigPanel.vue (Zeile 268-284) hat BEREITS die richtige Unterscheidung. Nur der Mock-Pfad muss geaendert werden:

```typescript
// SensorConfigPanel.vue:268-284 — AKTUELLER Code
async function confirmAndDelete() {
  // ... confirm dialog ...
  const isMock = espApi.isMockEsp(props.espId)
  if (isMock) {
    // VORHER (BUG): espStore.removeSensor(props.espId, props.gpio) → GPIO-basiert!
    // NACHHER: Auch Mocks per config_id loeschen:
    await sensorsApi.delete(props.espId, props.configId)  // bestehenden sensors-Endpoint nutzen
  } else if (props.configId) {
    await sensorsApi.delete(props.espId, props.configId)  // BEREITS KORREKT!
  }
}
```

**Einfachster Fix:** Mock-Pfad auf denselben `sensorsApi.delete(espId, configId)` umstellen wie den Real-Pfad. Der `DELETE /sensors/{esp_id}/{config_id}` Endpoint in `sensors.py` behandelt bereits Mock-ESPs korrekt (inkl. Simulation-Job-Stop). Kein separater Debug-Endpoint noetig.

**Voraussetzung:** `props.configId` muss auch fuer Mock-Sensoren verfuegbar sein. Pruefen ob die Eltern-Komponente `configId` uebergibt.

### ~~4. Frontend: API-Modul esp.ts~~ [FALSCHE DATEI]

**[KORREKTUR verify-plan]:** Die Sensor-Delete-Methode liegt NICHT in `api/esp.ts`, sondern in `api/sensors.ts`:

```typescript
// api/sensors.ts:32-36 — EXISTIERT BEREITS
async delete(espId: string, configId: string): Promise<void> {
  await api.delete(`/sensors/${espId}/${configId}`)
}
```

`esp.ts` hat KEINE Sensor-Delete-Methode. Die Mock-Delete-Methode liegt in `api/debug.ts`:
```typescript
// api/debug.ts:156-159 — AKTUELL (GPIO-basiert, zu aendern oder nicht mehr nutzen)
async removeSensor(espId: string, gpio: number): Promise<CommandResponse> {
  const response = await api.delete<CommandResponse>(`/debug/mock-esp/${espId}/sensors/${gpio}`)
  return response.data
}
```

**Keine neue Methode noetig.** `sensorsApi.delete(espId, configId)` existiert bereits.

### 5. Delete-Pipeline-Kette (Komplett-Uebersicht) — KORRIGIERT

**[KORREKTUR verify-plan]:** Korrigierte Pipeline mit echten Methoden und Pfaden:

```
User klickt "Sensor entfernen" in SensorConfigPanel
  → SensorConfigPanel.confirmAndDelete()                      // Zeile 258
    → sensorsApi.delete(props.espId, props.configId)           // api/sensors.ts:34 (FUER MOCK UND REAL!)
      → DELETE /api/v1/sensors/{esp_id}/{config_id}            // sensors.py:892
        → sensor_repo.get_by_id(config_id)                     // BaseRepository (uuid.UUID)
        → sensor_repo.delete(sensor.id)                        // Physisch loeschen
        → subzone_service.remove_gpio_from_all_subzones()      // Subzone-Cleanup
        → esp_repo.rebuild_simulation_config(device, cfgs)     // Dual-Storage-Sync
        → db.commit()
        → scheduler_service.remove_job(esp_id, gpio)           // APScheduler
        → sim_scheduler.remove_job(job_id)                     // Mock: f"mock_{esp_id}_sensor_cfg_{config_id}"
        → config_builder.build_combined_config() + send_config // MQTT Config-Publish
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
2. **config_id in URL:** Network-Tab zeigt `DELETE /sensors/{esp_id}/{uuid}` (UUID), NICHT `/debug/mock-esp/{esp_id}/sensors/0` (GPIO) **[KORREKTUR verify-plan: Route ist `/{esp_id}/{config_id}`, NICHT `/sensors/config/cfg_...`]**
3. **Dual-Storage-Sync:** Nach Delete eines von 6 Sensoren: DB zeigt 5, simulation_config zeigt 5
4. **Frontend-Update:** L2 Satellites aktualisieren sich (6→5), MiniCard aktualisiert sich
5. **Alter Endpoint Guard:** `DELETE /debug/mock-esp/{esp_id}/sensors/{gpio}` bei >1 Sensor auf GPIO gibt 409 statt Mass-Delete **[KORREKTUR verify-plan: Vollstaendiger Pfad mit `/debug/mock-esp/` Prefix]**
6. **Neuer Test:** `test_delete_single_sensor_from_shared_gpio()` — 4 Sensoren auf GPIO 0 erstellen, 1 loeschen, pruefen dass 3 uebrig sind
7. **Regressions-Test:** Device-Delete (Soft-Delete + Cascade) funktioniert weiterhin (T10 Phase 10 darf nicht regressieren)

---

## ~~Betroffene Dateien (geschaetzt)~~ [KORRIGIERT]

**[KORREKTUR verify-plan]:** Korrigierte Datei-Liste basierend auf echtem Systemzustand:

| Datei | Vollstaendiger Pfad | Aenderung | Status |
|-------|---------------------|-----------|--------|
| ~~`sensors.py` (API)~~ | `src/api/v1/sensors.py` | ~~Neuer DELETE-Endpoint~~ | **BEREITS IMPLEMENTIERT** (Zeile 892-995) |
| `debug.py` | `src/api/v1/debug.py` | Guard auf `remove_sensor()` (Zeile 1092-1170): bei >1 Sensor auf GPIO → 409 | **OFFEN** |
| ~~`sensor_repo.py`~~ | `src/db/repositories/sensor_repo.py` | ~~`get_by_config_id()` NEU~~ | **NICHT NOETIG** — `BaseRepository.get_by_id()` existiert |
| `SensorConfigPanel.vue` | `src/components/esp/SensorConfigPanel.vue` | Mock-Pfad (Zeile 271) auf `sensorsApi.delete()` umstellen | **OFFEN** |
| ~~`esp.ts` (API)~~ | — | ~~`deleteSensorByConfigId()` NEU~~ | **NICHT NOETIG** — `sensorsApi.delete()` in `api/sensors.ts:34` existiert |
| `esp.ts` (Store) | `src/stores/esp.ts` | `removeSensor()` (Zeile 872-887) ggf. anpassen oder deprecaten | **PRUEFEN** |
| `debug.ts` (API) | `src/api/debug.ts` | `removeSensor()` (Zeile 156-159) deprecaten oder config_id-Variante | **OFFEN** |
| Tests | `tests/` | Einzel-Delete + Mass-Delete-Prevention fuer Mock-Pfad | **OFFEN** |

### Zusammenfassung fuer TM

Der Plan ueberschaetzt den Aufwand massiv. Die Haupt-DELETE-Pipeline (`sensors.py`) ist BEREITS per UUID implementiert (T08-Fix-D). Das Mass-Delete-Problem existiert NUR im Debug-Endpoint fuer Mock-ESPs (`debug.py:1092`). Der einfachste Fix: SensorConfigPanel Mock-Pfad auf den bestehenden `sensorsApi.delete()` umstellen (1 Zeile Frontend-Code) + Guard im Debug-Endpoint (optional, Sicherheitsnetz). Kein neuer Backend-Endpoint, kein neues API-Modul, kein `get_by_config_id()` noetig.
