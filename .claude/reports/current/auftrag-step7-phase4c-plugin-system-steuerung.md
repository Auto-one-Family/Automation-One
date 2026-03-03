# STEP 7: Phase 4C — Plugin-System & Steuerung

> **Erstellt:** 2026-03-03
> **Typ:** Implementierung (Code-Aenderungen im auto-one Repo)
> **Ziel-Repo:** `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
> **Vorgaenger:** STEP 0-6 ERLEDIGT (Phase 4A KOMPLETT + Phase 4B Unified Alert Center)
> **Voraussetzung:** Phase 4B fertig + `auftrag-logic-engine-volltest.md` (STEP 3 Prerequisite) fertig
> **Geschaetzter Aufwand:** ~15-20h (4 Bloecke)
> **Prioritaet:** HOCH — Naechster logischer Schritt nach Phase 4B
> **Referenz-Plan:** `auto-one/.claude/reports/current/testrun-phasen/PHASE_4_INTEGRATION copy.md` (Abschnitt Phase 4C)

---

## KORREKTUREN (verify-plan, 2026-03-03)

> **22 Diskrepanzen** gefunden. Ohne diese Korrekturen ist der Plan NICHT ausfuehrbar.
> Dev-Agents MUESSEN diese Sektion VOR der Implementierung lesen.

### KRITISCH — Bricht den Build

| # | Kategorie | Plan sagt | System sagt | Fix |
|---|-----------|-----------|-------------|-----|
| K1 | **Enum-Name** | `PluginCapability` | `PluginCapability` (singular, str Enum) | Ueberall `PluginCapability` → `PluginCapability` ersetzen |
| K2 | **execute() Signatur** | `execute()` ohne Parameter, Plan will `context: PluginContext \| None = None` ergaenzen | `async def execute(self, context: "AutoOpsContext", client: "GodKaiserClient") -> PluginResult` — Plugins nehmen BEREITS context + client | PluginContext-Konzept ueberdenken: Entweder AutoOpsContext erweitern ODER einen Web-Kontext-Wrapper bauen der AutoOpsContext + GodKaiserClient intern nutzt. execute()-Signatur NICHT aendern. |
| K3 | **AutoOpsContext existiert bereits** | Plan erstellt neue `PluginContext` Dataclass in `base_plugin.py` | Reiche `AutoOpsContext` existiert bereits in `autoops/core/context.py` mit device_mode, esp_specs, system_snapshot, session tracking etc. | `PluginContext` als SEPARATE Dataclass (fuer Web/API-Kontext) neben AutoOpsContext implementieren. In `PluginService.execute_plugin()` den PluginContext in AutoOpsContext + GodKaiserClient uebersetzen. |
| K4 | **PluginRegistry.get_all()** | Gibt `dict[str, AutoOpsPlugin]` zurueck, Code nutzt `.items()` | Gibt `list[AutoOpsPlugin]` zurueck | `sync_registry_to_db()` muss `for plugin in self.registry.get_all():` nutzen, Plugin-ID ueber `plugin.name` Property holen |
| K5 | **PluginRegistry.register()** | `register(plugin_class: Type[AutoOpsPlugin])` | `register(plugin: AutoOpsPlugin)` — nimmt Instanz, nicht Klasse | PluginService Code anpassen |
| K6 | **GodKaiserClient fehlt** | Plan erwaehnt GodKaiserClient NICHT | Jedes `plugin.execute()` braucht `client: GodKaiserClient` als 2. Parameter | `PluginService` muss GodKaiserClient instanziieren (aus `autoops/core/api_client.py`). Bei Web-Trigger: Client mit Server-URL + Auth-Token erstellen. |
| K7 | **Frontend Store Pfad** | `El Frontend/src/stores/plugins.store.ts` | Alle shared Stores liegen in `El Frontend/src/shared/stores/` | Pfad: `El Frontend/src/shared/stores/plugins.store.ts`. Re-Export in `El Frontend/src/shared/stores/index.ts` ergaenzen. |
| K8 | **Frontend API Import** | `import api from '@/api'  // [K8] Default Export aus index.ts` | Default Export aus `index.ts`: `import api from './index'` oder `import api from '@/api'` | Alle API-Client Imports auf `import api from '@/api'` aendern (Pattern wie in `logic.ts`) |
| K9 | **RuleConfigPanel Pfad** | `El Frontend/src/components/logic/RuleConfigPanel.vue` | `El Frontend/src/components/rules/RuleConfigPanel.vue` | Pfad korrigieren. Ordner heisst `rules`, nicht `logic`. |
| K10 | **Router Prefix DOPPELT** | `APIRouter(prefix="/v1/plugins")` | `api_v1_router` ist bereits unter `/api/v1/` gemountet | Prefix auf `"/plugins"` aendern (ohne `/v1/`), sonst entsteht `/api/v1/v1/plugins/` |
| K11 | **Action-Validierung Pfad** | `El Servador/.../src/schemas/logic.py` fuer `VALID_ACTION_TYPES` | Validierung liegt in `src/db/models/logic_validation.py` → `validate_action()` mit if/elif Chain + `ActionType` Union | Neuen `plugin` Action-Typ in `logic_validation.py` ergaenzen, NICHT in `schemas/logic.py` |
| K12 | **Startup Pattern** | `@app.on_event("startup")` mit `get_db_session()` | Moderner FastAPI `lifespan()` Contextmanager in `main.py`. Session-Factory heisst `get_session()` | Plugin-Registry-Sync in `lifespan()` Funktion in `main.py` integrieren. `get_session()` statt `get_db_session()` nutzen. |

### WICHTIG — Logik-Fehler

| # | Kategorie | Plan sagt | System sagt | Fix |
|---|-----------|-----------|-------------|-----|
| W1 | **SequenceActionExecutor fehlt** | 3 existierende Executors (Actuator, Delay, Notification) | 4 Executors — `SequenceActionExecutor` existiert bereits | In Plan-Code `action_executors = [...]` auch SequenceActionExecutor auffuehren. PluginActionExecutor wird 5. Executor. |
| W2 | **LogicEngine Constructor** | "In `LogicEngine.__init__()` den neuen Executor registrieren" | LogicEngine nimmt `action_executors` als PARAMETER — Executor-Liste wird in `main.py` Step 6 gebaut und uebergeben | PluginActionExecutor in `main.py` Step 6 erstellen und in `action_executors` Liste einfuegen, NICHT in `logic_engine.py` |
| W3 | **HysteresisConditionEvaluator** | Plan listet nur SensorConditionEvaluator + TimeConditionEvaluator | 3 Evaluators + Compound: Sensor, Time, **Hysteresis**, Compound | Fuer Plan-Referenz: HysteresisConditionEvaluator existiert bereits, ist in `main.py` registriert |
| W4 | **DB Base Import** | `from src.db.base import Base` (absoluter Import) | Projekt nutzt relative Imports: `from ..base import Base, TimestampMixin` | Relative Imports nutzen. Ausserdem `TimestampMixin` fuer `updated_at` verwenden. |
| W5 | **SystemMonitorView Tabs** | "Neuer Tab Plugins im SystemMonitorView" | Tabs: `'events' \| 'logs' \| 'database' \| 'mqtt' \| 'health'` (TabId in `types.ts`). SystemMonitor ist Event-Monitoring, nicht Plugin-Management. | Plugins als **separaten View** (`PluginsView.vue`) oder als Tab im Settings erstellen. Alternativ Tab in SystemMonitor moeglich, erfordert dann `types.ts` + `MonitorTabs.vue` Anpassung. Entscheidung: Dev-Agent soll separaten View bevorzugen. |
| W6 | **RuleConfigPanel Action-Types** | `const actionTypes = [{value: 'actuator_command', label: 'Aktor steuern'}, ...]` | RuleConfigPanel nutzt `nodeTypeLabels` Record, kein separates `actionTypes` Array. Actions werden ueber Node-basiertes Config-System gesteuert. | Dev-Agent muss den Node-System-Pattern analysieren und Plugin-Action dort integrieren (nicht als einfaches Dropdown-Array). |
| W7 | **PluginResult Serialisierung** | `'actions': [a.__dict__ for a in result.actions]` | `PluginAction` hat `severity: ActionSeverity` (Enum) — `__dict__` wuerde Enum-Objekte nicht korrekt serialisieren | Eigene Serialisierung mit `dataclasses.asdict()` oder manuellem dict mit `.value` fuer Enums nutzen |

### HINWEISE — Ergaenzungen

| # | Kategorie | Detail |
|---|-----------|--------|
| H1 | **reporter.py + profile_validator.py** | Existieren in `autoops/core/` — Plan erwaehnt sie nicht. Keine Aenderung noetig, aber bei Imports beachten. |
| H2 | **context.py API-Client** | `autoops/core/api_client.py` enthaelt `GodKaiserClient` mit vollem REST-Client (httpx, retry, auth). PluginService MUSS diesen nutzen. |
| H3 | **Logic Frontend Types** | `LogicAction` Union in `types/logic.ts` hat KEIN `SequenceAction` Interface im Frontend (obwohl Backend es hat). Plugin-Action hinzufuegen ist konsistent mit dem Pattern. |

### Korrigierte Kern-Signaturen (Referenz fuer Dev-Agent)

**AutoOpsPlugin.execute() — ECHTE Signatur (NICHT aendern):**
```python
# base_plugin.py — AKTUELLE Signatur
class AutoOpsPlugin(ABC):
    @abstractmethod
    async def execute(
        self,
        context: "AutoOpsContext",     # aus autoops/core/context.py
        client: "GodKaiserClient",     # aus autoops/core/api_client.py
    ) -> PluginResult:
        ...
```

**PluginRegistry.get_all() — ECHTE Signatur:**
```python
def get_all(self) -> list[AutoOpsPlugin]:
    """Get all registered plugins."""
    return list(self._plugins.values())
```

**PluginRegistry._plugins — ECHTE Struktur:**
```python
_plugins: dict[str, AutoOpsPlugin]  # key = plugin.name, value = Plugin-Instanz
```

**Korrigierter PluginService.sync_registry_to_db():**
```python
async def sync_registry_to_db(self) -> None:
    for plugin in self.registry.get_all():  # list, nicht dict
        plugin_id = plugin.name  # .name Property ist die ID
        existing = await self.db.get(PluginConfig, plugin_id)
        if not existing:
            config = PluginConfig(
                plugin_id=plugin_id,
                display_name=getattr(plugin, '_display_name', plugin.name),
                description=plugin.description,  # .description ist @property
                category=getattr(plugin, '_category', 'monitoring'),
                config_schema=getattr(plugin, '_config_schema', {}),
                capabilities=[c.value for c in plugin.capabilities],
            )
            self.db.add(config)
    await self.db.flush()
```

**Korrigierter PluginService.execute_plugin():**
```python
async def execute_plugin(
    self, plugin_id: str, user_id: int | None, plugin_context: PluginContext
) -> PluginExecution:
    plugin = self.registry.get(plugin_id)
    if not plugin:
        raise PluginNotFoundError(plugin_id)
    # ...
    # AutoOpsContext + GodKaiserClient bauen fuer plugin.execute()
    autoops_context = AutoOpsContext(
        server_url="http://localhost:8000",
        device_mode=DeviceMode.MOCK,
    )
    client = GodKaiserClient(autoops_context.server_url)
    await client.authenticate()  # Service-Account oder User-Token

    result = await plugin.execute(autoops_context, client)
    # ...
```

**Korrigierter Frontend API-Client Import:**
```typescript
// plugins.ts — KORREKTER Import
import api from '@/api'  // Default Export, NICHT { api } from './base'
```

**Korrigierter Router Prefix:**
```python
# plugins.py — KORREKTER Prefix (OHNE /v1/)
router = APIRouter(prefix="/plugins", tags=["plugins"])
```

**Korrigierte Startup-Integration (main.py lifespan()):**
```python
# In main.py lifespan() Funktion, NACH Step 6 (Services):
# Step X: Plugin Registry mit DB synchronisieren
from .services.plugin_service import PluginService
from .autoops.core.plugin_registry import PluginRegistry

async for session in get_session():
    plugin_registry = PluginRegistry()
    plugin_registry.discover_plugins()
    plugin_service = PluginService(session, plugin_registry)
    await plugin_service.sync_registry_to_db()
    break
```

**Korrigierte Action-Validierung (logic_validation.py):**
```python
# In validate_action() — ERGAENZEN (nicht schemas/logic.py):
def validate_action(action: dict) -> ActionType:
    action_type = action.get("type")
    if action_type in ("actuator_command", "actuator"):
        return ActuatorCommandAction(**action)
    elif action_type == "notification":
        return NotificationAction(**action)
    elif action_type == "delay":
        return DelayAction(**action)
    elif action_type == "sequence":
        return SequenceAction(**action)
    elif action_type in ("plugin", "autoops_trigger"):  # NEU
        return PluginTriggerAction(**action)             # NEU (Pydantic Model)
    else:
        raise ValueError(f"Unknown action type: {action_type}")
```

---

## Motivation

AutomationOne hat ein vollstaendig implementiertes AutoOps-Plugin-System im Backend: 4 Plugins (`HealthCheckPlugin`, `ESPConfiguratorPlugin`, `DebugFixPlugin`, `SystemCleanupPlugin`), eine abstrakte `AutoOpsPlugin`-Basisklasse, eine `PluginRegistry` mit Auto-Discovery, und einen CLI-Runner. **Aber:** Dieses System ist komplett unsichtbar — es hat keine REST-API, keine DB-Persistenz, kein Frontend-UI, und keine Verbindung zur Logic Engine. Plugins laufen nur ueber die Kommandozeile (`runner.py`).

Phase 4C macht das bestehende Plugin-System fuer den User sichtbar und steuerbar: REST-API, Frontend-UI mit Plugin-Cards, dynamische Konfiguration, Ausfuehrungshistorie, und Integration als Action-Typ in der Logic Engine.

**Was dieser Auftrag NICHT macht:**
- Keine neuen Plugins schreiben (die 4 existierenden reichen)
- Kein Diagnostics Hub (das ist Phase 4D)
- Keine Aenderungen an der bestehenden Plugin-Logik (execute/rollback/report bleibt)
- Keine Aenderungen am CLI-Runner (bleibt parallel nutzbar)

---

## Kernprinzip: SICHTBAR MACHEN, nicht neu bauen

Das AutoOps-System ist fertig implementiert. Phase 4C baut eine REST-API + Frontend-UI darum und verbindet es mit der Logic Engine:

| Existiert bereits (Backend) | Phase 4C ergaenzt |
|-----------------------------|-------------------|
| `AutoOpsPlugin` Basisklasse (`src/autoops/core/base_plugin.py`) | Bleibt unveraendert — validate → plan → execute → rollback → format_report Lifecycle |
| `PluginRegistry` Singleton (`src/autoops/core/plugin_registry.py`) | **ERWEITERN** — register(), get(), get_all(), get_by_capability() bekommen REST-API |
| `HealthCheckPlugin` (`src/autoops/plugins/health_check.py`) | Bleibt unveraendert — bekommt nur `@plugin_metadata` Dekorator |
| `ESPConfiguratorPlugin` (`src/autoops/plugins/esp_configurator.py`) | Bleibt unveraendert — bekommt nur `@plugin_metadata` Dekorator |
| `DebugFixPlugin` (`src/autoops/plugins/debug_fix.py`) | Bleibt unveraendert — bekommt nur `@plugin_metadata` Dekorator |
| `SystemCleanupPlugin` (`src/autoops/plugins/system_cleanup.py`) | Bleibt unveraendert — bekommt nur `@plugin_metadata` Dekorator |
| `runner.py` CLI Entry Point | Bleibt unveraendert — CLI-Nutzung bleibt parallel moeglich |
| `PluginCapability` Enum (8 Werte) | Bleibt unveraendert |
| `PluginResult` / `PluginAction` / `PluginQuestion` | Bleibt unveraendert — serialisiert fuer API-Responses |
| **KEIN** Plugin REST-API | **NEU:** 7 Endpoints unter `/v1/plugins/` |
| **KEIN** Plugin DB-Model | **NEU:** `plugin_configs` Tabelle + Alembic Migration |
| **KEINE** Plugin-Ausfuehrungshistorie in DB | **NEU:** `plugin_executions` Tabelle |
| **KEIN** `@plugin_metadata` Dekorator | **NEU:** Dekorator fuer display_name, description, category, config_schema |
| **KEIN** `PluginContext` Dataclass | **NEU:** User, Preferences, Alerts, Devices als Kontext |
| **KEIN** `PluginActionExecutor` | **NEU:** Neuer Action-Typ in Logic Engine |
| **KEIN** Frontend-Store fuer Plugins | **NEU:** `plugins.store.ts` (Pinia Setup Store) |
| **KEIN** Frontend-UI fuer Plugins | **NEU:** Plugin-Management View, PluginCard, PluginConfigDialog |

---

## Bestandsaufnahme: Was existiert (Ist-Zustand)

### AutoOps-Architektur (Backend)

```
El Servador/god_kaiser_server/src/autoops/
├── core/
│   ├── base_plugin.py          ← AutoOpsPlugin, PluginCapability, PluginResult, PluginAction
│   ├── plugin_registry.py      ← PluginRegistry (Singleton, Auto-Discovery)
│   └── agent.py                ← AutoOpsAgent (Coordinator, orchestriert Plugins)
├── plugins/
│   ├── health_check.py         ← HealthCheckPlugin (VALIDATE, MONITOR)
│   ├── esp_configurator.py     ← ESPConfiguratorPlugin (CONFIGURE, VALIDATE)
│   ├── debug_fix.py            ← DebugFixPlugin (DIAGNOSE, FIX, DOCUMENT)
│   └── system_cleanup.py       ← SystemCleanupPlugin (CLEANUP)
└── runner.py                   ← CLI Entry Point (full/health/configure/debug Modes)
```

**AutoOpsPlugin Lifecycle (base_plugin.py):**
```python
class AutoOpsPlugin(ABC):
    async def validate_preconditions(self) -> bool     # Check ob Plugin laufen kann
    async def plan(self) -> dict                        # Optional: Execution Plan generieren
    async def execute(self) -> PluginResult             # HAUPTLOGIK (MUSS implementiert werden)
    async def rollback(self) -> None                    # Fehlerbehandlung
    def format_report(self, result: PluginResult) -> str # Markdown-Report
```

**PluginCapability Enum:**
```python
class PluginCapability(Enum):
    CONFIGURE = "configure"    # ESP konfigurieren
    DIAGNOSE = "diagnose"      # Probleme diagnostizieren
    FIX = "fix"                # Probleme beheben
    VALIDATE = "validate"      # Systemzustand validieren
    MONITOR = "monitor"        # Health Monitoring
    DOCUMENT = "document"      # Dokumentation generieren
    TEST = "test"              # Tests laufen
    CLEANUP = "cleanup"        # Ressourcen aufraeumen
```

**PluginRegistry (plugin_registry.py):**
```python
class PluginRegistry:
    # Singleton — Auto-Discovery aus autoops/plugins/ Package
    def register(self, plugin_class: Type[AutoOpsPlugin]) -> None
    def get(self, plugin_id: str) -> AutoOpsPlugin | None
    def get_all(self) -> dict[str, AutoOpsPlugin]
    def get_by_capability(self, capability: PluginCapability) -> list[AutoOpsPlugin]
    def list_plugins(self) -> list[dict]   # Name, Capabilities, Description
```

### Logic Engine (Backend)

```
El Servador/god_kaiser_server/src/services/
├── logic_engine.py                ← Core Engine (Background Evaluation Loop)
└── logic/
    ├── conditions/
    │   ├── base.py                ← BaseConditionEvaluator (ABC)
    │   ├── sensor_evaluator.py    ← SensorConditionEvaluator (sensor, sensor_threshold)
    │   ├── time_evaluator.py      ← TimeConditionEvaluator (time_window, time)
    │   └── compound_evaluator.py  ← CompoundConditionEvaluator (AND/OR)
    ├── actions/
    │   ├── base.py                ← BaseActionExecutor (ABC), ActionResult
    │   ├── actuator_executor.py   ← ActuatorActionExecutor (actuator_command, actuator)
    │   ├── delay_executor.py      ← DelayActionExecutor (delay, 1-3600s)
    │   ├── notification_executor.py ← NotificationActionExecutor (email, webhook, websocket)
    │   └── sequence_executor.py   ← SequenceActionExecutor (non-blocking, max 20 concurrent)
    └── safety/
        ├── conflict_manager.py    ← Actuator-Locking, Priority-based
        ├── rate_limiter.py        ← Per-Rule + ESP-Level Rate Limiting
        └── loop_detector.py       ← Loop Detection
```

**Existierende Action-Typen (4 Stueck — KEIN Plugin-Action):**

| Action-Typ | Executor | Was es tut |
|------------|----------|-----------|
| `actuator_command` / `actuator` | ActuatorActionExecutor | Sendet Befehl an Aktor (ON/OFF/PWM/TOGGLE) |
| `delay` | DelayActionExecutor | Wartet N Sekunden (1-3600) |
| `notification` | NotificationActionExecutor | Email/Webhook/WebSocket Benachrichtigung |
| `sequence` | SequenceActionExecutor | Sequenz von Actions (non-blocking, max 50 Steps) |

**Action-Dispatch-Pattern (logic_engine.py):**
```python
# In LogicEngine.__init__():
self.action_executors = [
    ActuatorActionExecutor(actuator_service),
    DelayActionExecutor(),
    NotificationActionExecutor()
]

# In _execute_actions():
for executor in self.action_executors:
    if executor.supports(action_type):
        result = await executor.execute(action, context)
```

### Frontend (El Frontend)

**Logic Engine Frontend (existiert):**

| Datei | Pfad | Relevanz fuer 4C |
|-------|------|-------------------|
| `logic.store.ts` | `src/shared/stores/logic.store.ts` | Action-Typen erweitern (Plugin-Action hinzufuegen) |
| `logic.ts` (API) | `src/api/logic.ts` | Braucht keine Aenderung |
| `logic.ts` (Types) | `src/types/logic.ts` | `LogicAction` Union erweitern um `PluginAction` |
| `RuleConfigPanel.vue` | `src/components/logic/RuleConfigPanel.vue` | Neuer Action-Typ "Plugin ausfuehren" im Dropdown |
| `LogicView.vue` | `src/views/LogicView.vue` | Keine Aenderung |

**Plugin-Frontend (existiert NICHT):**
- Kein `plugins.store.ts`
- Kein `plugins.ts` API-Client
- Keine Plugin-Komponenten
- Kein Plugin-View oder -Tab

---

## Block 4C.1: Plugin-Registry API + DB-Persistenz (~4-5h)

### 4C.1.1 — DB-Migration: Plugin-Tabellen

**Datei:** Neue Alembic Migration in `El Servador/god_kaiser_server/alembic/versions/`

```sql
-- Migration: create_plugin_tables

CREATE TABLE plugin_configs (
    plugin_id VARCHAR(100) PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50),                  -- 'diagnostics', 'maintenance', 'monitoring', 'automation'
    is_enabled BOOLEAN DEFAULT TRUE,
    config JSONB DEFAULT '{}',             -- Plugin-spezifische Konfiguration
    config_schema JSONB DEFAULT '{}',      -- Schema fuer dynamische UI-Generierung
    capabilities TEXT[],                   -- Array der PluginCapability
    schedule VARCHAR(100),                 -- Cron-Expression oder NULL (manuell)
    created_by INTEGER REFERENCES user_accounts(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE plugin_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id VARCHAR(100) REFERENCES plugin_configs(plugin_id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'running',   -- 'running', 'success', 'error', 'cancelled'
    triggered_by VARCHAR(50),                        -- 'manual', 'schedule', 'logic_rule'
    triggered_by_user INTEGER REFERENCES user_accounts(id),
    triggered_by_rule UUID,                          -- Logic Rule ID wenn von Rule getriggert
    result JSONB,                                    -- PluginResult serialisiert
    error_message TEXT,
    duration_seconds FLOAT
);

CREATE INDEX ix_plugin_executions_plugin_id ON plugin_executions(plugin_id);
CREATE INDEX ix_plugin_executions_started_at ON plugin_executions(started_at DESC);
```

### 4C.1.2 — Plugin DB-Model

**Datei:** `El Servador/god_kaiser_server/src/db/models/plugin.py` (NEU)

```python
from sqlalchemy import Column, String, Boolean, Text, DateTime, Float, Integer, ForeignKey, ARRAY
from sqlalchemy.dialects.postgresql import JSONB, UUID
from ..base import Base, TimestampMixin  # [W4] Relative Imports, TimestampMixin fuer Timestamps

class PluginConfig(Base):
    __tablename__ = 'plugin_configs'

    plugin_id = Column(String(100), primary_key=True)
    display_name = Column(String(255), nullable=False)
    description = Column(Text)
    category = Column(String(50))
    is_enabled = Column(Boolean, default=True)
    config = Column(JSONB, default={})
    config_schema = Column(JSONB, default={})
    capabilities = Column(ARRAY(String))
    schedule = Column(String(100))
    created_by = Column(Integer, ForeignKey('user_accounts.id'))
    updated_at = Column(DateTime(timezone=True), server_default='now()')

class PluginExecution(Base):
    __tablename__ = 'plugin_executions'

    id = Column(UUID(as_uuid=True), primary_key=True, server_default='gen_random_uuid()')
    plugin_id = Column(String(100), ForeignKey('plugin_configs.plugin_id', ondelete='CASCADE'))
    started_at = Column(DateTime(timezone=True), server_default='now()')
    finished_at = Column(DateTime(timezone=True))
    status = Column(String(20), default='running')
    triggered_by = Column(String(50))
    triggered_by_user = Column(Integer, ForeignKey('user_accounts.id'))
    triggered_by_rule = Column(UUID(as_uuid=True))
    result = Column(JSONB)
    error_message = Column(Text)
    duration_seconds = Column(Float)
```

### 4C.1.3 — `@plugin_metadata` Dekorator

**Datei:** `El Servador/god_kaiser_server/src/autoops/core/base_plugin.py` (ERWEITERN)

Neuer Dekorator der Plugin-Metadaten an die Klasse haengt (fuer Registry + API):

```python
def plugin_metadata(
    id: str,
    display_name: str,
    description: str,
    category: str,       # 'diagnostics', 'maintenance', 'monitoring', 'automation'
    config_schema: dict | None = None,
):
    """Dekorator der Plugin-Metadaten fuer Registry und API bereitstellt."""
    def decorator(cls):
        cls._plugin_id = id
        cls._display_name = display_name
        cls._description = description
        cls._category = category
        cls._config_schema = config_schema or {}
        return cls
    return decorator
```

**Anwendung auf die 4 bestehenden Plugins:**

```python
# health_check.py
@plugin_metadata(
    id="health_check",
    display_name="System Health Check",
    description="Prueft Server, Auth, Devices, Database, MQTT, Services, Sensor-Daten und Zonen",
    category="monitoring",
    config_schema={
        "include_containers": {"type": "boolean", "default": True, "label": "Container pruefen"},
        "alert_on_degraded": {"type": "boolean", "default": True, "label": "Alert bei Degraded"},
    }
)
class HealthCheckPlugin(AutoOpsPlugin):
    ...

# esp_configurator.py
@plugin_metadata(
    id="esp_configurator",
    display_name="ESP Configurator",
    description="Erstellt und konfiguriert ESP-Devices mit Sensoren und Aktoren automatisch",
    category="automation",
    config_schema={
        "device_mode": {"type": "select", "options": ["mock", "real", "hybrid"], "default": "mock", "label": "Device-Modus"},
        "auto_heartbeat": {"type": "boolean", "default": True, "label": "Heartbeat automatisch starten"},
    }
)
class ESPConfiguratorPlugin(AutoOpsPlugin):
    ...

# debug_fix.py
@plugin_metadata(
    id="debug_fix",
    display_name="Debug & Auto-Fix",
    description="Diagnostiziert Probleme (Devices, Sensors, Actuators, Zones) und behebt sie automatisch",
    category="diagnostics",
    config_schema={
        "auto_fix": {"type": "boolean", "default": True, "label": "Automatisch beheben"},
        "include_zones": {"type": "boolean", "default": True, "label": "Zonen-Diagnose einschliessen"},
    }
)
class DebugFixPlugin(AutoOpsPlugin):
    ...

# system_cleanup.py
@plugin_metadata(
    id="system_cleanup",
    display_name="System Cleanup",
    description="Raeumt veraltete Daten, Logs und temporaere Ressourcen auf",
    category="maintenance",
    config_schema={
        "max_log_age_days": {"type": "integer", "default": 30, "label": "Max Log-Alter (Tage)"},
        "dry_run": {"type": "boolean", "default": False, "label": "Nur simulieren"},
    }
)
class SystemCleanupPlugin(AutoOpsPlugin):
    ...
```

### 4C.1.4 — PluginContext Dataclass

**Datei:** `El Servador/god_kaiser_server/src/autoops/core/base_plugin.py` (ERWEITERN)

```python
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class PluginContext:
    """Kontext der jedem Plugin bei Ausfuehrung uebergeben wird."""
    user_id: int | None = None
    user_preferences: dict = field(default_factory=dict)
    system_config: dict = field(default_factory=dict)
    trigger_source: str = 'manual'          # 'manual', 'schedule', 'logic_rule'
    trigger_rule_id: str | None = None      # Wenn von Logic Engine getriggert
    trigger_value: float | None = None      # Trigger-Wert (Sensorwert etc.)
    config_overrides: dict = field(default_factory=dict)  # Rule-spezifische Config
    esp_devices: list = field(default_factory=list)        # Alle registrierten ESPs
    active_alerts: list = field(default_factory=list)      # Aktuelle unresolved Alerts
```

**[K2] KORREKTUR:** Die bestehenden Plugins rufen BEREITS `execute(context, client)` mit `AutoOpsContext` und `GodKaiserClient` auf. Die Signatur darf NICHT geaendert werden:

```python
# base_plugin.py — AKTUELLE Signatur (NICHT aendern!):
class AutoOpsPlugin(ABC):
    @abstractmethod
    async def execute(
        self,
        context: "AutoOpsContext",     # aus autoops/core/context.py
        client: "GodKaiserClient",     # aus autoops/core/api_client.py
    ) -> PluginResult:
        ...
```

**Konsequenz fuer PluginService:** Der `PluginService.execute_plugin()` muss:
1. Aus dem Web-`PluginContext` einen `AutoOpsContext` bauen
2. Einen `GodKaiserClient` instanziieren (Loopback auf localhost:8000)
3. Beide an `plugin.execute(context, client)` uebergeben

Der CLI-Runner (`runner.py`) funktioniert weiterhin unveraendert — er baut AutoOpsContext + GodKaiserClient selbst.

### 4C.1.5 — Plugin-Service

**Datei:** `El Servador/god_kaiser_server/src/services/plugin_service.py` (NEU)

Vermittler zwischen PluginRegistry (in-memory) und DB-Persistenz:

```python
class PluginService:
    def __init__(self, db: AsyncSession, registry: PluginRegistry):
        self.db = db
        self.registry = registry

    async def sync_registry_to_db(self) -> None:
        """Synchronisiert in-memory Registry mit DB — bei Server-Start aufrufen."""
        for plugin in self.registry.get_all():  # [K4] get_all() gibt list zurueck, NICHT dict!
            plugin_id = plugin.name  # [K5] .name Property ist die ID
            existing = await self.db.get(PluginConfig, plugin_id)
            if not existing:
                config = PluginConfig(
                    plugin_id=plugin_id,
                    display_name=getattr(plugin, '_display_name', plugin.name),
                    description=plugin.description,  # .description ist @property
                    category=getattr(plugin, '_category', 'monitoring'),
                    config_schema=getattr(plugin, '_config_schema', {}),
                    capabilities=[c.value for c in plugin.capabilities],
                )
                self.db.add(config)
        await self.db.flush()

    async def get_all_plugins(self) -> list[dict]:
        """Alle Plugins mit DB-Config + Registry-Status."""
        configs = await self.db.execute(select(PluginConfig))
        result = []
        for config in configs.scalars():
            plugin = self.registry.get(config.plugin_id)
            result.append({
                **config.__dict__,
                'is_registered': plugin is not None,
                'capabilities': config.capabilities or [],
            })
        return result

    async def execute_plugin(
        self, plugin_id: str, user_id: int | None, context: PluginContext
    ) -> PluginExecution:
        """Plugin ausfuehren und Ergebnis persistieren."""
        plugin = self.registry.get(plugin_id)
        if not plugin:
            raise PluginNotFoundError(plugin_id)

        config = await self.db.get(PluginConfig, plugin_id)
        if config and not config.is_enabled:
            raise PluginDisabledError(plugin_id)

        # Execution-Record erstellen
        execution = PluginExecution(
            plugin_id=plugin_id,
            triggered_by=context.trigger_source,
            triggered_by_user=user_id,
            triggered_by_rule=context.trigger_rule_id,
            status='running',
        )
        self.db.add(execution)
        await self.db.flush()

        # Plugin ausfuehren
        start_time = datetime.now(UTC)
        try:
            # [K6] AutoOpsContext + GodKaiserClient bauen fuer plugin.execute()
            from ..autoops.core.context import AutoOpsContext
            from ..autoops.core.api_client import GodKaiserClient

            autoops_context = AutoOpsContext(
                server_url="http://localhost:8000",
            )
            client = GodKaiserClient(autoops_context.server_url)
            # Auth: Service-Account nutzen (admin credentials aus Settings)
            await client.authenticate()

            # Config-Overrides anwenden
            if context.config_overrides and config:
                merged_config = {**config.config, **context.config_overrides}
                # Plugin-interne Config setzen (plugin-spezifisch)

            result = await plugin.execute(autoops_context, client)  # [K2] Beide Parameter!

            execution.status = 'success' if result.success else 'error'
            execution.result = {
                'success': result.success,
                'summary': result.summary,
                'actions': [  # [W7] Enum-sichere Serialisierung
                    {
                        'timestamp': a.timestamp,
                        'action': a.action,
                        'target': a.target,
                        'details': a.details,
                        'result': a.result,
                        'severity': a.severity.value,  # ActionSeverity Enum → string
                    }
                    for a in result.actions
                ],
                'errors': result.errors,
                'warnings': result.warnings,
            }
            if not result.success:
                execution.error_message = '; '.join(result.errors)
        except Exception as e:
            execution.status = 'error'
            execution.error_message = str(e)
            # Rollback versuchen
            try:
                await plugin.rollback()
            except Exception:
                pass
        finally:
            execution.finished_at = datetime.now(UTC)
            execution.duration_seconds = (execution.finished_at - start_time).total_seconds()
            await self.db.flush()

        return execution

    async def update_config(self, plugin_id: str, config: dict) -> PluginConfig:
        """Plugin-Konfiguration aktualisieren."""
        db_config = await self.db.get(PluginConfig, plugin_id)
        if not db_config:
            raise PluginNotFoundError(plugin_id)
        db_config.config = config
        db_config.updated_at = datetime.now(UTC)
        await self.db.flush()
        return db_config

    async def toggle_plugin(self, plugin_id: str, enabled: bool) -> PluginConfig:
        """Plugin aktivieren/deaktivieren."""
        db_config = await self.db.get(PluginConfig, plugin_id)
        if not db_config:
            raise PluginNotFoundError(plugin_id)
        db_config.is_enabled = enabled
        db_config.updated_at = datetime.now(UTC)
        await self.db.flush()
        return db_config

    async def get_execution_history(
        self, plugin_id: str, limit: int = 50
    ) -> list[PluginExecution]:
        """Ausfuehrungshistorie eines Plugins."""
        result = await self.db.execute(
            select(PluginExecution)
            .where(PluginExecution.plugin_id == plugin_id)
            .order_by(PluginExecution.started_at.desc())
            .limit(limit)
        )
        return result.scalars().all()
```

### 4C.1.6 — REST-API Endpoints

**Datei:** `El Servador/god_kaiser_server/src/api/v1/plugins.py` (NEU)

```python
from fastapi import APIRouter, Depends
from src.services.plugin_service import PluginService

router = APIRouter(prefix="/plugins", tags=["plugins"])  # KEIN /v1/ — api_v1_router mountet bereits unter /api/v1/

@router.get("")
async def list_plugins(
    service: PluginService = Depends(get_plugin_service),
):
    """Alle registrierten Plugins mit Status und Konfiguration."""
    return await service.get_all_plugins()

@router.get("/{plugin_id}")
async def get_plugin(
    plugin_id: str,
    service: PluginService = Depends(get_plugin_service),
):
    """Plugin-Details inklusive Config-Schema und letzter Ausfuehrung."""
    return await service.get_plugin_detail(plugin_id)

@router.post("/{plugin_id}/execute")
async def execute_plugin(
    plugin_id: str,
    config_overrides: dict | None = None,
    current_user: User = Depends(get_current_user),
    service: PluginService = Depends(get_plugin_service),
):
    """Plugin manuell ausfuehren."""
    context = PluginContext(
        user_id=current_user.id,
        trigger_source='manual',
        config_overrides=config_overrides or {},
    )
    execution = await service.execute_plugin(plugin_id, current_user.id, context)
    return execution

@router.put("/{plugin_id}/config")
async def update_plugin_config(
    plugin_id: str,
    config: dict,
    current_user: User = Depends(get_current_user),
    service: PluginService = Depends(get_plugin_service),
):
    """Plugin-Konfiguration aktualisieren."""
    return await service.update_config(plugin_id, config)

@router.get("/{plugin_id}/history")
async def get_plugin_history(
    plugin_id: str,
    limit: int = 50,
    service: PluginService = Depends(get_plugin_service),
):
    """Ausfuehrungshistorie eines Plugins."""
    return await service.get_execution_history(plugin_id, limit)

@router.post("/{plugin_id}/enable")
async def enable_plugin(
    plugin_id: str,
    current_user: User = Depends(get_current_user),
    service: PluginService = Depends(get_plugin_service),
):
    """Plugin aktivieren."""
    return await service.toggle_plugin(plugin_id, enabled=True)

@router.post("/{plugin_id}/disable")
async def disable_plugin(
    plugin_id: str,
    current_user: User = Depends(get_current_user),
    service: PluginService = Depends(get_plugin_service),
):
    """Plugin deaktivieren."""
    return await service.toggle_plugin(plugin_id, enabled=False)
```

**Router-Registration:** In `src/api/v1/__init__.py` den neuen `plugins`-Router einbinden (gleiches Pattern wie `notifications`, `logic`, etc.).

### 4C.1.7 — Registry-Sync bei Server-Start

**Datei:** `El Servador/god_kaiser_server/src/main.py` — [K12] Nutzt lifespan() Contextmanager, NICHT @app.on_event()

Beim Server-Start `PluginService.sync_registry_to_db()` aufrufen, damit die in-memory Registry-Eintraege als `PluginConfig` in der DB existieren.

```python
# In main.py lifespan() Funktion, NACH Step 6 (Services):
# Step 6.1: Plugin Registry mit DB synchronisieren
from .services.plugin_service import PluginService
from .autoops.core.plugin_registry import PluginRegistry

async for session in get_session():  # [K12] get_session(), NICHT get_db_session()
    plugin_registry = PluginRegistry()
    plugin_registry.discover_plugins()
    plugin_service = PluginService(session, plugin_registry)
    await plugin_service.sync_registry_to_db()
    break
```

### Verifikation Block 4C.1

- [ ] Migration laeuft fehlerfrei (up + down)
- [ ] `plugin_configs` Tabelle existiert mit korrekten Spalten
- [ ] `plugin_executions` Tabelle existiert mit korrekten Spalten
- [ ] `@plugin_metadata` Dekorator haengt Metadaten korrekt an Plugin-Klassen
- [ ] Alle 4 Plugins haben `@plugin_metadata` (health_check, esp_configurator, debug_fix, system_cleanup)
- [ ] `PluginContext` Dataclass ist importierbar und instanziierbar
- [ ] `AutoOpsPlugin.execute()` akzeptiert optionalen `context` Parameter (abwaertskompatibel)
- [ ] `PluginService.sync_registry_to_db()` erstellt DB-Eintraege fuer alle 4 Plugins
- [ ] API: `GET /v1/plugins` → 4 Plugins mit Status + Config
- [ ] API: `GET /v1/plugins/health_check` → Plugin-Details mit Config-Schema
- [ ] API: `POST /v1/plugins/health_check/execute` → Plugin laeuft, Execution-Record in DB
- [ ] API: `PUT /v1/plugins/health_check/config` → Config wird aktualisiert
- [ ] API: `GET /v1/plugins/health_check/history` → Execution-Liste (sortiert nach Datum)
- [ ] API: `POST /v1/plugins/health_check/enable|disable` → Plugin wird aktiviert/deaktiviert
- [ ] CLI-Runner (`runner.py`) funktioniert weiterhin ohne Aenderung

---

## Block 4C.2: Plugin-Management UI (~5-6h)

### 4C.2.1 — Frontend API-Client

**Datei:** `El Frontend/src/api/plugins.ts` (NEU)

```typescript
import api from '@/api'  // [K8] Default Export aus index.ts

export interface PluginInfo {
  plugin_id: string
  display_name: string
  description: string
  category: 'diagnostics' | 'maintenance' | 'monitoring' | 'automation'
  is_enabled: boolean
  config: Record<string, unknown>
  config_schema: Record<string, ConfigField>
  capabilities: string[]
  schedule: string | null
  is_registered: boolean
}

export interface ConfigField {
  type: 'boolean' | 'integer' | 'string' | 'select'
  default: unknown
  label: string
  options?: string[]  // Fuer type: 'select'
}

export interface PluginExecution {
  id: string
  plugin_id: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'success' | 'error' | 'cancelled'
  triggered_by: 'manual' | 'schedule' | 'logic_rule'
  triggered_by_user: number | null
  result: {
    success: boolean
    summary: string
    actions: PluginAction[]
    errors: string[]
    warnings: string[]
  } | null
  error_message: string | null
  duration_seconds: number | null
}

export async function getPlugins(): Promise<PluginInfo[]> {
  const { data } = await api.get('/v1/plugins')
  return data
}

export async function getPlugin(pluginId: string): Promise<PluginInfo> {
  const { data } = await api.get(`/v1/plugins/${pluginId}`)
  return data
}

export async function executePlugin(
  pluginId: string,
  configOverrides?: Record<string, unknown>
): Promise<PluginExecution> {
  const { data } = await api.post(`/v1/plugins/${pluginId}/execute`, { config_overrides: configOverrides })
  return data
}

export async function updatePluginConfig(
  pluginId: string,
  config: Record<string, unknown>
): Promise<PluginInfo> {
  const { data } = await api.put(`/v1/plugins/${pluginId}/config`, config)
  return data
}

export async function getPluginHistory(
  pluginId: string,
  limit = 50
): Promise<PluginExecution[]> {
  const { data } = await api.get(`/v1/plugins/${pluginId}/history`, { params: { limit } })
  return data
}

export async function enablePlugin(pluginId: string): Promise<PluginInfo> {
  const { data } = await api.post(`/v1/plugins/${pluginId}/enable`)
  return data
}

export async function disablePlugin(pluginId: string): Promise<PluginInfo> {
  const { data } = await api.post(`/v1/plugins/${pluginId}/disable`)
  return data
}
```

### 4C.2.2 — Pinia Store

**Datei:** `El Frontend/src/shared/stores/plugins.store.ts` (NEU) — [K7] shared/stores/, NICHT stores/. Re-Export in index.ts ergaenzen!

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getPlugins, getPlugin, executePlugin, updatePluginConfig,
  getPluginHistory, enablePlugin, disablePlugin,
  type PluginInfo, type PluginExecution,
} from '@/api/plugins'

export const usePluginsStore = defineStore('plugins', () => {
  const plugins = ref<PluginInfo[]>([])
  const executions = ref<Map<string, PluginExecution[]>>(new Map())
  const runningPlugins = ref<Set<string>>(new Set())
  const isLoading = ref(false)

  // === Computed ===

  const pluginsByCategory = computed(() => {
    const grouped: Record<string, PluginInfo[]> = {}
    for (const p of plugins.value) {
      const cat = p.category || 'other'
      ;(grouped[cat] ??= []).push(p)
    }
    return grouped
  })

  const enabledCount = computed(() => plugins.value.filter(p => p.is_enabled).length)
  const totalCount = computed(() => plugins.value.length)

  // === Actions ===

  async function loadPlugins() {
    isLoading.value = true
    try {
      plugins.value = await getPlugins()
    } finally {
      isLoading.value = false
    }
  }

  async function runPlugin(pluginId: string, configOverrides?: Record<string, unknown>) {
    runningPlugins.value.add(pluginId)
    try {
      const execution = await executePlugin(pluginId, configOverrides)
      // History aktualisieren
      const history = executions.value.get(pluginId) || []
      history.unshift(execution)
      executions.value.set(pluginId, history)
      return execution
    } finally {
      runningPlugins.value.delete(pluginId)
    }
  }

  async function updateConfig(pluginId: string, config: Record<string, unknown>) {
    const updated = await updatePluginConfig(pluginId, config)
    const idx = plugins.value.findIndex(p => p.plugin_id === pluginId)
    if (idx >= 0) plugins.value[idx] = updated
  }

  async function toggle(pluginId: string, enabled: boolean) {
    const updated = enabled ? await enablePlugin(pluginId) : await disablePlugin(pluginId)
    const idx = plugins.value.findIndex(p => p.plugin_id === pluginId)
    if (idx >= 0) plugins.value[idx] = updated
  }

  async function loadHistory(pluginId: string) {
    const history = await getPluginHistory(pluginId)
    executions.value.set(pluginId, history)
  }

  return {
    plugins, executions, runningPlugins, isLoading,
    pluginsByCategory, enabledCount, totalCount,
    loadPlugins, runPlugin, updateConfig, toggle, loadHistory,
  }
})
```

### 4C.2.3 — PluginCard.vue (NEU)

**Datei:** `El Frontend/src/components/plugins/PluginCard.vue` (NEU)

Card-basierte Darstellung eines Plugins (Pattern: wie ESPCard, SensorCard, RuleCard):

**Inhalt pro Card:**
- Status-Dot (gruen=enabled, grau=disabled)
- Plugin-Name + Kategorie-Badge
- Kurzbeschreibung
- Schedule-Info ("Alle 60s" / "Manuell") + letzte Ausfuehrung Zeitstempel
- Capabilities als kleine Chips
- **3 Buttons:** "Jetzt ausfuehren" (Primary), "Konfiguration" (Secondary), Toggle (AN/AUS)
- Running-State: Spinner waehrend Plugin laeuft

**Events:**
```typescript
const emit = defineEmits<{
  execute: [pluginId: string]
  configure: [pluginId: string]
  toggle: [pluginId: string, enabled: boolean]
}>()
```

### 4C.2.4 — PluginConfigDialog.vue (NEU)

**Datei:** `El Frontend/src/components/plugins/PluginConfigDialog.vue` (NEU)

Dynamisch generierter Config-Dialog aus `config_schema`:

```typescript
const props = defineProps<{
  plugin: PluginInfo
  isOpen: boolean
}>()
```

**Schema-zu-UI-Mapping:**

| Schema-Typ | UI-Element |
|------------|-----------|
| `boolean` | Toggle Switch |
| `integer` | Number Input (mit min/max wenn definiert) |
| `string` | Text Input |
| `select` | Dropdown (options Array) |

**Pattern:** Gleich wie `SensorConfigPanel.vue` SlideOver — Three-Zone-Pattern (Header, Content, Footer mit Abbrechen/Speichern).

### 4C.2.5 — PluginExecutionHistory.vue (NEU)

**Datei:** `El Frontend/src/components/plugins/PluginExecutionHistory.vue` (NEU)

Collapsible Liste der letzten 50 Ausfuehrungen:

- Zeitstempel + Status-Badge (Success/Error/Running)
- Trigger-Info ("Manuell" / "Logic Rule: Temperatur-Check" / "Schedule")
- Duration
- Expandierbar: Summary, Actions, Errors, Warnings

### 4C.2.6 — Integration als eigene View

**[W5] KORREKTUR:** SystemMonitorView hat feste Tabs (`events | logs | database | mqtt | health`) und ist fuer Event-Monitoring, nicht Plugin-Management. Plugins als **separaten View** implementieren.

**Datei:** `El Frontend/src/views/PluginsView.vue` (NEU) — Eigener View mit Route `/plugins`

**Datei:** `El Frontend/src/router/index.ts` (ERWEITERN) — Neue Route `/plugins` hinzufuegen

View-Inhalt:
- Kategorie-Filter-Chips oben: `Alle` | `Diagnose` | `Wartung` | `Monitoring` | `Automation`
- Grid aus PluginCards (2 Spalten Desktop, 1 Spalte Mobil)
- Expandierbarer PluginExecutionHistory-Bereich am unteren Rand
- Navigation via Sidebar (neuer Eintrag "Plugins" nach "System Monitor")

### Verifikation Block 4C.2

- [ ] API-Client: alle 7 Funktionen rufen korrekte Endpoints auf
- [ ] Store: `loadPlugins()` laedt alle 4 Plugins
- [ ] Store: `runPlugin()` fuehrt Plugin aus und aktualisiert History
- [ ] Store: `toggle()` aktiviert/deaktiviert Plugin
- [ ] Store: `updateConfig()` speichert neue Config
- [ ] PluginCard: zeigt Status, Name, Kategorie, Schedule korrekt
- [ ] PluginCard: "Jetzt ausfuehren" → Plugin laeuft, Spinner sichtbar
- [ ] PluginCard: Toggle schaltet Plugin an/aus
- [ ] PluginConfigDialog: Felder werden aus config_schema generiert
- [ ] PluginConfigDialog: Boolean → Toggle, Integer → Number, Select → Dropdown
- [ ] PluginConfigDialog: Speichern → Config wird aktualisiert
- [ ] PluginExecutionHistory: zeigt letzte Ausfuehrungen mit Status
- [ ] SystemMonitorView: "Plugins" Tab sichtbar und funktional
- [ ] Kategorie-Filter: zeigt nur Plugins der gewaehlten Kategorie

---

## Block 4C.3: Logic Engine → Plugin Actions (~3-4h)

### 4C.3.1 — PluginActionExecutor (NEU)

**Datei:** `El Servador/god_kaiser_server/src/services/logic/actions/plugin_executor.py` (NEU)

Neuer Action-Executor der Plugins als Logic-Rule-Actions ausfuehrbar macht:

```python
from ..base import BaseActionExecutor, ActionResult  # [W4] Relative Imports
from ....autoops.core.context import AutoOpsContext
from ....autoops.core.plugin_registry import PluginRegistry
from ...plugin_service import PluginService

class PluginActionExecutor(BaseActionExecutor):
    """Fuehrt ein AutoOps-Plugin als Action einer Logic Rule aus."""

    def __init__(self, plugin_service: PluginService):
        self.plugin_service = plugin_service

    def supports(self, action_type: str) -> bool:
        return action_type in ('plugin', 'autoops_trigger')

    async def execute(self, action: dict, context: dict) -> ActionResult:
        plugin_id = action.get('plugin_id')
        if not plugin_id:
            return ActionResult(success=False, message='plugin_id fehlt in Action-Config')

        plugin = plugin_registry.get(plugin_id)
        if not plugin:
            return ActionResult(
                success=False,
                message=f'Plugin "{plugin_id}" nicht in Registry gefunden'
            )

        plugin_context = PluginContext(
            trigger_source='logic_rule',
            trigger_rule_id=context.get('rule_id'),
            trigger_value=context.get('trigger_value'),
            config_overrides=action.get('config', {}),
        )

        try:
            execution = await self.plugin_service.execute_plugin(
                plugin_id=plugin_id,
                user_id=None,  # System-Trigger, kein User
                context=plugin_context,
            )

            return ActionResult(
                success=execution.status == 'success',
                message=f'Plugin {plugin_id} ausgefuehrt: {execution.status}',
                data={
                    'execution_id': str(execution.id),
                    'status': execution.status,
                    'duration_seconds': execution.duration_seconds,
                }
            )
        except Exception as e:
            return ActionResult(
                success=False,
                message=f'Plugin-Ausfuehrung fehlgeschlagen: {str(e)}'
            )
```

### 4C.3.2 — Registration in LogicEngine

**Datei:** `El Servador/god_kaiser_server/src/main.py` (ERWEITERN — Step 6 in lifespan()) — [W2] LogicEngine nimmt action_executors als PARAMETER, Executor-Liste wird in main.py gebaut!

In `main.py` lifespan() Step 6 den neuen Executor in die action_executors-Liste einfuegen:

```python
# main.py lifespan(), Step 6 — BESTEHENDE Executors (4 Stueck):
actuator_executor = ActuatorActionExecutor(actuator_service)
delay_executor = DelayActionExecutor()
notification_executor = NotificationActionExecutor()
_sequence_executor = SequenceActionExecutor(websocket_manager=_websocket_manager)  # [W1] existiert bereits!

# NEU: PluginActionExecutor
from .services.plugin_service import PluginService
from .autoops.core.plugin_registry import PluginRegistry
plugin_registry = PluginRegistry()
# plugin_service braucht DB-Session — muss im lifespan() Scope erstellt werden
plugin_executor = PluginActionExecutor(plugin_service)

action_executors = [
    actuator_executor,
    delay_executor,
    notification_executor,
    _sequence_executor,
    plugin_executor,  # NEU — 5. Executor
]
```

**WICHTIG:** LogicEngine.\_\_init\_\_() akzeptiert `action_executors: Optional[List[BaseActionExecutor]]` — die Liste wird von aussen uebergeben, NICHT intern gebaut.

### 4C.3.3 — Frontend: Neuer Action-Typ in RuleConfigPanel

**Datei:** `El Frontend/src/types/logic.ts` (ERWEITERN)

```typescript
// Bestehende Action-Union erweitern:
export interface PluginAction {
  type: 'plugin'
  plugin_id: string
  config?: Record<string, unknown>
}

// LogicAction Union erweitern:
export type LogicAction = ActuatorAction | NotificationAction | DelayAction | PluginAction
```

**Datei:** `El Frontend/src/components/rules/RuleConfigPanel.vue` (ERWEITERN) — [K9] Ordner heisst `rules/`, nicht `logic/`

Im Action-Typ-System neuen Eintrag hinzufuegen (ACHTUNG: nutzt `nodeTypeLabels` Record, kein Array — [W6]):

```typescript
const actionTypes = [
  { value: 'actuator_command', label: 'Aktor steuern' },
  { value: 'notification', label: 'Benachrichtigung' },
  { value: 'delay', label: 'Verzoegerung' },
  // NEU:
  { value: 'plugin', label: 'Plugin ausfuehren' },
]
```

**Neue Config-Felder wenn `type === 'plugin'`:**
- Dropdown: Plugin-Auswahl (aus `pluginsStore.plugins`)
- Optional: Plugin-spezifische Config-Felder (aus `config_schema` des gewaehlten Plugins)

### 4C.3.4 — Logic API Schema erweitern

**Datei:** `El Servador/god_kaiser_server/src/db/models/logic_validation.py` (ERWEITERN) — [K11] Validierung liegt hier, NICHT in schemas/logic.py

Den `validate_action()` if/elif-Chain um den neuen Typ ergaenzen + neues Pydantic-Model:

```python
# Neues Pydantic Model in logic_validation.py:
class PluginTriggerAction(BaseModel):
    type: Literal["plugin", "autoops_trigger"] = Field(...)
    plugin_id: str = Field(..., description="Plugin ID aus Registry")
    config: dict = Field(default_factory=dict, description="Plugin-Config-Overrides")

# In validate_action() ergaenzen:
elif action_type in ("plugin", "autoops_trigger"):
    return PluginTriggerAction(**action)

# ActionType Union erweitern:
ActionType = Union[ActuatorCommandAction, NotificationAction, DelayAction, SequenceAction, PluginTriggerAction]
```

### Verifikation Block 4C.3

- [ ] `PluginActionExecutor.supports('plugin')` → True
- [ ] `PluginActionExecutor.supports('autoops_trigger')` → True
- [ ] Logic Rule mit Action `{type: 'plugin', plugin_id: 'health_check'}` → Plugin laeuft
- [ ] Plugin-Execution wird in `plugin_executions` Tabelle mit `triggered_by='logic_rule'` persistiert
- [ ] Frontend: "Plugin ausfuehren" als Action-Typ im Dropdown sichtbar
- [ ] Frontend: Plugin-Auswahl-Dropdown zeigt alle 4 Plugins
- [ ] Frontend: Plugin-spezifische Config-Felder werden angezeigt
- [ ] Fehlerfall: Nicht-existierendes Plugin → ActionResult mit `success=False`
- [ ] Fehlerfall: Deaktiviertes Plugin → Fehler mit klarer Meldung
- [ ] Bestehende 4 Action-Typen funktionieren weiterhin ohne Regression

---

## Block 4C.4: User-Kontext + Schedule-Support (~2-3h)

### 4C.4.1 — PluginContext mit vollstaendigem System-Kontext

**Datei:** `El Servador/god_kaiser_server/src/services/plugin_service.py` (ERWEITERN)

Die `execute_plugin()`-Methode soll den PluginContext mit allen verfuegbaren System-Informationen befuellen:

```python
async def _build_full_context(
    self, user_id: int | None, trigger_source: str, **kwargs
) -> PluginContext:
    """Baut vollstaendigen PluginContext mit System-Informationen."""
    context = PluginContext(
        user_id=user_id,
        trigger_source=trigger_source,
        **kwargs,
    )

    # User-Preferences laden (wenn User bekannt)
    if user_id:
        prefs = await self.notification_service.get_preferences(user_id)
        context.user_preferences = prefs.__dict__ if prefs else {}

    # ESP-Devices laden
    devices = await self.esp_service.get_all_devices()
    context.esp_devices = [
        {'esp_id': d.esp_id, 'zone_id': d.zone_id, 'online': d.is_online}
        for d in devices
    ]

    # Aktive Alerts laden (aus Phase 4B)
    alerts = await self.notification_service.get_alerts_by_status(
        statuses=['active', 'acknowledged']
    )
    context.active_alerts = [
        {'id': str(a.id), 'severity': a.severity, 'title': a.title, 'source': a.source}
        for a in alerts
    ]

    return context
```

### 4C.4.2 — Schedule-Support (Optional, Einfache Version)

**Datei:** `El Servador/god_kaiser_server/src/services/plugin_scheduler.py` (NEU)

Nutzt den bestehenden APScheduler (aus Phase 4A DigestService) fuer Plugin-Schedules:

```python
class PluginScheduler:
    """Fuehrt Plugins nach ihrem Schedule (Cron-Expression) automatisch aus."""

    def __init__(self, scheduler: AsyncIOScheduler, plugin_service: PluginService):
        self.scheduler = scheduler
        self.plugin_service = plugin_service

    async def sync_schedules(self):
        """Liest alle plugin_configs mit Schedule und registriert Jobs."""
        configs = await self.plugin_service.get_scheduled_plugins()
        for config in configs:
            if config.schedule and config.is_enabled:
                self.scheduler.add_job(
                    self._run_scheduled_plugin,
                    CronTrigger.from_crontab(config.schedule),
                    args=[config.plugin_id],
                    id=f'plugin_{config.plugin_id}',
                    replace_existing=True,
                )

    async def _run_scheduled_plugin(self, plugin_id: str):
        """Scheduled Plugin-Ausfuehrung."""
        context = PluginContext(trigger_source='schedule')
        await self.plugin_service.execute_plugin(plugin_id, user_id=None, context=context)
```

**WICHTIG:** Schedule-Support ist ein Nice-to-Have. Wenn der APScheduler-Setup zu komplex wird, kann dieser Teil uebersprungen werden — manuelles Ausfuehren und Logic-Rule-Trigger reichen fuer den Anfang.

### Verifikation Block 4C.4

- [ ] PluginContext enthaelt User-Preferences wenn User bekannt
- [ ] PluginContext enthaelt ESP-Device-Liste (esp_id, zone_id, online Status)
- [ ] PluginContext enthaelt aktive Alerts (id, severity, title, source)
- [ ] Plugin kann auf Context-Daten zugreifen (z.B. `context.esp_devices`)
- [ ] Schedule: Plugin mit Cron-Schedule laeuft automatisch (wenn implementiert)
- [ ] Schedule: Deaktiviertes Plugin wird nicht scheduled

---

## Tests fuer Phase 4C (~15-20 neue Tests)

| Testdatei | Tests | Was wird getestet |
|-----------|-------|-------------------|
| `test_plugin_service.py` | 5 | sync_registry, execute (success + error + disabled), update_config |
| `test_plugin_api.py` | 5 | GET list, GET detail, POST execute, PUT config, POST enable/disable |
| `test_plugin_executor.py` | 4 | supports(), execute (success + not_found + disabled), context propagation |
| `test_plugin_context.py` | 3 | Full context build, User preferences loaded, Alerts included |
| `test_plugin_metadata.py` | 3 | Decorator attaches metadata, all 4 plugins have metadata, config_schema format |

**Testdateien-Pfad:** `El Servador/god_kaiser_server/tests/unit/` und `tests/integration/`

---

## Reihenfolge der Implementation

```
Block 4C.1 (Registry API + DB)
├── 4C.1.1 DB-Migration (plugin_configs + plugin_executions)
├── 4C.1.2 Plugin DB-Model
├── 4C.1.3 @plugin_metadata Dekorator
├── 4C.1.4 PluginContext Dataclass
├── 4C.1.5 PluginService
├── 4C.1.6 REST-API Endpoints
├── 4C.1.7 Registry-Sync bei Server-Start
└── @plugin_metadata auf 4 bestehende Plugins
    ↓
Block 4C.3 (Logic Engine Integration)  ←  braucht PluginService + PluginContext
├── 4C.3.1 PluginActionExecutor
├── 4C.3.2 Registration in LogicEngine
├── 4C.3.3 Frontend: Action-Typ in RuleConfigPanel
└── 4C.3.4 Logic API Schema erweitern
    ↓
Block 4C.2 (Plugin-Management UI)  ←  braucht API + Plugins zum Testen
├── 4C.2.1 API-Client (plugins.ts)
├── 4C.2.2 Pinia Store (plugins.store.ts)
├── 4C.2.3 PluginCard.vue
├── 4C.2.4 PluginConfigDialog.vue
├── 4C.2.5 PluginExecutionHistory.vue
└── 4C.2.6 Integration in SystemMonitorView
    ↓
Block 4C.4 (User-Kontext + Schedule)  ←  braucht alles vorherige
├── 4C.4.1 PluginContext mit System-Kontext
└── 4C.4.2 Schedule-Support (optional)
```

**Block 4C.1 → 4C.3 → 4C.2 → 4C.4** (sequenziell, jeder Block baut auf dem vorherigen auf)

---

## Abschluss-Verifikation (Gesamttest Phase 4C)

- [ ] Plugin-Liste: Alle 4 Plugins sichtbar mit Status, Kategorie, Schedule
- [ ] Config-Dialog: Dynamisch generiert aus config_schema (Boolean→Toggle, Integer→Number, Select→Dropdown)
- [ ] Manuell ausfuehren: "Jetzt ausfuehren" → Plugin laeuft, Ergebnis sichtbar, History aktualisiert
- [ ] Logic Rule mit Plugin-Action: Regel feuert → Plugin wird ausgefuehrt → Execution in History
- [ ] User-Kontext: Plugin erhaelt ESP-Devices, aktive Alerts, User-Preferences
- [ ] Enable/Disable: Toggle schaltet Plugin, deaktiviertes Plugin kann nicht ausgefuehrt werden
- [ ] Ausfuehrungshistorie: Letzte 50 Ausfuehrungen mit Status, Trigger, Duration
- [ ] CLI-Runner (`runner.py`) funktioniert weiterhin ohne Regression
- [ ] Bestehende Logic Engine (4 Action-Typen) funktioniert weiterhin ohne Regression
- [ ] Bestehende ~341+ Tests laufen weiterhin fehlerfrei
- [ ] Neue ~20 Tests laufen fehlerfrei
