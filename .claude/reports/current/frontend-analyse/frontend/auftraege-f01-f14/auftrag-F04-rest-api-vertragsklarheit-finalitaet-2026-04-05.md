# Auftrag F04: REST-API-Vertragsklarheit und Finalitaet

> **Typ:** Analyseauftrag  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend / F04  
> **Prioritaet:** P1

## Relevantes Wissen (kompakt und verbindlich)
- REST gibt oft nur Annahme/Dispatch-Bestaetigung; terminale Wirksamkeit kommt ueber Realtime/Outcome-Pfade.
- Fehlerkommunikation ist nur dann robust, wenn `request_id`, `numeric_code` und fachlicher Kontext sichtbar werden.
- 401/Refresh-Queue ist zentral in `El Frontend/src/api/index.ts` implementiert; ein globaler 403-Handler ist dort nicht vorhanden.
- `parseApiError` existiert in `El Frontend/src/api/parseApiError.ts`, ist aber aktuell nicht in Views/Stores/API-Helfern verdrahtet.
- Finalitaet fuer asynchrone Kommandos ist im Frontend bereits zweigleisig angelegt: REST `intent-outcomes` (`El Frontend/src/api/intentOutcomes.ts`) plus WS `intent_outcome`/`intent_outcome_lifecycle` (siehe `El Frontend/src/shared/stores/intentSignals.store.ts`).

## IST-Befund
- API-Module sind breit und funktional, aber Error-Contract ist nicht durchgaengig normiert (insb. 4xx/5xx in UI-Pfaden).
- `parseApiError` ist vorhanden, aber derzeit ungenutzt.
- Familienliste im bisherigen Auftrag ist unpraezise (`ops`); im Frontend existieren konkrete Clients wie `diagnostics`, `logs`, `health`, `debug`, `database`, `backups`.
- Operator kann in einzelnen REST-Command-Flows weiterhin ACK-nahe Signale sehen, bevor terminale Outcomes (WS/Intent) sichtbar sind.

## SOLL-Zustand
- Einheitlicher API-Error-Vertrag fuer UI (`message`, `numeric_code`, `request_id`, `retryability`).
- Einheitliche Behandlung 401/403/5xx in allen kritischen Views.
- Restaktions-Feedback immer zusammen mit Finalitaetsstatus (accepted/pending/terminal).
- Endpoint-Familien und Finalitaetsquelle sind pro Flow explizit dokumentiert (REST-ACK vs. WS/Intent terminal).

## Analyseauftrag
1. Error-Policy pro realer API-Familie erfassen: `auth`, `esp`, `sensors`, `actuators`, `logic`, `notifications`, `zones`, `subzones`, `device-context`, `intent-outcomes`, `diagnostics`, `logs`, `health`, `database`, `debug`, `backups`, `dashboards`, `inventory`, `users`, `plugins`, `config`, `calibration`, `audit`.
2. Lueckenliste erzeugen: wo fehlt Request-Traceability (`X-Request-ID`/`request_id`) im UI trotz vorhandener Header/Contract-Felder?
3. Finalitaetsmapping fuer asynchrone Commands dokumentieren, inkl. Trennung: REST-ACK (`accepted/pending`) vs. terminale Quelle (`intent_outcome`, `actuator_response`, `sequence_*` je Flow).
4. Einheitlichen 403-Standard fuer Operator/Admin-Flows definieren (UX-Text, Toast/Dialog, Navigation/CTA, Logging mit `request_id`).
5. Explizit markieren, wo bestehende Helper (`parseApiError`, Error-Translation) ohne Verdrahtung bleiben und mit welcher Prioritaet sie integriert werden.

## Scope
- **In Scope:** API-Client-Layer `El Frontend/src/api/`, Error-Mapping in Stores/Views, Response->UI-Vertrag, Finalitaetsdarstellung fuer asynchrone Flows.
- **Out of Scope:** Backend-Endpunkt-Neudesign.

## Nachweise
- Matrix `Endpoint -> ACK-Semantik -> Terminalquelle -> UI-Anzeige -> Request-ID-Sichtbarkeit`.
- Liste ungenutzter/inkonsistenter Error-Helfer mit priorisierter Nutzungsempfehlung.
- Referenzabgleich gegen `.claude/reference/api/REST_ENDPOINTS.md` und `.claude/reference/api/WEBSOCKET_EVENTS.md` fuer alle als "kritisch" markierten Flows.

## Akzeptanzkriterien
- Kritische API-Flows haben einheitliche Fehler- und Finalitaetskommunikation.
- 403-Verhalten ist fuer Nutzer vorhersagbar und dokumentiert.
- Request-ID ist in kritischen Stoerfallpfaden sichtbar nutzbar.
- Jede betrachtete API-Familie ist auf reale Frontend-Dateien gemappt (keine Sammelbegriffe ohne Modulbezug wie `ops`).
- Ergebnis ist so konkret, dass ein Dev-Agent daraus direkt Umsetzungs-Tickets schneiden kann.

## Tests/Nachweise
- Unit (Analysebasis + ggf. Backlog): `El Frontend/tests/unit/` mit Fokus auf neue/fehlende Tests fuer API-Error-Mapping (insb. `parseApiError`-Verdrahtung).
- E2E: `El Frontend/tests/e2e/scenarios/auth.spec.ts` als Basis fuer 401-Refresh-Verhalten; 403-deny und 5xx-Nutzerfuehrung als explizite Luecken markieren, falls keine dedizierten Szenarien vorhanden.

## Arbeitsanweisung fuer Agent-Ausfuehrung (repo-konkret)
1. Lies zuerst:
   - `El Frontend/src/api/index.ts`
   - `El Frontend/src/api/parseApiError.ts`
   - `El Frontend/src/api/intentOutcomes.ts`
   - `El Frontend/src/shared/stores/intentSignals.store.ts`
   - `.claude/reference/api/REST_ENDPOINTS.md`
   - `.claude/reference/api/WEBSOCKET_EVENTS.md`
2. Erstelle dann die Matrix und Lueckenliste entlang der echten API-Dateien unter `El Frontend/src/api/`.
3. Pruefe pro kritischem Command-Flow explizit:
   - Was signalisiert REST sofort?
   - Was signalisiert WS/Intent terminal?
   - Wo sieht der Operator `request_id`/Korrelation?
4. Dokumentiere den 403-Standard als konkrete UI-Regel (einheitliche Nutzerfuehrung fuer Operator/Admin-Flows).
5. Schreibe das Ergebnis nach:
   - `.claude/reports/current/frontend-analyse/report-frontend-F04-rest-api-vertragsklarheit-finalitaet-2026-04-05.md`
