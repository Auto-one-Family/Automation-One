---
run_mode: artefact_improvement
incident_id: ""
run_id: loki-logql-ea5484-2026-04-11
order: incident_first
target_docs:
  - docs/analysen/BERICHT-cluster-ESP_EA5484-kalibrierung-mqtt-offline-monitoring-2026-04-11.md
scope: |
  **Problemcluster:** Observability-Lücke zwischen **Loki** (`/ready` OK) und **fehlschlagender
  LogQL-Abfrage** (Parser/Label-Mismatch) für die Episode EA5484 — pragmatischer IST-Check bisher
  nur über `docker logs`.

  **Gesammeltes Wissen (Bericht §6):**
  - Loki antwortet auf `http://localhost:3100/ready`.
  - Schnelle `curl.exe` LogQL-Abfrage scheiterte mit Parserfehler (`unexpected IDENTIFIER`) —
    vermutlich falsche **Stream-Selektoren** (Label `container` vs. tatsächliche Pipeline-Job-Labels).
  - Empfohlener IST-Check im Bericht: `docker logs automationone-server --since 25m` und
    `docker logs automationone-mqtt --since 25m`.
  - Follow-up laut Bericht: Grafana/Prometheus (`up`, MQTT-Exporter, Container-CPU, WLAN-RSSI falls
    exportiert) — **außerhalb** dieses Clusters nur erwähnen, wenn in TASK-PACKAGES explizit.

  **Ziel dieses Laufs (Analyseauftrag → Implementierungsplan):**
  1) Repo / Ops-Doku: Wo ist Loki/Promtail (oder Alloy) konfiguriert? Welche **Labels** landen auf
     Streams für `automationone-server` und `automationone-mqtt`? **Keine erfundenen** Labelnamen —
     nur nach `Glob`/`Grep`/`Read`.
  2) Additiv: BERICHT-Abschnitt 6 um **eine funktionierende** Beispiel-LogQL-Zeile **oder** um
    „BLOCKER: keine Promtail-Config im Repo“ erweitern.
  3) Wenn Infra- oder Doku-Code geändert werden soll: TASK-PACKAGES unter `run_id`-Ordner + verify-plan
    wie im Artefakt-Modus üblich.

  **Ausgabeort Pakete/Verify:** `.claude/reports/current/auto-debugger-runs/loki-logql-ea5484-2026-04-11/`
forbidden: |
  Keine Secrets (Loki basic auth, API keys) in Markdown. Kein Commit auf master.
  Keine Produkt-Änderung an El Servador/El Frontend **nur** für Loki-Labels ohne klares PKG —
    Fokus ist Observability-Konfiguration/Doku; Server-Code nur wenn verify-plan das bestätigt.
done_criteria: |
  - BERICHT §6: entweder verifizierte funktionierende LogQL + kurze Erklärung der Label-Wahl,
    oder dokumentierter BLOCKER mit tatsächlich gelesener Config-Pfadliste (oder „nicht im Repo“).
  - Optional: `auto-debugger-runs/loki-logql-ea5484-2026-04-11/` mit TASK-PACKAGES + VERIFY-PLAN-REPORT
    wenn Code/Doku-Anpassungen geplant sind; sonst reine BERICHT-Ergänzung als Abnahme.
---

# STEUER — Artefakt: Loki/LogQL-Korrelation für EA5484-Episode

> **Chat-Start:** `@.claude/auftraege/auto-debugger/inbox/STEUER-artefact-loki-logql-monitoring-ea5484-2026-04-11.md`  
> **Git:** `git checkout auto-debugger/work` nur bei Schreib-PKG an Repo-Dateien.

## Problemcluster (kurz)

Ohne **korrekte LogQL** bleibt die Korrelation für Folgeincidents bei **Docker-Logs** statt auf
einheitlicher Observability-Schicht — reproduzierbar schlechter für TM und auto-debugger
(CORRELATION-MAP).

## Erste Analyse (Vorarbeit)

1. **Ist-Zustand:** Loki healthy ≠ Queries korrekt; meist **Docker_sd**-Labelnamen oder `{job=…}` vs `{container_name=…}`.  
2. **Minimalziel:** Eine Query, die **beide** Dienste Server und MQTT im gleichen Zeitfenster filtert
   (oder zwei Queries mit dokumentiertem Grund).  
3. **Abgrenzung:** Prometheus/Grafana ist **Phase 2** — nur erwähnen, wenn im selben Repo
   Dashboards als Code liegen und verify-plan das bestätigt.

## Spezialisten-Hinweis

- **system-control / meta-analyst (read-only):** Wo liegt die Stack-Definition (`docker-compose`,
  `monitoring/`, `grafana/`)?  
- **verify-plan:** Jede vorgeschlagene LogQL gegen lokale oder dokumentierte Label-Ist prüfen.

---

## Vollständiger Auftrag (Ausführungsbrief)

**Auftraggeber:** Steuerdatei `STEUER-artefact-loki-logql-monitoring-ea5484-2026-04-11.md` (Modus `artefact_improvement`).  
**Zieldokument:** `docs/analysen/BERICHT-cluster-ESP_EA5484-kalibrierung-mqtt-offline-monitoring-2026-04-11.md` — **additiv** Abschnitt **§6** ergänzen oder präzisieren.  
**Optionaler Paket-Ordner:** `.claude/reports/current/auto-debugger-runs/loki-logql-ea5484-2026-04-11/` nur bei geplanten Repo-Änderungen an Alloy/Loki/Scripts plus `TASK-PACKAGES.md` und `VERIFY-PLAN-REPORT.md`; sonst reine BERICHT-Ergänzung als Abnahme.

### 1. Kontext (IST aus Repo, nicht erfunden)

- **Stack:** `docker-compose.yml` — Profile **`monitoring`**: `automationone-loki` (Port **3100**), `automationone-alloy` (versendet Container-Logs). Promtail ist archiviert; **Alloy** ist SSOT (`docker/alloy/config.alloy`, Kopfkommentar Zeilen 15–27).
- **Indizierte Labels** für Stream-Selektoren: `compose_service`, `container`, `stream`, `compose_project`, sowie extrahiert **`level`** (siehe `config.alloy` Kommentar „Label Strategy“).
- **Falscher Selektor = Parserfehler:** Häufig `container=` im Sinne von Docker-Compose erwartet, tatsächlich heißt der Compose-Service-Selektor **`compose_service`** (nicht zwingend identisch mit dem String `container`).
- **Hilfsskript:** `scripts/loki-query.ps1` nutzt bereits funktionierende Queries mit `{compose_service=~".+"}` — daran orientieren.

### 2. Arbeitsauftrag (Schritte)

1. **Vorbedingung:** Monitoring-Stack läuft (`make monitor-up` bzw. `docker compose --profile monitoring up -d`). Loki-Ready: `http://127.0.0.1:3100/ready` (Windows: `127.0.0.1` bevorzugt, siehe Skript-Kommentar).
2. **Config lesen (Pflicht):** `docker/alloy/config.alloy` — für `el-servador` und `mqtt-broker` die jeweiligen `stage.match { selector = "{compose_service=\"…\"}" }`-Blöcke notieren; daraus ableiten, welche **`compose_service`-Strings** in Loki landen (typisch Compose-Service-Namen aus `docker-compose.yml`, z. B. `el-servador`, `mqtt-broker`).
3. **LogQL verifizieren:** Mindestens **zwei** funktionierende Beispielqueries (eine pro Dienst oder eine kombinierte mit `|=`), per `curl`/`Invoke-RestMethod` gegen `/loki/api/v1/query_range` **oder** `.\scripts\loki-query.ps1 esp ESP_EA5484` bzw. angepasste Query — Ergebnis muss Zeilen liefern, wenn im Fenster Logs existieren.
4. **BERICHT §6 schreiben:**  
   - Kurze Erklärung: welche Labels **indiziert** sind und warum `{container="…"}` ggf. scheitert.  
   - **Copy-paste-fähige** LogQL-Zeile(n) mit **`compose_service`** (und optional `|= "ESP_EA5484"` für Korrelation), plus Zeitfenster-Hinweis (`start`/`end` in ns oder Grafana-Zeitauswahl).  
   - Wenn keine Queries trotz laufendem Stack funktionieren: **BLOCKER** mit Symptom, gelesenen Pfaden und nächstem Diagnose-Schritt (Alloy-Targets, `docker logs automationone-alloy`).
5. **verify-plan:** Wenn TASK-PACKAGES Code/Doku betreffen — Skill `verify-plan` ausführen; `VERIFY-PLAN-REPORT.md` im `run_id`-Ordner ablegen.

### 3. Beispiel-LogQL (Startpunkt — vor Abnahme gegen Live-Loki testen)

**Server (el-servador), letzte 15 Min, Zeilen die EA5484 erwähnen:**

```logql
{compose_service="el-servador"} |= "ESP_EA5484"
```

**MQTT-Broker-Container-Logs:**

```logql
{compose_service="mqtt-broker"} |= "ESP_EA5484"
```

**Alle Compose-Services, ERROR-Level (analog `loki-query.ps1`):**

```logql
{compose_service=~".+"} | level="ERROR"
```

*Hinweis:* Exakte `compose_service`-Strings müssen mit `docker-compose.yml` (`services:`-Namen) und Alloy-`selector`-Blöcken übereinstimmen; bei Abweichung die **tatsächlichen** Stream-Labels über Grafana „Explore“ oder Loki `/label/compose_service/values` ermitteln und im BERICHT dokumentieren.

### 4. Verbotene / Grenzen

- Keine Secrets (Basic Auth, Tokens) in Markdown.  
- Kein Commit auf `master`; Schreibarbeit auf **`auto-debugger/work`**.  
- Keine El-Servador-/El-Frontend-**Produkt**-Änderung nur für Loki-Labels ohne separates PKG und verify-plan.

### 5. Abnahme (`done_criteria` — Checkliste)

- [ ] BERICHT §6: **funktionierende** LogQL (getestet) **oder** BLOCKER mit **gelesener** Config-Pfadliste.  
- [ ] Optional: Ordner `auto-debugger-runs/loki-logql-ea5484-2026-04-11/` mit TASK-PACKAGES + VERIFY-PLAN-REPORT bei geplanten Repo-Änderungen.  
- [ ] Verknüpfung zu Incident `INC-2026-04-11-ea5484-mqtt-transport-keepalive` nur als Querverweis (gleiche esp_id), ohne Themen zu vermischen.
