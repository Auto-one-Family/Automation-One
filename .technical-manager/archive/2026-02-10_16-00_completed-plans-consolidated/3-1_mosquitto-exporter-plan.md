# Auftrag 3.1: mosquitto_exporter – Analyse, Verifikation & Implementierungsplan
Datum: 2026-02-09
Typ: Analyse → Verify → Plan (ein Durchgang)
Priorität: 1 von 4 (zuerst)

## Context

Erstanalyse abgeschlossen (Report: `mosquitto-exporter-analysis.md`). Empfehlung: Go für `sapcc/mosquitto-exporter:v0.8.0`. Dieser Auftrag baut darauf auf: prüfe den Report gegen die Realität, schließe offene Punkte, erstelle einen implementierungsfertigen Plan.

Bekannte Facts aus dem Report:
- Mosquitto 2.0.22, $SYS vollständig aktiv
- Exporter: sapcc/mosquitto-exporter:v0.8.0, scratch-Image, 3.2 MB, Port 9234
- Kein Healthcheck möglich (scratch hat keine Shell)
- Job-Name: `mqtt-broker` (benennt den Service, nicht den Exporter)
- Dashboard: 4 Tier-1 Panels empfohlen (ESP Fleet Health, Message Rate, Messages Dropped, Broker Up)

Offene Punkte aus TM-Review:
- Live-Snapshot zeigte ~300 msg/s bei 1 Client – ungewöhnlich, Ursache klären
- Dashboard-Panels: Wie in system-health.json einfügen? Neue Row? Separates Dashboard?
- Prometheus-Config: Exakte Platzierung des neuen scrape_config Blocks

## Aufgabe

Drei Phasen in einem Durchgang:

### Phase A: Analyse verifizieren

1. Prüfe ob `sapcc/mosquitto-exporter:v0.8.0` auf Docker Hub verfügbar und pullbar ist
2. Prüfe die aktuelle `docker-compose.yml` – wo genau wird der neue Service-Block eingefügt? Nach welchem Service? Welche Zeilennummer?
3. Prüfe `docker/prometheus/prometheus.yml` – aktuelle scrape_configs, wo kommt der neue Job hin?
4. Prüfe `docker/grafana/provisioning/dashboards/system-health.json` – aktuelle Panel-IDs, nächste freie ID, Layout-Struktur (gridPos)
5. MQTT-Broker kurz subscriben: `docker exec automationone-mqtt mosquitto_sub -t '$SYS/broker/clients/connected' -C 1` – funktioniert $SYS?

### Phase B: Offene Punkte klären

1. Message-Rate: Subscribiere kurz auf `$SYS/broker/load/messages/received/1min` – ist die Rate noch bei ~300 msg/s oder war das ein Snapshot-Artefakt?
2. Healthcheck: Bestätige dass kein HC-Workaround nötig ist. Prüfe ob `up{job="mqtt-broker"}` ausreicht als impliziter Health-Indikator
3. Dashboard-Strategie: Sollen MQTT-Panels in system-health.json (Row 2?) oder separates mqtt-dashboard.json?

### Phase C: Implementierungsplan erstellen

Erstelle einen exakten, zeilenweisen Implementierungsplan mit:
1. Exakter Service-Block für docker-compose.yml (mit Zeilennummer wo er eingefügt wird)
2. Exakter scrape_config Block für prometheus.yml (mit Zeilennummer)
3. Exakte Panel-Definitionen für system-health.json (mit Panel-IDs, gridPos, Queries)
4. Volume-Definition (falls nötig – Exporter braucht vermutlich kein Volume)
5. Reihenfolge der Implementierungsschritte
6. Verifikations-Commands nach Implementation

Der Plan muss so präzise sein, dass ein Dev-Agent ihn ohne Rückfragen umsetzen kann.

## Agents (der Reihe nach)

/system-control
Modus: Vollanalyse + Planentwicklung. Du hast Zugriff auf docker-compose.yml, prometheus.yml, system-health.json. Prüfe alles gegen den Live-Zustand. Erstelle den vollständigen Implementierungsplan.

/mqtt-debug
Prüfe den MQTT-Broker: $SYS-Topics verifizieren, aktuelle Message-Rates lesen, Client-Count bestätigen. Dokumentiere den Baseline-Zustand VOR der Exporter-Integration.

## Erfolgskriterium

Report enthält:
- Bestätigung dass alle Annahmen aus der Erstanalyse korrekt sind (oder Korrekturen)
- Vollständiger Implementierungsplan mit exakten Zeilennummern und Code-Blöcken
- MQTT-Baseline-Snapshot (Clients, Message-Rate, Subscriptions)
- Verifikations-Checkliste

## Report zurück an
.technical-manager/inbox/agent-reports/mosquitto-exporter-impl-plan.md
