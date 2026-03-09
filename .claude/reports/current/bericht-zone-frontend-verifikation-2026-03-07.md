# Zone-Frontend-Anpassung & Datenerhalt-Verifikation

**Datum:** 2026-03-07
**Auftrag:** Teilauftrag 0.3 (Zone-Frontend) + 0.4 (Datenerhalt)
**Referenz:** auftrag-phase0-datenfehler-mock-debugging-2026-03-07.md

---

## Teil A: Zone-Frontend-Anpassungen (0.3)

### Schritt 1: Zone-API im Frontend

**Status:** Implementiert

- **Backend:** Neuer Endpoint `GET /v1/zone/zones` in `El Servador/god_kaiser_server/src/api/v1/zone.py`
  - Mergt Zonen aus Device-Zuweisungen UND ZoneContext-Tabelle
  - Liefert pro Zone: `zone_id`, `zone_name`, `device_count`, `sensor_count`, `actuator_count`
  - Sortierung alphabetisch nach zone_name/zone_id
- **Schemas:** `ZoneListEntry` + `ZoneListResponse` in `El Servador/god_kaiser_server/src/schemas/zone.py`
- **Frontend Types:** `ZoneListEntry` + `ZoneListResponse` in `El Frontend/src/types/index.ts`
- **Frontend API:** `zonesApi.getAllZones()` in `El Frontend/src/api/zones.ts`

### Schritt 2: MonitorView L1 — Leere Zonen in KPIs

**Status:** Implementiert

- `zoneKPIs` Computed in `MonitorView.vue` neu geschrieben:
  - Baut erst `Map<string, ZoneKPI>` aus `espStore.devices` (Device-basierte KPIs)
  - Mergt dann `allZones.value` (Zone-API): Leere Zonen erhalten 0-Werte
  - Leere Zonen erscheinen jetzt in der L1-Kachelansicht
- `fetchAllZones()` wird in `onMounted` aufgerufen
- Zone-Existenz-Watcher prueft sowohl `espStore.devices` als auch `allZones`
- Empty State Text: "Keine Zonen vorhanden." (statt "Keine Zonen mit Geraeten vorhanden.")

### Schritt 3: Monitor L2 — Leere Subzonen

**Status:** Implementiert

- **Backend:** `monitor_data_service.py` sammelt jetzt `configured_subzone_keys` im ersten Pass
  - Entfernt: `if not sensors and not actuators: continue` (filterte leere Subzonen raus)
  - Hinzugefuegt: `all_keys |= configured_subzone_keys` (leere Subzonen immer im Response)
- **Frontend:** L2-Sensor-Sektion zeigt leere Subzonen mit Hinweis:
  - "Keine Sensoren zugeordnet — Sensoren in der Hardware-Ansicht hinzufuegen"
  - Link zur Hardware-View (`/hardware`)
  - v-if Bedingung geaendert: `subzones.length > 0` statt `sensorCount > 0`

### Schritt 4: Zone-Health-Status fuer leere Zonen

**Status:** Implementiert

- `ZoneHealthStatus` Type erweitert: `'ok' | 'warning' | 'alarm' | 'empty'`
- `getZoneHealthStatus()` prueft `totalDevices === 0` als erstes:
  - Return: `{ status: 'empty', reason: 'Keine Geraete zugeordnet' }`
  - NICHT mehr "alarm" fuer leere Zonen
- `HEALTH_STATUS_CONFIG` um `empty` erweitert: Label "Leer", CSS-Klasse `zone-status--empty`
- Neues Icon: `Minus` fuer leere Zonen (zwischen AlertTriangle und XCircle)
- CSS: `.zone-status--empty` (var(--color-text-muted)), `.monitor-zone-tile--empty` (opacity 0.7)

---

## Teil B: Datenerhalt-Verifikation (0.4)

### Schritt 5: API-Filter Analyse

**Ergebnis:** Architektonisch korrekt — kein zone_id-Filter in Sensor-Queries

**Analyse von `El Frontend/src/api/sensors.ts`:**
- `SensorDataQuery` Interface hat **kein** `zone_id` Feld
- Queries laufen per `esp_id`, `gpio`, `sensor_type` (Geraete-Identifikation)
- `queryData()` sendet: `GET /sensors/data?esp_id=...&gpio=...&sensor_type=...&from=...&to=...`

**Analyse von Backend `sensor_data_service.py`:**
- Phase 0.1 speichert `zone_id` + `subzone_id` in `sensor_data` zum Messzeitpunkt (korrekt)
- Historische Abfragen filtern NICHT nach zone_id — sie liefern alle Daten fuer den Sensor

**Bewertung:**
Die aktuelle Architektur nutzt `zone_id` in `sensor_data` als Audit-Information (wann war der Sensor wo?), aber die Query-Schnittstelle filtert per Geraet (esp_id + gpio). Dies bedeutet:
- Historische Daten bleiben bei Zone-Wechsel vollstaendig erhalten
- Ein Sensor zeigt in der neuen Zone ALLE historischen Daten (nicht nur ab Wechselzeitpunkt)
- Zone-basiertes Filtern von historischen Daten ist explizit **out of scope** fuer diesen Auftrag

### Schritt 6: Frontend-Charts Analyse

**Ergebnis:** Charts zeigen alle historischen Daten eines Sensors, unabhaengig von Zone-Wechseln

**MonitorView L2 Expanded Chart:**
- `fetchExpandedChartData()` nutzt `sensorsApi.queryData()` mit esp_id + gpio
- Kein zone_id Parameter in der Query
- 1h-Fenster mit 500 Datenpunkten (Initial-Fetch)

**MonitorView L3 Sensor-Detail:**
- Gleicher Mechanismus: `sensorsApi.queryData()` per esp_id + gpio + sensor_type
- Multi-Sensor-Overlay ebenfalls ohne zone_id Filter
- TimeRange-Buttons (1h, 6h, 24h, 7d) aendern nur Zeitfenster, nicht Zone

**Szenario: Sensor wechselt von Zone A nach Zone B:**
- Zone A Monitor: Sensor nicht mehr sichtbar (nicht in Zone A Devices)
- Zone B Monitor: Zeigt ALLE historischen Daten (kein zone_id Filter)
- Daten gehen nicht verloren — sie sind weiterhin abrufbar

**Bewertung:**
Das Verhalten ist konsistent und erwartbar. Zone-basierte historische Filterung (z.B. "nur Daten waehrend Zone A anzeigen") ist ein separates Feature und explizit out of scope.

---

## Zusammenfassung

### Akzeptanzkriterien

| Kriterium | Status |
|-----------|--------|
| Zone-API (GET /zones) im Frontend integriert | OK |
| L1 zeigt leere Zonen (0/0, nicht "alarm") | OK |
| L2 zeigt leere Subzonen mit Hinweis-Text | OK |
| Datenerhalt bei Zone-Wechsel verifiziert | OK |
| Verifikationsbericht geschrieben | OK |
| Build + Tests gruen | Ausstehend |

### Geaenderte Dateien

**Backend:**
- `El Servador/god_kaiser_server/src/schemas/zone.py` — ZoneListEntry, ZoneListResponse
- `El Servador/god_kaiser_server/src/api/v1/zone.py` — GET /v1/zone/zones
- `El Servador/god_kaiser_server/src/services/monitor_data_service.py` — Leere Subzonen

**Frontend:**
- `El Frontend/src/types/index.ts` — ZoneListEntry, ZoneListResponse Interfaces
- `El Frontend/src/api/zones.ts` — getAllZones() Methode
- `El Frontend/src/views/MonitorView.vue` — L1 KPIs, Health-Status, L2 Subzonen

### Offene Punkte

1. **Zone-basierte historische Filterung:** SensorDataQuery hat kein zone_id Feld. Wenn gewuenscht, koennte ein optionaler `zone_id` Filter in der Query-API ergaenzt werden — aber explizit out of scope.
2. **WebSocket-Update fuer allZones:** `allZones` wird nur bei Mount geladen. Bei dynamischer Zone-Erstellung/-Loeschung waehrend der Session muesste ein WS-Event oder Polling ergaenzt werden.
3. **ZoneContext-Tabelle Befuellung:** Die Zone-API liefert nur Zonen, die entweder Devices haben ODER einen ZoneContext-Eintrag. Zonen muessen in der ZoneContext-Tabelle existieren, um als "leere Zone" zu erscheinen.
