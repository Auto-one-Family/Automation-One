# Report F10: Inventar, Wissensbasis und Kalibrierung

Datum: 2026-04-05  
Scope: `El Frontend/src/views/SensorsView.vue`, `El Frontend/src/components/inventory/*`, `El Frontend/src/shared/stores/inventory.store.ts`, `El Frontend/src/api/inventory.ts`, `El Frontend/src/views/CalibrationView.vue`, `El Frontend/src/components/calibration/*`, `El Frontend/src/api/calibration.ts`, `El Frontend/src/router/index.ts`, `El Frontend/src/views/HardwareView.vue`, `El Frontend/src/shared/design/layout/Sidebar.vue`, `El Frontend/src/shared/design/layout/AppShell.vue`, `El Frontend/src/api/subzones.ts`

## 1) Ergebnisbild

- `/sensors` ist sauber als Inventar-/Wissensbereich umgesetzt; tiefe Geraetekonfiguration bleibt in `/hardware`.
- Inventarfluesse sind Ende-zu-Ende nachvollziehbar (Filter/Detail/Metadaten/Kontext), inklusive Deep-Link-Einstiegen.
- Kalibrierung ist ein eigener Admin-Flow mit expliziter State-Machine (`select`, `point1`, `point2`, `confirm`, `done`, `error`).
- Hauptluecken fuer SOLL: untypisierte Sensorauswahl im Kalibrierpfad, keine UI-Sichtbarkeit des aktiven Auth-Modus (JWT vs API-Key), kein Draft/Resume-Konzept.
- Abbruch-/Wiederaufnahmeverhalten ist funktional teilweise vorhanden (Abort-Confirm), aber nicht zustandserhaltend und damit nur eingeschraenkt testbar.

---

## 2) Rollenbeleg SensorsView vs. HardwareView

## 2.1 SensorsView ohne ConfigPanel (Pflichtnachweis)

- `SensorsView.vue` dokumentiert explizit im Headerkommentar: keine `SensorConfigPanel`/`ActuatorConfigPanel` in dieser View.
- Implementiert sind nur Inventarbausteine: `InventoryTable`, `DeviceDetailPanel`, `SlideOver`.
- Konfigurationszugriff erfolgt indirekt ueber Link "Vollstaendige Konfiguration" im Detailpanel (Routing auf Hardware).

## 2.2 HardwareView mit ConfigPanel (Pflichtnachweis)

- `HardwareView.vue` importiert `SensorConfigPanel`, `ActuatorConfigPanel`, `ESPConfigPanel`.
- `HardwareView.vue` rendert diese Panels in SlideOvers und verarbeitet `?openSettings=...` fuer den Einstieg in `ESPSettingsSheet`.
- Damit ist die fachliche Trennung "Inventar vs. Konfiguration" sowohl in der Komponentengrenze als auch im Routing umgesetzt.

Bewertung: Rollenabgrenzung ist ohne Restzweifel belegt.

---

## 3) Inventar E2E inkl. Deep-Link-Rueckwege

## 3.1 E2E-Fluesse im Inventar

### Flow A: Suche/Filter/Sort/Pagination
1. Aktion in `SensorsView` (Search, Type-, Status-, Scope-, Zone-Filter).  
2. Persistenz/State: `inventory.store` (`searchQuery`, `typeFilter`, `statusFilter`, `scopeFilter`, `zoneFilter`, `currentPage`).  
3. Datenpipeline: `allComponents` -> `filteredComponents` -> `sortedComponents` -> `paginatedComponents`.  
4. Ergebnis: `InventoryTable` + Summary-Bar aktualisieren sofort.

### Flow B: Inventar-Detail
1. Klick auf Tabellenzeile (`InventoryTable` emit `select`).  
2. `SensorsView.handleSelect()` -> `store.openDetail(item.id)`.  
3. `SlideOver` oeffnet `DeviceDetailPanel` mit aktueller Entitaet.

### Flow C: Typspezifische Metadaten
1. Feldedit in `SchemaForm`.  
2. `DeviceDetailPanel` markiert `isSchemaDirty`.  
3. Save via `sensorsApi.createOrUpdate(...)` oder `actuatorsApi.createOrUpdate(...)`.  
4. Ergebnis: Toast + Dirty-State zurueckgesetzt, Werte bleiben konsistent sichtbar.

### Flow D: Zone-Kontext
1. Laden via `inventoryApi.getZoneContext(zoneId)`.  
2. Edit und Speichern via `inventoryApi.upsertZoneContext(zoneId, form)`.  
3. Rueckfuehrung via `applyData(...)` (inkl. KPI-Werte).  
4. Ergebnis: aktualisierte KPI-Anzeige und konsistente Formularwerte.

## 3.2 Deep-Link-Einstiege und Rueckwege

| Einstieg | Ziel | Transport | Rueckwegstatus |
|---|---|---|---|
| `/sensors?focus={id}` | Inventar-Detail offen | Query in `SensorsView` -> `store.openDetail` | Rueckweg implizit ueber Browser-History |
| `/sensors?sensor={esp}-gpio{gpio}` (legacy) | Inventar-Detail offen | Legacy-Mapping auf syntheticId | Rueckweg implizit ueber Browser-History |
| Inventar-Detail -> "Vollstaendige Konfiguration" | `/hardware?openSettings={espId}` | `DeviceDetailPanel.goToConfigPanel()` | **Kein expliziter Back-Parameter** (nur History) |
| Inventar-Detail -> "Zone im Monitor" | `monitor-zone` | `router.push({ name: 'monitor-zone' })` | Rueckweg implizit ueber History |
| Inventar-Detail -> "Live-Daten im Monitor" | `monitor-sensor` | `{ zoneId, sensorId }` | Rueckweg implizit ueber History |

Bewertung Deep-Link-Rueckwege:
- Einstiege sind klar und robust.
- Explizite Ruecksprunglogik (z. B. `returnTo=/sensors?...`) fehlt; aktuell ist der Rueckweg history-abhaengig.

---

## 4) Kalibrierungs-State-Machine und Fehlerzweige

## 4.1 Zustandsmodell

State-Machine in `CalibrationWizard.vue`:
- `select` -> `point1` -> `point2` -> `confirm` -> (`done` oder `error`)
- Quersprung: `handleAbort()` aus `point1`/`point2`/`confirm` zurueck auf `select` (mit Confirm nur wenn schon Punkte erfasst wurden)
- Fehlerpfad: Exception oder `response.success=false` fuehrt nach `error`

## 4.2 Tabelle: Kalibrierungsschritt -> Validierung -> Fehlerausgabe -> Recovery

| Kalibrierungsschritt | Validierung / Guard | Fehlerausgabe | Recovery |
|---|---|---|---|
| `select`: Sensortyp waehlen | nur UI-Auswahl, kein Backend-Check | keine | Auswahl aendern |
| `select`: GPIO waehlen | **keine Typ/GPIO-Kompatibilitaetspruefung**; alle Sensor-GPIOs werden angeboten | indirekt spaeter im Fehlerstatus | Neustart oder anderer GPIO |
| `point1`/`point2`: Rohwert lesen (`CalibrationStep.readCurrentValue`) | API `sensorsApi.queryData` muss Reading liefern | `readError` ("Kein aktueller Messwert..." / "Fehler beim Lesen...") | Button "Erneut versuchen" |
| `point1`/`point2`: Punkt uebernehmen | `rawValue !== null`, `referenceValue !== undefined` | keine dedizierte Fehlermeldung, Button bleibt disabled | Rohwert lesen / Referenz setzen |
| `confirm`: Ausfuehren (`submitCalibration`) | Guard: `selectedGpio !== null` und `points.length >= 2` | bei API-Fehler `errorMessage`, Phase `error` | "Zurueck" zu `confirm` oder "Neu starten" |
| `done` | `response.success === true` | keine | "Weitere Kalibrierung" (`reset`) |
| `error` | `response.success === false` oder Exception | Fehlertext im Error-State | `phase='confirm'` oder kompletter `reset()` |

## 4.3 Auth-Strategie-Sichtbarkeit (Sollabgleich)

Ist:
- Route ist admin-geschuetzt (`requiresAdmin`), Sidebar-Link nur fuer Admin.
- API-Pfad nutzt in `calibrationApi` zwei Strategien:
  - bevorzugt `X-API-Key` bei `VITE_CALIBRATION_API_KEY`
  - fallback auf JWT-Client

Luecke:
- Aktive Auth-Strategie wird vor Start nicht sichtbar gemacht.
- Bei Fallback-Fehlschlag wirkt Fehler fuer Nutzer wie fachlicher Kalibrierfehler statt Auth-/Konfigproblem.

---

## 5) Typ/GPIO-Regelpruefung fuer Sensorauswahl

Ist-Befund:
- In `CalibrationWizard` wird nach Sensortypauswahl (`selectedSensorType`) die GPIO-Liste pro Device aus `device.sensors` ungefiltert gerendert.
- Beim Klick auf einen GPIO-Chip wird der gewaehlte Typ (`selectedSensorType`) uebergeben, nicht der echte Typ des konkreten Sensorobjekts.

Konsequenz:
- Ungetypte Auswahl moeglich (z. B. EC-Typ auf GPIO eines pH-Sensors).
- Fehler wird erst spaet beim Submit sichtbar (Serverantwort), nicht vorab im Auswahlschritt.

Bewertung gegen Akzeptanzkriterium "Keine untypisierte Sensorauswahl":
- **Nicht erfuellt.**

Empfohlene Schliessung:
1. Pro Device nur Sensoren mit passendem `sensor_type` listen.
2. Bei gemischten Multi-Value-Sensoren (falls relevant) explizite Typanzeige am Chip.
3. Submit-Guard: Typ/GPIO-Mapping gegen lokale Device-Daten validieren.

---

## 6) Draft-/Resume-Konzept (sessionStorage) Bewertung

Ist:
- Kalibrierungszustand liegt nur in lokalen `ref`s (`phase`, `selected*`, `points`, `ecPreset`, `calibrationResult`).
- `CalibrationView` ist nicht im `keep-alive`-Include von `AppShell`; Routewechsel/Reload verliert Zustand.
- Es gibt keine sessionStorage-Persistenz fuer den Wizard.

Abbruch/Resume aktuell:
- Abbruch mit Confirm-Dialog vorhanden.
- Resume nach Reload/Navigation nicht vorhanden.

Vorschlag fuer testbares Draft/Resume:
- Session-Key: `ao-calibration-draft:v1`
- Persistierte Felder: `phase`, `selectedEspId`, `selectedGpio`, `selectedSensorType`, `ecPreset`, `points`, `ts`.
- Write-Trigger: bei jeder relevanten Statusaenderung (debounced).
- Restore-Regeln:
  - nur wenn Draft juenger als z. B. 2h
  - nur wenn `selectedEspId` weiterhin in `espStore.devices` vorhanden
  - sonst Draft verwerfen und Hinweis anzeigen.
- Clear-Regeln:
  - bei `done` nach Erfolg
  - bei explizitem "Neu starten"
  - bei Logout.

Bewertung gegen Akzeptanzkriterium "Abbruch-/Wiederaufnahmeverhalten definiert und testbar":
- **Teilweise erfuellt** (Abbruch ja, Wiederaufnahme nein).

---

## 7) Priorisierte Risiken (SOLL-Fokus)

## P1: Untypisierte Sensorauswahl im Kalibrierpfad
- Auswirkung: falsche Kalibrierversuche, vermeidbare Fehlerzyklen.
- Prioritaet: hoch (direkt auf Akzeptanzkriterium).

## P1: Fehlende Auth-Mode-Sichtbarkeit vor Start
- Auswirkung: Operator kann Ursache (Auth-Konfiguration vs Sensorproblem) schlecht unterscheiden.
- Prioritaet: hoch (SOLL fordert klare Sichtbarkeit).

## P2: Kein persistenter Draft/Resume-Mechanismus
- Auswirkung: Teilzustandsverlust bei Reload/Navigation.
- Prioritaet: mittel (Nutzbarkeit/Robustheit, keine Datenkorruption).

## P2: Deep-Link-Rueckwege ohne expliziten Return-Kontext
- Auswirkung: Ruecknavigation history-abhaengig statt deterministisch.
- Prioritaet: mittel.

---

## 8) Akzeptanzkriterien-Check

- Keine untypisierte Sensorauswahl im Kalibrierpfad: **nicht erfuellt** (P1).
- Auth-Mode ist vor Start der Kalibrierung sichtbar: **nicht erfuellt** (P1).
- Abbruch-/Wiederaufnahmeverhalten ist definiert und testbar: **teilweise erfuellt** (Abort ja, Resume nein).

Gesamtstatus F10:
- Architektur-/Rollenabgrenzung: stark.
- Inventarfluss: stark.
- Kalibrierrobustheit gegen SOLL: noch gezielte Nacharbeit notwendig (P1/P2).
