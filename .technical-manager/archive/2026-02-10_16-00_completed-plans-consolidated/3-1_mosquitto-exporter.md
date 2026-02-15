# Auftrag 3.1: mosquitto_exporter – Erstanalyse
Datum: 2026-02-09
Typ: Analyse (kein Code)

## Context

Der Monitoring-Stack läuft mit Prometheus, Loki, Promtail, Grafana. Prometheus scrapt aktuell 3 Targets: `el-servador` (78 Metriken via Instrumentator), `postgres` (postgres_exporter, `pg_up`), `prometheus` (Self-Monitoring).

MQTT-Broker (Mosquitto) hat **keine Prometheus-Metriken**. Dashboard Panel 2 zeigt nur `god_kaiser_mqtt_connected` – das ist eine Server-seitige Gauge die sagt ob der *Server* verbunden ist, nicht wie der *Broker* performt.

Fehlende Sichtbarkeit: Message-Rates, Client-Connections, Subscriptions, Retained Messages, Queue-Depth.

## Focus

1. **Mosquitto-Broker analysieren:** Welche Version läuft? Ist das `$SYS`-Topic aktiv? Welche Broker-internen Metriken sind über `$SYS/#` verfügbar?
2. **Exporter-Optionen evaluieren:** `sapcc/mosquitto-exporter` vs Alternativen. Docker-Image-Verfügbarkeit, Maintenance-Status, Kompatibilität mit unserer Mosquitto-Version.
3. **Integration bewerten:** Wie würde der Exporter in unseren Docker-Stack passen? Welches Profile (`monitoring`)? Welche Prometheus-Scrape-Config? Welche Dependencies?
4. **Dashboard-Panels vorschlagen:** Welche Metriken sind für ein Gewächshaus-IoT-System am wertvollsten? (Hint: Client-Connections = ESP32-Fleet-Gesundheit)

## Agents

**Schritt 1:** `/agent mqtt-debug` – MQTT-Broker-Analyse. Modus A. Prüfe `$SYS/#` Topics, Broker-Version, aktuelle Client-Connections, Message-Rates. Dokumentiere was der Broker nativ liefert.

**Schritt 2:** `/agent system-control` – Docker-Integration evaluieren. Prüfe verfügbare mosquitto_exporter Images, bewerte Kompatibilität. Skizziere docker-compose Ergänzung (NICHT implementieren). Prüfe ob Prometheus-Config Anpassungen nötig sind.

## Goal

Ein vollständiges Analyse-Dokument das folgende Fragen beantwortet:
- Welcher Exporter ist der beste Kandidat?
- Was kostet die Integration (Container-Ressourcen, Komplexität)?
- Welche Metriken bekommen wir und welche Dashboard-Panels ergeben Sinn?
- Gibt es Risiken oder Showstopper?

## Success Criterion

Report enthält: Broker-IST-Zustand, Exporter-Empfehlung mit Begründung, Skizze der Docker-Integration, vorgeschlagene Dashboard-Panels. Robin kann danach eine Go/No-Go-Entscheidung treffen.

## Report zurück an
.technical-manager/inbox/agent-reports/mosquitto-exporter-analysis.md
