# KI-Integration Implementierungs-Leitfaden (Überarbeitet)

> **Zweck:** Modulare, flexible KI-Orchestrator-Architektur für externe AI-Services
> **Zielgruppe:** Entwickler (inkl. KI-Agenten)
> **Prinzip:** Externe Services first, User-konfigurierbar, Web-Interface-gesteuert
> **Version:** 2.0 (Überarbeitet 2025-12-09)
> **Letzte Änderung:** Fokus auf externe AI-Services statt lokaler Hardware

---

## 📖 Inhaltsverzeichnis

1. [Überblick & Architektur-Vision](#0-überblick--architektur-vision)
2. [Phase 1: Service-Adapter-System](#phase-1-service-adapter-system)
3. [Phase 2: Plugin-Registry](#phase-2-plugin-registry)
4. [Phase 3: Database-Erweiterungen](#phase-3-database-erweiterungen)
5. [Phase 4: Service-Layer](#phase-4-service-layer-aiservice-modelservice)
6. [Phase 5: Externe Service-Adapters](#phase-5-externe-service-adapters)
7. [Phase 6: Data-Pipeline-Engine](#phase-6-data-pipeline-engine-neu)
8. [Phase 7: Permission-System](#phase-7-permission-system-neu)
9. [Phase 8: Web-Interface-Integration](#phase-8-web-interface-integration)
10. [Phase 9: Testing & Validation](#phase-9-testing--validation)
11. [Phase 10: Context-System](#phase-10-context-system-erweitert)
12. [Phase 11: Knowledge-Base-System](#phase-11-knowledge-base-system-erweitert)
13. [Phase 12: External-Data-Connectors](#phase-12-external-data-connectors-erweitert)
14. [Phase 13: Digital-Twin-Schema](#phase-13-digital-twin-schema-erweitert)
15. [Phase 14: UI-Schema-Management](#phase-14-ui-schema-management-erweitert)
16. [Phase 15: Conversation-Workflows](#phase-15-conversation-workflows-erweitert)

---

## 0. Überblick & Architektur-Vision

### 0.1 **NEUE Vision: God-Kaiser als AI-Orchestrator**

**Kern-Prinzip:**
God-Kaiser Server orchestriert **externe AI-Services** (OpenAI, Claude, Ollama, Custom REST-APIs), verbindet sie mit ESP-Daten, und führt User-konfigurierte Pipelines aus.

```
┌──────────────────────────────────────────────────────────────┐
│ Web-Interface (Vuetify Frontend) - USER-KONFIGURATION       │
│ ├─ AI-Service-Management (API-Keys, Endpoints)              │
│ ├─ Pipeline-Builder (Datenfluss: ESP → AI → Aktion)         │
│ ├─ Permission-Manager (KI darf ESP X steuern)               │
│ └─ KI-Dashboards (Predictions, Confidence, Results)         │
└──────────────────────────────────────────────────────────────┘
                    ↕ REST API + WebSocket
┌──────────────────────────────────────────────────────────────┐
│ God-Kaiser Server (AI-ORCHESTRATOR)                          │
│ ├─ AIServiceRegistry (User-definierte AI-Services)          │
│ ├─ DataPipelineEngine (User-Pipelines ausführen)            │
│ ├─ PermissionManager (KI-ESP-Control-Rules)                 │
│ ├─ AIPluginRegistry (Modulare KI-Plugins)                   │
│ └─ Service-Adapters (Verbindung zu ext. Services)           │
└──────────────────────────────────────────────────────────────┘
       ↕ MQTT                      ↕ HTTP REST APIs
┌─────────────┐      ┌──────────────────────────────────────────┐
│ ESPs        │      │ Externe AI-Services (User-konfiguriert) │
│ (Sensoren/  │      │ ├─ OpenAI GPT-4, Claude 3.5             │
│  Aktoren)   │      │ ├─ Ollama (lokal/remote LLMs)           │
│             │      │ ├─ HuggingFace Inference API             │
│             │      │ └─ Custom REST-Services (User-definiert)│
└─────────────┘      └──────────────────────────────────────────┘
```

### 0.2 Was ist NEU gegenüber v1.0?

| Aspekt | v1.0 (Alt) | v2.0 (Neu - diese Version) |
|--------|-----------|----------------------------|
| **Hardware-Fokus** | Pi5/Jetson lokal | **Externe Services (Cloud/Ollama)** |
| **User-Config** | Fest codiert | **Web-UI: User konfiguriert alles** |
| **AI-Services** | Einzelner Adapter | **Multi-Service-Registry (beliebig viele)** |
| **Data-Flow** | Plugin direkt aufrufen | **User-definierte Pipelines** |
| **Permissions** | Keine | **User definiert: KI darf ESP X** |
| **Frontend** | Nur API | **Visual Pipeline-Builder, Dashboards** |

### 0.3 Architektur-Entscheidungen (KRITISCH!)

**1. Externe Services FIRST:**
- God-Kaiser verbindet sich zu externen APIs (OpenAI, Claude, Ollama)
- Lokale Inferenz (Jetson) ist **optional** (kann als zusätzlicher Service)
- Generic REST-Adapter für **User-definierte Services**

**2. User konfiguriert ALLES via Web-UI:**
- AI-Services registrieren (API-Keys, Endpoints)
- Pipelines erstellen (Sensor-Daten → KI → Aktion)
- Permissions setzen (KI darf ESP X steuern)

**3. Modularität auf allen Ebenen:**
- **AIServiceAdapter:** Verbindet zu einem ext. Service (OpenAI, Ollama, etc.)
- **AIPlugin:** Nutzt Service für konkrete Aufgabe (Chat, Anomalie-Detection)
- **DataPipeline:** Orchestriert: Trigger → Plugin → Action

### 0.4 Verzeichnis-Struktur (Aktualisiert)

```
El Servador/god_kaiser_server/src/
├── ai/                                    # KI-MODUL (NEU)
│   ├── __init__.py
│   ├── service_adapters/                  # Externe Service-Verbindungen
│   │   ├── __init__.py
│   │   ├── base_adapter.py                # ABC für alle Adapters
│   │   ├── openai_adapter.py              # OpenAI API (GPT-4, GPT-3.5)
│   │   ├── anthropic_adapter.py           # Claude API
│   │   ├── ollama_adapter.py              # Ollama (LLMs lokal/remote)
│   │   ├── huggingface_adapter.py         # HuggingFace Inference API
│   │   └── generic_rest_adapter.py        # Generic REST (User-definiert)
│   ├── plugins/                           # KI-Plugins
│   │   ├── __init__.py
│   │   ├── base_plugin.py                 # ABC für Plugins
│   │   ├── plugin_registry.py             # Registry (Singleton)
│   │   └── active/
│   │       ├── chat_interface.py          # Chat-Plugin (Priorität 1)
│   │       ├── anomaly_detection.py       # Anomalie-Erkennung
│   │       └── predictive_maintenance.py  # Vorhersage-Plugin
│   ├── pipeline/                          # Data-Pipeline-Engine (NEU)
│   │   ├── __init__.py
│   │   ├── pipeline_engine.py             # Orchestrator
│   │   ├── pipeline_config.py             # Config-Loader
│   │   └── triggers/                      # Pipeline-Trigger
│   │       ├── sensor_trigger.py
│   │       ├── time_trigger.py
│   │       └── manual_trigger.py
│   ├── permissions/                       # Permission-System (NEU)
│   │   ├── __init__.py
│   │   ├── permission_manager.py
│   │   └── permission_validator.py
│   ├── context/                           # Context-System (Phase 10)
│   │   ├── __init__.py
│   │   ├── context_manager.py             # User/Zone-Kontext
│   │   └── conversation_state.py          # Multi-Step-State
│   ├── knowledge/                         # Knowledge-Base (Phase 11)
│   │   ├── __init__.py
│   │   ├── knowledge_manager.py           # Knowledge-Base-Manager
│   │   └── knowledge_loader.py            # Import/Export
│   ├── connectors/                        # External-Data (Phase 12)
│   │   ├── __init__.py
│   │   ├── base_connector.py              # ABC für Connectors
│   │   ├── energy_price_connector.py      # Energie-Preis-APIs
│   │   ├── weather_connector.py           # Wetter-APIs
│   │   └── generic_api_connector.py       # Generic REST-APIs
│   └── workflows/                         # Conversation-Workflows (Phase 15)
│       ├── __init__.py
│       ├── workflow_engine.py             # Multi-Step-Orchestrator
│       └── workflow_templates/            # Vordefinierte Workflows
│           └── context_change_workflow.py
├── services/
│   ├── ai_service.py                      # AI-Service (erweitert)
│   ├── model_service.py                   # Model-Management
│   └── service_registry.py                # Service-Registry (NEU)
├── db/
│   ├── models/
│   │   └── ai.py                          # AI-Models (erweitert)
│   │       # - AIServiceConfig, AIPipeline, AIPermission (Phase 3)
│   │       # - AIContext, ConversationState (Phase 10)
│   │       # - KnowledgeBase, KnowledgeCategory (Phase 11)
│   │       # - ExternalDataSource (Phase 12)
│   │       # - ZoneGeometry, MachineProperties (Phase 13)
│   │       # - UILayout, WidgetTemplate (Phase 14)
│   └── repositories/
│       ├── ai_repo.py                     # AI-Repository (Core)
│       ├── context_repo.py                # Context-Repository (Phase 10)
│       ├── knowledge_repo.py              # Knowledge-Repository (Phase 11)
│       └── digital_twin_repo.py           # Digital-Twin-Repository (Phase 13)
├── mqtt/handlers/
│   └── ai_handler.py                      # MQTT AI-Handler
├── api/v1/
│   ├── ai.py                              # AI-Endpoints (erweitert)
│   ├── pipelines.py                       # Pipeline-Endpoints (NEU)
│   └── ai_services.py                     # Service-Management (NEU)
└── schemas/
    ├── ai.py                              # AI-Schemas
    ├── pipeline.py                        # Pipeline-Schemas (NEU)
    └── ai_service.py                      # Service-Schemas (NEU)
```

### 0.5 Implementierungs-Phasen (Überarbeitet)

**Kern-Phasen (MVP - Phasen 1-9):**

| Phase | Fokus | Dauer | Abhängigkeiten |
|-------|-------|-------|----------------|
| **Phase 1** | Service-Adapter-System (OpenAI, Ollama, Generic) | 2-3 Tage | Keine |
| **Phase 2** | Plugin-Registry (BaseAIPlugin, Discovery) | 2-3 Tage | Phase 1 |
| **Phase 3** | Database-Erweiterungen (AIService, AIPipeline, AIPermission) | 2-3 Tage | Keine |
| **Phase 4** | Service-Layer (AIService, ServiceRegistry) | 2-3 Tage | Phase 2, 3 |
| **Phase 5** | Externe Service-Adapters (vollständig) | 3-4 Tage | Phase 1 |
| **Phase 6** | Data-Pipeline-Engine (User-Pipelines) | 3-4 Tage | Phase 4 |
| **Phase 7** | Permission-System (KI-ESP-Control) | 2 Tage | Phase 4 |
| **Phase 8** | Web-Interface-Integration (API + Frontend) | 4-5 Tage | Phase 6, 7 |
| **Phase 9** | Testing & Validation | 3 Tage | Alle Phasen |

**Gesamt-Dauer (MVP):** ~23-30 Tage

**Erweiterte Phasen (Post-MVP - Phasen 10-15):**

| Phase | Fokus | Priorität | Dauer | Abhängigkeiten |
|-------|-------|-----------|-------|----------------|
| **Phase 10** | Context-System (User/Zone-Kontext, Conversation-State) | 🔴 HOCH | 2-3 Tage | Phase 4 |
| **Phase 11** | Knowledge-Base-System (Strukturierte Wissensdaten) | 🔴 HOCH | 2-3 Tage | Phase 4 |
| **Phase 12** | External-Data-Connectors (Live-Daten: Preise, Wetter) | 🟡 MITTEL | 2-3 Tage | Phase 6 |
| **Phase 13** | Digital-Twin-Schema (3D-Geometrie, Maschinen-Properties) | 🟢 NIEDRIG | 3-4 Tage | Phase 8 |
| **Phase 14** | UI-Schema-Management (User-definierte Dashboards) | 🟢 NIEDRIG | 3-4 Tage | Phase 8 |
| **Phase 15** | Conversation-Workflows (Multi-Step AI-Interactions) | 🔴 HOCH | 3-4 Tage | Phase 10, 11 |

**Gesamt-Dauer (Erweitert):** ~15-21 Tage zusätzlich

**Gesamtdauer (Komplett):** ~38-51 Tage

---

## Phase 1: Service-Adapter-System

### 🎯 Ziel
Adapter-System für **externe AI-Services** schaffen (OpenAI, Claude, Ollama, Generic REST).

### 📝 Wichtigste Änderung vs. v1.0
- **KEIN Hardware-Detector** mehr (nicht nötig für externe Services)
- Fokus auf **HTTP REST-Verbindungen** zu externen APIs
- **Generic REST-Adapter** für User-definierte Services

### 📁 Dateien erstellen

1. `src/ai/__init__.py`
2. `src/ai/service_adapters/__init__.py`
3. `src/ai/service_adapters/base_adapter.py`
4. `src/ai/service_adapters/openai_adapter.py`
5. `src/ai/service_adapters/anthropic_adapter.py`
6. `src/ai/service_adapters/ollama_adapter.py`
7. `src/ai/service_adapters/generic_rest_adapter.py`

### 📄 Implementation

#### 1.1 Base-Adapter (Abstract Base Class)

**Datei:** `ai/service_adapters/base_adapter.py`

**Vorbild:** `BaseSensorProcessor` (Sensor-Libraries)
**Referenz:** `.claude/CLAUDE_SERVER.md` → Section 3.1

```python
"""
Base-Adapter für externe AI-Services
Abstrahiert: OpenAI, Claude, Ollama, HuggingFace, Generic REST

Vorbild: BaseSensorProcessor
Referenz: El Servador/god_kaiser_server/src/sensors/base_processor.py
"""

from abc import ABC, abstractmethod
from typing import Dict, Optional, List, Any
from dataclasses import dataclass
from enum import Enum


class ServiceType(Enum):
    """AI-Service-Typen"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"
    HUGGINGFACE = "huggingface"
    GENERIC_REST = "generic_rest"


@dataclass
class AIServiceConfig:
    """Service-Konfiguration (User-definiert via Web-UI)"""
    service_id: str  # Unique ID (z.B. "my_openai_account_1")
    service_type: ServiceType
    endpoint: str  # API-Endpoint
    api_key: Optional[str] = None
    model: Optional[str] = None  # Default-Model
    extra_config: Dict[str, Any] = None

    def __post_init__(self):
        if self.extra_config is None:
            self.extra_config = {}


@dataclass
class AIRequest:
    """AI-Inferenz-Request"""
    prompt: str
    context: Optional[Dict] = None  # ESP-Daten, Sensor-History, etc.
    model: Optional[str] = None  # Override default model
    temperature: float = 0.7
    max_tokens: int = 500
    extra_params: Dict = None

    def __post_init__(self):
        if self.extra_params is None:
            self.extra_params = {}


@dataclass
class AIResponse:
    """AI-Inferenz-Response"""
    text: str  # Hauptantwort
    model_used: str
    tokens_used: Optional[int] = None
    confidence: float = 1.0
    raw_response: Dict = None  # Volle API-Response

    def __post_init__(self):
        if self.raw_response is None:
            self.raw_response = {}


class BaseAIServiceAdapter(ABC):
    """
    Abstract Base Class für AI-Service-Adapter

    Ähnlich zu: BaseSensorProcessor
    Referenz: .claude/CLAUDE_SERVER.md → Section 3.1

    WICHTIG: Alle Adapters MÜSSEN von dieser Klasse erben!
    """

    def __init__(self, config: AIServiceConfig):
        self.config = config
        self.is_initialized = False

    @abstractmethod
    async def initialize(self) -> bool:
        """
        Initialisiert Service-Verbindung

        Returns:
            True wenn erfolgreich
        """
        pass

    @abstractmethod
    async def send_request(self, request: AIRequest) -> AIResponse:
        """
        Sendet AI-Request an externen Service

        Args:
            request: AI-Request mit Prompt, Config, etc.

        Returns:
            AIResponse mit Text, Model, Tokens, etc.
        """
        pass

    @abstractmethod
    def get_available_models(self) -> List[str]:
        """
        Liste verfügbarer Models für diesen Service

        Returns:
            Liste von Model-Namen (z.B. ['gpt-4', 'gpt-3.5-turbo'])
        """
        pass

    def validate_config(self) -> bool:
        """
        Validiert Service-Config

        Returns:
            True wenn Config valide
        """
        # Basic validation
        if not self.config.endpoint:
            return False
        return True

    async def test_connection(self) -> bool:
        """
        Testet Verbindung zum Service

        Returns:
            True wenn Service erreichbar
        """
        try:
            # Send simple test request
            test_request = AIRequest(
                prompt="Test",
                max_tokens=5
            )
            response = await self.send_request(test_request)
            return bool(response.text)
        except:
            return False

    async def shutdown(self):
        """Cleanup beim Herunterfahren"""
        self.is_initialized = False
```

#### 1.2 OpenAI-Adapter

**Datei:** `ai/service_adapters/openai_adapter.py`

```python
"""
OpenAI API Adapter
Unterstützt: GPT-4, GPT-3.5-Turbo, etc.
"""

import httpx
from typing import List
from .base_adapter import (
    BaseAIServiceAdapter,
    AIServiceConfig,
    AIRequest,
    AIResponse,
    ServiceType
)
from ...core.logging_config import get_logger

logger = get_logger(__name__)


class OpenAIAdapter(BaseAIServiceAdapter):
    """
    Adapter für OpenAI API

    Dokumentation: https://platform.openai.com/docs/api-reference
    """

    def __init__(self, config: AIServiceConfig):
        super().__init__(config)
        self.client: Optional[httpx.AsyncClient] = None

        # Default Endpoint wenn nicht angegeben
        if not self.config.endpoint:
            self.config.endpoint = "https://api.openai.com/v1"

    async def initialize(self) -> bool:
        """Initialisiert OpenAI-Client"""
        if not self.config.api_key:
            logger.error(f"OpenAI Service '{self.config.service_id}': API-Key fehlt")
            return False

        # Erstellt HTTP-Client
        self.client = httpx.AsyncClient(
            base_url=self.config.endpoint,
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json"
            },
            timeout=30.0
        )

        # Test connection
        self.is_initialized = True
        logger.info(f"OpenAI Service '{self.config.service_id}' initialisiert")
        return True

    async def send_request(self, request: AIRequest) -> AIResponse:
        """
        Sendet Chat-Completion-Request an OpenAI

        API-Referenz: https://platform.openai.com/docs/api-reference/chat
        """
        if not self.is_initialized:
            raise RuntimeError("Adapter nicht initialisiert. initialize() aufrufen!")

        # Build request payload
        model = request.model or self.config.model or "gpt-3.5-turbo"

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a helpful assistant for an IoT automation system."},
                {"role": "user", "content": request.prompt}
            ],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens
        }

        # Add context if provided
        if request.context:
            context_str = f"\n\nContext:\n{request.context}"
            payload["messages"][1]["content"] += context_str

        # Send request
        try:
            response = await self.client.post(
                "/chat/completions",
                json=payload
            )
            response.raise_for_status()
            data = response.json()

            # Parse response
            ai_response = AIResponse(
                text=data["choices"][0]["message"]["content"],
                model_used=data["model"],
                tokens_used=data["usage"]["total_tokens"],
                raw_response=data
            )

            logger.debug(f"OpenAI Request: {request.prompt[:50]}... → {ai_response.text[:50]}...")
            return ai_response

        except httpx.HTTPStatusError as e:
            logger.error(f"OpenAI API Error ({e.response.status_code}): {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"OpenAI Request failed: {e}")
            raise

    def get_available_models(self) -> List[str]:
        """Liste verfügbarer OpenAI-Models"""
        return [
            "gpt-4",
            "gpt-4-turbo",
            "gpt-3.5-turbo",
            "gpt-3.5-turbo-16k"
        ]

    async def shutdown(self):
        """Cleanup: Schließt HTTP-Client"""
        if self.client:
            await self.client.aclose()
        await super().shutdown()
```

#### 1.3 Generic REST-Adapter

**Datei:** `ai/service_adapters/generic_rest_adapter.py`

**KRITISCH:** Ermöglicht User, **eigene AI-Services** einzubinden!

```python
"""
Generic REST-Adapter für User-definierte AI-Services

WICHTIG: User kann beliebige REST-APIs einbinden via Web-UI!

Beispiel-Use-Cases:
- Eigener Ollama-Server auf anderem Pi
- Custom ML-Model auf Cloud-VM
- Firmen-internes AI-Gateway
"""

import httpx
from typing import List, Dict, Any
from .base_adapter import (
    BaseAIServiceAdapter,
    AIServiceConfig,
    AIRequest,
    AIResponse,
    ServiceType
)
from ...core.logging_config import get_logger

logger = get_logger(__name__)


class GenericRESTAdapter(BaseAIServiceAdapter):
    """
    Generic REST-Adapter für User-definierte Services

    User-Config (via Web-UI):
    {
        "endpoint": "http://192.168.1.100:11434/api/generate",
        "method": "POST",
        "headers": {"Authorization": "Bearer xyz"},
        "request_template": {
            "model": "{model}",
            "prompt": "{prompt}",
            "temperature": "{temperature}"
        },
        "response_path": "response.text"  # JSON-Path zur Antwort
    }
    """

    def __init__(self, config: AIServiceConfig):
        super().__init__(config)
        self.client: Optional[httpx.AsyncClient] = None

        # Parse extra config
        self.method = config.extra_config.get("method", "POST")
        self.headers = config.extra_config.get("headers", {})
        self.request_template = config.extra_config.get("request_template", {})
        self.response_path = config.extra_config.get("response_path", "text")

    async def initialize(self) -> bool:
        """Initialisiert Generic REST-Client"""
        if not self.config.endpoint:
            logger.error(f"Generic Service '{self.config.service_id}': Endpoint fehlt")
            return False

        self.client = httpx.AsyncClient(
            headers=self.headers,
            timeout=30.0
        )

        self.is_initialized = True
        logger.info(f"Generic REST Service '{self.config.service_id}' initialisiert (Endpoint: {self.config.endpoint})")
        return True

    async def send_request(self, request: AIRequest) -> AIResponse:
        """
        Sendet Request an User-definierten Service

        WICHTIG: User definiert Request-Format via extra_config!
        """
        if not self.is_initialized:
            raise RuntimeError("Adapter nicht initialisiert")

        # Build request payload from template
        payload = self._build_payload(request)

        # Send request
        try:
            if self.method == "POST":
                response = await self.client.post(
                    self.config.endpoint,
                    json=payload
                )
            elif self.method == "GET":
                response = await self.client.get(
                    self.config.endpoint,
                    params=payload
                )
            else:
                raise ValueError(f"Unsupported method: {self.method}")

            response.raise_for_status()
            data = response.json()

            # Extract response text from JSON-Path
            text = self._extract_response(data, self.response_path)

            ai_response = AIResponse(
                text=text,
                model_used=request.model or "generic",
                raw_response=data
            )

            logger.debug(f"Generic REST Request: {request.prompt[:50]}... → {text[:50]}...")
            return ai_response

        except Exception as e:
            logger.error(f"Generic REST Request failed: {e}")
            raise

    def _build_payload(self, request: AIRequest) -> Dict[str, Any]:
        """
        Baut Request-Payload basierend auf User-Template

        Ersetzt Platzhalter: {prompt}, {model}, {temperature}, etc.
        """
        payload = {}
        for key, value in self.request_template.items():
            if isinstance(value, str):
                # Replace placeholders
                value = value.replace("{prompt}", request.prompt)
                value = value.replace("{model}", request.model or self.config.model or "default")
                value = value.replace("{temperature}", str(request.temperature))
                value = value.replace("{max_tokens}", str(request.max_tokens))
            payload[key] = value

        return payload

    def _extract_response(self, data: Dict, json_path: str) -> str:
        """
        Extrahiert Response-Text aus JSON via Path

        Beispiele:
        - "text" → data["text"]
        - "response.text" → data["response"]["text"]
        - "choices.0.message.content" → data["choices"][0]["message"]["content"]
        """
        keys = json_path.split(".")
        result = data

        for key in keys:
            if key.isdigit():
                result = result[int(key)]
            else:
                result = result[key]

        return str(result)

    def get_available_models(self) -> List[str]:
        """Generic-Adapter: User muss Models selbst definieren"""
        return self.config.extra_config.get("available_models", ["default"])

    async def shutdown(self):
        """Cleanup"""
        if self.client:
            await self.client.aclose()
        await super().shutdown()
```

#### 1.4 Ollama-Adapter

**Datei:** `ai/service_adapters/ollama_adapter.py`

```python
"""
Ollama API Adapter
Unterstützt: Llama 3, Mistral, Phi, etc. (lokal oder remote)

API-Referenz: https://github.com/ollama/ollama/blob/main/docs/api.md
"""

import httpx
from typing import List
from .base_adapter import (
    BaseAIServiceAdapter,
    AIServiceConfig,
    AIRequest,
    AIResponse,
    ServiceType
)
from ...core.logging_config import get_logger

logger = get_logger(__name__)


class OllamaAdapter(BaseAIServiceAdapter):
    """
    Adapter für Ollama API

    Ollama kann lokal (localhost) oder remote laufen.
    User konfiguriert Endpoint via Web-UI.
    """

    def __init__(self, config: AIServiceConfig):
        super().__init__(config)
        self.client: Optional[httpx.AsyncClient] = None

        # Default Endpoint wenn nicht angegeben
        if not self.config.endpoint:
            self.config.endpoint = "http://localhost:11434"

    async def initialize(self) -> bool:
        """Initialisiert Ollama-Client"""
        self.client = httpx.AsyncClient(
            base_url=self.config.endpoint,
            timeout=60.0  # Ollama kann langsamer sein als Cloud-APIs
        )

        # Test connection
        self.is_initialized = True
        logger.info(f"Ollama Service '{self.config.service_id}' initialisiert (Endpoint: {self.config.endpoint})")
        return True

    async def send_request(self, request: AIRequest) -> AIResponse:
        """
        Sendet Generate-Request an Ollama

        API-Referenz: https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-completion
        """
        if not self.is_initialized:
            raise RuntimeError("Adapter nicht initialisiert")

        model = request.model or self.config.model or "llama3"

        payload = {
            "model": model,
            "prompt": request.prompt,
            "temperature": request.temperature,
            "stream": False  # Non-streaming für Einfachheit
        }

        # Add context if provided
        if request.context:
            payload["prompt"] += f"\n\nContext: {request.context}"

        # Send request
        try:
            response = await self.client.post(
                "/api/generate",
                json=payload
            )
            response.raise_for_status()
            data = response.json()

            ai_response = AIResponse(
                text=data["response"],
                model_used=data["model"],
                raw_response=data
            )

            logger.debug(f"Ollama Request ({model}): {request.prompt[:50]}... → {ai_response.text[:50]}...")
            return ai_response

        except Exception as e:
            logger.error(f"Ollama Request failed: {e}")
            raise

    async def list_models(self) -> List[str]:
        """
        Liste aller installierten Models auf Ollama-Server

        API-Referenz: https://github.com/ollama/ollama/blob/main/docs/api.md#list-local-models
        """
        try:
            response = await self.client.get("/api/tags")
            response.raise_for_status()
            data = response.json()

            # Extract model names
            models = [model["name"] for model in data.get("models", [])]
            return models
        except Exception as e:
            logger.error(f"Failed to list Ollama models: {e}")
            return []

    def get_available_models(self) -> List[str]:
        """
        Default-Models (wird von list_models() überschrieben)
        """
        return [
            "llama3",
            "mistral",
            "phi",
            "codellama"
        ]

    async def shutdown(self):
        """Cleanup"""
        if self.client:
            await self.client.aclose()
        await super().shutdown()
```

### ✅ Phase 1 Prüfkriterien

**Test-Code:** `tests/test_service_adapters.py`

```python
import pytest
from src.ai.service_adapters.base_adapter import AIServiceConfig, AIRequest, ServiceType
from src.ai.service_adapters.openai_adapter import OpenAIAdapter
from src.ai.service_adapters.ollama_adapter import OllamaAdapter
from src.ai.service_adapters.generic_rest_adapter import GenericRESTAdapter


@pytest.mark.asyncio
async def test_openai_adapter():
    config = AIServiceConfig(
        service_id="test_openai",
        service_type=ServiceType.OPENAI,
        endpoint="https://api.openai.com/v1",
        api_key="sk-test-key",  # Wird fehlschlagen ohne echten Key
        model="gpt-3.5-turbo"
    )

    adapter = OpenAIAdapter(config)
    assert adapter.config.service_id == "test_openai"
    assert adapter.validate_config() is True


@pytest.mark.asyncio
async def test_ollama_adapter():
    config = AIServiceConfig(
        service_id="test_ollama",
        service_type=ServiceType.OLLAMA,
        endpoint="http://localhost:11434",
        model="llama3"
    )

    adapter = OllamaAdapter(config)
    initialized = await adapter.initialize()
    assert initialized is True

    # Test nur wenn Ollama läuft
    # request = AIRequest(prompt="Hello", max_tokens=10)
    # response = await adapter.send_request(request)
    # assert response.text


@pytest.mark.asyncio
async def test_generic_rest_adapter():
    config = AIServiceConfig(
        service_id="test_generic",
        service_type=ServiceType.GENERIC_REST,
        endpoint="http://example.com/api/ai",
        extra_config={
            "method": "POST",
            "request_template": {
                "prompt": "{prompt}",
                "max_tokens": "{max_tokens}"
            },
            "response_path": "data.text"
        }
    )

    adapter = GenericRESTAdapter(config)
    assert adapter.method == "POST"
    assert "prompt" in adapter.request_template
```

**Erfolgskriterium:**
- Alle Adapters können initialisiert werden
- Config-Validierung funktioniert
- Tests sind grün (ohne echte API-Calls)

---

## Phase 2: Plugin-Registry

**Gleich wie v1.0 - Keine Änderungen nötig!**

Referenz: Siehe KI_INTEGRATION_IMPLEMENTATION.md v1.0, Phase 2

**Kern-Points:**
- `BaseAIPlugin` (ABC)
- `AIPluginRegistry` (Singleton, dynamic loading)
- Pattern: Exakt wie `LibraryLoader` (Sensor-Libraries)

**Dateien:** Siehe v1.0

---

## Phase 3: Database-Erweiterungen

### 🎯 Ziel (ERWEITERT)
Database-Models für:
- AI-Services (User-konfigurierte Services)
- AI-Pipelines (User-definierte Datenflüsse)
- AI-Permissions (KI-ESP-Control-Rules)

### 📁 Neue Models

**Datei:** `db/models/ai.py` (ERWEITERN)

```python
"""
AI-Models für KI-Integration (v2.0)
NEU: AIServiceConfig, AIPipeline, AIPermission
"""

# ... AIPredictions, AIModel, AIPluginConfig (siehe v1.0) ...


# NEU: AI-Service-Registry
class AIServiceConfig(Base):
    """
    User-konfigurierte AI-Services

    WICHTIG: User kann beliebig viele Services hinzufügen via Web-UI!
    Beispiele:
    - OpenAI Account 1 (Personal)
    - OpenAI Account 2 (Work)
    - Ollama lokal
    - Ollama remote
    - Custom REST-Service
    """
    __tablename__ = "ai_services"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    service_id: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    service_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'openai', 'ollama', etc.
    name: Mapped[str] = mapped_column(String(200), nullable=False)  # User-friendly name
    endpoint: Mapped[str] = mapped_column(String(500), nullable=False)
    api_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # Encrypted!
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # Default model
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    extra_config: Mapped[dict] = mapped_column(JSON, default={})  # Service-spezifisch
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    pipelines: Mapped[list["AIPipeline"]] = relationship(
        "AIPipeline",
        back_populates="ai_service",
        cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index('idx_service_type_enabled', 'service_type', 'is_enabled'),
    )


# NEU: Data-Pipelines
class AIPipeline(Base):
    """
    User-definierte Data-Pipelines

    Format:
    Trigger → Plugin → Actions

    Beispiel:
    - Trigger: Sensor-Daten (ESP_12AB, GPIO 34, Temp > 25°C)
    - Plugin: anomaly_detection (via OpenAI Service 1)
    - Actions:
      - Store prediction
      - Broadcast via WebSocket
      - Actuator-Command (ESP_34CD, GPIO 18, OFF)
    """
    __tablename__ = "ai_pipelines"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Trigger-Config
    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'sensor_data', 'time', 'manual'
    trigger_config: Mapped[dict] = mapped_column(JSON, nullable=False)  # Trigger-spezifisch

    # Plugin-Config
    plugin_id: Mapped[str] = mapped_column(String(100), nullable=False)
    plugin_config: Mapped[dict] = mapped_column(JSON, default={})

    # AI-Service
    ai_service_id: Mapped[UUID] = mapped_column(ForeignKey("ai_services.id"), nullable=False)

    # Actions
    actions: Mapped[dict] = mapped_column(JSON, nullable=False)  # Liste von Actions

    # Permissions
    permissions: Mapped[dict] = mapped_column(JSON, default={})  # ESP-Control-Permissions

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    ai_service: Mapped["AIServiceConfig"] = relationship("AIServiceConfig", back_populates="pipelines")

    __table_args__ = (
        Index('idx_pipeline_enabled', 'is_enabled'),
        Index('idx_trigger_type', 'trigger_type'),
    )


# NEU: Permission-System
class AIPermission(Base):
    """
    KI-ESP-Control-Permissions

    User definiert: "Pipeline X darf ESP Y steuern"
    """
    __tablename__ = "ai_permissions"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    pipeline_id: Mapped[UUID] = mapped_column(ForeignKey("ai_pipelines.id"), nullable=False)
    esp_id: Mapped[UUID] = mapped_column(ForeignKey("esp_devices.id"), nullable=False)
    allowed_actions: Mapped[list] = mapped_column(JSON, nullable=False)  # ['actuator_control', 'config_change']
    max_confidence_required: Mapped[float] = mapped_column(Float, default=0.0)  # Min. Confidence für Auto-Action
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_permission_pipeline_esp', 'pipeline_id', 'esp_id'),
    )
```

### ✅ Phase 3 Prüfkriterien

- Alembic-Migration erfolgreich
- Tabellen erstellt: `ai_services`, `ai_pipelines`, `ai_permissions`
- CRUD-Operations funktionieren

---

## Phase 4: Service-Layer (AIService, ModelService)

**Weitgehend wie v1.0, aber ERWEITERT um:**

### 4.1 Service-Registry (NEU)

**Datei:** `services/service_registry.py`

```python
"""
Service-Registry: Verwaltet User-konfigurierte AI-Services

Ähnlich zu: Plugin-Registry, aber für Services
"""

from typing import Dict, Optional, List
from ..ai.service_adapters.base_adapter import BaseAIServiceAdapter, AIServiceConfig, ServiceType
from ..ai.service_adapters.openai_adapter import OpenAIAdapter
from ..ai.service_adapters.anthropic_adapter import AnthropicAdapter
from ..ai.service_adapters.ollama_adapter import OllamaAdapter
from ..ai.service_adapters.generic_rest_adapter import GenericRESTAdapter
from ..db.repositories.ai_repo import AIRepository
from ..core.logging_config import get_logger

logger = get_logger(__name__)


class AIServiceRegistry:
    """
    Registry für User-konfigurierte AI-Services

    WICHTIG: Services werden aus Database geladen (User-Config via Web-UI)
    """

    def __init__(self, ai_repo: AIRepository):
        self.ai_repo = ai_repo
        self._services: Dict[str, BaseAIServiceAdapter] = {}  # service_id → adapter

    async def load_services(self):
        """
        Lädt alle enabled Services aus Database

        Wird beim Server-Start aufgerufen (main.py lifespan)
        """
        logger.info("Lade AI-Services aus Database...")

        # Get all enabled services from DB
        db_services = await self.ai_repo.get_enabled_services()

        for db_service in db_services:
            try:
                await self._register_service(db_service)
            except Exception as e:
                logger.error(f"Fehler beim Laden von Service '{db_service.service_id}': {e}")

        logger.info(f"{len(self._services)} AI-Services geladen")

    async def _register_service(self, db_service) -> bool:
        """
        Registriert einzelnen Service

        Args:
            db_service: Database-Model (AIServiceConfig)

        Returns:
            True wenn erfolgreich
        """
        service_id = db_service.service_id

        # Create config from DB
        config = AIServiceConfig(
            service_id=service_id,
            service_type=ServiceType(db_service.service_type),
            endpoint=db_service.endpoint,
            api_key=db_service.api_key,  # TODO: Decrypt!
            model=db_service.model,
            extra_config=db_service.extra_config
        )

        # Create adapter
        adapter = self._create_adapter(config)

        # Initialize
        initialized = await adapter.initialize()
        if not initialized:
            logger.error(f"Service '{service_id}' konnte nicht initialisiert werden")
            return False

        self._services[service_id] = adapter
        logger.info(f"Service '{service_id}' ({config.service_type.value}) registriert")
        return True

    def _create_adapter(self, config: AIServiceConfig) -> BaseAIServiceAdapter:
        """Erstellt Adapter basierend auf Service-Type"""
        if config.service_type == ServiceType.OPENAI:
            return OpenAIAdapter(config)
        elif config.service_type == ServiceType.ANTHROPIC:
            return AnthropicAdapter(config)
        elif config.service_type == ServiceType.OLLAMA:
            return OllamaAdapter(config)
        elif config.service_type == ServiceType.HUGGINGFACE:
            # TODO: Implementieren
            raise NotImplementedError("HuggingFace adapter not yet implemented")
        elif config.service_type == ServiceType.GENERIC_REST:
            return GenericRESTAdapter(config)
        else:
            raise ValueError(f"Unknown service type: {config.service_type}")

    def get_service(self, service_id: str) -> Optional[BaseAIServiceAdapter]:
        """Holt Service-Adapter"""
        return self._services.get(service_id)

    def list_services(self) -> List[Dict]:
        """Liste aller Services"""
        return [
            {
                "service_id": service_id,
                "service_type": adapter.config.service_type.value,
                "endpoint": adapter.config.endpoint,
                "is_initialized": adapter.is_initialized
            }
            for service_id, adapter in self._services.items()
        ]

    async def shutdown(self):
        """Shutdown aller Services"""
        for service_id, adapter in self._services.items():
            try:
                await adapter.shutdown()
            except Exception as e:
                logger.error(f"Fehler beim Shutdown von Service '{service_id}': {e}")

        self._services.clear()


# Global accessor
_service_registry_instance: Optional[AIServiceRegistry] = None

def get_service_registry() -> AIServiceRegistry:
    global _service_registry_instance
    if not _service_registry_instance:
        raise RuntimeError("ServiceRegistry nicht initialisiert")
    return _service_registry_instance

def set_service_registry(registry: AIServiceRegistry):
    global _service_registry_instance
    _service_registry_instance = registry
```

### ✅ Phase 4 Prüfkriterien

- AIService initialisiert Services via ServiceRegistry
- Services können aus Database geladen werden
- Tests sind grün

---

## Phase 5: Externe Service-Adapters

**Status:** OpenAI, Ollama, Generic REST bereits in Phase 1 implementiert!

**Zusätzlich zu implementieren:**
- `anthropic_adapter.py` (Claude API) - analog zu OpenAI
- `huggingface_adapter.py` (HuggingFace Inference API) - analog zu OpenAI

**Priorität:** Medium (kann nach MVP)

---

## Phase 6: Data-Pipeline-Engine (NEU!)

### 🎯 Ziel
User kann via Web-UI Pipelines erstellen:
**Trigger → AI-Plugin → Actions**

### 📁 Neue Dateien

1. `src/ai/pipeline/__init__.py`
2. `src/ai/pipeline/pipeline_engine.py`
3. `src/ai/pipeline/pipeline_config.py`
4. `src/ai/pipeline/triggers/sensor_trigger.py`
5. `src/ai/pipeline/triggers/time_trigger.py`

### 📄 Implementation

**Datei:** `ai/pipeline/pipeline_engine.py`

```python
"""
Data-Pipeline-Engine: Orchestriert User-Pipelines

Ähnlich zu: LogicEngine (Cross-ESP-Logic)
Referenz: services/logic_engine.py
"""

import asyncio
from typing import Dict, List, Optional
from uuid import UUID
from ...db.repositories.ai_repo import AIRepository
from ...db.models.ai import AIPipeline
from ...services.ai_service import AIService
from ...services.service_registry import AIServiceRegistry
from ...core.logging_config import get_logger

logger = get_logger(__name__)


class PipelineEngine:
    """
    Orchestrator für User-definierte AI-Pipelines

    Ähnlich zu: LogicEngine
    Referenz: .claude/CLAUDE_SERVER.md → Section 8
    """

    def __init__(
        self,
        ai_repo: AIRepository,
        ai_service: AIService,
        service_registry: AIServiceRegistry
    ):
        self.ai_repo = ai_repo
        self.ai_service = ai_service
        self.service_registry = service_registry
        self._pipelines: Dict[UUID, AIPipeline] = {}  # pipeline_id → pipeline

    async def load_pipelines(self):
        """Lädt alle enabled Pipelines aus Database"""
        logger.info("Lade AI-Pipelines aus Database...")

        pipelines = await self.ai_repo.get_enabled_pipelines()
        for pipeline in pipelines:
            self._pipelines[pipeline.id] = pipeline

        logger.info(f"{len(self._pipelines)} Pipelines geladen")

    async def trigger_pipeline_by_sensor_data(
        self,
        esp_id: UUID,
        gpio: int,
        sensor_type: str,
        value: float
    ):
        """
        Trigger: Sensor-Daten

        Sucht alle Pipelines mit matching Trigger und führt sie aus
        """
        for pipeline_id, pipeline in self._pipelines.items():
            if pipeline.trigger_type != "sensor_data":
                continue

            # Check trigger conditions
            trigger_config = pipeline.trigger_config
            if not self._matches_sensor_trigger(trigger_config, esp_id, gpio, sensor_type, value):
                continue

            # Execute pipeline
            logger.info(f"Pipeline '{pipeline.name}' getriggert (Sensor: {esp_id}/{gpio})")
            await self._execute_pipeline(pipeline, {
                "esp_id": esp_id,
                "gpio": gpio,
                "sensor_type": sensor_type,
                "value": value
            })

    def _matches_sensor_trigger(
        self,
        trigger_config: Dict,
        esp_id: UUID,
        gpio: int,
        sensor_type: str,
        value: float
    ) -> bool:
        """Prüft ob Sensor-Trigger matched"""
        # ESP-Filter
        if "esp_ids" in trigger_config:
            if str(esp_id) not in trigger_config["esp_ids"]:
                return False

        # GPIO-Filter
        if "gpios" in trigger_config:
            if gpio not in trigger_config["gpios"]:
                return False

        # Sensor-Type-Filter
        if "sensor_types" in trigger_config:
            if sensor_type not in trigger_config["sensor_types"]:
                return False

        # Value-Condition
        if "condition" in trigger_config:
            condition = trigger_config["condition"]
            # Simplified: Nur > Operator
            if condition.startswith("value >"):
                threshold = float(condition.split(">")[1].strip())
                if value <= threshold:
                    return False

        return True

    async def _execute_pipeline(self, pipeline: AIPipeline, trigger_data: Dict):
        """
        Führt Pipeline aus: Plugin → Actions

        Args:
            pipeline: Pipeline-Config
            trigger_data: Trigger-Daten (Sensor, etc.)
        """
        try:
            # Step 1: AI-Request via Plugin
            result = await self.ai_service.process_request(
                plugin_id=pipeline.plugin_id,
                input_data={
                    "trigger_data": trigger_data,
                    **pipeline.plugin_config
                },
                target_esp_id=trigger_data.get("esp_id")
            )

            # Step 2: Execute Actions
            for action in pipeline.actions:
                await self._execute_action(action, result, pipeline)

            logger.info(f"Pipeline '{pipeline.name}' erfolgreich ausgeführt")

        except Exception as e:
            logger.error(f"Fehler beim Ausführen von Pipeline '{pipeline.name}': {e}")

    async def _execute_action(self, action: Dict, ai_result, pipeline: AIPipeline):
        """
        Führt einzelne Action aus

        Actions:
        - store_prediction (automatisch via AIService)
        - websocket_broadcast (automatisch via AIService)
        - actuator_command (NEU - ESP steuern)
        - alert (NEU - Benachrichtigung)
        """
        action_type = action.get("type")

        if action_type == "actuator_command":
            # Permission-Check
            if not self._check_permission(pipeline, ai_result):
                logger.warning(f"Pipeline '{pipeline.name}': Actuator-Command abgelehnt (Permission/Confidence)")
                return

            # Execute Actuator-Command
            # TODO: Implementieren (via ActuatorService)
            logger.info(f"Actuator-Command: {action}")

        elif action_type == "alert":
            # Send alert
            # TODO: Implementieren (Email, Slack, etc.)
            logger.info(f"Alert: {action}")

        # store_prediction, websocket_broadcast: Automatisch via AIService

    def _check_permission(self, pipeline: AIPipeline, ai_result) -> bool:
        """
        Prüft ob Pipeline ESP steuern darf

        Checks:
        - Permission in Database
        - Confidence-Threshold
        """
        # Get permissions
        permissions = pipeline.permissions
        if not permissions.get("allow_esp_control"):
            return False

        # Confidence-Check
        min_confidence = permissions.get("min_confidence", 0.0)
        if ai_result.confidence < min_confidence:
            return False

        return True
```

### ✅ Phase 6 Prüfkriterien

- Pipelines können aus Database geladen werden
- Sensor-Trigger funktioniert
- Actions werden ausgeführt
- Permission-Check funktioniert

---

## Phase 7: Permission-System (NEU!)

**Datei:** `ai/permissions/permission_manager.py`

```python
"""
Permission-Manager für KI-ESP-Control

User definiert via Web-UI:
- Pipeline X darf ESP Y steuern
- Min. Confidence für Auto-Action: 0.8
"""

from typing import List
from uuid import UUID
from ...db.repositories.ai_repo import AIRepository
from ...core.logging_config import get_logger

logger = get_logger(__name__)


class PermissionManager:
    """
    Verwaltet KI-ESP-Control-Permissions
    """

    def __init__(self, ai_repo: AIRepository):
        self.ai_repo = ai_repo

    async def check_permission(
        self,
        pipeline_id: UUID,
        esp_id: UUID,
        action_type: str,
        confidence: float
    ) -> bool:
        """
        Prüft ob Pipeline ESP steuern darf

        Args:
            pipeline_id: Pipeline-UUID
            esp_id: ESP-UUID
            action_type: 'actuator_control', 'config_change', etc.
            confidence: AI-Confidence-Score (0.0-1.0)

        Returns:
            True wenn erlaubt
        """
        # Get permission from DB
        permission = await self.ai_repo.get_permission(pipeline_id, esp_id)

        if not permission:
            logger.warning(f"Permission denied: Pipeline {pipeline_id} → ESP {esp_id} (no permission)")
            return False

        # Check action type
        if action_type not in permission.allowed_actions:
            logger.warning(f"Permission denied: Action '{action_type}' not allowed")
            return False

        # Check confidence
        if confidence < permission.max_confidence_required:
            logger.warning(f"Permission denied: Confidence {confidence} < {permission.max_confidence_required}")
            return False

        logger.debug(f"Permission granted: Pipeline {pipeline_id} → ESP {esp_id} (action: {action_type})")
        return True

    async def grant_permission(
        self,
        pipeline_id: UUID,
        esp_id: UUID,
        allowed_actions: List[str],
        min_confidence: float = 0.8
    ) -> UUID:
        """
        Erstellt Permission (via Web-UI)

        Args:
            pipeline_id: Pipeline-UUID
            esp_id: ESP-UUID
            allowed_actions: Liste erlaubter Actions
            min_confidence: Min. Confidence für Auto-Action

        Returns:
            Permission-UUID
        """
        permission = await self.ai_repo.create_permission(
            pipeline_id=pipeline_id,
            esp_id=esp_id,
            allowed_actions=allowed_actions,
            max_confidence_required=min_confidence
        )

        logger.info(f"Permission erstellt: Pipeline {pipeline_id} → ESP {esp_id}")
        return permission.id

    async def revoke_permission(self, pipeline_id: UUID, esp_id: UUID) -> bool:
        """Widerruft Permission"""
        deleted = await self.ai_repo.delete_permission(pipeline_id, esp_id)

        if deleted:
            logger.info(f"Permission widerrufen: Pipeline {pipeline_id} → ESP {esp_id}")

        return deleted
```

### ✅ Phase 7 Prüfkriterien

- Permissions können erstellt werden
- Permission-Check funktioniert
- Tests sind grün

---

## Phase 8: Web-Interface-Integration

### 🎯 Ziel
REST API-Endpoints + Vuetify-Frontend-Integration

### 📁 Neue API-Endpoints

**Datei:** `api/v1/ai_services.py`

```python
"""
API-Endpoints für AI-Service-Management

User kann via Frontend:
- Services registrieren (OpenAI, Ollama, Custom)
- Services testen
- Services aktivieren/deaktivieren
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import List
from ...services.service_registry import get_service_registry
from ...db.repositories.ai_repo import AIRepository
from ...schemas.ai_service import (
    AIServiceCreate,
    AIServiceResponse,
    AIServiceTest
)
from ..deps import DBSession, OperatorUser

router = APIRouter(prefix="/v1/ai/services", tags=["ai-services"])


@router.post("/", response_model=AIServiceResponse)
async def register_service(
    request: AIServiceCreate,
    db: DBSession,
    current_user: OperatorUser
):
    """
    Registriert neuen AI-Service

    User-Input (Frontend):
    - Name: "My OpenAI Account"
    - Type: "openai"
    - Endpoint: "https://api.openai.com/v1"
    - API-Key: "sk-..."
    - Model: "gpt-4"
    """
    ai_repo = AIRepository(db)

    # Create service in DB
    service = await ai_repo.create_service(
        service_id=request.service_id,
        service_type=request.service_type,
        name=request.name,
        endpoint=request.endpoint,
        api_key=request.api_key,  # TODO: Encrypt!
        model=request.model,
        extra_config=request.extra_config
    )

    # Load into registry
    registry = get_service_registry()
    await registry._register_service(service)

    return AIServiceResponse.from_db(service)


@router.get("/", response_model=List[AIServiceResponse])
async def list_services(
    db: DBSession,
    current_user: OperatorUser
):
    """Liste aller Services"""
    ai_repo = AIRepository(db)
    services = await ai_repo.get_all_services()
    return [AIServiceResponse.from_db(s) for s in services]


@router.post("/{service_id}/test")
async def test_service(
    service_id: str,
    current_user: OperatorUser
):
    """
    Testet Service-Verbindung

    Frontend: "Test Connection"-Button
    """
    registry = get_service_registry()
    adapter = registry.get_service(service_id)

    if not adapter:
        raise HTTPException(404, f"Service '{service_id}' nicht gefunden")

    # Test connection
    success = await adapter.test_connection()

    return {
        "service_id": service_id,
        "success": success,
        "message": "Connection successful" if success else "Connection failed"
    }
```

**Datei:** `api/v1/pipelines.py`

```python
"""
API-Endpoints für Pipeline-Management

User kann via Frontend:
- Pipelines erstellen (Visual Builder)
- Pipelines testen
- Pipelines aktivieren/deaktivieren
"""

from fastapi import APIRouter, Depends
from typing import List
from ...db.repositories.ai_repo import AIRepository
from ...schemas.pipeline import (
    PipelineCreate,
    PipelineResponse
)
from ..deps import DBSession, OperatorUser

router = APIRouter(prefix="/v1/ai/pipelines", tags=["ai-pipelines"])


@router.post("/", response_model=PipelineResponse)
async def create_pipeline(
    request: PipelineCreate,
    db: DBSession,
    current_user: OperatorUser
):
    """
    Erstellt neue Pipeline

    Frontend: Visual Pipeline-Builder

    Beispiel-Request:
    {
        "name": "Anomalie-Erkennung Gewächshaus",
        "trigger_type": "sensor_data",
        "trigger_config": {
            "esp_ids": ["ESP_12AB"],
            "sensor_types": ["temperature"],
            "condition": "value > 25"
        },
        "plugin_id": "anomaly_detection",
        "ai_service_id": "my_openai_service",
        "actions": [
            {"type": "actuator_command", "esp_id": "ESP_34CD", "gpio": 18, "command": "OFF"}
        ],
        "permissions": {
            "allow_esp_control": true,
            "min_confidence": 0.8
        }
    }
    """
    ai_repo = AIRepository(db)

    pipeline = await ai_repo.create_pipeline(
        name=request.name,
        trigger_type=request.trigger_type,
        trigger_config=request.trigger_config,
        plugin_id=request.plugin_id,
        ai_service_id=request.ai_service_id,
        actions=request.actions,
        permissions=request.permissions
    )

    return PipelineResponse.from_db(pipeline)


@router.get("/", response_model=List[PipelineResponse])
async def list_pipelines(
    db: DBSession,
    current_user: OperatorUser
):
    """Liste aller Pipelines"""
    ai_repo = AIRepository(db)
    pipelines = await ai_repo.get_all_pipelines()
    return [PipelineResponse.from_db(p) for p in pipelines]
```

### Frontend-Konzepte (Vuetify)

**Page: AI-Service-Management**
```
┌────────────────────────────────────────────────────┐
│ AI-Services                              [+ Add]   │
├────────────────────────────────────────────────────┤
│ Service Name      │ Type    │ Status  │ Actions   │
├────────────────────────────────────────────────────┤
│ My OpenAI         │ OpenAI  │ Online  │ [Test][Edit]│
│ Local Ollama      │ Ollama  │ Online  │ [Test][Edit]│
│ Custom ML-Server  │ Generic │ Offline │ [Test][Edit]│
└────────────────────────────────────────────────────┘
```

**Page: Pipeline-Builder (Visual)**
```
┌────────────────────────────────────────────────────┐
│ Pipeline: Anomalie-Erkennung Gewächshaus          │
├────────────────────────────────────────────────────┤
│                                                    │
│  [Trigger: Sensor]  →  [Plugin: Anomaly]  →  [Action] │
│                                                    │
│  ┌────────────────┐  ┌─────────────┐  ┌────────┐  │
│  │ ESP_12AB       │  │ Service:    │  │ Actuator│
│  │ GPIO 34 (Temp) │  │ OpenAI GPT4 │  │ OFF    │
│  │ Value > 25°C   │  │             │  │ ESP_34 │
│  └────────────────┘  └─────────────┘  └────────┘  │
│                                                    │
│  Permissions:                                      │
│  ☑ Allow ESP Control (Min. Confidence: 0.8)       │
│                                                    │
│  [Test Pipeline]  [Save]  [Cancel]                │
└────────────────────────────────────────────────────┘
```

### ✅ Phase 8 Prüfkriterien

- API-Endpoints funktionieren
- Frontend kann Services registrieren
- Frontend kann Pipelines erstellen
- Tests sind grün

---

## Phase 9: Testing & Validation

### Unit-Tests
```bash
cd "El Servador"
poetry run pytest god_kaiser_server/tests/ai/ -v
```

### Integration-Tests
- Service-Adapter-Tests (mit Mocks)
- Pipeline-Engine-Tests
- Permission-System-Tests

### E2E-Tests
- User registriert OpenAI-Service via Frontend
- User erstellt Pipeline via Visual Builder
- Pipeline wird getriggert durch Sensor-Daten
- AI-Response wird verarbeitet
- Actuator wird gesteuert (mit Permission-Check)

**Erfolgskriterium:**
- Alle Tests grün
- End-to-End-Flow funktioniert

---

## 🎉 MVP-Fertigstellung

Nach Phase 9 ist das KI-Integration-System **einsatzbereit**:

✅ User kann beliebige AI-Services einbinden (OpenAI, Ollama, Custom)
✅ User kann Pipelines via Web-UI erstellen
✅ System orchestriert Datenfluss: ESP → AI → Aktion
✅ Permission-System schützt vor ungewollten AI-Aktionen
✅ Modular, industrietauglich, flexibel, robust

---

## Anhang: main.py Integration

**Wo wird alles initialisiert?**

**Datei:** `src/main.py` (lifespan-Funktion erweitern)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ===== STARTUP =====

    # ... bestehender Code (Database, MQTT, WebSocket) ...

    # ===== AI-INTEGRATION (NEU) =====
    logger.info("Initialisiere AI-Integration...")

    # Step 1: Service-Registry
    async for session in get_session():
        ai_repo = AIRepository(session)

        service_registry = AIServiceRegistry(ai_repo)
        await service_registry.load_services()
        set_service_registry(service_registry)

        # Step 2: AIService
        ai_service = AIService(
            ai_repo=ai_repo,
            esp_repo=ESPRepository(session),
            sensor_repo=SensorRepository(session),
            websocket_manager=_websocket_manager
        )
        await ai_service.initialize_plugins()
        set_ai_service(ai_service)

        # Step 3: Pipeline-Engine
        pipeline_engine = PipelineEngine(ai_repo, ai_service, service_registry)
        await pipeline_engine.load_pipelines()
        set_pipeline_engine(pipeline_engine)

        # Step 4: Permission-Manager
        permission_manager = PermissionManager(ai_repo)
        set_permission_manager(permission_manager)

        break

    logger.info("AI-Integration vollständig initialisiert")

    yield  # Server runs

    # ===== SHUTDOWN =====
    await ai_service.shutdown()
    await service_registry.shutdown()

    # ... bestehender Shutdown-Code ...
```

---

**Version:** 2.0
**Status:** Ready for Implementation
**Letzte Änderung:** 2025-12-09
