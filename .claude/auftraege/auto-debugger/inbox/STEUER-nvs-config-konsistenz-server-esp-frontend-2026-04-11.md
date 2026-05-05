---
run_mode: both
incident_id: INC-NVS-CONFIG-CONSISTENCY-2026-04-11
run_id: steuer-nvs-config-fullstack-2026-04-11
order: incident_first
no_chat_questions: true
allow_user_escalation: false
konsolidierung_step: single
target_docs:
  - .claude/reports/current/incidents/INC-NVS-CONFIG-CONSISTENCY-2026-04-11/IST-SYSTEM-REPORT.md
  - .claude/reports/current/incidents/INC-NVS-CONFIG-CONSISTENCY-2026-04-11/CODE-LAYER-MAP.md
  - .claude/auftraege/auto-debugger/inbox/implementierungsplan-PKG-NVS-CONFIG-FULLSTACK-2026-04-11.md
scope: |
  **Ziel:** Vollständige **IST-Durchforstung** des Systems (Laufzeit + Artefakte), danach **schichtenweise Code-Analyse**
  aller relevanten Pfade, anschließend ein **einheitlicher, repo-verifizierter Implementierungsplan**, der die
  **restlichen Fixes** konsistent in die bestehende Codebase einbettet (kein Greenfield).

  **Symptomcluster (Ausgangslage — Evidence aus Live-Lauf / Serial / UI, zu verifizieren im Repo):**
  1. **Firmware:** `StorageManager: beginTransaction|beginNamespace lock timeout` (250 ms Mutex),
     gefolgt von `NVS_WRITE_FAILED` / `Failed to save sensor config to NVS` trotz teils erfolgreicher RAM-Updates
     und funktionierenden Messwerten (ESP_EA5484, Config auf Core 1, Heartbeat-ACK-Pfad schreibt `setDeviceApproved` → NVS).
  2. **Server:** `DELETE /api/v1/sensors/...` — Laufzeitbeleg `TypeError: Object of type UUID is not JSON serializable`
     (Response/Serialisierung; WS `sensor_config_deleted` Payload prüfen).
  3. **Telemetrie:** `Sensor config not found` für GPIOs ohne DB-Zeile (z. B. ESP_EA5484 moisture 32/33) — Abgleich mit
     PKG-HW-01 (`quality=degraded`) und Operator-Erwartung (Ghost aus NVS/Alt-Firmware vs. Server-Wahrheit).
  4. **Frontend:** Toasts zu `NVS_WRITE_FAILED` mit Text „Speicher voll oder beschädigt“ — semantische Diskrepanz zu
     Lock-Timeout / Kontention (Mapping prüfen).

  **Deliverables (Reihenfolge erzwingen):**
  | # | Artefakt | Pflichtinhalt |
  |---|----------|----------------|
  | A | `IST-SYSTEM-REPORT.md` | End-to-end: Docker-Services, MQTT-Themen relevant für Config/Heartbeat/ConfigResponse,
  |   | | WS-Events, typische UI-Flows (HardwareView), ESP-Core/Task-Zuordnung, Mess-/Persist-Ketten — **nur** mit
  |   | | Referenzen auf Logs/OpenAPI/Code-Pfade, keine erfundenen Zeilen. |
  | B | `CODE-LAYER-MAP.md` | Tabelle + Flussdiagramm (ASCII oder Mermaid): Schicht → Dateien → Verantwortung →
  |   | | bekannte Konfliktpunkte (NVS-Mutex, JSON-UUID, WS-Broadcast). |
  | C | `implementierungsplan-PKG-NVS-CONFIG-FULLSTACK-2026-04-11.md` | Verbindliche Umsetzungsphasen mit **Closest-Pattern**,
  |   | | Abgrenzung zu PKG-HW-02 / PKG-CAL-*, Tests, Verify-Block PowerShell, Risiken/Rollback. |

  **Arbeitsreihenfolge (verbindlich):**
  1. **Phase S — System-IST:** Runtime + Konfiguration (ein Referenz-ESP, z. B. ESP_EA5484): Timestamps,
     `correlation_id` wo vorhanden, `docker compose logs` für `el-servador`, `mqtt-broker`, `alloy`/`loki` nur soweit
     für Korrelation nötig; Serial-Snippets mit Kontext.
  2. **Phase C — Code-IST:** Schichten nacheinander: **Firmware** (`El Trabajante/src/services/config/storage_manager.*`,
     `config_manager.*`, `main.cpp` MQTT-Callback Heartbeat vs. `handleSensorConfig`/SYNC), **Server**
     (`sensors.py`, `esp_service.py`, `mqtt/publisher`, `websocket/manager`, `schemas/sensor.py`), **Frontend**
     (Config-Response / Error-Mapping / Toasts — per Grep `NVS_WRITE_FAILED`, `config_response`, `sensor_config_deleted`),
     **Referenz-Doku** (`.claude/reference/api/MQTT_TOPICS.md`, `WEBSOCKET_EVENTS.md`, `ERROR_CODES.md` — nur Abgleich,
     keine blinden Doku-Rewrites ohne Kontraktänderung).
  3. **Phase P — Plan:** Aus S+C abgeleitete **minimale** Änderungsmenge priorisieren (P0 Mutex/Approval-Spam,
     P0 DELETE-UUID, P1 UI-Text/Differenzierung, P2 Observability), jeweils mit Akzeptanzkriterium.

  **Git / Branch:** Produktcode nur `auto-debugger/work`; kein Commit auf `master` aus diesem Auftrag.

  **Aktivierung:** auto-debugger mit dieser Steuerdatei; vor Implementierung **verify-plan**-Gate auf den
  Implementierungsplan (Skill `.claude/skills/verify-plan/SKILL.md`).
forbidden: |
  Keine Secrets, Tokens, Passwörter in Berichten oder Plänen.
  Keine fiktiven Log-Zitate — nur aus tatsächlichen Laufwerken (Serial, `docker logs`, pytest-Output) oder mit
  explizitem Label „Hypothese“ wenn noch unverifiziert.
  Keine Breaking Changes an öffentlichen REST/MQTT/WS-Verträgen ohne separates Gate und Doku-Abgleich.
  Keine Vermischung der Kalibrier-Mathe (PKG-CAL-*) in dieselben Code-Commits — höchstens Schnittstellen-Hinweis.
  Kein Löschen bestehender Evidence-Ordner ohne TM-Freigabe.
done_criteria: |
  Alle drei `target_docs`-Dateien existieren unter den angegebenen Pfaden (Ordner `INC-NVS-CONFIG-CONSISTENCY-2026-04-11`
  unter `.claude/reports/current/incidents/` anlegen falls fehlend).

  **IST-SYSTEM-REPORT.md:** Mindestens Abschnitte: Kontext/Zeitraum, betroffene `esp_id`, Docker-Service-Health-Stichprobe,
  MQTT-Pfadliste (Config, Heartbeat-ACK, ConfigResponse, OneWire-Scan), WS-Ereignisse die die UI triggern,
  Firmware-Task/Core-Hypothese mit **Code-Verweis** (Datei:Zeile oder Funktionsname aus `Read`).

  **CODE-LAYER-MAP.md:** Mindestens 4 Schichten (Firmware NVS/MQTT, Server API/MQTT/WS, Frontend Store/Toast, Observability);
  je Schicht ≥3 konkrete Dateipfade; mindestens **ein** Sequenzdiagramm oder nummerierter Ablauf (Config-Push vs. Heartbeat).

  **implementierungsplan-PKG-NVS-CONFIG-FULLSTACK-2026-04-11.md:** Gliederung wie STEUER-VORlage-Erwartung:
  IST-Code (Zitate-Anker), SOLL messbar, nummerierte Arbeitsschritte mit Closest-Pattern, MQTT/REST/WS-Kompatibilität,
  Tests (`pytest`/`vitest`/`pio` nur wenn FW), Verify-Block vollständiger PowerShell-`cd`, Risiken/Rollback,
  Abgrenzung PKG-HW-02 / PKG-CAL-*.

  verify-plan wurde auf den Implementierungsplan angewendet; OUTPUT-BLOCK für Orchestrator liegt im Run-Ordner oder im
  Incident-Ordner (`VERIFY-PLAN-REPORT.md` oder gleichwertig benannt).
---

# STEUER — NVS / Config-Konsistenz / Multi-Layer-Fixes (System → Code → Plan)

**Kurz-ID:** `STEUER-nvs-config-konsistenz-server-esp-frontend`  
**Datum:** 2026-04-11  
**Bezug:** Nachgelagerte Gesamtbetrachtung zu NVS-Lock-Kontention, DELETE-Sensor-Response, Telemetrie ohne Config,
Frontend-Fehlertexte; baut auf Erkenntnissen aus Live-Serial, Docker-Logs und UI-Toasts auf.

## 1. Problemhypothese (für Phase S zu bestätigen oder zu falsifizieren)

- **H1 (Firmware):** Periodisches **`setDeviceApproved(true, ts)`** bei jedem Heartbeat-ACK (`main.cpp`) konkurriert mit
  **längeren NVS-Schreibpfaden** beim MQTT-**`/config`** (Core 1), Mutex-Timeout **250 ms** → fälschlich gleicher
  Fehlercode wie echter NVS-Schreibfehler.
- **H2 (Server):** `SensorConfigResponse.esp_id` als **UUID** in Pydantic/JSON-Response von **DELETE** ohne korrekte
  Serializer-Konfiguration → 500/`TypeError` bei Client/Logging.
- **H3 (System):** Server-Daten und ESP-NVS können kurzzeitig **divergieren**; UI zeigt „gesendet“ + rot, weil
  **ConfigResponse** `status=error` liefert, während Messwerte aus RAM weiterlaufen.

## 2. Phase S — System-IST (Vollständige Durchforstung)

**Ziel:** Ein Dokument, das ein neuer Entwickler ohne Chat-Historie versteht.

| Schritt | Aufgabe | Output im IST-SYSTEM-REPORT |
|---------|---------|------------------------------|
| S1 | `docker compose ps` + Health der Kernservices (postgres, mqtt, el-servador, frontend, alloy/loki optional) | Tabelle Status |
| S2 | Relevante **MQTT-Topics** aus Code + `MQTT_TOPICS.md` abgleichen (config, heartbeat/ack, config_response, onewire) | Liste mit QoS-Hinweis aus **Code** |
| S3 | **WS-Events** die Config/Fehler betreffen (`WEBSOCKET_EVENTS.md` + `websocket/manager` Grep) | Eventnamen + Payload-Felder |
| S4 | **UI-Flow:** Welche Komponente zeigt welchen Toast bei ConfigResponse / NVS (Grep Frontend) | Dateipfade |
| S5 | **Serial-Referenz:** typische Sequenz ACK → config → lock timeout (anonymisiert, ohne Secrets) | Zeitliche Reihenfolge |
| S6 | **Server-Log-Referenz:** DELETE-Sensor, `publish_config`, evtl. Exception-Trace (UUID) | Korrelation zu UI-Aktion |

## 3. Phase C — Code-IST (alle relevanten Ebenen)

**Ziel:** `CODE-LAYER-MAP.md` — keine Lösung, nur präzise Landkarte.

### 3.1 Firmware (`El Trabajante/`)

- `storage_manager.cpp/.h` — Mutex, Timeouts, `StorageLockGuard` vs. `beginTransaction`.
- `config_manager.cpp/.h` — `setDeviceApproved`, `saveSensorConfig`, Transaktionsgrenzen.
- `main.cpp` — MQTT-Callback: Heartbeat-ACK-Block, `handleSensorConfig`, Core-Annotation `[SYNC]`.
- `sensor_manager.*` — NVS persist nach Config; Interaktion mit SYNC.
- Optional: `communication_task.*` / MQTT-Task-Zuordnung (wer ruft Callback).

### 3.2 Server (`El Servador/god_kaiser_server/`)

- `src/api/v1/sensors.py` — `delete_sensor`, `_model_to_response`, WS-Broadcast.
- `src/schemas/sensor.py` — `SensorConfigResponse`, `esp_id`-Typ, JSON-Encoder.
- `src/websocket/manager.py` — `broadcast` Serialisierung.
- `src/mqtt/handlers/sensor_handler.py` — „config not found“, `quality`.
- `src/services/esp_service.py` / `mqtt/publisher.py` — Config-Publish.

### 3.3 Frontend (`El Frontend/`)

- Grep: `NVS_WRITE_FAILED`, `config_response`, `sensor_config_deleted`, `GPIO`.
- API-Client: Sensor delete, Config-Push response handling.
- Stores: ESP/Sensor-State nach Delete/WS.

### 3.4 Querschnitt

- `.claude/reference/errors/ERROR_CODES.md` — ESP 2003 vs. tatsächliche Ursache.
- `esp32_error_mapping.py` — Server-seitige Texte für UI?

## 4. Phase P — Implementierungsplan (Deliverable C)

**Datei:** `implementierungsplan-PKG-NVS-CONFIG-FULLSTACK-2026-04-11.md`

**Mindest-Pakete (Reihenfolge vorschlagen, final im Plan begründen):**

| Paket | Kurzinhalt | Abhängigkeit |
|-------|------------|----------------|
| **P0-FW** | NVS-Schreibpfade entkoppeln: z. B. `setDeviceApproved` nur bei **Änderung**; oder zentrale NVS-Queue; Mutex-Timeout strategisch (mit Begründung) | Phase C bestätigt H1 |
| **P0-SRV** | DELETE-Sensor Response JSON-sicher (`esp_id` string oder Custom Serializer) + Regressionstest | Phase C bestätigt H2 |
| **P1-FE** | Toast/Mapping: Unterscheidung Timeout vs. echter NVS-Full (sobald Firmware/Server Subcode liefert — oder interim besserer Text) | P0-FW/SRV je nach API |
| **P1-OBS** | Strukturierte Logs/Correlation für ConfigResponse-Failures (bestehendes Logging-Pattern) | optional parallel |
| **P2-DOC** | Nur bei Kontraktänderung: `MQTT_TOPICS.md` / `WEBSOCKET_EVENTS.md` / `ERROR_CODES.md` minimal ergänzen | nach Code-Freeze |

**Tests (im Plan explizit benennen):**

- Backend: `tests/integration/test_api_sensors.py` (DELETE + Response-Body), ggf. neuer Test UUID-Serialisierung.
- Frontend: `vitest` für Mapping-Komponente (falls betroffen).
- Firmware: `pio run -e esp32_dev` + gezielter Hardware- oder Dokumentations-Testplan für NVS-Race.

## 5. Verify & Qualitätssicherung

- `verify-plan` auf den finalen Implementierungsplan **vor** Merge-Request.
- Ruff / vue-tsc wie in `AGENTS.md` für berührte Schichten.
- Kein Abschluss ohne **Repro-Schritts** im Plan (PowerShell-`cd` mit vollen Pfaden).

## 6. Aktivierung (Copy-Paste)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-nvs-config-konsistenz-server-esp-frontend-2026-04-11.md
```

Vorher: `git checkout auto-debugger/work`

## 7. Abgrenzung

- **PKG-HW-02:** GPIO-Pin-Store / Frontend-Refresh — nur erwähnen, wenn DELETE-WS oder Sensor-Liste berührt wird;
  keine komplette HW-02-Umsetzung in diesem STEUER.
- **PKG-CAL-***:** Keine Änderung an Kalibrier-Mathe, `calibration_data`, Mutex der Mess-Session — höchstens Hinweis
  bei NVS-Größe/Kollision.

---

*Ende STEUER — bei Rückfragen nur mit `allow_user_escalation: true` in Frontmatter.*
