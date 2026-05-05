---
run_mode: both
incident_id: INC-2026-04-10-mqtt-json-parse-trace
run_id: mqtt-json-parse-fail-trace-2026-04-10
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/auftraege/auto-debugger/outbox/BERICHT-test-json-parse-fail-mqtt-2026-04-10.md
  - docs/debugging/correlation-id-playbook.md
  - docs/debugging/logql-queries.md
  - .claude/reference/debugging/LOG_LOCATIONS.md
scope: |
  Ausgangslage: Docker-Log zeigt `Invalid JSON payload` mit `topic=…/esp/FAKE_VERIFY/…`,
  `mqtt_parse_fail_id=parse-fail:<hex>` und `failure_class=mqtt_json_parse` (Ingress-Reject
  in `Subscriber._route_message`, kein Handler-Lauf).

  Stack-Durchgang (IST, verifiziert im Repo):
  1) El Trabajante: Sensor-Payloads als JSON über MQTT (Topic-Schema `kaiser/{…}/esp/{esp_id}/…`);
     liefert ein Gerät kein gültiges JSON, ist die Ursache firmware-/toolseitig, nicht der Parse-Block selbst.
  2) Mosquitto: reiner Transport; keine JSON-Validierung.
  3) El Servador `god_kaiser_server/src/mqtt/subscriber.py` — `_route_message`: nach leerem Payload
     `json.loads(payload_str)`; bei `JSONDecodeError` synthetische `mqtt_parse_fail_id`, ERROR-Log mit
     `extra["failure_class"]="mqtt_json_parse"`, `messages_failed += 1`, sofort `return` (kein
     `generate_mqtt_correlation_id`, kein Handler).
  4) Metriken: `get_stats()` aggregiert nur `messages_processed` / `messages_failed` — Parse-Fails und
     Handler-Fails laufen in dieselbe `messages_failed`-Zahl (Differenzierung nur über Logs/`failure_class`).
  5) Tests: `tests/unit/test_mqtt_correlation.py::test_route_message_json_decode_error_logs_mqtt_parse_fail_id`
     (Topic mit `ESP_UNIT`); `tests/integration/test_mqtt_subscriber.py::test_invalid_json_increments_failed_counter`.
     String `FAKE_VERIFY` kommt im Repo nicht vor → externe/manuelle Quelle wahrscheinlich.
  6) Frontend: kein direkter Bezug; Korrelation läuft über Server-Logs (Loki/LogQL: `mqtt_parse_fail_id`,
     `failure_class=mqtt_json_parse`, siehe `docs/debugging/logql-queries.md`).

  Ziel dieses Laufs:
  A) Incident-Artefakte: Lagebild, Korrelation (Topic-Zeitfenster vs. Test/CI), klare Einordnung Bug vs. Lärm.
  B) Nachweis, **wer** `FAKE_VERIFY` published hat (Broker-Log, `mosquitto_sub`/Trace, lokale Skripte, CI).
  C) Artefakt-Verbesserung: operative Leitplanken (Test-Traffic vs. Stack-Metriken), Verweise konsistent;
     optionale Produktverbesserung nur nach Verify-Plan-Gate und nur wenn Akzeptanzkriterien es verlangen
     (z. B. eigener Zähler für Parse-Fails — aktuell nicht zwingend, wenn Ursache nur manueller Test war).

forbidden: |
  Keine Secrets in Reports/Steuerdatei.
  Keine Änderung des MQTT-Topic-Vertrags oder Breaking Changes an REST/WS/DB ohne separates Gate.
  Keine Commits direkt auf `master` — nur Branch `auto-debugger/work`.
  Kein „Fix“ von `json.loads`-Verhalten, solange die Einordnung nicht abgeschlossen ist (erwarteter Reject
  bei ungültigem JSON).
  Firmware nur bei nachgewiesenem ESP-Ursprung und mit `esp32-dev` + Safety-Review anfassen.

done_criteria: |
  - `INCIDENT-LAGEBILD.md` und `CORRELATION-MAP.md` unter
    `.claude/reports/current/incidents/INC-2026-04-10-mqtt-json-parse-trace/` sind ausgefüllt; Root-Cause
    „externer Test“ vs. „echtes Gerät“ ist entschieden oder als BLOCKER mit messbarer Nachbedingung dokumentiert.
  - `TASK-PACKAGES.md` + `SPECIALIST-PROMPTS.md` existieren; `/verify-plan`-Gate durchlaufen;
    `VERIFY-PLAN-REPORT.md` im Incident-Ordner (und bei Bedarf unter `auto-debugger-runs/<run_id>/`) geschrieben;
    Post-Verify-Anpassung der Pakete abgeschlossen.
  - Mindestens eine messbare operative Maßnahme umgesetzt oder bewusst verworfen: z. B. dokumentierte Konvention
    für manuelle `mosquitto_pub`-Tests (eigenes esp_id-Präfix / separates Compose-Profil), oder Nachweis, dass
    Produktion nicht betroffen ist.
  - Falls Code geändert wird: `poetry run pytest` für betroffene Server-Tests grün; `ruff check src/` grün.
---

# STEUER — Fixauftrag: MQTT JSON-Parse-Fail / `FAKE_VERIFY` / `mqtt_parse_fail_id`

**Referenz-Analyse:** `.claude/auftraege/auto-debugger/outbox/BERICHT-test-json-parse-fail-mqtt-2026-04-10.md`  
**Orchestrierung:** Agent `auto-debugger` (`.claude/agents/auto-debugger.md`) — Git-Zwang: Branch **`auto-debugger/work`**.

---

## Phase 0 — Git (vor allem Schreiben)

1. `git branch --show-current` — wenn nicht `auto-debugger/work`: `git checkout auto-debugger/work` (Konflikte → manuell lösen).
2. Im **INCIDENT-LAGEBILD** erste Zeile: Ist-Branch vs. Soll-Branch `auto-debugger/work`.

---

## Phase 1 — Incident (Modus `incident`)

### Schritt 1.1 — Lagebild festhalten

**Artefakt:** `.claude/reports/current/incidents/INC-2026-04-10-mqtt-json-parse-trace/INCIDENT-LAGEBILD.md`

- Symptom wörtlich: Logzeile `Invalid JSON payload topic=…` + `mqtt_parse_fail_id` + Exception-Text.
- Zeitfenster, Umgebung (docker compose Service-Name, Host).
- Bekannte Fakten aus Repo: `FAKE_VERIFY` nirgends im Tree; Test-Topic in Unit-Tests ist `ESP_UNIT`, nicht `FAKE_VERIFY`.

### Schritt 1.2 — Korrelation (Reihenfolge laut auto-debugger §1.3)

**Artefakt:** `CORRELATION-MAP.md`

| Cluster | Felder | Inhalt |
|--------|--------|--------|
| MQTT | `topic` (enthält `esp_id`-Segment), `mqtt_parse_fail_id`, `failure_class=mqtt_json_parse` | Zeile aus El-Servador-stdout/JSON-Log |
| HTTP | — | bei diesem Pfad typischerweise **kein** `X-Request-ID` (kein REST vor Handler) |
| Zeit | Broker-Message-Zeit vs. Server-Log-Zeit | Drift notieren |

**Explizit nicht vermischen:** ISA-/DB-Notifications vs. transientes WS-`error_event` — hier nur **Server-MQTT-Ingress-Log**.

### Schritt 1.3 — Ursache `FAKE_VERIFY` (Pflichtnachweis)

**Delegation:** Rolle **`mqtt-debug`** (Lesen/Analyse, kein Code-Zwang)

1. Broker-seitig: wer hat zu dem Zeitpunkt auf `kaiser/god/esp/FAKE_VERIFY/...` publiziert? (`mosquitto` Log-Level, `log_type`, ggf. `connection_messages` — je nach Broker-Config im Projekt).
2. Client-seitig: lokale Shell-History, CI-Job, Entwickler-Skripte, `mosquitto_pub` mit absichtlich kaputtem JSON.
3. **Entscheidung dokumentieren:**
   - **A)** Manueller/CI-Test → *kein Produktionsdefekt*; Empfehlung: Tests gegen separaten Broker oder konventionsgebundenes Präfix (`TEST_`, `MOCK_`) in Runbooks.
   - **B)** Echtes Gerät → Eskalation **`esp32-debug`** + Firmware-Pfad (Payload-Build); Parallel **`server-debug`** nur zur Bestätigung, dass kein zweiter Fehler überlagert.

### Schritt 1.4 — TASK-PACKAGES (Erstentwurf)

**Artefakt:** `TASK-PACKAGES.md` — kleine Pakete, ein Owner pro Paket:

| PKG | Owner | Inhalt (Vorschlag) |
|-----|--------|---------------------|
| PKG-01 | mqtt-debug | Nachweis Publisher `FAKE_VERIFY`; Ergebnis ins Lagebild |
| PKG-02 | server-dev *optional* | Nur wenn Verify-Plan: z. B. **separater** Counter `mqtt_json_parse_rejects` neben `messages_failed` *oder* Dokumentation, dass Aggregation beabsichtigt ist |
| PKG-03 | — (Doku) | `target_docs`: Verweis in `docs/debugging/correlation-id-playbook.md` / `LOG_LOCATIONS` konsistent halten; keine doppelte Wahrheit |
| PKG-04 | test-log-analyst *bei Codeänderung* | `pytest tests/unit/test_mqtt_correlation.py tests/integration/test_mqtt_subscriber.py` |

Bei Code-PKGs: **`FEHLER-REGISTER.md`** im Incident-Ordner anlegen.

### Schritt 1.5 — SPECIALIST-PROMPTS (Erstentwurf)

**Artefakt:** `SPECIALIST-PROMPTS.md` — pro Block die Pflichtabschnitte aus auto-debugger **0a** (Git, Pattern-Reuse, Frontend/Obs-Hinweis falls relevant, Verify-Befehl, Fehler-Register).

### Schritt 1.6 — Gate: `/verify-plan`

- Skill **`verify-plan`** auf `TASK-PACKAGES.md` anwenden.
- Ausgabe vollständig in **`VERIFY-PLAN-REPORT.md`** schreiben (Pfade, Befehle, Abweichungen Repo-Ist).

### Schritt 1.7 — Post-Verify

- `TASK-PACKAGES.md` und `SPECIALIST-PROMPTS.md` **mutieren** nach Verify-Deltas.
- **Keine** Produkt-Implementierung durch den Orchestrator — nur Übergabe an Dev-Rollen.

---

## Phase 2 — Artefakt-Verbesserung (Modus `artefact_improvement`)

**Ausgabeordner (Pakete parallel dokumentierbar):**  
`.claude/reports/current/auto-debugger-runs/mqtt-json-parse-fail-trace-2026-04-10/`

### Schritt 2.1 — IST der Zieldokumente prüfen

- Abgleich: `BERICHT-test-json-parse-fail-mqtt-2026-04-10.md` ↔ Code `subscriber.py` (Zeilen ~174–188) ↔ `docs/debugging/correlation-id-playbook.md` §3 ↔ `docs/debugging/logql-queries.md`.

### Schritt 2.2 — Additive Ergänzungen (nur bei Lücke)

- Wenn Nachweis **manueller Publish:** ein Absatz „Empfohlene Verfahren“ (eigenes esp_id-Schema für Tests, kein `kaiser/#` mit Rohstrings in Staging ohne Absicht).
- Wenn **Stale-Verify-Reports** (z. B. alte Formulierung „kein mqtt_parse_fail_id“): Hinweis oder Archiv-Tag — **kein** Widerspruch zum aktuellen Code belassen.

### Schritt 2.3 — Wiederholung Verify nur bei neuen Code-PKGs

- Analog Phase 1.6–1.7, falls sich der Scope auf Implementierung ausweitet.

---

## Verifikationsbefehle (El Servador, bei Codeänderung)

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
poetry run pytest tests/unit/test_mqtt_correlation.py tests/integration/test_mqtt_subscriber.py -q --tb=short
poetry run ruff check src/mqtt/subscriber.py
```

Frontend-Build nur nötig, wenn UI berührt wird (**hier: nicht erwartet**).

---

## Kurz: Was ist der „Fix“?

- **Wenn Ursache = absichtlicher/kaputter Test-Publish:** Fix = **Prozess + Nachvollziehbarkeit**, nicht `json.loads`.
- **Wenn Ursache = echtes Gerät:** Fix = **Firmware/Tooling**, Server verhält sich korrekt beim Reject.
- **Optional Produkt:** klarere Metrik-Trennung oder Runbooks — nur nach Verify und klarer Anforderung.

---

*Ende STEUER*
