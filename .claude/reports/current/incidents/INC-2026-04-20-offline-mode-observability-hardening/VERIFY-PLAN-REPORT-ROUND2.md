# VERIFY-PLAN-REPORT-ROUND2 — INC-2026-04-20-offline-mode-observability-hardening (GATE 2)

> **Skill-Basis:** `.claude/skills/verify-plan/SKILL.md`  
> **Ziel:** Konvergenz-Check nach Gate-1-Mutation von `TASK-PACKAGES.md` und rollenweiser Konsolidierung von `SPECIALIST-PROMPTS.md`.  
> **Branch:** `auto-debugger/work` (verifiziert).  
> **Ergebnis:** PASS mit dokumentierten externen BLOCKERn.

---

## A. Scope von Gate 2

Geprueft wurden:

1. Post-Verify-Paketschnitt (`PKG-01a/01b`, `PKG-04a/04b`) in `TASK-PACKAGES.md`.
2. Rollenkonsolidierung in `SPECIALIST-PROMPTS.md` (ein Block pro Rolle).
3. Reale Pfade aus Gate-1-Deltas:
   - `El Servador/god_kaiser_server/src/mqtt/topics.py`
   - `El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py`
   - `El Servador/god_kaiser_server/src/websocket/manager.py`
   - `El Frontend/src/types/websocket-events.ts`
   - `docker/mosquitto/mosquitto.conf`
   - `.github/mosquitto/mosquitto.conf`
4. Pre-Check-Facts:
   - `conflict_manager.py` nutzt `logging.getLogger(__name__)` (structured logging anschlussfaehig).
   - `config_handler.py` hat stale-guard logging auf INFO-Pfad.
   - `heartbeat_handler.py` konsumiert `publish_queue_*` aktuell nicht (bekannte Luecke fuer PKG-01b).

---

## B. Konvergenz-Check Plan -> Artefakte

| Pruefpunkt | Gate-1 Soll | Gate-2 Ist | Status |
|-----------|-------------|------------|--------|
| Paketschnitt | PKG-01 und PKG-04 splitten | `PKG-01a/01b`, `PKG-04a/04b` vorhanden | PASS |
| 8+ Pakete | Mindestens 8 nummerierte Pakete | 10 Pakete vorhanden | PASS |
| Rollenkonsolidierung | Ein Block pro Dev-Rolle | `server-dev`, `esp32-dev`, `frontend-dev`, `mqtt-dev` getrennt | PASS |
| Branch-Pflicht | `auto-debugger/work` in Artefakten verankert | In TASK und Prompts durchgaengig enthalten | PASS |
| Verify-Output nutzbar | Delta + BLOCKER maschinenlesbar | Deltas in TASK uebernommen, BLOCKER zentral gelistet | PASS |
| Gate-2-Datei | eigener Report erforderlich | Diese Datei erstellt | PASS |

---

## C. Verbleibende BLOCKER (kein Gate-Fail)

| Code | Kategorie | Wirkung |
|------|-----------|---------|
| `B-QP-PERSIST-01` | Entscheidungs-Blocker | Finale Persistenzstrategie in PKG-01b vor Umsetzung festlegen. |
| `B-MON-PATH-01` | Pfad-/Overlay-Blocker | Exakter Loki/Grafana Overlay-Pfad bei Implementierung pruefen. |
| `B-MQTT-VERSION-01` | Laufzeit-Blocker | Broker-Version fuer `max_packet_size` vor PKG-08 validieren. |
| `B-USER-DOCKER-01` | Sandbox-Blocker | Docker-Restart/Reload nur durch Robin. |

**Bewertung:** Das sind erwartete Ausfuehrungs-Blocker, keine Plan-Code-Inkonsistenzen. Gate 2 bleibt PASS.

---

## D. Breaking-Change-Guard (Round 2)

- Keine neue Migration eingeplant.
- Keine Aenderung bestehender MQTT-Topics, nur additive Topics/Felder.
- Keine REST-/WS-Breaks, nur additive Eventtypen/Felder.
- Frontend-Schutz gegen Mehrdeutigkeit (`pending_count > 1`) bleibt erhalten.

---

## E. OUTPUT FÜR ORCHESTRATOR (auto-debugger)

### PKG → Delta
| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-01a | Finale Firmware-Aufgabe bleibt unveraendert; Event-Hysterese + Payload additiv. Tests: `cd "El Trabajante" && pio run -e seeed`. |
| PKG-01b | TopicBuilder + Handler + Prometheus-Metrik; keine DB-Migration. Reihenfolge: nach PKG-01a-Konvention. |
| PKG-02 | Structured logging via `extra={}` bestaetigt; Logger-API vorhanden. |
| PKG-03 | Cross-Layer-Latenzmarker bleibt, Start nach PKG-01a-Konvention. |
| PKG-04a | WS-Event `config.terminal_guard` + `correlation_id_source` additiv. |
| PKG-04b | FE Soft-Match nur bei eindeutiger Zuordnung; TS-Event-Typ in `websocket-events.ts`. |
| PKG-05 | Monitoring-Filter nur als Repo-Config vorbereiten; Runtime-Reload bleibt User-Aktion. |
| PKG-06 | `CONFIG_GUARD ... status=expected` als Standardlogline. |
| PKG-07 | 4062 semantisch differenzieren, Consumer-kompatibel additiv. |
| PKG-08 | Migration in beiden Mosquitto-Configs; Version-Check zwingend vor Runtime-Test. |

### PKG → empfohlene Dev-Rolle
| PKG | Rolle (z. B. server-dev, frontend-dev, esp32-dev, mqtt-dev) |
|-----|---------------------------------------------------------------|
| PKG-01a | esp32-dev |
| PKG-01b | server-dev + mqtt-dev |
| PKG-02 | server-dev |
| PKG-03 | esp32-dev + server-dev + frontend-dev |
| PKG-04a | server-dev |
| PKG-04b | frontend-dev |
| PKG-05 | server-dev |
| PKG-06 | server-dev |
| PKG-07 | server-dev |
| PKG-08 | mqtt-dev |

### Cross-PKG-Abhängigkeiten
- PKG-01a -> PKG-01b: Server-Ingest benoetigt finalisierte Queue-Pressure-Payload.
- PKG-01a -> PKG-03: Latenzmarker nutzen gleiche Event-/Zeitfeld-Konvention.
- PKG-04a -> PKG-04b: FE-Soft-Match braucht neuen Server-WS-Event.
- PKG-05/PKG-08 -> User-Aktion: Runtime-Verifikation erst nach Docker-Reload/Restart.

### BLOCKER
- `B-QP-PERSIST-01`: Persistenzentscheidung fuer PKG-01b offen (Prometheus-only vs. Error-Pipeline-Zusatz).
- `B-MON-PATH-01`: Monitoring-Overlay-Pfade bei Umsetzung exakt verifizieren.
- `B-MQTT-VERSION-01`: `max_packet_size` nur bei passender Broker-Version aktivieren.
- `B-USER-DOCKER-01`: Externe Docker-Aktionen durch Robin erforderlich.

---

## F. Gate-2-Urteil

**Gate 2: PASS.**  
Die Artefakte sind konvergent, rollenklar und umsetzbar. Es bleiben nur externe bzw. bewusst als Ausfuehrungsgates markierte BLOCKER.
