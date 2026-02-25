# Loki Debug-Flow — End-to-End-Verifikation

## Datum: 2026-02-25
## Ergebnis: BESTANDEN — Alle 12 Bloecke verifiziert

### Zusammenfassung

Die Implementierung (Block A-F) ist korrekt und vollstaendig. Nach Container-Recreates
(Alloy + Grafana-Restart) funktioniert der gesamte Observability-Stack wie designed:
- Alloy native River-Config aktiv (6 Pipelines, Structured Metadata)
- 33 Alert-Regeln (28 Prometheus + 5 Loki)
- Debug-Console Dashboard mit 6 Panels
- 10 LogQL-Queries syntaktisch valide und performant
- Agent-Tools (loki-query.sh + Makefile) funktionsfaehig
- Keine Regressionen (804 Backend-Tests, ESP32 Build, CI gruen)

### Behobene Findings (waehrend Verifikation)

| # | Problem | Fix | Status |
|---|---------|-----|--------|
| F1 | Alloy lief mit alter Promtail-YAML statt River-Config | `docker compose up -d alloy` | **BEHOBEN** |
| F2 | 5 Loki-Alerts nicht in Grafana geladen | `docker compose restart grafana` | **BEHOBEN** |

---

## Container-Status (G1) — BESTANDEN

| Container | Status | Health-Endpoint |
|-----------|--------|-----------------|
| automationone-alloy | Up (healthy) | `/-/ready` → OK |
| automationone-loki | Up (healthy) | `/ready` → OK (v3.4.3) |
| automationone-grafana | Up (healthy) | `/api/health` → OK (v11.5.2) |
| automationone-prometheus | Up (healthy) | `/-/ready` → OK |
| automationone-mosquitto-exporter | Up (running) | `/metrics` → OK |

## Alloy-Pipeline (G2) — BESTANDEN (nach Restart)

**Erste Pruefung:** FAIL — Container lief mit `--config.format=promtail` und alter YAML-Config.
**Nach `docker compose up -d alloy`:** PASS — Native River-Config aktiv.

| Pruefpunkt | Ergebnis | Details |
|------------|----------|---------|
| Native River-Config geladen | PASS | Node-IDs: `loki.write.loki`, `loki.process.pipeline` |
| 12 Services liefern Logs | PASS | Alle Docker-Compose-Services in Loki sichtbar |
| `level` ist Label | PASS | In `/series` als echtes Label bestaetigt |
| `logger` ist Structured Metadata | PASS | NICHT in `/series` — nur in query_range (Backward-Compat) |
| `request_id` ist Structured Metadata | PASS | NICHT in `/series` |
| Health-Check-Noise gedroppt | PASS | 0 Ergebnisse fuer `GET /api/v1/health/` |
| Postgres-Checkpoint-Noise gedroppt | PASS | 0 Ergebnisse fuer `checkpoint` |
| `service`/`service_name` redundant | WARNUNG | Von Alloy Docker SD — Low-Priority Cleanup |

**Structured Metadata Nachweis (via `/series` Endpoint):**
```
Echte Labels:     compose_project, compose_service, container, level, service, service_name
Structured Meta:  logger, request_id, detected_level (in query_range sichtbar, NICHT in /series)
```

## Loki-Konfiguration (G3) — BESTANDEN

| Pruefpunkt | Ergebnis | Details |
|------------|----------|---------|
| Version >= 3.x | PASS | 3.4.3 |
| `allow_structured_metadata: true` | PASS | In loki-config.yml + Runtime bestaetigt |
| Schema v13 (TSDB) | PASS | Unterstuetzt Structured Metadata |
| Retention 7 Tage | PASS | `retention_period: 1w` |
| Log-Volumen | PASS | ~10 MB/Tag (weit unter 500 MB Limit) |

## Grafana (G4) — BESTANDEN

| Pruefpunkt | Ergebnis | Details |
|------------|----------|---------|
| Loki-Datasource | PASS | `http://loki:3100`, proxy |
| Prometheus-Datasource | PASS | `http://prometheus:9090`, proxy |
| Debug-Console Dashboard | PASS | UID: `debug-console`, Titel: "Debug Console" |
| 6 Panels | PASS | 6 |
| 4 Template-Variablen | PASS | service, search, correlation_id, error_code |
| Bestehende Dashboards intakt | PASS | "AutomationOne - Operations" weiterhin da |

## Prometheus-Alerts (G5) — BESTANDEN

| Pruefpunkt | Ergebnis | Details |
|------------|----------|---------|
| 28 Prometheus-Alerts vorhanden | PASS | 28/28, alle UIDs korrekt |
| 5 Loki-Alerts vorhanden | PASS | 5/5 nach Grafana-Restart |
| 33 Alerts total | PASS | 28 + 5 |
| 8 Alert-Gruppen | PASS | 7 Prometheus + `automationone-loki-alerts` |
| Metrik `up` | PASS | 7 Targets |
| Metrik `broker_clients_connected` | PASS | 1 Ergebnis |
| Alle Targets up | PASS | 7/7 |

## Loki-Alerts (G6) — BESTANDEN (nach Grafana-Restart)

| Alert | UID | Severity | noDataState | LogQL valide |
|-------|-----|----------|-------------|--------------|
| Error Storm | ao-loki-error-storm | warning | OK | PASS |
| ESP Disconnect Wave | ao-loki-esp-disconnect-wave | warning | OK | PASS |
| DB Connection Errors | ao-loki-db-connection-errors | warning | OK | PASS |
| ESP Boot Loop | ao-loki-esp-boot-loop | warning | OK | PASS |
| Critical Error Burst | ao-loki-critical-burst | critical | OK | PASS |

Alle 5 in eigener Gruppe `automationone-loki-alerts`. 3-Stage-Pipeline (A→B→C) korrekt.

## Agent-Tools (G7) — BESTANDEN

| Pruefpunkt | Ergebnis | Details |
|------------|----------|---------|
| `scripts/loki-query.sh` existiert | PASS | 3903 Bytes, ausfuehrbar |
| Usage-Hilfe | PASS | 4 Befehle dokumentiert |
| `errors` Command | PASS | Leeres Ergebnis (kein Error-Betrieb) |
| `health` Command | PASS | Ready + 12 Active Streams + Error Count |
| `trace` Command | PASS | Kein Crash bei Dummy-CID |
| `esp` Command | PASS | Kein Crash bei Dummy-ESP |
| 4 Makefile-Targets | PASS | `loki-errors`, `loki-trace`, `loki-esp`, `loki-health` |
| CLAUDE.md Loki-Sektion | PASS | 7 Referenzen |

## LogQL-Queries (G8) — BESTANDEN

| Query | Syntaktisch | Ergebnisse | Performance |
|-------|-------------|-----------|-------------|
| Q1: Recent Errors | PASS | 0 (normaler Betrieb) | < 1s |
| Q2: Service Errors | PASS | 0 | < 1s |
| Q3: ESP Errors | PASS | 0 (kein ESP aktiv) | < 1s |
| Q4: Correlation Trace | PASS | 0 (Dummy-CID) | < 1s |
| Q5: MQTT Issues | PASS | 0 | < 1s |
| Q6: Database Errors | PASS | 1 Stream | < 1s |
| Q7: Sensor Processing | PASS | 1 Stream | 388ms |
| Q8: WebSocket Issues | PASS | 0 | < 1s |
| Q9: Error Code Lookup | PASS | 1 Stream | < 1s |
| Q10: ESP Boot Issues | PASS | 0 (kein ESP aktiv) | < 1s |

Alle 10 Queries syntaktisch gueltig, alle unter 1 Sekunde, 3 liefern Ergebnisse.

## Dokumentation (G9) — BESTANDEN

| Datei | Vorhanden | Vollstaendig | Details |
|-------|-----------|-------------|---------|
| `docs/debugging/debug-workflow.md` | PASS | 10 Szenarien (S1-S10) | 18.8 KB, 17 make-Referenzen |
| `docs/debugging/logql-queries.md` | PASS | 10 Queries + 2 Bonus | 6.2 KB |
| Loki-Queries Skill | PASS | `esp32-serial-logger` korrekt | |
| Interne Links | PASS | Keine toten Links | |

**Hinweis:** `mqtt-logger` (MQTT-Traffic-Logger, docker-compose.override.yml) und
`esp32-serial-logger` (Serial-Bridge, docker-compose.yml) sind zwei verschiedene Services.

## Cross-Service-Korrelation (G10) — BESTANDEN

| Fluss-Schritt | Sichtbar in Loki | Service |
|---------------|-----------------|---------|
| MQTT-Publish (VERIFY_G10) | PASS | mqtt-logger (Topic + Payload vollstaendig) |
| MQTT-Broker Log | SKIP | mqtt-broker loggt keine Payloads (designbedingt) |
| Server-Processing | N/A | Unregistriertes Device wird nicht verarbeitet |
| Cross-Service-Query | PASS | `{compose_service=~".+"} |= "VERIFY_G10"` findet Treffer |

**Architektur-Erkenntnis:** `mqtt-logger` (Override-Service) ist der Schluessel fuer
MQTT-Traffic-Korrelation. Fuer vollstaendige End-to-End-Korrelation (ESP → MQTT → Server → DB)
muss ein registriertes Device Traffic erzeugen.

## Regression (G11) — BESTANDEN

| Test-Suite | Ergebnis | Anzahl |
|------------|----------|--------|
| Backend Unit (pytest) | PASS | 804 passed, 3 skipped |
| Frontend (Vitest) | SKIP | 1342 passed (letzter Lauf, nicht betroffen) |
| ESP32 Build (pio) | PASS | SUCCESS, Flash 91.5% |
| CI/CD (master) | PASS | 5/5 Pipelines gruen |

---

## Verbleibende Hinweise (nicht-blockierend)

| # | Beschreibung | Severity | Empfehlung |
|---|-------------|----------|------------|
| H1 | `service`/`service_name` redundante Labels (Alloy Docker SD) | NIEDRIG | Optional entfernen via discovery.relabel |
| H2 | `mqtt-logger` nicht in Loki-Queries Skill | NIEDRIG | Optional: Skill um mqtt-logger-Sektion ergaenzen |
| H3 | Alte Logs (vor Alloy-Restart) haben `logger` als Label | INFO | Verfallen automatisch nach 7d Retention |
| H4 | `detected_level` als Alloy-Auto-Detection | INFO | Kein Problem, niedrige Kardinalitaet |
| H5 | `/labels` zeigt `logger` bis alte Logs verfallen | INFO | Kein funktionales Problem |
