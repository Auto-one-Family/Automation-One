# Auftrag F03: Pinia State Ownership und Kopplungen

> **Typ:** Analyseauftrag  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend / F03  
> **Prioritaet:** P1

## Relevantes Wissen (kompakt und verbindlich)
- Pinia ist nicht nur State-Ablage, sondern Realtime-Orchestrator ueber mehrere Stores.
- `esp.store` ist zentraler Dispatcher und hoher Kopplungspunkt.
- Cross-Store-Writes (z. B. `zone -> esp`, `alert-center -> notification-inbox`) sind wartungs- und fehlerkritisch.
- Bei Realtime-Last entscheidet Ownership-Klarheit ueber Konsistenz und Diagnosefaehigkeit.

## IST-Befund
- Mehrere Writer auf Kernentities sind vorhanden.
- `fetchAll()` wird teils als Sicherheitsnetz genutzt, statt sauberer Delta-Semantik.
- Dual-Source-Pfade (z. B. dashboard local + server) erzeugen Driftpotenzial.

## SOLL-Zustand
- Pro Kernentity genau ein Write-Owner, andere Stores lesen/derivieren nur.
- Erlaubte Inter-Store-Schreibpfade sind explizit dokumentiert.
- Realtime- und REST-Pfade folgen einer klaren Merge-/Replace-Strategie je Entity.

## Analyseauftrag
1. Ownership-Matrix finalisieren: `Entity -> Owner Store -> erlaubte Fremdschreiber`.
2. Alle Cross-Store-Writes klassifizieren: legitim, technisch noetig, oder zu entkoppeln.
3. Mutationstyp pro Event dokumentieren: `replace`, `patch`, `refresh`.
4. Refactor-Backlog mit kleinem Risiko je Entity schneiden.

## [Korrektur] Verifizierter Ausfuehrungsrahmen (IST gegen Codebase)
- **Primaerer Agent:** `frontend-debug` (Analysefokus; keine ungefragten Code-Aenderungen).
- **Verbindliche Analyse-Dateien (Ownership/Kopplung):**
  - `El Frontend/src/stores/esp.ts` (zentraler WS-Dispatcher, Cross-Store-Delegation, `fetchAll()`-Refreshpfade)
  - `El Frontend/src/stores/esp-websocket-subscription.ts` (Filter-/Handler-Vertrag fuer Events)
  - `El Frontend/src/shared/stores/zone.store.ts` (Zone/Subzone/Scope/Context-Handler, Device-Write ueber Callback)
  - `El Frontend/src/shared/stores/sensor.store.ts` (Sensor-Teilmutationen in `esp.devices`)
  - `El Frontend/src/shared/stores/actuator.store.ts` (Actuator-Teilmutationen + Intent-Lifecycle)
  - `El Frontend/src/shared/stores/notification-inbox.store.ts` (Inbox SSoT, WS `notification_*`)
  - `El Frontend/src/shared/stores/alert-center.store.ts` (Alert-Lifecycle, aktuell mit Inbox-Schreibpfad)
  - `El Frontend/src/shared/stores/dashboard.store.ts` (Layout-Owner, Local/Server-Merge)
  - `El Frontend/src/shared/stores/deviceContext.store.ts` (granulare Kontext-SSoT zusaetzlich zu `esp.fetchAll()`)
- **Referenzvalidierung (MUSS fuer Aussagen genutzt werden):**
  - `.claude/reference/api/WEBSOCKET_EVENTS.md`
  - `.claude/reference/api/REST_ENDPOINTS.md`
- **Ziel-Output (verbindlich):**
  - `.claude/reports/current/frontend-analyse/report-frontend-F03-pinia-state-ownership-2026-04-05.md`
  - Falls schon vorhanden: inhaltlich aktualisieren, keinen neuen Unterordnerpfad erfinden.

## [Korrektur] Arbeitsreihenfolge fuer den Agent
1. Owner-Baseline aus Store-Code extrahieren: pro Entity (`device`, `sensor-state`, `actuator-state`, `notification`, `dashboard`) genau einen Write-Owner benennen.
2. `esp.ts` Event-zu-Handler-Kette vollstaendig mappen (`ws.on(...) -> delegierter Store`), danach Mutationstyp je Event klassifizieren (`replace|patch|refresh`).
3. Alle Fremdschreibpfade markieren:
   - technisch legitim (z. B. Dispatcher-Delegation),
   - technisch noetig aber mittelfristig zu entkoppeln (z. B. fremdes Array mutieren),
   - Soll-Verletzung (direkte Writes ueber Store-Grenzen ohne explizite Write-API).
4. `fetchAll()`-Nutzungen in WS-/Composable-Pfaden als Konsistenznetz dokumentieren und je Fall Risiko sowie Delta-Alternative notieren.
5. Dual-Source-Stellen explizit benennen (z. B. `dashboard` localStorage + Server-Sync; Context in `deviceContext` plus globales Device-Refresh).
6. Testabdeckung gegen IST pruefen: vorhandene Unit-Tests (`esp`, `dashboard`, `intent/logic`) und fehlende Store-Tests (`zone`, `sensor`, `actuator`, `notification-inbox`, `alert-center`) als Luecken ausweisen.

## [Korrektur] Output-Vertrag (MUSS im Report enthalten sein)
- Tabelle `Ownership Matrix`: `Entity -> Owner -> erlaubte Fremdschreiber -> verbotene Fremdschreiber`.
- Tabelle `Store Matrix`: `Store -> SSoT|Derived|Transient -> Seiteneffekt -> Risiko`.
- Tabelle `Mutation Contract`: `Event/REST-Pfad -> replace|patch|refresh -> aktuell implementierter Pfad`.
- Abschnitt `Kettennachweis` mit mindestens je einem nachvollziehbaren Fluss fuer:
  - Device (`REST /esp/devices -> esp`)
  - Sensor (`WS sensor_data -> esp -> sensor -> UI`)
  - Actuator (`WS actuator_status -> esp -> actuator -> UI`)
  - Notification (`WS notification_* -> esp -> notification-inbox/alert-center -> UI`)
  - Dashboard (`REST /dashboards -> dashboard -> UI`)
- Abschnitt `Verbotene Seitenschreibpfade` (konkret benennen, nicht abstrakt).
- Abschnitt `Refactor-Backlog` in kleinen Paketen (low risk -> medium risk), je Paket mit Testhinweis.
- Abschnitt `Test-Gaps` mit konkreten Ziel-Dateipfaden unter `El Frontend/tests/unit/stores/`.

## Scope
- **In Scope:** Stores, Realtime-Dispatcher, Cross-Store-Kommunikation, Persistenzgrenzen.
- **Out of Scope:** komplette Re-Architektur in einem Schritt.

## Nachweise
- Tabelle `Store -> SSoT|Derived|Transient -> Seiteneffekt -> Risiko`.
- Kette je kritischem Event: `WS/REST -> Store -> UI`.

## Akzeptanzkriterien
- Fuer Device, Sensor, Actuator, Notification, Dashboard ist Ownership eindeutig.
- Verbotene Seitenschreibpfade sind benannt.
- Refactor-Plan ist in kleine, testbare Pakete zerlegt.

## Tests/Nachweise
- Unit: Mutationstests pro Owner-Store.
- Integration: Realtime-Deltas ohne Voll-Refresh fuer definierte Kernfaelle.
