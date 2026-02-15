# Phase 1 – Log-Klassifikation via Claude API
## Detaillierter Implementierungsplan für AutomationOne

**Stand:** 2026-02-10
**Basiert auf:** Netz-Recherche zu Anthropic API Best Practices, Structured Outputs, Prompt Caching, Pricing, FastAPI-LLM-Integration Patterns, Loki HTTP API

---

## Zusammenfassung der Recherche-Erkenntnisse

Die Recherche hat drei wesentliche Erkenntnisse ergeben, die den ursprünglichen Plan deutlich verbessern:

**1. Haiku 4.5 statt Sonnet für Klassifikation**
Anthropic empfiehlt Haiku 4.5 explizit für "classification, tagging, extraction at scale". Das Modell erreicht bei Klassifikations-Tasks nahezu Sonnet-4-Qualität bei einem Drittel der Kosten ($1/$5 statt $3/$15 pro Million Tokens). Structured Outputs sind seit GA für Haiku 4.5 verfügbar – garantierte JSON-Schema-Konformität ohne Parsing-Workarounds.

**2. Prompt Caching senkt Kosten um 90%**
Dein Error-Code-Katalog und die System-Instructions sind statisch – der perfekte Kandidat für Prompt Caching. Cache-Reads kosten nur 10% des normalen Input-Preises. Bei einem System-Prompt von ~2000 Tokens (Error-Katalog + Instructions) und Requests alle paar Minuten bleibt der Cache aktiv (5-Minuten TTL, refreshed bei Nutzung). Ergebnis: Statt ~$0.50/Tag eher ~$0.08/Tag.

**3. Batch API für Scheduled-Runs, Live API für Echtzeit**
Die Batch API bietet 50% Rabatt bei asynchroner Verarbeitung (bis zu 100.000 Requests pro Batch, Ergebnis innerhalb 1 Stunde). Perfekt für den Scheduled-Modus. Die Live-API bleibt für Event-basierte Echtzeit-Klassifikation.

---

## Architektur-Entscheidungen

### Modell-Wahl: Haiku 4.5

| Kriterium | Haiku 4.5 | Sonnet 4.5 |
|-----------|-----------|------------|
| Preis Input | $1.00/MTok | $3.00/MTok |
| Preis Output | $5.00/MTok | $15.00/MTok |
| Klassifikations-Qualität | ~90% von Sonnet | Referenz |
| Latenz | 4-5x schneller | Referenz |
| Structured Outputs | GA ✓ | GA ✓ |
| Prompt Caching | ✓ (5min + 1h TTL) | ✓ |
| Batch API | ✓ (50% Rabatt) | ✓ |

**Entscheidung:** Haiku 4.5 als Default. Sonnet 4.5 als konfigurierbares Fallback für Edge-Cases wo Haiku unsicher ist (Confidence < 0.5). Das ist exakt das Pattern das Anthropic selbst empfiehlt: "Haiku for high-volume classification, escalate to Sonnet for ambiguous cases."

**Modell-String:** `claude-haiku-4-5-20251001`

### Structured Outputs statt Free-Form JSON

Statt Claude zu bitten "antworte als JSON" nutzen wir Structured Outputs mit Pydantic-Schema. Das garantiert 100% valides JSON – keine Parsing-Fehler, keine Retry-Logik, kein Validierungs-Code.

```python
from pydantic import BaseModel, Field, ConfigDict
from typing import Literal
from enum import Enum

class ErrorLayer(str, Enum):
    FIRMWARE = "firmware"
    BROKER = "broker"
    SERVER = "server"
    FRONTEND = "frontend"
    UNKNOWN = "unknown"

class LogClassification(BaseModel):
    """Einzelne Log-Zeilen-Klassifikation."""
    model_config = ConfigDict(extra="forbid")

    pattern: str = Field(
        description="Error-Code-Name aus dem Katalog oder 'UNKNOWN'"
    )
    error_code: int | None = Field(
        default=None,
        description="Numerischer Error-Code (1000-5699) oder null"  # [KORREKTUR: Range ist 1000-5699, nicht 5999. Siehe ERROR_CODES.md]
    )
    confidence: float = Field(
        ge=0.0, le=1.0,
        description="Klassifikations-Konfidenz"
    )
    layer: ErrorLayer = Field(
        description="Betroffener System-Layer"
    )
    severity: Literal["debug", "info", "warning", "error", "critical"] = Field(
        description="Eingeschätzte Schwere"
    )

class BatchClassificationResult(BaseModel):
    """Ergebnis eines Batch-Klassifikations-Requests."""
    model_config = ConfigDict(extra="forbid")

    classifications: list[LogClassification]
    summary: str = Field(
        description="Kurze Zusammenfassung der gefundenen Patterns"
    )
```

**Warum Pydantic hier entscheidend ist:** Du nutzt Pydantic bereits überall in El Servador (FastAPI). Die Klassifikations-Schemas sind direkt kompatibel mit deinen API-Responses, DB-Modellen, und Frontend-Types. Kein Format-Bruch.

### Prompt Caching für den Error-Code-Katalog

Der System-Prompt besteht aus zwei Teilen:
1. **Statisch (gecached):** Error-Code-Katalog, Fehlermuster-Katalog, Klassifikations-Instructions
2. **Dynamisch (pro Request):** Die zu klassifizierenden Log-Zeilen

```python
system_prompt = [
    {
        "type": "text",
        "text": CLASSIFICATION_INSTRUCTIONS,  # ~500 Tokens
    },
    {
        "type": "text",
        "text": ERROR_CODE_CATALOG,  # ~1500+ Tokens (dein Katalog 1000-5999)
        "cache_control": {"type": "ephemeral"}  # Cache-Breakpoint hier
    }
]
```

**Kostenrechnung mit Caching:**
- Erster Request (Cache-Write): 1.25x × $1.00/MTok = $1.25/MTok
- Alle folgenden (Cache-Read): 0.1x × $1.00/MTok = $0.10/MTok
- Break-Even nach 2 Requests
- Bei 50 Requests/Tag: ~95% der System-Prompt-Tokens zum Cache-Read-Preis

### Drei Trigger-Modi (wie im Originalplan, aber präzisiert)

| Modus | API-Typ | Wann | Kosten-Optimierung |
|-------|---------|------|-------------------|
| **Event-basiert** | Live API + Caching | Grafana Alert feuert (ERROR/CRITICAL) | Prompt Cache (90% Rabatt) |
| **Scheduled** | Batch API | Alle 5min neue Logs klassifizieren | Batch (50%) + Cache (90%) |
| **On-Demand** | Live API + Caching | Debug-Agent oder User-Request | Prompt Cache (90% Rabatt) |

---

## Integration in den bestehenden Stack

### Wo es hingehört: `El Servador/god_kaiser_server/src/ai/`

**[VERIFIED ✓]** Projektstruktur ist `El Servador/god_kaiser_server/src/` (korrekt).

Neues AI-Modul als eigenständige Domain innerhalb El Servador. Folgt dem Domain-Driven-Design-Pattern das bei FastAPI-LLM-Integrationen als Best Practice gilt:

```
El Servador/god_kaiser_server/src/
├── ai/                           # NEUE AI-Domain
│   ├── __init__.py
│   ├── config.py                 # AI-spezifische Konfiguration
│   ├── dependencies.py           # FastAPI Dependency Injection
│   │
│   ├── providers/                # [ARCHITEKTUR ⚠️] LLM-Provider Layer (niedrige Ebene)
│   │   ├── __init__.py
│   │   ├── base_provider.py      # ABC: BaseLLMProvider — Auth, Caching, Rate-Limiting, Usage-Tracking, Schema-Enforcement
│   │   ├── anthropic_provider.py # Claude API (cache_control, output_config mit json_schema)
│   │   ├── factory.py            # AIProviderFactory: AI_PRIMARY_MODEL String → Provider-Instanz
│   │   └── # Später: openai_provider.py, ollama_provider.py, jetson_provider.py
│   │
│   ├── adapters/                 # [ARCHITEKTUR ⚠️] Task-Adapter Layer (hohe Ebene, provider-agnostisch)
│   │   ├── __init__.py
│   │   ├── base_task.py          # ABC: BaseTaskAdapter — Prompt-Bau, Output-Schema, Ergebnis-Interpretation
│   │   ├── classifier_adapter.py # Log-Klassifikation Task (classify_batch)
│   │   └── # Später: anomaly_adapter.py (Phase 2), cross_layer_adapter.py (Phase 6)
│   │
│   ├── schemas/                  # Pydantic-Modelle (Request/Response + Structured Output)
│   │   ├── __init__.py
│   │   ├── classification.py     # LogClassification, BatchClassificationResult
│   │   └── # Später: anomaly.py, correlation.py
│   │
│   ├── services/                 # Business-Logik
│   │   ├── __init__.py
│   │   ├── log_classifier.py     # Hauptservice
│   │   ├── loki_client.py        # Loki HTTP API Wrapper
│   │   └── # Später: anomaly_detector.py, metric_correlator.py
│   │
│   ├── models/                   # SQLAlchemy DB-Modelle
│   │   ├── __init__.py
│   │   └── classification.py     # ai_log_classifications Tabelle
│   │
│   ├── prompts/                  # Prompt-Templates (versioniert!)
│   │   ├── __init__.py
│   │   ├── v1_classifier.py      # System-Prompt Version 1
│   │   └── error_catalog.py      # Error-Code-Katalog als Python-Konstante
│   │
│   └── router.py                 # FastAPI Router (/api/v1/ai/...)
│
├── api/                          # Bestehend (FastAPI Router)
├── core/                         # Bestehend
├── db/                           # Bestehend (Models, Repositories, Session)
├── mqtt/                         # Bestehend
├── schemas/                      # Bestehend (Pydantic)
├── services/                     # Bestehend
└── ...
```

**Warum diese Struktur:**
- **providers/** → [NEU] Niedrige Ebene: LLM-API-Zugriff, Auth, Schema-Enforcement, Usage-Tracking. Provider-spezifisch (Anthropic, OpenAI, Ollama). Factory erzeugt den richtigen Provider aus Config.
- **adapters/** → [ANGEPASST] Hohe Ebene: Task-spezifisch, provider-agnostisch. Baut Prompts, definiert Output-Schema, interpretiert Ergebnis. Neue Tasks (Anomalie, Cross-Layer) = neuer Adapter, KEIN Provider-Code.
- **schemas/** → Pydantic-Modelle sowohl für API-Responses als auch Structured Outputs
- **prompts/** → Versionierte Prompts, separat vom Code. Prompt-Änderung ≠ Code-Deployment. Provider-agnostisch (kein `cache_control` hier!)
- **services/** → Geschäftslogik getrennt von API-Routen und LLM-Details

### Loki-Integration: Logs programmatisch abfragen

**[VERIFIED ✓]** Loki/Promtail/Prometheus/Grafana laufen im Docker-Profil `monitoring` (Start: `docker compose --profile monitoring up -d`). Stack ist AKTIV (alle Container healthy). Die tatsächlichen Loki-Labels sind: `container`, `service` (NICHT `service_name`!), `stream`, `compose_service`, `compose_project`. (Quelle: `docker/promtail/config.yml`)

```python
# El Servador/god_kaiser_server/src/ai/services/loki_client.py

import httpx
from datetime import datetime, timedelta

class LokiClient:
    """Wrapper für Loki HTTP Query API."""

    def __init__(self, base_url: str = "http://loki:3100"):
        self.base_url = base_url
        self.client = httpx.AsyncClient(base_url=base_url, timeout=30.0)

    async def query_range(
        self,
        logql: str,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 500
    ) -> list[dict]:
        """Logs über Zeitraum abfragen via /loki/api/v1/query_range."""
        if not start:
            start = datetime.utcnow() - timedelta(minutes=5)
        if not end:
            end = datetime.utcnow()

        params = {
            "query": logql,
            "start": str(int(start.timestamp() * 1e9)),  # Nanoseconds
            "end": str(int(end.timestamp() * 1e9)),
            "limit": limit,
            "direction": "backward"
        }
        resp = await self.client.get("/loki/api/v1/query_range", params=params)
        resp.raise_for_status()
        return self._parse_streams(resp.json())

    async def get_recent_errors(
        self, minutes: int = 5, services: list[str] | None = None
    ) -> list[dict]:
        """Convenience: Aktuelle ERROR/CRITICAL Logs aller Services."""
        service_filter = ""
        if services:
            joined = "|".join(services)
            service_filter = f', service=~"{joined}"'  # [KORREKTUR] Label ist "service", nicht "service_name"

        logql = (
            f'{{stream="stderr"{service_filter}}} '
            f'|~ "(?i)(error|critical|exception|traceback)"'
        )
        return await self.query_range(
            logql=logql,
            start=datetime.utcnow() - timedelta(minutes=minutes)
        )

    def _parse_streams(self, data: dict) -> list[dict]:
        """Loki-Response in flache Log-Liste umwandeln."""
        logs = []
        for stream in data.get("data", {}).get("result", []):
            labels = stream.get("stream", {})
            for ts, line in stream.get("values", []):
                logs.append({
                    "timestamp": ts,
                    "line": line,
                    "service": labels.get("service", "unknown"),  # [KORREKTUR] "service", nicht "service_name"
                    "container": labels.get("container", "unknown"),
                    "stream": labels.get("stream", "unknown")
                })
        return logs
```

**Passt in deinen Stack weil:**
- Loki ist intern erreichbar (`http://loki:3100` im Docker-Netzwerk)
- LogQL nutzt deine bestehenden Labels (`service`, `container`, `stream`) — [KORREKTUR: Label heißt `service`, NICHT `service_name`! Verifiziert in `docker/promtail/config.yml` Zeile 45]
- `httpx.AsyncClient` passt zu FastAPI's async-Architektur
- Kein neues Tool – nur HTTP-Requests an dein bestehendes Loki

### Anthropic Adapter: Prompt Caching + Structured Outputs + Model Routing

**[DEPENDENCY FEHLT ⚠️]** `anthropic` SDK muss zu `El Servador/god_kaiser_server/pyproject.toml` dependencies hinzugefügt werden (aktuell **nicht vorhanden**). Empfohlen: `anthropic = "^0.40.0"` (aktuelle GA-Version mit Structured Outputs).

```python
# El Servador/god_kaiser_server/src/ai/adapters/anthropic_adapter.py

from anthropic import AsyncAnthropic, transform_schema
from src.ai.adapters.base import BaseAIAdapter  # [VERIFIED ✓] Importpfad korrekt
from src.ai.schemas.classification import BatchClassificationResult
from src.ai.prompts.v1_classifier import SYSTEM_INSTRUCTIONS
from src.ai.prompts.error_catalog import ERROR_CATALOG_TEXT
from src.ai.config import ai_settings

class AnthropicClassifierAdapter(BaseAIAdapter):
    """Claude API Adapter mit Prompt Caching und Structured Outputs.

    [ARCHITEKTUR ⚠️ — 5 PROBLEME IDENTIFIZIERT]

    1. ZWEI-SCHICHTEN-TRENNUNG FEHLT:
       Dieser Adapter mischt Provider-Logik (Anthropic API, cache_control)
       mit Task-Logik (Prompt-Bau, Klassifikation). Aufteilung nötig:
       - BaseLLMProvider: Auth, Caching, Rate-Limiting, Schema-Enforcement (provider-spezifisch)
       - BaseTaskAdapter: Prompt-Bau, Output-Schema, Ergebnis-Interpretation (provider-agnostisch)

    2. PROMPT IM ADAPTER HART VERDRAHTET:
       System-Prompt-Assembly (SYSTEM_INSTRUCTIONS + ERROR_CATALOG_TEXT + cache_control)
       gehört in prompts/ Verzeichnis (provider-agnostisch). Provider fügt Optimierungen
       hinzu (Anthropic: cache_control, OpenAI: auto prefix-caching).

    3. STRUCTURED OUTPUTS NICHT PORTABEL:
       transform_schema() + output_config sind Anthropic-SDK-spezifisch.
       BaseLLMProvider soll Pydantic-Schema entgegennehmen und intern entscheiden:
       Anthropic → output_config, OpenAI → response_format, Ollama → JSON-Mode + Retry.

    4. KEINE PROVIDER-FACTORY:
       LogClassifierService erstellt direkt AnthropicClassifierAdapter() = harte Kopplung.
       Factory nötig: AI_PRIMARY_MODEL String → passender Provider (claude-* → Anthropic,
       gpt-* → OpenAI, llama-* → Ollama).

    5. USAGE-TRACKING ALS PASS:
       _log_usage() ist leer. Gehört als Decorator/Middleware auf Provider-Ebene —
       jeder API-Call automatisch getrackt, unabhängig vom Provider.
    """

    def __init__(self):
        self.client = AsyncAnthropic(api_key=ai_settings.ANTHROPIC_API_KEY)
        self.primary_model = "claude-haiku-4-5-20251001"
        self.fallback_model = "claude-sonnet-4-5-20250929"

    async def classify_batch(
        self,
        log_lines: list[dict],
        use_fallback: bool = False
    ) -> BatchClassificationResult:
        """Batch von Log-Zeilen klassifizieren."""

        model = self.fallback_model if use_fallback else self.primary_model

        # Log-Zeilen als nummerierte Liste formatieren
        formatted_logs = "\n".join(
            f"[{i+1}] [{log['service']}] {log['line'][:500]}"
            for i, log in enumerate(log_lines)
        )

        response = await self.client.messages.parse(
            model=model,
            max_tokens=4096,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_INSTRUCTIONS
                },
                {
                    "type": "text",
                    "text": ERROR_CATALOG_TEXT,
                    "cache_control": {"type": "ephemeral"}
                    # ↑ Cache-Breakpoint: Alles bis hier wird gecached
                    #   Spart 90% der Input-Kosten bei jedem Folge-Request
                }
            ],
            messages=[{
                "role": "user",
                "content": f"Klassifiziere diese {len(log_lines)} Log-Zeilen:\n\n{formatted_logs}"
            }],
            output_config={
                "format": {
                    "type": "json_schema",
                    "schema": transform_schema(BatchClassificationResult)
                }
            }
        )

        result = response.parsed_output

        # Tracking: Cache-Nutzung loggen für Kosten-Monitoring
        usage = response.usage
        self._log_usage(
            model=model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_creation=getattr(usage, 'cache_creation_input_tokens', 0),
            cache_read=getattr(usage, 'cache_read_input_tokens', 0)
        )

        return result

    def _log_usage(self, model, input_tokens, output_tokens,
                   cache_creation, cache_read):
        """Token-Nutzung für Kosten-Tracking loggen.

        [ARCHITEKTUR ⚠️] Diese Methode ist leer (pass). Usage-Tracking
        gehört als Decorator/Middleware auf BaseLLMProvider-Ebene, damit
        JEDER Provider automatisch getrackt wird. Implementierung:
        - Prometheus Counter (ai_tokens_used_total) inkrementieren
        - Kosten berechnen (model-spezifische Preise)
        - Budget-Prüfung (ai_daily_budget_remaining_usd aktualisieren)
        - Bei Budget-Überschreitung: AIBudgetExhaustedException werfen
        """
        # TODO: Implementierung in BaseLLMProvider als Decorator verschieben
        pass
```

**Schlüssel-Designentscheidungen:**

1. **`messages.parse()`** statt `messages.create()`: Gibt direkt ein typisiertes Pydantic-Objekt zurück. Kein `json.loads()`, kein Parsing, kein Fehlerhandling für malformed JSON.

2. **`cache_control` auf dem Error-Katalog:** Der Katalog ist der größte statische Block (~1500+ Tokens). Instructions davor werden automatisch mit-gecached (backward sequential checking).

3. **`output_config` statt `output_format`:** Aktueller GA-Parameter (nicht mehr Beta). Kein Beta-Header nötig.

4. **Model-Routing:** `primary_model` (Haiku) und `fallback_model` (Sonnet) konfigurierbar. Später: automatisches Escalation bei niedriger Confidence.

### Datenbank-Schema

```python
# El Servador/god_kaiser_server/src/ai/models/classification.py

from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, JSON
from sqlalchemy.sql import func
from src.db.base import Base  # [VERIFIED ✓] Base ist in src.db.base (korrekt)

class AILogClassification(Base):
    __tablename__ = "ai_log_classifications"

    # [DB-SCHEMA ANMERKUNG]
    # Bestehende AI-Tabelle: "ai_predictions" (siehe src/db/models/ai.py)
    # Neue AI-Tabelle: "ai_log_classifications" (separate Domäne)
    # Naming-Pattern: Snake-case mit Unterstrichen (passt zu bestehenden: esp_heartbeat_logs, sensor_configs)
    #
    # [STYLE-KORREKTUR ⚠️] Bestehende Models (inkl. ai.py) nutzen SQLAlchemy 2.0 Syntax:
    #   Mapped[type] + mapped_column() statt Column()
    # Dieser Plan nutzt altes Column()-Pattern. Bei Implementierung MUSS auf
    # Mapped/mapped_column umgestellt werden (Pattern: siehe src/db/models/ai.py)

    id = Column(Integer, primary_key=True, index=True)

    # Log-Referenz
    log_line = Column(Text, nullable=False)
    log_hash = Column(String(64), index=True)  # SHA-256 für Dedup — [ERGÄNZUNG ⚠️] Hash MUSS log_service einbeziehen! Gleiche Fehlermeldung von verschiedenen Containern = anderer Kontext
    log_timestamp = Column(DateTime, nullable=False)
    log_service = Column(String(100), nullable=False)

    # Klassifikation
    pattern = Column(String(100), nullable=False, index=True)
    error_code = Column(Integer, nullable=True, index=True)
    confidence = Column(Float, nullable=False)
    layer = Column(String(20), nullable=False)
    severity = Column(String(20), nullable=False)

    # Modell-Tracking
    model_used = Column(String(50), nullable=False)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    cache_read_tokens = Column(Integer, default=0)

    # Meta
    trigger_mode = Column(String(20), nullable=False)  # event|scheduled|on_demand
    classified_at = Column(DateTime, server_default=func.now())
    batch_id = Column(String(36), nullable=True)  # UUID für Batch-Zuordnung

    # Feedback (für späteres Training)
    human_verified = Column(Boolean, default=False)
    human_correction = Column(String(100), nullable=True)
    verified_at = Column(DateTime, nullable=True)
```

**Warum `log_hash`:** SHA-256 des Log-Texts. Identische Log-Zeilen werden nicht erneut klassifiziert. Spart API-Calls UND Geld. Besonders wichtig bei Reconnect-Loops wo die gleiche Meldung hundertfach auftaucht.

**Warum `human_verified` + `human_correction`:** Grundlage für Feedback-Loop. Wenn du eine Klassifikation korrigierst, sammeln sich Trainingsdaten für späteres Fine-Tuning oder lokale Modelle auf dem Jetson.

### API-Endpoints

```python
# El Servador/god_kaiser_server/src/ai/router.py

from fastapi import APIRouter, Depends, BackgroundTasks, Query
from src.ai.dependencies import get_classifier_service  # [VERIFIED ✓] Importpfad korrekt
from src.ai.schemas.classification import (
    ClassifyRequest, ClassifyResponse,
    ClassificationListResponse, ClassificationStats
)

router = APIRouter(prefix="/api/v1/ai", tags=["AI"])

@router.post("/classify", response_model=ClassifyResponse)
async def classify_logs(
    request: ClassifyRequest,
    bg: BackgroundTasks,
    service = Depends(get_classifier_service)
):
    """On-Demand: Log-Zeilen klassifizieren."""
    result = await service.classify(
        log_lines=request.log_lines,
        trigger_mode="on_demand"
    )
    bg.add_task(service.persist_results, result)
    return result

@router.post("/classify/recent")
async def classify_recent_logs(
    minutes: int = Query(5, ge=1, le=60),
    services: list[str] | None = Query(None),
    service = Depends(get_classifier_service)
):
    """Letzte N Minuten Logs fetchen und klassifizieren."""
    result = await service.classify_recent(
        minutes=minutes,
        services=services,
        trigger_mode="on_demand"
    )
    return result

@router.get("/classifications", response_model=ClassificationListResponse)
async def get_classifications(
    pattern: str | None = None,
    layer: str | None = None,
    min_confidence: float = 0.0,
    limit: int = Query(50, le=500),
    service = Depends(get_classifier_service)
):
    """Gespeicherte Klassifikationen abfragen."""
    return await service.get_classifications(
        pattern=pattern,
        layer=layer,
        min_confidence=min_confidence,
        limit=limit
    )

@router.get("/classifications/stats", response_model=ClassificationStats)
async def get_classification_stats(
    hours: int = Query(24, ge=1, le=168),
    service = Depends(get_classifier_service)
):
    """Statistiken: Häufigste Patterns, Layer-Verteilung, Kosten."""
    return await service.get_stats(hours=hours)

@router.patch("/classifications/{id}/verify")
async def verify_classification(
    id: int,
    correct_pattern: str | None = None,
    service = Depends(get_classifier_service)
):
    """Human Feedback: Klassifikation bestätigen oder korrigieren."""
    return await service.verify(id=id, correction=correct_pattern)
```

### Scheduled Job: Automatische Klassifikation

**[APSCHEDULER VORHANDEN ✓]** APScheduler ist bereits installiert (`apscheduler = "^3.11.2"`) und zentral konfiguriert (`src.core.scheduler.CentralScheduler`). Nutze `scheduler.add_interval_job()` für den 5-Minuten-Job. Scheduler wird in `main.py` via `init_central_scheduler()` gestartet. **Kein separates Celery/Beat nötig.**

```python
# In El Servador/god_kaiser_server/src/ai/services/log_classifier.py (Auszug)

async def scheduled_classify(self):
    """Wird alle 5 Minuten aufgerufen (APScheduler CentralScheduler)."""  # [KORREKTUR: Kein Celery im System. APScheduler ist der einzige Scheduler]

    # 1. Letzte 5min Logs aus Loki holen (nur ERROR/CRITICAL)
    logs = await self.loki_client.get_recent_errors(minutes=5)

    if not logs:
        return

    # 2. Dedup: Bereits klassifizierte Logs ausschließen
    new_logs = await self._filter_already_classified(logs)

    if not new_logs:
        return

    # 3. Batching: Max 50 Zeilen pro API-Call
    for batch in self._chunk(new_logs, size=50):
        result = await self.adapter.classify_batch(batch)

        # 4. Low-Confidence → Escalation zu Sonnet
        # [ERGÄNZUNG ⚠️] Escalation-Logik ist hier hart kodiert.
        # Schwellwert kommt aus AI_ESCALATION_THRESHOLD (Config), aber:
        # - AI_ESCALATION_ENABLED Flag fehlt (jetzt ergänzt in Config)
        # - Prüfung muss sein: if ai_settings.AI_ESCALATION_ENABLED and low_conf:
        low_conf = [c for c in result.classifications if c.confidence < 0.5]
        if low_conf:
            # Nur die unsicheren nochmal mit Sonnet versuchen
            low_conf_logs = [batch[i] for i, c in enumerate(result.classifications)
                           if c.confidence < 0.5]
            retry_result = await self.adapter.classify_batch(
                low_conf_logs, use_fallback=True
            )
            # Ergebnisse mergen...

        # 5. Speichern + WebSocket-Push bei Criticals
        await self.persist_results(result, trigger_mode="scheduled")
        await self._notify_criticals(result)
```

### [LÜCKE ⚠️] Batch API fehlt im Code

Die Trigger-Tabelle (Zeile 120-124) sagt "Batch API" für Scheduled-Runs, aber `scheduled_classify()` nutzt die **normale Live-API** (`self.adapter.classify_batch()`). Die Anthropic Batch API (`/v1/messages/batches`) ist ein komplett anderer Endpoint mit asynchroner Verarbeitung (Ergebnis innerhalb 1h). Für die 50%-Kostenersparnis bei Scheduled-Runs muss ein separater `batch_classify()` Pfad im Provider implementiert werden:
- `BaseLLMProvider.send_batch()` → erstellt Batch-Job, gibt batch_id zurück
- `BaseLLMProvider.poll_batch(batch_id)` → prüft Ergebnis
- Scheduled-Job muss zweistufig werden: Submit + Poll

### [LÜCKE ⚠️] Error Handling fehlt

Der Adapter-Code hat kein Error Handling für API-Fehler. Benötigt:

| Fehler | Handling |
|--------|----------|
| **API-Timeout** | Retry mit exponential backoff (Pattern: `ResilienceSettings` bereits vorhanden) |
| **Rate-Limit (429)** | Retry nach `Retry-After` Header, max 3 Versuche |
| **Budget erschöpft** | Graceful Degradation: Log-Klassifikation pausieren, Prometheus-Gauge auf 0, Alert feuern |
| **Invalid API Key** | Sofort stoppen, AI_ENABLED auf False setzen, Critical-Log |
| **Malformed Response** | Structured Outputs eliminieren dies theoretisch, aber: Netzwerk-Fehler können truncated Response liefern |

Empfehlung: `BaseLLMProvider` integriert Circuit Breaker Pattern (wie `ResilienceRegistry` für MQTT/DB). Circuit Breaker öffnet bei 3 Fehlern, Recovery nach 60s.

---

## Kosten-Kalkulation (realistisch für dein System)

### Annahmen
- 5 Docker-Container erzeugen Logs (el-servador, mqtt-broker, el-frontend, postgres, prometheus)
- ~100-500 ERROR/CRITICAL Log-Zeilen pro Tag (Entwicklungsphase)
- Scheduled: Alle 5min = 288 Runs/Tag
- Error-Katalog als System-Prompt: ~2000 Tokens
- Durchschnittliches Log-Batch: ~30 Zeilen = ~1500 Tokens Input + ~800 Tokens Output

### Haiku 4.5 mit Prompt Caching

| Komponente | Tokens/Tag | Preis/MTok | Kosten/Tag |
|-----------|-----------|-----------|-----------|
| Cache-Write (1x/5min = 288x, aber nur 1. Call) | ~2000 | $1.25 | $0.003 |
| Cache-Read (287 weitere Calls) | ~574.000 | $0.10 | $0.057 |
| Neue Input-Tokens (Log-Zeilen) | ~432.000 | $1.00 | $0.432 |
| Output-Tokens | ~230.000 | $5.00 | $1.15 |
| **Gesamt** | | | **~$1.64/Tag** |

### Vergleich ohne Optimierungen

| Szenario | Kosten/Tag | Kosten/Monat |
|----------|-----------|-------------|
| Haiku + Caching (empfohlen) | ~$1.64 | ~$49 |
| Haiku ohne Caching | ~$2.10 | ~$63 |
| Sonnet + Caching | ~$5.50 | ~$165 |
| Sonnet ohne Caching | ~$7.00 | ~$210 |

### Mit Batch API (Scheduled-Runs)

Wenn Scheduled-Runs über die Batch API laufen (50% Rabatt, Ergebnis innerhalb 1h):

| Szenario | Kosten/Tag | Kosten/Monat |
|----------|-----------|-------------|
| Haiku + Caching + Batch (Scheduled) | ~$1.00 | ~$30 |

**Empfehlung:** ~$30-50/Monat ist realistisch und sinnvoll für den Nutzen.

---

## Konfiguration

**[PYDANTIC-SETTINGS VORHANDEN ✓]** `pydantic-settings = "^2.1.0"` ist installiert. Bestehende Config-Pattern: `src.core.config.Settings` ist eine Master-Klasse mit Sub-Settings (`DatabaseSettings`, `MQTTSettings`, etc.). Alle nutzen `SettingsConfigDict(env_file=".env", extra="ignore")`. Die neue `AISettings` Klasse folgt diesem Pattern und wird als `ai: AISettings = AISettings()` in `Settings` integriert.

```python
# El Servador/god_kaiser_server/src/ai/config.py

from pydantic_settings import BaseSettings, SettingsConfigDict

class AISettings(BaseSettings):
    # API
    ANTHROPIC_API_KEY: str = ""
    AI_ENABLED: bool = False  # Explizit aktivieren!

    # Modelle
    AI_PRIMARY_MODEL: str = "claude-haiku-4-5-20251001"
    AI_FALLBACK_MODEL: str = "claude-sonnet-4-5-20250929"
    AI_ESCALATION_ENABLED: bool = True  # [ERGÄNZUNG] Flag ob Escalation aktiv ist (fehlte)
    AI_ESCALATION_THRESHOLD: float = 0.5  # Confidence unter X → Fallback

    # Klassifikation
    AI_CLASSIFIER_ENABLED: bool = False
    AI_CLASSIFIER_BATCH_SIZE: int = 50
    AI_CLASSIFIER_SCHEDULE_MINUTES: int = 5
    AI_CLASSIFIER_MAX_LOG_AGE_MINUTES: int = 10

    # Loki
    AI_LOKI_URL: str = "http://loki:3100"

    # Budget-Kontrolle
    AI_DAILY_BUDGET_USD: float = 5.0  # Hard-Limit pro Tag
    AI_MONTHLY_BUDGET_USD: float = 100.0

    # Prompt-Version (für A/B-Testing)
    AI_PROMPT_VERSION: str = "v1"

    model_config = SettingsConfigDict(  # [VERIFIED ✓] Pydantic v2 Syntax (korrekt, class Config deprecated)
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

ai_settings = AISettings()
```

**Warum `AI_ENABLED = False` als Default:** Kein versehentliches API-Aufrufen. Du aktivierst es explizit wenn du bereit bist. Passt zu deinem Prinzip der kontrollierten Aktivierung.

**Warum Budget-Kontrolle:** `AI_DAILY_BUDGET_USD` als Hard-Limit. Der Service trackt kumulierte Kosten pro Tag und stoppt bei Überschreitung. Kein Überraschungs-Billing.

---

## Prometheus-Metriken für AI

**[METRIK-COUNT KORRIGIERT]** Es gibt aktuell **7 Custom-Gauges** in `src/core/metrics.py` (uptime, cpu, memory, mqtt_connected, esp_total, esp_online, esp_offline). Die restlichen Metriken stammen von `prometheus-fastapi-instrumentator` (HTTP-Metriken auto-generiert). Neue AI-Metriken werden als weitere Gauges/Counters/Histograms hinzugefügt.

```python
# Neue Metriken in El Servador/god_kaiser_server/src/core/metrics.py

from prometheus_client import Counter, Histogram, Gauge

# Klassifikations-Metriken
ai_classifications_total = Counter(
    "ai_classifications_total",
    "Gesamtzahl Log-Klassifikationen",
    ["model", "trigger_mode", "pattern"]
)
ai_classification_confidence = Histogram(
    "ai_classification_confidence",
    "Verteilung der Confidence-Scores",
    ["model"],
    buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
)
ai_escalations_total = Counter(
    "ai_escalations_total",
    "Anzahl Escalations von Haiku zu Sonnet",
)

# Kosten-Metriken
ai_tokens_used = Counter(
    "ai_tokens_used_total",
    "Token-Verbrauch",
    ["model", "token_type"]  # token_type: input|output|cache_read|cache_write
)
ai_estimated_cost_usd = Counter(
    "ai_estimated_cost_usd_total",
    "Geschätzte API-Kosten in USD",
    ["model"]
)
ai_daily_budget_remaining = Gauge(
    "ai_daily_budget_remaining_usd",
    "Verbleibendes Tagesbudget in USD"
)

# Latenz
ai_api_latency = Histogram(
    "ai_api_latency_seconds",
    "Claude API Antwortzeit",
    ["model", "trigger_mode"],
    buckets=[0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0]
)
```

**Passt in deinen bestehenden Stack:** Diese Metriken landen automatisch in Prometheus (prometheus-fastapi-instrumentator exposed sie), erscheinen in Grafana. Du kannst sofort ein "AI Debugging" Dashboard bauen.

---

## Grafana-Integration

### Neues Dashboard: "AI Log Classification"

**Panel 1: Classification Rate** (Timeseries)
```promql
rate(ai_classifications_total[5m])
```

**Panel 2: Confidence Distribution** (Heatmap)
```promql
ai_classification_confidence_bucket
```

**Panel 3: Top Error Patterns** (Bar Chart)
```promql
topk(10, sum by (pattern) (ai_classifications_total))
```

**Panel 4: API-Kosten heute** (Stat)
```promql
ai_estimated_cost_usd_total
```

**Panel 5: Budget-Ampel** (Gauge)
```promql
ai_daily_budget_remaining_usd
```

### Neue Alert-Rule

```yaml
# AI Budget Alert
- alert: AIBudgetNearlyExhausted
  expr: ai_daily_budget_remaining_usd < 1.0
  for: 0m
  labels:
    severity: warning
  annotations:
    summary: "AI-Tagesbudget fast aufgebraucht ({{ $value }}$ verbleibend)"
```

---

## Passt in deinen bestehenden Flow

| Bestehendes Element | Integration |
|---------------------|-------------|
| **Error-Code-Katalog (1000-5999)** | → Wird zum Prompt-Kontext. Jede Änderung am Katalog = Prompt-Update |
| **Fehlermuster-Katalog** | → Erweitert den Prompt um `correlation_window` und Kaskaden-Infos |
| **Loki (Port 3100, Profil: monitoring)** | → LokiClient queried direkt via HTTP API. **Start:** `make monitor-up` |
| **Prometheus (6 Custom-Gauges + HTTP-Metriken)** | → +8 neue AI-Metriken, gleiches Scraping |
| **Grafana (4 Alerts)** | → +1 Budget-Alert, neues AI-Dashboard |
| **Docker-Netzwerk** | → Alle Services intern erreichbar, kein neuer Container nötig |
| **13+ Claude Agents** | → On-Demand-Endpoint `/api/v1/ai/classify` per Agent aufrufbar (benötigt JWT-Auth) |
| **WebSocket (Frontend)** | → Critical-Klassifikationen → sofortige Benachrichtigung |
| **.env Konfiguration** | → Neue AI-Variablen, gleicher Mechanismus |
| **Alembic Migrations** | → Neue Tabelle `ai_log_classifications` (aktuelle HEAD: `950ad9ce87bb`, 19 Migrations) |
| **APScheduler (bereits vorhanden)** | → Nutze `CentralScheduler` (`src.core.scheduler`) für Scheduled-Job alle 5min. **Kein Celery nötig.** |
| **pytest** | → Neue Tests in `tests/ai/` (Pattern: siehe `tests/unit/`, `tests/integration/`) |

---

## Implementierungsreihenfolge (innerhalb Phase 1)

### Schritt 1: Grundgerüst (Tag 1)
- `src/ai/` Verzeichnis-Struktur anlegen (nicht `app/ai/`)
- `config.py` mit `AISettings(BaseSettings)` Klasse (Pattern: siehe `DatabaseSettings`, `MQTTSettings` in `src/core/config.py`)
- `AISettings` in `src/core/config.Settings` integrieren als `ai: AISettings = AISettings()`
- `schemas/classification.py` mit Pydantic-Modellen (Pattern: siehe `src/schemas/sensor.py`)
- `providers/base_provider.py` (ABC: BaseLLMProvider — Auth, Schema-Enforcement, Usage-Tracking als Decorator)
- `providers/factory.py` (AIProviderFactory: Model-String → Provider)
- `adapters/base_task.py` (ABC: BaseTaskAdapter — Prompt-Bau, Output-Schema)
- **WICHTIG:** `anthropic` SDK zu `pyproject.toml` dependencies hinzufügen: `anthropic = "^0.40.0"`
- Alembic-Migration für `ai_log_classifications` erstellen via `docker exec automationone-server python -m alembic revision --autogenerate -m "add ai_log_classifications table"` — [KORREKTUR: Container heißt `automationone-server`, nicht `el-servador`. Verifiziert in docker-compose.yml `container_name`]
- Migration in `src/db/models/__init__.py` registrieren (Import hinzufügen, damit Alembic autogenerate funktioniert)
- `.env.example` Ergänzungen (neue AI_* Variablen als Dokumentation)

### Schritt 2: Loki-Client (Tag 1)
- `services/loki_client.py`
- **WICHTIG:** Monitoring-Stack ist bereits aktiv (geprüft via `docker compose ps` – Loki/Promtail/Prometheus/Grafana alle healthy)
- LokiClient Basis-URL im Container: `http://loki:3100` (Docker-internes Netzwerk)
- Test: `await loki_client.query_range()` mit LogQL `{stream="stderr"} |~ "error"`
- Verifizieren: Response-Struktur passt (`data.result[].stream.service`, `data.result[].values[]`)
- Verifizieren: Labels stimmen (`service`, `container`, `stream`, `compose_service`, `compose_project` – NICHT `service_name`!)

### Schritt 3: Provider + Task-Adapter (Tag 2)
- `providers/anthropic_provider.py` (BaseLLMProvider mit cache_control, output_config, Usage-Tracking)
- `adapters/classifier_adapter.py` (BaseTaskAdapter — provider-agnostisch, nutzt prompts/)
- `prompts/v1_classifier.py` + `prompts/error_catalog.py`
- Test: Einzelne Log-Zeile klassifizieren
- Verifizieren: Structured Output kommt als typisiertes Pydantic-Objekt
- Verifizieren: Cache-Metriken in Response (`cache_read_input_tokens > 0` bei 2. Call)

### Schritt 4: Service + API (Tag 2-3)
- `services/log_classifier.py` (Orchestrierung)
- `router.py` mit allen Endpoints
- `dependencies.py` (FastAPI DI)
- Hash-basierte Deduplizierung — [WICHTIG: Hash = SHA-256(log_service + log_line), Service-Name MUSS im Hash sein]
- Escalation-Logik (Haiku → Sonnet) — [WICHTIG: Prüfe `AI_ESCALATION_ENABLED` Flag vor Escalation]
- Budget-Tracking
- **[NEU] Error Handling:** Circuit Breaker für AI-Provider (Pattern: `ResilienceRegistry`), Retry mit Backoff bei 429/Timeout, Graceful Degradation bei Budget-Überschreitung

### Schritt 5: Scheduled Job + Monitoring (Tag 3)
- Integration in `CentralScheduler` (`src.core.scheduler`) – **APScheduler bereits vorhanden und gestartet**
- Job-Registrierung im `MaintenanceService` (siehe Pattern: `services/maintenance/__init__.py`) ODER direkt in `main.py` Startup via `scheduler.add_interval_job(job_id="ai_log_classify", func=scheduled_classify, seconds=300, category=JobCategory.MAINTENANCE)`
- Prometheus-Metriken zu `src/core/metrics.py` hinzufügen (Pattern: Gauge/Counter/Histogram via `prometheus_client`)
- Metriken sind auto-exposed via `/api/v1/health/metrics` (prometheus-fastapi-instrumentator)
- Grafana-Dashboard erstellen via Grafana UI (Zugriff: http://localhost:3000, admin/GRAFANA_ADMIN_PASSWORD)
- Budget-Alert konfigurieren via `docker/grafana/provisioning/alerting/` (siehe bestehende Alerts als Pattern)

### Schritt 6: Verifikation (Tag 3)
- 100 bekannte Log-Zeilen durchjagen → Accuracy messen
- Cache-Hit-Rate prüfen
- Latenz pro Batch messen
- Budget-Tracking verifizieren

---

## Zukunftsfähigkeit

| Spätere Phase | Vorbereitung in Phase 1 |
|--------------|------------------------|
| Phase 2 (Anomalie) | `BaseLLMProvider` wiederverwendbar, neuer `AnomalyTaskAdapter` (NICHT BaseAIAdapter — siehe Architektur-Korrektur oben) |
| Phase 5 (Sequenz-Mining) | Klassifizierte Logs als Input (statt rohe Logs) |
| Phase 6 (Cross-Layer) | `LokiClient` direkt wiederverwendbar |
| Phase 8 (NL Debug Assistant) | Alle Endpoints als Tools registrierbar |
| Jetson-Training | `human_verified` + `human_correction` Spalten = gelabelte Trainingsdaten |
| Provider-Wechsel | `BaseLLMProvider` → neuen Provider implementieren, `AIProviderFactory` registrieren, Config ändern, fertig. Task-Adapter bleiben unverändert |

---

## Was Phase 1 NICHT macht (bewusst)

- Kein neuer Docker-Container (läuft in El Servador)
- Kein LangChain/LangGraph (Overhead für eine Klassifikation, direkte API reicht)
- Kein eigenes ML-Modell (kommt erst mit Jetson)
- Kein Frontend-Chat-Interface (kommt in Phase 8)
- Keine Echtzeit-Stream-Verarbeitung (Batch alle 5min reicht für Entwicklungsphase)

---

## Verifikations-Ergebnisse (2026-02-11)

**Durchgeführt von:** system-control + db-inspector (parallele Analyse)

### ✓ Bestätigt (Plan stimmt mit Codebase überein)

| Aspekt | Ergebnis |
|--------|----------|
| **Projektstruktur** | `El Servador/god_kaiser_server/src/` korrekt (nicht `app/`) |
| **SQLAlchemy Base** | `from src.db.base import Base` korrekt |
| **Pydantic-Settings** | `pydantic-settings = "^2.1.0"` installiert, Pattern via `SettingsConfigDict` |
| **APScheduler** | `apscheduler = "^3.11.2"` installiert, `CentralScheduler` in `src.core.scheduler` |
| **Monitoring-Stack** | Loki/Promtail/Prometheus/Grafana aktiv (alle Container healthy) |
| **Loki-Labels** | `service`, `container`, `stream`, `compose_service`, `compose_project` (bestätigt via Promtail-Config) |
| **Prometheus-Metriken** | 6 Custom-Gauges vorhanden, Pattern für neue AI-Metriken klar |
| **Alembic** | Migrations-System funktional, HEAD: `950ad9ce87bb`, 19 Migrations |
| **DB-Tabellen** | 19 Tabellen, Naming-Pattern: snake_case mit Unterstrichen |
| **Bestehende AI-Tabelle** | `ai_predictions` existiert bereits (God Layer Integration) |

### ⚠️ Zu ergänzen/korrigieren

| Aspekt | Korrektur |
|--------|-----------|
| **anthropic SDK** | **FEHLT** – muss zu `pyproject.toml` hinzugefügt werden: `anthropic = "^0.40.0"` |
| **Config-Integration** | `AISettings` muss in `src.core.config.Settings` als Sub-Setting integriert werden (Pattern: `ai: AISettings = AISettings()`) |
| **Alembic Model-Import** | Neues Model `ai_log_classifications` muss in `src/db/models/__init__.py` importiert werden für Alembic autogenerate |
| **Job-Registrierung** | Scheduled-Job muss entweder in `MaintenanceService` ODER direkt in `main.py` Startup registriert werden (Pattern unklar im Plan) |
| **httpx bereits vorhanden** | `httpx = "^0.26.0"` bereits installiert (LokiClient Dependency erfüllt) |
| **WebSocket-Events** | Plan erwähnt WebSocket-Push bei Criticals – Frontend hat bereits 26 WebSocket-Event-Types, neuer Event-Type `ai:classification:critical` muss definiert werden |
| **AI-Router Konflikt** | `src/api/v1/ai.py` existiert bereits (nicht registriert in __init__.py) – entweder wiederverwendbar machen oder neuen Router `ai_classification.py` nennen |
| **Router-Registrierung** | Neuer AI-Router muss in `src/api/v1/__init__.py` importiert und via `api_v1_router.include_router()` registriert werden |
| **.env.example leer** | Keine AI-Variablen vorhanden – muss ergänzt werden (AI_ENABLED, ANTHROPIC_API_KEY, AI_LOKI_URL, AI_PRIMARY_MODEL, AI_DAILY_BUDGET_USD, etc.) |

### 📝 Zusätzliche Erkenntnisse

- **DB-Namenskonvention:** Neue Tabelle `ai_log_classifications` passt zu `esp_heartbeat_logs`, `sensor_configs` (snake_case mit Unterstrichen)
- **Migration-Workflow:** `docker exec automationone-server python -m alembic revision --autogenerate -m "message"` für neue Migrations
- **Loki-Zugriff im Container:** `http://loki:3100` (Docker-internes Netzwerk, bereits erreichbar)
- **Grafana-Zugriff:** http://localhost:3000 (admin / GRAFANA_ADMIN_PASSWORD aus .env)
- **Prometheus-Endpoint:** `/api/v1/health/metrics` (auto-exposed via prometheus-fastapi-instrumentator)
- **Router-Registrierung:** Neue `/api/v1/ai/` Router müssen in `src/api/v1/__init__.py` importiert und via `api_v1_router.include_router(ai_router)` registriert werden (aktuell **14** Router registriert in `__init__.py`: auth, audit, errors, esp, sensors, sensor_type_defaults, actuators, health, logic, debug, users, zone, subzone, sequences) — [KORREKTUR: 14, nicht 15]
- **AI-Router existiert bereits:** `src/api/v1/ai.py` ist bereits vorhanden (nicht in __init__.py registriert!) – prüfen ob wiederverwendbar oder umbenennen in `ai_classification.py`
- **.env.example:** Keine AI-spezifischen Variablen vorhanden – muss ergänzt werden mit AI_ENABLED, ANTHROPIC_API_KEY, AI_LOKI_URL, etc.

### 🎯 Nächste Schritte zur Plan-Umsetzung

1. **Dependency hinzufügen:** `anthropic = "^0.40.0"` in `pyproject.toml` (unter `[tool.poetry.dependencies]`)
2. **AISettings erstellen:** `src/ai/config.py` nach Pattern von `DatabaseSettings`, `MQTTSettings` in `src/core/config.py`
3. **AISettings integrieren:** In `Settings` Master-Klasse (src/core/config.py) als `ai: AISettings = AISettings()`
4. **.env.example ergänzen:** AI-Variablen hinzufügen (AI_ENABLED, ANTHROPIC_API_KEY, AI_LOKI_URL, AI_PRIMARY_MODEL, AI_FALLBACK_MODEL, AI_DAILY_BUDGET_USD, etc.)
5. **DB-Model prüfen/erstellen:** Bestehende `src/db/models/ai.py` prüfen ob wiederverwendbar, sonst neues Model `AILogClassification` hinzufügen
6. **Model registrieren:** Import in `src/db/models/__init__.py` (für Alembic autogenerate)
7. **Migration erstellen:** `docker exec el-servador python -m alembic revision --autogenerate -m "add ai_log_classifications table"`
8. **LokiClient implementieren:** `src/ai/services/loki_client.py` mit korrekten Labels (`service`, `container`, `stream` – NICHT `service_name`)
9. **Provider + Adapter:** `src/ai/providers/anthropic_provider.py` (LLM-Zugriff) + `src/ai/adapters/classifier_adapter.py` (Task-Logik) + `src/ai/providers/factory.py` (Provider-Factory)
10. **Router prüfen:** Bestehende `src/api/v1/ai.py` prüfen ob wiederverwendbar, sonst neuer Router `src/ai/router.py` oder `src/api/v1/ai_classification.py`
11. **Router registrieren:** In `src/api/v1/__init__.py` importieren und via `api_v1_router.include_router(ai_router)` registrieren
12. **Scheduler-Job:** Registrierung in `main.py` Startup via `scheduler.add_interval_job(job_id="ai_log_classify", func=..., seconds=300, category=JobCategory.MAINTENANCE)`
13. **WebSocket-Event:** Neuer Event-Type `ai:classification:critical` in `src/schemas/websocket.py` und Frontend `src/types/websocket-events.ts` definieren
14. **Prometheus-Metriken:** Neue Metriken in `src/core/metrics.py` hinzufügen (ai_classifications_total, ai_tokens_used, ai_estimated_cost_usd, etc.)
15. **Poetry install:** Nach pyproject.toml-Änderung: `docker exec automationone-server poetry install` zum Installieren der neuen Dependencies — [KORREKTUR: Container heißt `automationone-server`]