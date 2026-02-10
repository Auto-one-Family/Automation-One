# Grafana Alerting - IMPLEMENTIERT (Phase 1)

**Datum:** 2026-02-09
**Auftrag:** 3.2 Grafana Alerting (Verifikation + Plan + Implementierung)
**Typ:** Verify + Plan + Implement
**Agent:** Claude Code (system-control + server-debug + Web-Recherche)
**Basis-Report:** grafana-alerting-analysis.md
**Status:** IMPLEMENTIERT UND VERIFIZIERT

---

## 1. Phase A: Provisioning-Format Verifizierung

### Datasource UIDs (VERIFIZIERT)

| Datasource | UID in `datasources.yml` | UID in Alert-Rules | Match |
|------------|--------------------------|-------------------|-------|
| Prometheus | `prometheus` | `prometheus` | YES |
| Loki | `loki` | (nicht verwendet) | n/a |
| Expression | `__expr__` (built-in) | `__expr__` | YES (Grafana Docs bestaetigt) |

### Ordner-Status (NACH Implementierung)

| Pfad | Status |
|------|--------|
| `docker/grafana/provisioning/datasources/` | Existiert |
| `docker/grafana/provisioning/dashboards/` | Existiert |
| `docker/grafana/provisioning/alerting/` | **NEU ERSTELLT** |
| `docker/grafana/provisioning/alerting/alert-rules.yml` | **NEU ERSTELLT** |

### Grafana-Version Kompatibilitaet

- **Version:** 11.5.2 (live verifiziert via `/api/health`)
- **Unified Alerting:** Default seit 9.x - aktiv ohne explizite Config
- **`apiVersion: 1`:** Vollstaendig unterstuetzt
- **Scheduler-Interval:** 10s (evaluation intervals muessen Vielfache von 10s sein)

**ERGEBNIS Phase A: Alle Voraussetzungen erfuellt.**

---

## 2. Phase B: Alert-Rules Validierung

### Live Prometheus-Daten (alle Queries verifiziert)

| Metric | PromQL | Live-Wert | Status | Scrape-Target |
|--------|--------|-----------|--------|---------------|
| Server Up | `up{job="el-servador"}` | `1` | OK | el-servador:8000 |
| MQTT Connected | `god_kaiser_mqtt_connected` | `1` | OK | el-servador:8000 |
| Database Up | `pg_up` | `1` | OK | postgres-exporter:9187 |
| Memory % | `god_kaiser_memory_percent` | `21.7` | OK | el-servador:8000 |
| ESP Offline | `god_kaiser_esp_offline` | `22` | OK | el-servador:8000 |
| ESP Total | `god_kaiser_esp_total` | `100` | OK | el-servador:8000 |

### mosquitto_exporter Status

- **NICHT implementiert** (kein Service in docker-compose.yml)
- **Keine 6. Rule** - wird erst nach Auftrag 3.1 ergaenzt

**ERGEBNIS Phase B: Alle 5 Metriken existieren und liefern plausible Werte.**

---

## 3. Bugs im Erstanalyse-Report (ALLE KORRIGIERT)

Waehrend der Implementierung wurden 3 Fehler im urspruenglichen YAML entdeckt und behoben:

### Bug 1: Rule 1 fehlende Threshold-Expression (aus Erstanalyse)

**Problem:** `condition: A` zeigt auf rohe PromQL-Query → feuert bei UP-State!
**Fix:** 3-stufige Pipeline mit Reduce + Threshold, `condition: C`

### Bug 2: Evaluation Interval 15s ungueltig (aus Impl-Plan v1)

**Problem:** `interval: 15s` ist kein Vielfaches des Grafana-Scheduler-Intervals (10s)
**Fehler:** `interval (15s) should be non-zero and divided exactly by scheduler interval: 10`
**Fix:** `interval: 10s` fuer Critical, `interval: 1m` fuer Warnings (60s/10=6 ✓)

### Bug 3: 2-Stage-Pipeline braucht 3-Stage (aus Impl-Plan v2)

**Problem:** Threshold-Expression kann keine Zeitreihendaten verarbeiten
**Fehler:** `looks like time series data, only reduced data can be alerted on`
**Fix:** 3-stufige Pipeline: A (PromQL) → B (Reduce:last) → C (Threshold)

---

## 4. FINALE alert-rules.yml (DEPLOYED)

Die tatsaechlich deployete Datei: `docker/grafana/provisioning/alerting/alert-rules.yml`

**Struktur jeder Rule (3-stufige Pipeline):**
```
A: PromQL-Query (datasource: prometheus) → Zeitreihe
B: Reduce (datasource: __expr__, type: reduce, expression: "A", reducer: last) → Einzelwert
C: Threshold (datasource: __expr__, type: threshold, expression: "B") → Alert-State
condition: C
```

### 5 Rules (3 Critical, 2 Warning)

| # | UID | Title | PromQL (refId A) | Threshold (refId C) | Severity | for |
|---|-----|-------|------------------|---------------------|----------|-----|
| 1 | `ao-server-down` | Server Down | `up{job="el-servador"}` | lt 1 | critical | 1m |
| 2 | `ao-mqtt-disconnected` | MQTT Disconnected | `god_kaiser_mqtt_connected` | lt 1 | critical | 1m |
| 3 | `ao-database-down` | Database Down | `pg_up` | lt 1 | critical | 1m |
| 4 | `ao-high-memory` | High Memory Usage | `god_kaiser_memory_percent` | gt 85 | warning | 5m |
| 5 | `ao-esp-offline` | ESP Devices Offline | `god_kaiser_esp_offline > 0 and god_kaiser_esp_total > 0` | gt 0 | warning | 3m |

### Gruppierung

| Gruppe | Rules | Eval Interval |
|--------|-------|---------------|
| `automationone-critical` | 1, 2, 3 | 10s |
| `automationone-warnings` | 4, 5 | 1m |

### noDataState / execErrState

| Rule | noDataState | execErrState |
|------|-------------|--------------|
| Rules 1-3 (Critical) | `Alerting` | `Alerting` |
| Rules 4-5 (Warning) | `OK` | `Alerting` |

---

## 5. Verifikation (ERFOLGREICH)

### Grafana-Logs

```
provisioning.alerting: "starting to provision alerting"
provisioning.alerting: "finished to provision alerting"
```
Keine Fehler beim Provisioning.

### Grafana API - Alert States (live verifiziert)

| Rule | State | Erwartung | Korrekt |
|------|-------|-----------|---------|
| Server Down | **Normal** | Server laeuft → Normal | ✅ |
| MQTT Disconnected | **Normal** | MQTT connected=1 → Normal | ✅ |
| Database Down | **Normal** | pg_up=1 → Normal | ✅ |
| High Memory Usage | **Normal** | Memory 21.7% < 85% → Normal | ✅ |
| ESP Devices Offline | **Pending→Alerting** | 22 offline ESPs → Alerting nach 3m | ✅ |

### Grafana API - Provisioning

```
curl -s -u "admin:admin" "http://localhost:3000/api/v1/provisioning/alert-rules"
→ 5 Rules, alle mit provenance: "file"
```

### Bekannter Hinweis

- SMTP nicht konfiguriert → Grafana versucht Default-Email-Notifications und loggt Fehler
- Dies ist **harmlos** in Phase 1 (UI-only). Kein externer Contact-Point konfiguriert
- Fix: In Phase 2 korrekte Contact-Points definieren

---

## 6. Aenderungen gegenueber Erstanalyse-Report

| Aenderung | Grund |
|-----------|-------|
| 2-Stage → 3-Stage Pipeline (A→B→C) | Grafana Threshold braucht reduzierte Daten |
| `condition: B` → `condition: C` | Threshold ist jetzt refId C |
| `interval: 15s` → `interval: 10s` | Muss Vielfaches des 10s Scheduler-Intervals sein |
| `expression: "A"` in Reduce | Referenziert PromQL-Query |
| `expression: "B"` in Threshold | Referenziert Reduce-Output |
| Contact-Points + Notification-Policy entfernt | Phase 1: UI-only |

---

## 7. Phase 2 Vorbereitung (NICHT implementiert)

### Zusaetzliche Dateien

1. **`contact-points.yml`** - Webhook an Server
2. **`notification-policy.yml`** - Routing Critical vs Warning
3. **Server-Endpoint:** `POST /api/v1/health/alert-webhook`
4. **WebSocket-Event:** `alert:fired` / `alert:resolved`

### 6. Rule nach Auftrag 3.1

Wenn mosquitto_exporter implementiert ist, ergaenze in `automationone-critical`:

```yaml
# Rule 6: MQTT Broker Down
- uid: ao-mqtt-broker-down
  title: "MQTT Broker Down"
  condition: C
  data:
    - refId: A
      relativeTimeRange:
        from: 60
        to: 0
      datasourceUid: prometheus
      model:
        expr: "up{job=\"mqtt-broker\"}"
        intervalMs: 15000
        maxDataPoints: 43200
        refId: A
    - refId: B
      relativeTimeRange:
        from: 0
        to: 0
      datasourceUid: '__expr__'
      model:
        type: reduce
        expression: "A"
        reducer: last
        refId: B
    - refId: C
      relativeTimeRange:
        from: 0
        to: 0
      datasourceUid: '__expr__'
      model:
        type: threshold
        expression: "B"
        conditions:
          - evaluator:
              type: lt
              params: [1]
        refId: C
  noDataState: Alerting
  execErrState: Alerting
  for: 1m
  annotations:
    summary: "MQTT Broker (Mosquitto) nicht erreichbar"
    description: "mosquitto_exporter meldet Broker unreachable seit >1m"
  labels:
    severity: critical
    component: mqtt-broker
```

**Hinweis:** `job: mqtt-broker` muss dem `job_name` in `prometheus.yml` entsprechen.
**WICHTIG:** 3-Stage-Pipeline (A→B→C) mit `condition: C` verwenden!

---

## 8. Zusammenfassung

### Status: PHASE 1 IMPLEMENTIERT UND VERIFIZIERT

| Aspekt | Status |
|--------|--------|
| Datasource UIDs | ✅ Korrekt |
| PromQL Queries | ✅ Alle 5 live verifiziert |
| Provisioning-Format | ✅ 3-Stage Pipeline, Grafana 11.5.2, apiVersion: 1 |
| Deployment | ✅ Erfolgreich, alle 5 Rules aktiv |
| Alert-States | ✅ 4x Normal, 1x Alerting (ESP offline - erwartetes Verhalten) |
| Volume-Mount | ✅ `:ro` liest alerting/ korrekt |

### Erstellte Dateien

| Datei | Aktion |
|-------|--------|
| `docker/grafana/provisioning/alerting/alert-rules.yml` | **NEU** |

### Nicht implementiert (bewusst - Phase 2)

| Aspekt | Grund |
|--------|-------|
| mosquitto_exporter Rule 6 | Auftrag 3.1 noch nicht implementiert |
| contact-points.yml | Braucht Server-Webhook-Endpoint |
| notification-policy.yml | Braucht Contact-Points |

### Key Learning: Grafana Alerting Provisioning Format

Das von vielen Quellen (inkl. Grafana-Doku-Beispielen) gezeigte 2-Stage-Format (`condition: B` mit Threshold direkt auf PromQL) funktioniert NICHT in Grafana 11.5.2. Man MUSS eine 3-Stage-Pipeline verwenden:

```
A: PromQL Query → Zeitreihe
B: Reduce (expression: "A", reducer: last) → Einzelwert
C: Threshold (expression: "B", evaluator: lt/gt) → Alert
condition: C
```
