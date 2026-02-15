# KI-Audit: Loki Self-Referencing Loop Fix

**Kontext:** Grafana Dashboard "AutomationOne - Operations" verursacht Self-Referencing-Loop bei Loki-eigenen Logs
**Prüfumfang:** `docker/promtail/config.yml`, `docker/grafana/provisioning/dashboards/system-health.json`, `docker/grafana/provisioning/alerting/alert-rules.yml`
**Referenzen genutzt:** Promtail Pipeline Patterns, Dashboard JSON, Alert Rules
**Datum:** 2026-02-11

## Executive Summary

| Kategorie | Befunde | Schwere |
|-----------|---------|---------|
| 2.1 Plausibel aber falsch | 1 (Self-Referencing Loop) | Warnung |
| 2.6 Docker/Infrastruktur | 0 | - |
| 1.3 Falsche Verschachtelung | 0 | - |

## Befund

### 2.1 Plausibel aber falsch — Loki Self-Referencing Feedback Loop

**Wo:** `system-health.json` Panels 24 (Error Rate by Service) und 26 (Recent Error Logs)

**Mechanismus:**
1. Dashboard auto-refresh (10s) sendet LogQL-Queries an Loki: `|~ "(?i)(error|exception|critical)"`
2. Loki loggt jeden API-Call als `level=info` mit vollem Query-Text: `query="{...} |~ \"error|...\""`
3. Promtail sammelt Loki's Container-Logs und sendet sie zurück an Loki
4. Dashboard-Query matcht die eigenen Query-Stats-Lines, weil der TEXT `error` enthält
5. Ergebnis: ~380 falsche Matches, stetig wachsend

**Nicht betroffen:**
- Panel 4 (Frontend Errors): filtert nur `compose_service="el-frontend"` → kein Loop
- Alert Rules: nutzen ausschließlich Prometheus-Metriken, keine Loki-Queries
- Panel 25 (Log Volume by Service): kein Error-Keyword-Filter → kein Loop

## Durchgeführte Korrekturen

### Fix 1: Promtail Drop-Stage (Primary)

**Datei:** `docker/promtail/config.yml`
**Pattern:** Analog zu el-servador Health-Check-Drops (Stage 2a)
**Änderung:** Neuer Stage 5 — Match `compose_service="loki"`:
- 5a: `logfmt` Parser extrahiert `level` Label (Bonus: ermöglicht `{compose_service="loki", level="error"}` Queries)
- 5b: Drop `level=info` Lines mit `query="{` Pattern (Query-Execution-Stats)
- Error-Level Query-Logs (z.B. malformed queries) bleiben erhalten

**Regex:** `'.*level=info.*query="\{.*'`
- Matcht: `level=info ... query="{compose_service=~\"loki\"} |~ \"error\"" ...`
- Matcht NICHT: `level=error ... msg="error processing query" ...`

### Fix 2: Dashboard Line-Filter (Defense-in-Depth)

**Datei:** `docker/grafana/provisioning/dashboards/system-health.json`
**Änderung:** `!= "|~"` in Panel 24 und 26 nach dem Error-Keyword-Filter

- Panel 24: `... |~ "(?i)(error|exception|critical)" != "|~" [$interval] ...`
- Panel 26: `... |~ "(?i)(error|exception|fail|critical)" != "|~"`

**Warum `!= "|~"`:**
- `|~` ist LogQL-Pipeline-Syntax — kommt in Application-Logs (el-servador, el-frontend, mqtt-broker) nicht vor
- Exakt die Zeichen die in Loki's embedded Query-Strings den Self-Reference verursachen
- `!=` ist String-Literal-Match (kein Regex), keine Escaping-Probleme in JSON

## Nicht betroffen (kurz)

- 1.1 Halluzinierte APIs: Alle verwendeten LogQL/PromQL-Funktionen existieren
- 2.4 Counter vs Gauge: Dashboard korrekt (rate() für Counter, direkt für Gauges)
- 5.x Grafana-spezifisch: fieldConfig/options korrekt, Thresholds mit `null` Basis
- 8.x ESP32: Kein ESP-Code im Prüfumfang

## Verifikation nach Deploy

```bash
# 1. Promtail + Grafana neu starten
docker compose restart promtail grafana

# 2. Warten (30s), dann Loki Self-Query prüfen
# Dashboard öffnen → $service = "loki" → "Error Rate by Service" sollte ~0 zeigen

# 3. Test: Echte Fehler werden noch erkannt
# In einem Service einen echten Error loggen und prüfen ob er im Dashboard erscheint
```
