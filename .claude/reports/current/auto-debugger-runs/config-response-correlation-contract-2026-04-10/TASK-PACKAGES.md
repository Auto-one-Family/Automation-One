# TASK-PACKAGES — `config-response-correlation-contract-2026-04-10`

**Steuerung:** `.claude/auftraege/auto-debugger/inbox/STEUER-config-response-correlation-contract-2026-04-10.md`  
**Verify:** `.claude/reports/current/auto-debugger-runs/config-response-correlation-contract-2026-04-10/VERIFY-PLAN-REPORT.md` (Post-Verify-Stand)  
**Git:** Aktueller Branch **`auto-debugger/work`** — Soll-Branch **`auto-debugger/work`**; alle Produkt-Commits nur dort.

---

## Pattern-Scan (Pflicht, vor Implementierung)

| Schicht | Closest pattern / Anker | Repo-Pfad |
|---------|-------------------------|-----------|
| Server Publish | `correlation_id` UUID + Merge in Config-Payload | `El Servador/god_kaiser_server/src/services/esp_service.py` (~399–451) |
| Server Ingress | `canonicalize_config_response`, `contract_issues`, synthetische CID | `El Servador/god_kaiser_server/src/services/device_response_contract.py` |
| Server Handler | Warning bei `is_contract_violation`, Metrik `increment_contract_unknown_code("config_response")` | `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py` (~128–136) |
| Firmware | `ConfigResponseBuilder::buildJsonPayload*` | `El Trabajante/src/services/config/config_response.cpp` |
| Firmware Hilfe | `ensureCorrelationId` | `El Trabajante/src/main.cpp` (Steuerung ~197–204 — per Grep verifizieren) |
| Mock/Test | `_handle_config_apply` o. ä. | `tests/esp32/mocks/mock_esp32_client.py` |
| Korrelation (kein Mix mit HTTP) | Playbook | `docs/debugging/correlation-id-playbook.md` |

**Alert/UX:** Keine zweite Notification-Welt; Frontend nur PKG-04 und nur bei Lücke nach PKG-02.

---

## PKG-01 — Evidence: MQTT-Zwillingsaufnahme (blockierend)

**Rolle:** mqtt-debug / DevOps manuell  

**Schritte:**

1. Stack: Postgres + MQTT + El Servador (siehe `AGENTS.md`).
2. Ziel-ESP online: `ESP_00000001` (oder gewähltes Gerät).
3. Config auslösen, das `esp_service.send_config` nutzt (API-Änderung Sensor/Aktor o. ä.).
4. Parallel festhalten:
   - Outbound: `kaiser/<kaiser_id>/esp/<esp_id>/config` — enthält `"correlation_id":"<uuid>"`?
   - Inbound: `…/config_response` — gleiche UUID?
5. Bei zwei Responses kurz hintereinander: beide Payloads separat (seq/ts).

**Akzeptanz:** Kurzprotokoll (Timestamp, Topic, CID gespiegelt oder nicht); kein Code-Zwang.

**BLOCKER-Regel:** Wenn Outbound **keine** CID zeigt → Publish/Routing/Subscription zuerst klären (siehe STEUER §5).

---

## PKG-02 — Producer-Fix (nach PKG-01)

**Fall A — CID in Config ja, in `config_response` nein (Firmware):**

- `ensureCorrelationId` / Queue-Metadaten — vor `buildJsonPayload*` effektive CID nicht leer lassen.
- Verify Build:  
  `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante"`  
  `pio run -e seeed_xiao_esp32c3`  
  *(Verify-korrigiert: nicht `-e seeed`; alternativ `esp32_dev` / Wokwi gemäß Hardware.)*

**Fall B — Mock/Sim (Python):**

- `mock_esp32_client.py`: `config_response` mit kanonischem `status`/`type` und **`correlation_id`** aus letzter Config.

**Server-Tests (gezielt):**

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
poetry run pytest tests/integration/test_contract_ingress_matrix_t1_t6.py tests/unit/test_device_response_contract.py --tb=short -q
```

Voll-Suite bei Bedarf: `poetry run pytest tests/ --tb=short -q`.

---

## PKG-03 — Server: Observability (optional, klein)

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py`  
Bei `canonical.is_contract_violation`: Log um **`contract_issues`** oder **`canonical.message`** ergänzen (keine Secrets).

**Verify (Pfad nach Post-Verify):**

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
poetry run pytest tests/integration/test_contract_ingress_matrix_t1_t6.py tests/unit/test_device_response_contract.py --tb=short -q
poetry run ruff check src/mqtt/handlers/config_handler.py
```

---

## PKG-04 — Frontend (nur bei UX-Lücke)

**Trigger:** Nach PKG-02: WS `config_published` / `config_response` passen im UI nicht.  
**Pfade:** `useConfigResponse.ts`, `src/types/index.ts` — bestehende Stores.

**Verify:**

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend"
npx vue-tsc --noEmit
npx vitest run
```

---

## PKG-05 — Doku (additiv, nach Code-Freeze)

- `docs/debugging/correlation-id-playbook.md` und/oder `El Trabajante/docs/Mqtt_Protocoll.md`: Absatz „Server sendet `correlation_id` in `…/config`; ESP muss in `…/config_response` zurückspiegeln“ + Verweis `device_response_contract.canonicalize_config_response`.

---

## Abnahme (done_criteria aus Steuerung)

1. MQTT-Evidence zu mindestens einem Config-Vorgang (CID in Config und Response gleich) **oder** dokumentierter BLOCKER.  
2. Warning weg oder durch erweitertes Logging diagnosefähig (PKG-03).  
3. pytest / betroffene Checks grün; dieser VERIFY-Report ist der Gate-Stand.

---

## Verify-Gate

- Skill: `.claude/skills/verify-plan/SKILL.md` — **abgeschlossen**; Details im gebundenen `VERIFY-PLAN-REPORT.md`.
