# Report Frontend F04: REST-API-Vertragsklarheit und Finalitaet

Datum: 2026-04-05 (aktualisiert 2026-04-06)  
Scope: `El Frontend/src/api/*.ts`, `El Frontend/src/api/index.ts`, `El Frontend/src/api/parseApiError.ts`, `El Frontend/src/api/errors.ts`, `El Frontend/src/stores/esp.ts`, `El Frontend/src/shared/stores/actuator.store.ts`, `El Frontend/src/shared/stores/intentSignals.store.ts`, `El Frontend/src/shared/stores/auth.store.ts`, `El Frontend/src/shared/stores/logic.store.ts`, `El Frontend/src/views/SystemMonitorView.vue`, ausgewaehlte Admin-Views (`UserManagementView`, `SystemConfigView`)

## 1) Kurzfazit

- Der HTTP-Transport ist robust (globale 401-Refresh-Queue in `api/index.ts`), aber der UI-Error-Vertrag ist nicht vereinheitlicht.
- `parseApiError` existiert als strukturierter Parser (`message`, `numericCode`, `requestId`), wird praktisch nicht in den kritischen Stores/Views verwendet.
- Viele Flows zeigen sofortige Erfolgstexte auf REST-ACK-Ebene, waehrend die terminale Wirkung asynchron ueber WebSocket/Outcome eintrifft.
- Request-Traceability (`request_id`) ist in Teilen sehr gut (System Monitor/Server Logs), in den meisten operativen Screens aber unsichtbar.
- 403 wird derzeit weder global noch lokal explizit standardisiert behandelt (keine dedizierte 403-Branch im Frontend-Code).

## 2) Error-Policy pro API-Familie (IST)

| Familie | Prim. API-Module | Aktuelle Error-Behandlung | 401 | 403 | 5xx | Traceability |
|---|---|---|---|---|---|---|
| `auth` | `api/auth.ts`, `auth.store.ts` | Lokale `detail`-Extraktion (`response.data.detail`) | zentral ueber Interceptor + Refresh | kein eigener Pfad, faellt auf generische Message | generisch/fallback | keine UI-Ausgabe von `request_id` |
| `esp` | `api/esp.ts`, `stores/esp.ts` | eigenes `extractErrorMessage()` mit `detail`/Validation-Array | zentral ueber Interceptor + Retry | nicht explizit; landet als allgemeiner Fehlertext | generisch/fallback | partielle Nutzung (`request_id` bei Command-Intent), sonst kaum sichtbar |
| `sensors` | `api/sensors.ts`, aufrufende Stores/Components | i. d. R. Fehlerbehandlung in aufrufenden Stores mit `detail` | zentral ueber Interceptor + Retry | kein Standardpfad | generisch/fallback | `triggerMeasurement` liefert `request_id`, UI nutzt es nicht konsistent |
| `actuators` | `api/actuators.ts`, `stores/esp.ts`, `actuator.store.ts` | REST-ACK + WS-Finalisierung, Fehler meist `detail`-basiert | zentral ueber Interceptor + Retry | kein expliziter 403-UX-Pfad | ws/timeout/contract Hinweise vorhanden | gut auf WS-Seite (`request_id`/`correlation_id`), schlecht in Standard-Views |
| `logic` | `api/logic.ts`, `logic.store.ts` | eigenes `extractErrorMessage()` auf `detail` | zentral ueber Interceptor + Retry | kein eigener Pfad | generisch/fallback | kein sichtbarer `request_id`-Pfad in UI |
| `notifications` | `api/notifications.ts`, Inbox/Email Composables | direktes Durchreichen + lokale `detail`-Fallbacks | zentral ueber Interceptor + Retry | kein eigener Pfad | generisch/fallback | keine durchgaengige `request_id`-Anzeige |
| `ops` | `api/plugins.ts`, `diagnostics.ts`, `audit.ts`, `logs.ts`, `database.ts`, `config.ts`, `users.ts`, `loadtest.ts` | heterogen: teils reine API-Wrapper, teils View-lokales `detail`-Handling | zentral ueber Interceptor + Retry | kein zentraler Standard, oft nur Textmeldung | generisch/fallback | stark unterschiedlich, v. a. im System Monitor sichtbar |

Bewertung:
- **401**: technisch konsistent auf Transportebene.
- **403**: UX-seitig inkonsistent/undefiniert.
- **5xx**: meist nur generische Detailmeldung ohne standardisierte Benutzerfuehrung.
- **Error-Contract** (`numeric_code`, `request_id`, `retryability`): nicht einheitlich etabliert.

## 3) Lueckenliste: Request-Traceability im UI

### P1 (kritisch)

1. **Operative Fehlerdialoge/Toasts ohne Request-ID**
   - Stores und Views zeigen ueberwiegend `detail`-Strings; `request_id` bleibt verborgen.
   - Folge: Stoerfall-Triage mit Server-Logs erfordert manuellen Kontextabgleich.

2. **`parseApiError` nicht in der Hauptfehlerstrecke**
   - Der strukturierte Parser ist vorhanden, aber nicht in `auth.store`, `esp.store`, `logic.store`, Admin-Views etc. verdrahtet.
   - Folge: `numeric_code` und `request_id` gehen im Regelbetrieb verloren.

### P2 (hoch)

3. **Uneinheitliche lokale Error-Parser**
   - Mehrfachimplementierungen (`extractErrorMessage` in mehreren Stores + ad-hoc Casts in Views).
   - Folge: abweichende Fehlermeldungen und keine einheitliche Retry-/Forbidden-Logik.

4. **Asynchrone REST-Commands ohne standardisierte Verknuepfung zum Log-Kontext**
   - Teilweise `correlation_id` verarbeitet, aber nicht als sichtbarer Incident-Handle im UI durchgezogen.

### P3 (mittel)

5. **System Monitor stark, restliche Views schwach**
   - `request_id` ist in Monitor/Server-Logs gut nutzbar, aber diese Staerke ist nicht als globales UI-Muster etabliert.

## 4) Finalitaetsmatrix: Endpoint -> ACK-Semantik -> Terminalquelle -> UI-Anzeige

Legende:
- **ACK-Semantik** = was REST unmittelbar bestaetigt.
- **Terminalquelle** = wo endgueltige Wirksamkeit beobachtbar ist.

| Endpoint/Familie | ACK-Semantik (REST) | Terminalquelle | Aktuelle UI-Anzeige |
|---|---|---|---|
| `POST /actuators/{esp}/{gpio}/command` | Annahme/Dispatch (`command_sent`, `acknowledged`, `correlation_id`) | WS: `actuator_response`/`actuator_command_failed`; zusaetzlich intent-outcome lifecycle | Sofort-Toast "gesendet"; finaler Toast bei WS-Antwort |
| `POST /actuators/emergency_stop` | Server hat Notstopp initiiert | Folgezustaende ueber WS + `fetchAll` | Erfolgs-Toast + anschliessendes Refresh |
| `POST /actuators/clear_emergency` | Freigabe initiiert | Folgezustaende ueber WS + `fetchAll` | Erfolgs-Toast + Refresh |
| `POST /esp/devices/{id}/restart` | Command-Dispatch (teils `command_sent`) | Reale Wirkung ueber spaetere `esp_health`/Systemevents | Keine durchgaengige Terminalanzeige im gleichen Interaktionskontext |
| `POST /esp/devices/{id}/reset` | Command-Dispatch | spaetere Health-/Lifecycle-Events | Wie Restart: ACK deutlich, Finalitaet indirekt |
| `POST /sensors/{esp}/{gpio}/measure` | Messung angefordert (`request_id`) | `sensor_data`/Audit/Outcome-Events | API liefert `request_id`, UI nutzt es nicht als Standardfeedback |
| `POST /zone/devices/{id}/assign` | Assign-Request angenommen | WS: `zone_assignment` | Zone-Store zeigt WS-basierten Erfolg/Fehler-Toast |
| `DELETE /zone/devices/{id}` | Remove-Request angenommen | WS: `zone_assignment` (`zone_removed`) | WS-Toast vorhanden |
| `POST /subzones/*/assign` | Assign-Request angenommen | WS: `subzone_assignment` | WS-Toast vorhanden; teils nachgelagertes `fetchAll` |
| `POST /logic/rules/{id}/test` | Dry-run ist direkt final | REST direkt terminal | Direktes Ergebnis im aufrufenden UI-Kontext |
| `POST /logic/rules/{id}/toggle` | Toggle ist direkt final (DB/Service) | REST direkt terminal | Direkte Store-Aktualisierung |
| `POST /plugins/{id}/execute` | Start eines Plugin-Runs | Spaetere Historie/Status (`running` -> `success/error`) | Start sichtbar, terminale Rueckmeldung nicht durchgaengig standardisiert |
| `POST /notifications/test-email` | Testauftrag angenommen/ausgefuehrt laut API-Response | ggf. spaetere Email-Log-Eintraege | Meist REST-Meldung; keine einheitliche Finalitaetsdarstellung |
| `POST /diagnostics/run` | Diagnose-Lauf gestartet/abgeschlossen (API-abhaengig) | Historie/Report-Endzustand | In View als Ergebnis dargestellt, aber ohne globales Finalitaetsmuster |
| `POST /debug/load-test/start` | Simulation gestartet | Laufzeitmetrik/stop/result | View-lokale Meldung, kein einheitlicher pending->terminal Vertrag |

Kernaussage:
- Kritische asynchrone Commands (Aktorik, ESP-Commands, Teile Ops) brauchen im UI ein explizites `accepted/pending/terminal`-Muster; derzeit ist dies nur in Teilpfaden vorhanden.

## 5) Ungenutzte/inkonsistente Error-Helfer (priorisiert)

### P1

1. **`api/parseApiError.ts` faktisch ungenutzt in produktiven Fehlerpfaden**
   - Liefert genau den benoetigten Strukturvertrag, ist aber nicht als zentrale Funktion etabliert.

2. **Mehrfaches ad-hoc Parsing von `response.data.detail`**
   - in Stores und Views dupliziert, ohne `numeric_code`/`request_id`.

### P2

3. **`api/errors.ts` (Error-Code-Translation) nur punktuell eingebunden**
   - Potenzial fuer API-Fehleranreicherung vorhanden, aber kaum in Standard-Fehlerpfaden genutzt.

4. **Heterogene Fehler-UX in Admin/Ops-Views**
   - Unterschiedliche Texte/Fallbacks, keine gemeinsame 403-/5xx-Fuehrung.

Empfohlene Nutzung (Reihenfolge):
1) `parseApiError` als Single Entry Point fuer Axios-Fehler in Stores/Views.  
2) Standardisierte `toUiError()`-Abbildung auf `{ message, numeric_code, request_id, retryability, status }`.  
3) Optionaler Enrichment-Schritt (`translateErrorCode`) fuer `numeric_code` in kritischen Flows.  
4) Verbot neuer ad-hoc `detail`-Extraktion ausser in Low-Level-Utilities.

## 6) Einheitlicher 403-Standard (Operator/Admin-Flows)

### 6.1 Zielverhalten

- **Semantik**: 403 = authentifiziert, aber keine Berechtigung fuer Aktion/Ressource.
- **UI**:
  - Immer gleiche Headline (z. B. "Zugriff verweigert").
  - Klarer Kontexttext (welche Aktion blockiert wurde).
  - `request_id` sichtbar (kopierbar).
  - CTA-Set:
    - `Zurueck` (lokal),
    - `Zur Startansicht` (global),
    - optional `Erneut versuchen` nur wenn sinnvoll.

### 6.2 Standardisierte Abbildung

- `status === 403` -> `retryability = "no"`  
- Keine stillen Redirects auf Erfolgskontexte (ausser bewusst auf Router-Ebene bei reiner Routenautorisierung).
- Bei API-getriggerten 403 in bereits geoeffneten Views keine generische 5xx-Meldung, sondern spezifischer Forbidden-State.

### 6.3 Konsistenzregeln

1. Route-Guard-Forbidden und API-Forbidden sollen in Tonalitaet/CTA konsistent sein.  
2. Kein 403 darf als "allgemeiner Fehler" ohne Berechtigungsbezug angezeigt werden.  
3. Jede 403-Meldung enthaelt (wenn vorhanden) `request_id`.

## 7) SOLL-Vertrag fuer API-Errors und Finalitaet

### 7.1 Einheitliches UI-Error-Schema

```ts
type UiApiError = {
  message: string
  numeric_code: number | null
  request_id: string | null
  retryability: 'yes' | 'no' | 'unknown'
  status: number
}
```

Mapping-Regeln:
- 401 -> `retryability: "yes"` (mit zentraler Refresh-Queue; bei Refresh-Fail klarer Re-Login-Pfad)
- 403 -> `retryability: "no"` (AccessDenied-Pattern)
- 5xx/Netzwerk -> `retryability: "yes"` oder `"unknown"` + klare Nutzerfuehrung

### 7.2 Finalitaetszustand fuer asynchrone Aktionen

```ts
type FinalityState = 'accepted' | 'pending' | 'terminal_success' | 'terminal_failed' | 'terminal_integration_issue'
```

Regel:
- REST-ACK darf nie allein als "erfolgreich abgeschlossen" formuliert werden, wenn terminale Quelle spaeter folgt.
- UI-Text explizit:
  - `accepted`: "Auftrag angenommen"
  - `pending`: "Warte auf Geraeterueckmeldung"
  - `terminal_*`: endgueltiges Ergebnis

## 8) Test-/Nachweisplan (auftragsbezogen)

### Unit (Error-Mapper)

Pflichtfaelle:
1. GodKaiser-Error mit `numeric_code` + `request_id` -> korrektes `UiApiError`.
2. FastAPI `detail`-Error ohne `numeric_code` -> fallback korrekt.
3. Netzwerkfehler ohne Response -> status `0`, retryability nachvollziehbar.
4. 403-Mapping -> `retryability=no`, erwartete Benutzernachricht.

### E2E

Pflichtszenarien:
1. **401 Refresh Queue**: mehrere parallele Requests mit abgelaufenem Token, genau ein Refresh, anschliessend Retry.
2. **403 Deny Flow**: API liefert 403, UI zeigt konsistenten Forbidden-State mit `request_id`.
3. **5xx Flow**: klarer Stoerfalltext + Retry-Hinweis + keine falsche Erfolgskommunikation.
4. **Async Command Finalitaet**: REST-ACK -> pending -> terminal (success/fail) sichtbar nachvollziehbar.

## 9) Akzeptanzkriterien-Check

- Kritische API-Flows mit einheitlicher Fehler- und Finalitaetskommunikation: **IST nicht erfuellt**, Zielbild und Pfad definiert.
- 403-Verhalten vorhersehbar und dokumentiert: **IST nicht erfuellt**, Standard in Abschnitt 6 definiert.
- Request-ID in kritischen Stoerfallpfaden sichtbar nutzbar: **teilweise erfuellt** (v. a. System Monitor), in operativen Kernviews noch lueckenhaft.

## 10) Priorisierte Umsetzungsempfehlung

1. **P1**: Zentralen `toUiApiError` Mapper auf Basis `parseApiError` einfuehren und in `auth/esp/logic` + Admin-Ops-Views verdrahten.  
2. **P1**: Globales 403-Pattern (ErrorState/Modal/Toast-Konvention) und durchgaengige Verwendung.  
3. **P1**: Fuer asynchrone Commands ein verbindliches `accepted/pending/terminal` UI-Muster in Command-Views ausrollen.  
4. **P2**: `request_id` sichtbar/kopierbar in kritischen Fehlerkomponenten standardisieren.  
5. **P2**: Error-Code-Enrichment (`api/errors.ts`) gezielt bei `numeric_code` aktivieren.  
6. **P3**: Restliche ad-hoc `detail`-Extraktionen sukzessive abbauen.

## 11) Umsetzungsnachtrag (2026-04-06)

Status:
- Phase B fuer P1-Kernpfade umgesetzt (kein Big-Bang-Rollout ueber alle Stores/Views).

Umgesetzte Kernpunkte:
- Zentrales UI-Error-Mapping eingefuehrt: `src/api/uiApiError.ts` (`toUiApiError`, `formatUiApiError`).
- `parseApiError` erweitert: `requestId`-Fallback auf Header `x-request-id`, wenn Body-`request_id` fehlt.
- P1-Migration auf Single-Entry-Fehlerpfad:
  - `src/shared/stores/auth.store.ts`
  - `src/shared/stores/logic.store.ts`
  - `src/stores/esp.ts`
  - `src/views/UserManagementView.vue`
  - `src/views/SystemConfigView.vue`
- 403-Standard in Admin-Hotspots umgesetzt:
  - konsistenter Text "Zugriff verweigert"
  - CTA-Set: `Zurueck`, `Zur Startansicht`, `Erneut versuchen`
  - `request_id` wird in Fehlermeldung angezeigt (wenn vorhanden)
  - `retryability` fuer 403 = `no`
- Finalitaetsmuster in Aktorik konkretisiert:
  - explizite States: `accepted | pending | terminal_success | terminal_failed | terminal_integration_issue`
  - REST-ACK wird als "akzeptiert" statt als terminaler Erfolg kommuniziert
  - Handle-Sichtbarkeit in kritischen Pfaden (`correlation_id`/`request_id`) verbessert

Tests/Nachweise:
- Unit: `tests/unit/api/uiApiError.test.ts` neu erstellt (4 Pflichtfaelle fuer Mapping/Fallback/403/Netzwerk).
- Verifikation: `vitest` (gezielt) und `vue-tsc --noEmit` erfolgreich.

Offen fuer sukzessiven Rollout:
- Weitere Ops-/Admin-Pfade (`database`, `loadtest`, weitere Views/Stores) auf `toUiApiError` umstellen.

