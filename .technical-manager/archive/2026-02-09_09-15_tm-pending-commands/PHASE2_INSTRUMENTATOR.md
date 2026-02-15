# Phase 2.1: Prometheus FastAPI Instrumentator

**Datum:** 2026-02-09
**Agent:** server-dev
**Status:** COMPLETED

---

## Zusammenfassung

prometheus-fastapi-instrumentator v7.1.0 und psutil v5.9.8 installiert.
Manueller String-basierter /metrics-Endpoint durch Instrumentator + Custom Gauges ersetzt.

## Vorher (IST-Zustand)

- `/api/v1/health/metrics` in `health.py:351-423` baute 7 Metriken als Rohtext-Strings
- Kein `prometheus-fastapi-instrumentator` in pyproject.toml (nur `prometheus-client`)
- Kein `psutil` in pyproject.toml (nur `try/except ImportError` Fallback)
- 0 HTTP-Metriken (Duration, Request-Count, Size)
- ~7 Metriken-Zeilen insgesamt

## Nachher (SOLL-Zustand)

- **78 Metriken-Zeilen** (vorher 7) via Instrumentator
- HTTP-Metriken: `http_requests_total`, `http_request_duration_highr_seconds`, `http_request_size_bytes`, `http_response_size_bytes`, `http_request_duration_seconds`
- Custom Gauges (7): `god_kaiser_uptime_seconds`, `god_kaiser_cpu_percent`, `god_kaiser_memory_percent`, `god_kaiser_mqtt_connected`, `god_kaiser_esp_total`, `god_kaiser_esp_online`, `god_kaiser_esp_offline`
- Python Runtime: `python_gc_*`, `python_info`, `process_*`
- Prometheus Target: UP, scrape 5.6ms, kein Fehler

## Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `El Servador/god_kaiser_server/pyproject.toml` | +`prometheus-fastapi-instrumentator = "^7.0.0"`, +`psutil = "^5.9.0"` |
| `El Servador/god_kaiser_server/poetry.lock` | Regeneriert via `poetry lock` |
| `El Servador/god_kaiser_server/src/core/metrics.py` | **NEU** - Custom Gauge Definitionen + Update-Logik |
| `El Servador/god_kaiser_server/src/main.py` | +`import time`, +Instrumentator expose, +Metrics Scheduler Job |
| `El Servador/god_kaiser_server/src/api/v1/health.py` | Manueller /metrics Endpoint ENTFERNT, psutil try/except zu direktem Import |

## Architektur-Entscheidungen

1. **Eigenes `core/metrics.py` Modul** statt Gauges in health.py
   - Saubere Trennung: Gauge-Definitionen sind Module-Level (einmalig registriert)
   - Update-Logik isoliert, testbar
   - Kein circular dependency Risiko

2. **Scheduler-Job statt Request-basiertes Update**
   - Gauges werden alle 15s via `monitor_prometheus_metrics` Job aktualisiert
   - Verhindert DB-Queries bei jedem Prometheus-Scrape
   - Job-ID: `monitor_prometheus_metrics`, Kategorie: `MONITOR`

3. **Instrumentator expose auf `/api/v1/health/metrics`**
   - Gleicher Pfad wie alter manueller Endpoint
   - Prometheus-Config muss NICHT geaendert werden
   - Custom Gauges werden automatisch aus Default-Registry mit ausgeliefert

## Verifikation

```
# Metriken-Count
curl -s http://localhost:8000/api/v1/health/metrics | grep "^[a-z]" | wc -l
Ergebnis: 78

# HTTP-Metriken
curl -s http://localhost:8000/api/v1/health/metrics | grep "http_request"
Ergebnis: http_requests_total, http_request_duration_*, http_request_size_bytes vorhanden

# Custom Gauges
curl -s http://localhost:8000/api/v1/health/metrics | grep "god_kaiser"
Ergebnis: Alle 7 Gauges vorhanden mit korrekten Werten

# Prometheus Target
curl -s http://localhost:9090/api/v1/targets | grep -A5 "el-servador"
Ergebnis: health="up", lastError=""
```

## Korrekturen gegenueber TM-Plan

| TM-Annahme | Realitaet | Korrektur |
|-------------|-----------|-----------|
| prometheus-fastapi-instrumentator in pyproject.toml | Nur prometheus-client vorhanden | Dependency manuell hinzugefuegt |
| psutil implizit vorhanden | Nicht in pyproject.toml | Explizit als Dependency hinzugefuegt |
| /metrics Endpoint bei Z.240-290 | Tatsaechlich bei Z.351-423 | Korrekte Zeilen bearbeitet |
| poetry.lock kompatibel | Lock-File musste regeneriert werden | `poetry lock` ausgefuehrt |
