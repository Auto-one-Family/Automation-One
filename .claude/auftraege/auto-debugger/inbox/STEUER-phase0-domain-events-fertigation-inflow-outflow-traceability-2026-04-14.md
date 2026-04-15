---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: ""
run_id: phase0-domain-events-fertigation-trace-2026-04-14
order: incident_first
target_docs:
  - docs/analysen/BERICHT-phase0-domain-events-fertigation-inflow-outflow-traceability-2026-04-14.md
scope: |
  Phase 0 (ohne neue Datenbank): Domain-Events als **Konzept** in heissen Pfaden verankern —
  jede relevante **Mutation** und jeder **persistierte** Zustandsuebergang soll rueckverfolgbar sein mit:
  - `correlation_id` (oder repo-konformes Aequivalent: `request_id` HTTP, synthetische CID MQTT — **nicht** blind mischen; Regeln aus Repo/SOLL-Doku beachten),
  - **Aggregate-ID** (mindestens: `device_id` / `zone_id` / `sensor_config_id` je nach Kontext),
  - **Schema-Version** (Payload- oder API-Contract-Version, wo Mutationskoerper existieren).

  **Fokus A — Fertigation Inflow/Runoff (neu eingebaut):**
  End-to-End Evidence: UI (`FertigationPairWidget`, `useFertigationKPIs`), Dashboard-Widget-Registry/Konfiguration,
  REST-Clients unter `El Frontend/src/api/`, Server-Handler/Services/Models unter `El Servador/god_kaiser_server/`,
  DB-Migrationen/ORM-Modelle (Sensor-Messung, Metadaten, ggf. `measurement_role` oder dokumentierte Alternative),
  WebSocket-/Realtime-Pfade (Updates, Staleness), MQTT-Ingest falls betroffen.
  IST vs. Doku: `docs/FERTIGATION_WIDGET_INTEGRATION.md`, `El Frontend/src/components/dashboard/widgets/README.md`,
  serverseitige Analyse unter `El Servador/god_kaiser_server/docs/analyse/` (falls vorhanden) — **Luecken** explizit benennen, nicht still schliessen.

  **Fokus B — Frontend-Doppelungen und Kanal-Trennung:**
  Suche nach doppelten Datenquellen (z. B. parallele REST-Polls vs. WS vs. Store-Duplikate), mehrfache KPI-Berechnung
  fuer dieselbe physikalische Groesse, doppelte Listener ohne `onUnmounted`-Cleanup, mehrdeutige `data-testid` in Listen.
  Interne Kommunikation (Pinia/Composables) vs. externe API/WebSocket: eine **klare** Datenfluss-Beschreibung im Bericht
  mit Datei:Zeilen-Evidence.

  **Fokus C — Verbesserungen nur dort, wo Evidence kritische Luecke zeigt:**
  Kleine, chirurgische Aenderungen bevorzugen (Logging-Felder, Header-Propagation, einheitliche IDs in Handler-Kette,
  strukturierte Server-Logs fuer Mutationspfade). Kein Greenfield-Refactor ohne VERIFY-Gate.

  **Ausgabe:** Kanonischer Bericht unter `target_docs[0]`; bei aktiven Code-Paketen Run-Artefakte unter
  `.claude/reports/current/auto-debugger-runs/phase0-domain-events-fertigation-trace-2026-04-14/` inkl.
  `FEHLER-REGISTER.md` wenn Code-PKGs angefasst werden (eine Evidenzzeile pro relevantem Befund).

forbidden: |
  Keine Secrets in Berichten oder Commands. Keine Breaking Changes an REST/MQTT/WebSocket/DB-Contracts ohne separates Gate
  und explizite Doku im Bericht. Produktive Code-Aenderungen nur auf Branch `auto-debugger/work` (Basis: Default-Branch im
  Checkout verifizieren — wenn das Projekt `main` statt `master` nutzt, im Bericht vermerken und Policy konsistent halten).
  Git: kein `git push`, kein Force-Push, kein `reset --hard` auf geteilten Branches; Bash nur fuer eingeschraenktes Git
  (branch/status/checkout `auto-debugger/work`, read-only log/diff). Keine Pfade oder Repo-Namen ausserhalb der Auto-one-Wurzel.
  `vue-tsc`/Playwright/E2E nur mit ehrlichen Voraussetzungen (kein „gruen“ behaupten ohne laufenden Stack wo noetig).

done_criteria: |
  - Datei `docs/analysen/BERICHT-phase0-domain-events-fertigation-inflow-outflow-traceability-2026-04-14.md` existiert und enthaelt:
    (1) Inventar heisser Mutations-/Persistenzpfade mit Korrelation/Aggregat/Schema-Version — **IST** mit Code-Zitaten
        (Dateipfade relativ Auto-one-Wurzel),
    (2) Kapitel Fertigation Inflow/Runoff: Datenfluss UI → API → Server → DB → Events/WS zurueck zum UI; Vollstaendigkeit
        und Inkonsistenzen (inkl. fehlende Server-DB-Unterstuetzung falls Docs mehr versprechen als Code liefert),
    (3) Kapitel Frontend-Doppelungen: mindestens drei gezielte Grep/Read-Nachweise oder explizit „keine Befunde“ mit Suchraum,
    (4) Priorisierte Empfehlungsliste (P0/P1) und — falls Code geaendert wurde — Verweis auf `TASK-PACKAGES.md` /
        `VERIFY-PLAN-REPORT.md` bzw. erneuter verify-plan-Lauf laut Strenge in dieser Steuerdatei,
    (5) BLOCKER-Abschnitt falls Umsetzung ohne Produkt-Gate nicht moeglich ist.
  - Wenn Code geaendert wurde: Aenderungen auf `auto-debugger/work`; `FEHLER-REGISTER.md` im Run-Ordner gefuehrt;
    nach nennenswerter PKG-Aenderung VERIFY-Plan aktualisiert oder erneut ausgefuehrt (Evidence im Bericht).
---

# Steuerlauf — Phase 0 Domain-Events / Fertigation Inflow-Runoff / Traceability

**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Run-ID:** `phase0-domain-events-fertigation-trace-2026-04-14`

## Ziel (ein Satz)

Rueckverfolgbare Mutations- und Messdatenketten fuer **Fertigation Inflow/Runoff** und verwandte **heisse Pfade** belegen,
Frontend-Doppelungen und Kanalbrueche eliminieren oder dokumentieren, Phase-0-Korrelation (**correlation_id**,
**Aggregate-ID**, **Schema-Version**) **postgres-treu** verbessern.

## Runbook (imperativ)

1. **Repo-Lage:** Verzeichnisstruktur `El Servador/god_kaiser_server`, `El Frontend`, Firmware nur wenn MQTT/Ingest
   fuer Fertigation-Messungen relevant — sonst „nicht im Scope“ mit Evidence.

2. **Grep/Read (Evidence-first):**
   - `inflow`, `runoff`, `fertigation`, `FertigationPair`, `useFertigationKPIs`, `measurement_role`
   - `correlation_id`, `request_id`, `X-Correlation`, `x-request-id` (Schreibweise laut IST-Code)
   - WebSocket-Subscribe/Unsubscribe: `onUnmounted` an relevanten Fertigation-/Dashboard-Komponenten pruefen.

3. **Kette Inflow/Runoff:** Von `FertigationPairWidget.vue` und `useFertigationKPIs.ts` zu API-Modulen unter
   `El Frontend/src/api/`; von dort zu Server-Routen/Services; DB-Layer (Tabellen, Migrationen) — jede Luecke als BLOCKER
   oder P0 im Bericht.

4. **Mutationspfade (Phase 0):** Mindestens: Sensor-Anlage/-update, Kalibrierung falls Fertigation beruehrt,
   Dashboard-Widget-Persistenz, relevante POST/PATCH/DELETE — pro Pfad dokumentieren, ob IDs durchgereicht werden und wo
   sie verloren gehen.

5. **Doppelungen:** Pruefen, ob KPI-Werte sowohl aus Zone-Aggregation als auch aus Widget-spezifischem Fetch kommen;
   ob dieselbe Messung in zwei Stores gespiegelt wird; ob Reload-Buttons parallele Requests ohne Abort ausloesen.

6. **Verbesserung:** Nur nach Nachweis — kleine Patches (Logging, Header, einheitliche Felder in JSON-Responses,
   strukturierte Server-Logs). Danach `ruff`/gezielt `pytest` Server; `vue-tsc --noEmit` Frontend — Ergebnis ehrlich im Bericht.

7. **Paketdisziplin:** Wenn mehr als triviale Aenderungen: `TASK-PACKAGES.md` → verify-plan → `VERIFY-PLAN-REPORT.md` gemaess
   Repo-SOLL; Orchestrator-Output-Block nutzen wenn im Skill vorhanden.

## Aktivierung (fuer Robin — ein Satz Kontext beim Start)

Bitte `auto-debugger` gemaess dieser Steuerdatei: Phase-0-Traceability und Fertigation Inflow/Runoff end-to-end pruefen;
keine API-Breaks ohne Gate; Abnahme: Bericht unter `docs/analysen/` mit Evidence, P0/P1-Liste und BLOCKER falls noetig.

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-phase0-domain-events-fertigation-inflow-outflow-traceability-2026-04-14.md
Bitte Steuerlauf: Phase 0 Domain-Events / Fertigation Inflow-Runoff / Traceability und Frontend-Doppelungen; Evidence-only Analyse zuerst, dann chirurgische Fixes auf auto-debugger/work.
```
