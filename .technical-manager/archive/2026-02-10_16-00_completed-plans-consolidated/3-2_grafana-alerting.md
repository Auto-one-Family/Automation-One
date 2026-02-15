# Auftrag 3.2: Grafana Alerting – Erstanalyse
Datum: 2026-02-09
Typ: Analyse (kein Code)

## Context

Weder Prometheus noch Grafana haben Alert-Rules. Kein Alertmanager deployed. Kein Notification-Channel konfiguriert. Bei Serverausfall, DB-Disconnect oder MQTT-Verlust gibt es **keine automatische Warnung** – man muss das Dashboard manuell prüfen.

Verfügbare Metriken-Basis (aktuell):
- Prometheus: 78 Server-Metriken (HTTP, Custom Gauges), `pg_up` (postgres_exporter), Prometheus Self-Monitoring
- Loki: Strukturierte Logs aller 8 Container
- Custom Gauges: `god_kaiser_uptime_seconds`, `god_kaiser_cpu_percent`, `god_kaiser_memory_percent`, `god_kaiser_mqtt_connected`, `god_kaiser_esp_total/online/offline`

Grafana Version: 11.5.2 (Built-in Alerting verfügbar seit 9.x).

## Focus

1. **Grafana Built-in Alerting analysieren:** Welche Alerting-Features bietet Grafana 11.5.2 out-of-the-box? Provisioning via YAML/JSON möglich? Oder nur API/UI?
2. **Alert-Rules definieren:** Welche 4-6 Rules machen für unser System Sinn? Für jede Rule: Metrik-Query, Threshold, Evaluation-Interval, For-Duration, Severity.
3. **Notification-Strategie:** Welche Contact-Points sind sinnvoll? Webhook ist Minimum. Was ist provisionierbar ohne externen Service?
4. **Provisioning-Pfad:** Können Alert-Rules und Contact-Points als Files unter `docker/grafana/provisioning/` deployed werden, oder brauchen wir die Grafana API?

## Agents

**Schritt 1:** `/agent system-control` – Vollanalyse. Prüfe Grafana Alerting Provisioning-Möglichkeiten (Dateien unter `docker/grafana/provisioning/alerting/`). Prüfe bestehende Grafana-Config auf Alerting-relevante Settings. Analysiere die verfügbaren Metriken und schlage konkrete Alert-Rules vor mit exakten PromQL/LogQL-Queries.

**Schritt 2:** `/agent server-debug` – Prüfe ob der Server Health-Endpoints hat die als Alert-Basis taugen (z.B. `/api/v1/health/ready` mit Einzelchecks: database, mqtt, disk_space). Dokumentiere Response-Struktur und Timing.

## Goal

Ein Alerting-Konzept das folgende Fragen beantwortet:
- Welche Alert-Rules (mit exakten Queries und Thresholds)?
- Wie werden sie provisioniert (File vs API)?
- Welcher Notification-Channel (Webhook-URL, Log-basiert, oder anderes)?
- Was ist der minimale Aufwand für ein funktionierendes Warnsystem?

## Success Criterion

Report enthält: Liste von 4-6 Alert-Rules mit PromQL-Queries, Provisioning-Strategie (mit Dateipfaden), Notification-Konzept. Robin kann danach direkt einen Implementierungsauftrag formulieren lassen.

## Report zurück an
.technical-manager/inbox/agent-reports/grafana-alerting-analysis.md
