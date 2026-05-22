---
run_mode: artefact_improvement
incident_id: ""
run_id: config-response-correlation-contract-2026-04-10
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/auftraege/auto-debugger/outbox/BERICHT-config-vertraege-correlation-2026-04-10.md
  - docs/debugging/correlation-id-playbook.md
  - El Trabajante/docs/Mqtt_Protocoll.md
scope: |
  End-to-End-Abgleich des MQTT-Vertrags „config_push (Server) → config_response (ESP/Mock)“ mit Fokus auf
  fehlendes oder nicht zurückgespiegeltes correlation_id (Warnung „Contract violation normalized on config_response“,
  Metrik increment_contract_unknown_code("config_response")). Ziel: reproduzierbare Evidence, dann minimale Fixes
  an der Quelle (Producer) und optional bessere Observability auf dem Server — ohne Breaking Changes an REST/WS/DB.
forbidden: |
  Keine Secrets in Reports/Steuerdatei; keine Breaking Changes an öffentlichen REST-/WS-Schemas ohne separates Gate;
  keine Commits direkt auf master (nur Branch auto-debugger/work); keine Vermischung von HTTP-X-Request-ID mit
  MQTT-config-correlation_id im Lagebild (Playbook einhalten); keine zweite Notification-Welt im Frontend.
done_criteria: |
  (1) Für mindestens einen reproduzierten Config-Vorgang an ESP_00000001 (oder Ziel-ESP) liegt MQTT-Evidence vor:
  eingehendes kaiser/.../config enthält correlation_id; ausgehendes kaiser/.../config_response enthält dieselbe
  correlation_id (oder nachvollziehbar dokumentierter BLOCKER). (2) Die Docker-/Server-Warnung verschwindet oder ist
  durch gezieltes Logging der contract_issues ohne Code-Lektüre diagnosefähig. (3) Backend pytest und geänderte
  Firmware/Frontend-Checks gemäß betroffenen Paketen grün; VERIFY-PLAN-REPORT.md nach Gate aktualisiert.
---

# STEUER — Fixauftrag: `config_response` ↔ `correlation_id` (Contract)

**Bezug:** Auswertung [`BERICHT-config-vertraege-correlation-2026-04-10.md`](../outbox/BERICHT-config-vertraege-correlation-2026-04-10.md) und Agent-Norm [`.claude/agents/auto-debugger.md`](../../../agents/auto-debugger.md) (Verify-Plan-Gate, Branch `auto-debugger/work`, TASK-PACKAGES, kein Orchestrator-eigenes Produktcoding).

---

## 0. Git (Pflicht vor jeder Änderung)

1. `git checkout auto-debugger/work`
2. `git branch --show-current` → muss `auto-debugger/work` sein
3. Alle Commits dieses Auftrags nur auf diesem Branch

---

## 1. IST-Lagebild (Stack, kurz belegt)

| Schicht | Rolle | IST (relevant) |
|--------|--------|----------------|
| **El Servador** | Config-Publish | `esp_service.send_config` injiziert `correlation_id` (UUID) **top-level** in die MQTT-Config-Payload (`El Servador/god_kaiser_server/src/services/esp_service.py`, Zeilen ~399–451, 457–460). |
| **El Servador** | Ingress | `canonicalize_config_response` markiert `correlation_id=missing`, wenn das Feld im **eingehenden** `config_response`-JSON fehlt/leer ist; `is_contract_violation` wird true (`device_response_contract.py`, ~141–149). |
| **El Servador** | Log/Metrik | `config_handler.py` loggt bei Verstoß die Warning mit **nur** `raw_status/raw_type/raw_error_code` — **nicht** die Liste `contract_issues` (~128–136). |
| **El Trabajante** | Ausgang MQTT | `ConfigResponseBuilder::buildJsonPayload` / `buildJsonPayloadWithFailures` setzen `correlation_id` **nur**, wenn `payload.correlation_id` bzw. Parameter **Länge > 0** (`config_response.cpp`, ~83–86, ~201–204). |
| **El Trabajante** | Router | Config-Push: `extractIntentMetadataFromPayloadNoCorrelationFallback` — fehlende `correlation_id` in der **Config-Payload** führt zu frühem `publishError` SYSTEM ohne durchgereichte CID (`main.cpp`, ~592–609); das erklärt **nicht** das Log-Muster **success + actuator** aus dem Bericht (dafür muss eine Response **ohne** CID bei ansonsten gültigem Status/Typ von einem Producer stammen, der den Success-Pfad nutzt). |
| **Tests/Mock** | Python MockESP | `_handle_config_apply` in `tests/esp32/mocks/mock_esp32_client.py` baut ein `config_response`-ähnliches Payload mit **fremdem** Schema (`status: ok`, ohne `type`/`correlation_id` im gezeigten Ausschnitt, ~823–842) — für **Unit-/ESP-Simulation** relevant, nicht 1:1 Produktionspfad. |

**Hypothese (Priorität):** Die sichtbare Warning entsteht, wenn ein Producer `config_response` mit `status`/`type` passend sendet, aber **`correlation_id` weglässt** (Server: synthetische CID + `contract_issues`). Typisch: ältere Binaries, reduzierte Test-Publisher, oder doppelter Publish (zwei Antworten pro Vorgang — im Bericht erwähnt).

---

## 2. Korrelations-Reihenfolge (Orchestrierung)

Gemäß auto-debugger / Konzept: für die Zuordnung **zuerst** `correlation_id` (MQTT config/config_response), dann `esp_id` + Zeitfenster, **nicht** mit HTTP-`X-Request-ID` vermischen (`docs/debugging/correlation-id-playbook.md`).

---

## 3. Arbeitspakete (Reihenfolge beachten)

### PKG-01 — Evidence: MQTT-Zwillingsaufnahme (blockierend für Fix-Richtung)

**Owner-Rolle:** mqtt-debug / manuell DevOps  
**Ziel:** Einen reproduzierbaren Ablauf mit festgehaltenen **Rohpayloads**.

Schritte:

1. Stack wie in `AGENTS.md`: Postgres + MQTT + El Servador; ESP oder Mock mit ID `ESP_00000001` online.
2. Einmal Config auslösen, das `send_config` nutzt (z. B. Sensor/Aktor-Update über API, das `esp_service.send_config` triggert).
3. Parallel abgreifen:
   - Topic **Outbound Config:** `kaiser/god/esp/ESP_00000001/config` (bzw. euer `kaiser_id`) — prüfen: enthält `"correlation_id":"<uuid>"`.
   - Topic **Inbound Response:** `kaiser/god/esp/ESP_00000001/config_response` — prüfen: ob `correlation_id` vorhanden und **gleich** der UUID aus (1).
4. Wenn **zwei** `config_response`-Nachrichten kurz hintereinander: beide Payloads separat speichern (seq/ts/count vergleichen).

**Akzeptanz:** Kurzprotokoll (Timestamp, Topic, ob CID gespiegelt) liegt vor; kein Code-Zwang.

---

### PKG-02 — Producer-Fix (Hauptfix, abhängig von PKG-01)

**Fall A — Evidence zeigt: CID fehlt nur in `config_response`, Config-Push enthält sie**

- **Owner:** esp32-dev (wenn reale Firmware) **oder** server-dev (wenn Mock/Sim im Server) **oder** Test-Mock-Anpassung.

**Firmware (El Trabajante), wenn betroffen:**

1. **Closest pattern:** `ensureCorrelationId` in `main.cpp` (~197–204) — bereits für andere Kanäle genutzt.
2. **Ziel:** Vor jedem Publish in `ConfigResponseBuilder` die effektive CID **nie leer** lassen, wenn der Server eine erwartet — minimalvariante: in `publishSuccess` / `publishError` / `publishWithFailures` vor `buildJsonPayload*` `correlation_id = ensureCorrelationId(correlation_id)` (oder zentrale Hilfsfunktion in `config_response.cpp`, um Duplikate zu vermeiden).
3. **Wichtig:** Server-seitig bleibt `missing-corr:…` für echte Alt-Geräte möglich; Product-Entscheid: **echtes Echo der Server-UUID** bevorzugen (aus Queue-Metadaten kommt sie bereits — dann sollte das JSON-Feld immer gesetzt werden, solange die Queue gültige Metadata hat).

**Server-seitige Simulation/Mock (nur wenn PKG-01 zeigt: Publisher ist Python-Mock o. ä.):**

- `mock_esp32_client.py` (und ggf. SimulationScheduler-nahe Pfade): `config_response`-Payload an **Kanonisierung** anpassen: `status`/`type` wie Produkt (`success`, `sensor`|`actuator`|…), **`correlation_id`** aus der zuletzt empfangenen Config übernehmen.

**Verifikation (Pflicht):**

- Firmware: `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante" && pio run -e esp32_dev` (WROOM; Seeed XIAO: `seeed_xiao_esp32c3`)
- Server: `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server" && poetry run pytest tests/ --tb=short -q` (mindestens betroffene Module; bei Scope-Reduktion gezielt `tests/unit/` + relevante Integration)

---

### PKG-03 — Server: Observability (optional, klein, unabhängig testbar)

**Owner:** server-dev  
**Ziel:** Warning ohne Quellcode-Lektüre verständlich machen (Bericht Abschnitt 5.3).

1. In `config_handler.py` bei `canonical.is_contract_violation`: Logzeile um **`contract_issues`** erweitern — entweder `canonical.message` nutzen (enthält bei Violation bereits „Contract violation: …“ in `device_response_contract.py` ~171–173) oder explizit strukturiert loggen (keine Secrets).
2. Keine Änderung der Kanonisierungslogik ohne PKG-01-Bestätigung (vermeidet Maskieren echter Feldfehler).

**Verifikation:** `poetry run pytest El Servador/god_kaiser_server/tests/unit/test_contract_ingress_matrix_t1_t6.py` (oder angepasster Unit-Test falls Log-Assertion), `ruff check` auf geänderten Dateien.

---

### PKG-04 — Frontend (nur falls UX-Lücke)

**Owner:** frontend-dev  
**Trigger:** Nur wenn nach Fix die WS-Events `config_published` / `config_response` im UI nicht mehr zusammenpassen.

- Bestehende Pfade: `useConfigResponse.ts`, Types in `src/types/index.ts` (`correlation_id` an Sensor-Response — bereits dokumentiert).
- Kein neues Alert-System; nur Anbindung an vorhandene Stores.

**Verifikation:** `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend" && npx vue-tsc --noEmit` und ggf. `npx vitest run` für betroffene Tests.

---

### PKG-05 — Doku (additiv)

**Owner:** nach Code-Freeze  
- `docs/debugging/correlation-id-playbook.md` oder `El Trabajante/docs/Mqtt_Protocoll.md`: kurzer Absatz „Config: Server sendet `correlation_id` in `.../config`; ESP **muss** sie in `.../config_response` zurückgeben“ mit Verweis auf `device_response_contract.canonicalize_config_response`.

---

## 4. Verify-Plan-Gate (Pflicht vor Merge der Produkt-Änderungen)

1. Skill **verify-plan** (`.claude/skills/verify-plan/SKILL.md`) auf die **nach PKG-01 verfeinerten** TASK-PACKAGES anwenden.
2. Ergebnis in `.claude/reports/current/auto-debugger-runs/config-response-correlation-contract-2026-04-10/VERIFY-PLAN-REPORT.md` schreiben.
3. TASK-PACKAGES.md / SPECIALIST-PROMPTS.md im selben Ordner gemäß Skill **nach** Verify anpassen (Orchestrator-Rolle auto-debugger).

---

## 5. BLOCKER-Kriterien

- PKG-01 kann keine Config-Payload mit `correlation_id` am Broker zeigen → **Server-Publish oder Routing** zuerst klären (Publisher, Topic-Subscription ESP).
- Evidence zeigt CID in Config, Firmware-Queue lehnt ab → getrennte Ursache (Intent-Metadaten / Parser); dann eigenes Mikro-PKG mit `intent_contract.cpp` / `extractIntentMetadataFromPayloadNoCorrelationFallback`.

---

## 6. Kurz-Zusammenfassung für Delegierte

**Start:** PKG-01 (Evidence).  
**Danach:** Producer-Fix PKG-02 gemäß Evidence (Firmware **oder** Mock/Tool — nicht raten).  
**Parallel möglich:** PKG-03 (Logging), wenn Teamkapazität da.  
**Frontend:** nur bei nachgewiesener UX-Lücke (PKG-04).

Alle Verify-Befehle mit vollem Projektpfad unter Windows wie in `AGENTS.md` ausführen.
