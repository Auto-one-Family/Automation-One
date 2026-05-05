---
run_mode: incident
incident_id: INC-2026-04-10-zone-assign-master-resync
run_id: zone-assign-master-resync-2026-04-10
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/auftraege/auto-debugger/outbox/BERICHT-zone-assign-leerer-master-resync-2026-04-10.md
scope: |
  End-to-End-Fix für wiederholte MQTT zone/assign mit leerem master_zone_id und daraus
  folgendem verwirrenden ESP-Serial („Master Zone:“ leer), inkl. Heartbeat-ZONE_MISMATCH-Resync
  (60s Cooldown). Ausgangspunkt: BERICHT vom 2026-04-10; Repo-Ist über alle Schichten verifiziert.

  IST (Code, kurz):
  - Server ZoneService.assign_zone setzt device.master_zone_id = master_zone_id auch wenn der
    REST-Client master_zone_id weglässt (Pydantic-Default None) → DB-Feld wird auf NULL gesetzt.
  - Frontend useZoneDragDrop, HardwareView (Zone anlegen + Gerät zuweisen, Zone umbenennen)
    rufen zonesApi.assignZone ohne master_zone_id auf → überschreiben implizit den Master.
  - Heartbeat-Handler publish bei ZONE_MISMATCH resync_payload mit
    esp_device.master_zone_id or "" (heartbeat_handler.py) → leer wenn DB NULL (kein Zufall).
  - Tabelle zones (zone.py) hat kein parent/master-Feld; hierarchischer Master existiert nur
    als esp_devices.master_zone_id (optional). Ableitung „aus Zonen-Tabelle“ wäre Schema-Erweiterung.

  SOLL:
  - Kein stiller Verlust von master_zone_id bei Zuweisungen, die nur zone_id/zone_name ändern.
  - MQTT-Payloads und Resync mit konsistentem master, sobald in DB gepflegt.
  - Wiederholte 60s-Resyncs nur noch bei echtem Mismatch (Heartbeat/ESP), nicht durch verwischte API-Semantik.
  - Verifizierte Tests + ggf. kurze API-Doku-Anpassung (REST_ENDPOINTS / Zone-Assign Semantik).

forbidden: |
  - Commits direkt auf master (nur Branch auto-debugger/work).
  - Secrets in Reports/Steuerdatei.
  - Breaking REST ohne Gate: bestehende Clients, die master_zone_id absichtlich mit null leeren,
    müssen weiterhin ein definiertes Verhalten haben (nach Fix: explizites null vs weglassen klären
    und in Tests festhalten).
  - Neue externe Dependencies nur für diesen Fix.
  - Firmware-Safety-Pfade (SafetyController, Watchdog) nicht anfassen ohne eigenes Review-Gate.

done_criteria: |
  - /verify-plan gegen TASK-PACKAGES.md abgeschlossen; VERIFY-PLAN-REPORT.md liegt im Incident-Ordner.
  - Server: Unit/Integration-Tests grün (mind. assign_zone preserve-master, optional Heartbeat-Resync-Payload).
  - Frontend: vue-tsc --noEmit und relevante Vitest-Tests grün falls API-Client/Calls angepasst.
  - Manuell oder Integration: assign ohne master ändert nicht master in DB; assign mit explizitem Wert setzt;
    explizites Leeren (falls unterstützt) dokumentiert und getestet.
  - Dokumentation: REST-Semantik für master_zone_id (weglassen vs null vs "") an einem Ort nachgezogen.
---

# STEUER — Fix: leerer master_zone_id bei zone/assign & Resync

> **Arbeitsbranch:** `auto-debugger/work` (vor allen Änderungen auschecken und verifizieren).

## 1. Lagebild (IST)

**Symptom:** Serial zeigt wiederholt `…/zone/assign`, Log „Master Zone:“ leer, ca. 60s Takt.

**Ursachenkette (Repo-bewiesen):**

| Schicht | Befund |
|---------|--------|
| **MQTT / Heartbeat** | `_update_esp_metadata` in `heartbeat_handler.py`: bei `(not esp_has_zone and db_has_zone) or esp_lost_zone` wird `zone/assign` mit `master_zone_id: esp_device.master_zone_id or ""` publiziert. Leer = DB-NULL. Cooldown 60s. |
| **Server Zone** | `zone_service.py` `assign_zone`: `device.master_zone_id = master_zone_id` — wenn REST `master_zone_id` weglässt → `None` → DB wird überschrieben. Payload MQTT: `master_zone_id or ""`. |
| **REST** | `schemas/zone.py` `ZoneAssignRequest.master_zone_id` optional. |
| **Frontend** | `useZoneDragDrop.ts` `assignZone` nur `zone_id` + `zone_name`; `HardwareView.vue` Zone-Erstellung + Umbenennen ebenfalls ohne `master_zone_id`. `ZoneAssignmentPanel.vue` kann Master setzen, wenn `currentMasterZoneId` gesetzt ist. |
| **DB-Modell** | `zones`-Tabelle: kein Parent — `master_zone_id` nur auf `esp_devices` (`esp.py`). |
| **Firmware** | `main.cpp` loggt empfangenes `master_zone_id` — leerer String ist konsistent mit Server-Payload, kein Parser-Zwang-Bug. |

**Risiko / Annahme:** Produkt will „Master optional“; Fix darf nicht erzwingen, dass jede Zone einen Parent hat, sondern nur **verlustfreie** Updates und klare **Clear**-Semantik.

---

## 2. Produktentscheid (vor oder in PKG-01 dokumentieren)

**Frage:** Soll `master_zone_id` bei `POST …/zones/assign` (oder eurem konkreten Pfad — siehe `El Servador/god_kaiser_server/src/api/v1/zone.py`) folgende Semantik haben?

- **A (empfohlen für Bugfix):** Feld **weggelassen** im JSON → **bestehenden** `esp_devices.master_zone_id` **nicht ändern**. Explizit leeren nur über `""` oder `null` nach definierter Regel (eine Variante wählen und testen).
- **B:** Immer aus `zones`-Tabelle ableiten → **BLOCKER** bis Schema/Migration + ZoneService-Anreicherung (aktuell keine Spalte).

**Empfehlung:** A umsetzen; B als spätere Epic festhalten.

Trage Entscheidung in `INCIDENT-LAGEBILD.md` ein.

---

## 3. Korrelation / Evidence (für CORRELATION-MAP.md)

- **MQTT:** Topic-Pattern `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign` (`TopicBuilder.build_zone_assign_topic`).
- **Server-Logs:** Strings `ZONE_MISMATCH`, `Auto-reassigning zone`, `zone_resync_sent_at`.
- **DB:** `esp_devices.zone_id`, `esp_devices.master_zone_id`, `esp_devices.device_metadata` (u. a. `zone_resync_sent_at`).
- **REST:** `X-Request-ID` / `request_id` für Zuweisungs-Calls aus Frontend.

---

## 4. TASK-PACKAGES (Reihenfolge)

### PKG-01 — server-dev: Semantik `assign_zone` + Tests

**Dateien (IST-Pfade):**

- `El Servador/god_kaiser_server/src/services/zone_service.py` — Zuweisung `device.master_zone_id` nur wenn im Request gesetzt (Pydantic v2: `if "master_zone_id" in request.model_fields_set` im API-Layer **oder** Service erhält `Optional` + separates `update_master: bool` — **Pattern-Reuse:** gleiche Session/Transaktion wie heute).
- `El Servador/god_kaiser_server/src/api/v1/zone.py` — Request-Objekt auswerten; vermeide Duplikat-Logik: entweder Router reicht Flag, oder Service akzeptiert `master_zone_id` + `master_zone_id_specified: bool`.

**Akzeptanz:**

- `assign_zone` ohne Feld `master_zone_id` im Body lässt DB-Spalte `master_zone_id` unverändert (Regression-Test mit Gerät, das vorher `master` in DB hat).
- Explizites Setzen/Leeren gemäß Produktentscheid (PKG-01 Einleitung) mit Testfall.
- `poetry run pytest` für geänderte Tests + relevante Integration (`tests/integration/test_api_zone.py`, `tests/integration/test_zone_bridge.py` o. ä. anpassen).

**Verify:** `cd "El Servador/god_kaiser_server" && poetry run pytest tests/unit/test_… tests/integration/test_api_zone.py -q` (Paket konkretisieren im VERIFY-PLAN).

---

### PKG-02 — frontend-dev: Aufrufe konsistent (optional aber empfohlen)

**Dateien:**

- `El Frontend/src/composables/useZoneDragDrop.ts` — bei `assignZone` optional `master_zone_id` vom aktuellen Device mitsenden, **wenn** Store einen Wert hat (hilft Lesbarkeit/Debug; Server-Fix aus PKG-01 ist die eigentliche Absicherung).
- `El Frontend/src/views/HardwareView.vue` — gleiche Strategie für Zone Create + Rename-Schleife.

**Akzeptanz:** Keine TS-Fehler; `npx vue-tsc --noEmit`; Vitest falls vorhanden für Zone-Composable.

---

### PKG-03 — server-dev / mqtt-dev: Heartbeat-Resync (nur falls PKG-01 nicht reicht)

**Prüfung:** Nach PKG-01 sollte `esp_device.master_zone_id` stabil sein und Resync-Payload gefüllt sein.

**Falls** Resync weiterhin leer bleibt, obwohl DB korrekt:

- Logs: bleibt `ZONE_MISMATCH` dauerhaft? → dann ESP-Pfad (Heartbeat `zone_id` / `zone_assigned`) mit `esp32-debug`, nicht nur Master-String.
- Optional: `SimulationScheduler.update_zone` in `scheduler.py` erweitern (Mock-ESP) um `master_zone_id` — **nur** wenn Mocks im Scope und Verify-Plan es verlangt.

---

### PKG-04 — Doku (minimal)

- `.claude/reference/api/REST_ENDPOINTS.md` oder zentraler Zone-Abschnitt: Semantik `master_zone_id` (weglassen / explizit setzen / leeren).
- Kein Roman; eine Tabelle oder 3 Bulletpoints.

---

## 5. /verify-plan-Gate (Pflicht)

1. TASK-PACKAGES.md aus diesem Auftrag in `.claude/reports/current/incidents/INC-2026-04-10-zone-assign-master-resync/` anlegen (auto-debugger kopiert/anpasst).
2. Skill `verify-plan` auf Pfade, Tests, `assign_zone`-Signatur anwenden.
3. `VERIFY-PLAN-REPORT.md` schreiben; danach TASK-PACKAGES + SPECIALIST-PROMPTS gemäß Skill `auto-debugger` nachziehen.

---

## 6. Verifikationsbefehle (Repo-Standard)

| Bereich | Befehl |
|---------|--------|
| Backend | `cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -q --tb=short` (oder scoped nach PKG) |
| Backend Lint | `poetry run ruff check src/` |
| Frontend | `cd "El Frontend" && npx vue-tsc --noEmit && npx vitest run` (scoped wenn nötig) |

---

## 7. Nicht-Ziele (Scope-Disziplin)

- Keine Änderung der Heartbeat-Cooldown-Dauer ohne Messung.
- Keine neue `zones.parent_zone_id`-Migration in diesem Incident (eigenes STEUER).
- Firmware nur bei nachgewiesenem Heartbeat-Drift (separates PKG).

---

## 8. Übergabe

**Start:** server-dev mit PKG-01 → verify-plan → frontend PKG-02 → Abnahme `done_criteria`.

**BLOCKER:** Produktentscheid Abschnitt 2 nicht getroffen → Semantik von null/"" nicht implementierbar ohne Nacharbeit.
