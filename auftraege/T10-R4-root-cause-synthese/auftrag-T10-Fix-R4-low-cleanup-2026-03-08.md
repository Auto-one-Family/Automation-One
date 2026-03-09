# Auftrag T10-Fix-R4: LOW + INFO Cleanup — MiniCard + WiFi + Epoch + Polling + Acknowledged

> **Bezug:** T10-R4 Root-Cause-Synthese (2026-03-08)
> **Prioritaet:** LOW (P3)
> **Datum:** 2026-03-08
> **Geschaetzter Aufwand:** ~30 Min (nach verify-plan Korrektur: Fix 5 entfaellt, Fix 4 trivial)
> **Ersetzt:** auftrag-T10-fixD (veraltet)
> **Voraussetzung:** Fix-Runde 1 abgeschlossen (BUG-05 Fix noetig vor BUG-14 Cleanup)

---

## Ziel

4 niedrig-priorisierte Fixes — Cleanup, Log-Noise, Performance. (Fix 5 entfaellt — bereits implementiert.)

---

## Fix 1: BUG-10 — MiniCard Sensor-Count (~5 Min)

### IST
`DeviceMiniCard.vue` (ca. Zeile 154-159): `sensorCount` Computed zaehlt nur geladene Sensoren via `groupSensorsByBaseType(sensors)`. Pending Configs werden vom Server nicht im `sensors[]`-Array mitgeliefert → Count ist zu niedrig (z.B. "3S" statt "4S").

### SOLL
```typescript
// [verify-plan Korrektur] SOLL-Code war falsch:
// - groupSensorsByBaseType(sensors).length zaehlt GRUPPEN (Base-Types), nicht Einzel-Werte
//   Aktueller Code zaehlt korrekt: grouped.reduce((sum, g) => sum + g.values.length, 0)
//   → .length wuerde z.B. 2 (SHT31+DS18B20) statt 3 (temp+humidity+temp) liefern
// - Type-Cast `as RawSensor[]` darf NICHT entfernt werden (TypeScript-Error)
// Korrigierter SOLL:
const sensorCount = computed(() => {
  const sensors = props.device.sensors as RawSensor[] | undefined
  if (!sensors || sensors.length === 0) return props.device.sensor_count ?? 0
  const grouped = groupSensorsByBaseType(sensors)
  const loadedCount = grouped.reduce((sum, g) => sum + g.values.length, 0)
  return Math.max(loadedCount, props.device.sensor_count ?? 0)
})
```

### Betroffene Dateien
1. **DeviceMiniCard.vue** — `sensorCount` Computed (ca. Zeile 154)

### Akzeptanzkriterien
- [ ] MiniCard zeigt Count >= DB sensor_count
- [ ] Bestehende Tests gruen

---

## Fix 2: BUG-07 — Weak WiFi RSSI-Filter (~5 Min)

### IST
`heartbeat_handler.py` (Zeile 1095-1097): `if wifi_rssi < -70: logger.warning(...)` ohne Filter fuer Simulations-ESPs. Wokwi sendet RSSI `-72 dBm` → Warning bei jedem Heartbeat.

### SOLL
```python
# [verify-plan Korrektur] 3 Probleme im Original-SOLL:
# 1. Zeile ist 1096, nicht 1091
# 2. `esp_device` ist in `_log_health_metrics(self, esp_id, payload)` NICHT verfuegbar
#    → Methode hat nur esp_id (str) und payload (dict), kein esp_device-Objekt
# 3. hardware_type-Werte sind "MOCK_ESP32", "ESP32_WROOM", "XIAO_ESP32_C3"
#    → "MOCK", "WOKWI", "SIMULATION" existieren nicht als hardware_type
#    → Korrekte Enum: DataSource (production/mock/test/simulation) in db/models/enums.py
#
# Loesung A: esp_device als Parameter durchreichen (Signatur aendern)
# Loesung B: data_source aus payload oder calling context pruefen
# Loesung C: In _process_heartbeat() (Zeile ~231, wo esp_device verfuegbar ist)
#            ein Flag `is_simulated` bestimmen und an _log_health_metrics uebergeben

# Empfohlen (Loesung C — minimaler Impact):
#
# [Code-Verifikation 2026-03-08] 4 Korrekturen:
# 1. `DataSource.is_non_production()` existiert NICHT → korrekt: `DataSource.is_test_data()`
# 2. `detected_source` existiert NICHT → korrekt: `device_source` (Zeile 246)
# 3. `device_source` wird in Zeile 246 berechnet, NACH _log_health_metrics (Zeile 231)
#    → `_detect_device_source()` Aufruf muss VOR _log_health_metrics verschoben werden
# 4. `device_source` ist str, `is_test_data()` erwartet DataSource
#    → Braucht `DataSource.from_string(device_source)`
#
# In _process_heartbeat(), Zeile 231 ersetzen durch:
# (device_source-Berechnung von Zeile 246 hierher VORZIEHEN)
device_source = self._detect_device_source(esp_device, payload)
is_simulated = DataSource.is_test_data(DataSource.from_string(device_source))
self._log_health_metrics(esp_id_str, payload, is_simulated=is_simulated)

# In _log_health_metrics (Signatur erweitern):
def _log_health_metrics(self, esp_id: str, payload: dict, is_simulated: bool = False):
    ...
    if wifi_rssi < -70 and not is_simulated:
        logger.warning(f"Weak WiFi signal on {esp_id}: rssi={wifi_rssi} dBm")

# WICHTIG: In Zeile 246 device_source WIEDERVERWENDEN (nicht nochmal berechnen):
# Bestehender Code `device_source = self._detect_device_source(...)` entfernen
# oder Variable umbenennen, da device_source bereits oben berechnet wurde.
```

### Betroffene Dateien
1. **heartbeat_handler.py** — `_log_health_metrics` Signatur + RSSI-Warning (Zeile 1073, 1096)
2. **heartbeat_handler.py** — `_process_heartbeat`: `_detect_device_source()` von Zeile 246 nach vor Zeile 231 verschieben, `is_simulated` Flag berechnen

### Akzeptanzkriterien
- [ ] `{compose_service="el-servador"} |= "Weak WiFi" |= "MOCK"` → 0 Treffer
- [ ] Echter ESP mit schwachem WiFi triggert weiterhin Warning
- [ ] Bestehende Tests gruen

---

## Fix 3: BUG-14 — Epoch-0 Daten-Cleanup (~5 Min)

### IST
134 `sensor_data`-Rows mit `created_at = 1970-01-01` fuer ESP_00000001 DS18B20. Werte korrekt (raw=360, processed=22.5), nur Timestamp falsch.

### SOLL
Nach BUG-05 Fix (Fix-Runde 1): Einmaliges SQL-Cleanup:
```sql
-- Option A: Timestamps korrigieren
UPDATE sensor_data SET created_at = NOW()
WHERE created_at < '1971-01-01';

-- Option B: Wokwi-Testdaten loeschen (wenn nicht benoetigt)
DELETE FROM sensor_data WHERE created_at < '1971-01-01';
```

### Voraussetzung
BUG-05 Fix MUSS zuerst implementiert sein — sonst entstehen neue Epoch-0 Rows.

### Akzeptanzkriterien
- [ ] `SELECT COUNT(*) FROM sensor_data WHERE created_at < '1971-01-01'` → 0
- [ ] Keine neuen Epoch-0 Rows nach 30 Min Beobachtung

---

## Fix 4: BUG-16 — Notification-Polling deduplizieren (~30 Min)

### IST
> [verify-plan Korrektur] IST-Beschreibung war ungenau:
> - Es gibt BEREITS einen zentralen Store: `alert-center.store.ts` (Pinia)
> - NUR dieser Store ruft `notificationsApi.getAlertStats()` auf (Zeile 103)
> - KEIN Store/Composable ruft den Endpoint doppelt ab
> - Das eigentliche Problem: `startStatsPolling()` wird an 3 Stellen aufgerufen:
>   1. `App.vue:33` (on mount)
>   2. `AlertStatusBar.vue:34` (on mount)
>   3. `HealthTab.vue:267` (on mount)
> - `startStatsPolling()` ruft intern `fetchStats()` sofort auf (Zeile 188)
> - Jeder Mount = 1 sofortiger API-Call + Polling-Neustart (alter Timer wird gestoppt)
> - Ergebnis: 3 initiale Calls statt 1, dann 30s-Intervall-Polling (korrekt 1x)

### SOLL
`startStatsPolling()` NUR in `App.vue` aufrufen (dort bleibt es). Aus `AlertStatusBar.vue:34` und `HealthTab.vue:267` entfernen — diese Components lesen nur aus dem Store (was sie bereits tun). Kein neuer Store/Dedup noetig.

> [Code-Verifikation 2026-03-08] **KRITISCH: stopStatsPolling() ebenfalls entfernen!**
> AlertStatusBar.vue:37-39 und HealthTab.vue:272-274 rufen `stopStatsPolling()` in `onUnmounted` auf.
> Wenn NUR `startStatsPolling()` entfernt wird aber `stopStatsPolling()` bleibt,
> killt das Unmounten dieser Components das Polling das App.vue gestartet hat!
> → Beim Wegnavigieren vom Monitor (HealthTab unmount) oder Ausblenden der StatusBar
>   wuerde das globale Polling gestoppt — Alert-Badges bleiben stehen.
>
> App.vue hat KEIN `stopStatsPolling()` in onUnmounted (korrekt — Root-Component unmountet nie).

### Begruendung
3 (nicht 6) redundante initiale Calls pro Seitenladung. Der zentrale Store existiert bereits und funktioniert. Fix ist trivial: 4 Zeilen entfernen (nicht 2!).

### Betroffene Dateien
1. **AlertStatusBar.vue** (Zeile 34) — `alertStore.startStatsPolling()` entfernen
2. **AlertStatusBar.vue** (Zeile 37-39) — `onUnmounted(() => { alertStore.stopStatsPolling() })` entfernen
3. **HealthTab.vue** (Zeile 267) — `alertStore.startStatsPolling()` entfernen
4. **HealthTab.vue** (Zeile 272-274) — `onUnmounted(() => { alertStore.stopStatsPolling() })` entfernen

### Akzeptanzkriterien
- [ ] Browser DevTools → Network → maximal 1x `/alerts/stats` pro Navigation
- [ ] Alert-Badges weiterhin korrekt und aktuell nach Seitenwechsel (Monitor → Dashboard → zurueck)
- [ ] Polling laeuft weiter nach Unmount von AlertStatusBar oder HealthTab
- [ ] Bestehende Tests gruen

---

## ~~Fix 5: BUG-18 — Acknowledged-Button pruefen~~ → ENTFAELLT

> [verify-plan Korrektur] **Komplett implementiert — kein Fix noetig.**
>
> Die gesamte ISA-18.2 Acknowledge-Kette ist END-TO-END implementiert:
>
> **Backend:**
> - `PATCH /v1/notifications/{id}/acknowledge` → `notifications.py:359-401`
> - State-Transition-Validierung via `AlertStatus.VALID_TRANSITIONS`
> - WebSocket-Broadcast nach Acknowledge
>
> **Frontend API-Client:**
> - `notificationsApi.acknowledgeAlert(id)` → `notifications.ts:304-308`
>
> **Frontend Store:**
> - `alertCenterStore.acknowledgeAlert(id)` → `alert-center.store.ts:141-156`
>
> **Frontend UI:**
> - `NotificationItem.vue:107` — emittiert `acknowledge`-Event, zeigt Button fuer active/acknowledged
> - `NotificationDrawer.vue:95,246` — handled `@acknowledge`, ruft Store-Action auf
> - `QuickAlertPanel.vue:116,130` — Einzel- und Bulk-Acknowledge ("Alle bestaetigen")
> - Status-Label "Gesehen" fuer acknowledged (`NotificationItem.vue:69`)
> - CSS-Klasse `item__status--acknowledged` (`NotificationItem.vue:377`)
>
> **0 Rows in DB** bedeutet: Kein Alert wurde bisher ausgeloest (System hat noch keine Alerts generiert),
> NICHT dass der Button fehlt oder kaputt ist.
>
> **Empfehlung:** Stattdessen einen manuellen Test-Alert senden (`POST /v1/notifications/send`)
> und den Acknowledge-Flow einmal durchklicken, um zu verifizieren.
>
> **Aufwands-Ersparnis:** ~1h eingespart.
