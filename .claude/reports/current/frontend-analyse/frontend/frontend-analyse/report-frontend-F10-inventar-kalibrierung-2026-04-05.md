# Report F10: Komponenten-Inventar, Wissensbasis, Kalibrierung

Datum: 2026-04-05  
Scope: `El Frontend/src/views/SensorsView.vue`, `El Frontend/src/components/inventory/*`, `El Frontend/src/shared/stores/inventory.store.ts`, `El Frontend/src/api/inventory.ts`, `El Frontend/src/views/CalibrationView.vue`, `El Frontend/src/components/calibration/*`, `El Frontend/src/api/calibration.ts`, `El Frontend/src/router/index.ts`, `El Frontend/src/views/HardwareView.vue`, `El Frontend/src/shared/design/layout/Sidebar.vue`

## 1) Executive Result

- Die Rollenabgrenzung ist im Code klar und mehrfach belegt: `/sensors` ist Inventar/Wissensbasis, Konfigurationspanels liegen in `/hardware`.
- Inventarfluss ist nachvollziehbar von UI-Aktion ueber Store/API bis zum sichtbaren Ergebnis (Filter, Detail, Schema-Metadaten, Zone-Kontext).
- Kalibrierungsfluss ist als eigener Admin-Pfad umgesetzt und verarbeitet Serverantworten explizit in einen UI-Statusautomaten (`done`/`error`).
- Es gibt 3 priorisierte Risiken im Kalibrierungspfad: Sensorauswahl ohne Typfilter, Auth-Mode-Unschaerfe (API-Key vs. JWT), und schwache Rueckmeldung bei Teilzustand.
- Navigation/Datenaustausch zwischen Inventar, Monitor und Hardware ist durch Deep-Links und Query-Bridge sauber verbunden.

---

## 2) Rollenabgrenzung SensorsView vs. HardwareView (Pflicht 1)

## 2.1 Eindeutige Trennung im SensorsView

- `SensorsView.vue` dokumentiert selbst: keine `SensorConfigPanel`/`ActuatorConfigPanel`, volle Konfiguration nur in `HardwareView`.
- Technisch wird in `/sensors` nur `InventoryTable` + `DeviceDetailPanel` in einem `SlideOver` geladen.
- Kein Import von `SensorConfigPanel.vue` oder `ActuatorConfigPanel.vue` in `SensorsView.vue`.

## 2.2 Konfiguration lebt in HardwareView

- `HardwareView.vue` importiert und rendert `SensorConfigPanel` + `ActuatorConfigPanel` in eigenen SlideOvers.
- Query-Bridge `?openSettings=espId` wird in `HardwareView` ausgewertet und oeffnet `ESPSettingsSheet`.
- Deprecated-/Cross-Links aus anderen Bereichen zeigen bewusst auf `/hardware?openSettings=...`.

Bewertung: Rollenabgrenzung ist ohne Restzweifel belegt (fachlich + technisch + Routing).

---

## 3) Inventarfluesse (Pflicht 2)

## 3.1 Suche, Filter, Sortierung, Pagination

Flow:
1. User tippt Suche/waehlt Chips in `SensorsView`.
2. `SensorsView` schreibt in `inventory.store` (`searchQuery`, `typeFilter`, `statusFilter`, `scopeFilter`, `zoneFilter`, `currentPage`).
3. `inventory.store` berechnet `filteredComponents` -> `sortedComponents` -> `paginatedComponents`.
4. `InventoryTable` rendert `store.paginatedComponents`.

Sichtbares Ergebnis:
- Tabellenzeilen aendern sich sofort.
- Summary-Bar zeigt `totalCount` und "(gefiltert aus X)".
- Pagination/Sortierung greifen auf denselben Datenstrom.

## 3.2 Detailfluss (Inventar -> Detailpanel)

Flow:
1. Klick auf Tabellenzeile in `InventoryTable` emittiert `select`.
2. `SensorsView.handleSelect()` ruft `store.openDetail(item.id)`.
3. `SlideOver` oeffnet mit `DeviceDetailPanel`.

Sichtbares Ergebnis:
- Detailpanel zeigt Status, Wert, Zone, ESP, GPIO, Last Seen.
- Bereich "Verknuepfte Regeln" und "Zone-Kontext" wird kontextsensitiv eingeblendet.

## 3.3 Metadatenfluss (Schema-basiert)

Flow:
1. User aendert Feld in `SchemaForm`.
2. `DeviceDetailPanel` markiert `isSchemaDirty`.
3. Save ruft `sensorsApi.createOrUpdate(...)` oder `actuatorsApi.createOrUpdate(...)`.
4. Bei Erfolg: `isSchemaDirty=false`, Success-Toast.

Sichtbares Ergebnis:
- "Speichern"-Leiste verschwindet nach Erfolg.
- Feldwerte bleiben im Panel als aktueller Stand.

## 3.4 Kontextfluss (Zone-Kontext)

Flow:
1. `ZoneContextEditor` laedt ueber `inventoryApi.getZoneContext(zoneId)`.
2. User editiert Form und klickt Speichern.
3. `inventoryApi.upsertZoneContext(zoneId, form)` wird ausgefuehrt.
4. Antwort wird per `applyData(...)` in Form + KPI-Werte uebernommen.

Sichtbares Ergebnis:
- KPIs wie `plant_age_days`/`days_to_harvest` aktualisieren sich.
- Success-Toast "Zone-Kontext gespeichert".
- Zyklusarchivierung (`archiveCycle`) laedt den Kontext neu und zeigt archivierten Zustand.

---

## 4) Kalibrierungsablauf, Rechte, Rueckmeldelogik (Pflicht 3)

## 4.1 Ablauf (State Machine)

`CalibrationWizard` nutzt Phasen:
- `select` -> `point1` -> `point2` -> `confirm` -> `done`/`error`.

Prozess:
1. Sensorart/ESP/GPIO auswaehlen.
2. Pro Punkt in `CalibrationStep`: Live-Rohwert via `sensorsApi.queryData(...)` lesen + Referenz erfassen.
3. `submitCalibration()` sendet `calibrationApi.calibrate(...)`.
4. Serverantwort steuert UI:
   - `success=true` -> `phase='done'`, Ergebnis wird angezeigt.
   - `success=false` oder Exception -> `phase='error'`, Fehlermeldung wird angezeigt.

## 4.2 Rechte & Zugang

- Route `/calibration` ist `requiresAdmin: true`.
- Navigation Guard blockt Nicht-Admins und leitet auf `hardware` um.
- Sidebar zeigt den Link "Kalibrierung" nur bei `authStore.isAdmin`.

## 4.3 Rueckmeldelogik

- Punktlesen: bei Fehlern `readError` + "Erneut versuchen"-Button.
- Abbruch bei Zwischenstand: Confirm-Dialog ueber `uiStore.confirm`.
- Abschluss: Erfolgsansicht mit Serverpayload (`calibration`) oder Fehleransicht mit `errorMessage`.

---

## 5) Navigation und Datenaustausch Inventar <-> Monitor <-> Hardware (Pflicht 4)

- Inventar -> Hardware: `DeviceDetailPanel.goToConfigPanel()` navigiert zu `/hardware?openSettings={espId}`.
- Hardware verarbeitet `openSettings` und oeffnet `ESPSettingsSheet` (Cross-View Handshake).
- Inventar -> Monitor Zone: `goToMonitor()` zu `monitor-zone`.
- Inventar -> Monitor Sensor: `goToSensorDetail()` zu `monitor-sensor` mit `{espId}-gpio{gpio}`.
- Deep-Link in Inventar: `SensorsView` verarbeitet `?focus=...` und legacy `?sensor=...` und oeffnet direkt das Detailpanel.

Bewertung: Navigation ist bidirektional anschlussfaehig und konsistent mit Router-Definitionen.

---

## 6) Pflichtnachweise

## 6.1 Inventaraktion -> API/Store -> sichtbares Ergebnis

### Nachweis A (Store-basierter Inventarfluss)
- Aktion: Suche/Filter in `SensorsView`.
- Verarbeitung: Store-Pipeline `filteredComponents/sortedComponents/paginatedComponents`.
- Sichtbar: Tabelle + Summary + Pagination reagieren unmittelbar.

### Nachweis B (API-basierter Kontextfluss)
- Aktion: Speichern in `ZoneContextEditor`.
- Verarbeitung: `inventoryApi.upsertZoneContext(...)` -> `applyData(...)`.
- Sichtbar: KPI-/Form-Stand aktualisiert, Success-Toast sichtbar.

## 6.2 Kalibrierungsaktion -> Serverantwort -> Komponentenstatus

- Aktion: "Kalibrierung ausfuehren" in `CalibrationWizard`.
- Verarbeitung: `calibrationApi.calibrate(...)`.
- Sichtbar:
  - Erfolg: `phase='done'`, Erfolgstext + Kalibrierdaten (`calibrationResult`) sichtbar.
  - Fehler: `phase='error'`, Fehlermeldung + Retry/Neu starten.

---

## 7) Priorisierte Risiken (Kalibrierung)

## Hoch: R1 - Sensorauswahl ohne Typfilter

- Beobachtung: Nach Auswahl eines Sensortyps werden in der Device-Liste alle Sensor-GPIOs gezeigt; beim Klick wird der zuvor gewaehlte Typ uebergeben, nicht der echte Sensortyp des GPIO.
- Risiko: Falsche Typ/GPIO-Kombinationen, serverseitige Ablehnung oder ungueltige Kalibrierung.
- Empfehlung: GPIO-Liste auf Sensoren mit passendem `sensor_type` filtern und inkompatible GPIOs deaktivieren.

## Mittel: R2 - Auth-Modus Kalibrierung nicht robust selbsterklaerend

- Beobachtung: `calibrationApi` nutzt bevorzugt `X-API-Key` (`VITE_CALIBRATION_API_KEY`), faellt sonst auf JWT-Client zurueck.
- Risiko: Umgebung ohne API-Key kann trotz Admin-Route in 401/403 laufen; fuer Operator wirkt das wie "Feature defekt".
- Empfehlung: Vor Start explizite Vorpruefung + klare UI-Hinweise, welcher Auth-Modus aktiv ist.

## Mittel: R3 - Teilzustand/Feedback nur lokal, keine Persistenzsicherung

- Beobachtung: Punktwerte und Phase liegen nur in lokalen Refs; Reload/Navigation verliert Zustand.
- Risiko: Bedienabbrueche bei langen Kalibrierablaeufen, erneute Datenerfassung noetig.
- Empfehlung: optionaler Draft-Store (sessionStorage) fuer `phase`, `selected*`, `points`.

---

## 8) Zusatzbefund (Inventar)

- `SubzoneContextEditor.vue` ist im Scope vorhanden, aber aktuell ohne Referenz in anderen Frontend-Dateien.
- Risiko: Erwartete "Subzone-Kontextaenderung" ist im Inventar-UI derzeit nicht erreichbar (Integrationsluecke zwischen vorhandener Komponente und aktiver Navigation).
- Prioritaet: niedrig bis mittel (Feature-Luecke, kein Laufzeitfehler).

---

## 9) Endbewertung gegen Akzeptanzkriterien

- Rollenabgrenzung ohne Restzweifel: erfuellt.
- Inventarfluesse (Suche, Filter, Detail, Kontext): erfuellt und nachgewiesen.
- Kalibrierungsablauf inkl. Rechte/Rueckmeldung: erfuellt und nachgewiesen.
- Kalibrierungsrisiken priorisiert: erfuellt (1 hoch, 2 mittel).
