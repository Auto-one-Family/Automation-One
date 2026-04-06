# Report Frontend F07: Monitor, Live-Ansichten, Historie und Degradation

Datum: 2026-04-06  
Scope: `El Frontend/src/views/MonitorView.vue`, `El Frontend/src/router/index.ts`, `El Frontend/src/composables/useZoneKPIs.ts`, `El Frontend/src/composables/useZoneGrouping.ts`, `El Frontend/src/components/monitor/ZoneTileCard.vue`, `El Frontend/src/components/devices/SensorCard.vue`, `El Frontend/src/components/devices/ActuatorCard.vue`, `El Frontend/src/composables/useSparklineCache.ts`, `El Frontend/src/api/zones.ts`, `El Frontend/src/stores/esp.ts`, `El Frontend/src/composables/useWebSocket.ts`, `El Frontend/src/services/websocket.ts`

## 1) Datenpfad je Ebene L1/L2/L3 (REST-Basis, Live-Overlay, Fallback)

### 1.1 L1 `/monitor` (Zone-Tiles)

| Aspekt | Ist-Zustand |
|---|---|
| REST-Basis | `useZoneKPIs` laedt Zone-Entitaeten via `zonesApi.getAllZones()` (inkl. leerer Zonen) |
| Live-Overlay | KPI-Berechnung basiert auf `espStore.devices`; WS-Events patchen `espStore` und triggern debounctes Recompute |
| Fallback | Wenn Zone-API fehlschlaegt: `allZones=[]`; L1 zeigt nur aus Device-Liste ableitbare Zonen |

### 1.2 L2 `/monitor/:zoneId` (Subzone-Akkordeon, Sensor-/Aktor-Karten)

| Aspekt | Ist-Zustand |
|---|---|
| REST-Basis | Primar `zonesApi.getZoneMonitorData(zoneId)` als Subzone-Snapshot (`zoneMonitorData`) |
| Live-Overlay | **Nur Sensorpfad**: `zoneDeviceGroup` ueberschreibt `raw_value`, `quality`, `last_read` aus `espStore.devices` |
| Fallback | Bei API-Fehler: `zoneMonitorError` -> lazy `subzoneResolver.buildResolver()` -> Daten aus `useZoneGrouping` |

### 1.3 L3 `/monitor/:zoneId/sensor/:sensorId` (SlideOver Zeitreihe)

| Aspekt | Ist-Zustand |
|---|---|
| REST-Basis | `fetchDetailData()` und Overlay-Serien via `sensorsApi.queryData`; Stats via `sensorsApi.getStats` |
| Live-Overlay | `detailLiveValue` liest reaktiv den aktuellen Sensorwert aus `espStore.devices` |
| Fallback | Bei Stats-Fehler: `detailStats=null`, Min/Max-Zeitpunkte aus Readings clientseitig; bei Datenfehler: leere Serie + Error-Text |

## 2) Kartenklassifikation: live / snapshot / hybrid

| Komponente | Datenmodus (Ist) | Begruendung |
|---|---|---|
| `ZoneTileCard` (L1) | hybrid | KPI-Werte werden aus Store-Livezustand berechnet, aber Zone-Liste ist API-gestuetzt |
| `InlineDashboardPanel` in Zone-Tile (L1) | hybrid | Dashboard-Widgets lesen Widget-spezifische Datenpfade (teils live, teils snapshot) |
| `SensorCard` (L2) | hybrid mit Live-Prioritaet | Werte/Qualitaet/LastRead werden bei vorhandenem Live-Sensor ueber Snapshot gelegt |
| Sensor-Sparkline in `SensorCard` (L2) | hybrid | Historie initial aus API, danach fortlaufend aus Store/WS dedupliziert |
| Expanded-1h-Chart (L2) | snapshot-on-demand | Wird bei Expand per API geladen, kein laufender WS-Stream im Chart |
| `ActuatorCard` (L2) | snapshot-lastig | Basis kommt aus `zoneMonitorData` und wird in `zoneDeviceGroup` nicht live ueberlagert |
| L3 Hauptzeitreihe + Overlay | snapshot-lastig + live Marker | Zeitreihe API-basiert, aktueller Messwert separat live aus Store |

## 3) Degradation-UX fuer WS/API-Ausfall (Soll-Definition)

### 3.1 Verbindliche Zustandsmatrix fuer Monitor

| Zustand | Trigger | Pflichtanzeige |
|---|---|---|
| `connected` | `useWebSocket.connectionStatus === connected` und letzte API ok | neutrales "Live aktiv" Badge |
| `stale` | WS nicht sicher verbunden ODER letzte Sensoraktualisierung > Schwellwert | gelbes Banner: "Live unvollstaendig, Snapshot aktiv" |
| `reconnecting` | WS Status `connecting` nach vorherigem `connected` | gelbes Banner mit Progress/Retry-Hinweis |
| `degraded_api` | `zoneMonitorError` oder Detail-API-Fehler | rotes Banner mit Retry-Aktion und Scope-Hinweis |
| `disconnected` | WS Status `error`/`disconnected` ueber Max-Reconnect hinaus | rotes Banner: "Keine Live-Daten, nur letzter Stand" |

### 3.2 Handlungsorientierte UX-Regeln

1. L2/L3 zeigen immer einen globalen Connectivity-Status, nicht nur card-lokale Stale-Badges.  
2. Jede Karte traegt explizit ihren Datenmodus (`Live`, `Snapshot`, `Hybrid`) sichtbar im Header/Tooltip.  
3. Bei `degraded_api` wird der aktive Fallbackpfad benannt (z. B. "Subzone-Fallback ohne Monitor-API").  
4. Bei `disconnected` werden Aktor-Karten als "Status ggf. veraltet" markiert, nicht nur Sensoren.  

## 4) Recovery-Triggerkatalog (wann refetch, wann nur delta)

### 4.1 Delta-only (kein Voll-Refetch)

| Trigger | Aktion |
|---|---|
| `sensor_data` / `sensor_health` fuer sichtbare Zone | nur Store-Patch, L2-Sensoren ueber Live-Overlay aktualisieren |
| `esp_health` heartbeat bei stabiler Verbindung | nur Freshness/Status aktualisieren |
| L3 geoeffnet, nur Livewert-Aenderung | nur `detailLiveValue` aktualisieren, Zeitreihe unveraendert |

### 4.2 Refetch erforderlich

| Trigger | Refetch |
|---|---|
| WS reconnect nach Unterbruch | `espStore.fetchAll()` **plus** `fetchZoneMonitorData()` fuer aktive Zone |
| Wechsel `zoneId` | `fetchZoneMonitorData()` (bereits vorhanden) |
| L3 Zeitraumwechsel | `fetchDetailData()` + Overlay-Serien neu laden (bereits vorhanden) |
| API-Fehler -> Recovery erfolgreich | erneuter primarer API-Load, Fallback deaktivieren |
| Ereignisse mit Strukturwirkung (Subzone-/Context-Aenderung) | fuer aktive L2-Zone gezielter Refetch, nicht nur delta |

## 5) Nachweis-Tabelle `Komponente -> Datenmodus -> Risiko bei Ausfall -> Sollanzeige`

| Komponente | Datenmodus | Risiko bei Ausfall | Sollanzeige |
|---|---|---|---|
| L1 `ZoneTileCard` | hybrid | KPI driftet bei WS-Abbruch zeitverzoegert, aber bleibt scheinbar "gesund" | globales Monitor-Banner + Tile-Badge "Snapshot" |
| L2 `SensorCard` | hybrid/live-lastig | bei WS-Ausfall stale/offline je Sensor, aber ohne globalen Kontext | card-badge + globales Banner "Live unvollstaendig" |
| L2 `ActuatorCard` | snapshot-lastig | alter Aktorzustand bleibt stehen, Operator glaubt an Echtzeit | card-badge "Snapshot Stand" + Warnhinweis bei WS down |
| L2 Expanded-Chart | snapshot-on-demand | wirkt "aktuell", obwohl nur letzter API-Zeitfensterstand | Zeitstempel "zuletzt geladen" + Refresh-CTA |
| L3 Detail-Zeitreihe | snapshot + live marker | Ursache/Lage vermischbar, wenn Livewert und Historie nicht klar getrennt sind | getrennte Label "Live jetzt" vs "Historie bis ..." |
| L3 Overlay-Sensoren | snapshot-on-demand | Vergleichslinien koennen asynchron altern ohne Hinweis | je Overlay "Stand: <zeit>" und stale Kennzeichnung |

## 6) Belegter Stoerfall mit Nutzerwirkung und Recovery

### Stoerfall S1: WS-Disconnect waehrend L2-Zonenansicht

**Beleg im Codepfad (Ist):**
- L2 baut auf `zoneMonitorData` auf (API Snapshot), Sensoren erhalten Live-Override, Aktoren nicht.  
- WS-Recovery triggert `espStore.fetchAll()` global, aber `fetchZoneMonitorData()` wird nicht automatisch an WS-Reconnect gekoppelt.

**Nutzerwirkung:**
- Sensor-Karten zeigen stale/offline Indikatoren und lassen den Ausfall erahnen.  
- Aktor-Karten koennen gleichzeitig einen alten Zustand zeigen (snapshot-lastig), obwohl sich der reale Zustand geaendert hat.  
- Ergebnis: asymmetrisches Lagebild, erhoehtes Risiko fuer Fehlentscheidungen im Betrieb.

**Recovery (Soll):**
1. Bei WS-Statuswechsel `connected -> reconnecting/disconnected` globales Degradation-Banner aktivieren.  
2. Bei `reconnected`: in Reihenfolge `espStore.fetchAll()` -> aktive `fetchZoneMonitorData()` -> falls L3 offen `fetchDetailData()`.  
3. Nach erfolgreichem Rehydrate Banner auf `connected` zuruecksetzen und "Stand synchronisiert um <zeit>" anzeigen.

## 7) Abgleich mit Akzeptanzkriterien

- Live-/Snapshot-Status je Kernkarte eindeutig: **teilweise erfuellt** (Sensoren klarer als Aktoren, kein globaler Modusindikator).  
- Degradation handlungsorientiert sichtbar: **nicht erfuellt** (kein einheitliches Monitor-Banner fuer WS/API).  
- Recovery ohne unerklaerte Spruenge: **teilweise erfuellt** (Store-Rehydrate vorhanden, aber L2-Snapshot-Rehydrate nicht konsistent gekoppelt).

## 8) Priorisierte Massnahmen (F07-konform, kein Redesign)

1. Monitor-weites Connectivity-/Degradation-Banner auf Basis von `useWebSocket.connectionStatus` + API-Fehlerstatus.  
2. Datenmodus-Label je Kernkarte (`Live`, `Hybrid`, `Snapshot`).  
3. Reconnect-Recovery-Hook fuer aktive Monitorroute: zone/ref detail refetch orchestrieren.  
4. Aktorpfad in L2 von snapshot-lastig auf klaren Hybridvertrag bringen (entweder Live-Overlay oder sichtbarer Snapshot-Status).  

## 9) Umsetzungsstand nach Fix (2026-04-06)

### 9.1 Fixblock-Abnahme

| Fixblock | Status | Umgesetzt in |
|---|---|---|
| 1) Globales Monitor-Connectivity-Banner | erledigt | `MonitorView.vue`, `monitorConnectivity.ts`, `useWebSocket.ts` |
| 2) Datenmodus je Kernkarte (`Live/Hybrid/Snapshot`) | erledigt | `ZoneTileCard.vue`, `SensorCard.vue`, `ActuatorCard.vue`, `MonitorView.vue` |
| 3) Reconnect-Recovery-Orchestrierung (serialisiert + dedup) | erledigt | `MonitorView.vue`, `monitorConnectivity.ts` |
| 4) L2-Aktorvertrag (Hybrid statt Snapshot-only) | erledigt | `MonitorView.vue` (`zoneDeviceGroup` Live-Overlay fuer Aktorfelder) |
| 5) L3 Historie-vs-Live Trennung | erledigt | `MonitorView.vue` (Live jetzt / Historie bis / Stand-Markierung) |

### 9.2 Delta-only vs Refetch (umgesetzter Vertrag)

- Delta-only bleibt fuer laufende WS-Events (`sensor_data`, `esp_health`) im Store-Pfad aktiv.
- Refetch-Orchestrierung bei Reconnect ist jetzt deterministisch: `espStore.fetchAll()` -> aktive `fetchZoneMonitorData()` -> optional `fetchDetailData()`.
- Mehrfachtrigger waehrend laufender Recovery werden dedupliziert (kein paralleler Rehydrate-Drift).

### 9.3 Verifikation

| Check | Ergebnis |
|---|---|
| `npx vitest run tests/unit/composables/monitorConnectivity.test.ts tests/unit/composables/useWebSocket.test.ts` | gruen (64/64) |
| `npx vue-tsc --noEmit` | gruen |
| Lints auf geaenderten Dateien | keine neuen Fehler |

