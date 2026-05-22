# SPECIALIST-PROMPTS — `config-response-correlation-contract-2026-04-10`

**Nach Verify angepasst:** `TASK-PACKAGES.md` und `VERIFY-PLAN-REPORT.md` im selben Ordner.  
**Reihenfolge:** PKG-01 → PKG-02 → (parallel möglich) PKG-03 → PKG-04 nur bei Bedarf → PKG-05 nach Freeze.

---

## Block A — mqtt-debug / DevOps (PKG-01)

### Git (Pflicht)
- Arbeitsbranch: **auto-debugger/work**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)
- Topics aus `.claude/reference/api/MQTT_TOPICS.md` und Runtime-`kaiser_id` — nicht nur das Beispiel `god` aus der Steuerung.
- Korrelations-Reihenfolge: zuerst MQTT-`correlation_id` (Config/Response), dann `esp_id` + Zeitfenster — **nicht** mit HTTP-`X-Request-ID` vermischen (`docs/debugging/correlation-id-playbook.md`).

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)
- Dieses Paket ist **Evidence-only**; keine UI-Änderung.

### Verify-Befehl (Pflicht)
- Deliverable: **Markdown-Kurzprotokoll** (Timestamp, Topics, Rohpayloads oder Broker-Log-Auszug) — kein pytest.

### Fehler-Register (Pflicht bei Code)
- Nicht zutreffend für reine MQTT-Aufzeichnung. Bei Tooling-Fehlern: Eintrag in `FEHLER-REGISTER.md` im Run-Ordner.

---

## Block B — esp32-dev **oder** server-dev (PKG-02, abhängig von PKG-01)

### Git (Pflicht)
- Arbeitsbranch: **auto-debugger/work**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)
- **Firmware:** `El Trabajante/src/services/config/config_response.cpp` und `ensureCorrelationId` / Config-Queue-Pfad in `main.cpp` per `Grep` finden — **closest implementation** erweitern.
- **Mock:** `tests/esp32/mocks/mock_esp32_client.py` an bestehende Kanonisierung anbinden (gleiche `status`/`type`-Semantik wie Produkt).

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)
- Keine neue Notification-Welt; Terminalität bleibt über bestehende WS-Contract-Events.

### Verify-Befehl (Pflicht)
- Firmware:  
  `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante"`  
  `pio run -e seeed_xiao_esp32c3`
- Server (Mock/Contract):  
  `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"`  
  `poetry run pytest tests/integration/test_contract_ingress_matrix_t1_t6.py tests/unit/test_device_response_contract.py --tb=short -q`

### Fehler-Register (Pflicht bei Code)
- Jeder Build-/Test-Fehler: Evidenz → Hypothese → Minimalfix → **gleicher** Verify-Befehl erneut; siehe `FEHLER-REGISTER.md`.

---

## Block C — server-dev (PKG-03)

### Git (Pflicht)
- Arbeitsbranch: **auto-debugger/work**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)
- Nur `config_handler.py` Warning erweitern; Kanonisierung in `device_response_contract.py` **nicht** ändern ohne PKG-01-Bestätigung (Verify-Report).

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)
- Ziel: Warning lesbar ohne Code-Lektüre (`contract_issues` / `canonical.message`); keine Secrets in Logs.

### Verify-Befehl (Pflicht)
```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
poetry run pytest tests/integration/test_contract_ingress_matrix_t1_t6.py tests/unit/test_device_response_contract.py --tb=short -q
poetry run ruff check src/mqtt/handlers/config_handler.py
```

### Fehler-Register (Pflicht bei Code)
- Pflicht; bei rot: Eintrag + Mikrozirkular.

---

## Block D — frontend-dev (PKG-04, nur bei Trigger)

### Git (Pflicht)
- Wie oben: **auto-debugger/work** only.

### Pattern-Reuse (Pflicht)
- `useConfigResponse.ts`, `contractEventMapper` / bestehende Intent-Stores — **keine** parallele Alert-Welt.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)
- Nur Anbindung an vorhandene Stores/WebSocket; ISA-Inbox vs. transient trennen.

### Verify-Befehl (Pflicht)
```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend"
npx vue-tsc --noEmit
npx vitest run
```

### Fehler-Register (Pflicht bei Code)
- Pflicht bei TS/Vitest-Fehlern.

---

## Block E — Doku (PKG-05)

### Git (Pflicht)
- **auto-debugger/work** für repo-gehörige Docs.

### Verify-Befehl (Pflicht)
- Review-Check: Links zu `canonicalize_config_response` und Playbook stimmig; kein Secret.

---

*Ende SPECIALIST-PROMPTS*
