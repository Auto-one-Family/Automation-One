# Phase 3: KI-Error-Analyse aktivieren

> **Voraussetzung:** [Phase 2](./PHASE_2_PRODUKTIONSTESTFELD.md) Schritt 2.1-2.4 abgeschlossen (Sensordaten fliessen)
> **Nutzt:** [Phase 0](./PHASE_0_ERROR_TAXONOMIE.md) Error-Taxonomie + Grafana-Alerts
> **Nutzt (NEU):** [Phase 1](./PHASE_1_WOKWI_SIMULATION.md) Wokwi MCP fuer Anomalie-Validierung
> **Nachfolger:** [Phase 4](./PHASE_4_INTEGRATION.md) (Integration + Closed-Loop)
> **Master-Plan:** [00_MASTER_PLAN.md](./00_MASTER_PLAN.md) Abschnitt "PHASE 3" + "Agent-Driven Testing"
> **Aktualisiert:** 2026-02-23 (Forschungs-Update: Knowledge Graph RCA, MQTT-Trace-Analyse, Causal Graphs, 8 neue Papers)

---

## Ziel

Automatisierte Fehlererkennung die im Hintergrund mitlaeuft — in beiden Spuren (Wokwi + Produktion) nutzbar. Drei Stufen: Rule-based → Statistisch → LLM-basiert (inkrementell).

---

## Stufe 1: Rule-Based (sofort, 0 Code)

### Voraussetzung

- [Phase 0](./PHASE_0_ERROR_TAXONOMIE.md) Schritt 0.3 abgeschlossen: **26 Grafana-Alert-Regeln aktiv** (verifiziert 2026-02-23)
- Docker-Stack laeuft mit Monitoring-Profil

### Was Stufe 1 leistet

| Analyse-Typ | Mechanismus | Datenquelle |
|-------------|-------------|-------------|
| Sensor-Plausibilitaet | PromQL: Wert ausserhalb physikalischer Grenzen | Prometheus (god_kaiser_sensor_value) |
| Drift-Erkennung | PromQL: Wert weicht >3sigma vom Mittel ab | Prometheus |
| Heartbeat-Luecken | PromQL: ESP offline > 120s | Prometheus (god_kaiser_esp_last_heartbeat) |
| Error-Kaskaden | PromQL: 3+ Errors in 60s | Prometheus (god_kaiser_esp_errors_total) |
| Log-Pattern-Matching | LogQL: Bekannte Fehlermuster | Loki |

### Stufe 1 ist bereits durch Phase 0 abgedeckt

Wenn Phase 0 korrekt ausgefuehrt wurde, laeuft Stufe 1 automatisch. Hier pruefen wir nur ob die Alerts korrekt feuern.

### Verifikation Stufe 1

**Agent:** `/auto-ops:ops-diagnose`

```bash
# Grafana Alert-Status abfragen
curl -s -u admin:Admin123# http://localhost:3000/api/v1/provisioning/alert-rules | python -m json.tool | grep -c "title"

# Aktive Alerts pruefen
curl -s -u admin:Admin123# http://localhost:3000/api/alertmanager/grafana/api/v2/alerts | python -m json.tool

# Loki-Queries testen
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="el-servador"} |= "ERROR"' \
  --data-urlencode 'start=1h' | python -m json.tool
```

### Test: Absichtlich Alert ausloesen

```bash
# Test 1: Sensor Out-of-Range (per MQTT simulieren)
docker exec automationone-mqtt-broker mosquitto_pub \
  -t "kaiser/god/esp/ESP_TEST/sensor/data" \
  -m '{"sensor_type":"temperature","value":999.0,"raw":999,"quality":"good","gpio":4}'

# Test 2: Server-Endpunkt fuer Error-Injection (falls vorhanden)
curl -X POST http://localhost:8000/api/v1/debug/simulate-error \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"error_code": 1040, "severity": "warning"}'

# Danach in Grafana pruefen: Alert "Temp Out of Range" sollte feuern
```

---

## Stufe 2: Statistische Anomalie-Detektion (Isolation Forest)

### Voraussetzung

- Sensordaten fliessen seit mindestens einigen Stunden (je mehr, desto besser)
- `sensor_data` Tabelle hat signifikante Eintraege
- `ai_predictions` Tabelle ist bereit (Schema existiert, aktuell leer)

### Ist-Zustand der AI-Infrastruktur

| Datei | Status | Beschreibung |
|-------|--------|-------------|
| `El Servador/god_kaiser_server/src/services/ai_service.py` | **STUB** (1 Zeile) | "Phase 3 - PLANNED" |
| `El Servador/god_kaiser_server/src/db/repositories/ai_repo.py` | **STUB** (2 Zeilen) | "Phase 2 - PLANNED" |
| `El Servador/god_kaiser_server/src/db/models/ai_prediction.py` | **Zu pruefen** | DB-Model fuer Predictions |

> **[VERIFY-PLAN] AI-Infrastruktur Korrektur:**
> - `ai_prediction.py` existiert NICHT, aber `ai.py` EXISTIERT: `src/db/models/ai.py` mit Klasse `AIPredictions` (130 Zeilen, VOLLSTAENDIG implementiert!)
> - Das Model nutzt UUID PK (nicht Integer wie im Plan), hat ForeignKey zu esp_devices, JSON-Felder fuer input_data/prediction_result, und 4 Indizes
> - Plan-Model-Entwurf (Schritt 3.2.1) ist UNNOETIG — das Model existiert bereits mit besserer Implementierung
> - Repository (`ai_repo.py`) ist STUB (3 Zeilen) → muss implementiert werden
> - Service (`ai_service.py`) ist STUB (1 Zeile) → muss implementiert werden
> - Plan referenziert `sensor_data_repo.py` als Repository-Pattern → existiert NICHT. Korrekt: `sensor_repo.py`
> - Schritt 3.2.1 sollte uebersprungen oder auf "verifiziert, existiert" geaendert werden

### Implementierungsplan

**Skill:** `/server-development`
**Agent:** `server-dev`

#### Schritt 3.2.1: AI-Prediction DB-Model vervollstaendigen

**Datei:** `El Servador/god_kaiser_server/src/db/models/ai_prediction.py`

```python
class AIPrediction(Base):
    __tablename__ = "ai_predictions"

    id = Column(Integer, primary_key=True)
    esp_id = Column(String, nullable=False, index=True)
    sensor_type = Column(String, nullable=False)
    prediction_type = Column(String, nullable=False)  # "anomaly", "drift", "failure"
    confidence = Column(Float, nullable=False)        # 0.0 - 1.0
    anomaly_score = Column(Float, nullable=True)      # Isolation Forest Score
    predicted_value = Column(Float, nullable=True)
    actual_value = Column(Float, nullable=True)
    metadata_json = Column(JSON, nullable=True)       # Zusaetzliche Kontext-Daten
    created_at = Column(DateTime, server_default=func.now())
    resolved_at = Column(DateTime, nullable=True)
    resolution = Column(String, nullable=True)        # "auto_resolved", "manual", "false_positive"
```

#### Schritt 3.2.2: AI-Repository implementieren

**Datei:** `El Servador/god_kaiser_server/src/db/repositories/ai_repo.py`

Methoden:
- `create_prediction(prediction: AIPredictionCreate) → AIPrediction`
- `get_predictions(esp_id: str, limit: int) → List[AIPrediction]`
- `get_unresolved_predictions() → List[AIPrediction]`
- `resolve_prediction(id: int, resolution: str) → AIPrediction`

**Pattern folgen:** Bestehende Repositories als Referenz (z.B. `sensor_repo.py`, `audit_log_repo.py`)

> **[VERIFY-PLAN] Repository-Pattern Korrektur:** `sensor_data_repo.py` existiert NICHT. Repository heisst `sensor_repo.py`. Alternativ `audit_log_repo.py` als Pattern (hat aehnliche Zeitreihen-Queries)

#### Schritt 3.2.3: Isolation Forest Service implementieren

**Datei:** `El Servador/god_kaiser_server/src/services/ai_service.py`

```python
"""AI/God Layer Integration Service - Isolation Forest Anomaly Detection"""

from sklearn.ensemble import IsolationForest
import numpy as np

class AnomalyDetectionService:
    """Isolation Forest basierte Anomalie-Erkennung fuer Sensordaten.

    Wissenschaftliche Basis:
    - Phan & Nguyen (2025): Score 0.464 vs. LSTM 0.263, 600x schneller
    - Devi et al. (2024): Kann von Erkennung zu Recovery erweitert werden
    """

    def __init__(self, contamination: float = 0.05):
        self.model = IsolationForest(
            contamination=contamination,
            n_estimators=100,
            random_state=42,
            n_jobs=-1  # Alle CPU-Kerne nutzen
        )
        self.is_fitted = False

    async def train_on_sensor_data(
        self, sensor_data: List[SensorDataPoint],
        window_hours: int = 24
    ) -> None:
        """Trainiert das Modell auf historischen Sensordaten.
        Unsupervised — kein gelabeltes Training noetig.
        """
        # Feature-Extraktion: value, delta, rate_of_change
        features = self._extract_features(sensor_data)
        self.model.fit(features)
        self.is_fitted = True

    async def detect_anomalies(
        self, recent_data: List[SensorDataPoint]
    ) -> List[AnomalyResult]:
        """Erkennt Anomalien in aktuellen Sensordaten."""
        if not self.is_fitted:
            return []
        features = self._extract_features(recent_data)
        scores = self.model.decision_function(features)
        predictions = self.model.predict(features)
        # -1 = Anomalie, 1 = Normal
        ...

    def _extract_features(self, data: List[SensorDataPoint]) -> np.ndarray:
        """Extrahiert Features: value, delta, rate_of_change, moving_avg_diff"""
        ...
```

#### Schritt 3.2.4: Periodic Task fuer Anomalie-Erkennung

**Integration in Server-Startup:**

```python
# In main.py oder scheduler Setup:
@repeat_every(seconds=300)  # Alle 5 Minuten
async def run_anomaly_detection():
    """Periodisch Anomalie-Erkennung auf aktuelle Sensordaten."""
    # 1. Letzte 24h Sensordaten laden
    # 2. Modell trainieren (oder Re-Use wenn < 1h alt)
    # 3. Letzte 5min Daten analysieren
    # 4. Anomalien in ai_predictions schreiben
    # 5. Bei Anomalie: Audit-Log + ggf. Prometheus-Metrik
```

#### Schritt 3.2.5: API-Endpoint fuer AI-Predictions

**Datei:** `El Servador/god_kaiser_server/src/api/v1/ai.py`

> **[VERIFY-PLAN] Router-Pfad Korrektur:** `src/api/routers/` existiert NICHT. Router liegen in `src/api/v1/`. Korrekt: `src/api/v1/ai.py`. Bestehende Router als Referenz: `sensors.py`, `esp.py`, `debug.py`

| Method | Endpoint | Beschreibung |
|--------|----------|-------------|
| GET | `/api/v1/ai/predictions` | Alle (oder gefilterte) Predictions |
| GET | `/api/v1/ai/predictions/{id}` | Einzelne Prediction |
| POST | `/api/v1/ai/predictions/{id}/resolve` | Prediction als resolved markieren |
| GET | `/api/v1/ai/status` | Modell-Status (trained, last_run, features) |

**Pattern folgen:** Bestehende Router als Referenz (z.B. `sensors.py`, `esp.py`)

> **[VERIFY-PLAN] Router-Referenz Korrektur:** `sensor_router.py` existiert NICHT. Router heissen direkt `sensors.py`, `esp.py` etc. in `src/api/v1/`

### Dependencies

```bash
# scikit-learn sollte bereits in pyproject.toml sein
# Falls nicht:
cd "El Servador/god_kaiser_server"
.venv/Scripts/pip.exe install scikit-learn numpy
```

> **[VERIFY-PLAN] Dependency Korrektur:**
> - `scikit-learn` ist NICHT in pyproject.toml → MUSS hinzugefuegt werden
> - `numpy` ebenfalls NICHT in pyproject.toml → MUSS hinzugefuegt werden
> - Scheduler: Projekt nutzt APScheduler (`AsyncIOScheduler` in `core/scheduler.py`), NICHT `repeat_every`
> - Periodic Task (Schritt 3.2.4) muss APScheduler-Pattern folgen, NICHT FastAPI repeat_every
> - Debug Endpoint `/api/v1/debug/simulate-error` existiert NICHT → muss fuer Alert-Tests erstellt werden oder alternativer Testweg definiert werden
> - Container-Name im MQTT-Test: `automationone-mqtt-broker` → korrekt: `automationone-mqtt`

### Verifikation Stufe 2

```bash
# AI-Service importierbar
cd "El Servador/god_kaiser_server"
.venv/Scripts/python.exe -c "from src.services.ai_service import AnomalyDetectionService; print('OK')"

# API-Endpoint erreichbar
curl -s http://localhost:8000/api/v1/ai/status -H "Authorization: Bearer $TOKEN"

# Predictions werden geschrieben
curl -s http://localhost:8000/api/v1/ai/predictions -H "Authorization: Bearer $TOKEN"

# Tests
.venv/Scripts/pytest.exe tests/unit/test_ai_service.py -v
```

---

## Stufe 3: LLM-basierte Root-Cause-Analyse mit Knowledge Graphs (ERWEITERT 2026-02-23)

> **Forschungs-Update:** Stufe 3 wurde von "einfachem LLM-Call" zu einer wissenschaftlich fundierten
> Knowledge-Graph-gestuetzten Causal-Analysis-Pipeline erweitert. Basis: 5 neue Papers (2025-2026).

### Voraussetzung

- Stufe 1 + 2 laufen stabil
- Ausreichend Anomalie-Daten in `ai_predictions`
- Claude API-Key vorhanden (Budget freigeben)
- **NEU:** MQTT-Traces aus Phase 1 (Wokwi) oder Phase 2 (Produktion) verfuegbar

### Architektur: 3-Stufen Causal Analysis Pipeline

```
STUFE 3 — Erweiterte Architektur (wissenschaftlich fundiert)

┌──────────────────────────────────────────────────────────────────┐
│                    STUFE 3: LLM + KG RCA                         │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  3a: TRACE       │  │  3b: CAUSAL      │  │  3c: LLM ROOT-  │  │
│  │  ABSTRACTION     │→ │  GRAPH           │→ │  CAUSE ANALYSE   │  │
│  │                  │  │  CONSTRUCTION    │  │                  │  │
│  │  • MQTT-Traces   │  │  • Dynamische    │  │  • Claude API    │  │
│  │  • Serial-Logs   │  │    Kausal-Kanten │  │  • Kontext aus   │  │
│  │  • Audit-Logs    │  │  • Zeitliche     │  │    KG + Traces   │  │
│  │  • Correlation   │  │    Korrelation   │  │  • Fix-Vorschlag │  │
│  │    IDs           │  │  • ESP32 Fehler- │  │  • Confidence    │  │
│  │                  │  │    Knowledge-    │  │    Score         │  │
│  │  (TAAF-Ansatz)   │  │    Graph         │  │                  │  │
│  │                  │  │  (LLMs-DCGRCA)   │  │  (auto-ops)      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Stufe 3a: Trace-Abstraktion (MQTT + Serial + Audit)

> **Wissenschaftliche Basis:** TAAF (2026) — Trace Abstraction with Knowledge Graphs, +31.2% kausales Reasoning

**Was "Trace" in AutomationOne bedeutet:**

| Trace-Typ | Quelle | Format | Beispiel |
|-----------|--------|--------|----------|
| MQTT-Trace | Mosquitto + MQTT-Handler | Topic → Payload → Timestamp | `kaiser/god/esp/ESP01/sensor/data → {"temp": 999}` |
| Serial-Trace | ESP32 Serial-Output | `[TIMESTAMP] [LEVEL] Message` | `[E] SENSOR_READ_FAILED (1040) on GPIO 4` |
| Audit-Trace | Server audit_log | JSON mit correlation_id | `{"event": "sensor_data_received", "correlation_id": "abc123"}` |
| Wokwi-Trace | Wokwi MCP Serial-Output | Text (identisch zu Real-ESP) | Gleicher Output wie oben, via MCP |

**Abstraktion:** Rohe Traces → strukturierte Ereignis-Sequenzen mit kausalen Beziehungen:

```
Beispiel: Sensor-Ausfall-Kette
  T+0s:  [ESP32] SENSOR_READ_FAILED (1040) on GPIO 4
  T+0.1s: [ESP32] mqtt_publish("kaiser/.../error", {code: 1040})
  T+0.5s: [Server] MQTT error_handler received code 1040
  T+0.6s: [Server] audit_log: {event: "error_received", code: 1040, severity: "warning"}
  T+1.0s: [Grafana] Alert: "Sensor Value Out of Range" → FIRING
  T+5.0s: [Server] ai_predictions: anomaly_score = -0.87 (Isolation Forest)

→ Kausal-Kette: GPIO_FAIL → MQTT_ERROR → SERVER_HANDLER → ALERT → AI_PREDICTION
```

### Stufe 3b: Dynamische Kausal-Graphen (ESP32 Fehler-KG)

> **Wissenschaftliche Basis:**
> - LLMs-DCGRCA (2025, IEEE IoT Journal) — Dynamische Kausal-Graphen + LLMs, +14% HR@7
> - FVDebug (2025) — For-and-Against Prompting fuer kausale Graphen, 61.2% F1

**ESP32-spezifischer Fehler-Knowledge-Graph:**

```
KONZEPT: AutomationOne Fehler-KG (zu bauen)

Knoten (Error-Codes als Entitaeten):
├── Firmware-Errors: 1000-4999
│   ├── sensor (1000-1099): GPIO_RESERVED, GPIO_CONFLICT, SENSOR_TYPE_UNKNOWN, ...
│   ├── actuator (1100-1199): ACTUATOR_TIMEOUT, ACTUATOR_SET_FAILED, ...
│   ├── mqtt (2000-2099): NVS_INIT_FAILED, MQTT_CONNECT_FAILED, ...
│   ├── system (3000-3099): WIFI_INIT_FAILED, WIFI_CONNECT_TIMEOUT, ...
│   ├── config (3100-3199): NVS_READ_FAILED, CONFIG_PARSE_ERROR, ...
│   └── safety (4000-4099): WATCHDOG_TIMEOUT, MEMORY_FULL, EMERGENCY_STOP, ...
├── Server-Errors: 5000-5699
└── Test-Errors: 6000-6099

Kanten (kausale Beziehungen):
├── WIFI_INIT_FAILED (3001) → MQTT_CONNECT_FAILED (3011) [causes]
├── SENSOR_READ_FAILED (1040) → CALIBRATION_INVALID (5201) [triggers]
├── MEMORY_FULL (4040) → WATCHDOG_TIMEOUT (4070) [leads_to]
├── GPIO_CONFLICT (1002) → SENSOR_READ_FAILED (1040) [causes]
└── DB_CONNECTION_LOST (5001) → CALIBRATION_INVALID (5201) [prevents]
```

**Aufbau-Strategie:**
1. **Statische Basis:** Error-Code-Referenz (`ERROR_CODES.md`) als Knoten importieren
2. **Kausale Kanten:** Aus Audit-Log-Korrelationen und Wokwi Error-Injection-Ergebnissen ableiten
3. **Dynamische Erweiterung:** LLM analysiert neue Fehler und schlaegt Kanten vor (LLMs-DCGRCA Ansatz)
4. **Validierung:** Wokwi MCP fuer Kausal-Hypothesen-Tests (Error-Injection → beobachte Kaskade)

### Stufe 3c: LLM Root-Cause-Analyse (mit KG-Kontext)

| Komponente | Beschreibung | Aufwand |
|-----------|-------------|--------|
| Claude API Integration | Error-Context + KG-Pfad → Strukturierter Root-Cause-Bericht | Mittel |
| Timeline-Rekonstruktion | `correlation_id` aus Audit-Logs → Ereigniskette bauen | Gering |
| **KG-Kontext-Enrichment** | **Relevante Kausalketten aus Fehler-KG an LLM uebergeben** | Mittel |
| **MQTT-Trace-Zusammenfassung** | **MQTT-Payload-Sequenzen als kontextueller Prompt** | Mittel |
| Fix-Vorschlaege | Error-Code + KG-Pfad → kontext-spezifische Loesung | Gering |

**Prompt-Strategie (For-and-Against, FVDebug-Ansatz):**

```
Prompt-Template fuer Root-Cause-Analyse:

SYSTEM: Du bist ein IoT-Diagnose-Experte fuer AutomationOne (ESP32 + FastAPI + MQTT).

KONTEXT:
- Error-Code: {error_code} ({error_name})
- Kausal-Graph-Pfad: {kg_path}  (z.B. GPIO_CONFLICT → SENSOR_READ_FAILED → CALIBRATION_INVALID)
- Timeline: {trace_timeline}     (abstrahierte Ereigniskette)
- MQTT-Traces: {mqtt_summary}    (letzte 10 relevante MQTT-Messages)
- Isolation Forest Score: {anomaly_score}
- Grafana Alert: {alert_name}

AUFGABE:
1. Analysiere die wahrscheinlichste Root-Cause
2. Bewerte Confidence (0-1)
3. Schlage einen Fix vor (Firmware / Server / Config)
4. Identifiziere ob dies ein neues Pattern ist (→ KG-Erweiterung?)
```

### Integration mit auto-ops

Das auto-ops Plugin hat bereits:
- Error-Code-Referenz (`auto-ops:error-codes`)
- Cross-Layer-Korrelation (`auto-ops:cross-layer-correlation`)
- Loki-Queries (`auto-ops:loki-queries`)

**Erweiterung fuer Stufe 3:**
1. Grafana-Alert feuert (Stufe 1) → auto-ops sammelt Kontext
2. Isolation Forest findet Anomalie (Stufe 2) → Score + betroffene Sensoren
3. **NEU:** Trace-Abstraktion (Stufe 3a) → Kausal-Kette extrahieren
4. **NEU:** KG-Lookup (Stufe 3b) → bekannte Kausalpfade abfragen
5. Claude API analysiert alles zusammen (Stufe 3c) → Root-Cause + Fix

### MQTT-Trace-Analyse — Forschungsluecke (Pionier-Potential)

> **KEIN Paper behandelt MQTT-Payload-Sequenz-Analyse mit LLMs.**
> AutomationOne kann hier Pionierarbeit leisten.

**Was fehlt in der Forschung:**
- Papers zu Log-Analyse (AetherLog, TAAF) behandeln HTTP/RPC/gRPC Traces
- MQTT-spezifische Trace-Analyse (Topic-Hierarchie, QoS-Level, Retained Messages) ist unerforscht
- AutomationOne's MQTT-Topic-Struktur (`kaiser/god/esp/{ESP_ID}/{type}/{action}`) ist ideal fuer Pattern-Matching

**Ansatz fuer AutomationOne:**
1. `mosquitto_sub -t 'kaiser/#' -v` mitschneiden (oder Wokwi MCP MQTT-Capture)
2. Traces in strukturiertes Format umwandeln: `{timestamp, topic, payload, qos}`
3. Anomale Sequenzen erkennen: fehlende Heartbeats, doppelte Sensor-Publishes, Error-Kaskaden
4. LLM interpretiert anomale Sequenzen im Kontext des Fehler-KG

### Implementierungsreihenfolge Stufe 3

| Sub-Stufe | Was | Aufwand | Paper-Basis | Prioritaet |
|-----------|-----|---------|-------------|-----------|
| **3a** | MQTT/Serial/Audit Trace-Abstraktion | 1-2 Wochen | TAAF (2026), TRAIL (2025) | HOCH |
| **3b-statisch** | Fehler-KG aus ERROR_CODES.md aufbauen | 1 Woche | LLMs-DCGRCA (2025) | MITTEL |
| **3b-dynamisch** | KG automatisch erweitern via Audit-Logs | 2-3 Wochen | FVDebug (2025) | NIEDRIG |
| **3c** | Claude API + KG-Kontext + Prompt-Template | 1-2 Wochen | AIOps-Forschung | HOCH |
| **MQTT** | MQTT-Trace-Pipeline (Capture → Analyse) | 2-3 Wochen | **Eigenforschung** | MITTEL |

**WICHTIG:** Stufe 3 ist weiterhin ein Langfrist-Ziel. Fuer den ersten Testlauf reichen Stufe 1 (Rule-based) und Stufe 2 (Isolation Forest). Aber die Architektur ist jetzt wissenschaftlich fundiert und kann inkrementell aufgebaut werden.

---

## Sliding-Window-Analyse Konfiguration

### Analyse-Fenster

| Fenster | Zweck | Datenquelle |
|---------|-------|-------------|
| 1h | Kurzfrist-Anomalien (Spikes, Drops) | sensor_data (letzte Stunde) |
| 24h | Tages-Patterns (Temperatur-Zyklen) | sensor_data (letzter Tag) |
| 7d | Langfrist-Drift (Sensor-Degradation) | sensor_data (letzte Woche) |

### Korrelations-Checks

| Korrelation | Physikalische Basis | Alarm bei |
|-------------|--------------------|----|
| Temperatur ↔ Feuchtigkeit | Invers korreliert (Clausius-Clapeyron) | Gleichzeitiger Anstieg |
| pH ↔ EC | Abhaengig von Naehrloesung | Gegenlaeufige Drift > Schwellwert |
| Bodenfeuchte ↔ Bewaesserung | Direkte Korrelation | Keine Reaktion nach Bewaesserung |

---

## Akzeptanzkriterien Phase 3

### Stufe 1 (Minimum fuer Testlauf)

| # | Kriterium | Verifikation |
|---|-----------|-------------|
| 1 | 28+ Grafana-Alerts aktiv | Grafana API → count(rules) >= 28 |
| 2 | Alerts feuern korrekt bei Out-of-Range | Manueller Test mit simulierten Daten |
| 3 | LogQL-Pattern-Matching funktioniert | Loki-Query findet Server-Errors |

### Stufe 2 (Ziel)

| # | Kriterium | Verifikation |
|---|-----------|-------------|
| 4 | AI-Service implementiert und importierbar | Python import erfolgreich |
| 5 | Isolation Forest trainiert auf echten Daten | `ai/status` zeigt "is_fitted: true" |
| 6 | Anomalien werden erkannt und gespeichert | `ai_predictions` Tabelle hat Eintraege |
| 7 | API-Endpoint fuer Predictions erreichbar | GET `/ai/predictions` gibt Daten zurueck |
| 8 | Periodic Task laeuft | Server-Logs zeigen 5-Minuten-Intervall |

---

## Uebergang zu Phase 4

Phase 3 liefert:
- Rule-based Alerts (Stufe 1) — laeuft in Grafana
- Anomalie-Erkennung (Stufe 2) — laeuft als Server-Service
- AI-Predictions in DB — abrufbar via API
- **NEU: Trace-Abstraktions-Pipeline** (Stufe 3a) — MQTT/Serial/Audit vereinheitlicht
- **NEU: ESP32 Fehler-Knowledge-Graph** (Stufe 3b) — kausale Beziehungen zwischen Error-Codes
- **NEU: LLM-RCA mit KG-Kontext** (Stufe 3c) — Claude API fuer Root-Cause-Analyse

Dies wird in **[Phase 4: Integration](./PHASE_4_INTEGRATION.md)** verwendet fuer:
- Error-Analyse-Dashboard: Anomalien + Alerts + **Kausal-Graphen** in einem Dashboard
- Feedback-Loop: Anomalie erkannt → **Wokwi MCP validiert Hypothese** → Wokwi-Szenario erstellt
- Cross-Layer-Korrelation: meta-analyst verbindet Alerts mit Anomalien **und KG-Pfaden**
- **NEU: Closed-Loop Agent-Architektur** nutzt RCA-Ergebnisse fuer automatische Test-Verfeinerung

---

## Wissenschaftliche Fundierung Phase 3

| Paper | Kernaussage | Anwendung in Phase 3 |
|-------|-------------|---------------------|
| Phan & Nguyen (2025) | Isolation Forest Score 0.464, 600x schneller als LSTM | **Stufe 2:** Algorithmus-Wahl bestaetigt |
| Devi et al. (2024) | Isolation Forest → automatische Recovery | **Stufe 2:** Self-Healing-Erweiterung |
| **LLMs-DCGRCA (2025)** | Dynamische Kausal-Graphen + LLMs, +14% HR@7 | **Stufe 3b:** Causal Graph Construction |
| **TAAF (2026)** | Knowledge Graphs + LLMs fuer Traces, +31.2% | **Stufe 3a:** Trace-Abstraktion |
| **TRAIL (2025)** | Formale Error-Taxonomie + Trace Reasoning | **Stufe 3a/3b:** Taxonomie-Integration |
| **FVDebug (2025)** | For-and-Against Prompting, 61.2% F1 | **Stufe 3b:** Kausalgraph-Generierung |
| **TraceCoder (2026)** | Multi-Agent Debugging, +34.43% Pass@1 | **Stufe 3c:** Multi-Agent-Analyse |
| Fariha (2024) — AetherLog | KG-basierte Log-Analyse fuer Cloud-Systeme | **Stufe 3a:** Log-Abstraktion Referenz |
| LEAT (2025) | LLM-Enhanced Anomaly Transformer | **Stufe 2/3:** Hybrid-Strategie |

---

## Agents & Skills (Zusammenfassung)

| Schritt | Agent/Skill | Aufgabe |
|---------|-------------|---------|
| Stufe 1 | `/auto-ops:ops-diagnose` | Alert-Status pruefen |
| Stufe 2 | `server-dev` / `/server-development` | AI-Service + Repository + Router implementieren |
| Stufe 2 | `db-inspector` | ai_predictions Schema pruefen |
| Stufe 2 | `/auto-ops:ops` | Integration mit auto-ops |
| **Stufe 3a** | `test-log-analyst` + `mqtt-debug` | **Trace-Abstraktion (MQTT + Serial + Audit)** |
| **Stufe 3b** | `meta-analyst` | **Fehler-KG aufbauen und validieren** |
| **Stufe 3c** | `/auto-ops:ops-diagnose` | **Claude API RCA mit KG-Kontext** |
| **MQTT** | `mqtt-debug` | **MQTT-Trace-Pipeline** |
| Ende | `/verify-plan` | Phase 3 gegen Codebase verifizieren |

---

## /verify-plan Ergebnis (Phase 3)

**Plan:** AI-Anomalie-Erkennung in 3 Stufen (Rule-based, Isolation Forest, LLM)
**Geprueft:** 6 Dateipfade, 4 Dependencies, 3 Agent-Referenzen, 1 Scheduler-Pattern

### Bestaetigt
- ai_service.py STUB existiert (1 Zeile) → muss implementiert werden
- ai_repo.py STUB existiert (3 Zeilen) → muss implementiert werden
- Stufe 1 (Rule-based) korrekt an Phase 0 gekoppelt
- APScheduler-Infrastruktur vorhanden (`core/scheduler.py`)
- Grafana-Alert-Queries korrekt (Provisioning API + AlertManager API)
- Loki-LogQL-Syntax korrekt
- auto-ops Plugin-Skills (error-codes, cross-layer-correlation, loki-queries) bestaetigt

### Korrekturen noetig

**AI Model bereits implementiert:**
- Plan sagt `ai_prediction.py` → tatsaechlich: `ai.py` mit Klasse `AIPredictions` (130 Zeilen, vollstaendig!)
- Plan-Model-Entwurf (Schritt 3.2.1) ist UNNOETIG — Model existiert mit UUID PK, ForeignKeys, JSON-Feldern, 4 Indizes
- Plan-Entwurf nutzt `Column(Integer)`, reales Model nutzt `Mapped[uuid.UUID]` (SQLAlchemy 2.0 Style)

**Falsche Pfade:**
- `src/api/routers/ai_router.py` → korrekt: `src/api/v1/ai.py`
- `sensor_data_repo.py` → korrekt: `sensor_repo.py`
- `sensor_router.py` → korrekt: `sensors.py`

**Fehlende Dependencies:**
- `scikit-learn` NICHT in pyproject.toml
- `numpy` NICHT in pyproject.toml
- Beides muss HINZUGEFUEGT werden

**Scheduler-Pattern:**
- Plan nutzt `repeat_every` (FastAPI-Pattern) → Projekt nutzt APScheduler (`AsyncIOScheduler`)
- Periodic Task muss als APScheduler-Job registriert werden

**Debug-Endpoint:**
- `/api/v1/debug/simulate-error` existiert NICHT → alternativer Testweg noetig

**Container-Name:**
- `automationone-mqtt-broker` → korrekt: `automationone-mqtt`

### Fehlende Vorbedingungen
- [ ] Phase 0 + Phase 2 Schritt 2.1-2.4 abgeschlossen
- [ ] scikit-learn + numpy in pyproject.toml + Docker-Image
- [ ] Alembic-Migration fuer ai_predictions Tabelle pruefen (Model existiert, Tabelle ggf. noch nicht)

### Zusammenfassung
Plan ist konzeptionell stark, hat aber **8 Korrekturen** noetig. Wichtigste Erkenntnis: Das AI-Prediction DB-Model existiert bereits vollstaendig (`ai.py`) — Schritt 3.2.1 kann uebersprungen werden. Die uebrigen Probleme sind Pfad-Korrekturen und fehlende Dependencies. Scheduler muss APScheduler-Pattern folgen statt repeat_every.
