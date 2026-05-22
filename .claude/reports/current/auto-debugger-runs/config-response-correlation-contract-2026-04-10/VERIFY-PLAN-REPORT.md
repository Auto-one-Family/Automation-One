# VERIFY-PLAN-REPORT — `config-response-correlation-contract-2026-04-10`

**Datum:** 2026-04-10  
**Quelle:** Steuerdatei `.claude/auftraege/auto-debugger/inbox/STEUER-config-response-correlation-contract-2026-04-10.md` + Repo-Ist  
**Git (Orchestrator-Stand):** Branch `auto-debugger/work` (lokal verifiziert)

---

## 1. Kurzfazit

Der Auftrag ist **kohärent** und die **Kernpfade existieren** (`esp_service.send_config` mit `correlation_id`, `canonicalize_config_response`, `config_handler.handle_config_ack`, Firmware `El Trabajante/src/services/config/config_response.cpp`).  
**Korrekturen** sind nötig bei **Testpfad** (Integration vs. Unit), **Firmware-Build-Env-Name** und **präzisen Windows-/Poetry-Befehlen** — siehe Abschnitt 3 und **OUTPUT FÜR ORCHESTRATOR**.

---

## 2. Pfad- und Pattern-Checks (Stichprobe)

| Referenz (Plan) | Repo-Ist | Ergebnis |
|-----------------|----------|----------|
| `El Servador/.../esp_service.py` (~399–451) `correlation_id` | `send_config`: UUID, `config_with_correlation` | OK |
| `device_response_contract.py` `canonicalize_config_response` | `src/services/device_response_contract.py` | OK |
| `config_handler.py` Warning ohne `contract_issues` | `src/mqtt/handlers/config_handler.py` Zeilen ~128–136 | OK (nur raw_* Felder) |
| `config_response.cpp` | `El Trabajante/src/services/config/config_response.cpp` | OK |
| `tests/unit/test_contract_ingress_matrix_t1_t6.py` | Datei liegt unter **`tests/integration/test_contract_ingress_matrix_t1_t6.py`** | **Delta: Pfad + Ordner** |
| `pio run -e seeed` | `El Trabajante/platformio.ini`: **`[env:seeed_xiao_esp32c3]`**, kein `seeed` | **Delta: Env-Name** |
| `docs/debugging/correlation-id-playbook.md` | Existiert | OK |
| `El Trabajante/docs/Mqtt_Protocoll.md` | (Steuerung target_docs — bei Bedarf Schreibzugriff nach Code-Freeze PKG-05) | OK falls vorhanden |

**Zusätzliche sinnvolle Tests nach PKG-03 (Logging):**

- `poetry run pytest tests/unit/test_device_response_contract.py -q` — direkter Contract-Bezug.

---

## 3. Korrekturen für TASK-PACKAGES (nach Verify eingearbeitet)

1. **PKG-03 / STEUER Zeile 115:** pytest-Pfad von  
   `tests/unit/test_contract_ingress_matrix_t1_t6.py` →  
   **`tests/integration/test_contract_ingress_matrix_t1_t6.py`**  
   Ausführung immer aus `El Servador/god_kaiser_server` mit `poetry run`.

2. **PKG-02 Firmware:** Build-Verify:  
   `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante"`  
   dann **`pio run -e seeed_xiao_esp32c3`** (oder laut Auftrag `esp32_dev` / Wokwi-Env — nicht `seeed`).

3. **Vollständige Server-Pytest-Zeile (AGENTS.md-konform):**  
   `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"`  
   `poetry run pytest tests/ --tb=short -q`  
   Gezielt Contract: `poetry run pytest tests/integration/test_contract_ingress_matrix_t1_t6.py tests/unit/test_device_response_contract.py -q`

4. **MQTT-Evidence (PKG-01):** Topic-Muster `kaiser/{kaiser_id}/esp/{esp_id}/config` — `kaiser_id` aus Runtime/DB (`god` nur Beispiel); Broker-Subscribe mit exakter ID aus Umgebung.

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

### PKG → Delta

| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-01 | Kein Code-Pfad; Evidence-Protokoll mit **tatsächlichen** Topics/IDs. **BLOCKER** wenn Broker keine `correlation_id` in ausgehender Config zeigt — dann zuerst Publish/Subscription klären. |
| PKG-02 | **Fall A:** Firmware: `config_response.cpp` + ggf. `ensureCorrelationId` in `main.cpp` — Pattern per Grep vor Implementierung. **Fall B:** Mock: `tests/esp32/mocks/mock_esp32_client.py` — Payload an Kanon anpassen. Verify: **`pio run -e seeed_xiao_esp32c3`** (nicht `-e seeed`); Server: `poetry run pytest tests/integration/test_contract_ingress_matrix_t1_t6.py tests/unit/test_device_response_contract.py -q` + bei Bedarf volle Suite. |
| PKG-03 | Nur `config_handler.py`: Log um `contract_issues` oder `canonical.message` erweitern — **keine** Änderung an Kanonisierung ohne PKG-01-Bestätigung. Test: **`poetry run pytest tests/integration/test_contract_ingress_matrix_t1_t6.py`** (korrigiert von fälschlich `tests/unit/…`) + `tests/unit/test_device_response_contract.py`; `ruff check` auf geänderte Dateien. |
| PKG-04 | Nur bei nachgewiesener UX-Lücke nach PKG-02; `useConfigResponse.ts`, Stores — keine zweite Notification-Welt. Verify: `npx vue-tsc --noEmit`, Vitest bei Berührung. |
| PKG-05 | Additiv: `docs/debugging/correlation-id-playbook.md` und/oder `El Trabajante/docs/Mqtt_Protocoll.md` — Verweis `canonicalize_config_response`. |

### PKG → empfohlene Dev-Rolle

| PKG | Rolle (z. B. server-dev, frontend-dev, esp32-dev, mqtt-dev) |
|-----|---------------------------------------------------------------|
| PKG-01 | **mqtt-debug** (manuell/DevOps Evidence) — kein Produktcode-Zwang |
| PKG-02 | **esp32-dev** (Firmware) **oder** **server-dev** (Mock/Simulation) — abhängig von PKG-01-Evidence |
| PKG-03 | **server-dev** |
| PKG-04 | **frontend-dev** (optional) |
| PKG-05 | **Doku** nach Code-Freeze |

### Cross-PKG-Abhängigkeiten

- PKG-02 → PKG-01: Producer-Fix-Richtung erst nach reproduzierbarer MQTT-Evidence (Config-CID vs. Response-CID).
- PKG-03 → PKG-01: Kanonisierungslogik unverändert lassen, bis klar ist, ob echte Alt-Geräte oder Parser-Thema — Logging ist entkoppelt, aber fachlich PKG-01 informiert Diagnose.
- PKG-04 → PKG-02: Frontend nur, wenn WS-Korrelation nach Backend/Firmware-Fix noch fehlt.

### BLOCKER

- Kein **automatischer** BLOCKER aus reinem Repo-Check; **operativer** BLOCKER: PKG-01 ohne sichtbare `correlation_id` in der Config-Publish-Payload am Broker → Ursache Server-Publish/Routing/Subscription vor Fix in PKG-02.

---

*Ende VERIFY-PLAN-REPORT*
