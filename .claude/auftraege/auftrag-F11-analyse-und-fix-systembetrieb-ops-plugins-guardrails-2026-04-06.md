# Auftrag F11 - Analyse und Fix: Systembetrieb, Ops, Diagnostics und Plugins

> **Typ:** Analyse + Fixauftrag (selbsttragend, direkt umsetzbar)  
> **Prioritaet:** P0/P1  
> **Datum:** 2026-04-06  
> **Zielbereich:** El Frontend (Ops-Flaechen)

---

## 1) Mission und erwartetes Ergebnis

Du sollst die Ops-relevanten Frontend-Flows vereinheitlichen, damit riskante Aktionen fuer Operatoren **finalitaetssicher**, **transparent** und **diagnostizierbar** werden.

Kernproblem heute: mehrere Views zeigen nur lokale oder uneinheitliche Statusmeldungen. Es fehlt ein gemeinsames Lifecycle-Modell fuer riskante Aktionen (initiiert, laufend, teilweise erfolgreich, erfolgreich, fehlgeschlagen) sowie ein konsistentes Guardrail-Pattern vor und nach Eingriffen.

**Erwartetes Endergebnis:**
1. Einheitlicher Ops-Lifecycle fuer High-Risk-Aktionen.
2. Plugin-Ausfuehrungen mit Execution-ID und Live-Statuskanal.
3. Guardrails fuer Lasttest und System-Config mit Preflight, Intent-Confirm, Lifecycle-Tracking, Post-Action-Summary.
4. Verbindliche Decommission-Strategie fuer Legacy-Redirects (inkl. Telemetrie-Rollout).

---

## 2) Verbindlicher Scope (nur diese Dateien/Module)

- `El Frontend/src/views/SystemMonitorView.vue`
- `El Frontend/src/components/system-monitor/*`
- `El Frontend/src/views/PluginsView.vue`
- `El Frontend/src/shared/stores/plugins.store.ts`
- `El Frontend/src/api/plugins.ts`
- `El Frontend/src/views/LoadTestView.vue`
- `El Frontend/src/api/loadtest.ts`
- `El Frontend/src/views/SystemConfigView.vue`
- `El Frontend/src/views/EmailPostfachView.vue`
- `El Frontend/src/composables/useEmailPostfach.ts`
- `El Frontend/src/router/index.ts`

Wenn du fuer den Lifecycle ein zentrales Modell brauchst, darfst du zusaetzlich einen shared Contract unter `El Frontend/src/shared/` oder `El Frontend/src/types/` anlegen.

---

## 3) IST-Befund (fachlich praezise, bereits validiert)

### Staerken
- `SystemMonitor` deckt Events, Logs, DB, MQTT, Health, Diagnostics, Reports, Hierarchy funktional breit ab.
- Admin-Schutz auf Routing-Ebene ist vorhanden.
- In Teilbereichen existieren bereits sinnvolle Guardrails (z. B. 2-Klick-Cleanup mit Preview).
- Legacy-Redirects sind zentral gesammelt und teilweise bereits nachvollziehbar.

### Kritische Luecken
1. **Kein gemeinsames Ops-Lifecycle-Modell** fuer riskante Aktionen.
2. **Keine gemeinsame Impact-Transparenz** fuer Plugin-Execution, Loadtest und Config-Aenderungen.
3. **Uneinheitliche Datenfrische-Signale** zwischen Views.
4. **Redirect-Ballast** noch hoch, semantischer Drift bei Altpfaden.

### Risiko-Hotspots (Priorisiert)
- **P0:** Plugin execute/enable-disable/config-update ohne standardisierte Laufzeitfinalitaet.
- **P0:** Loadtest bulk/create/start ohne verpflichtende Guardrail-Vorstufe.
- **P0:** SystemConfig save ohne Risiko-/Finalitaetsaufloesung (`saved` vs `applied`).
- **P1:** Cleanup restore/retention ohne globales Job-Lifecycle und ohne klare `partial`-Semantik.
- **P1:** DB-Export ohne Sensitivitaets-/Scope-Hinweis vor Download.

---

## 4) SOLL-Contract (verbindlich)

## 4.1 Einheitliches Ops-Lifecycle-Modell

Fuehre fuer riskante Aktionen ein konsistentes Zustandsmodell ein:

- `initiated` (Request versendet, noch keine Annahme bestaetigt)
- `running` (Ausfuehrung bestaetigt)
- `partial` (teilweise erfolgreich, nicht terminal)
- `success` (terminal erfolgreich)
- `failed` (terminal fehlgeschlagen)

Optional intern:
- `timeout`, `cancelled` -> in UI als `failed` mit reason_code/reason_text darstellen.

Regeln:
- Ein ACK ist **nie** terminaler Erfolg.
- Terminale Ergebnisse muessen sichtbar bleiben (nicht nur Toast).
- Statusdarstellung konsistent in Card/Detail/History/Banner.

## 4.2 Plugin-Execution-Contract

Jede Plugin-Ausfuehrung braucht eine stabile `execution_id`.

### Erwartetes Status-Event
Eventname: `plugin_execution_status`

Payload (mindestens):
- `execution_id`
- `plugin_id`
- `status`
- `message`
- `started_at`
- `updated_at`
- optional: `finished_at`, `progress_percent`, `step`, `error_code`, `error_message`, `triggered_by`, `correlation_id`

### UI-Verhalten
- `PluginsView`, Plugin-Detail und History nutzen denselben Status pro `execution_id`.
- Globales Ops-Banner zeigt laufende High-Risk-Aktionen systemweit.
- Timeout-Guard: wenn nach `initiated` kein `running` innerhalb N Sekunden -> `failed` mit Diagnosegrund.
- Reconciliation nach Reload: laufende Executions per API nachladen (z. B. `status=running`).

## 4.3 Guardrail-Standard fuer riskante Aktionen

Jede High-Risk-Aktion folgt strikt:
1. **Preflight:** Impact, Last, betroffene Module, Rollback/Abbruch.
2. **Intent Confirm:** explizite Bestaetigung, bei High-Risk optional typed confirm.
3. **Lifecycle-Tracking:** initiated -> running -> partial|success|failed.
4. **Post-Action Summary:** reale Aenderungen, beobachtete Nebenwirkungen, naechster sicherer Schritt.

### Konkret fuer Loadtest
- UI-Hard-Limits aus Server-Capabilities ableiten (kein reines statisches Input-Limit).
- Forecast anzeigen (z. B. Anzahl Devices / erwartete Last).
- Start nur nach bestandenem Preflight.
- Kill-Switch waehrend laufender Simulation permanent sichtbar.

### Konkret fuer SystemConfig
- Vor Save: Key-Diff, Risiko-Klasse je Key, Restart/Reload-Hinweis.
- Nach Save: getrennte Zustaende `saved` (persistiert) und `applied` (runtime wirksam).

---

## 5) Phase A - Analyseauftrag (zwingend vor jedem Fix)

Erstelle zuerst einen kompakten Analyseblock mit diesen Pflichtartefakten:

1. **Ops-Matrix je Aktion**  
   `Aktion -> Side Effect -> Ist-Transparenz -> Risiko -> Soll-Guardrail`.

2. **Lifecycle-Drift-Matrix**  
   je View/Store/API:  
   `lokaler Status -> fehlende Zustaende -> noetige Normalisierung`.

3. **Plugin-Flow-Belegkette**  
   `execute trigger -> store mutation -> UI feedback -> history refresh`  
   inklusive Bruchstellen bei fehlender Live-Finalitaet.

4. **Loadtest- und Config-Guardrail-Gap**  
   je Schritt `Preflight/Confirm/Tracking/Summary` als Ja/Nein mit Beleg.

5. **Legacy-Redirect-Inventar mit Prioritaet P1/P2/P3**  
   inklusive Decommission-Reihenfolge und Messstrategie.

6. **Testlueckenliste**  
   Unit/Integration/E2E fuer Lifecycle, Timeout, Reconciliation, Guardrails.

**Regeln fuer Phase A:**
- Keine generischen UI-Ratschlaege; nur konkrete Ops-Wirkung auf Operatorentscheidungen.
- ACK-vs-terminal fuer jede High-Risk-Aktion explizit trennen.
- Ergebnis muss direkt in kleine Fixpakete ueberfuehrbar sein.

---

## 6) Phase B - Fixauftrag (implementieren)

Setze die folgenden Pakete in Reihenfolge um:

## Paket P0-A: Shared Ops Lifecycle Contract

- Lege ein zentrales TS-Modell fuer Ops-Lifecycle an (Status, Reason, Timestamps, IDs).
- Fuehre einheitliche UI-Badges/Statusdarstellung fuer riskante Aktionen ein.
- Standardisiere Mapping von API/WS/Local-Errors auf Lifecycle-Zustaende.

## Paket P0-B: Plugin Execution Lifecycle End-to-End

- `plugins.store.ts` um Execution-ID-zentriertes Laufzeitmodell erweitern.
- `api/plugins.ts` so anpassen, dass `execution_id` robust verarbeitet wird.
- WebSocket-Statuskanal fuer `plugin_execution_status` verdrahten.
- Timeout-Guard + Reconciliation implementieren.
- UI in `PluginsView.vue` fuer Card/Detail/History konsistent machen.

## Paket P0-C: Loadtest Guardrail

- In `LoadTestView.vue` Guardrail-Flow integrieren:
  - Preflight-Info + Impact-Forecast
  - explizite Confirm-Stufe (bei High-Risk typed confirm)
  - Lifecycle-Anzeige inkl. kill switch
  - Post-Action-Summary
- In `api/loadtest.ts` noetige Capability/Preflight-Endpunkte sauber anbinden (falls vorhanden) bzw. fallback-faehig kapseln.

## Paket P0-D: SystemConfig Guardrail + Finalitaet

- In `SystemConfigView.vue` Key-Diff + Risiko-Klassen vor Save anzeigen.
- Save-Ergebnis in `saved` vs `applied` trennen.
- Klare Folgeschritte im UI, wenn nur `saved` erreicht ist.

## Paket P1-E: SystemMonitor-Ops-Banner + Konsolidierung

- In `SystemMonitorView.vue` ein globales Ops-Banner/Queue fuer laufende High-Risk-Jobs einbauen.
- Lifecycle-Zustaende aus Plugin/Loadtest/Config dort zusammenfuehren.

## Paket P1-F: Legacy Redirect Decommission vorbereiten

- In `router/index.ts` Redirect-Telemetrie fuer Legacy-Pfade verfeinern.
- Decommission-Plan hinterlegen:
  - Messphase
  - Warnphase
  - Soft-Removal (P3 zuerst)
  - Hard-Removal (P2, dann P1 bei niedriger Nutzung)

---

## 7) Akzeptanzkriterien (Definition of Done)

1. **Lifecycle-Standard aktiv:**  
   High-Risk-Aktionen zeigen konsistent `initiated/running/partial/success/failed`.

2. **Plugin-Finalitaet sichtbar:**  
   Execution-ID ist in Trigger, Laufstatus und Historie konsistent nachvollziehbar.

3. **Guardrails wirksam:**  
   Loadtest und SystemConfig haben Preflight, Intent-Confirm, Laufzeittracking, Post-Action-Summary.

4. **Keine falschen Erfolgssignale:**  
   ACK wird nirgends als terminaler Erfolg angezeigt.

5. **Reconciliation robust:**  
   Nach Reload sind laufende Plugin-Ausfuehrungen wieder sichtbar.

6. **Redirect-Decommission vorbereitet:**  
   Priorisierung + Telemetrie + schrittweiser Abbau sind technisch startklar.

---

## 8) Verbindlicher Testplan

## E2E (Pflicht)

1. **Ops-Fehlerpfad Cleanup/High-Risk-Simulation**
- Trigger einer riskanten Aktion
- Injektion eines Fehlerpfads
- Erwartung: `initiated -> running -> failed` sichtbar, inkl. Recovery-Hinweis

2. **Plugin Lifecycle Komplettfluss**
- `initiated -> running -> partial -> success`
- Timeout-Fall: `initiated -> failed` ohne Running-ACK
- Erwartung: konsistente `execution_id` in Card/Detail/History

3. **Reload-Reconciliation**
- laufende Plugin-Ausfuehrung starten
- Seite neu laden
- Erwartung: laufende Ausfuehrung wird per API wiederhergestellt

## Integration/Unit (Minimum)

- Store-Tests fuer Lifecycle-Transitionen und Timeout-Guard.
- API-Tests fuer Mapping `execution_id`, Statuspayload, Fehlerpfade.
- View-Tests fuer Guardrail-Schritte (Preflight/Confirm/Tracking/Summary).
- Router-Tests fuer Legacy-Redirect-Telemetrie.

---

## 9) Nicht-Ziele (um Scope-Creep zu vermeiden)

- Kein genereller Redesign-Umbau aller Ops-Views.
- Keine Erweiterung auf nicht-riskante Read-only-Flows ausser notwendiger Konsistenz.
- Keine semantisch unklaren Statusnamen ausserhalb des definierten Lifecycle-Modells.

---

## 10) Rollout- und Risikohinweise

- **Reihenfolge strikt halten:** P0-A -> P0-B -> P0-C -> P0-D -> P1-E -> P1-F.
- **Feature-Flags bevorzugen**, falls einzelne Teilpakete risikoarm ausgerollt werden sollen.
- **Operator-Sicherheit vor Schoenheit:** klare Finalitaet und Diagnostik haben Vorrang.
- Bei Contract-Luecken zwischen API/WS/Frontend: Frontend defensiv halten, aber Vertrag im Code explizit markieren.

---

## 11) Ausgabeformat fuer die Umsetzung

Lieferung in dieser Reihenfolge:
1. **Analyseblock** (Matrix/Belege/Testluecken)
2. **Umgesetzte Fixpakete** mit Datei- und Impact-Liste
3. **Testnachweis** (Unit/Integration/E2E)
4. **Rest-Risiken + naechste Schritte**

Wichtig: Der gesamte Fix muss ohne externe Kontextdateien verstaendlich und wartbar bleiben.
