# STEP 8: Phase 4D — Diagnostics Hub

> **Erstellt:** 2026-03-03
> **Typ:** Implementierung (Code-Aenderungen im auto-one Repo)
> **Ziel-Repo:** `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
> **Vorgaenger:** STEP 0-7 ERLEDIGT (Phase 4A+4B+4C KOMPLETT)
> **Voraussetzung:** Phase 4C fertig + `auftrag-logging-multi-layer-fix.md` + `auftrag-loki-pipeline-verifikation.md` (STEP 3 Parallele) fertig
> **Geschaetzter Aufwand:** ~20-25h (4 Bloecke)
> **Prioritaet:** HOCH — Letzter Baustein vor Hardware-Test 2
> **Referenz-Plan:** `auto-one/.claude/reports/current/testrun-phasen/PHASE_4_INTEGRATION copy.md` (Abschnitt Phase 4D)

---

## Motivation

AutomationOne hat bereits einen soliden SystemMonitorView mit 5 Tabs (Ereignisse, Server Logs, Datenbank, MQTT Traffic, Health), einen Fleet-Health-Endpoint (`/v1/health/esp`), AuditLog-Persistenz, 100+ Error-Mappings und einen vollstaendigen Monitoring-Stack. **Aber:** Es gibt keine strukturierten Diagnose-Checks, keinen Report-Generator, keine Diagnose-Historie, und keine Moeglichkeit fuer den User automatisiert zu pruefen ob das System "in Ordnung" ist.

Phase 4D macht den SystemMonitorView zum vollstaendigen **Diagnostics Hub**: 10 modulare Diagnose-Checks (On-Demand ausfuehrbar), Markdown-Report-Generator fuer das Repo, Diagnose-Historie, und Logic-Engine-Integration fuer automatische Diagnosen bei Problemen.

**Was dieser Auftrag NICHT macht:**
- Kein neuer View — Erweiterung des bestehenden SystemMonitorView
- Keine Aenderungen an den 5 bestehenden Tabs (Ereignisse, Logs, DB, MQTT, Health)
- Kein KI-Inferenz (Isolation Forest ist Phase 5, nur Score-Anzeige vorbereiten)
- Keine Loki-Implementation — Loki-Pipeline ist VOLLSTAENDIG VORBEREITET (verifiziert 2026-03-03):
  - `docker/loki/loki-config.yml` — tsdb store, v13 schema, 7d retention, compactor
  - `docker/alloy/config.alloy` — Native Alloy River config mit 6 Service-Pipelines:
    el-servador (regex+multiline+structured_metadata), el-frontend (JSON+component),
    esp32-serial-logger (JSON+regex fallback), mqtt-broker (healthcheck drop),
    loki (logfmt+query-stats drop), postgres (level+checkpoint drop+slow query)
  - `docker/prometheus/prometheus.yml` — 7 Scrape-Configs (el-servador, postgres, prometheus, mqtt-broker, cadvisor, loki, alloy)
  - `docker/grafana/provisioning/` — Datasources (Prometheus+Loki), 2 Dashboards (debug-console, system-health), 44 Alert Rules (38 Prometheus + 6 Loki)
  - Grafana: `GF_SECURITY_ALLOW_EMBEDDING=true`, `GF_AUTH_ANONYMOUS_ENABLED=true` (fuer GrafanaPanelEmbed)
  - Alle Services im `monitoring` Profile: `make monitor-up` startet Loki+Alloy+Prometheus+Grafana

---

## Kernprinzip: ERWEITERN, nicht ersetzen

Der SystemMonitorView hat 5 funktionierende Tabs und 20 Vue-Komponenten. Phase 4D fuegt **2 neue Tabs** hinzu und erweitert den Health-Tab:

| Existiert bereits | Phase 4D ergaenzt |
|--------------------|-------------------|
| SystemMonitorView mit 5 Tabs | +2 Tabs: "Diagnosen" + "Reports" |
| `MonitorTabs.vue` (Tab-Leiste) | **ERWEITERN** um 2 neue Tab-Eintraege |
| `HealthTab.vue` (Fleet Health, 5 KPI Cards) | **ERWEITERN** um System-Gesamt-KPIs (Server, DB, MQTT, Monitoring) |
| `HealthSummaryBar.vue` (Problem-Chips) | **ERWEITERN** um Diagnose-Status-Chip ("Letzte Diagnose: vor 15m ✅") |
| `GET /v1/health/esp` (Fleet Health API) | Bleibt unveraendert |
| `GET /v1/health/detailed` (Component Health) | **ERWEITERN** als Datenbasis fuer Diagnose-Checks |
| AuditLog Tabelle + Event Aggregation | Wird von Diagnose-Checks gelesen |
| Error-Code-System (5000-5999) | Wird von Diagnose-Checks referenziert |
| 44 Grafana-Alerts (38 Prometheus + 6 Loki) | Wird in Alert-Analyse Check ausgewertet |
| Phase 4B Alert-Center (active_alerts) | Wird fuer ISA-18.2 Analyse genutzt |
| Phase 4C Plugin-System (4 Plugins) | Plugin-Health wird im Health-Tab angezeigt |
| **KEIN** Diagnostics-Backend | **NEU:** DiagnosticsService mit 10 modularen Checks |
| **KEIN** Diagnostics-API | **NEU:** 6 REST-Endpoints (`/v1/diagnostics/`) |
| **KEIN** Report-System | **NEU:** Markdown-Report-Generator + Persistenz |
| **KEIN** Diagnostics-Frontend | **NEU:** DiagnoseTab.vue + ReportsTab.vue |
| **KEIN** Logic-Engine Diagnose-Trigger | **NEU:** DiagnosticsConditionEvaluator + DiagnosticsActionExecutor |

---

## Bestandsaufnahme: Was existiert (Ist-Zustand)

### Frontend (El Frontend)

**SystemMonitorView.vue** (88.3 KB):
- Server-zentrischer Ansatz (God-Kaiser = Single Source of Truth)
- WebSocket-Live-Event-Streaming
- Error-Mapping mit 100+ deutschen Meldungen
- Deep-Linking (URL-Synchronisation)

**5 bestehende Tabs:**

| Tab | Komponente | Was es zeigt |
|-----|-----------|-------------|
| Ereignisse | `UnifiedEventList.vue` + `EventDetailsPanel.vue` + `EventTimeline.vue` | Live-Events, Error-Codes, Timeline |
| Server Logs | `ServerLogsTab.vue` | Server-Log-Viewer mit Polling |
| Datenbank | `DatabaseTab.vue` | Tabellen-Explorer, Schema-Inspektion |
| MQTT Traffic | `MqttTrafficTab.vue` | MQTT-Message-Viewer |
| Health | `HealthTab.vue` + `HealthSummaryBar.vue` + `HealthProblemChip.vue` | Fleet-Health (5 KPI Cards, Device-Tabelle, Problem-Highlighting) |

**20 Vue-Komponenten in `src/components/system-monitor/`:**
- `MonitorTabs.vue` — Tab-Leiste mit Live-Toggle, Tabs, Action-Buttons (Export, Cleanup)
- `MonitorFilterPanel.vue` — Filter nach ESP, Level, Zeitraum, Event-Typen
- `UnifiedEventList.vue` — Virtual Scrolling Event-Liste
- `EventDetailsPanel.vue` — Error-Code-Uebersetzung via Error-Mapping
- `EventTimeline.vue` — Event-Timeline Visualisierung
- `HealthTab.vue` — 5 Summary-KPI-Cards + sortierbare Device-Tabelle
- `HealthSummaryBar.vue` — Kompakte Problem-Uebersicht (expandierbar)
- `HealthProblemChip.vue` — Clickable Chip fuer Problem-Devices
- `RssiIndicator.vue` — WiFi-RSSI-Indikator
- `ServerLogsTab.vue`, `DatabaseTab.vue`, `MqttTrafficTab.vue`
- `AutoCleanupStatusBanner.vue`, `CleanupPanel.vue`, `LogManagementPanel.vue`
- `DataSourceSelector.vue`, `PreviewEventCard.vue`

### Backend (El Servador)

**Health-Endpoints (`src/api/v1/health.py`, 441 Zeilen):**

| Endpoint | Was es liefert |
|----------|---------------|
| `GET /v1/health/` | Basis: `{"status": "healthy"}` |
| `GET /v1/health/detailed` | Komponenten-Status: DB, MQTT, Disk, Memory |
| `GET /v1/health/esp` | Fleet-Health: Devices, avg_heap, avg_rssi, problems |
| `GET /v1/health/metrics` | Prometheus Metrics (Text-Format) |
| `GET /v1/health/live` | Kubernetes Liveness Probe |
| `GET /v1/health/ready` | Kubernetes Readiness Probe |

**Prometheus-Metriken (`src/core/metrics.py`):**
- Server: uptime, cpu_percent, memory_percent
- MQTT: connected, messages_total, errors_total
- WebSocket: connections
- DB: query_duration_seconds
- ESP: total, online, offline, avg_heap, min_heap, avg_rssi, avg_uptime
- Notifications: 15 Metriken (11 Phase 4A + 4 Phase 4B)

**Bestehende Services:**
- `audit_retention_service.py` — Log-Retention + Cleanup
- `audit_backup_service.py` — Audit-Backup
- `event_aggregator_service.py` — Event-Aggregation
- `esp_service.py` — ESP Device Management
- `sensor_service.py` — Sensor Data Management

**AuditLog-Tabelle:**
- source_type (ESP32, Server, Frontend)
- source_id (device_id)
- severity (info, warning, error, critical)
- event_type, message, created_at

---

## Block 4D.1: Diagnostics-Backend-Service (~5-6h)

### 4D.1.1 — DiagnosticsService mit 10 modularen Checks

**Datei:** `El Servador/god_kaiser_server/src/services/diagnostics_service.py` (NEU)

```python
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

class CheckStatus(Enum):
    HEALTHY = "healthy"
    WARNING = "warning"
    CRITICAL = "critical"
    ERROR = "error"       # Check selbst ist fehlgeschlagen

@dataclass
class CheckResult:
    name: str
    status: CheckStatus
    message: str
    details: dict = field(default_factory=dict)
    metrics: dict = field(default_factory=dict)
    recommendations: list[str] = field(default_factory=list)
    duration_ms: float = 0.0

@dataclass
class DiagnosticReport:
    id: str                           # UUID
    overall_status: CheckStatus
    started_at: str                   # ISO-8601
    finished_at: str
    duration_seconds: float
    checks: list[CheckResult]
    summary: str                      # Menschenlesbare Zusammenfassung
    triggered_by: str                 # 'manual', 'logic_rule', 'schedule'

class DiagnosticsService:
    """10 modulare Diagnose-Checks — einzeln oder als Batch ausfuehrbar."""

    def __init__(self, db, esp_service, mqtt_manager, notification_service, plugin_service, logic_engine):
        self.db = db
        self.esp_service = esp_service
        self.mqtt_manager = mqtt_manager
        self.notification_service = notification_service
        self.plugin_service = plugin_service
        self.logic_engine = logic_engine

        # Check-Registry (Name → Methode)
        self.checks: dict[str, callable] = {
            'server': self._check_server,
            'database': self._check_database,
            'mqtt': self._check_mqtt,
            'esp_devices': self._check_esp_devices,
            'sensors': self._check_sensors,
            'actuators': self._check_actuators,
            'monitoring': self._check_monitoring,
            'logic_engine': self._check_logic_engine,
            'alerts': self._check_alerts,
            'plugins': self._check_plugins,
        }

    async def run_full_diagnostic(self, triggered_by: str = 'manual') -> DiagnosticReport:
        """Alle 10 Checks ausfuehren und Report generieren."""
        start = datetime.now(UTC)
        results = []

        for name, check_fn in self.checks.items():
            check_start = datetime.now(UTC)
            try:
                result = await check_fn()
            except Exception as e:
                result = CheckResult(
                    name=name,
                    status=CheckStatus.ERROR,
                    message=f'Check fehlgeschlagen: {str(e)}',
                )
            result.duration_ms = (datetime.now(UTC) - check_start).total_seconds() * 1000
            results.append(result)

        finished = datetime.now(UTC)
        overall = max((r.status for r in results), key=lambda s: list(CheckStatus).index(s))

        report = DiagnosticReport(
            id=str(uuid4()),
            overall_status=overall,
            started_at=start.isoformat(),
            finished_at=finished.isoformat(),
            duration_seconds=(finished - start).total_seconds(),
            checks=results,
            summary=self._generate_summary(results),
            triggered_by=triggered_by,
        )

        # Report in DB persistieren
        await self._persist_report(report)
        return report

    async def run_single_check(self, check_name: str) -> CheckResult:
        """Einzelnen Check ausfuehren."""
        check_fn = self.checks.get(check_name)
        if not check_fn:
            raise ValueError(f'Unbekannter Check: {check_name}. Verfuegbar: {list(self.checks.keys())}')
        return await check_fn()
```

### 4D.1.2 — Die 10 Diagnose-Checks

Jeder Check ist eine async Methode die ein `CheckResult` zurueckgibt:

```python
async def _check_server(self) -> CheckResult:
    """Server: Uptime, Memory, CPU, API-Latenz."""
    import psutil
    cpu = psutil.cpu_percent(interval=0.5)
    memory = psutil.virtual_memory()
    uptime = get_uptime()

    status = CheckStatus.HEALTHY
    recommendations = []

    if memory.percent > 90:
        status = CheckStatus.CRITICAL
        recommendations.append('Memory > 90% — pruefe Speicherlecks oder erhoehe RAM')
    elif memory.percent > 75:
        status = CheckStatus.WARNING
        recommendations.append('Memory > 75% — beobachten')

    if cpu > 80:
        status = max(status, CheckStatus.WARNING)
        recommendations.append(f'CPU bei {cpu}% — pruefe ob Background-Tasks laufen')

    return CheckResult(
        name='server',
        status=status,
        message=f'Server laeuft seit {uptime}, CPU {cpu}%, RAM {memory.percent}%',
        metrics={'cpu_percent': cpu, 'memory_percent': memory.percent, 'uptime': uptime},
        recommendations=recommendations,
    )

async def _check_database(self) -> CheckResult:
    """Database: Connections, Tabellen-Integritaet, Groesse, Orphans."""
    # Tabellen-Count
    tables = await self.db.execute(text(
        "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"
    ))
    table_count = tables.scalar()

    # DB-Groesse
    size = await self.db.execute(text(
        "SELECT pg_size_pretty(pg_database_size(current_database()))"
    ))
    db_size = size.scalar()

    # Aktive Connections
    conns = await self.db.execute(text(
        "SELECT count(*) FROM pg_stat_activity WHERE state = 'active'"
    ))
    active_conns = conns.scalar()

    # Orphan-Check: Notifications ohne User
    orphans = await self.db.execute(text(
        "SELECT count(*) FROM notifications n LEFT JOIN user_accounts u ON n.user_id = u.id WHERE u.id IS NULL"
    ))
    orphan_count = orphans.scalar()

    status = CheckStatus.HEALTHY
    recommendations = []
    if orphan_count > 0:
        status = CheckStatus.WARNING
        recommendations.append(f'{orphan_count} Notifications ohne gueltigen User — Cleanup empfohlen')
    if active_conns > 20:
        status = max(status, CheckStatus.WARNING)
        recommendations.append(f'{active_conns} aktive DB-Connections — Connection-Pool pruefen')

    return CheckResult(
        name='database',
        status=status,
        message=f'{table_count} Tabellen, {db_size}, {active_conns} aktive Connections',
        metrics={'tables': table_count, 'size': db_size, 'active_connections': active_conns, 'orphans': orphan_count},
        recommendations=recommendations,
    )

async def _check_mqtt(self) -> CheckResult:
    """MQTT: Broker-Status, Clients, Message-Rate, Stale-Topics."""
    connected = self.mqtt_manager.is_connected
    status = CheckStatus.HEALTHY if connected else CheckStatus.CRITICAL

    metrics = {'connected': connected}
    recommendations = []

    if not connected:
        recommendations.append('MQTT-Broker nicht erreichbar — Docker-Container pruefen')

    # Stale-Check: ESPs die laenger als 5 Min kein Heartbeat gesendet haben
    stale_threshold = datetime.now(UTC) - timedelta(minutes=5)
    stale_devices = await self.db.execute(
        select(func.count()).select_from(ESPDevice)
        .where(ESPDevice.last_seen < stale_threshold)
        .where(ESPDevice.status != 'offline')
    )
    stale_count = stale_devices.scalar()
    if stale_count > 0:
        status = max(status, CheckStatus.WARNING)
        recommendations.append(f'{stale_count} Devices mit veraltetem Heartbeat (>5 Min)')

    return CheckResult(
        name='mqtt',
        status=status,
        message='MQTT verbunden' if connected else 'MQTT NICHT verbunden',
        metrics={**metrics, 'stale_devices': stale_count},
        recommendations=recommendations,
    )

async def _check_esp_devices(self) -> CheckResult:
    """ESP-Devices: Online/Offline, Heartbeat, Heap, RSSI."""
    # ACHTUNG: esp_service.get_fleet_health() existiert NICHT als Service-Methode!
    # Fleet-Health-Logik lebt direkt im API-Endpoint (health.py:esp_health_summary).
    # Loesung: Logik in ESPService extrahieren oder direkt DB-Queries nutzen
    # (ESPDevice Tabelle: status, heap_free, wifi_rssi, last_seen)
    fleet = await self._compute_fleet_health()  # Aus ESPDevice Tabelle berechnen

    status = CheckStatus.HEALTHY
    recommendations = []
    problems = []

    if fleet.offline_count > 0:
        status = CheckStatus.WARNING
        problems.append(f'{fleet.offline_count} Devices offline')
    if fleet.avg_heap_free and fleet.avg_heap_free < 20_000:
        status = max(status, CheckStatus.WARNING)
        problems.append(f'Avg Heap nur {fleet.avg_heap_free} Bytes')
    if fleet.avg_wifi_rssi and fleet.avg_wifi_rssi < -80:
        status = max(status, CheckStatus.WARNING)
        problems.append(f'Schwaches WiFi-Signal (avg RSSI: {fleet.avg_wifi_rssi} dBm)')
    if fleet.error_count > 0:
        status = max(status, CheckStatus.CRITICAL)
        problems.append(f'{fleet.error_count} Devices im Error-Status')

    return CheckResult(
        name='esp_devices',
        status=status,
        message=f'{fleet.online_count}/{fleet.total_devices} online' +
                (f', Probleme: {", ".join(problems)}' if problems else ''),
        metrics={
            'total': fleet.total_devices, 'online': fleet.online_count,
            'offline': fleet.offline_count, 'avg_heap': fleet.avg_heap_free,
            'avg_rssi': fleet.avg_wifi_rssi,
        },
        recommendations=recommendations,
    )

async def _check_sensors(self) -> CheckResult:
    """Sensors: Datenluecken, Threshold-Config, Kalibrierung."""
    # Sensoren ohne Daten in letzten 10 Min
    cutoff = datetime.now(UTC) - timedelta(minutes=10)
    # Nutzt bestehende Sensor-Service-Methoden
    total_sensors = await self.db.scalar(select(func.count()).select_from(SensorConfig))
    # Sensoren mit alert_config JSON-Feld (kein eigenes AlertConfig-Model!)
    # alert_config ist ein JSONB-Feld auf SensorConfig, ActuatorConfig und ESPDevice
    with_alerts = await self.db.scalar(
        select(func.count()).select_from(SensorConfig).where(SensorConfig.alert_config.isnot(None))
    )

    status = CheckStatus.HEALTHY
    recommendations = []
    if total_sensors > 0 and with_alerts == 0:
        status = CheckStatus.WARNING
        recommendations.append('Keine Sensor-Alert-Configs aktiv — Schwellwerte einrichten empfohlen')

    return CheckResult(
        name='sensors',
        status=status,
        message=f'{total_sensors} Sensoren registriert, {with_alerts} mit Alert-Config',
        metrics={'total': total_sensors, 'with_alerts': with_alerts},
        recommendations=recommendations,
    )

async def _check_actuators(self) -> CheckResult:
    """Actuators: Zustand, Runtime, Safety-Constraints."""
    total = await self.db.scalar(select(func.count()).select_from(ActuatorConfig))
    return CheckResult(
        name='actuators',
        status=CheckStatus.HEALTHY,
        message=f'{total} Aktoren registriert',
        metrics={'total': total},
    )

async def _check_monitoring(self) -> CheckResult:
    """Monitoring: Grafana, Prometheus, Loki Erreichbarkeit."""
    # ACHTUNG: settings.GRAFANA_URL/PROMETHEUS_URL/LOKI_URL existieren NICHT!
    # Nur settings.prometheus_port (9090) existiert in config.py.
    # Variante A: Neue Settings in config.py hinzufuegen (empfohlen)
    # Variante B: Docker-interne URLs hardcoden (http://grafana:3000 etc.)
    results = {}
    monitoring_urls = {
        'grafana': 'http://grafana:3000',
        'prometheus': 'http://prometheus:9090',
        'loki': 'http://loki:3100',
    }
    for name, url in monitoring_urls.items():
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                endpoint = f'{url}/api/health' if name == 'grafana' else f'{url}/ready'
                resp = await client.get(endpoint)
                results[name] = 'up' if resp.status_code == 200 else 'down'
        except Exception:
            results[name] = 'unreachable'

    all_up = all(v == 'up' for v in results.values())
    status = CheckStatus.HEALTHY if all_up else CheckStatus.WARNING
    recommendations = []
    for name, state in results.items():
        if state != 'up':
            recommendations.append(f'{name.capitalize()} ist {state} — Container pruefen')

    return CheckResult(
        name='monitoring',
        status=status,
        message=f'Grafana: {results["grafana"]}, Prometheus: {results["prometheus"]}, Loki: {results["loki"]}',
        metrics=results,
        recommendations=recommendations,
    )

async def _check_logic_engine(self) -> CheckResult:
    """Logic Engine: Aktive Rules, Executions, Fehlerrate."""
    active_rules = await self.db.scalar(
        select(func.count()).select_from(CrossESPLogic).where(CrossESPLogic.enabled == True)
    )
    day_ago = datetime.now(UTC) - timedelta(hours=24)
    executions_24h = await self.db.scalar(
        select(func.count()).select_from(LogicExecutionHistory).where(LogicExecutionHistory.executed_at >= day_ago)
    )
    errors_24h = await self.db.scalar(
        select(func.count()).select_from(LogicExecutionHistory)
        .where(LogicExecutionHistory.executed_at >= day_ago)
        .where(LogicExecutionHistory.status == 'error')
    )

    error_rate = (errors_24h / executions_24h * 100) if executions_24h > 0 else 0
    status = CheckStatus.HEALTHY
    recommendations = []
    if error_rate > 10:
        status = CheckStatus.WARNING
        recommendations.append(f'Logic Engine Fehlerrate {error_rate:.1f}% — Rules pruefen')

    return CheckResult(
        name='logic_engine',
        status=status,
        message=f'{active_rules} aktive Rules, {executions_24h} Ausfuehrungen/24h, {errors_24h} Fehler',
        metrics={'active_rules': active_rules, 'executions_24h': executions_24h, 'errors_24h': errors_24h, 'error_rate': error_rate},
        recommendations=recommendations,
    )

async def _check_alerts(self) -> CheckResult:
    """Alerts: ISA-18.2 Metriken, Alert-Fatigue, False-Positive-Rate."""
    # ACHTUNG: notification_service.get_isa_metrics() existiert NICHT!
    # Muss in Phase 4D erst erstellt werden (notification_router.py oder alert-center.store)
    # Alternativ: Alert-Statistiken direkt per DB-Query berechnen
    # (active_alerts COUNT, Alerts pro Stunde aus notification Tabelle)
    stats = await self._compute_alert_stats()  # Neue Helper-Methode noetig

    status = CheckStatus.HEALTHY
    recommendations = []
    if stats.get('alerts_per_hour', 0) > 6:
        status = CheckStatus.WARNING
        recommendations.append(f'Alarm-Rate {stats["alerts_per_hour"]}/h ueberschreitet ISA-18.2 Limit (6/h)')
    if stats.get('standing_alerts', 0) > 5:
        status = max(status, CheckStatus.WARNING)
        recommendations.append(f'{stats["standing_alerts"]} stehende Alarme — pruefen ob valide')

    return CheckResult(
        name='alerts',
        status=status,
        message=f'{stats.get("alerts_per_hour", 0):.1f} Alarme/h, {stats.get("standing_alerts", 0)} stehend',
        metrics=stats,
        recommendations=recommendations,
    )

async def _check_plugins(self) -> CheckResult:
    """Plugins: Registrierte Plugins, Enable-Status, letzte Ausfuehrungen."""
    # Nutzt Phase 4C Plugin-Service
    plugins = await self.plugin_service.get_all_plugins()
    enabled = sum(1 for p in plugins if p.get('is_enabled'))
    registered = sum(1 for p in plugins if p.get('is_registered'))

    return CheckResult(
        name='plugins',
        status=CheckStatus.HEALTHY if registered == len(plugins) else CheckStatus.WARNING,
        message=f'{len(plugins)} Plugins, {enabled} aktiv, {registered} registriert',
        metrics={'total': len(plugins), 'enabled': enabled, 'registered': registered},
    )
```

### 4D.1.3 — DB-Migration: Diagnose-Reports Tabelle

**Datei:** Neue Alembic Migration

```sql
CREATE TABLE diagnostic_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    overall_status VARCHAR(20) NOT NULL,     -- 'healthy', 'warning', 'critical', 'error'
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ NOT NULL,
    duration_seconds FLOAT,
    checks JSONB NOT NULL,                    -- Array of CheckResult
    summary TEXT,
    triggered_by VARCHAR(50) DEFAULT 'manual',  -- 'manual', 'logic_rule', 'schedule'
    triggered_by_user INTEGER REFERENCES user_accounts(id),
    exported_at TIMESTAMPTZ,                  -- Wann als Markdown exportiert
    export_path TEXT                           -- Pfad im Repo
);

CREATE INDEX ix_diagnostic_reports_started ON diagnostic_reports(started_at DESC);
```

### 4D.1.4 — REST-API Endpoints

**Datei:** `El Servador/god_kaiser_server/src/api/v1/diagnostics.py` (NEU)

```python
router = APIRouter(prefix="/v1/diagnostics", tags=["diagnostics"])

@router.post("/run")
async def run_full_diagnostic(current_user = Depends(get_current_user)):
    """Volle Diagnose starten (alle 10 Checks)."""

@router.post("/run/{check_name}")
async def run_single_check(check_name: str, current_user = Depends(get_current_user)):
    """Einzelnen Diagnose-Check starten."""

@router.get("/history")
async def get_diagnostic_history(limit: int = 20, current_user = Depends(get_current_user)):
    """Diagnose-Historie (letzte N Reports)."""

@router.get("/history/{report_id}")
async def get_diagnostic_report(report_id: UUID, current_user = Depends(get_current_user)):
    """Einzelnen Diagnose-Report abrufen."""

@router.post("/export/{report_id}")
async def export_report_as_markdown(report_id: UUID, current_user = Depends(get_current_user)):
    """Report als Markdown exportieren (Antwort = Markdown-String)."""

@router.get("/checks")
async def list_available_checks():
    """Verfuegbare Diagnose-Checks auflisten."""
```

### Verifikation Block 4D.1

- [ ] `DiagnosticsService` instanziierbar mit allen Dependencies
- [ ] Alle 10 Checks laufen einzeln fehlerfrei (auch wenn Services degraded)
- [ ] `run_full_diagnostic()` fuehrt alle 10 Checks sequenziell aus
- [ ] `overall_status` = worst-of aller Check-Ergebnisse
- [ ] Report wird in `diagnostic_reports` Tabelle persistiert
- [ ] API: `POST /v1/diagnostics/run` → 200 mit vollstaendigem Report
- [ ] API: `POST /v1/diagnostics/run/server` → 200 mit einzelnem CheckResult
- [ ] API: `GET /v1/diagnostics/history` → Liste der Reports (sortiert nach Datum)
- [ ] API: `GET /v1/diagnostics/checks` → 10 Check-Namen
- [ ] Fehlerfall: Check-Methode wirft Exception → CheckResult mit status=ERROR (kein Crash)

---

## Block 4D.2: Report-System (~4-5h)

### 4D.2.1 — Markdown-Report-Generator

**Datei:** `El Servador/god_kaiser_server/src/services/diagnostics_report_generator.py` (NEU)

Generiert maschinenlesbare + menschenlesbare Markdown-Reports:

```python
class DiagnosticsReportGenerator:
    """Generiert Markdown-Reports aus DiagnosticReport Objekten."""

    def generate_markdown(self, report: DiagnosticReport) -> str:
        lines = [
            f'# Diagnose-Report {report.started_at[:10]}',
            f'',
            f'> **Status:** {self._status_emoji(report.overall_status)} {report.overall_status.value.upper()}',
            f'> **Zeitpunkt:** {report.started_at}',
            f'> **Dauer:** {report.duration_seconds:.1f}s',
            f'> **Trigger:** {report.triggered_by}',
            f'',
            f'---',
            f'',
            f'## Ergebnis-Uebersicht',
            f'',
            f'| Check | Status | Dauer | Meldung |',
            f'|-------|--------|-------|---------|',
        ]

        for check in report.checks:
            emoji = self._status_emoji(check.status)
            lines.append(
                f'| {check.name} | {emoji} {check.status.value} | {check.duration_ms:.0f}ms | {check.message} |'
            )

        lines.extend(['', '---', '', '## Detail-Ergebnisse', ''])

        for check in report.checks:
            lines.extend([
                f'### {check.name} — {self._status_emoji(check.status)} {check.status.value}',
                f'',
                f'{check.message}',
                f'',
            ])
            if check.metrics:
                lines.append('**Metriken:**')
                for key, value in check.metrics.items():
                    lines.append(f'- {key}: {value}')
                lines.append('')
            if check.recommendations:
                lines.append('**Empfehlungen:**')
                for rec in check.recommendations:
                    lines.append(f'- [ ] {rec}')
                lines.append('')

        lines.extend([
            '---',
            '',
            '## Naechste Schritte',
            '',
        ])

        critical = [c for c in report.checks if c.status == CheckStatus.CRITICAL]
        warnings = [c for c in report.checks if c.status == CheckStatus.WARNING]

        if critical:
            lines.append('**KRITISCH (sofort handeln):**')
            for c in critical:
                for rec in c.recommendations:
                    lines.append(f'- [ ] {rec}')
            lines.append('')
        if warnings:
            lines.append('**Warnungen (zeitnah pruefen):**')
            for c in warnings:
                for rec in c.recommendations:
                    lines.append(f'- [ ] {rec}')

        return '\n'.join(lines)

    def _status_emoji(self, status: CheckStatus) -> str:
        return {'healthy': '✅', 'warning': '⚠️', 'critical': '❌', 'error': '💥'}.get(status.value, '❓')
```

### 4D.2.2 — Export-Endpoint

Der `POST /v1/diagnostics/export/{report_id}` Endpoint gibt den generierten Markdown als Response zurueck. Das Frontend kann den Markdown als Datei herunterladen oder direkt anzeigen.

**WICHTIG:** Der Export schreibt NICHT direkt ins Dateisystem (das waere ein Sicherheitsrisiko bei einem Web-Server). Stattdessen gibt die API den Markdown als String zurueck und das Frontend bietet einen Download-Button. Robin kann die Datei dann manuell in `arbeitsbereiche/automation-one/diagnosen/` speichern.

### Verifikation Block 4D.2

- [ ] Report-Markdown ist korrekt formatiert (Tabellen, Checklisten, Ueberschriften)
- [ ] Status-Emojis werden korrekt gemappt
- [ ] Metriken und Empfehlungen pro Check enthalten
- [ ] "Naechste Schritte" listet Critical + Warning Empfehlungen
- [ ] API: `POST /v1/diagnostics/export/{id}` → 200 mit Markdown-String
- [ ] Markdown ist in Standard-Markdown-Viewer korrekt darstellbar

---

## Block 4D.3: Frontend Diagnostics Hub UI (~6-8h)

### 4D.3.1 — Frontend API-Client

**Datei:** `El Frontend/src/api/diagnostics.ts` (NEU)

```typescript
export interface CheckResult {
  name: string
  status: 'healthy' | 'warning' | 'critical' | 'error'
  message: string
  details: Record<string, unknown>
  metrics: Record<string, unknown>
  recommendations: string[]
  duration_ms: number
}

export interface DiagnosticReport {
  id: string
  overall_status: 'healthy' | 'warning' | 'critical' | 'error'
  started_at: string
  finished_at: string
  duration_seconds: number
  checks: CheckResult[]
  summary: string
  triggered_by: 'manual' | 'logic_rule' | 'schedule'
}

export async function runFullDiagnostic(): Promise<DiagnosticReport>
export async function runSingleCheck(checkName: string): Promise<CheckResult>
export async function getDiagnosticHistory(limit?: number): Promise<DiagnosticReport[]>
export async function getDiagnosticReport(reportId: string): Promise<DiagnosticReport>
export async function exportReportAsMarkdown(reportId: string): Promise<string>
export async function listAvailableChecks(): Promise<string[]>
```

### 4D.3.2 — Pinia Store

**Datei:** `El Frontend/src/shared/stores/diagnostics.store.ts` (NEU)

```typescript
export const useDiagnosticsStore = defineStore('diagnostics', () => {
  const currentReport = ref<DiagnosticReport | null>(null)
  const history = ref<DiagnosticReport[]>([])
  const isRunning = ref(false)
  const runningCheck = ref<string | null>(null)

  async function runDiagnostic() { ... }
  async function runCheck(checkName: string) { ... }
  async function loadHistory() { ... }
  async function exportReport(reportId: string) { ... }

  return { currentReport, history, isRunning, runningCheck, runDiagnostic, runCheck, loadHistory, exportReport }
})
```

### 4D.3.3 — DiagnoseTab.vue (NEU)

**Datei:** `El Frontend/src/components/system-monitor/DiagnoseTab.vue` (NEU)

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│ [▶ Volle Diagnose starten]          Letzte: vor 15m ✅      │
│──────────────────────────────────────────────────────────────│
│                                                              │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ Server   │ │ Database │ │   MQTT   │ │   ESPs   │       │
│ │   ✅     │ │   ✅     │ │   ✅     │ │   ⚠️    │       │
│ │ [Pruefen]│ │ [Pruefen]│ │ [Pruefen]│ │ [Pruefen]│       │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ Sensors  │ │Actuators │ │Monitoring│ │  Logic   │       │
│ │   ✅     │ │   ✅     │ │   ✅     │ │   ✅     │       │
│ │ [Pruefen]│ │ [Pruefen]│ │ [Pruefen]│ │ [Pruefen]│       │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
│ ┌──────────┐ ┌──────────┐                                  │
│ │  Alerts  │ │ Plugins  │                                  │
│ │   ✅     │ │   ✅     │                                  │
│ │ [Pruefen]│ │ [Pruefen]│                                  │
│ └──────────┘ └──────────┘                                  │
│                                                              │
│ ▸ Ergebnis-Details (expandierbar pro Check)                 │
│   Server: 4d 12h uptime, CPU 23%, RAM 68%                  │
│   Empfehlungen: keine                                       │
└──────────────────────────────────────────────────────────────┘
```

**Verhalten:**
- "Volle Diagnose starten" Button → `diagnosticsStore.runDiagnostic()`
- Jeder Check als Card mit Status-Dot + "Pruefen" Button fuer Einzel-Check
- Waehrend Diagnose: Spinner auf jeder Card, sequenziell gruen/gelb/rot werdend
- Expandierbarer Detail-Bereich pro Check: Metriken + Empfehlungen
- Letztes Ergebnis bleibt sichtbar bis neue Diagnose gestartet wird

### 4D.3.4 — ReportsTab.vue (NEU)

**Datei:** `El Frontend/src/components/system-monitor/ReportsTab.vue` (NEU)

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│ Reports                                                      │
│──────────────────────────────────────────────────────────────│
│                                                              │
│ | Datum      | Status | Dauer  | Trigger | Aktion          │
│ |------------|--------|--------|---------|-----------------|  │
│ | 2026-03-03 | ✅     | 3.2s   | Manuell | [Anzeigen] [⬇] │
│ | 2026-03-02 | ⚠️     | 4.1s   | Rule    | [Anzeigen] [⬇] │
│ | 2026-03-01 | ✅     | 2.8s   | Manuell | [Anzeigen] [⬇] │
│                                                              │
│ ▸ Report-Detail (wenn "Anzeigen" geklickt)                  │
│   [Rendered Markdown des Reports]                            │
│   [Als Markdown herunterladen]                               │
└──────────────────────────────────────────────────────────────┘
```

**Verhalten:**
- Liste aller Diagnose-Reports (sortiert nach Datum, neueste oben)
- "Anzeigen" → Report-Detail expandiert mit gerenderten Markdown
- Download-Button → `exportReport(id)` → Markdown als .md Datei herunterladen
- Pagination: Letzte 20 Reports, "Mehr laden" Button

### 4D.3.5 — Integration in SystemMonitorView

**Datei:** `El Frontend/src/views/SystemMonitorView.vue` (ERWEITERN)
**Datei:** `El Frontend/src/components/system-monitor/MonitorTabs.vue` (ERWEITERN)

2 neue Tabs zur bestehenden Tab-Leiste hinzufuegen:

**Datei:** `El Frontend/src/components/system-monitor/types.ts` (ERWEITERN)
```typescript
// IST: export type TabId = 'events' | 'logs' | 'database' | 'mqtt' | 'health'
// NEU:
export type TabId = 'events' | 'logs' | 'database' | 'mqtt' | 'health' | 'diagnostics' | 'reports'
```

**Datei:** `El Frontend/src/components/system-monitor/MonitorTabs.vue` (ERWEITERN)
```typescript
// Bestehende Tabs (mit Icons aus lucide-vue-next):
const tabs: Tab[] = [
  { id: 'events', label: 'Ereignisse', icon: Activity },
  { id: 'logs', label: 'Server Logs', icon: FileText },
  { id: 'database', label: 'Datenbank', icon: Database },
  { id: 'mqtt', label: 'MQTT Traffic', icon: MessageSquare },
  { id: 'health', label: 'Health', icon: HeartPulse },
  // NEU:
  { id: 'diagnostics', label: 'Diagnosen', icon: Stethoscope },  // lucide-vue-next
  { id: 'reports', label: 'Reports', icon: ClipboardList },       // lucide-vue-next
]
```

**Datei:** `El Frontend/src/views/SystemMonitorView.vue` (ERWEITERN)
- Deep-Linking: `if (['events', 'logs', 'database', 'mqtt'].includes(tab))` erweitern um `'health', 'diagnostics', 'reports'`

### 4D.3.6 — HealthTab.vue erweitern + Wartung-Konsolidierung

**Datei:** `El Frontend/src/components/system-monitor/HealthTab.vue` (ERWEITERN)

#### A) Neue KPI-Cards (unter den bestehenden 5):

- **Server** — CPU%, RAM%, Uptime (aus `/v1/health/detailed`)
- **MQTT** — Connected/Disconnected, Message-Rate (aus `/v1/health/detailed`)
- **Monitoring** — Grafana/Prometheus/Loki Status (aus Diagnose-Check)
- **Logic Engine** — Aktive Rules, Executions/24h (aus Diagnose-Check)
- **Plugins** — Registriert/Aktiv (aus Phase 4C Plugin-Store)

**Bestehende 5 KPI-Cards bleiben unveraendert:**
- Geraete Online, Durchschn. Heap, Durchschn. RSSI, Probleme, Aktive Alerts

#### B) Wartung-Tab Konsolidierung in Health-Tab:

**ENTSCHEIDUNG (Robin):** Der separate `/maintenance` View (MaintenanceView.vue) wird in den Health-Tab integriert. Keine Duplikate, alles hat seinen Bestimmungsort.

**Was MaintenanceView.vue aktuell zeigt (wird in Health-Tab uebernommen):**
- Service Status (running/stopped) → Bereits durch neue Server-KPI-Card abgedeckt
- Cleanup Config (Sensor Data Retention, Command History, Orphaned Mocks) → Neuer Bereich "Wartung" im Health-Tab
- Maintenance Jobs mit Run-Button (6 Jobs) → Neuer Bereich "Wartungs-Jobs" im Health-Tab
- API: `GET /debug/maintenance/status`, `GET /debug/maintenance/config`, `POST /debug/maintenance/trigger/{jobName}` (BLEIBEN unveraendert)

**Aenderungen:**
1. Health-Tab bekommt neuen aufklappbaren Bereich "Wartung & Cleanup" (unter den KPI-Cards, ueber der Device-Tabelle)
2. Maintenance Jobs (6 Stueck) mit Run-Buttons werden dort angezeigt
3. Cleanup Config (Retention-Einstellungen) werden dort angezeigt
4. Sidebar-Link "Wartung" (`/maintenance`) wird auf `/system-monitor?tab=health` umgeleitet
5. MaintenanceView.vue bleibt als Datei bestehen (Redirect), wird aber nicht mehr direkt genutzt

**Bestehende API-Anbindung aus `api/debug.ts` wiederverwenden:**
- `debugApi.getMaintenanceStatus()` → Service Status + Jobs
- `debugApi.getMaintenanceConfig()` → Cleanup Config
- `debugApi.triggerMaintenanceJob(jobId)` → Job triggern

### Verifikation Block 4D.3

- [ ] DiagnoseTab: "Volle Diagnose" Button startet alle 10 Checks
- [ ] DiagnoseTab: Einzelne "Pruefen" Buttons funktionieren
- [ ] DiagnoseTab: Status-Cards zeigen korrekte Farben (gruen/gelb/rot)
- [ ] DiagnoseTab: Detail-Bereich zeigt Metriken + Empfehlungen
- [ ] ReportsTab: Liste zeigt alle Reports sortiert nach Datum
- [ ] ReportsTab: "Anzeigen" expandiert mit gerendertem Markdown
- [ ] ReportsTab: Download-Button liefert .md Datei
- [ ] MonitorTabs: 7 Tabs sichtbar (5 bestehend + 2 neu)
- [ ] HealthTab: Neue KPI-Cards zeigen System-Komponenten-Status
- [ ] HealthTab: Wartungs-Bereich zeigt Maintenance Jobs + Cleanup Config (aus MaintenanceView konsolidiert)
- [ ] HealthTab: Maintenance Job Run-Buttons funktionieren (via debugApi.triggerMaintenanceJob)
- [ ] Sidebar: "Wartung" Link redirected auf `/system-monitor?tab=health`
- [ ] Deep-Linking: URL-Synchronisation fuer neue Tabs funktioniert
- [ ] TabId Type: Erweitert um 'diagnostics' | 'reports' in `types.ts`

---

## Block 4D.4: Diagnose-Trigger via Logic Engine (~2-3h)

### 4D.4.1 — DiagnosticsConditionEvaluator (NEU)

**Datei:** `El Servador/god_kaiser_server/src/services/logic/conditions/diagnostics_evaluator.py` (NEU)

Neuer Condition-Evaluator der den Diagnose-Status als Trigger nutzt:

```python
class DiagnosticsConditionEvaluator(BaseConditionEvaluator):
    """Prueft ob ein bestimmter Diagnose-Check einen bestimmten Status hat."""

    def supports(self, condition_type: str) -> bool:
        return condition_type == 'diagnostics_status'

    async def evaluate(self, condition: dict, context: dict) -> bool:
        check_name = condition.get('check_name')       # z.B. 'database'
        expected_status = condition.get('status')       # z.B. 'warning'
        duration_minutes = condition.get('duration', 0) # Wie lange im Status (Min)

        # Letzten Diagnose-Report lesen
        last_report = await self.diagnostics_service.get_latest_report()
        if not last_report:
            return False

        check = next((c for c in last_report.checks if c['name'] == check_name), None)
        if not check:
            return False

        return check['status'] == expected_status
```

### 4D.4.2 — DiagnosticsActionExecutor (NEU)

**Datei:** `El Servador/god_kaiser_server/src/services/logic/actions/diagnostics_executor.py` (NEU)

Neuer Action-Executor der eine Diagnose startet:

```python
class DiagnosticsActionExecutor(BaseActionExecutor):
    """Startet eine Diagnose als Action einer Logic Rule."""

    def supports(self, action_type: str) -> bool:
        return action_type == 'run_diagnostic'

    async def execute(self, action: dict, context: dict) -> ActionResult:
        check_name = action.get('check_name')  # Optional: einzelner Check

        if check_name:
            result = await self.diagnostics_service.run_single_check(check_name)
            return ActionResult(
                success=True,
                message=f'Check {check_name}: {result.status.value}',
                data={'check': result.__dict__},
            )
        else:
            report = await self.diagnostics_service.run_full_diagnostic(triggered_by='logic_rule')
            return ActionResult(
                success=True,
                message=f'Diagnose abgeschlossen: {report.overall_status.value}',
                data={'report_id': report.id},
            )
```

### 4D.4.3 — Registration in LogicEngine

**Datei:** `El Servador/god_kaiser_server/src/services/logic_engine.py` (ERWEITERN)

```python
# In LogicEngine.__init__():
self.condition_evaluators = [
    SensorConditionEvaluator(),
    TimeConditionEvaluator(),
    HysteresisConditionEvaluator(),           # EXISTIERT BEREITS (war im Plan nicht gelistet)
    CompoundConditionEvaluator([...]),
    DiagnosticsConditionEvaluator(diagnostics_service),  # NEU
]

self.action_executors = [
    ActuatorActionExecutor(actuator_service),
    DelayActionExecutor(),
    NotificationActionExecutor(),
    SequenceActionExecutor(...),              # EXISTIERT BEREITS (war im Plan nicht gelistet)
    PluginActionExecutor(plugin_service),     # Phase 4C
    DiagnosticsActionExecutor(diagnostics_service),  # NEU
]
```

### 4D.4.4 — Frontend: Neuer Condition + Action Typ

**Datei:** `El Frontend/src/types/logic.ts` (ERWEITERN)

```typescript
// Neue Condition:
interface DiagnosticsCondition {
  type: 'diagnostics_status'
  check_name: string       // z.B. 'database', 'mqtt'
  status: 'warning' | 'critical'
  duration?: number        // Minuten im Status
}

// Neue Action:
interface DiagnosticsAction {
  type: 'run_diagnostic'
  check_name?: string      // Optional: einzelner Check, sonst volle Diagnose
}
```

**Datei:** `El Frontend/src/components/logic/RuleConfigPanel.vue` (ERWEITERN)

Neuer Condition-Typ "Diagnose-Status" und neuer Action-Typ "Diagnose starten" im Dropdown.

**Beispiel-Rule:** "Wenn Database-Check WARNING fuer 5 Minuten → Volle Diagnose starten + Notification an Admin"

### Verifikation Block 4D.4

- [ ] `DiagnosticsConditionEvaluator.supports('diagnostics_status')` → True
- [ ] Condition evaluiert korrekt gegen letzten Report
- [ ] `DiagnosticsActionExecutor.supports('run_diagnostic')` → True
- [ ] Action startet volle Diagnose und persistiert Report
- [ ] Action startet einzelnen Check wenn `check_name` angegeben
- [ ] Frontend: "Diagnose-Status" als Condition-Typ im Dropdown
- [ ] Frontend: "Diagnose starten" als Action-Typ im Dropdown
- [ ] Beispiel-Rule: "Wenn DB warning → Diagnose" funktioniert E2E

---

## Tests fuer Phase 4D (~15-20 neue Tests)

| Testdatei | Tests | Was wird getestet |
|-----------|-------|-------------------|
| `test_diagnostics_service.py` | 5 | run_full (10 checks), run_single, persist report, error handling (check throws), overall_status worst-of |
| `test_diagnostics_api.py` | 4 | POST run, POST run/{name}, GET history, GET checks |
| `test_diagnostics_checks.py` | 5 | server check, database check (orphans), mqtt check (disconnected), esp check (offline devices), monitoring check (unreachable) |
| `test_diagnostics_report.py` | 3 | markdown generation, status emojis, recommendations formatting |
| `test_diagnostics_logic.py` | 3 | condition evaluator, action executor (full + single), registration |

---

## Reihenfolge der Implementation

```
Block 4D.1 (Backend DiagnosticsService)
├── 4D.1.1 DiagnosticsService mit 10 Checks
├── 4D.1.2 Die 10 Check-Methoden implementieren
├── 4D.1.3 DB-Migration (diagnostic_reports)
└── 4D.1.4 REST-API Endpoints
    ↓
Block 4D.2 (Report-System)
├── 4D.2.1 Markdown-Report-Generator
└── 4D.2.2 Export-Endpoint
    ↓
Block 4D.3 (Frontend UI)
├── 4D.3.1 API-Client (diagnostics.ts)
├── 4D.3.2 Pinia Store (diagnostics.store.ts)
├── 4D.3.3 DiagnoseTab.vue
├── 4D.3.4 ReportsTab.vue
├── 4D.3.5 Integration in SystemMonitorView (2 neue Tabs)
└── 4D.3.6 HealthTab.vue erweitern (System-KPIs)
    ↓
Block 4D.4 (Logic Engine Integration)
├── 4D.4.1 DiagnosticsConditionEvaluator
├── 4D.4.2 DiagnosticsActionExecutor
├── 4D.4.3 Registration in LogicEngine
└── 4D.4.4 Frontend Action/Condition Typen
```

**Block 4D.1 → 4D.2 → 4D.3 → 4D.4** (sequenziell)

---

## Abschluss-Verifikation (Gesamttest Phase 4D)

- [ ] "Volle Diagnose" startet alle 10 Checks und zeigt Ergebnis
- [ ] Jeder der 10 Checks einzeln startbar mit korrektem Ergebnis
- [ ] Report wird in DB persistiert und in History-Liste angezeigt
- [ ] Report-Export als Markdown korrekt formatiert
- [ ] DiagnoseTab mit 10 Check-Cards und Status-Anzeige
- [ ] ReportsTab mit History-Liste und Detail-Ansicht
- [ ] HealthTab mit erweiterten System-KPI-Cards + Wartung-Konsolidierung (Jobs + Cleanup Config)
- [ ] SystemMonitorView hat 7 Tabs (5 + 2 neue)
- [ ] Sidebar "Wartung" leitet auf `/system-monitor?tab=health` um (kein separater View mehr)
- [ ] Logic Rule "Wenn DB warning → Diagnose starten" funktioniert
- [ ] Bestehende Tabs (Ereignisse, Logs, DB, MQTT, Health) funktionieren ohne Regression
- [ ] Bestehende Tests laufen weiterhin fehlerfrei
- [ ] Neue ~20 Tests laufen fehlerfrei
