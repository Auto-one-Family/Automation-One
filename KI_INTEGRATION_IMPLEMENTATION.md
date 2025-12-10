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

## Phase 10: Context-System (ERWEITERT)

### 🎯 Ziel
AI-System mit **stateful Context** ausstatten: User-Präferenzen, Zone-Zustand, Conversation-History für intelligente Multi-Step-Interaktionen.

### 📝 Kern-Problem
**Ohne Context:** AI behandelt jede Anfrage isoliert - keine Kontinuität, keine Anpassung an User/Zone.

**Mit Context:** AI "erinnert sich" an User-Einstellungen, aktuelle Zonen-Zustände, laufende Conversations → intelligentere Entscheidungen.

### 📁 Neue Dateien

1. `src/ai/context/__init__.py`
2. `src/ai/context/context_manager.py`
3. `src/ai/context/conversation_state.py`
4. `src/db/repositories/context_repo.py`

### 📄 Database-Models (ERWEITERN)

**Datei:** `db/models/ai.py` (hinzufügen)

```python
"""
Context-System Models (Phase 10)
"""

class AIContext(Base):
    """
    Speichert Kontext für AI-Entscheidungen

    Generisch für beliebige Use Cases:
    - Produktions-Umgebungen (Anbau, Fertigung, etc.)
    - Monitoring-Szenarien (Klimaüberwachung, Maschinen-Überwachung)
    - Optimization-Tasks (Energie, Ressourcen, etc.)

    NICHT festgelegt auf spezifische Use Cases!
    """
    __tablename__ = "ai_contexts"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    zone_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("zones.id"), nullable=True)

    # Generischer Kontext-Typ (user-definiert)
    context_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # Beispiele: "production_cycle", "monitoring_session", "optimization_task"

    # Aktueller Zustand (flexibles JSON)
    current_state: Mapped[dict] = mapped_column(JSON, default={})
    # Beispiele:
    # {"phase": "vegetative", "day": 42, "target_params": {...}}
    # {"monitoring_mode": "anomaly_detection", "baseline_established": true}
    # {"optimization_target": "energy_cost", "constraints": {...}}

    # Historische Daten (für Trend-Analyse)
    history: Mapped[list] = mapped_column(JSON, default=[])
    # Beispiel: [{"timestamp": "...", "event": "state_change", "data": {...}}, ...]

    # User-Präferenzen (für diesen Kontext)
    preferences: Mapped[dict] = mapped_column(JSON, default={})
    # Beispiele:
    # {"alert_threshold": 0.8, "auto_control_enabled": false, "preferred_response_format": "detailed"}
    # {"update_frequency": "hourly", "notification_channels": ["email", "websocket"]}

    # Metadaten
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (
        Index('idx_context_user_zone', 'user_id', 'zone_id'),
        Index('idx_context_type', 'context_type', 'is_active'),
    )


class ConversationState(Base):
    """
    Multi-Step-Conversation-State für dialogbasierte AI-Interaktionen

    Ermöglicht:
    - AI stellt Follow-up-Fragen
    - User antwortet schrittweise
    - AI sammelt Information über mehrere Interaktionen
    - Workflow-basierte Dialoge
    """
    __tablename__ = "conversation_states"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    context_id: Mapped[UUID] = mapped_column(ForeignKey("ai_contexts.id"), nullable=False)

    # Workflow-Identifikation
    workflow_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # Beispiele: "context_change", "troubleshooting", "optimization_setup"

    # Aktueller Workflow-Schritt
    current_step: Mapped[int] = mapped_column(Integer, default=0)
    total_steps: Mapped[int] = mapped_column(Integer, nullable=False)

    # Gesammelte Daten
    collected_data: Mapped[dict] = mapped_column(JSON, default={})
    # Key = Field-Name, Value = User-Antwort
    # Beispiel: {"target_parameter": "temperature", "desired_value": 22.5, "tolerance": 1.0}

    # Pending Questions (was AI als nächstes fragen will)
    pending_questions: Mapped[list] = mapped_column(JSON, default=[])
    # Beispiel: [
    #   {"field": "time_horizon", "question": "For how long should this optimization run?", "type": "duration"},
    #   {"field": "priority", "question": "What's more important: cost or speed?", "type": "choice"}
    # ]

    # Conversation-History
    messages: Mapped[list] = mapped_column(JSON, default=[])
    # Beispiel: [
    #   {"role": "ai", "content": "Question...", "timestamp": "..."},
    #   {"role": "user", "content": "Answer...", "timestamp": "..."}
    # ]

    # Status
    status: Mapped[str] = mapped_column(String(50), default="active")
    # "active", "completed", "cancelled", "timeout"

    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_conversation_context', 'context_id', 'status'),
        Index('idx_conversation_workflow', 'workflow_type', 'status'),
    )
```

### 📄 Implementation: Context-Manager

**Datei:** `ai/context/context_manager.py`

**Vorbild:** ConfigManager (NVS-Config-Management)
**Referenz:** `El Trabajante/src/services/config/config_manager.cpp`

```python
"""
Context-Manager: Verwaltet AI-Kontext für User/Zones

Ähnlich zu: ConfigManager (ESP32)
Referenz: El Trabajante/src/services/config/config_manager.cpp
"""

from typing import Optional, Dict, List
from uuid import UUID
from ...db.repositories.context_repo import ContextRepository
from ...db.models.ai import AIContext, ConversationState
from ...core.logging_config import get_logger

logger = get_logger(__name__)


class ContextManager:
    """
    Verwaltet AI-Kontext für intelligente Entscheidungen

    Use Cases:
    - AI berücksichtigt aktuelle Zone-Situation
    - AI passt Antworten an User-Präferenzen an
    - AI nutzt historische Daten für Predictions
    """

    def __init__(self, context_repo: ContextRepository):
        self.context_repo = context_repo

    async def get_or_create_context(
        self,
        user_id: UUID,
        zone_id: Optional[UUID],
        context_type: str
    ) -> AIContext:
        """
        Holt existierenden Kontext oder erstellt neuen

        Args:
            user_id: User-UUID
            zone_id: Zone-UUID (optional - kann None sein für globale Kontexte)
            context_type: Kontext-Typ (user-definiert)

        Returns:
            AIContext-Objekt
        """
        # Versuche existierenden Kontext zu finden
        context = await self.context_repo.get_active_context(
            user_id=user_id,
            zone_id=zone_id,
            context_type=context_type
        )

        if context:
            logger.debug(f"Context gefunden: {context.id} ({context_type})")
            return context

        # Erstelle neuen Kontext
        context = await self.context_repo.create(
            user_id=user_id,
            zone_id=zone_id,
            context_type=context_type,
            current_state={},
            preferences={}
        )

        logger.info(f"Neuer Context erstellt: {context.id} ({context_type})")
        return context

    async def update_state(
        self,
        context_id: UUID,
        state_updates: Dict,
        add_to_history: bool = True
    ) -> bool:
        """
        Aktualisiert Context-State

        Args:
            context_id: Context-UUID
            state_updates: Neue State-Werte (wird gemerged)
            add_to_history: Soll Update in History gespeichert werden?

        Returns:
            True wenn erfolgreich
        """
        context = await self.context_repo.get(context_id)
        if not context:
            logger.error(f"Context {context_id} nicht gefunden")
            return False

        # Merge state
        current_state = context.current_state or {}
        current_state.update(state_updates)

        # Add to history if requested
        history = context.history or []
        if add_to_history:
            history.append({
                "timestamp": datetime.utcnow().isoformat(),
                "event": "state_update",
                "updates": state_updates
            })

        # Update DB
        await self.context_repo.update(
            context_id,
            current_state=current_state,
            history=history
        )

        logger.debug(f"Context {context_id} aktualisiert: {state_updates}")
        return True

    async def set_preference(
        self,
        context_id: UUID,
        key: str,
        value: any
    ) -> bool:
        """
        Setzt User-Präferenz für Context

        Args:
            context_id: Context-UUID
            key: Präferenz-Key
            value: Präferenz-Value
        """
        context = await self.context_repo.get(context_id)
        if not context:
            return False

        preferences = context.preferences or {}
        preferences[key] = value

        await self.context_repo.update(context_id, preferences=preferences)
        logger.debug(f"Präferenz gesetzt: {key} = {value}")
        return True

    async def get_context_for_ai_request(
        self,
        user_id: UUID,
        zone_id: Optional[UUID],
        context_type: str
    ) -> Dict:
        """
        Holt vollständigen Kontext für AI-Request

        Returns:
            Dict mit allen relevanten Context-Daten für AI-Prompt
        """
        context = await self.get_or_create_context(user_id, zone_id, context_type)

        return {
            "context_id": str(context.id),
            "context_type": context.context_type,
            "current_state": context.current_state,
            "preferences": context.preferences,
            "history_summary": self._summarize_history(context.history),
            "zone_id": str(zone_id) if zone_id else None
        }

    def _summarize_history(self, history: List[Dict], max_entries: int = 10) -> List[Dict]:
        """Gibt letzte N History-Einträge zurück"""
        return history[-max_entries:] if history else []


# Global accessor
_context_manager_instance: Optional[ContextManager] = None

def get_context_manager() -> ContextManager:
    global _context_manager_instance
    if not _context_manager_instance:
        raise RuntimeError("ContextManager nicht initialisiert")
    return _context_manager_instance

def set_context_manager(manager: ContextManager):
    global _context_manager_instance
    _context_manager_instance = manager
```

### 📄 Integration in Pipeline-Engine

**Datei:** `ai/pipeline/pipeline_engine.py` (ERWEITERN)

```python
# In PipelineEngine._execute_pipeline():

async def _execute_pipeline(self, pipeline: AIPipeline, trigger_data: Dict):
    """Führt Pipeline aus: Plugin → Actions (MIT CONTEXT)"""

    # NEU: Hole Context für Zone/User
    context_manager = get_context_manager()
    context_data = await context_manager.get_context_for_ai_request(
        user_id=pipeline.user_id,  # Annahme: Pipeline hat User-Relation
        zone_id=trigger_data.get("zone_id"),
        context_type=pipeline.plugin_config.get("context_type", "default")
    )

    # AI-Request mit Context
    result = await self.ai_service.process_request(
        plugin_id=pipeline.plugin_id,
        input_data={
            "trigger_data": trigger_data,
            "context": context_data,  # NEU: Context für AI
            **pipeline.plugin_config
        },
        target_esp_id=trigger_data.get("esp_id")
    )

    # ... rest of method ...
```

### ✅ Phase 10 Prüfkriterien

**Tests:** `tests/ai/test_context_manager.py`

```python
@pytest.mark.asyncio
async def test_context_creation():
    """Context kann erstellt werden"""
    context = await context_manager.get_or_create_context(
        user_id=user_uuid,
        zone_id=zone_uuid,
        context_type="test_context"
    )
    assert context.id is not None
    assert context.context_type == "test_context"


@pytest.mark.asyncio
async def test_state_update():
    """State kann aktualisiert werden"""
    success = await context_manager.update_state(
        context_id=context.id,
        state_updates={"test_param": "value"},
        add_to_history=True
    )
    assert success is True

    # Verify
    updated = await context_repo.get(context.id)
    assert updated.current_state["test_param"] == "value"
    assert len(updated.history) > 0


@pytest.mark.asyncio
async def test_context_in_pipeline():
    """Pipeline nutzt Context für AI-Request"""
    # Trigger pipeline
    await pipeline_engine.trigger_pipeline_by_sensor_data(...)

    # Verify: AI-Request enthielt Context-Daten
    # (Mock AI-Service und prüfe Request-Params)
```

**Erfolgskriterium:**
- Contexts können erstellt/aktualisiert werden
- State-History wird gespeichert
- Pipelines nutzen Context für AI-Requests
- Tests sind grün

---

## Phase 11: Knowledge-Base-System (ERWEITERT)

### 🎯 Ziel
Strukturierte **Wissensdatenbank** für AI-Entscheidungen: Wissenschaftliche Daten, Best-Practices, Referenz-Werte, Regelwerke.

### 📝 Kern-Problem
**Ohne Knowledge-Base:** AI nutzt nur Training-Daten → kann nicht auf domänen-spezifisches Wissen zugreifen.

**Mit Knowledge-Base:** AI kann auf strukturierte, verifizierte Daten zugreifen → fundierte Empfehlungen.

### 📁 Neue Dateien

1. `src/ai/knowledge/__init__.py`
2. `src/ai/knowledge/knowledge_manager.py`
3. `src/ai/knowledge/knowledge_loader.py`
4. `src/db/repositories/knowledge_repo.py`

### 📄 Database-Models (ERWEITERN)

**Datei:** `db/models/ai.py` (hinzufügen)

```python
"""
Knowledge-Base Models (Phase 11)
"""

class KnowledgeCategory(Base):
    """
    Kategorisierung von Wissen

    Hierarchische Struktur möglich (parent_id)
    Beispiele:
    - "Agriculture" → "Fertilization" → "Organic"
    - "Manufacturing" → "Quality Control" → "Visual Inspection"
    - "Energy" → "Optimization" → "Peak Shaving"
    """
    __tablename__ = "knowledge_categories"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    parent_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("knowledge_categories.id"), nullable=True)

    # Relationships
    children: Mapped[List["KnowledgeCategory"]] = relationship(
        "KnowledgeCategory",
        back_populates="parent",
        cascade="all, delete-orphan"
    )
    parent: Mapped[Optional["KnowledgeCategory"]] = relationship(
        "KnowledgeCategory",
        back_populates="children",
        remote_side=[id]
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_knowledge_category_parent', 'parent_id'),
    )


class KnowledgeBase(Base):
    """
    Strukturierte Wissensdaten für AI

    Flexibles Schema für beliebige Domänen:
    - Agriculture: Düngungs-Tabellen, Klimadaten, Schädlings-Bekämpfung
    - Manufacturing: Maschinen-Parameter, Qualitäts-Standards
    - Energy: Preis-Modelle, Effizienz-Richtwerte
    - Monitoring: Schwellwerte, Normalbereiche
    """
    __tablename__ = "knowledge_base"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    category_id: Mapped[UUID] = mapped_column(ForeignKey("knowledge_categories.id"), nullable=False)

    # Titel & Beschreibung
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)

    # Anwendbarkeit (Filter)
    applicable_to: Mapped[dict] = mapped_column(JSON, default={})
    # Beispiele:
    # {"entity_type": "crop", "entity_name": "tomato", "growth_stage": "vegetative"}
    # {"machine_type": "cnc_mill", "material": "aluminum"}
    # {"zone_type": "greenhouse", "climate_zone": "temperate"}

    # Strukturierte Daten
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Schema ist domänen-abhängig!
    # Agriculture-Beispiel:
    # {
    #   "nutrient_requirements": {
    #     "N": {"min": 150, "max": 250, "unit": "ppm"},
    #     "P": {"min": 40, "max": 80, "unit": "ppm"}
    #   },
    #   "optimal_conditions": {
    #     "temperature": {"day": 24, "night": 18, "unit": "celsius"},
    #     "humidity": {"min": 60, "max": 80, "unit": "percent"}
    #   }
    # }
    # Manufacturing-Beispiel:
    # {
    #   "cutting_parameters": {
    #     "speed": {"min": 2000, "max": 4000, "unit": "rpm"},
    #     "feed_rate": {"min": 100, "max": 300, "unit": "mm/min"}
    #   }
    # }

    # Quellen & Verifikation
    sources: Mapped[list] = mapped_column(JSON, default=[])
    # Beispiel: [
    #   {"type": "research_paper", "doi": "10.1234/xyz", "authors": "Smith et al."},
    #   {"type": "industry_standard", "standard_id": "ISO 9001", "year": 2021}
    # ]

    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_by: Mapped[Optional[UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Version-Control
    version: Mapped[int] = mapped_column(Integer, default=1)
    superseded_by: Mapped[Optional[UUID]] = mapped_column(ForeignKey("knowledge_base.id"), nullable=True)

    # Metadaten
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    category: Mapped["KnowledgeCategory"] = relationship("KnowledgeCategory")

    __table_args__ = (
        Index('idx_knowledge_category', 'category_id', 'verified'),
        Index('idx_knowledge_applicable', 'applicable_to'),  # GIN-Index für JSON-Queries
    )
```

### 📄 Implementation: Knowledge-Manager

**Datei:** `ai/knowledge/knowledge_manager.py`

```python
"""
Knowledge-Manager: Zugriff auf strukturierte Wissensdaten

Vorbild: LibraryLoader (Sensor-Libraries)
Referenz: El Servador/god_kaiser_server/src/sensors/library_loader.py
"""

from typing import List, Dict, Optional
from uuid import UUID
from ...db.repositories.knowledge_repo import KnowledgeRepository
from ...db.models.ai import KnowledgeBase
from ...core.logging_config import get_logger

logger = get_logger(__name__)


class KnowledgeManager:
    """
    Verwaltet Knowledge-Base für AI-Entscheidungen

    Use Cases:
    - AI holt Referenz-Werte für Empfehlungen
    - AI validiert User-Input gegen Best-Practices
    - AI nutzt wissenschaftliche Daten für Berechnungen
    """

    def __init__(self, knowledge_repo: KnowledgeRepository):
        self.knowledge_repo = knowledge_repo
        self._cache: Dict[str, List[KnowledgeBase]] = {}  # category_name → entries

    async def query(
        self,
        category_name: str,
        filters: Optional[Dict] = None,
        verified_only: bool = True
    ) -> List[KnowledgeBase]:
        """
        Query Knowledge-Base

        Args:
            category_name: Kategorie-Name (z.B. "fertilization", "quality_control")
            filters: Optionale Filter für applicable_to (JSON-Query)
            verified_only: Nur verifizierte Einträge?

        Returns:
            Liste von Knowledge-Einträgen
        """
        # Check cache
        cache_key = f"{category_name}_{filters}_{verified_only}"
        if cache_key in self._cache:
            logger.debug(f"Knowledge-Cache-Hit: {cache_key}")
            return self._cache[cache_key]

        # Query DB
        entries = await self.knowledge_repo.query_by_category(
            category_name=category_name,
            filters=filters,
            verified_only=verified_only
        )

        # Cache result
        self._cache[cache_key] = entries
        logger.debug(f"Knowledge gefunden: {len(entries)} Einträge ({category_name})")

        return entries

    async def get_for_context(
        self,
        context_data: Dict
    ) -> List[KnowledgeBase]:
        """
        Holt relevante Knowledge-Einträge für gegebenen Kontext

        Args:
            context_data: Context-Dict aus ContextManager

        Returns:
            Liste relevanter Knowledge-Einträge
        """
        # Extract context-type
        context_type = context_data.get("context_type", "")
        current_state = context_data.get("current_state", {})

        # Build filters from context
        filters = {}
        # Beispiel: Wenn context_type = "production_cycle" und state enthält "entity_type": "crop"
        # dann filter nach {"entity_type": "crop"}
        if "entity_type" in current_state:
            filters["entity_type"] = current_state["entity_type"]
        if "entity_name" in current_state:
            filters["entity_name"] = current_state["entity_name"]

        # Query knowledge
        category = self._map_context_to_category(context_type)
        return await self.query(category, filters=filters if filters else None)

    def _map_context_to_category(self, context_type: str) -> str:
        """
        Mappt Context-Type zu Knowledge-Category

        User-definierbar via Config!
        """
        # Default-Mappings (können via DB konfiguriert werden)
        mappings = {
            "production_cycle": "production_parameters",
            "monitoring_session": "baseline_values",
            "optimization_task": "optimization_strategies",
            # ... weitere Mappings ...
        }
        return mappings.get(context_type, "general")

    async def add_entry(
        self,
        category_name: str,
        title: str,
        data: Dict,
        applicable_to: Dict,
        sources: List[Dict],
        created_by: UUID
    ) -> UUID:
        """
        Fügt neuen Knowledge-Eintrag hinzu

        User kann via Web-UI eigene Knowledge-Einträge erstellen!
        """
        # Get category
        category = await self.knowledge_repo.get_category_by_name(category_name)
        if not category:
            raise ValueError(f"Category '{category_name}' nicht gefunden")

        # Create entry
        entry = await self.knowledge_repo.create_entry(
            category_id=category.id,
            title=title,
            data=data,
            applicable_to=applicable_to,
            sources=sources,
            created_by=created_by
        )

        # Clear cache
        self._cache.clear()

        logger.info(f"Knowledge-Entry erstellt: {entry.title} ({category_name})")
        return entry.id


# Global accessor
_knowledge_manager_instance: Optional[KnowledgeManager] = None

def get_knowledge_manager() -> KnowledgeManager:
    global _knowledge_manager_instance
    if not _knowledge_manager_instance:
        raise RuntimeError("KnowledgeManager nicht initialisiert")
    return _knowledge_manager_instance

def set_knowledge_manager(manager: KnowledgeManager):
    global _knowledge_manager_instance
    _knowledge_manager_instance = manager
```

### 📄 Integration in AIService

**Datei:** `services/ai_service.py` (ERWEITERN)

```python
# In AIService.process_request():

async def process_request(
    self,
    plugin_id: str,
    input_data: Dict,
    target_esp_id: Optional[UUID] = None
) -> Dict:
    """Verarbeitet AI-Request MIT KNOWLEDGE-BASE"""

    # ... existing code ...

    # NEU: Hole relevante Knowledge-Einträge
    knowledge_manager = get_knowledge_manager()
    if "context" in input_data:
        knowledge_entries = await knowledge_manager.get_for_context(input_data["context"])

        # Add to prompt
        enriched_prompt = self._build_prompt_with_knowledge(
            base_prompt=plugin_config.get("prompt"),
            input_data=input_data,
            knowledge_entries=knowledge_entries
        )
    else:
        enriched_prompt = plugin_config.get("prompt")

    # ... send to AI service ...


def _build_prompt_with_knowledge(
    self,
    base_prompt: str,
    input_data: Dict,
    knowledge_entries: List[KnowledgeBase]
) -> str:
    """Baut Prompt mit Knowledge-Base-Daten"""

    if not knowledge_entries:
        return base_prompt

    # Format knowledge for prompt
    knowledge_text = "\n\n## Verfügbare Wissensdaten:\n"
    for entry in knowledge_entries:
        knowledge_text += f"\n### {entry.title}\n"
        knowledge_text += f"{entry.description}\n"
        knowledge_text += f"Daten: {entry.data}\n"
        knowledge_text += f"Quellen: {entry.sources}\n"

    return f"{base_prompt}\n{knowledge_text}\n\n## Aufgabe:\nNutze die obigen Wissensdaten für deine Entscheidung."
```

### ✅ Phase 11 Prüfkriterien

**Tests:** `tests/ai/test_knowledge_manager.py`

```python
@pytest.mark.asyncio
async def test_knowledge_query():
    """Knowledge kann abgefragt werden"""
    entries = await knowledge_manager.query(
        category_name="test_category",
        filters={"entity_type": "test"},
        verified_only=True
    )
    assert isinstance(entries, list)


@pytest.mark.asyncio
async def test_knowledge_in_ai_request():
    """AI-Request nutzt Knowledge-Base"""
    # Create knowledge entry
    await knowledge_manager.add_entry(...)

    # Trigger AI-Request
    result = await ai_service.process_request(
        plugin_id="test_plugin",
        input_data={"context": {...}}
    )

    # Verify: AI-Prompt enthielt Knowledge-Daten
    # (Mock AI-Adapter und prüfe Prompt)
```

**Erfolgskriterium:**
- Knowledge-Einträge können erstellt werden
- Knowledge kann abgefragt werden (mit Filtern)
- AI-Requests nutzen Knowledge für Prompts
- Tests sind grün

---

## Phase 12: External-Data-Connectors (ERWEITERT)

### 🎯 Ziel
**Live-Daten** von externen APIs für AI-Entscheidungen: Energiepreise, Wetter, Marktdaten, etc.

### 📝 Kern-Problem
**Ohne External Data:** AI kann nur auf interne Sensor-Daten zugreifen.

**Mit External Data:** AI kann externe Faktoren berücksichtigen → bessere Optimierungen.

### 📁 Neue Dateien

1. `src/ai/connectors/__init__.py`
2. `src/ai/connectors/base_connector.py`
3. `src/ai/connectors/energy_price_connector.py`
4. `src/ai/connectors/weather_connector.py`
5. `src/ai/connectors/generic_api_connector.py`

### 📄 Database-Models (ERWEITERN)

**Datei:** `db/models/ai.py` (hinzufügen)

```python
"""
External-Data-Source Models (Phase 12)
"""

class ExternalDataSource(Base):
    """
    Konfiguration für externe Datenquellen

    User kann beliebige APIs einbinden!
    """
    __tablename__ = "external_data_sources"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # "energy_price", "weather", "market_data", "generic_api"

    endpoint: Mapped[str] = mapped_column(String(500), nullable=False)
    api_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # Encrypted!

    # Request-Config
    request_config: Mapped[dict] = mapped_column(JSON, default={})
    # Beispiel:
    # {
    #   "method": "GET",
    #   "params": {"location": "{zone.location}", "units": "metric"},
    #   "headers": {"Authorization": "Bearer {api_key}"}
    # }

    # Response-Parsing
    response_mapping: Mapped[dict] = mapped_column(JSON, default={})
    # Beispiel:
    # {
    #   "price": "data.prices.0.value",
    #   "timestamp": "data.timestamp",
    #   "unit": "data.unit"
    # }

    # Update-Frequenz
    update_interval_seconds: Mapped[int] = mapped_column(Integer, default=3600)  # 1h default
    last_update: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Cache
    cached_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_external_source_type', 'source_type', 'is_enabled'),
    )
```

### 📄 Implementation: Base-Connector

**Datei:** `ai/connectors/base_connector.py`

**Vorbild:** BaseAIServiceAdapter
**Referenz:** Phase 1

```python
"""
Base-Connector für externe Datenquellen

Ähnlich zu: BaseAIServiceAdapter
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class ExternalDataRequest:
    """Request für externe Daten"""
    params: Dict[str, Any] = None

    def __post_init__(self):
        if self.params is None:
            self.params = {}


@dataclass
class ExternalDataResponse:
    """Response von externer Datenquelle"""
    data: Dict[str, Any]
    timestamp: datetime
    source: str
    raw_response: Dict = None

    def __post_init__(self):
        if self.raw_response is None:
            self.raw_response = {}


class BaseExternalDataConnector(ABC):
    """
    Abstract Base Class für External-Data-Connectors

    Ähnlich zu: BaseAIServiceAdapter
    """

    def __init__(self, source_config: "ExternalDataSource"):
        self.config = source_config
        self.is_initialized = False

    @abstractmethod
    async def initialize(self) -> bool:
        """Initialisiert Connector"""
        pass

    @abstractmethod
    async def fetch_data(self, request: ExternalDataRequest) -> ExternalDataResponse:
        """
        Holt Daten von externer Quelle

        Args:
            request: Request-Parameter

        Returns:
            ExternalDataResponse mit Daten
        """
        pass

    async def get_cached_or_fetch(self, request: ExternalDataRequest) -> ExternalDataResponse:
        """
        Holt Daten aus Cache oder fetched neu (basierend auf update_interval)
        """
        # Check cache
        if self.config.cached_data and self.config.last_update:
            age_seconds = (datetime.utcnow() - self.config.last_update).total_seconds()
            if age_seconds < self.config.update_interval_seconds:
                logger.debug(f"External-Data-Cache-Hit: {self.config.name}")
                return ExternalDataResponse(
                    data=self.config.cached_data,
                    timestamp=self.config.last_update,
                    source=self.config.name
                )

        # Fetch new data
        response = await self.fetch_data(request)

        # Update cache (via repository)
        # TODO: Update cached_data und last_update in DB

        return response
```

### 📄 Implementation: Generic-API-Connector

**Datei:** `ai/connectors/generic_api_connector.py`

```python
"""
Generic REST-API-Connector für User-definierte Datenquellen

WICHTIG: Ermöglicht User, beliebige APIs einzubinden!
"""

import httpx
from typing import Dict, Any
from .base_connector import BaseExternalDataConnector, ExternalDataRequest, ExternalDataResponse
from ...core.logging_config import get_logger

logger = get_logger(__name__)


class GenericAPIConnector(BaseExternalDataConnector):
    """
    Generic Connector für REST-APIs

    User konfiguriert via Web-UI:
    - Endpoint
    - Request-Format (Params, Headers, Method)
    - Response-Mapping (JSON-Path)
    """

    def __init__(self, source_config):
        super().__init__(source_config)
        self.client: Optional[httpx.AsyncClient] = None

    async def initialize(self) -> bool:
        """Initialisiert HTTP-Client"""
        self.client = httpx.AsyncClient(timeout=30.0)
        self.is_initialized = True
        logger.info(f"Generic-API-Connector '{self.config.name}' initialisiert")
        return True

    async def fetch_data(self, request: ExternalDataRequest) -> ExternalDataResponse:
        """Holt Daten von Generic REST-API"""

        # Build request from config
        method = self.config.request_config.get("method", "GET")
        params = self._build_params(request.params)
        headers = self._build_headers()

        # Send request
        if method == "GET":
            response = await self.client.get(
                self.config.endpoint,
                params=params,
                headers=headers
            )
        elif method == "POST":
            response = await self.client.post(
                self.config.endpoint,
                json=params,
                headers=headers
            )
        else:
            raise ValueError(f"Unsupported method: {method}")

        response.raise_for_status()
        data = response.json()

        # Parse response using mapping
        parsed_data = self._parse_response(data, self.config.response_mapping)

        return ExternalDataResponse(
            data=parsed_data,
            timestamp=datetime.utcnow(),
            source=self.config.name,
            raw_response=data
        )

    def _build_params(self, user_params: Dict) -> Dict:
        """Baut Request-Params aus Config + User-Params"""
        params = self.config.request_config.get("params", {}).copy()

        # Replace placeholders
        # Beispiel: "{zone.location}" → aus user_params["zone"]["location"]
        for key, value in params.items():
            if isinstance(value, str) and value.startswith("{"):
                # Simple placeholder replacement
                placeholder = value.strip("{}")
                params[key] = user_params.get(placeholder, value)

        return params

    def _build_headers(self) -> Dict:
        """Baut Headers (mit API-Key wenn vorhanden)"""
        headers = self.config.request_config.get("headers", {}).copy()

        if self.config.api_key:
            # Replace {api_key} placeholder
            for key, value in headers.items():
                if isinstance(value, str) and "{api_key}" in value:
                    headers[key] = value.replace("{api_key}", self.config.api_key)

        return headers

    def _parse_response(self, data: Dict, mapping: Dict) -> Dict:
        """
        Parst Response basierend auf User-definiertem Mapping

        Mapping-Beispiel:
        {
            "price": "data.prices.0.value",
            "timestamp": "data.timestamp"
        }
        """
        result = {}
        for result_key, json_path in mapping.items():
            # Extract value from JSON using path
            value = data
            for key in json_path.split("."):
                if key.isdigit():
                    value = value[int(key)]
                else:
                    value = value[key]
            result[result_key] = value

        return result
```

### 📄 Integration in Pipeline-Engine

**Datei:** `ai/pipeline/pipeline_engine.py` (ERWEITERN)

```python
# In Pipeline-Model (Phase 3):
# AIPipeline erhält neues Feld:

class AIPipeline(Base):
    # ... existing fields ...

    # NEU: External-Data-Sources
    external_data_sources: Mapped[list] = mapped_column(JSON, default=[])
    # Beispiel: [
    #   {"source_id": "energy_price_api", "params": {"location": "zone.location"}},
    #   {"source_id": "weather_api", "params": {"lat": "zone.latitude", "lon": "zone.longitude"}}
    # ]


# In PipelineEngine._execute_pipeline():

async def _execute_pipeline(self, pipeline: AIPipeline, trigger_data: Dict):
    """Führt Pipeline aus MIT EXTERNAL DATA"""

    # ... existing code (Context) ...

    # NEU: Hole externe Daten wenn konfiguriert
    external_data = {}
    if pipeline.external_data_sources:
        for source_config in pipeline.external_data_sources:
            source = await self._get_external_source(source_config["source_id"])
            connector = self._create_connector(source)

            response = await connector.get_cached_or_fetch(
                ExternalDataRequest(params=source_config.get("params", {}))
            )

            external_data[source_config["source_id"]] = response.data

    # AI-Request mit Context + External Data
    result = await self.ai_service.process_request(
        plugin_id=pipeline.plugin_id,
        input_data={
            "trigger_data": trigger_data,
            "context": context_data,
            "external_data": external_data,  # NEU
            **pipeline.plugin_config
        }
    )
```

### ✅ Phase 12 Prüfkriterien

**Tests:** `tests/ai/test_external_connectors.py`

```python
@pytest.mark.asyncio
async def test_generic_api_connector():
    """Generic-Connector kann Daten holen"""
    connector = GenericAPIConnector(source_config)
    await connector.initialize()

    response = await connector.fetch_data(
        ExternalDataRequest(params={"test": "value"})
    )

    assert response.data is not None


@pytest.mark.asyncio
async def test_external_data_in_pipeline():
    """Pipeline nutzt External Data"""
    # Configure pipeline with external source
    pipeline.external_data_sources = [{"source_id": "test_api", "params": {}}]

    # Trigger pipeline
    await pipeline_engine._execute_pipeline(pipeline, trigger_data)

    # Verify: AI-Request enthielt External Data
```

**Erfolgskriterium:**
- External-Data-Sources können konfiguriert werden
- Connectors können Daten holen (mit Caching)
- Pipelines nutzen External Data für AI-Requests
- Tests sind grün

---

## Phase 13: Digital-Twin-Schema (ERWEITERT)

### 🎯 Ziel
**Virtuelle 3D-Repräsentation** von physischen Räumen und Maschinen für Visualisierung und Simulation.

### 📝 Kern-Problem
**Ohne Digital Twin:** User sieht nur abstrakte Daten (Listen, Graphen).

**Mit Digital Twin:** User sieht realitätsgetreue 3D-Darstellung → besseres Verständnis, intuitive Steuerung.

### 📁 Neue Dateien

1. `src/db/repositories/digital_twin_repo.py`

### 📄 Database-Models (ERWEITERN)

**Datei:** `db/models/ai.py` (hinzufügen)

```python
"""
Digital-Twin Models (Phase 13)
"""

class ZoneGeometry(Base):
    """
    3D-Geometrie für Zonen (Digital Twin)

    Ermöglicht realitätsgetreue Visualisierung
    """
    __tablename__ = "zone_geometry"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    zone_id: Mapped[UUID] = mapped_column(ForeignKey("zones.id"), nullable=False, unique=True)

    # 3D-Koordinaten (Vertices)
    vertices: Mapped[list] = mapped_column(JSON, nullable=False)
    # Beispiel: [[x, y, z], [x, y, z], ...]  (Meter)

    # Dimensionen (Bounding Box)
    dimensions: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Beispiel: {"length": 10.0, "width": 5.0, "height": 3.0, "unit": "meter"}

    # Sensor/Aktor-Positionen
    sensor_positions: Mapped[dict] = mapped_column(JSON, default={})
    # Beispiel: {
    #   "sensor_uuid_1": {"x": 2.5, "y": 1.0, "z": 1.5},
    #   "sensor_uuid_2": {"x": 7.5, "y": 4.0, "z": 1.5}
    # }

    actuator_positions: Mapped[dict] = mapped_column(JSON, default={})
    # Analog zu sensor_positions

    # 3D-Model-Referenz (optional)
    model_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # URL zu 3D-Model-Datei (.gltf, .obj, etc.)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_zone_geometry', 'zone_id'),
    )


class MachineProperties(Base):
    """
    Maschineneigenschaften für Aktoren (z.B. Fenster-Motor, Pumpe, Ventil)

    Ermöglicht realistische Simulation und Animation
    """
    __tablename__ = "machine_properties"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    actuator_id: Mapped[UUID] = mapped_column(ForeignKey("actuator_configs.id"), nullable=False, unique=True)

    # Physikalische Eigenschaften
    properties: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Schema ist maschinen-abhängig!
    # Fenster-Motor-Beispiel:
    # {
    #   "type": "window_actuator",
    #   "opening_angle_max": 90,  # degrees
    #   "opening_speed": 5,  # degrees/second
    #   "torque": 10,  # Nm
    #   "power_consumption": 50,  # Watt
    #   "dimensions": {"width": 1.2, "height": 0.8, "unit": "meter"}
    # }
    # Pumpe-Beispiel:
    # {
    #   "type": "pump",
    #   "flow_rate_max": 100,  # liters/minute
    #   "pressure_max": 3,  # bar
    #   "power_consumption": 200,  # Watt
    # }

    # 3D-Visualisierung
    visualization: Mapped[dict] = mapped_column(JSON, default={})
    # Beispiel:
    # {
    #   "model_type": "window",
    #   "animation": "rotate",
    #   "axis": "horizontal",
    #   "color": "#808080"
    # }

    # 3D-Model-Referenz (optional)
    model_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_machine_props_actuator', 'actuator_id'),
    )
```

### 📄 API-Endpoints

**Datei:** `api/v1/digital_twin.py` (NEU)

```python
"""
API-Endpoints für Digital-Twin-Daten

Frontend: 3D-Visualisierung (Three.js, Babylon.js)
"""

from fastapi import APIRouter, Depends
from typing import Dict
from uuid import UUID
from ...db.repositories.digital_twin_repo import DigitalTwinRepository
from ...db.repositories.sensor_repo import SensorRepository
from ...db.repositories.actuator_repo import ActuatorRepository
from ...schemas.digital_twin import DigitalTwinResponse
from ..deps import DBSession, ActiveUser

router = APIRouter(prefix="/v1/digital-twin", tags=["digital-twin"])


@router.get("/zones/{zone_id}", response_model=DigitalTwinResponse)
async def get_digital_twin(
    zone_id: UUID,
    db: DBSession,
    current_user: ActiveUser
):
    """
    Liefert alle Daten für 3D-Visualisierung einer Zone

    Frontend nutzt dies für:
    - Three.js Scene-Aufbau
    - Sensor/Aktor-Positionierung
    - Live-Daten-Overlay
    """
    digital_twin_repo = DigitalTwinRepository(db)
    sensor_repo = SensorRepository(db)
    actuator_repo = ActuatorRepository(db)

    # Get geometry
    geometry = await digital_twin_repo.get_zone_geometry(zone_id)
    if not geometry:
        raise HTTPException(404, "Zone geometry not found")

    # Get sensors with positions
    sensors = await sensor_repo.get_by_zone(zone_id)
    sensors_with_positions = []
    for sensor in sensors:
        position = geometry.sensor_positions.get(str(sensor.id))
        sensors_with_positions.append({
            "id": sensor.id,
            "gpio": sensor.gpio,
            "sensor_type": sensor.sensor_type,
            "position": position,
            "current_value": sensor.last_value  # Live-Data
        })

    # Get actuators with positions + machine properties
    actuators = await actuator_repo.get_by_zone(zone_id)
    actuators_with_positions = []
    for actuator in actuators:
        position = geometry.actuator_positions.get(str(actuator.id))
        machine_props = await digital_twin_repo.get_machine_properties(actuator.id)

        actuators_with_positions.append({
            "id": actuator.id,
            "gpio": actuator.gpio,
            "actuator_type": actuator.actuator_type,
            "position": position,
            "machine_properties": machine_props.properties if machine_props else {},
            "visualization": machine_props.visualization if machine_props else {},
            "current_state": actuator.current_value  # Live-Data
        })

    return DigitalTwinResponse(
        zone_id=zone_id,
        geometry=geometry,
        sensors=sensors_with_positions,
        actuators=actuators_with_positions
    )


@router.post("/zones/{zone_id}/geometry")
async def update_zone_geometry(
    zone_id: UUID,
    geometry_data: Dict,
    db: DBSession,
    current_user: ActiveUser
):
    """
    Aktualisiert Zone-Geometrie

    User kann via Frontend:
    - Vertices anpassen
    - Sensor/Aktor-Positionen setzen (Drag&Drop in 3D-View)
    """
    digital_twin_repo = DigitalTwinRepository(db)

    geometry = await digital_twin_repo.update_zone_geometry(
        zone_id=zone_id,
        vertices=geometry_data.get("vertices"),
        dimensions=geometry_data.get("dimensions"),
        sensor_positions=geometry_data.get("sensor_positions"),
        actuator_positions=geometry_data.get("actuator_positions")
    )

    return {"status": "success", "geometry_id": geometry.id}
```

### 📄 Frontend-Integration-Konzept

**3D-Visualisierung mit Three.js:**

```javascript
// Frontend: src/components/DigitalTwin3DView.vue

<template>
  <div ref="threeContainer" class="digital-twin-container"></div>
</template>

<script setup>
import * as THREE from 'three';
import { onMounted, ref } from 'vue';
import { useDigitalTwinStore } from '@/stores/digitalTwin';

const threeContainer = ref(null);
const digitalTwinStore = useDigitalTwinStore();

onMounted(async () => {
  // Fetch Digital-Twin-Daten
  const data = await digitalTwinStore.fetchDigitalTwin(zoneId);

  // Setup Three.js Scene
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, width/height, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer();

  // Render Zone-Geometrie
  const geometry = new THREE.BoxGeometry(
    data.geometry.dimensions.length,
    data.geometry.dimensions.height,
    data.geometry.dimensions.width
  );
  const material = new THREE.MeshBasicMaterial({ color: 0x808080, transparent: true, opacity: 0.3 });
  const zoneMesh = new THREE.Mesh(geometry, material);
  scene.add(zoneMesh);

  // Render Sensoren
  data.sensors.forEach(sensor => {
    const sensorMesh = createSensorMesh(sensor);
    sensorMesh.position.set(sensor.position.x, sensor.position.z, sensor.position.y);
    scene.add(sensorMesh);

    // Live-Data-Label
    const label = createTextLabel(sensor.current_value + " °C");
    label.position.copy(sensorMesh.position);
    scene.add(label);
  });

  // Render Aktoren (mit Animation)
  data.actuators.forEach(actuator => {
    const actuatorMesh = createActuatorMesh(actuator);
    actuatorMesh.position.set(actuator.position.x, actuator.position.z, actuator.position.y);
    scene.add(actuatorMesh);

    // Animation basierend auf current_state
    animateActuator(actuatorMesh, actuator);
  });

  // Render-Loop
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  // WebSocket: Live-Updates
  digitalTwinStore.subscribeToUpdates(zoneId, (update) => {
    // Update Sensor-Labels
    // Update Actuator-Animations
  });
});
</script>
```

### ✅ Phase 13 Prüfkriterien

**Tests:** `tests/api/test_digital_twin.py`

```python
@pytest.mark.asyncio
async def test_get_digital_twin():
    """Digital-Twin-Daten können abgerufen werden"""
    response = client.get(f"/api/v1/digital-twin/zones/{zone_id}")
    assert response.status_code == 200
    data = response.json()
    assert "geometry" in data
    assert "sensors" in data
    assert "actuators" in data


@pytest.mark.asyncio
async def test_update_geometry():
    """Zone-Geometrie kann aktualisiert werden"""
    response = client.post(
        f"/api/v1/digital-twin/zones/{zone_id}/geometry",
        json={
            "vertices": [[0,0,0], [10,0,0], [10,5,0], [0,5,0]],
            "dimensions": {"length": 10, "width": 5, "height": 3}
        }
    )
    assert response.status_code == 200
```

**Erfolgskriterium:**
- Zone-Geometrie kann gespeichert werden
- Sensor/Aktor-Positionen können gesetzt werden
- API liefert vollständige Digital-Twin-Daten
- Frontend kann 3D-Scene rendern
- Tests sind grün

---

## Phase 14: UI-Schema-Management (ERWEITERT)

### 🎯 Ziel
User kann **eigene Dashboards** erstellen: Tabs, Widgets, Layouts vollständig konfigurierbar.

### 📝 Kern-Problem
**Ohne UI-Schema:** Frontend ist statisch - User kann Layout nicht anpassen.

**Mit UI-Schema:** User erstellt eigene Dashboards - maximale Flexibilität.

### 📁 Neue Dateien

Keine neuen Backend-Dateien - hauptsächlich Database-Models und API-Endpoints.

### 📄 Database-Models (ERWEITERN)

**Datei:** `db/models/ai.py` (hinzufügen)

```python
"""
UI-Schema Models (Phase 14)
"""

class UILayout(Base):
    """
    User-definierte Frontend-Layouts

    User kann via Drag&Drop-Interface Dashboards erstellen
    """
    __tablename__ = "ui_layouts"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    layout_name: Mapped[str] = mapped_column(String(200), nullable=False)
    layout_type: Mapped[str] = mapped_column(String(50), default="dashboard")
    # "dashboard", "monitoring_view", "control_panel"

    # Layout-Schema (JSON-basiert)
    schema: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Beispiel:
    # {
    #   "tabs": [
    #     {
    #       "name": "Overview",
    #       "widgets": [
    #         {
    #           "type": "sensor_graph",
    #           "config": {"sensor_id": "uuid", "timerange": "24h"},
    #           "position": {"x": 0, "y": 0, "w": 6, "h": 4}
    #         },
    #         {
    #           "type": "actuator_control",
    #           "config": {"actuator_id": "uuid"},
    #           "position": {"x": 6, "y": 0, "w": 6, "h": 4}
    #         },
    #         {
    #           "type": "digital_twin_3d",
    #           "config": {"zone_id": "uuid"},
    #           "position": {"x": 0, "y": 4, "w": 12, "h": 8}
    #         },
    #         {
    #           "type": "ai_chat",
    #           "config": {"pipeline_id": "uuid"},
    #           "position": {"x": 0, "y": 12, "w": 12, "h": 6}
    #         }
    #       ]
    #     }
    #   ]
    # }

    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_ui_layout_user', 'user_id'),
    )


class WidgetTemplate(Base):
    """
    Vordefinierte Widget-Templates für User

    System liefert Widget-Typen, User konfiguriert Instanzen
    """
    __tablename__ = "widget_templates"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    widget_type: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    # "sensor_graph", "actuator_control", "digital_twin_3d", "ai_chat", etc.

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(String(1000), nullable=True)

    # Config-Schema (definiert welche Parameter User konfigurieren kann)
    config_schema: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Beispiel für "sensor_graph":
    # {
    #   "properties": {
    #     "sensor_id": {"type": "uuid", "required": true, "label": "Sensor"},
    #     "timerange": {"type": "select", "options": ["1h", "24h", "7d"], "default": "24h"},
    #     "chart_type": {"type": "select", "options": ["line", "bar"], "default": "line"}
    #   }
    # }

    # Default-Größe
    default_size: Mapped[dict] = mapped_column(JSON, default={"w": 6, "h": 4})

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

### 📄 API-Endpoints

**Datei:** `api/v1/ui_layouts.py` (NEU)

```python
"""
API-Endpoints für UI-Layout-Management

User erstellt Dashboards via Drag&Drop-Interface
"""

from fastapi import APIRouter, Depends
from typing import List
from uuid import UUID
from ...db.repositories.ui_layout_repo import UILayoutRepository
from ...schemas.ui_layout import (
    UILayoutCreate,
    UILayoutResponse,
    WidgetTemplateResponse
)
from ..deps import DBSession, ActiveUser

router = APIRouter(prefix="/v1/ui/layouts", tags=["ui-layouts"])


@router.get("/templates", response_model=List[WidgetTemplateResponse])
async def list_widget_templates(
    db: DBSession,
    current_user: ActiveUser
):
    """
    Liste verfügbarer Widget-Typen

    Frontend zeigt diese in Widget-Palette an
    """
    ui_repo = UILayoutRepository(db)
    templates = await ui_repo.get_all_widget_templates()
    return [WidgetTemplateResponse.from_db(t) for t in templates]


@router.post("/", response_model=UILayoutResponse)
async def create_layout(
    request: UILayoutCreate,
    db: DBSession,
    current_user: ActiveUser
):
    """
    Erstellt neues UI-Layout

    Frontend: User speichert Dashboard-Konfiguration
    """
    ui_repo = UILayoutRepository(db)

    layout = await ui_repo.create_layout(
        user_id=current_user.id,
        layout_name=request.name,
        layout_type=request.layout_type,
        schema=request.schema
    )

    return UILayoutResponse.from_db(layout)


@router.get("/", response_model=List[UILayoutResponse])
async def list_layouts(
    db: DBSession,
    current_user: ActiveUser
):
    """Liste aller User-Layouts"""
    ui_repo = UILayoutRepository(db)
    layouts = await ui_repo.get_by_user(current_user.id)
    return [UILayoutResponse.from_db(l) for l in layouts]


@router.get("/{layout_id}", response_model=UILayoutResponse)
async def get_layout(
    layout_id: UUID,
    db: DBSession,
    current_user: ActiveUser
):
    """Holt einzelnes Layout"""
    ui_repo = UILayoutRepository(db)
    layout = await ui_repo.get(layout_id)

    if not layout or layout.user_id != current_user.id:
        raise HTTPException(404, "Layout not found")

    return UILayoutResponse.from_db(layout)


@router.put("/{layout_id}", response_model=UILayoutResponse)
async def update_layout(
    layout_id: UUID,
    schema_update: Dict,
    db: DBSession,
    current_user: ActiveUser
):
    """
    Aktualisiert Layout-Schema

    Frontend: User verschiebt/löscht Widgets, Layout wird gespeichert
    """
    ui_repo = UILayoutRepository(db)

    layout = await ui_repo.update(layout_id, schema=schema_update)
    return UILayoutResponse.from_db(layout)
```

### 📄 Frontend-Integration-Konzept

**Dashboard-Builder mit Vuetify + GridLayout:**

```vue
<!-- Frontend: src/components/DashboardBuilder.vue -->

<template>
  <v-container fluid>
    <!-- Widget-Palette (Drag-Source) -->
    <v-navigation-drawer permanent>
      <v-list>
        <v-list-item
          v-for="template in widgetTemplates"
          :key="template.widget_type"
          draggable="true"
          @dragstart="onDragStart(template)"
        >
          <v-list-item-title>{{ template.name }}</v-list-item-title>
          <v-list-item-subtitle>{{ template.description }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <!-- Grid-Layout (Drop-Target) -->
    <grid-layout
      :layout="currentLayout"
      :col-num="12"
      :row-height="30"
      @layout-updated="onLayoutUpdated"
    >
      <grid-item
        v-for="widget in currentLayout"
        :key="widget.i"
        :x="widget.x"
        :y="widget.y"
        :w="widget.w"
        :h="widget.h"
      >
        <!-- Dynamisches Widget-Rendering -->
        <component
          :is="getWidgetComponent(widget.type)"
          :config="widget.config"
          @delete="removeWidget(widget.i)"
        />
      </grid-item>
    </grid-layout>

    <!-- Speichern-Button -->
    <v-btn @click="saveLayout">Layout speichern</v-btn>
  </v-container>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import GridLayout from 'vue-grid-layout';
import { useUILayoutStore } from '@/stores/uiLayout';

// Widget-Components (dynamisch importiert)
import SensorGraphWidget from './widgets/SensorGraphWidget.vue';
import ActuatorControlWidget from './widgets/ActuatorControlWidget.vue';
import DigitalTwin3DWidget from './widgets/DigitalTwin3DWidget.vue';
import AIChatWidget from './widgets/AIChatWidget.vue';

const uiLayoutStore = useUILayoutStore();
const widgetTemplates = ref([]);
const currentLayout = ref([]);

onMounted(async () => {
  // Load Widget-Templates
  widgetTemplates.value = await uiLayoutStore.fetchWidgetTemplates();

  // Load User-Layout (oder default)
  const layout = await uiLayoutStore.fetchUserLayout(userId);
  currentLayout.value = layout.schema.tabs[0].widgets;
});

function onDragStart(template) {
  // Store template for drop-handler
  draggedTemplate = template;
}

function onLayoutUpdated(newLayout) {
  currentLayout.value = newLayout;
}

async function saveLayout() {
  await uiLayoutStore.updateLayout(layoutId, {
    schema: {
      tabs: [{ name: "Main", widgets: currentLayout.value }]
    }
  });
}

function getWidgetComponent(widgetType) {
  const components = {
    'sensor_graph': SensorGraphWidget,
    'actuator_control': ActuatorControlWidget,
    'digital_twin_3d': DigitalTwin3DWidget,
    'ai_chat': AIChatWidget
  };
  return components[widgetType];
}
</script>
```

### ✅ Phase 14 Prüfkriterien

**Tests:** `tests/api/test_ui_layouts.py`

```python
@pytest.mark.asyncio
async def test_create_layout():
    """UI-Layout kann erstellt werden"""
    response = client.post(
        "/api/v1/ui/layouts",
        json={
            "name": "My Dashboard",
            "layout_type": "dashboard",
            "schema": {"tabs": [{"name": "Main", "widgets": []}]}
        }
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_update_layout():
    """Layout kann aktualisiert werden"""
    response = client.put(
        f"/api/v1/ui/layouts/{layout_id}",
        json={
            "schema": {"tabs": [{"name": "Main", "widgets": [...]}]}
        }
    )
    assert response.status_code == 200
```

**Erfolgskriterium:**
- Widget-Templates können abgerufen werden
- User-Layouts können erstellt/aktualisiert werden
- Frontend kann Dashboards rendern
- Drag&Drop-Interface funktioniert
- Tests sind grün

---

## Phase 15: Conversation-Workflows (ERWEITERT)

### 🎯 Ziel
**Multi-Step AI-Interaktionen**: AI stellt Follow-up-Fragen, sammelt Informationen über mehrere Schritte, führt komplexe Workflows aus.

### 📝 Kern-Problem
**Ohne Conversations:** AI kann nur single-shot Requests verarbeiten - keine Dialoge.

**Mit Conversations:** AI führt intelligente Dialoge - sammelt Kontext, stellt Rückfragen, leitet User durch Prozesse.

### 📁 Neue Dateien

1. `src/ai/workflows/__init__.py`
2. `src/ai/workflows/workflow_engine.py`
3. `src/ai/workflows/workflow_templates/base_workflow.py`
4. `src/ai/workflows/workflow_templates/context_change_workflow.py`

### 📄 Implementation: Workflow-Engine

**Datei:** `ai/workflows/workflow_engine.py`

**Vorbild:** PipelineEngine
**Referenz:** Phase 6

```python
"""
Workflow-Engine für Multi-Step AI-Conversations

Ähnlich zu: PipelineEngine
Referenz: ai/pipeline/pipeline_engine.py
"""

from typing import Dict, Optional, List
from uuid import UUID
from ...db.repositories.context_repo import ContextRepository
from ...db.models.ai import ConversationState, AIContext
from ...services.ai_service import AIService
from ...websocket.manager import WebSocketManager
from ...core.logging_config import get_logger

logger = get_logger(__name__)


class WorkflowEngine:
    """
    Orchestrator für Multi-Step AI-Conversations

    Ähnlich zu: PipelineEngine (aber für dialogbasierte Workflows)
    """

    def __init__(
        self,
        context_repo: ContextRepository,
        ai_service: AIService,
        websocket_manager: WebSocketManager
    ):
        self.context_repo = context_repo
        self.ai_service = ai_service
        self.websocket_manager = websocket_manager
        self._workflows: Dict[str, "BaseWorkflow"] = {}  # workflow_type → workflow_class

    def register_workflow(self, workflow_type: str, workflow_class):
        """
        Registriert Workflow-Template

        Ähnlich zu: Plugin-Registry
        """
        self._workflows[workflow_type] = workflow_class
        logger.info(f"Workflow registriert: {workflow_type}")

    async def start_workflow(
        self,
        user_id: UUID,
        zone_id: Optional[UUID],
        workflow_type: str,
        initial_data: Dict
    ) -> UUID:
        """
        Startet neuen Conversation-Workflow

        Args:
            user_id: User-UUID
            zone_id: Zone-UUID (optional)
            workflow_type: Workflow-Typ (z.B. "context_change")
            initial_data: Initial-Daten (z.B. {"new_context": "..."}

        Returns:
            Conversation-UUID
        """
        # Get/Create Context
        context = await self.context_repo.get_or_create_context(
            user_id=user_id,
            zone_id=zone_id,
            context_type=workflow_type
        )

        # Get Workflow-Template
        if workflow_type not in self._workflows:
            raise ValueError(f"Unknown workflow type: {workflow_type}")

        workflow_class = self._workflows[workflow_type]
        workflow = workflow_class(self.ai_service, self.websocket_manager)

        # Create Conversation-State
        conversation = await self.context_repo.create_conversation(
            context_id=context.id,
            workflow_type=workflow_type,
            total_steps=workflow.get_total_steps(),
            collected_data=initial_data
        )

        # Start Workflow: Generate first questions
        questions = await workflow.generate_questions(
            step=0,
            collected_data=initial_data,
            context=context
        )

        # Update Conversation
        await self.context_repo.update_conversation(
            conversation.id,
            pending_questions=questions,
            messages=[
                {
                    "role": "ai",
                    "content": questions,
                    "timestamp": datetime.utcnow().isoformat()
                }
            ]
        )

        # Send to User via WebSocket
        await self.websocket_manager.send_to_user(user_id, {
            "type": "conversation_started",
            "conversation_id": str(conversation.id),
            "workflow_type": workflow_type,
            "questions": questions
        })

        logger.info(f"Workflow gestartet: {workflow_type} (Conversation: {conversation.id})")
        return conversation.id

    async def handle_user_answer(
        self,
        conversation_id: UUID,
        answers: Dict[str, any]
    ):
        """
        Verarbeitet User-Antworten

        Args:
            conversation_id: Conversation-UUID
            answers: User-Antworten (field_name → value)
        """
        # Get Conversation
        conversation = await self.context_repo.get_conversation(conversation_id)
        if not conversation or conversation.status != "active":
            logger.error(f"Conversation {conversation_id} nicht gefunden oder nicht aktiv")
            return

        # Get Workflow
        workflow_class = self._workflows[conversation.workflow_type]
        workflow = workflow_class(self.ai_service, self.websocket_manager)

        # Update collected data
        collected_data = conversation.collected_data or {}
        collected_data.update(answers)

        # Update messages
        messages = conversation.messages or []
        messages.append({
            "role": "user",
            "content": answers,
            "timestamp": datetime.utcnow().isoformat()
        })

        # Check if workflow is complete
        current_step = conversation.current_step + 1

        if current_step >= conversation.total_steps:
            # Workflow complete: Execute final action
            context = await self.context_repo.get_context(conversation.context_id)
            result = await workflow.execute_final_action(collected_data, context)

            # Update Conversation
            await self.context_repo.update_conversation(
                conversation.id,
                status="completed",
                completed_at=datetime.utcnow(),
                collected_data=collected_data,
                messages=messages
            )

            # Notify User
            await self.websocket_manager.send_to_user(conversation.user_id, {
                "type": "conversation_completed",
                "conversation_id": str(conversation.id),
                "result": result
            })

            logger.info(f"Workflow abgeschlossen: {conversation.workflow_type}")

        else:
            # Generate next questions
            context = await self.context_repo.get_context(conversation.context_id)
            next_questions = await workflow.generate_questions(
                step=current_step,
                collected_data=collected_data,
                context=context
            )

            # Update Conversation
            messages.append({
                "role": "ai",
                "content": next_questions,
                "timestamp": datetime.utcnow().isoformat()
            })

            await self.context_repo.update_conversation(
                conversation.id,
                current_step=current_step,
                pending_questions=next_questions,
                collected_data=collected_data,
                messages=messages
            )

            # Send to User
            await self.websocket_manager.send_to_user(conversation.user_id, {
                "type": "conversation_update",
                "conversation_id": str(conversation.id),
                "questions": next_questions,
                "step": current_step,
                "total_steps": conversation.total_steps
            })

            logger.debug(f"Workflow-Schritt {current_step}/{conversation.total_steps}")


# Global accessor
_workflow_engine_instance: Optional[WorkflowEngine] = None

def get_workflow_engine() -> WorkflowEngine:
    global _workflow_engine_instance
    if not _workflow_engine_instance:
        raise RuntimeError("WorkflowEngine nicht initialisiert")
    return _workflow_engine_instance

def set_workflow_engine(engine: WorkflowEngine):
    global _workflow_engine_instance
    _workflow_engine_instance = engine
```

### 📄 Implementation: Base-Workflow

**Datei:** `ai/workflows/workflow_templates/base_workflow.py`

```python
"""
Base-Workflow für Multi-Step-Conversations

Ähnlich zu: BaseAIPlugin
"""

from abc import ABC, abstractmethod
from typing import Dict, List


class BaseWorkflow(ABC):
    """
    Abstract Base Class für Conversation-Workflows

    Subclasses definieren:
    - Anzahl Schritte
    - Fragen pro Schritt
    - Final-Action
    """

    def __init__(self, ai_service, websocket_manager):
        self.ai_service = ai_service
        self.websocket_manager = websocket_manager

    @abstractmethod
    def get_total_steps(self) -> int:
        """Anzahl Workflow-Schritte"""
        pass

    @abstractmethod
    async def generate_questions(
        self,
        step: int,
        collected_data: Dict,
        context: "AIContext"
    ) -> List[Dict]:
        """
        Generiert Fragen für aktuellen Schritt

        Args:
            step: Aktueller Schritt (0-indexed)
            collected_data: Bereits gesammelte Daten
            context: AI-Context

        Returns:
            Liste von Questions:
            [
                {
                    "field": "field_name",
                    "question": "Question text?",
                    "type": "text|number|select|date",
                    "options": [...],  # Nur bei type="select"
                    "validation": {...}
                }
            ]
        """
        pass

    @abstractmethod
    async def execute_final_action(
        self,
        collected_data: Dict,
        context: "AIContext"
    ) -> Dict:
        """
        Führt Final-Action aus (nach allen Schritten)

        Args:
            collected_data: Alle gesammelten Daten
            context: AI-Context

        Returns:
            Result-Dict (wird an User gesendet)
        """
        pass
```

### 📄 Implementation: Context-Change-Workflow (Beispiel)

**Datei:** `ai/workflows/workflow_templates/context_change_workflow.py`

**Generisches Beispiel - NICHT spezifisch für Anbau!**

```python
"""
Context-Change-Workflow: User ändert Context-Parameter

Generisches Beispiel für Workflow-Implementierung
"""

from typing import Dict, List
from .base_workflow import BaseWorkflow
from ....db.models.ai import AIContext


class ContextChangeWorkflow(BaseWorkflow):
    """
    Multi-Step-Workflow für Context-Änderungen

    Schritte:
    1. AI fragt nach neuen Context-Parametern
    2. AI fragt nach Präferenzen/Constraints
    3. AI berechnet optimale Konfiguration
    4. AI präsentiert Empfehlung, User bestätigt
    """

    def get_total_steps(self) -> int:
        return 3

    async def generate_questions(
        self,
        step: int,
        collected_data: Dict,
        context: AIContext
    ) -> List[Dict]:
        """Generiert Fragen basierend auf Schritt"""

        if step == 0:
            # Step 1: Neue Context-Parameter
            return [
                {
                    "field": "new_context_type",
                    "question": "What type of context change do you want to make?",
                    "type": "text",
                    "validation": {"required": True}
                },
                {
                    "field": "target_parameters",
                    "question": "Which parameters should be adjusted?",
                    "type": "multiselect",
                    "options": self._get_available_parameters(context)
                }
            ]

        elif step == 1:
            # Step 2: Präferenzen/Constraints
            # AI analysiert collected_data und generiert spezifische Fragen
            target_params = collected_data.get("target_parameters", [])
            questions = []

            for param in target_params:
                questions.append({
                    "field": f"{param}_target_value",
                    "question": f"What's your target value for {param}?",
                    "type": "number"
                })
                questions.append({
                    "field": f"{param}_constraints",
                    "question": f"Any constraints for {param}? (e.g., max, min, range)",
                    "type": "text"
                })

            return questions

        elif step == 2:
            # Step 3: AI berechnet Empfehlung (via Knowledge-Base + AI-Service)
            recommendation = await self._calculate_recommendation(collected_data, context)

            return [
                {
                    "field": "confirmation",
                    "question": f"Based on your input, I recommend: {recommendation}. Proceed?",
                    "type": "select",
                    "options": ["yes", "no", "modify"]
                }
            ]

        return []

    async def execute_final_action(
        self,
        collected_data: Dict,
        context: AIContext
    ) -> Dict:
        """Führt Context-Änderung aus"""

        if collected_data.get("confirmation") != "yes":
            return {"status": "cancelled", "message": "User cancelled workflow"}

        # Update Context
        new_state = self._build_new_state(collected_data, context)

        from ....ai.context.context_manager import get_context_manager
        context_manager = get_context_manager()

        await context_manager.update_state(
            context_id=context.id,
            state_updates=new_state,
            add_to_history=True
        )

        # Optionally: Trigger actuator updates, notifications, etc.

        return {
            "status": "success",
            "message": "Context successfully updated",
            "new_state": new_state
        }

    def _get_available_parameters(self, context: AIContext) -> List[str]:
        """Holt verfügbare Parameter aus Context"""
        # Generisch: Schau in current_state welche Keys existieren
        return list(context.current_state.keys()) if context.current_state else []

    async def _calculate_recommendation(self, collected_data: Dict, context: AIContext) -> str:
        """Nutzt AI + Knowledge-Base für Empfehlung"""

        # Get Knowledge-Base
        from ....ai.knowledge.knowledge_manager import get_knowledge_manager
        knowledge_manager = get_knowledge_manager()

        knowledge = await knowledge_manager.get_for_context(
            {"context_type": context.context_type, "current_state": context.current_state}
        )

        # Build AI-Prompt
        prompt = f"""
        User wants to change context parameters.
        Current Context: {context.current_state}
        Requested Changes: {collected_data}
        Available Knowledge: {knowledge}

        Please recommend optimal configuration.
        """

        # AI-Request
        result = await self.ai_service.process_request(
            plugin_id="chat_interface",
            input_data={"prompt": prompt}
        )

        return result.get("text", "No recommendation available")

    def _build_new_state(self, collected_data: Dict, context: AIContext) -> Dict:
        """Baut neuen State aus collected_data"""
        new_state = context.current_state.copy() if context.current_state else {}

        # Update mit target_values
        for key, value in collected_data.items():
            if key.endswith("_target_value"):
                param_name = key.replace("_target_value", "")
                new_state[param_name] = value

        return new_state
```

### 📄 API-Endpoints

**Datei:** `api/v1/conversations.py` (NEU)

```python
"""
API-Endpoints für Conversation-Workflows

Frontend: Chat-Interface, Wizard-Dialoge
"""

from fastapi import APIRouter, Depends
from typing import Dict
from uuid import UUID
from ...ai.workflows.workflow_engine import get_workflow_engine
from ...schemas.conversation import (
    ConversationStartRequest,
    ConversationAnswerRequest,
    ConversationResponse
)
from ..deps import DBSession, ActiveUser

router = APIRouter(prefix="/v1/conversations", tags=["conversations"])


@router.post("/start", response_model=ConversationResponse)
async def start_conversation(
    request: ConversationStartRequest,
    db: DBSession,
    current_user: ActiveUser
):
    """
    Startet neuen Conversation-Workflow

    Frontend: User triggert Workflow (z.B. "Change Context" Button)
    """
    workflow_engine = get_workflow_engine()

    conversation_id = await workflow_engine.start_workflow(
        user_id=current_user.id,
        zone_id=request.zone_id,
        workflow_type=request.workflow_type,
        initial_data=request.initial_data
    )

    return ConversationResponse(
        conversation_id=conversation_id,
        status="active"
    )


@router.post("/{conversation_id}/answer")
async def answer_questions(
    conversation_id: UUID,
    request: ConversationAnswerRequest,
    current_user: ActiveUser
):
    """
    User beantwortet AI-Fragen

    Frontend: User füllt Formular aus, sendet Antworten
    """
    workflow_engine = get_workflow_engine()

    await workflow_engine.handle_user_answer(
        conversation_id=conversation_id,
        answers=request.answers
    )

    return {"status": "success"}
```

### ✅ Phase 15 Prüfkriterien

**Tests:** `tests/ai/test_workflow_engine.py`

```python
@pytest.mark.asyncio
async def test_start_workflow():
    """Workflow kann gestartet werden"""
    conversation_id = await workflow_engine.start_workflow(
        user_id=user_uuid,
        zone_id=zone_uuid,
        workflow_type="context_change",
        initial_data={"new_context": "test"}
    )
    assert conversation_id is not None


@pytest.mark.asyncio
async def test_multi_step_conversation():
    """Multi-Step-Conversation funktioniert"""
    # Start
    conv_id = await workflow_engine.start_workflow(...)

    # Step 1: Answer questions
    await workflow_engine.handle_user_answer(conv_id, {"field1": "value1"})

    # Verify: Conversation updated, next questions generated
    conv = await context_repo.get_conversation(conv_id)
    assert conv.current_step == 1
    assert len(conv.pending_questions) > 0

    # Step 2: Complete workflow
    await workflow_engine.handle_user_answer(conv_id, {"field2": "value2", "confirmation": "yes"})

    # Verify: Workflow completed
    conv = await context_repo.get_conversation(conv_id)
    assert conv.status == "completed"
```

**Erfolgskriterium:**
- Workflows können gestartet werden
- AI generiert dynamische Fragen
- User-Antworten werden verarbeitet
- Final-Action wird ausgeführt
- WebSocket-Updates funktionieren
- Tests sind grün

---

## 🎉 MVP-Fertigstellung (Phase 1-9)

Nach Phase 9 ist das **Kern-System** einsatzbereit:

✅ User kann beliebige AI-Services einbinden (OpenAI, Ollama, Custom)
✅ User kann Pipelines via Web-UI erstellen
✅ System orchestriert Datenfluss: ESP → AI → Aktion
✅ Permission-System schützt vor ungewollten AI-Aktionen
✅ Modular, industrietauglich, flexibel, robust

**Nächste Schritte:** Erweiterte Features (Phasen 10-15) für fortgeschrittene Use Cases.

---

## 🚀 Erweiterte Features (Phase 10-15)

Nach Phase 15 ist das System **vollständig ausgebaut**:

### Phase 10-11: Intelligente AI
✅ **Context-System**: AI "erinnert sich" an User-Präferenzen, Zone-Zustände, Historien
✅ **Knowledge-Base**: AI nutzt strukturierte Wissensdaten für fundierte Empfehlungen
- AI-Entscheidungen sind kontextabhängig und wissenschaftlich fundiert
- User kann eigene Knowledge-Einträge erstellen

### Phase 12: Live-Daten-Integration
✅ **External-Data-Connectors**: AI berücksichtigt Energiepreise, Wetter, Marktdaten
- User kann beliebige REST-APIs einbinden
- Automatisches Caching für Performance
- Use Case: Optimierung basierend auf Energie-Preis-Prognosen

### Phase 13-14: Moderne UI
✅ **Digital Twin**: Realitätsgetreue 3D-Visualisierung von Räumen und Maschinen
✅ **UI-Schema-Management**: User erstellt eigene Dashboards via Drag&Drop
- Three.js-basierte 3D-Darstellung mit Live-Daten
- Vollständig konfigurierbare Layouts und Widgets

### Phase 15: Dialogbasierte AI
✅ **Conversation-Workflows**: Multi-Step AI-Interaktionen mit Follow-up-Fragen
- AI leitet User durch komplexe Prozesse
- Workflow-basierte Dialoge für Context-Änderungen, Troubleshooting, Setup

**Status:** System ist **production-ready** mit allen Advanced-Features!

---

## Anhang: main.py Integration

### MVP-Version (Phasen 1-9)

**Datei:** `src/main.py` (lifespan-Funktion erweitern)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ===== STARTUP =====

    # ... bestehender Code (Database, MQTT, WebSocket) ...

    # ===== AI-INTEGRATION (MVP) =====
    logger.info("Initialisiere AI-Integration (MVP)...")

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

    logger.info("AI-Integration (MVP) vollständig initialisiert")

    yield  # Server runs

    # ===== SHUTDOWN =====
    await ai_service.shutdown()
    await service_registry.shutdown()

    # ... bestehender Shutdown-Code ...
```

### Erweiterte Version (Phasen 10-15)

**Zusätzliche Initialisierung für erweiterte Features:**

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ===== STARTUP =====

    # ... MVP-Code (siehe oben) ...

    # ===== ERWEITERTE FEATURES (Phasen 10-15) =====
    logger.info("Initialisiere erweiterte AI-Features...")

    async for session in get_session():
        context_repo = ContextRepository(session)
        knowledge_repo = KnowledgeRepository(session)

        # Phase 10: Context-Manager
        context_manager = ContextManager(context_repo)
        set_context_manager(context_manager)

        # Phase 11: Knowledge-Manager
        knowledge_manager = KnowledgeManager(knowledge_repo)
        set_knowledge_manager(knowledge_manager)

        # Phase 15: Workflow-Engine
        workflow_engine = WorkflowEngine(context_repo, ai_service, _websocket_manager)

        # Register Workflows
        from src.ai.workflows.workflow_templates.context_change_workflow import ContextChangeWorkflow
        workflow_engine.register_workflow("context_change", ContextChangeWorkflow)
        # ... weitere Workflows registrieren ...

        set_workflow_engine(workflow_engine)

        break

    logger.info("Erweiterte AI-Features vollständig initialisiert")

    yield  # Server runs

    # ===== SHUTDOWN =====
    # ... MVP-Shutdown + keine zusätzlichen Shutdowns nötig ...
```

### Router-Registrierung (Erweitert)

**Datei:** `src/main.py` (nach API-Router-Setup)

```python
# MVP-Routers
app.include_router(ai_services_router, prefix="/api")  # Phase 8
app.include_router(pipelines_router, prefix="/api")    # Phase 8

# Erweiterte Routers (Phasen 10-15)
if ENABLE_ADVANCED_FEATURES:  # Feature-Flag
    app.include_router(digital_twin_router, prefix="/api")  # Phase 13
    app.include_router(ui_layouts_router, prefix="/api")    # Phase 14
    app.include_router(conversations_router, prefix="/api") # Phase 15
```

---

**Version:** 3.0 (Komplett)
**Status:** Production-Ready with Advanced Features
**Letzte Änderung:** 2025-12-10

> **Änderungen in v3.0:**
> - Phasen 10-15 hinzugefügt (Context, Knowledge-Base, External-Data, Digital-Twin, UI-Schema, Conversations)
> - Generische Formulierung für beliebige Use Cases (keine spezifischen Beispiele wie "Gurke→Tomate")
> - Vollständige Code-Beispiele für alle erweiterten Phasen
> - main.py Integration für MVP und erweiterte Version
> - Prüfkriterien und Tests für alle Phasen
> - Gesamtdauer: 38-51 Tage (MVP: 23-30 Tage, Erweitert: 15-21 Tage)
