# Report F07: MonitorView, Live- und Historienpfade

Datum: 2026-04-05  
Scope: `El Frontend/src/views/MonitorView.vue`, `El Frontend/src/components/monitor/*`, `El Frontend/src/components/devices/SensorCard.vue`, `El Frontend/src/components/devices/ActuatorCard.vue`, `El Frontend/src/components/charts/LiveLineChart.vue`, `El Frontend/src/composables/useZoneKPIs.ts`, `El Frontend/src/composables/useSparklineCache.ts`, `El Frontend/src/api/zones.ts`, `El Frontend/src/api/sensors.ts`, `El Frontend/src/stores/esp.ts`, `El Frontend/src/shared/stores/zone.store.ts`, `El Frontend/src/shared/stores/deviceContext.store.ts`, `El Frontend/src/router/index.ts`

## 1) Executive Result

- L1/L2/L3 sind klar getrennt und route-basiert umgesetzt: `monitor` -> `monitor-zone` -> `monitor-sensor` (plus `monitor-zone-dashboard`).
- Monitor arbeitet hybrid: REST-Snapshot als Basis, Live-Delta ueber WS-getriebene Store-Mutationen.
- Loading/Error/Empty ist je Hauptebene sauber vorhanden (L1, L2, L3), aber nicht einheitlich im Degradationsverhalten bei WS-Verbindungsproblemen.
- Context-Wechsel (Zone-/DeviceContext) haben nachweisbare Ketten bis zur sichtbaren UI-Aenderung.
- Hauptrisiko: L2-Aktorzustand im Primaerpfad ist nicht echt live (Snapshot-lastig), waehrend Sensorpfad live ueberlagert wird.

---

## 2) L1/L2/L3 Navigation und Kontextwechsel

## 2.1 Routen und Ebenen

| Ebene | Route | Primarkontext | Anzeige |
|---|---|---|---|
| L1 | `/monitor` | alle Zonen | Zone-Tiles + aktive Automatisierungen |
| L2 | `/monitor/:zoneId` | eine Zone | Subzone-Accordion mit Sensoren/Aktoren |
| L3 | `/monitor/:zoneId/sensor/:sensorId` | ein Sensor in einer Zone | SlideOver mit Zeitreihe/Stats/Livewert |
| L3-Dashboard | `/monitor/:zoneId/dashboard/:dashboardId` | ein Dashboard in einer Zone | DashboardViewer |

## 2.2 URL-Sync / Kontextsync

- L2-Kontext wird ueber `selectedZoneId` aus `route.params.zoneId` abgeleitet.
- L3-Sensor wird ueber `selectedSensorId` deep-link-faehig geoeffnet (`{espId}-gpio{gpio}`).
- `openSensorDetail()` setzt Route aktiv auf `monitor-sensor`; `closeSensorDetail()` geht zurueck auf `monitor-zone`.
- Ungueltige/deletete Zone wird defensiv auf L1 zurueckgeleitet.

## 2.3 Zone-/Subzone-Wechselwirkungen

- Zonewechsel triggert:
  - neues L2-REST-Fetch (`fetchZoneMonitorData`)
  - Accordion-State-Reload aus `localStorage`
  - Reset von Expanded-Sensor und Subzone-Filter
- Subzone-Filter (`selectedSubzoneFilter`) reduziert nur die Anzeigegruppe (`filteredSubzones`), nicht die Datenbasis.
- Prev/Next-Navigation, Tastatur und Swipe binden auf denselben Zone-Kontext.

---

## 3) Live-Streams vs. Historienabfragen (sauber getrennt)

## 3.1 L1 (Zone-Uebersicht)

**Livequelle**
- `useZoneKPIs` rechnet KPIs aus `espStore.devices` (deep watch, 300ms debounce).
- `espStore.devices` wird laufend per WS (`esp_health`, `sensor_data`, `actuator_status`, etc.) aktualisiert.

**Snapshot-/API-Anteil**
- `zonesApi.getAllZones()` liefert auch leere Zonen (30s Guard/Cooldown).
- `logicStore.fetchRules()`/History fuer Regelkontext in Tiles/Sections.

**Aktualisierungsregel**
- WS-Delta -> `espStore` -> `useZoneKPIs` Recompute -> Tile/KPI-Update.

## 3.2 L2 (Zone-Detail)

**Primaerpfad (REST-Snapshot)**
- `zonesApi.getZoneMonitorData(zoneId)` auf Zonewechsel.
- `AbortController` verhindert Race Conditions bei schnellem Navigieren.

**Live-Ueberlagerung**
- Sensoren im API-Snapshot werden mit Livewerten aus `espStore.devices` ueberblendet (`raw_value`, `quality`, `last_read`).
- Sparklines sind live aus `useSparklineCache` (watch auf `espStore.devices`) plus initiale Historie (`sensorsApi.queryData(limit=maxPoints)`).

**Fallbackpfad**
- Bei L2-API-Fehler: `useZoneGrouping` + `useSubzoneResolver` (Subzone-Mapping per API) als Ersatzquelle.

## 3.3 L3 (Sensor-Detail)

**Historie**
- Hauptzeitreihe: `sensorsApi.queryData(...)` (beim Oeffnen + bei Zeitbereichswechsel).
- Statistiken: `sensorsApi.getStats(...)`.
- Overlay-Sensoren: je Sensor eigener `queryData(...)` Abruf.

**Liveanteil**
- Hero-Wert/Stale-Anzeige kommt live aus `espStore.devices` (`detailLiveValue` + `detailIsStale`).
- Trend fuer grosse Zeitreihe basiert auf geladenen Historiewerten (`detailReadings`), nicht auf direktem WS-Stream.

---

## 4) Loading / Error / Empty je Hauptzustand

| Bereich | Loading | Error | Empty |
|---|---|---|---|
| L1 | `espStore.isLoading` -> `BaseSkeleton` | `espStore.error` -> `ErrorState` + Retry | `zoneKPIs.length===0` -> CTA zu Hardware |
| L2 | `zoneMonitorLoading` -> `BaseSkeleton` | `zoneMonitorError` -> `ErrorState` + Retry | `filteredSubzones.length===0` / Subzone ohne Geraete |
| L3 | `detailLoading` -> Spinner | `detailError` Textstatus | `detailReadings.length===0` fuer Zeitraum |

Zusatz:
- L1 hat zusaetzlich Archiv-Banner bei ausgewaehlter archivierter Zone.
- L2 hat explizite Trennung Sensoren/Aktoren plus Empty je Subzone.

---

## 5) Pflichtnachweis A: Context-Wechsel -> API/Store-Refresh -> sichtbare Aenderung

## 5.1 Zone-Kontext (Routing)

1. Nutzer wechselt Zone (`goToZone`, Prev/Next, Swipe, Tastatur).  
2. Route-Param `zoneId` aendert `selectedZoneId`.  
3. `fetchZoneMonitorData()` laedt neue Zonenbasis (REST) mit Race-Guard.  
4. `zoneDeviceGroup` berechnet Subzonen neu (primaer REST, fallback composable).  
5. UI aktualisiert Header, Subzonen, Karten, Dashboards, Rules-Sektion sichtbar.

## 5.2 DeviceContext (mobile/multi_zone)

1. Nutzer setzt Kontext in `SensorCard` (`setContext` / `clearContext`).  
2. API call in `deviceContext.store` schreibt Kontext + Toast.  
3. WS `device_context_changed` wird in `esp.store` verarbeitet:
   - `zone.store.handleDeviceContextChanged(...)`
   - `deviceContextStore.handleContextChanged(...)`
   - defensives `espStore.fetchAll()`
4. Monitor liest aktualisierte Devices/Kontexte:
   - L1-KPIs (`useZoneKPIs`) inkl. mobile guest counts
   - L2 mobile Kontext-Hints/Badges in Cards
5. Sichtbare Aenderung ist damit ueber API + WS + Store nachweisbar.

---

## 6) Pflichtnachweis B: Liveevent -> Card/Chart -> Alert/Statussignal

## 6.1 Sensor-Livekette

1. WS `sensor_data` trifft in `esp.store` ein (`handleSensorData` delegiert in `sensor.store`).  
2. Sensorwerte in `espStore.devices` werden aktualisiert.  
3. L2 `zoneDeviceGroup` ueberblendet Sensor-Snapshot mit Livefeldern.  
4. `SensorCard` zeigt neuen Wert, Quality-Status, Stale-/Offline-Badge.  
5. `useSparklineCache` fuegt Datenpunkte reaktiv hinzu -> `LiveLineChart` aktualisiert Sparkline.  
6. Statussignal: Dot/Farbstatus (`good/warning/alarm/offline`) + Textlabel (`OK`, `Warnung`, `Kritisch`, `Veraltet`).

## 6.2 Gesundheits-/Alarmkette

1. WS `esp_health` aktualisiert Device-Status in `espStore` (inkl. offlineInfo/runtime health).  
2. `useZoneKPIs` rechnet online/offline/alarm-abh. Health neu.  
3. `ZoneTileCard` wechselt Health-Status/Reason/Farbkodierung (`ok/warning/alarm/empty`).

## 6.3 Aktor-Livekette (Ist + Einschraenkung)

1. WS `actuator_status` aktualisiert Aktoren in `espStore`.  
2. L2-API-Pfad bindet Aktoren jedoch aus `zoneMonitorData` (Snapshot), ohne explizite Live-Ueberblendung aus `espStore`.  
3. Sichtbares Ergebnis in L2 kann hinter Echtzeit liegen, bis neuer REST-Load/Fallback greift.  
4. Statussignal in `ActuatorCard` (Ein/Aus, PWM, Offline/Stale, linked rules) ist vorhanden, aber Datenfrische im Primaerpfad eingeschraenkt.

---

## 7) Datenquelle, Aktualisierungsregel, Fehlerverhalten pro Hauptpfad

| Pfad | Datenquelle | Aktualisierung | Fehlerverhalten |
|---|---|---|---|
| L1 Zone-Tiles | `useZoneKPIs` auf `espStore.devices` + `zonesApi.getAllZones` | WS-gestuetzt + debounce | Skeleton/ErrorState/Empty + Retry |
| L2 Subzonen | `zonesApi.getZoneMonitorData` (primaer), `useZoneGrouping` (fallback) | bei Zonewechsel, Sensor-Liveoverlay | Skeleton/ErrorState + Fallbackresolver |
| L2 Sparkline | `useSparklineCache` + `sensorsApi.queryData` initial | watch auf `espStore.devices` | bei API-Fail bleibt Sparkline leer |
| L3 Zeitreihe | `sensorsApi.queryData` + `getStats` | on open, on range, on overlay toggle | loading/error/no-data explizit |

---

## 8) UX-Risiken bei Latenz/Disconnect (priorisiert)

## P1 (hoch) - L2 Aktor-Drift zwischen Live und Snapshot

- Sensoren werden live ueberlagert, Aktoren im API-Pfad nicht.
- Folge: Bediener sieht moeglichweise veralteten Aktorzustand trotz laufender WS-Events.

## P2 (mittel) - Kein expliziter WS-Connectivity-Zustand im Monitor

- Monitor zeigt keinen eigenen "Live getrennt/verbunden"-Indikator.
- Bei Disconnect wirkt L1/L2 u. U. wie "statisch korrekt", obwohl nur Snapshot sichtbar ist.

## P2 (mittel) - L2 Refetch nur zonenwechselgetrieben

- Bei Kontext-/Scope-Events wird global `fetchAll()` gemacht, aber kein gezielter erneuter `getZoneMonitorData` call erzwungen.
- Kann zu kurzfristigen Inkonsistenzen zwischen Kartenbereichen fuehren.

## P3 (niedrig) - Overlay-L3 Fehler still bei Einzelserien

- Overlay-Fehler setzen leere Serie ohne eigene Fehleranzeige je Overlay-Sensor.
- Hauptchart bleibt nutzbar, Diagnose einzelner Overlay-Ausfaelle aber schwerer.

---

## 9) Akzeptanzkriterien-Abgleich

- Jeder Monitor-Hauptpfad hat Datenquelle, Aktualisierungsregel und Fehlerverhalten: **erfuellt** (Abschnitte 3, 4, 7).
- UX-Risiken bei Latenz/Disconnect sind priorisiert: **erfuellt** (Abschnitt 8).
- Pflichtnachweise Context-Wechsel und Liveevent-Kette sind vorhanden: **erfuellt** (Abschnitte 5, 6).

## 10) Kurzfazit

Die Monitor-Architektur ist fuer Sensor-Liveansichten stark und konsistent (REST-Basis + WS-Liveoverlay + klare Ready-Gates). Die wesentliche Schwaeche liegt nicht in fehlenden Fallbacks, sondern in asymmetrischer Echtzeitbehandlung zwischen Sensor- und Aktorkarten auf L2. Fuer operative Sicherheit sollte der Aktorpfad auf dieselbe Live-Ueberlagerungslogik wie Sensoren gehoben oder explizit als Snapshot gekennzeichnet werden.

