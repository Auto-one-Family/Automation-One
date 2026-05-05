# TASK-PACKAGES — STEUER 05 (MQTT → Notification Metadaten)

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-konzept-alertcenter-05-mqtt-metadata-correlation-2026-04-10.md`  
**run_id:** `konzept-alertcenter-05-mqtt-correlation-2026-04-10`  
**Git:** Änderungen und Commits nur auf Branch **`auto-debugger/work`**; vor Merge zu `master` Freigabe durch Robin.

**Aktueller Git-Branch (Orchestrator-Stand):** `auto-debugger/work` — Soll: `auto-debugger/work`.

---

## PKG-01 — Matrix „Quelle → Correlation/Metadaten → Lücke“

| Quelle (MQTT-Pfad / Handler) | Ingress-CID (Subscriber) | Was landet in `Notification` | Lücke / Anmerkung |
|------------------------------|---------------------------|------------------------------|-------------------|
| Alle Handler über `MQTTSubscriber._execute_handler` | `generate_mqtt_correlation_id(esp_id, topic_suffix, seq)` → ContextVar `get_request_id()` | — | CID ist im Handler-Kontext verfügbar, wird aber **nicht** automatisch in Notifications gespiegelt. |
| `sensor_handler._evaluate_thresholds_and_notify` | (Context vorhanden) | `correlation_id = f"threshold_{esp_id}_{sensor_type}"`; `metadata` = esp/gpio/sensor_type/Wert/… | **Eigene** CID-Semantik (Schwellen-Gruppe), nicht die Subscriber-CID; für E2E MQTT→Log→DB ggf. zusätzlich `mqtt_ingress_correlation_id` in `metadata` dokumentieren/ergänzen (Folge-PKG). |
| `actuator_alert_handler.handle_actuator_alert` | Context vorhanden | `NotificationCreate` **ohne** `correlation_id`; `metadata` nur esp_id, gpio, alert_type, zone_id | **P1-Lücke:** keine Spiegelung der Ingress-CID in Spalte `correlation_id` oder `extra_data` → Operator kann MQTT-Log nicht an Inbox-Eintrag hängen. |
| `lwt_handler`, `config_handler`, `actuator_response_handler`, … | teils Payload-`correlation_id` | Audit/Contract-Pfade, nicht durchgängig `NotificationRouter` | Kein Mischen mit Alert-Inbox ohne Review; siehe Quervertrag STEUER config-response. |

**Semantik:** HTTP-`request_id` (UUID) und MQTT-Ingress-CID teilen den **gleichen** ContextVar-Namen (`request_context`), sind **fachlich verschieden** — in Logs/Metadaten klar halten (z. B. Schlüssel `mqtt_ingress_correlation_id` in `metadata` bei Bedarf).

---

## PKG-02 — Minimalfix (eine Referenzquelle)

**Owner:** server-dev (ggf. mqtt-dev Review Topic/Payload-Doku)

**Ziel:** Eine Quelle so erweitern, dass die vom Subscriber gesetzte Ingress-CID in der persistierten Notification nachvollziehbar ist (**additive** Felder; **kein** Dedup-Algorithmus ändern ohne separates Review).

**Empfohlene erste Quelle:** `El Servador/god_kaiser_server/src/mqtt/handlers/actuator_alert_handler.py` — vor `NotificationCreate`:

- `mqtt_cid = get_request_id()` (Import aus `...core.request_context`).
- Optional: falls Payload künftig `correlation_id` liefert, Priorität dokumentieren (Payload > Context), ohne Breaking Change am Topic.
- `NotificationCreate.correlation_id` auf die gewählte Kanon-ID setzen **oder** (wenn Dedup-Kollisionen vermieden werden sollen) nur `metadata["mqtt_ingress_correlation_id"]` setzen — **Entscheidung:** für Referenzpfad **Spalte** `correlation_id` mit Ingress-CID befüllen, damit REST/DB-Suche einheitlich bleibt; Dedup für Broadcast nutzt bereits `correlation_id` (siehe `NotificationRouter.route`).

**Akzeptanz:** Ein klarer E2E-Narrativstrang in Doku/Kommentar: Topic `…/actuator/.../alert` → Handler → `NotificationRouter.route` → DB-Zeile mit gefüllter `correlation_id` und/oder `extra_data.mqtt_ingress_correlation_id`.

---

## PKG-03 — Tests (nach Verify korrigiert)

**Hinweis (Verify):** Das Verzeichnis `tests/mqtt/handlers/` **existiert im Repo nicht**. Stattdessen:

- Bestehendes Muster: `tests/integration/test_threshold_notification_pipeline.py` (Schwellen → NotificationRouter).
- **Neu (empfohlen):** `tests/unit/mqtt/test_actuator_alert_notification_correlation.py` — isolierter Test mit gemocktem `NotificationRouter.route`, Prüfung dass `NotificationCreate` die erwartete CID/Metadaten enthält (kein echter Broker nötig).

**Verify-Befehle (bindend nach VERIFY-PLAN-REPORT):**

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
poetry run pytest tests/unit/mqtt/test_actuator_alert_notification_correlation.py tests/integration/test_threshold_notification_pipeline.py --tb=short -q
poetry run ruff check src/mqtt/handlers/
```

Falls PKG-03 die neue Datei noch nicht anlegt, zunächst nur `test_threshold_notification_pipeline.py` + gezielte Erweiterung dort **oder** nur Unit-Datei — siehe SPECIALIST-PROMPTS.

---

## Cross-Ref

- `STEUER-config-response-correlation-contract-2026-04-10.md` — Config-/Response-Pfad nicht vermischen; gemeinsame Hilfsfunktionen nur nach Abgleich.

---

## Post-Verify-Änderungen (Orchestrator)

- Verify hat **Pytest-Pfad** von `tests/mqtt/handlers/` auf existierende/neu zu erzeugende Unit-Struktur korrigiert (siehe `VERIFY-PLAN-REPORT.md`).
