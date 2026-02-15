# AutomationOne – KI-Debugging Implementierungsplan

**Datum:** 2026-02-10
**Kontext:** 8 ML-Debugging-Methoden, priorisiert nach Aufwand-Nutzen-Verhältnis
**Philosophie:** Claude-first, Online-Tools wo sinnvoll, lokale Vorbereitung für späteres Jetson-Training
**Voraussetzungen:** Monitoring-Stack läuft (Loki, Promtail, Prometheus, Grafana), 78 Metriken aktiv, Error-Code-Katalog vorhanden

---

## Gesamtübersicht & Reihenfolge

| Phase | Methode | Primäres Tool | Aufwand | Abhängigkeiten |
|-------|---------|--------------|---------|----------------|
| 1 | Log-Klassifikation | Claude API | 2-3 Tage | Error-Code-Katalog |
| 2 | Anomalie-Erkennung | Lokal + ggf. Datadog | 2-3 Tage | Phase 1 (Baseline) |
| 3 | Metrik-Korrelation | Python lokal + Grafana | 2-3 Tage | Prometheus-Daten (2+ Wochen) |
| 4 | Smart Alerting | Grafana ML | 1-2 Tage | Phase 3 (Korrelationen bekannt) |
| 5 | Sequenz-Pattern-Mining | Claude API + lokal | 3-4 Tage | Log-Historie (4+ Wochen) |
| 6 | Cross-Layer-Korrelation | Claude API | 3-5 Tage | Phase 1+5 (Patterns bekannt) |
| 7 | Predictive Failure Detection | Grafana ML / Amazon Lookout | 3-5 Tage | Metriken-Historie (8+ Wochen) |
| 8 | NL Debug Assistant | Claude API | 5-7 Tage | Phase 1-6 als Grundlage |

**Geschätzte Gesamtdauer:** 21-32 Tage (nicht am Stück – zwischen Phasen sammeln sich Daten)

---

## Phase 1 – Log-Klassifikation via Claude API

### Ziel
Jede Log-Zeile automatisch einem bekannten Fehlermuster zuordnen. Ersetzt manuelles Grep durch intelligente Klassifikation die auch Variationen erkennt.

### Warum Claude optimal ist
Du nutzt Claude bereits als TM und für Agenten. Die API ist dir vertraut, kein neues Tool nötig. Few-Shot-Prompting mit deinem Error-Code-Katalog reicht – kein Training, kein Modell-Management.

### Integration in AutomationOne

**Neuer Service-Endpoint in El Servador:**

```
POST /api/v1/ai/classify-logs
```

**Datenfluss:**

```
Loki (Log-Speicher)
  → El Servador fetcht Logs via Loki Push/Query API
  → Batched (50-100 Zeilen pro Request)
  → Claude API mit Error-Code-Katalog als System-Prompt
  → Ergebnis in DB speichern (neue Tabelle: ai_log_classifications)
  → WebSocket-Push ans Frontend (Echtzeit-Anzeige)
```

**System-Prompt-Struktur für Claude API:**

```
Du bist der Log-Klassifikator für AutomationOne.
Dein Error-Code-Katalog:
- 1000-1999: ESP32 Firmware Errors (MQTT_RECONNECT_LOOP, SENSOR_TIMEOUT, ...)
- 2000-2999: ESP32 Communication Errors
- 3000-3999: ESP32 Hardware Errors
- 4000-4999: ESP32 System Errors
- 5000-5699: Server Errors (DB_CONNECTION_POOL, HANDLER_CRASH, ...)

Für jede Log-Zeile antworte NUR mit JSON:
{"pattern": "ERROR_CODE_NAME", "confidence": 0.0-1.0, "category": "firmware|server|broker|frontend|unknown"}

Falls kein bekanntes Pattern: {"pattern": "UNKNOWN", "confidence": 0.0, "category": "unknown"}
```

**Architektur-Entscheidungen:**

1. **Neues Verzeichnis:** `El Servador/app/ai/` – eigener Namespace, keine Vermischung mit bestehender Logik
2. **Neue DB-Tabelle:** `ai_log_classifications` (log_line, pattern, confidence, category, timestamp, model_used)
3. **Adapter-Pattern:** `BaseAIServiceAdapter` → `ClaudeLogClassifier` (vorbereitet für spätere Adapter)
4. **Rate-Limiting:** Max 10 Requests/Minute an Claude API (Batch-Modus, 50-100 Zeilen pro Call)
5. **Caching:** Identische Log-Zeilen nicht erneut klassifizieren (Hash-basiert)

**Trigger-Modi:**

- **On-Demand:** Debug-Agent fragt Klassifikation an (REST-Call)
- **Scheduled:** Cron-Job alle 5 Minuten, klassifiziert neue Logs seit letztem Run
- **Event-basiert:** Bei ERROR/CRITICAL in Loki sofort klassifizieren (Webhook von Grafana Alert)

**Kosten-Abschätzung:**
- Claude Sonnet: ~$3/1M input tokens, ~$15/1M output tokens
- 100 Log-Zeilen ≈ 2000 tokens input + 500 tokens output ≈ $0.01 pro Batch
- Bei 50 Batches/Tag: ~$0.50/Tag, ~$15/Monat

**Verifikation:**
- Klassifikation von 100 bekannten Log-Zeilen → Accuracy >85%?
- Latenz pro Batch <3s?
- Unbekannte Patterns korrekt als UNKNOWN markiert?

**Deliverables:**
- `El Servador/app/ai/__init__.py`
- `El Servador/app/ai/adapters/base.py` (BaseAIServiceAdapter)
- `El Servador/app/ai/adapters/claude_adapter.py`
- `El Servador/app/ai/services/log_classifier.py`
- `El Servador/app/ai/models.py` (SQLAlchemy-Modelle)
- Alembic-Migration für `ai_log_classifications`
- API-Endpoint `/api/v1/ai/classify-logs`
- Config in `.env`: `ANTHROPIC_API_KEY`, `AI_LOG_CLASSIFIER_ENABLED`, `AI_LOG_CLASSIFIER_MODEL`

---

## Phase 2 – Anomalie-Erkennung auf Logs (unüberwacht)

### Ziel
Unbekannte Probleme finden die nicht im Error-Code-Katalog stehen. Komplementär zu Phase 1: Klassifikator sagt "bekanntes Problem X", Anomalie-Detektor sagt "unbekanntes Problem, bitte untersuchen."

### Primärer Ansatz: Lokal mit Python (sklearn)

**Warum lokal zuerst:** Isolation Forest und Autoencoder sind kleine Modelle (<10MB), laufen auf CPU in Millisekunden. Kein Grund für ein externes Tool bei dieser Modellgröße.

**Datenfluss:**

```
Loki-Logs (Baseline: "normale" Logs der letzten 2 Wochen)
  → Feature-Extraction (TF-IDF auf Log-Zeilen)
  → Isolation Forest Training (einmalig, ~30 Sekunden)
  → Modell als .pkl in El Servador/app/ai/models/
  → Neue Logs → Anomalie-Score → DB-Tabelle ai_anomalies
  → Anomalie-Score > 0.8 → Alert via WebSocket
```

**Integration:**

```
POST /api/v1/ai/detect-anomalies     (On-Demand)
GET  /api/v1/ai/anomalies            (Abfrage)
POST /api/v1/ai/retrain-baseline     (Baseline aktualisieren)
```

**Neue Dateien:**
- `El Servador/app/ai/services/anomaly_detector.py`
- `El Servador/app/ai/models/anomaly_model.pkl` (trainiertes Modell)
- DB-Tabelle: `ai_anomalies` (log_line, anomaly_score, is_anomaly, timestamp)

**Retraining:** Wöchentlich automatisch oder manuell via `/retrain-baseline`. Nutzt die letzten 2 Wochen "normale" Logs (gefiltert: keine ERROR/CRITICAL).

### Datadog Log Anomaly Detection – Bewertung

**Wann Datadog sich lohnt:**
- Wenn dein lokaler Anomalie-Detektor zu viele False Positives produziert (>20%)
- Wenn du mehr als 5 ESP32s gleichzeitig betreibst und das Log-Volumen steigt
- Wenn du die Anomalie-Erkennung auf Metriken UND Logs gleichzeitig willst

**Wann Datadog Overkill ist:**
- In der aktuellen Entwicklungsphase mit wenigen ESPs
- Wenn der lokale Isolation Forest bereits <15% False-Positive-Rate erreicht
- Kosten: Datadog Log Management ab ~$1.27/Million Logs – für dein Volumen wahrscheinlich im Free-Tier, aber Lock-in-Risiko

**Empfehlung:** Start lokal. Wenn nach 4 Wochen die False-Positive-Rate nicht unter 15% sinkt, Datadog als Vergleich evaluieren. Du kannst Datadog parallel testen (Free Trial 14 Tage) ohne dein System umzubauen – Logs per Datadog Agent von Docker abgreifen, der bestehende Stack bleibt unberührt.

---

## Phase 3 – Metrik-Korrelation

### Ziel
Automatisch herausfinden welche deiner 78+ Metriken zusammenhängen. Grundlage für ALLES was danach kommt: Smart Alerting, Predictive Failure, und zukünftiges lokales ML-Training.

### Warum jetzt
Du hast 78 Prometheus-Metriken, 3 Targets (el-servador, postgres_exporter, Prometheus self), und die Daten laufen seit Wochen. Die Korrelationsmatrix ist der "Röntgenblick" in dein System – sie zeigt Abhängigkeiten die du manuell nie findest.

### Integration

**Neuer Batch-Service:**

```
El Servador/app/ai/services/metric_correlator.py
```

**Datenfluss:**

```
Prometheus API (http://localhost:9090/api/v1/query_range)
  → Alle Metriken der letzten 24h in 15s-Intervallen
  → Granger-Kausalitätstest (scipy.stats) für jedes Metrik-Paar
  → Pearson/Spearman-Korrelation für gleichzeitige Zusammenhänge
  → Dynamic Time Warping für zeitversetzte Zusammenhänge
  → Ergebnis: Korrelationsmatrix + Kausalitätsgraph
  → DB-Tabelle: ai_metric_correlations
  → Grafana-Dashboard: Heatmap + Abhängigkeitsgraph
```

**Drei Analyse-Ebenen:**

1. **Gleichzeitige Korrelation (Pearson/Spearman):**
   "Wenn Metrik A steigt, steigt Metrik B gleichzeitig."
   Beispiel: `http_requests_total` ↔ `god_kaiser_mqtt_messages_received`

2. **Zeitversetzte Korrelation (Cross-Correlation mit Lag):**
   "Wenn Metrik A steigt, steigt Metrik B 10 Sekunden später."
   Beispiel: `pg_query_duration_seconds` → 10s → `http_request_duration_seconds_bucket`

3. **Kausalität (Granger):**
   "Veränderungen in Metrik A VERURSACHEN Veränderungen in Metrik B."
   Beispiel: `mqtt_messages_received` → verursacht → `god_kaiser_cpu_percent`

**Schedule:** Stündlicher Batch-Job (Celery Task oder APScheduler in El Servador)

**Output für zukünftiges Training:**
- `ai_metric_correlations` Tabelle mit: metric_a, metric_b, correlation_type, coefficient, lag_seconds, p_value, window_start, window_end
- Export als CSV/JSON für späteres Jetson-Training
- Jeder Run dokumentiert sich selbst → du sammelst automatisch Trainingsdaten

**Grafana-Integration:**
- Neues Dashboard "Metrik-Korrelationen"
- Heatmap-Panel (Korrelationsmatrix)
- Node-Graph-Panel (Kausalitätsgraph – welche Metrik beeinflusst welche)
- Annotations bei neu entdeckten Korrelationen

**Deliverables:**
- `El Servador/app/ai/services/metric_correlator.py`
- `El Servador/app/ai/services/prometheus_client.py` (Wrapper für Prometheus Query API)
- DB-Tabelle: `ai_metric_correlations`
- Grafana-Dashboard JSON: `docker/grafana/provisioning/dashboards/metric-correlations.json`
- Scheduled Job (alle 60 Minuten)
- Export-Endpoint: `GET /api/v1/ai/correlations/export?format=csv`

---

## Phase 4 – Smart Alerting (ML-basiert)

### Ziel
Statische Alert-Schwellwerte durch dynamische, lernende Schwellwerte ersetzen. Aufbauend auf Phase 3 – du weißt jetzt welche Metriken zusammenhängen.

### Aktueller Stand
4 statische Alerts in Grafana:
- ServerDown: `up{job="el-servador"} == 0` (1m)
- MQTTDisconnected: `god_kaiser_mqtt_connected == 0` (2m)
- HighCPU: `god_kaiser_cpu_percent > 80` (5m)
- DatabaseDown: `pg_up == 0` (1m)

### Erweiterung: Dynamische Alerts

**Ansatz A: Grafana ML (empfohlen für Start)**

Grafana 11.5.2 hat "Machine Learning" Alerts in der Cloud-Version. Für Self-Hosted: `grafana-ml` Plugin oder eigenes Backend.

Implementierung für Self-Hosted:

```
El Servador/app/ai/services/smart_alerter.py
```

**Logik:**
1. Für jede überwachte Metrik: gleitendes Fenster (letzte 7 Tage)
2. Berechne dynamischen Schwellwert: Mean + 2*StdDev (adaptiv)
3. Vergleiche aktuellen Wert mit dynamischem Schwellwert
4. Bei Überschreitung: Alert via Grafana Webhook oder direkt WebSocket

**Neue Alert-Rules (aufbauend auf Phase 3 Korrelationen):**

| Alert | Typ | Logik |
|-------|-----|-------|
| AnomalousCPU | Dynamisch | CPU > Mean(7d) + 2*StdDev(7d) für >5min |
| MemoryLeak | Trend | RAM-Nutzung steigt monoton über 1h |
| LatencySpike | Korreliert | Response-Time > P95(7d) UND keine proportionale Request-Zunahme |
| MQTTBackpressure | Korreliert | MQTT-Queue > Normal UND ESP-Count unverändert |
| DatabaseSlow | Kausal | Query-Duration > P95 UND korreliert mit nachfolgendem API-Latency-Anstieg |

**Wichtig:** Die bestehenden 4 statischen Alerts BLEIBEN. Sie sind Fail-Safes. Die dynamischen Alerts ergänzen, ersetzen nicht.

**Deliverables:**
- `El Servador/app/ai/services/smart_alerter.py`
- 5 neue Grafana Alert-Rules (provisioned via YAML)
- Integration mit Phase 3 Korrelationsmatrix
- WebSocket-Events für Frontend-Notifications

---

## Phase 5 – Sequenz-Pattern-Mining (Claude + lokal)

### Ziel
Automatisch Fehler-Kaskaden entdecken UND die entdeckten Patterns so aufbereiten, dass sie später als Trainingsdaten für lokale Modelle (Jetson) dienen.

### Zwei-Stufen-Ansatz

**Stufe 1: Claude API für Erstanalyse und Labeling**

Du schickst chronologische Event-Listen an Claude und lässt Sequenzen identifizieren:

```
System-Prompt:
"Du analysierst chronologische Log-Event-Sequenzen aus einem IoT-System.
Finde wiederkehrende Kaskaden: Wenn Event A auftritt, welche Events folgen
typischerweise in welchem Zeitabstand?

Antworte NUR mit JSON:
{
  "sequences": [
    {
      "trigger": "MQTT_DISCONNECT",
      "chain": [
        {"event": "SENSOR_TIMEOUT", "typical_lag_s": 5, "probability": 0.80},
        {"event": "BACKEND_RETRY", "typical_lag_s": 12, "probability": 0.73}
      ],
      "occurrences": 15,
      "confidence": 0.85
    }
  ]
}
"
```

**Warum Claude zuerst:** Du hast noch nicht genug Daten für statistische Pattern-Mining-Algorithmen (PrefixSpan braucht hunderte Sequenzen). Claude kann mit 10-20 Beispielen bereits sinnvolle Patterns identifizieren. Sobald du genug Daten hast, validierst du Claudes Findings mit PrefixSpan.

**Stufe 2: Lokales PrefixSpan für Validierung und Laufzeit**

```
El Servador/app/ai/services/sequence_miner.py
```

Nutzt `prefixspan` Python-Paket. Läuft als wöchentlicher Batch-Job über die gesamte Log-Historie. Ergebnisse werden mit Claudes Findings verglichen → bereinigte, validierte Pattern-Datenbank.

**Daten-Pipeline für späteres Jetson-Training:**

```
Loki-Logs → Event-Extraktion → Sequenz-Datenbank
  → Claude-Analyse (Pattern-Entdeckung)
  → PrefixSpan (statistische Validierung)
  → Bereinigte Sequences in ai_validated_sequences Tabelle
  → Export als Training-Datensatz (JSON/CSV)
  → Später: Markov-Chain oder LSTM auf Jetson trainieren
```

**DB-Tabellen:**
- `ai_raw_sequences`: Rohe Event-Sequenzen aus Logs (Timestamp, Event-Type, Layer)
- `ai_discovered_patterns`: Von Claude entdeckte Patterns (vor Validierung)
- `ai_validated_sequences`: Statistisch validierte Patterns (für Training)

**Export-Format für späteres Training:**

```json
{
  "sequence_id": "seq_001",
  "trigger": {"event": "MQTT_DISCONNECT", "layer": "broker", "timestamp": "..."},
  "chain": [
    {"event": "SENSOR_TIMEOUT", "layer": "firmware", "lag_ms": 5200},
    {"event": "BACKEND_RETRY", "layer": "server", "lag_ms": 12100}
  ],
  "validated": true,
  "occurrences": 47,
  "statistical_confidence": 0.91
}
```

---

## Phase 6 – Cross-Layer-Korrelation

### Ziel
Kausale Ketten über alle 4 Layer automatisch erkennen. Das ist der größte Pain-Point bei deinem System – manuell vier Log-Streams parallel lesen.

### Integration mit Claude API

**Warum Claude hier stark ist:** Cross-Layer-Korrelation braucht Verständnis von kausalen Zusammenhängen, nicht nur statistische Korrelation. Claude kann erklären WARUM eine Kaskade passiert, nicht nur DASS sie passiert.

**Datenfluss:**

```
Trigger: Error/Anomalie erkannt (Phase 1 oder 2)
  → Zeitfenster ±60s um den Trigger
  → Logs aus ALLEN Layern für dieses Fenster (Loki-Query)
  → Metriken aus ALLEN Targets für dieses Fenster (Prometheus-Query)
  → Kontext-Aufbau: Logs + Metriken + Error-Katalog + bekannte Patterns (Phase 5)
  → Claude API Call mit strukturiertem Prompt
  → Ergebnis: Kaskaden-Analyse mit Root-Cause-Hypothese
  → DB: ai_cross_layer_analyses
  → WebSocket: Echtzeit-Benachrichtigung ans Frontend
```

**System-Prompt-Struktur:**

```
Du analysierst eine Cross-Layer-Korrelation im AutomationOne IoT-System.

Architektur:
- Layer 1: ESP32 Firmware (El Trabajante) → MQTT
- Layer 2: MQTT Broker (Mosquitto)
- Layer 3: FastAPI Backend (El Servador) → PostgreSQL
- Layer 4: Vue 3 Frontend (El Frontend) → WebSocket

Bekannte Patterns aus Pattern-Mining:
{patterns_from_phase_5}

Zeitfenster: {start} bis {end}

Logs pro Layer:
{firmware_logs}
{broker_logs}
{server_logs}
{frontend_logs}

Metriken:
{prometheus_metrics_snapshot}

Analysiere:
1. Was ist der wahrscheinliche Root-Cause?
2. Welche Kaskade ist entstanden? (Layer → Layer → Layer)
3. Wo hätte man früher eingreifen können?
4. Ist das ein bekanntes Pattern oder ein neues?

Antworte als JSON:
{
  "root_cause": {"layer": "...", "event": "...", "confidence": 0.0-1.0},
  "cascade": [{"layer": "...", "event": "...", "lag_s": N}],
  "prevention_point": "...",
  "is_known_pattern": true/false,
  "pattern_match": "PATTERN_NAME or null",
  "explanation": "Freitext-Erklärung"
}
```

**Wichtig:** Diese Phase nutzt ALLE vorherigen Phasen als Input:
- Phase 1 liefert klassifizierte Logs (weniger Noise im Prompt)
- Phase 2 liefert Anomalie-Scores (Trigger für Analyse)
- Phase 3 liefert bekannte Metrik-Korrelationen (Kontext)
- Phase 5 liefert bekannte Sequenz-Patterns (Referenz)

**Kosten:** ~$0.05-0.15 pro Cross-Layer-Analyse (abhängig von Zeitfenstergröße). Bei 10-20 Analysen/Tag: ~$1-3/Tag.

---

## Phase 7 – Predictive Failure Detection

### Ziel
Warnen BEVOR ein Fehler auftritt. Lernt Vorboten aus der Metriken-Historie.

### Stufenansatz

**Stufe 1: Grafana ML Forecasting (Self-Hosted)**

Grafana hat seit v11 ein `grafana-ml` Feature für Forecasting direkt auf Prometheus-Daten. Für Self-Hosted:

```yaml
# docker/grafana/provisioning/plugins/grafana-ml.yaml
apiVersion: 1
apps:
  - type: grafana-ml-app
    disabled: false
```

Konfiguriere Forecasts für kritische Metriken:
- `god_kaiser_cpu_percent` → Forecast 30min
- `god_kaiser_memory_usage_bytes` → Forecast 1h (Memory-Leak-Detection)
- `pg_query_duration_seconds` → Forecast 15min
- ESP32-RSSI (wenn über MQTT-Metriken verfügbar)

**Stufe 2: Falls Grafana ML nicht ausreicht → Amazon Lookout for Metrics**

**Wann Amazon nötig ist:**
- Grafana ML erkennt keine subtilen Muster (z.B. langsame Degradation über Tage)
- Du brauchst Multi-Metrik-Forecasting (mehrere Metriken gleichzeitig analysieren)
- Du willst automatische Anomalie-Erkennung auf Zeitreihen ohne Feature-Engineering

**Integration:**
- Amazon Lookout kann Prometheus-kompatible Daten konsumieren
- Export: El Servador schickt Metriken-Snapshots an S3 Bucket
- Lookout analysiert und schickt Alerts zurück via SNS → Webhook → El Servador
- Kosten: $0.75/1000 Metriken-Datenpunkte (bei 78 Metriken alle 15s: ~$50/Monat)

**Stufe 3: Claude als Analyst für Edge-Cases**

Für Fälle die weder Grafana ML noch Amazon fangen:
- Wöchentlicher Batch: Metriken-Trends der Woche → Claude API
- Claude identifiziert langsame Drifts die statistische Modelle übersehen
- Output: "Metriken-Gesundheitsbericht" mit Frühwarnungen

**Empfehlung:** Start mit Grafana ML (kostenlos, lokal). Amazon nur wenn nach 4 Wochen die Erkennungsrate zu niedrig ist. Claude als wöchentliche Ergänzung für menschenlesbare Trend-Reports.

**Daten für späteres Jetson-Training:**
- Jeder korrekte Alert (bestätigt durch tatsächlichen Ausfall) → Trainingsdatum
- Jeder False Positive → Negativbeispiel
- Tabelle: `ai_failure_predictions` (metric, predicted_value, actual_value, alert_fired, was_correct)
- Export-Endpoint für Jetson-Training

---

## Phase 8 – Natural Language Debug Assistant

### Ziel
Ein einziger Endpoint der deinen gesamten manuellen Debug-Flow ersetzt: Du fragst "Warum ist ESP-03 offline?" und bekommst eine vollständige Root-Cause-Analyse.

### Warum zuletzt
Dieser Agent braucht ALLE vorherigen Phasen als Werkzeuge. Er ist der Orchestrator, nicht der Einzelkämpfer.

### Architektur: Debug-Orchestrator

```
User-Frage (via Frontend oder API)
  → NL Debug Assistant (Claude API)
  → Orchestriert automatisch:
     1. Log-Klassifikation (Phase 1) → Was ist bekannt?
     2. Anomalie-Check (Phase 2) → Was ist unbekannt?
     3. Metrik-Snapshot (Phase 3) → Welche Korrelationen sind aktiv?
     4. Pattern-Check (Phase 5) → Passt das zu bekannten Kaskaden?
     5. Cross-Layer-Analyse (Phase 6) → Wo ist der Root-Cause?
     6. Predictive Check (Phase 7) → Droht noch mehr?
  → Konsolidierter Report
  → Frontend-Anzeige + DB-Speicherung
```

**Implementierung als Tool-Use Agent:**

Der NL Debug Assistant nutzt Claude's Function Calling / Tool Use. Statt einen riesigen Kontext zu bauen, gibt man Claude Tools die es selbstständig aufruft:

```python
tools = [
    {
        "name": "query_loki_logs",
        "description": "Fetch logs from Loki for a specific service and time range",
        "input_schema": {
            "type": "object",
            "properties": {
                "service": {"type": "string", "enum": ["el-servador", "mqtt-broker", "el-frontend", "postgres"]},
                "time_range_minutes": {"type": "integer"},
                "filter": {"type": "string", "description": "LogQL filter expression"}
            }
        }
    },
    {
        "name": "query_prometheus_metrics",
        "description": "Fetch current metrics from Prometheus",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "PromQL query"},
                "range_minutes": {"type": "integer"}
            }
        }
    },
    {
        "name": "check_known_patterns",
        "description": "Check if current situation matches known error patterns",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_type": {"type": "string"},
                "layer": {"type": "string"}
            }
        }
    },
    {
        "name": "get_device_status",
        "description": "Get current status of an ESP32 device",
        "input_schema": {
            "type": "object",
            "properties": {
                "device_id": {"type": "string"}
            }
        }
    },
    {
        "name": "get_correlation_matrix",
        "description": "Get current metric correlations",
        "input_schema": {
            "type": "object",
            "properties": {
                "metric_name": {"type": "string"}
            }
        }
    },
    {
        "name": "classify_log_batch",
        "description": "Classify a batch of log lines against known error patterns",
        "input_schema": {
            "type": "object",
            "properties": {
                "log_lines": {"type": "array", "items": {"type": "string"}}
            }
        }
    }
]
```

**Ablauf eines Debug-Requests:**

```
1. User: "Warum bekomme ich keine Sensordaten von ESP-03?"

2. NL Agent ruft selbstständig auf:
   → get_device_status("ESP-03") → "last_heartbeat: 5min ago, status: online"
   → query_loki_logs(service="mqtt-broker", filter='ESP-03', range=15min)
   → query_loki_logs(service="el-servador", filter='ESP-03', range=15min)
   → query_prometheus_metrics("god_kaiser_mqtt_messages_received[15m]")
   → check_known_patterns(event_type="SENSOR_DATA_MISSING", layer="firmware")

3. NL Agent analysiert alle Ergebnisse und antwortet:
   "ESP-03 ist online (Heartbeat vor 5min), aber die MQTT-Logs zeigen
   dass seit 12 Minuten keine Sensor-Publishes mehr ankommen. Der Server
   empfängt weiterhin Heartbeats. Das passt zum Pattern SENSOR_LOOP_STUCK
   (Confidence: 0.82) – die Sensor-Read-Schleife hängt wahrscheinlich,
   während der Heartbeat-Task unabhängig weiterläuft.

   Empfohlene Aktion: ESP-03 Soft-Reset via MQTT-Command
   (`ao/devices/ESP-03/command/restart`), alternativ Config-Re-Push."
```

**Wichtig: Chain-Exaktheit**

Der Agent muss exakte Debug-Chains ausführen, nicht halluzinieren. Sichergestellt durch:

1. **Nur eigene Tools nutzen** – keine erfundenen Endpoints
2. **Jedes Tool-Ergebnis zitieren** – der Agent muss konkrete Log-Zeilen und Metriken referenzieren
3. **Confidence-Scoring** – jede Aussage mit Confidence versehen
4. **Fallback bei Unsicherheit** – "Für eine sichere Diagnose fehlen mir folgende Daten: ..."
5. **Audit-Trail** – jeder Tool-Call wird in `ai_debug_sessions` gespeichert

**API-Endpoints:**

```
POST /api/v1/ai/debug           (Frage stellen)
GET  /api/v1/ai/debug/sessions  (Vergangene Sessions)
GET  /api/v1/ai/debug/{id}      (Details einer Session)
```

**Frontend-Integration:**
- Neues Panel im Dashboard: "AI Debug Assistant"
- Chat-Interface (wie ein internes Claude-Chat, aber mit System-Kontext)
- Jede Antwort zeigt: benutzte Tools, abgefragte Daten, Confidence
- "Deep Dive" Button → öffnet relevante Grafana-Panels

**Deliverables:**
- `El Servador/app/ai/services/debug_assistant.py` (Orchestrator)
- `El Servador/app/ai/tools/` (Tool-Definitionen für Claude Function Calling)
- `El Servador/app/ai/tools/loki_tool.py`
- `El Servador/app/ai/tools/prometheus_tool.py`
- `El Servador/app/ai/tools/pattern_tool.py`
- `El Servador/app/ai/tools/device_tool.py`
- DB-Tabelle: `ai_debug_sessions` (question, tool_calls, answer, confidence, duration_ms)
- API-Endpoints
- Frontend-Komponente (Vue 3)

---

## Querschnitt: Datensammlung für Jetson-Training

Alle Phasen sammeln automatisch Trainingsdaten. Hier die Übersicht was wo landet und wie es exportiert wird:

| Phase | DB-Tabelle | Datentyp | Export-Format | Jetson-Nutzung |
|-------|-----------|----------|--------------|----------------|
| 1 | ai_log_classifications | Gelabelte Logs | CSV | fastText/DistilBERT Training |
| 2 | ai_anomalies | Anomalie-Scores | CSV | Autoencoder Baseline |
| 3 | ai_metric_correlations | Korrelationspaare | JSON | TCN/LSTM Features |
| 4 | ai_smart_alerts | Alert-History + Korrektheit | CSV | Schwellwert-Modell |
| 5 | ai_validated_sequences | Bereinigte Kaskaden | JSON | Markov-Chain/LSTM |
| 6 | ai_cross_layer_analyses | Root-Cause-Reports | JSON | Multi-Layer-Modell |
| 7 | ai_failure_predictions | Predictions + Outcomes | CSV | Zeitreihen-Forecasting |
| 8 | ai_debug_sessions | Frage-Antwort-Paare | JSON | Fine-Tuning Material |

**Zentraler Export-Endpoint:**

```
GET /api/v1/ai/training-data/export?phases=1,2,3&format=csv&since=2026-01-01
```

---

## Zusammenfassung: Was wann starten

```
Woche 1-2:  Phase 1 (Log-Klassifikation) → sofort nutzbar
Woche 2-3:  Phase 2 (Anomalie-Erkennung) → parallel zu Phase 1
Woche 3-4:  Phase 3 (Metrik-Korrelation) → braucht 2+ Wochen Prometheus-Daten
Woche 4:    Phase 4 (Smart Alerting) → aufbauend auf Phase 3
Woche 5-6:  Phase 5 (Sequenz-Mining) → braucht 4+ Wochen Log-Historie
Woche 6-8:  Phase 6 (Cross-Layer) → nutzt Phase 1+3+5
Woche 8-10: Phase 7 (Predictive) → braucht 8+ Wochen Metriken
Woche 10-12: Phase 8 (NL Debug Assistant) → nutzt alles
```

**Geschätzte monatliche API-Kosten (bei aktivem Debugging):**
- Claude API: ~$30-60/Monat (Phase 1, 5, 6, 8)
- Grafana ML: $0 (Self-Hosted)
- Amazon Lookout: $0-50/Monat (nur falls Phase 7 Stufe 2 nötig)
- Datadog: $0 (nur falls Phase 2 Upgrade nötig)
- **Gesamt: ~$30-110/Monat** vs. Jetson Orin NX: ~$1000 einmalig

Der Jetson wird erst relevant wenn du aus der Entwicklungs- in die Produktionsphase gehst und Echtzeit-Inferenz auf dem Edge brauchst. Bis dahin hast du mit den gesammelten Trainingsdaten alles um den Jetson vom ersten Tag an mit validierten Modellen zu füttern.