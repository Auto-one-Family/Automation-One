# Phase 3: KI-Error-Analyse aktivieren

> **Voraussetzung:** [Phase 2](./PHASE_2_PRODUKTIONSTESTFELD.md) Schritt 2.1-2.4 abgeschlossen (Sensordaten fliessen)
> **Nutzt:** [Phase 0](./PHASE_0_ERROR_TAXONOMIE.md) Error-Taxonomie + Grafana-Alerts
> **Nachfolger:** [Phase 4](./PHASE_4_INTEGRATION.md) (Integration)
> **Master-Plan:** [00_MASTER_PLAN.md](./00_MASTER_PLAN.md) Abschnitt "PHASE 3"

---

## Ziel

Automatisierte Fehlererkennung die im Hintergrund mitlaeuft — in beiden Spuren (Wokwi + Produktion) nutzbar. Drei Stufen: Rule-based → Statistisch → LLM-basiert (inkrementell).

---

## Stufe 1: Rule-Based (sofort, 0 Code)

### Voraussetzung

- [Phase 0](./PHASE_0_ERROR_TAXONOMIE.md) Schritt 0.3 abgeschlossen: 28+ Grafana-Alert-Regeln aktiv
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

## Stufe 3: LLM-basierte Root-Cause-Analyse (spaeter)

### Voraussetzung

- Stufe 1 + 2 laufen stabil
- Ausreichend Anomalie-Daten in `ai_predictions`
- Claude API-Key vorhanden (Budget freigeben)

### Konzept

| Komponente | Beschreibung | Aufwand |
|-----------|-------------|--------|
| Claude API Integration | Error-Context → Strukturierter Prompt → Root-Cause-Bericht | Mittel |
| Timeline-Rekonstruktion | `correlation_id` aus Audit-Logs → Ereigniskette bauen | Gering |
| Fix-Vorschlaege | Error-Code → ERROR_CODES.md Loesung → Kontext-spezifisch anpassen | Gering |

### Integration mit auto-ops

Das auto-ops Plugin hat bereits:
- Error-Code-Referenz (`auto-ops:error-codes`)
- Cross-Layer-Korrelation (`auto-ops:cross-layer-correlation`)
- Loki-Queries (`auto-ops:loki-queries`)

**Erweiterung:** Claude API Call innerhalb auto-ops Agent fuer automatische Root-Cause-Analyse wenn:
1. Grafana-Alert feuert (Stufe 1)
2. Isolation Forest findet Anomalie (Stufe 2)
3. Beide zusammen → Claude analysiert Kontext und gibt Empfehlung

### Implementierung (NICHT fuer ersten Testlauf)

**WICHTIG:** Stufe 3 ist ein Langfrist-Ziel. Fuer den ersten Testlauf reichen Stufe 1 (Rule-based) und Stufe 2 (Isolation Forest).

```
Stufe 3 Roadmap:
├── API-Key + Budget-Limit konfigurieren
├── Prompt-Template fuer IoT-Error-Analyse erstellen
├── Rate-Limiting (max N Calls/Stunde)
├── Response in ai_predictions speichern (resolution: "llm_suggested")
└── Dashboard-Widget fuer LLM-Analysen
```

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

Dies wird in **[Phase 4: Integration](./PHASE_4_INTEGRATION.md)** verwendet fuer:
- Error-Analyse-Dashboard: Anomalien + Alerts in einem Dashboard
- Feedback-Loop: Anomalie erkannt → Wokwi-Szenario erstellt (Phase 1 Rueckkopplung)
- Cross-Layer-Korrelation: meta-analyst verbindet Alerts mit Anomalien

---

## Agents & Skills (Zusammenfassung)

| Schritt | Agent/Skill | Aufgabe |
|---------|-------------|---------|
| Stufe 1 | `/auto-ops:ops-diagnose` | Alert-Status pruefen |
| Stufe 2 | `server-dev` / `/server-development` | AI-Service + Repository + Router implementieren |
| Stufe 2 | `db-inspector` | ai_predictions Schema pruefen |
| Stufe 2 | `/auto-ops:ops` | Integration mit auto-ops |
| Stufe 3 | (spaeter) | Claude API Integration |
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
