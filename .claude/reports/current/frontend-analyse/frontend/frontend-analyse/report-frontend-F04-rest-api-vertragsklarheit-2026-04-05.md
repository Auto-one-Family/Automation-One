# Report F04: REST-API-Vertragsklarheit (Frontend)

Datum: 2026-04-05  
Scope: `El Frontend/src/api/*.ts`, `El Frontend/src/api/index.ts`, `El Frontend/src/api/parseApiError.ts`, `El Frontend/src/utils/errorCodeTranslator.ts`

## 1) Modulkarte der API-Schicht nach Ressource und Wirkung

### 1.1 Kern-Infrastruktur

- `api/index.ts`
  - Wirkung: zentrale Axios-Instanz (`/api/v1`), JWT-Injektion, `X-Request-ID`, 401-Refresh-Retry mit Queue.
  - Schreibwirkung: indirekt fuer alle POST/PUT/PATCH/DELETE-Operationen.
  - Fehlervertrag: 401 wird nur fuer nicht-auth Endpunkte einmal retried, sonst Fehler-Reject; 403 wird nicht speziell behandelt.
- `api/parseApiError.ts`
  - Wirkung: strukturiertes Parsing (`numeric_code`, `request_id`, Fallback `detail`, Netzwerkfehler).
  - Status in Codebasis: aktuell nicht produktiv verdrahtet (keine Aufrufer gefunden).
- `utils/errorCodeTranslator.ts`
  - Wirkung: UI-Helfer fuer Kategorie/Severity-Labels und Icon-Logik.
  - Hinweis: keine Transport- oder Retry-Logik.
- `api/errors.ts`
  - Wirkung: on-demand Fehlercode-Translation via REST (`/errors/codes/{code}`), In-Memory-Cache.
  - Fehlervertrag: bei API-Fehlern lokaler Fallback-Text statt Throw.

### 1.2 Auth, Session, Nutzer

- `api/auth.ts`
  - Lesen: `getStatus`, `me`
  - Schreiben: `login`, `setup`, `refresh`, `logout`
  - Wirkung: Session-Aufbau/Erneuerung.
- `api/users.ts`
  - Schreiben: `createUser`, `updateUser`, `deleteUser`, `resetPassword`, `changeOwnPassword`
  - Wirkung: Benutzerverwaltung.

### 1.3 Geraete, Sensoren, Aktoren, Zonen

- `api/esp.ts`
  - Schreiben: `createDevice`, `updateDevice`, `deleteDevice`, `approveDevice`, `rejectDevice`, `updateAlertConfig`
  - Wirkung: Device-Lifecycle, Discovery-Freigabe, Device-weite Alert-Config.
  - Speziell: Mock/Real-Routing und Orphan-Recovery-Pfade.
- `api/sensors.ts`
  - Schreiben: `createOrUpdate`, `delete`, `triggerMeasurement`, `updateAlertConfig`, `updateRuntime`, `oneWireApi.scanBus`
  - Wirkung: Sensor-Konfiguration, Mess-Trigger, Runtime/Alerts.
- `api/actuators.ts`
  - Schreiben: `createOrUpdate`, `delete`, `sendCommand`, `emergencyStop`, `clearEmergency`, `updateAlertConfig`, `updateRuntime`
  - Wirkung: Aktor-Lifecycle + Live-Befehle.
  - Vertragsrelevant: `sendCommand` liefert `correlation_id` (Bruecke zu WS-Terminalevents).
- `api/zones.ts`
  - Schreiben: `assignZone`, `removeZone`, `createZoneEntity`, `updateZoneEntity`, `archiveZoneEntity`, `reactivateZoneEntity`, `deleteZoneEntity`
  - Wirkung: Zone-Bindung (MQTT-Bridge) + ZoneEntity-CRUD.
- `api/subzones.ts`
  - Schreiben: `assignSubzone`, `removeSubzone`, `enableSafeMode`, `disableSafeMode`, `updateMetadata`
  - Wirkung: Subzone-Mapping + Safe-Mode.
- `api/device-context.ts`
  - Schreiben: `setContext`, `clearContext`
  - Wirkung: aktive Zone/Subzone fuer mobile/multi-zone Konfigurationen.
- `api/inventory.ts`
  - Schreiben: `upsertZoneContext`, `patchZoneContext`, `archiveCycle`
  - Wirkung: fachlicher Zone-Kontext (Wissensdatenbank).
- `api/intentOutcomes.ts`
  - Lesen: Outcome-Historie und Detail (keine Schreibpfade).

### 1.4 Automation, Dashboards, Notifications, Admin

- `api/logic.ts`
  - Schreiben: `createRule`, `updateRule`, `deleteRule`, `toggleRule`, `testRule`
- `api/dashboards.ts`
  - Schreiben: `create`, `update`, `delete`
- `api/notifications.ts`
  - Schreiben: `markRead`, `markAllRead`, `send`, `updatePreferences`, `sendTestEmail`, `acknowledgeAlert`, `resolveAlert`
- `api/plugins.ts`
  - Schreiben: `execute`, `updateConfig`, `enable`, `disable`
- `api/backups.ts`
  - Schreiben: `createBackup`, `deleteBackup`, `restoreBackup`, `cleanupBackups`
- `api/diagnostics.ts`
  - Schreiben: `runFullDiagnostic`, `runSingleCheck`, `exportReportAsMarkdown`
- `api/audit.ts`
  - Schreiben: `updateRetentionConfig`, `runCleanup`, `restoreBackup`, `deleteBackup`, `cleanupExpiredBackups`, `updateBackupRetentionConfig`
- `api/debug.ts`
  - Schreiben: umfangreiche Mock/Debug/Retention/Maintenance-Operationen
- `api/config.ts`
  - Schreiben: `updateConfig`
- `api/database.ts`
  - Lesen (keine Schreibpfade)
- `api/health.ts`
  - Lesen
- `api/loadtest.ts`
  - Schreiben: `bulkCreate`, `startSimulation`, `stopSimulation`
- `api/logs.ts`
  - Schreiben: `cleanup`, `deleteFile`
- `api/calibration.ts`
  - Schreiben: `calibrate` (Sonderfall API-Key-Auth optional statt JWT)

## 2) Fehlerflussanalyse (HTTP -> Parser -> Store/UI) fuer 4xx/5xx/Netzwerk

## 2.1 Transportebene (immer zuerst `api/index.ts`)

- Request:
  - Bearer Token + `X-Request-ID` werden gesetzt.
- Response Fehler:
  - 401 (nicht `/auth/*`, nicht `_retry`, Refresh-Token vorhanden):
    - startet Token-Refresh-Logik.
    - parallele 401 Requests werden in `failedQueue` geparkt.
    - nach erfolgreichem Refresh werden geparkte Requests mit neuem Token erneut gesendet.
  - 401 Refresh-Fehler:
    - `authStore.clearAuth()`
    - harter Redirect via `window.location.href = '/login'`
  - 403:
    - keine spezielle Behandlung im Interceptor, Fehler geht an Call-Site.
  - Netzwerkfehler:
    - Reject ohne automatische Wiederholung.

## 2.2 Parser/Translator-Ebene

- `parseApiError.ts`:
  - kann GodKaiser-Fehlerstruktur (`error.numeric_code`, `error.request_id`) sauber extrahieren.
  - wird aktuell nirgendwo konsumiert.
- `errors.ts`:
  - wird fuer UI-Fehlerdetails verwendet (z. B. Error-Modal), nicht fuer globales API-Error-Handling.

## 2.3 Store/UI-Ebene (de-facto Verhalten)

- Mehrheit der Stores/Composables behandelt Fehler lokal mit:
  - `catch (e) -> toast.error(...)` oder `showError(...)`
  - oft mit `error.message` / `response.data.detail`
  - selten mit strukturiertem `numeric_code`/`request_id`.
- Konsequenz:
  - 4xx/5xx werden sichtbar, aber inkonsistent formatiert.
  - strukturierte Serverfehler werden nicht zentral ausgeschopft.

## 3) Token-Refresh/Retry-Lebenszyklus inkl. Abbruchfaelle

## 3.1 Standardablauf 401-Retry

1. Request bekommt 401.  
2. Interceptor prueft Ausschluss (`/auth/refresh|login|setup|status`).  
3. Wenn kein laufender Refresh: `authStore.refreshTokens()`.  
4. Bei Erfolg: originaler Request + alle geparkten Requests laufen mit neuem Token.  
5. Bei Fehlschlag: Queue reject, Auth clear, Redirect `/login`.

## 3.2 Abbruchfaelle

- Kein `refreshToken`: kein Retry, Fehler propagiert.
- 401 auf Auth-Endpunkten: kein Retry (explizit verhindert).
- Refresh selbst fehlschlaegt: Session wird sofort verworfen.

## 3.3 Parallelitaetsrisiken (explizit)

- Positiv: innerhalb des Axios-Interceptors ist N-zu-1 Queueing implementiert.
- Risiko A: `websocketService.refreshTokenIfNeeded()` ruft ebenfalls `authStore.refreshTokens()` auf, aber ohne gemeinsame Mutex/Queue mit Axios.
  - Effekt: gleichzeitige Refresh-Aufrufe aus REST + WS sind moeglich.
- Risiko B: `authStore.checkAuthStatus()` kann beim Start ebenfalls Refresh triggern.
  - Effekt: konkurrierende Refresh-Pfade (Startup/WS/Interceptor) ohne globale Koordination.
- Risiko C: bei konkurrierenden Refreshes werden Tokens mehrfach gesetzt; funktional oft robust, aber unnötige Last + Race-Potenzial.

## 4) Pfade mit „Dispatch-Erfolg“ statt echter Finalitaet

Diese Pfade zeigen bereits Erfolg/Pending, bevor der fachliche Endzustand gesichert ist:

- `espStore.sendActuatorCommand(...)`
  - zeigt `toast.info("... gesendet")` nach REST-Akzeptanz.
  - echte Finalitaet erst ueber WS: `actuator_response` oder `actuator_command_failed`.
- `zonesApi.assignZone` Aufrufer:
  - z. B. `useZoneDragDrop` zeigt Erfolg direkt nach REST `response.success`.
  - laut Vertragsmodell ist MQTT/ESP-Bestaetigung asynchron (`zone_assignment` Event).
- `ZoneAssignmentPanel.vue`
  - hat zumindest expliziten `pending_ack` Zustand + 30s Timeout fuer reale ESPs.
  - zeigt aber ebenfalls optimistische UI-Aktualisierung vor finalem Ack.
- `subzonesApi.assignSubzone` Aufrufer
  - analog: REST sendet an Bridge, final ueber WS `subzone_assignment`.
- `config` Lifecycle
  - `config_published` ist non-terminal; final erst `config_response` oder `config_failed`.
  - dieser Unterschied ist in `actuator.store.ts` korrekt modelliert, aber nicht in allen UI-Texten konsistent.

## 5) Pflichtnachweis A: View Action -> API -> Erfolg/Fehler -> Nutzerfeedback

## A1) Aktor-Befehl (L3 Device/Monitor)

1. View/Action triggert `espStore.sendActuatorCommand(...)`.  
2. API: `actuatorsApi.sendCommand(...)` (`POST /actuators/{esp}/{gpio}/command`).  
3. Sofortfeedback:
   - Erfolg Dispatch: Info-Toast „gesendet…“.
   - Transportfehler: Error-Toast aus Catch.
4. Finale Rueckmeldung:
   - WS `actuator_response` => success/error Toast.
   - WS `actuator_command_failed` => persistenter Error-Toast.
   - Timeout-Warnung als vorlaeufiger Hinweis vorhanden.

Bewertung: finalitaetsfaehig (durch WS), aber mit bewusst vorgelagertem Dispatch-Feedback.

## A2) Zone-Zuweisung (Hardware/ZoneAssignment)

1. View triggert `zonesApi.assignZone(...)`.  
2. API: `POST /zone/devices/{id}/assign`.  
3. Sofortfeedback:
   - mehrere Aufrufer melden Erfolg direkt nach `response.success`.
4. Asynchrone Finalitaet:
   - echtes ESP/MQTT Ergebnis ueber WS `zone_assignment`.
   - `ZoneAssignmentPanel` nutzt dafuer `pending_ack`, andere Aufrufer oft nicht.

Bewertung: heterogen; Vertragsrealitaet (Dispatch vs Finalitaet) ist nicht ueberall gleich sichtbar.

## 6) Pflichtnachweis B: 401/403 -> Interceptor -> Session-/Routing-Effekt

## B1) 401 (abgelaufenes Access-Token)

1. API-Request scheitert mit 401.  
2. Interceptor startet Refresh (oder queued).  
3. Bei Erfolg: Request wird transparent wiederholt.  
4. Bei Fehlschlag:
   - `clearAuth()`
   - `window.location.href='/login'`
   - Router-Guard greift danach mit `requiresAuth` auf Login-Flow.

## B2) 403 (keine Berechtigung)

1. API-Request scheitert mit 403.  
2. Interceptor hat keinen Sonderpfad fuer 403, Fehler geht ungefiltert zur Call-Site.  
3. Session bleibt bestehen; kein globaler Redirect.  
4. Nutzerfeedback ist aufruferspezifisch (oft generischer Fehler-Toast).  

Risiko: uneinheitliche UX fuer „verboten“-Faelle (kein zentraler 403-Vertrag).

## 7) Dokumentiertes Fehlerverhalten je schreibendem API-Pfad (konsolidiert)

Gemeinsamer Basiskontrakt fuer alle schreibenden API-Methoden:

- Transportebene:
  - 401: 1x Retry via Interceptor (ausser Auth-Endpunkte), sonst Logout+Redirect.
  - 403/4xx/5xx: direkte Fehlerweitergabe an Aufrufer.
  - Netzwerkfehler: direkte Fehlerweitergabe.
- Store/Component-Ebene:
  - Catch + Toast/Message (meist lokal, nicht zentral normalisiert).
- Asynchrone Bridge-Pfade (MQTT/ESP):
  - REST-Erfolg bedeutet haeufig „angenommen/gesendet“, nicht „terminal bestaetigt“.
  - Terminalitaet ueber WS-Events.

Damit ist fuer jeden schreibenden API-Pfad mindestens dieses konkrete Fehlerverhalten dokumentiert; fuer Aktor/Zone/Subzone/Config zusaetzlich mit Finalitaetsdifferenz explizit.

## 8) Befundliste / Risiken

1. `parseApiError.ts` ist ungenutzt -> strukturierte Fehlerdaten bleiben weitgehend liegen.  
2. 403-Verhalten ist nicht zentral standardisiert -> inkonsistente UX.  
3. Refresh-Koordination ist nur im Axios-Interceptor serialisiert, nicht systemweit (WS/Startup-Rennen moeglich).  
4. Mehrere Flows zeigen Dispatch-Erfolg ohne klaren Hinweis auf ausstehende Finalitaet (ausser teils ZoneAssignmentPanel).  
5. Fehlertexte werden vielfach aus `error.message` extrahiert, ohne `request_id`-Durchreichung fuer Operator-Traceability.

## 9) Kurzfazit

Die API-Schicht ist funktional robust, aber vertraglich uneinheitlich in der Fehlerdarstellung und Finalitaetskommunikation.  
Das groesste Architekturplus ist die 401-Queue im Interceptor; die groessten Rest-Risiken liegen bei fehlender globaler Refresh-Synchronisierung (REST/WS/Startup) und bei inkonsistenter Sichtbarkeit von „dispatch vs terminal“ fuer den Operator.

