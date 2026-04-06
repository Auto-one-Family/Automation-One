# Report F07: Monitor, Live-Ansichten, Historie und Degradation

Datum: 2026-04-05  
Scope: `El Frontend/src/views/MonitorView.vue`, `El Frontend/src/components/monitor/ZoneTileCard.vue`, `El Frontend/src/components/devices/SensorCard.vue`, `El Frontend/src/components/devices/ActuatorCard.vue`, `El Frontend/src/composables/useZoneKPIs.ts`, `El Frontend/src/composables/useZoneGrouping.ts`, `El Frontend/src/api/zones.ts`, `El Frontend/src/services/websocket.ts`, `El Frontend/src/stores/esp.ts`

## 1) Ergebnisbild (IST vs SOLL)

- L1/L2/L3 sind technisch sauber route-basiert umgesetzt und trennen Historie und Livewerte bereits in den Kernpfaden.
- Der Monitor ist aktuell hybrid: REST-Snapshot als Basis, Live-Delta aus WS-getriebenem `espStore`.
- Degradation wird nur punktuell angezeigt (z. B. stale/offline auf Cards), aber nicht als globaler Monitor-Connectivity-Zustand.
- Hauptluecke fuer Operatorvertrauen: Sensorpfad ist live-ueberlagert, Aktorpfad im L2-Primaarpfad snapshot-lastig.

---

## 2) Datenpfad je Ebene (REST-Basis, Live-Overlay, Fallback)

| Ebene | REST-Basis | Live-Overlay | Fallback |
|---|---|---|---|
| L1 `/monitor` | `zonesApi.getAllZones()` (leere Zonen) + initial `espStore.fetchAll()` | `useZoneKPIs` rechnet aus `espStore.devices` (WS-Delta via `sensor_data`, `esp_health`, `actuator_status`) | Ready-Gate (`BaseSkeleton`, `ErrorState`, Empty-CTA) statt stiller Fehler |
| L2 `/monitor/:zoneId` | `zonesApi.getZoneMonitorData(zoneId)` mit `AbortController` | Sensor-Snapshot wird gegen `espStore.devices` ueberlagert (`raw_value`, `quality`, `last_read`); Sparkline ueber `useSparklineCache` live | Bei API-Fehler: `useZoneGrouping + useSubzoneResolver` (lazy aktiviert) |
| L3 `/monitor/:zoneId/sensor/:sensorId` | `sensorsApi.queryData(...)` + `sensorsApi.getStats(...)` | Hero-Livewert kommt aus `detailLiveValue` (Store-gebunden), stale ueber `detailIsStale` | Bei API-Fehler: Detail-Error/No-Data im SlideOver; Overlay-Sensoren fallen einzeln auf leere Serie |

---

## 3) Nachweis-Tabelle: Komponente -> Datenmodus -> Risiko -> Sollanzeige

| Komponente | Datenmodus (IST) | Risiko bei Ausfall | Sollanzeige (degradation-aware) |
|---|---|---|---|
| `ZoneTileCard` (L1) | hybrid (KPI live, Zone-Meta snapshot+API) | WS down: Kacheln wirken stabil, obwohl nur letzter Stand | Global-Banner `Live getrennt`, Tile-Footer markiert `Nur Snapshot` |
| L1 Active Automations | snapshot-lastig (Rules via Store/API, nicht Eventstream-zentriert) | Rule-Zustand kann veraltet sein | Badge `Regelstatus ggf. verzoegert` bei WS != connected |
| L2 Header/KPIs | hybrid | Bei API-Fehler + WS down unklare Frische | Header-Badge `connected/stale/reconnecting` |
| `SensorCard` (L2) | live (API-Basis + Store-Overlay) | Bei WS down nur letzter Sensorwert; stale sichtbar | Beibehalten, aber zusaetzlich globaler Verbindungszustand |
| `LiveLineChart` Sparkline | hybrid (initial query + live points) | WS down: Kurve friert ein | Inline-Hinweis `Live pausiert`, kein harter Fehler |
| `ActuatorCard` (L2) | snapshot/hybrid (im API-Primaarpfad keine explizite Live-Overlay-Merge) | Bediener kann alten Aktorzustand fuer aktuell halten | Pflichtlabel `Snapshot`, bis Live-Overlay fuer Aktoren implementiert |
| `ZoneRulesSection` | snapshot-lastig | Ausfuehrungszustand kann driften | Statusleiste `zuletzt synchronisiert vor X` |
| L3 Hero-Wert | live (Store) | WS down: Wert bleibt stehen, stale-Badge hilft lokal | zusaetzlich globales Banner fuer Kontext |
| L3 Historienchart | snapshot (zeitraumbezogene API-Historie) | API down: kein Verlauf | Explizit `Historie nicht ladbar`, Livewert weiter anzeigen |

---

## 4) Degradation-UX Vertrag (SOLL)

### 4.1 Einheitliche Zustandslogik

Monitorweit (L1/L2/L3) soll ein einheitlicher Zustand aus zwei Signalen gebildet werden:

1. **Connectivity:** `websocketService.onStatusChange()` (`connected`, `connecting`, `disconnected`, `error`).
2. **Data Freshness:** Stale-Logik aus vorhandenen Zeitstempeln (`isZoneStale`, `detailIsStale`, Card-stale).

### 4.2 Sichtbare Zustaende

| Zustand | Trigger | Banner-Text | Operator-Handlung |
|---|---|---|---|
| connected | WS `connected` und keine kritische API-Fehlerlage | `Live verbunden` | normal arbeiten |
| reconnecting | WS `connecting` oder reconnect backoff aktiv | `Verbindung wird wiederhergestellt...` | warten, keine kritischen Schaltentscheidungen |
| stale | WS nicht connected **oder** zentrale Daten stale | `Live pausiert - letzte Werte von vor X` | Lagebild nur als Tendenz nutzen |
| degraded-api | L2/L3 REST-Fehler aktiv | `Historie/Snapshot nicht ladbar` | Retry/Zonewechsel anbieten |

### 4.3 Harte UX-Regel

- Keine stillen Degradationen in kritischen Monitorzustaenden.
- Jede Ebene zeigt **entweder** frischen Livezustand **oder** explizit den eingeschraenkten Modus.

---

## 5) Recovery-Triggerkatalog (wann refetch, wann nur delta)

| Trigger | Aktion | Klasse |
|---|---|---|
| WS `sensor_data`, `esp_health`, `actuator_status` | Nur Store-Delta (`espStore.devices`), kein Full-Refetch | delta-only |
| `selectedZoneId` wechselt | `fetchZoneMonitorData()` + Abort alter Requests | refetch |
| L2 API-Fehler (`zoneMonitorError`) | Fallback aktivieren (`subzoneResolver.buildResolver()`), Retry anbieten | fallback+refetch |
| L3 Zeitraumwechsel | `fetchDetailData()` + Overlay-Requery | refetch |
| WS reconnect erfolgreich (`websocketService.onConnect`) | `espStore.fetchAll()` (bereits implementiert) | global refetch |
| WS reconnect erfolgreich waehrend L2 offen (SOLL) | zusaetzlich `fetchZoneMonitorData()` fuer aktuelle Zone | targeted refetch |
| Manueller Retry in ErrorState | erneuter REST-Fetch der betroffenen Ebene | manual refetch |

Entscheidungsregel:
- **Delta-only**, wenn Ereignis eindeutig eine Teilmenge beschreibt (z. B. einzelner Sensorwert).
- **Refetch**, wenn Kontext, Konsistenzgrenze oder Vollbild-Snapshot betroffen ist (Zonewechsel, Reconnect, API-Fehler).

---

## 6) Belegter Stoerfall mit Nutzerwirkung und Recovery

### Stoerfall: WS-Disconnect in L2 waehrend laufendem Betrieb

1. Operator ist auf `/monitor/:zoneId` und beobachtet Sensor- und Aktorkarten.  
2. WS bricht weg (`disconnected`/`error`), aber im Monitor fehlt ein globales Connectivity-Banner.  
3. Sensoren zeigen nach kurzer Zeit stale/offline-Signale; Aktoren bleiben im API-Bild snapshot-lastig.  
4. Nutzerwirkung: Hohe Verwechslungsgefahr zwischen "Aktor ist noch EIN" und "Aktorzustand ist nur letzter Snapshot".  

Aktuelle Recovery (IST):
- Beim erfolgreichen Reconnect triggert `espStore` ueber `websocketService.onConnect()` ein `fetchAll()`.

Offene Recovery-Luecke:
- Fuer L2 fehlt danach ein automatischer `getZoneMonitorData`-Refetch; dadurch kann der zusammengefuehrte Zonensnapshot zeitweise hinterherlaufen.

SOLL-Recovery:
- Nach `onConnect` bei aktiver L2-Route: `fetchZoneMonitorData()` fuer `selectedZoneId` erzwingen.
- Bis zur Synchronisierung sichtbares Banner `Rekonziliation laeuft`.

---

## 7) Akzeptanzkriterien-Abgleich

- Live-/Snapshot-Status je Kernkarte ist eindeutig benannt: **erfuellt** (Tabelle Abschnitt 3).
- Degradation wird handlungsorientiert sichtbar beschrieben: **erfuellt** (Abschnitt 4).
- Recovery ohne stillen Zustandsdrift ist als Triggerkatalog definiert: **erfuellt** (Abschnitt 5), mit klar benannter IST-Luecke (Abschnitt 6).

---

## 8) Test-/Nachweisplan fuer F07

### E2E (Monitor WS disconnect/reconnect)

1. L2 Monitor oeffnen, Sensor- und Aktorkarten sichtbar.
2. WS-Verbindung trennen.
3. Erwartung: Banner `Live pausiert`, Sensor stale sichtbar, Aktoren klar als Snapshot markiert.
4. WS wiederherstellen.
5. Erwartung: `fetchAll()` + L2-Refetch, Banner verschwindet erst nach erfolgreicher Rekonziliation.

### Integration (Zonewechsel unter Last ohne stale leakage)

1. Hohe `sensor_data`-Rate auf zwei Zonen.
2. Schnelles Umschalten L2 Zone A <-> Zone B.
3. Erwartung: keine Mischdaten dank AbortController, keine stale leakage aus vorheriger Zone.
4. Bei simuliertem API-Fehler: Fallbackpfad greift sichtbar, kein stiller leerer Screen.

