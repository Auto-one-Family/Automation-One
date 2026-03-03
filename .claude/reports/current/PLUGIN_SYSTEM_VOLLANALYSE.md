# Plugin-System Vollanalyse — Server + Frontend

> **Erstellt:** 2026-03-03
> **Agents:** server-development + frontend-development
> **Scope:** Alle Dateien des Plugin-Systems (Backend + Frontend)
> **Ergebnis:** System ist zu ~85% korrekt und pattern-konform. 3 echte Bugs, 4 Duplikate, 5 fehlende Features.

---

## 1. DUPLIKATE (Code-Wiederholungen)

### D1: `_extract_list()` — 3x dupliziert, leicht inkonsistent

| Datei | Zeile | Fallback-Keys |
|-------|-------|---------------|
| `health_check.py` | 335-342 | `(key, "data", "items")` |
| `debug_fix.py` | 544-552 | `(key, "data", "items", "results")` |
| `system_cleanup.py` | 256-264 | `(key, "data", "items", "results")` |

**Problem:** `health_check.py` fehlt `"results"` als Fallback-Key. Die Methode ist identisch bis auf diesen Unterschied.
**Fix:** In `AutoOpsPlugin` (base_plugin.py) als Basismethode implementieren mit allen 4 Keys. Aus den 3 Plugins entfernen.

### D2: `_description` (Decorator) vs `description` (Property) — Toter Code

Jedes Plugin hat **zwei** Beschreibungen:
- `@plugin_metadata(description="...")` → setzt `cls._description` (Deutsch, user-facing)
- `@property def description` → gibt englischen String zurück (dev-facing)

`plugin_service.py:58` liest `plugin.description` (Property), **NICHT** `_description` (Decorator).
→ Die deutschen Beschreibungen im Decorator sind **toter Code**, sie werden nie gelesen.

| Plugin | Decorator `_description` (DE) | Property `description` (EN) | DB bekommt |
|--------|------|------|------|
| health_check | "Prueft Server, Auth, Devices..." | "System-wide health validation..." | EN (Property) |
| esp_configurator | "Erstellt und konfiguriert..." | "Autonomous ESP32 configuration..." | EN (Property) |
| debug_fix | "Diagnostiziert Probleme..." | "Autonomous debug & fix agent..." | EN (Property) |
| system_cleanup | "Raeumt veraltete Daten..." | "System cleanup and maintenance..." | EN (Property) |

**Fix:** Entweder:
- A) `plugin_service.py` auf `getattr(plugin, "_description", plugin.description)` ändern (bevorzugt Decorator)
- B) `description`-Parameter aus `@plugin_metadata` entfernen und nur Property nutzen

### D3: `discover_plugins()` wird 2x aufgerufen in main.py

| Stelle | Zeile | Zweck |
|--------|-------|-------|
| Logic Engine Init | 559-560 | `_plugin_registry.discover_plugins()` für PluginActionExecutor |
| DB Sync | 627-628 | `plugin_registry.discover_plugins()` für sync_registry_to_db |

Singleton-Pattern (`PluginRegistry.__new__`) garantiert gleiche Instanz, aber `discover_plugins()` prüft intern gegen bereits registrierte Klassen — zweiter Aufruf ist harmlos aber unnötig.

### D4: `PluginService` wird 2x instanziiert in main.py

| Stelle | Zeile | Session |
|--------|-------|---------|
| Logic Engine Init | 561 | `session` aus Step 6 `async for session` |
| DB Sync | 629 | Neue `session` aus separatem `async for session` |

Die Logic Engine erhält eine `PluginService` mit einer Session, die möglicherweise geschlossen wird bevor die Logic Engine sie nutzt (Session-Lifecycle-Risiko bei lange laufender Engine).

---

## 2. KORREKTHEIT — Bestätigte Befunde

### Backend — Was KORREKT funktioniert

| Bereich | Status | Details |
|---------|--------|---------|
| Plugin Discovery | ✅ OK | `pkgutil.iter_modules()` findet alle 4 Plugins, Duplikat-Check vorhanden |
| `@plugin_metadata` Decorator | ✅ OK | `_display_name`, `_category`, `_config_schema` korrekt gesetzt |
| `PluginCapability` Enum | ✅ OK | 8 Capabilities, alle 4 Plugins nutzen korrekte Subset |
| `PluginResult` Serialisierung | ✅ OK | `_serialize_plugin_result()` serialisiert alle Felder inkl. `questions` |
| `PluginResult.success/failure/needs_input` | ✅ OK | Factory-Methoden korrekt implementiert |
| `AutoOpsPlugin` Lifecycle | ✅ OK | validate → plan → execute → rollback → report |
| Rollback-Logik | ✅ OK | Bei `result.success=False` UND Exception — rollback wird mit echten Actions aufgerufen |
| ESPConfiguratorPlugin Rollback | ✅ OK | Löscht erstellte Devices, leert Context-Listen |
| REST API Router Registration | ✅ OK | `__init__.py:30+65` — plugins_router korrekt eingebunden |
| 8 Endpoints | ✅ OK | list, detail, execute, config, history, enable, disable, schedule |
| Auth-Matrix | ✅ OK | list/detail/execute/history = ActiveUser, config/enable/disable/schedule = AdminUser |
| Error Handling 404/409 | ✅ OK | PluginNotFoundError → 404, PluginDisabledError → 409 |
| DB Models | ✅ OK | `PluginConfig` + `PluginExecution` korrekt definiert, `__init__.py` Import vorhanden |
| FK CASCADE | ✅ OK | `PluginExecution.plugin_id` → `plugin_configs.plugin_id` ON DELETE CASCADE |
| Logic Engine Registration | ✅ OK | `main.py:554-578` — PluginActionExecutor an Position 5 von 6 |
| `PluginTriggerAction` Validation | ✅ OK | `logic_validation.py:279-297` — Pydantic Model mit `plugin_id` min=1, max=128 |
| Action Dispatch | ✅ OK | `logic_validation.py:395-396` — `"plugin"` und `"autoops_trigger"` erkannt |
| Schedule-Service | ✅ OK | **ÜBERRASCHUNG** — `update_schedule()` hat vollständige APScheduler-Integration (Zeile 296-334) |

### Frontend — Was KORREKT funktioniert

| Bereich | Status | Details |
|---------|--------|---------|
| API Client (`plugins.ts`) | ✅ OK | 7 Funktionen, TypeScript-Typen korrekt |
| `PluginExecutionDTO.status` | ✅ OK | Union-Type: `'success' \| 'error' \| 'failure' \| 'running' \| 'timeout'` |
| Pinia Store | ✅ OK | Setup Store Pattern, State/Getters/Actions vollständig |
| `pluginOptions` Getter | ✅ OK | Für RuleFlowEditor Plugin-Dropdown vorbereitet |
| PluginsView | ✅ OK | Grid, Filter-Chips, Detail-SlideOver, ConfigDialog, History |
| PluginCard | ✅ OK | Status-Dot, Kategorie-Label (DE), Capabilities, LastExec, Execute/Toggle |
| PluginConfigDialog | ✅ OK | **L2 GELÖST** — `select`-Typ vorhanden (Zeile 110-123), **L3 GELÖST** — `label` wird genutzt (Zeile 51) |
| PluginExecutionHistory | ✅ OK | **L12 GELÖST** — `error` UND `failure` beide in STATUS_CONFIG (Zeile 24-25) |
| RuleFlowEditor Plugin-Node | ✅ OK | Rendering, Serialisierung `pluginId → plugin_id`, Farbe #f59e0b |
| Empty State | ✅ OK | "Keine Plugins gefunden" bei leerer Liste |
| Design-Tokens | ✅ OK | `var(--color-*)`, `var(--text-*)`, `var(--radius-*)`, `var(--transition-*)` konsistent |
| BEM-Naming | ✅ OK | `plugins-view__*`, `plugin-card__*`, `plugin-detail__*`, `config-dialog__*`, `exec-history__*` |

---

## 3. BUGS & FEHLER

### B1: `server_url` hardcoded — MITTEL

**Datei:** `plugin_service.py:199`
```python
autoops_context = AutoOpsContext(
    server_url="http://localhost:8000",  # ← HARDCODED
    device_mode=DeviceMode.MOCK,
)
```
**Problem:** Im Docker-Netzwerk heißt der Server `el-servador:8000`, nicht `localhost:8000`. Plugins können sich nicht selbst erreichen wenn im Container.
**Fix:** `settings.server_url` oder `settings.base_url` aus Config lesen.

### B2: `description` Duplikat-Konflikt — NIEDRIG (aber verwirrend)

Siehe D2 oben. DB bekommt englische Property-Beschreibung, Frontend zeigt englische Texte obwohl Decorator deutsche hat.

### B3: Fehlender Index auf `started_at` — NIEDRIG

**Datei:** `db/models/plugin.py:57-60`
```python
started_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True), nullable=False, default=_utc_now,
)  # ← KEIN index=True
```
**Problem:** Alle History-Queries sortieren nach `started_at DESC`. Bei wachsender Tabelle wird das langsam.
**Fix:** `index=True` hinzufügen + Alembic Migration.

---

## 4. FEHLENDE FEATURES (Bestätigung des Auftrags)

### L4: PluginContext Enrichment — FEHLT

`PluginContext` hat Felder `esp_devices` und `active_alerts`, aber `plugin_service.py:execute_plugin()` befüllt sie nie.
**Betroffen:** Plugins die Device-Informationen oder Alert-Status brauchen bekommen leere Listen.

### L10: WebSocket-Events — FEHLT

`plugin_service.py` hat **keinen** WebSocket-Broadcast. Kein `plugin_execution_started`, kein `plugin_execution_completed`.
**Betroffen:** Frontend muss manuell refreshen statt Echtzeit-Updates zu bekommen.

### L11: RuleConfigPanel Plugin-Config — FEHLT

`RuleConfigPanel.vue` enthält **0** Plugin-Referenzen (Grep bestätigt). Wenn ein Plugin-Node im RuleFlowEditor selektiert wird, erscheint kein Config-Panel.
**Betroffen:** Plugin-Nodes können erstellt aber nicht konfiguriert werden (kein Plugin-Dropdown, keine Config-Felder).

### L8: Prometheus-Metriken — FEHLT

`metrics.py` enthält **0** Plugin-Metriken (Grep bestätigt). Kein Counter, kein Histogram.

### L13: AuditLog-Integration — FEHLT

`plugin_service.py` importiert keinen AuditLog-Service. Plugin-Ausführungen, Config-Änderungen und Toggle-Aktionen werden nicht auditiert.

---

## 5. KORRIGIERTE BEFUNDE AUS DEM AUFTRAG

| Lücke | Auftrag sagt | Tatsächlicher Stand | Korrektur |
|-------|-------------|---------------------|-----------|
| L2 | Select-Typ fehlt im ConfigDialog | ✅ **GELÖST** — `<select>` Element vorhanden (Zeile 110-123) | Kein Fix nötig |
| L3 | label aus config_schema nicht genutzt | ✅ **GELÖST** — `label` wird als Erstes gelesen (Zeile 51) | Kein Fix nötig |
| L5 | Schedule-Service fehlt | ✅ **GELÖST** — APScheduler-Integration in `update_schedule()` (Zeile 296-334) | Kein Fix nötig |
| L6 | Sidebar-Navigation unklar | ✅ Vorhanden in Sidebar.vue | Kein Fix nötig |
| L12 | Status error≠failure Diskrepanz | ✅ **GELÖST** — Frontend behandelt `error` UND `failure` (Zeile 24-25) | Kein Fix nötig |

---

## 6. PATTERN-KONFORMITÄT

### Server-Patterns ✅

| Pattern | Konform? | Details |
|---------|----------|--------|
| 3-Schichten (API → Service → DB) | ✅ | API → PluginService → PluginConfig/PluginExecution |
| Repository-Pattern | ⚠️ TEILWEISE | `PluginService` nutzt `self.db.get()` und `self.db.execute()` direkt statt Repository-Klasse. Kein `PluginRepository` vorhanden |
| Pydantic-Schemas | ⚠️ TEILWEISE | API-Endpoints geben `dict` zurück statt Pydantic Response-Modelle |
| Error-Codes aus `error_codes.py` | ⚠️ TEILWEISE | Nur 2 generische Codes (5800-5801), keine plugin-spezifischen |
| Logging via `get_logger` | ✅ | Konsistent in allen Dateien |
| Safety-Check vor Actuator-Commands | N/A | Plugins nutzen REST-API, Safety-Check liegt im API-Layer |

### Frontend-Patterns ✅

| Pattern | Konform? | Details |
|---------|----------|--------|
| `<script setup lang="ts">` | ✅ | Alle 4 Komponenten |
| `defineProps<Props>()` + `defineEmits` | ✅ | Typisiert in allen Komponenten |
| Pinia Setup Store | ✅ | Composition API Pattern |
| `@/` Import-Alias | ✅ | Keine relativen Pfade |
| `lucide-vue-next` Icons | ✅ | Kein fremdes Icon-Paket |
| CSS-Tokens aus `tokens.css` | ✅ | `var(--color-*)`, `var(--text-*)` etc. durchgängig |
| Dark Theme ONLY | ✅ | Keine Light-Mode Styles |
| BEM-Naming | ✅ | Konsistent in allen Komponenten |
| Cleanup in `onUnmounted` | ✅ N/A | Keine Subscriptions/Listeners die bereinigt werden müssen |
| Responsive Grid | ✅ | `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))` |

### Pattern-Abweichungen

**1. Kein PluginRepository** — Alle anderen Features (Sensors, Actuators, ESP, etc.) nutzen `BaseRepository[Model]`. PluginService greift direkt auf `AsyncSession` zu. Das funktioniert, ist aber inkonsistent.

**2. API gibt `dict` statt Pydantic-Modelle zurück** — Andere Router (`sensors.py`, `actuators.py`) nutzen `response_model=SomeSchema` auf dem Endpoint. `plugins.py` baut manuell Dicts in den Endpoint-Funktionen. Das funktioniert, umgeht aber Pydantic-Validierung der Responses.

---

## 7. ZUSAMMENFASSUNG

### Priorisierte Fix-Liste

| # | Fix | Prio | Aufwand | Betroffene Dateien |
|---|-----|------|---------|--------------------|
| 1 | `_extract_list()` in Basis-Klasse verschieben | MUSS | 15min | base_plugin.py, health_check.py, debug_fix.py, system_cleanup.py |
| 2 | `_description` Decorator-Konflikt lösen | MUSS | 10min | plugin_service.py (1 Zeile) |
| 3 | `server_url` konfigurierbar machen | MUSS | 10min | plugin_service.py, core/config.py |
| 4 | Index auf `started_at` hinzufügen | SOLL | 15min | plugin.py, neue Alembic-Migration |
| 5 | RuleConfigPanel Plugin-Config | SOLL | 2h | RuleConfigPanel.vue |
| 6 | WebSocket-Events für Plugin-Execution | SOLL | 1h | plugin_service.py |
| 7 | AuditLog-Integration | SOLL | 30min | plugin_service.py |
| 8 | PluginContext Enrichment | KANN | 1h | plugin_service.py |
| 9 | Prometheus-Metriken | KANN | 30min | metrics.py, plugin_service.py |
| 10 | Plugin-spezifische Error-Codes | KANN | 20min | error_codes.py |
| 11 | PluginRepository erstellen | KANN | 1h | Neues File + plugin_service.py refactoring |
| 12 | Pydantic Response-Schemas | KANN | 1h | Neues Schema-File + plugins.py |

### Gesamtbewertung

```
Backend:   ████████░░  80%  (funktional korrekt, Pattern-Abweichungen, fehlende Observability)
Frontend:  █████████░  90%  (vollständig, L2/L3/L12 bereits gelöst, nur L11 fehlt)
Integration: ████████░░ 80%  (Logic Engine ✅, RuleConfigPanel ❌, Schedule ✅)
Gesamt:    ████████░░  85%
```

**Fazit:** Das Plugin-System ist funktional solide. Die 3 MUSS-Fixes (D1, D2, B1) sind kleine Änderungen (< 1h gesamt). Die wichtigste fehlende Feature ist L11 (RuleConfigPanel) — ohne sie können Plugin-Nodes in Rules nicht konfiguriert werden.
