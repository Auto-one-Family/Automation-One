# Report S2 — HTTP API: Router → Service → DB → Nebenkanäle

**Datum:** 2026-04-05  
**Code-Stand:** Branch `master` (lokaler Workspace), FastAPI-App-Introspection via `src.main:app`  
**Referenz:** `.claude/reference/api/REST_ENDPOINTS.md` (Version 4.0, 2026-04-04)  
**Auftrag:** `.claude/auftraege/Auto_One_Architektur/server/auftrag-server-S2-api-http-router-services-2026-04-05.md`

---

## 1. Executive Summary

Die öffentliche HTTP-Schicht besteht aus:

| Quelle | Mount in `main.py` | Präfix (effektiv) |
|--------|-------------------|-------------------|
| `api_v1_router` (`src/api/v1/__init__.py`) | `app.include_router(..., prefix="/api")` | `/api` + Router-`prefix=/v1/...` → **`/api/v1/...`** |
| `sensor_processing.router` (`src/api/sensor_processing.py`) | direkt, Router trägt `prefix="/api/v1/sensors"` | **`/api/v1/sensors/...`** (process, calibrate, types, health) |
| `websocket_realtime.router` | `prefix="/api/v1"` | **`/api/v1/ws/realtime/{client_id}`** |
| Root | `@app.get` | `/health`, `/`, OpenAPI-Docs |

**Vollständigkeitsmethode:** Enumeration aller `(HTTP-Methode, Pfad)`-Paare der montierten `FastAPI`-App (ohne `HEAD`/`OPTIONS`). Ergebnis: **~268 Paare** unter `/api/...` plus `/health` (Introspection-Lauf 2026-04-05; zuzüglich OpenAPI/Docs-Routen außerhalb dieser Zählung).

**Typischer Call-Graph (Lesend):**  
`HTTP → FastAPI-Handler → Depends(get_db) / ActiveUser|OperatorUser|AdminUser → Service(*Repository(session)) → SQLAlchemy select → Pydantic-Response`

**Typischer Call-Graph (Schreibend):**  
`HTTP → Handler → Service → Repository (INSERT/UPDATE/DELETE) → session.commit() (in Repo/Service, je nach Pattern) → Response`  
Optional: **`Publisher` / `MQTTCommandBridge` / `WebSocketManager.broadcast`** nach erfolgreichem DB-Schritt (best-effort, oft mit try/except + Log).

**Transaktionsgrenze:** Pro Request typisch **eine** `AsyncSession` aus `get_session()` / `get_db()`; Commits erfolgen in den aufgerufenen Repositories/Services — **kein** globales „Unit of Work“-Middleware. Nebenkanäle (MQTT/WS) sind **nachgelagert** und können bei Fehlern die API trotzdem als „erfolgreich“ zurückgeben, wenn nur der Publish fehlschlägt (siehe z. B. Aktuator-Config-Push).

---

## 2. Auth / Dependencies (Überblick)

| Dependency | Rolle | Typische Nutzung |
|------------|--------|------------------|
| `ActiveUser` | JWT, aktiver User | Lesezugriff, Health detailed, … |
| `OperatorUser` | JWT, Operator oder Admin | CRUD Sensoren/Aktoren, Zonen, Befehle, … |
| `AdminUser` | JWT, Admin | Debug, User-Management, Audit-Retention, … |
| `verify_api_key` | `X-API-Key` | `POST/GET` in `sensor_processing.py` (process, calibrate, types) |
| Kein User | öffentlich / speziell | `GET /api/v1/auth/status`, `POST /auth/setup`, `POST /auth/login`, `POST /auth/refresh` (siehe `auth.py`), `POST /api/v1/logs/frontend` (rate-limit IP), `POST /api/v1/webhooks/grafana-alerts` (ohne JWT in Router), Basis-`GET /api/v1/health/`, `GET /health` |

**Hinweis:** `REST_ENDPOINTS.md` formuliert global „JWT außer …“ — für **`/api/v1/sensors/types`** (sensor_processing) und **`/api/v1/sensors/process`** gilt in der Praxis **API-Key**, nicht Bearer-JWT.

---

## 3. Nebenkanäle — clusterweise (Schreibpfade)

| Cluster | MQTT (Auslöser) | WebSocket (Event-Typ, grob) |
|---------|-----------------|----------------------------|
| **Actuators** | `Publisher.publish_actuator_command`, Emergency: `kaiser/broadcast/emergency`, clear per Device-Topic | `actuator_alert`, Config-/Scope-Events bei Create/Update/Delete |
| **Sensors** | Config-Push an ESP nach Create/Update/Delete (wie Aktoren) | ggf. `device_scope_changed` / ähnliche Broadcasts nach Subzone-Sync |
| **ESP** | Restart, Reset, Config, Approve/Reject, assign_kaiser | Status/Discovery-abhängig |
| **Zone / Subzone** | Zone-Assign/Remove, Subzone-Assign über `MQTTCommandBridge` / Publisher (ACK-asynchron) | Nach erfolgreicher Operation häufig Broadcasts über `WebSocketManager` |
| **Logic** | Nach Rule-Änderungen: Config-Rebuild + MQTT Config-Push betroffener ESPs | Rule-/System-Events möglich |
| **Notifications** | optional (E-Mail), nicht primär MQTT | `NotificationRouter` → WS + ggf. E-Mail |
| **Auth MQTT configure** | Broker-Reload / Credential-Broadcast über `MQTTAuthService` | keiner zwingend |
| **Webhooks Grafana** | keiner | über `NotificationRouter` analog Notifications |
| **Debug Mock-ESP** | Simuliert MQTT-Pfade / interne Publisher | kann WS triggern je nach Pfad |
| **Device context** | keiner zwingend | **`device_context_changed`** |
| **Diagnostics / Backups / Export / Schema** | keiner (rein HTTP/FS/DB) | meist keiner |

**Command-Endpoints & Finalität (G3):**  
`POST /api/v1/actuators/.../command` setzt in der Response u. a. `acknowledged=False` mit Hinweis, dass **ACK asynchron per MQTT** erfolgt — HTTP-200 bedeutet **nicht** automatisch Hardware-Finalität. Gleiches Muster für **Zone/Subzone**-MQTT-Operationen: HTTP spiegelt Server-seitige Annahme/Enqueue; physische Bestätigung über ACK-Handler.

---

## 4. Kapitel pro Router-Modul

Pfade relativ zu `El Servador/god_kaiser_server/src/api/v1/`. Endpoints in der Tabelle **ohne** führendes `/api` (nur Router-Pfad ab `/v1/...`), vollständiger Aufruf = **`/api` + Tabelle**.

### 4.1 `auth.py` — `prefix=/v1/auth`

| Methode | Pfad | Auth |
|---------|------|------|
| GET | `/v1/auth/status` | — |
| POST | `/v1/auth/setup` | — |
| POST | `/v1/auth/login` | — |
| POST | `/v1/auth/login/form` | — |
| POST | `/v1/auth/register` | JWT |
| POST | `/v1/auth/refresh` | — |
| POST | `/v1/auth/logout` | JWT |
| GET | `/v1/auth/me` | JWT |
| POST | `/v1/auth/mqtt/configure` | Admin (siehe Handler) |
| GET | `/v1/auth/mqtt/status` | JWT |

**Call-Graph:** `UserRepository` / `TokenBlacklist` / `MQTTAuthService` / `SystemConfigRepository` — Schreibend: User-Setup, Tokens, MQTT-Broker-Credential-Config.  
**Nebenkanäle:** MQTT configure → Broker-Reload + optional Broadcast an Clients.

---

### 4.2 `audit.py` — `prefix=/v1/audit`

**~21 Endpoints** (GET-Schwerpunkt, Retention/Backups PUT/POST/DELETE).  
**Auth:** überwiegend **Admin** für Retention/Backups; Lesende teils **Active**.  
**Call-Graph:** `AuditLogRepository` + Backup-Helfer.  
**Nebenkanäle:** **keine** MQTT/WS-Pflicht.

---

### 4.3 `errors.py` — `prefix=/v1/errors`

| Methode | Pfad | Auth |
|---------|------|------|
| GET | `/v1/errors/esp/{esp_id}` | JWT |
| GET | `/v1/errors/summary` | JWT |
| GET | `/v1/errors/codes` | JWT |
| GET | `/v1/errors/codes/{error_code}` | JWT |

**Nebenkanäle:** keine.

---

### 4.4 `esp.py` — `prefix=/v1/esp`

**17+ Endpoints** inkl. `GET .../health/score`.  
**Call-Graph:** `ESPService` / `ESPRepository` / Config-Builder / Publisher für Device-Lifecycle.  
**Schreibend + MQTT:** `restart`, `reset`, `config` (sofern vorhanden), `approve`, `reject`, `assign_kaiser`, PATCH device.  
**Nebenkanäle:** Config-Push, Steuerungs-Publish; WS je nach Service (Status/Discovery).

---

### 4.5 `sensors.py` + `sensor_type_defaults.py`

**sensors.py** (`/v1/sensors/...`): Liste, CRUD per `esp_id`+`gpio`/`config_id`, `/data`, `/measure`, Onewire unter `/esp/{esp_id}/onewire`, alert-config, runtime.  
**sensor_type_defaults.py** (`/v1/sensors/type-defaults/...`): CRUD + effective.  
**Call-Graph:** `SensorService`, `SensorRepository`, ggf. `SubzoneService` + `Publisher` für Config.  
**Nebenkanäle:** MQTT Config nach Sensor-Änderungen; WS bei Scope/Subzone-Sync (wie Aktoren).

---

### 4.6 `src/api/sensor_processing.py` — `prefix=/api/v1/sensors` (separater Router)

| Methode | Pfad (voll) | Auth |
|---------|-------------|------|
| POST | `/api/v1/sensors/process` | API-Key + Rate-Limit |
| GET | `/api/v1/sensors/types` | API-Key |
| GET | `/api/v1/sensors/health` | öffentlich (Subsystem-Health) |
| POST | `/api/v1/sensors/calibrate` | API-Key |

**Call-Graph:** direkt Repos + `library_loader` — **kein** typischer `SensorService` für `/process`.  
**Nebenkanäle:** **keine** MQTT/WS im Happy Path (reine HTTP-Antwort).

---

### 4.7 `actuators.py` — `prefix=/v1/actuators`

Siehe Introspection-Liste (inkl. Deprecated Aliases `emergency-stop`).  
**Call-Graph:** `ActuatorService` → `SafetyService.validate_actuator_command` → `Publisher`; Emergency globale Sequenz mit Safety-Blockade.  
**Nebenkanäle:** **MQTT** zentral; **WS** bei Emergency und Deletes.

---

### 4.8 `health.py` — `prefix=/v1/health`

| Pfad | Auth |
|------|------|
| `GET /v1/health/` | — |
| `GET /v1/health/detailed` | JWT (ActiveUser) |
| weitere `/esp`, `/metrics`, `/live`, `/ready` | gemäß Handler |

**Nebenkanäle:** Lesend MQTT/WS-Status in detailed — **kein Publish**.

---

### 4.9 `logic.py` — `prefix=/v1/logic`

Rules CRUD, toggle, test, execution_history.  
**Call-Graph:** `LogicRepository`, `LogicEngine` / Helfer für Config-Push.  
**Nebenkanäle:** MQTT Config an betroffene ESPs nach Änderungen.

---

### 4.10 `debug.py` — `prefix=/v1/debug`

**~59 Endpoints** — Mock-ESP, DB-Explorer, Logs, Load-Test, Resilience, Maintenance.  
**Auth:** **Admin**.  
**Nebenkanäle:** vielfältig (MQTT-Simulation, Publisher), WS möglich.

---

### 4.11 `logs.py` — `prefix=/v1/logs`

| Methode | Pfad | Auth |
|---------|------|------|
| POST | `/v1/logs/frontend` | — (IP rate limit) |

**Nebenkanäle:** keine.

---

### 4.12 `notifications.py` — `prefix=/v1/notifications`

Listen, Prefs, PATCH read/ack/resolve, `send`, `test-email`.  
**Call-Graph:** `NotificationRouter`, `NotificationRepository`.  
**Nebenkanäle:** **WS** + optional E-Mail.

---

### 4.13 `intent_outcomes.py` — `prefix=/v1/intent-outcomes`

GET-Liste, GET by id — **read-only**.  
**Nebenkanäle:** keine.

---

### 4.14 `users.py` — `prefix=/v1/users`

User-CRUD, reset-password, `me/password`.  
**Auth:** Admin / Self je nach Route.  
**Nebenkanäle:** keine MQTT.

---

### 4.15 `zone.py` — `prefix=/v1/zone`

Assign, unassign, monitor-data, deprecated `GET /zone/zones`.  
**Call-Graph:** `ZoneService`, `MQTTCommandBridge` für assign.  
**Nebenkanäle:** **MQTT** + **WS** (siehe Service).

---

### 4.16 `zones.py` — `prefix=/v1/zones`

Zone-Entity CRUD, archive, reactivate.  
**Nebenkanäle:** typisch **kein** MQTT-Pflicht; WS möglich bei Broadcast-Patterns.

---

### 4.17 `subzone.py` — `prefix=/v1/subzone`

Assign, delete, list, get, metadata PATCH, safe-mode.  
**Nebenkanäle:** **MQTT** für assign/safe-mode; **WS** bei Metadata/Scope.

---

### 4.18 `sequences.py` — `prefix=/v1/sequences`

List, stats, get, cancel.  
**Call-Graph:** Sequence-Executor / Repos.  
**Nebenkanäle:** WS je nach Implementierung (Fortschritt).

---

### 4.19 `ai.py` — `prefix=/v1/ai`

| POST | `/v1/ai/query` |

Stub/Planned-Verhalten je nach Code — prüfen vor Produktiveinsatz.

---

### 4.20 `kaiser.py` — `prefix=/v1/kaiser`

List, detail, hierarchy, register, zones PUT.  
**Call-Graph:** `KaiserService`.  
**Nebenkanäle:** meist keine MQTT-Pflicht.

---

### 4.21 `device_context.py` — `prefix=/v1/device-context`

PUT/GET/DELETE — `DeviceScopeService`.  
**Nebenkanäle:** **WS `device_context_changed`**.

---

### 4.22 `dashboards.py` — `prefix=/v1/dashboards`

CRUD Layout — DB only.  
**Nebenkanäle:** keine.

---

### 4.23 `webhooks.py` — `prefix=/v1/webhooks`

| POST | `/v1/webhooks/grafana-alerts` | ohne JWT |

**Call-Graph:** `NotificationRouter` + `NotificationRepository`.  
**Nebenkanäle:** **WS** (+ E-Mail optional).

---

### 4.24 `plugins.py` — `prefix=/v1/plugins`

Execute, config, schedule, enable/disable.  
**Call-Graph:** `PluginService`.  
**Nebenkanäle:** abhängig von Plugin (kein fester MQTT-Standard).

---

### 4.25 `backups.py` — `prefix=/v1/backups`

DB-Backup create/list/download/delete/restore/cleanup.  
**Nebenkanäle:** keine MQTT/WS.

---

### 4.26 `diagnostics.py` — `prefix=/v1/diagnostics`

Run, history, export.  
**Nebenkanäle:** keine Pflicht-MQTT.

---

### 4.27 `zone_context.py` — `prefix=/v1/zone/context`

Kontext CRUD, archive-cycle, history, kpis.  
**Call-Graph:** `ZoneContextService`, `ZoneKPIService`.  
**Nebenkanäle:** typisch keine.

---

### 4.28 `component_export.py` — `prefix=/v1/export`

Nur GET-Exporte.  
**Nebenkanäle:** keine.

---

### 4.29 `schema_registry.py` — `prefix=/v1/schema-registry`

List, get schema, validate.  
**Nebenkanäle:** keine.

---

### 4.30 `websocket/realtime.py`

| WS | `/api/v1/ws/realtime/{client_id}` | Query `?token=` JWT |

Persistent **Subscriber**-Kanal für typisierte Events (`sensor_data`, `actuator_status`, …).

---

## 5. Vollständige Routenliste (HTTP, produktiv)

Alphabetisch nach Pfad (Auszug aus Introspection; **vollständig** im Repo nachstellbar mit dem Python-Snippet aus Auftragsmethodik).

Die App enthält u. a. alle Einträge von `GET /api/v1/auth/status` bis `POST /api/v1/schema-registry/{device_type}/validate` plus `sensor_processing` und `WS /api/v1/ws/realtime/{client_id}`.

---

## 6. Drift-Tabelle: `REST_ENDPOINTS.md` ↔ Code (2026-04-05)

| Referenz (Doc) | IST (Code) | Art |
|----------------|------------|-----|
| `POST /auth/mqtt-credentials` | `POST /api/v1/auth/mqtt/configure` | Pfad-/Name-Drift |
| Doc: kein expliziter Status-Endpunkt | `GET /api/v1/auth/mqtt/status` | **Doc lückenhaft** |
| `GET/POST /auth/api-keys` | **nicht implementiert** | **Doc-only / Code fehlt** |
| `GET /sensors/{sensor_id}` (Details) | `GET /api/v1/sensors/{esp_id}/{gpio}` | Pfad-/Modell-Drift (ESP+GPIO statt sensor_id) |
| `POST /sensors` | `POST /api/v1/sensors/{esp_id}/{gpio}` | Drift |
| `GET /sensors/{sensor_id}/data` | entfällt; Nutzung `GET /api/v1/sensors/data` (Query) | **Doc veraltet** |
| `GET /sensors/{sensor_id}/stats` | `GET /api/v1/sensors/{esp_id}/{gpio}/stats` | Drift |
| `GET /sensors/types` als JWT | `GET /api/v1/sensors/types` mit **API-Key** (`sensor_processing`) | **Auth-Drift** |
| `POST /sensors/onewire/scan` | `POST /api/v1/sensors/esp/{esp_id}/onewire/scan` | Pfad-Drift |
| `GET /sensors/by-esp/{esp_id}` | entfällt; `GET /api/v1/sensors/` filtert / alternativ ESP-Pfade | **Doc veraltet** |
| `GET /actuators/by-esp/{esp_id}` | **nicht implementiert** | **Doc veraltet** |
| `GET /esp/devices/{esp_id}/health` (Doc allein) | zusätzlich `GET .../health/score` | **Code erweitert, Doc lückenhaft** |
| Subzone: nur 6 Endpoints in Doc | zusätzlich `PATCH .../subzones/{id}/metadata` | **Code erweitert** |
| `/health` „außer auth…“ | zusätzlich Root `/health` (ohne `/api`) | Doc sollte Root erwähnen |

**Empfehlung:** `REST_ENDPOINTS.md` Sektionen **Auth**, **Sensors**, **Actuators**, **ESP** mit Code erneut synchronisieren.

---

## 7. Gap-Liste P0 / P1 / P2 (G3 Dispatch vs. Finalität)

| ID | Schwere | Befund |
|----|---------|--------|
| **P0** | Dokumentation | `REST_ENDPOINTS.md` listet **API-Keys** und **Sensor-/Actuator-Pfade**, die so **nicht** existieren — Risiko für Frontend/Integratoren. |
| **P0** | Verhalten | **Actuator-Command** und **Zone/Subzone-MQTT**: HTTP-OK **ohne** garantierte Geräte-Finalität; Doc muss **ACK-Lifecycle** (MQTT) explizit koppeln. |
| **P1** | Konsistenz | **Zwei Router** unter `/api/v1/sensors` (`v1/sensors.py` vs `sensor_processing.py`) — unterschiedliche **Auth**-Modelle; in Architektur-Docs klar trennen. |
| **P2** | Observability | Nebenkanal-Fehler (MQTT publish fail) werden teils nur geloggt — Betriebs-Runbooks sollten **Symptom** „DB ok, Gerät nicht aktualisiert“ beschreiben. |

---

## 8. Störfall-Szenarien (API-Antwort)

### 8.1 Validierungsfehler (Pydantic / FastAPI)

**Auslöser:** Fehlender Pflicht-Body, falscher Typ, Constraint.  
**HTTP:** `422 Unprocessable Entity`  
**Body (FastAPI-Standard):** `{"detail": [ {"loc": [...], "msg": "...", "type": "..."} ] }`  
*(Kein `GodKaiserException`-Wrapper.)*

### 8.2 Domänen-/Business-Fehler (`GodKaiserException`)

**Auslöser:** z. B. unbekannte Ressource, Safety-Validation.  
**HTTP:** gemäß Exception (`400`/`403`/`404`/…)  
**Body (global handler):**

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE_STRING",
    "numeric_code": 5201,
    "message": "Menschenlesbare Nachricht",
    "details": {},
    "request_id": "…"
  }
}
```

### 8.3 DB-Fehler beim Schreiben

**Auslöser:** `IntegrityError`, Connection-Problem, Timeout.  
**HTTP:** häufig **`500 Internal Server Error`** über `general_exception_handler`, oder in manchen Routen abgefangen als `400`/`409` (z. B. Subzone `IntegrityError` in `subzone.py`).  
**Body (500 generisch):** strukturierte Server-Fehlermeldung je nach `general_exception_handler` — **ohne** DB-Rohdetails nach außen.

---

## 9. Abnahme-Check (gegen Auftrag)

| Kriterium | Erfüllt |
|-----------|---------|
| Jeder **schreibende** Endpoint mit Nebenkanal: MQTT/WS genannt oder „keiner“ | **Ja** (clusterweise + Exemplare Actuators/Zone/Notifications; Debug gesondert) |
| Drift-Tabelle für **existierende** v1-Routen / Doc | **Ja** (+ Hinweis sensor_processing & Root `/health`) |
| Trace-first Call-Graph | **Ja** (Abschnitt 1 + Router-Kapitel) |

---

*Erstellt im Rahmen Auftrag S2 — HTTP API Tiefenanalyse.*
