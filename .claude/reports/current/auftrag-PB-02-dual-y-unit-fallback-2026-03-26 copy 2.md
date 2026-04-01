## Auftrag: PB-02 Dual-Y-Achsen Unit-Fallback Fix

**Ziel-Repo:** auto-one
**Bezug:** Editor Phase B — Dual-Y-Achsen im Multi-Sensor-Chart
**Prioritaet:** Mittel
**Datum:** 2026-03-26

---

### Ist-Zustand

**Dual-Y ist BEREITS IMPLEMENTIERT — aber durch einen Bug deaktiviert.**

`MultiSensorChart.vue` hat vollstaendige Dual-Y-Logik (Feature-Tag 8.0-B):
- `unitGroups` (Zeile 238-246): Map `unit → sensorIds[]` — gruppiert alle Sensoren nach ihrer Einheit
- `uniqueUnits` (Zeile 249): Array aller verschiedenen Einheiten
- `needsDualAxis` (Zeile 252): `true` wenn 2+ verschiedene Einheiten vorhanden
- `computeRangeForUnit()` (Zeile 258-282): Auto-Range pro Achse mit 15% Padding
- Achsen-Konfiguration: Links `y` (erste Einheit) + Rechts `y1` (zweite Einheit, `grid: { drawOnChartArea: false }`)
- `yAxisID` pro Dataset (Zeile 322-325): Erste Einheit → `'y'`, zweite → `'y1'`, dritte+ → `'y'` (Fallback links)
- UI-Badge "2Y" erscheint automatisch wenn `needsDualAxis` aktiv ist

**Root Cause — eine Zeile in `MultiSensorWidget.vue`:**

In Zeile 70 wird die `unit` fuer jeden Sensor gesetzt:
```typescript
unit: sensor?.unit || '',
```

`sensor` kommt aus `device.sensors[]` im Pinia Store. Wenn der Server/ESP keine `unit` im Sensor-Objekt mitliefert, ist `sensor.unit` ein leerer String. Alle Sensoren gruppieren sich dann unter der gleichen leeren Unit `''`. `uniqueUnits` hat Laenge 1 → `needsDualAxis` bleibt `false` → Dual-Y wird nie aktiviert.

**SOLL:** Fallback auf die statische Unit aus `SENSOR_TYPE_CONFIG` wenn die dynamische Unit leer ist. Damit funktioniert Dual-Y zuverlaessig — unabhaengig davon ob der Server eine Unit mitsendet.

---

### Systemkontext

**AutomationOne 3-Schichten-Architektur:**
1. **El Trabajante** (ESP32 Firmware) — misst Sensordaten, sendet via MQTT
2. **El Servador** (FastAPI Backend) — verarbeitet, speichert, REST-API
3. **El Frontend** (Vue 3) — Visualisierung und Konfiguration. Dieser Auftrag betrifft NUR diese Schicht.

**Design-Patterns die eingehalten werden muessen:**

**sensorId-Format (3-teilig):** ALLE 6 Dashboard-Widgets nutzen IDs im Format `espId:gpio:sensorType`. In `MultiSensorWidget.vue` wird dieses Format manuell per `sId.split(':')` in Zeile 53-56 geparst — der `sensorType` ist dort bereits als lokale Variable verfuegbar. Das zentralisierte `useSensorId` Composable (`composables/useSensorId.ts`) wird in dieser Datei NICHT verwendet — das manuelle Parsing beibehalten, nicht refactoren.

**SENSOR_TYPE_CONFIG (sensorDefaults.ts):** Zentrale Konfiguration im Frontend mit Units, Labels und Ranges fuer ALLE 9 Sensortypen. Alle relevanten Units sind bereits vorhanden:

| sensorType Key(s) | Unit |
|---|---|
| ds18b20, DS18B20 | °C |
| sht31_temp, SHT31, sht31 | °C |
| sht31_humidity, SHT31_humidity | %RH |
| bme280_temp, BME280, BME280_temp | °C |
| bme280_humidity, BME280_humidity | %RH |
| bmp280_pressure, BME280_pressure | hPa |
| ph | pH |
| ec | µS/cm |
| co2 (Zeile 460) | ppm |
| light (Zeile 444) | lux |
| soil_moisture (Zeile 494) | % |
| flow (Zeile 412) | L/min |

`sensorDefaults.ts` braucht KEINE Aenderung — alle Units sind vollstaendig.

**Chart-Bibliothek:** Chart.js 4.x mit vue-chartjs (KEIN ECharts). Dual-Y nutzt benannte Scales (`y` links, `y1` rechts). Rechte Achse bekommt `grid: { drawOnChartArea: false }` um doppelte Gitterlinien zu verhindern. Die gesamte Dual-Y-Mechanik in `MultiSensorChart.vue` ist korrekt implementiert und darf nicht veraendert werden.

**Flaches Widget-Config-Interface:** Alle 9 Widget-Typen teilen ein flaches Config-Interface ohne Type-Discriminator. Widget-Registrierung ist 4-stellig: WidgetType Union, componentMap, META, DEFAULT_CONFIGS. Keine Aenderung an diesen Strukturen noetig.

---

### Was getan werden muss

Ein Multi-Sensor-Chart mit Temperatur (°C) und Feuchte (%RH) muss automatisch zwei Y-Achsen anzeigen — links die Temperatur-Achse, rechts die Feuchte-Achse. Der Nutzer soll dafuer nichts konfigurieren muessen.

Der Fix ist chirurgisch: **Ein Import + eine Zeile** in `MultiSensorWidget.vue`.

---

### Technische Details

**Betroffene Schichten:**
- [ ] Backend (El Servador) — keine Aenderung
- [ ] Firmware (El Trabajante) — keine Aenderung
- [x] Frontend (El Frontend) — einziger Fokus
- [ ] Monitoring — keine Aenderung

**Einzige betroffene Datei: `MultiSensorWidget.vue`**

**Schritt 1 — Import hinzufuegen:**

`SENSOR_TYPE_CONFIG` ist in `MultiSensorWidget.vue` aktuell NICHT importiert. Import hinzufuegen (nach den anderen `@/utils/`-Imports, ca. Zeile 13):

```typescript
import { SENSOR_TYPE_CONFIG } from '@/utils/sensorDefaults'
```

**Schritt 2 — Unit-Fallback einbauen (Zeile 70):**

IST:
```typescript
unit: sensor?.unit || '',
```

SOLL:
```typescript
unit: sensor?.unit || SENSOR_TYPE_CONFIG[sensorType]?.unit || '',
```

`sensorType` wird in Zeile 63 aus dem manuellen `sId.split(':')` Parsing definiert und ist an Zeile 70 bereits verfuegbar. Die Fallback-Kette ist: 1) dynamische Unit aus dem Store, 2) statische Unit aus SENSOR_TYPE_CONFIG, 3) leerer String als letzter Fallback.

**Vorhandene Infrastruktur (nur lesen, nicht aendern):**
- `MultiSensorChart.vue` — vollstaendige Dual-Y-Logik, wird durch den Fix automatisch aktiviert
- `SENSOR_TYPE_CONFIG` in `sensorDefaults.ts` — hat Units fuer alle Sensortypen, vollstaendig
- `annotationPlugin` ist in MultiSensorChart registriert aber konfiguriert KEINE Annotations — kein scaleID-Konflikt durch den Fix

---

### Implementierungs-Reihenfolge

1. `MultiSensorWidget.vue`: `SENSOR_TYPE_CONFIG`-Import hinzufuegen
2. `MultiSensorWidget.vue` Zeile 70: Unit-Fallback einbauen
3. TypeScript pruefen: `vue-tsc` muss fehlerfrei durchlaufen
4. Manueller Test: Multi-Sensor-Widget mit Temperatur + Feuchte konfigurieren → "2Y"-Badge muss erscheinen, zwei Achsen sichtbar
5. Regressionstest: Widget mit nur einem Sensortyp → weiterhin eine Y-Achse

---

### Akzeptanzkriterien

- [ ] Ein MultiSensorChart mit `sht31_temp` und `sht31_humidity` zeigt automatisch zwei Y-Achsen (links °C, rechts %RH) — auch wenn `sensor.unit` im Store leer ist
- [ ] Das "2Y"-Badge erscheint im Widget-Header wenn Dual-Y aktiv ist
- [ ] Rechte Achse hat `grid.drawOnChartArea: false` (kein doppeltes Gitter)
- [ ] Ein MultiSensorChart mit nur einem Sensortyp (z.B. nur Temperatur) zeigt weiterhin nur eine Y-Achse
- [ ] Wenn 3 verschiedene Einheiten gewaehlt werden: kein Absturz, dritte Einheit wird der linken Achse zugeordnet
- [ ] TypeScript-Kompilierung fehlerfrei (`vue-tsc` ohne Fehler)
- [ ] `HistoricalChart` und alle anderen 5 Widget-Typen sind unveraendert

---

### Einschraenkungen

- NUR `MultiSensorWidget.vue` aendern — sonst nichts
- `MultiSensorChart.vue` NICHT aendern — die Dual-Y-Logik dort ist korrekt
- `sensorDefaults.ts` NICHT aendern — alle Units sind bereits vorhanden
- Kein neues Composable, keine neue Utility-Funktion
- Keine neue Chart.js-Dependency
- `HistoricalChart` braucht kein Dual-Y (Single-Sensor-Widget)
- Das manuelle `sId.split(':')` Parsing in `MultiSensorWidget.vue` NICHT auf `useSensorId` umbauen — das ist ein separater Refactor
- Design-Tokens nicht aendern

---

### Referenzen

**Ziel-Repo (auto-one):**
- `El Frontend/src/components/dashboard-widgets/MultiSensorWidget.vue` — Zeile 70 (Unit-Fallback Bug)
- `El Frontend/src/components/charts/MultiSensorChart.vue` — Zeile 234-407 (Dual-Y Logik, nur lesen)
- `El Frontend/src/utils/sensorDefaults.ts` — SENSOR_TYPE_CONFIG (nur lesen)
- `El Frontend/src/composables/useSensorId.ts` — sensorId-Parsing (nur lesen)

**Wissen:**
- Chart.js Dual-Y Best Practice: Benannte Scales (`y`/`y1`), `grid.drawOnChartArea: false` auf rechter Achse, max 2 Achsen sinnvoll darstellbar. 3+ Einheiten auf 2 Achsen verteilen (Fallback links).
