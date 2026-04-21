# VERIFY-PLAN-REPORT-ROUND3 — INC-2026-04-20-offline-mode-observability-hardening (GATE 3)

> **Skill-Basis:** `.claude/skills/verify-plan/SKILL.md`
> **Auftrag:** Reality-Check der Verifikationsbefehle und Dispatch-Disambiguierung nach Gate-2-PASS; drei gemeldete Ausfuehrungsfehler (PlatformIO-Env, Poetry-Workdir, Test-Env) plus eine Dokumentenkonsistenz-Note und eine PKG-08-CI-Semantikfrage.
> **Branch:** `auto-debugger/work` (verifiziert).
> **Ergebnis:** PASS mit dokumentierten externen BLOCKERn.

---

## A. Scope von Gate 3

Geprueft wurden:

1. Exakte Env-Namen in `El Trabajante/platformio.ini` gegen alle Vorkommen in `TASK-PACKAGES.md` und `SPECIALIST-PROMPTS.md`.
2. Poetry-Root fuer Server-Tests (`El Servador/god_kaiser_server/pyproject.toml`).
3. Inhalt von `.github/mosquitto/mosquitto.conf` fuer PKG-08-Migration (grep-verifiziert).
4. Strukturelle Konsistenz von `SPECIALIST-PROMPTS.md` (Mehrfach-Blockproblem, truncated Block 3).
5. Round-2-Dispatch-Pfad bleibt valide.

---

## B. Reality-Check (Repo-Ist)

| Pruefung | Befund (Repo) | Plan-Status VOR Gate 3 | Plan-Status NACH Gate 3 |
|----------|--------------|------------------------|------------------------|
| PlatformIO-Env `seeed` | **Existiert nicht**; real: `seeed_xiao_esp32c3`, `esp32_dev`, `esp32_prod`, `wokwi_*`, `native`, `esp32dev_test` | TASK L58, L198 `pio run -e seeed` (falsch) | beide auf `pio run -e seeed_xiao_esp32c3` korrigiert |
| PlatformIO-Test-Env `seeed_test` | **Existiert nicht**; real: `esp32dev_test` | PROMPTS alter Block: `pio test -e seeed_xiao_esp32c3` | korrigiert auf `pio test -e esp32dev_test` (dedicated test-env) |
| `pyproject.toml`-Lage | `El Servador/god_kaiser_server/pyproject.toml` (bestaetigt) | gemischte `pytest ...` ohne `cd` | vereinheitlicht auf `cd "El Servador/god_kaiser_server" && poetry run pytest tests/...` |
| `.github/mosquitto/mosquitto.conf` | grep `message_size_limit` -> 0 Treffer, grep `max_packet_size` -> 0 Treffer; nur `listener 1883 0.0.0.0`, `persistence false` | PKG-08 "analog migrieren" | PKG-08 explizit als **No-op** mit PR-Dokumentationspflicht markiert |
| `SPECIALIST-PROMPTS.md` Struktur | 3 Prompt-Fassungen hintereinander; Block 3 (frontend-dev) **truncated mid-sentence**; Block 4 (mqtt-dev) und Block 5 (Monitoring) **fehlten** | Dispatch-Risiko: unklare Verbindlichkeit | Header als "VERBINDLICH FUER DISPATCH" markiert; Kurzfassungen als `[HISTORISCH]`; Block 3 fertiggestellt; Block 4 + Block 5 + abschliessende BLOCKER + Startreihenfolge ergaenzt |

---

## C. Deltas uebernommen in Plan-Artefakte

| Delta | Datei | Stelle | Aenderung |
|-------|-------|--------|----------|
| D-R3-01 | `TASK-PACKAGES.md` | PKG-01a Tests | `pio run -e seeed` -> `pio run -e seeed_xiao_esp32c3`; Unit-Test-Env-Zeile auf `pio test -e esp32dev_test` gesetzt. |
| D-R3-02 | `TASK-PACKAGES.md` | PKG-03 Tests | Firmware-Build-, Server-pytest- und Frontend-Build-Befehle voll qualifiziert (`cd ...`, `poetry run`). |
| D-R3-03 | `TASK-PACKAGES.md` | PKG-08 IST + SOLL | `.github/mosquitto/mosquitto.conf` als **No-op** explizit; Kommentar-Pflicht nur fuer `docker/mosquitto/mosquitto.conf`; Akzeptanzkriterien angepasst. |
| D-R3-04 | `SPECIALIST-PROMPTS.md` | Header | "VERBINDLICH FUER DISPATCH"-Marker; Build-Env-Korrektur im Header zitiert. |
| D-R3-05 | `SPECIALIST-PROMPTS.md` | Kurzfassung 1 + 2 | als `[HISTORISCH — NICHT VERBINDLICH]` markiert. |
| D-R3-06 | `SPECIALIST-PROMPTS.md` | Block 2 Pre-Checks | Target-Envs-Hinweis auf `seeed_xiao_esp32c3` + `esp32dev_test` konkretisiert. |
| D-R3-07 | `SPECIALIST-PROMPTS.md` | Block 2 Verifikation | Firmware-Test-Env auf `esp32dev_test` korrigiert. |
| D-R3-08 | `SPECIALIST-PROMPTS.md` | Block 3 Rest | frontend-dev-Block vervollstaendigt (Soft-Match-Logik, e2e_latency, Tests, Akzeptanzkriterien). |
| D-R3-09 | `SPECIALIST-PROMPTS.md` | Block 4 neu | mqtt-dev-Block mit PKG-01-Topic-Kontrakt und PKG-08-No-op-Klausel ergaenzt. |
| D-R3-10 | `SPECIALIST-PROMPTS.md` | Block 5 neu | server-dev Monitoring-Block (PKG-05) als eigener Block (Trennung von Code-Arbeit). |
| D-R3-11 | `SPECIALIST-PROMPTS.md` | BLOCKER + Startreihenfolge | als finale, verbindliche Sektion angehaengt. |

---

## D. Plan-Code-Konsistenz nach Round 3

| Pruefpunkt | Status |
|-----------|--------|
| Alle `pio run`-Befehle referenzieren existierende Envs | PASS |
| Alle `poetry run pytest`-Befehle referenzieren existierenden Poetry-Root | PASS |
| PKG-08 macht keine blinden Aenderungen in CI-Config | PASS |
| `SPECIALIST-PROMPTS.md` hat genau eine verbindliche Fassung (Block 1-5) | PASS |
| Historische Fassungen klar als HISTORISCH gekennzeichnet | PASS |
| 10 Pakete bleiben additiv; keine neuen Migrationen/Breaks | PASS |

---

## E. Verbleibende BLOCKER (keine Plan-Inkonsistenzen)

| Code | Kategorie | Wirkung | Stand |
|------|-----------|---------|-------|
| `B-QP-PERSIST-01` | Entscheidung | Persistenzstrategie PKG-01b | offen (Robin) |
| `B-MQTT-VERSION-01` | Runtime | Mosquitto-Version vor PKG-08 | offen (Robin) |
| `B-USER-DOCKER-01` | Sandbox | Docker-Restart fuer PKG-05 + PKG-08 | offen (Robin) |
| `B-WS-PATH-01` | Pfad-Precheck | WS-Manager-Signatur vor PKG-04a | Pflicht-Pre-Check im Block |
| `B-MON-PATH-01` | Pfad-Precheck | Loki/Grafana-Overlay-Pfad vor PKG-05 | Pflicht-Pre-Check im Block |
| `B-LOG-API-01` | Pfad-Precheck | Logger-API in `conflict_manager.py` | Pflicht-Pre-Check im Block |
| `B-FE-WS-TYPE-01` | Pfad-Precheck | `websocket-events.ts` Pfad final | Pflicht-Pre-Check im Block |
| `B-QP-TOPIC-01` | Koordination | Topic-Name mqtt-dev <-> esp32-dev | Pflicht-Abstimmung im Block |

**Bewertung:** Keine Plan-Code-Inkonsistenzen mehr; alle verbleibenden Punkte sind Ausfuehrungsgates (Runtime, Entscheidung, Pre-Check). Gate 3 bleibt PASS.

---

## F. Breaking-Change-Guard (Round 3)

- Keine neuen Migrationen, keine veraenderten Bestandstopics/REST/WS-Signaturen.
- PKG-08 greift nicht blind in `.github/mosquitto/mosquitto.conf`; CI-Profil bleibt stateless.
- FE-Store-Shape bleibt rueckwaertskompatibel (nur optionale Felder).
- Frontend-Auflosung via `terminal_guard` nur bei eindeutiger Zuordnung (`pending_count === 1`).

---

## G. OUTPUT FUER ORCHESTRATOR (auto-debugger)

### PKG -> Delta

| PKG | Delta (Pfad, Testbefehl, Reihenfolge, Risiko, HW-Gate) |
|-----|--------------------------------------------------------|
| PKG-01a | Build-Verifikation: `cd "El Trabajante" && pio run -e seeed_xiao_esp32c3`. Optionaler Unit-Test: `pio test -e esp32dev_test`. |
| PKG-01b | Test-Invokation: `cd "El Servador/god_kaiser_server" && poetry run pytest tests/mqtt/ -v`. Additiv, kein Alembic. |
| PKG-02 | `poetry run pytest tests/services/logic/safety/test_conflict_manager.py -v`. |
| PKG-03 | Server + Firmware + Frontend Verifikationsbefehle vereinheitlicht (siehe Block 1-3). |
| PKG-04a | WS-Event und correlation_id_source additiv; Server-Broadcast vor `return True` in stale-Pfad. |
| PKG-04b | Soft-Match nur bei `pending_count === 1`; sonst bestehendes Verhalten. |
| PKG-05 | Nur Repo-Config-Aenderungen; Runtime-Reload `B-USER-DOCKER-01`. |
| PKG-06 | `CONFIG_GUARD status=expected` strukturierte Logline. |
| PKG-07 | 4062 `subcategory=MQTT_PUBLISH_BACKPRESSURE` additiv. |
| PKG-08 | `docker/mosquitto/mosquitto.conf`: Migration + Kommentar. `.github/mosquitto/mosquitto.conf`: **No-op** (grep-verifiziert). |

### PKG -> empfohlene Dev-Rolle

| PKG | Rolle |
|-----|-------|
| PKG-01 (Topic) | mqtt-dev (Block 4) |
| PKG-01a | esp32-dev (Block 2) |
| PKG-01b | server-dev (Block 1) |
| PKG-02 | server-dev (Block 1) |
| PKG-03 | esp32-dev + server-dev + frontend-dev (Block 1-3) |
| PKG-04a | server-dev (Block 1) |
| PKG-04b | frontend-dev (Block 3) |
| PKG-05 | server-dev (Block 5) |
| PKG-06 | server-dev (Block 1) |
| PKG-07 | server-dev (Block 1) |
| PKG-08 | mqtt-dev (Block 4) |

### Cross-PKG-Abhaengigkeiten

- PKG-01 Topic (mqtt-dev) -> PKG-01a (esp32-dev) -> PKG-01b (server-dev).
- PKG-04a (server-dev) -> PKG-04b (frontend-dev).
- PKG-01a Event-Konvention -> PKG-03 Latenzkette (alle drei Schichten).
- PKG-05 + PKG-08 -> User-Aktion fuer Runtime-Verifikation.

### BLOCKER (Round 3 unveraendert)

- `B-QP-PERSIST-01`, `B-MQTT-VERSION-01`, `B-USER-DOCKER-01`, `B-WS-PATH-01`, `B-MON-PATH-01`, `B-LOG-API-01`, `B-FE-WS-TYPE-01`, `B-QP-TOPIC-01`.

---

## H. Gate-3-Urteil

**Gate 3: PASS.**
Alle drei gemeldeten Ausfuehrungsfehler (PlatformIO-Env, Poetry-Workdir, Test-Env) sind in `TASK-PACKAGES.md` und `SPECIALIST-PROMPTS.md` korrigiert. `SPECIALIST-PROMPTS.md` hat jetzt genau eine verbindliche Fassung (Block 1-5) mit vollstaendig ausformuliertem Block 3 und neuen Bloecken 4 + 5. PKG-08 ist gegen die CI-Config-Realitaet gehaertet (No-op). Der Plan ist dispatch-bereit; verbleibende BLOCKER sind externe Ausfuehrungsgates.

**Dispatch-Freigabe:** Welle 1 darf starten (Block 1 PKG-02/06/07 + Block 2 PKG-01a-Pre-Checks + Block 4 PKG-01 TopicBuilder).
