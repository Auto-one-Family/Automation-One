# TM-AUT62 — B-TOKEN-GEN-01 Schluesselraum-Policy (Entscheidvorschlag)

> **Auftrag:** Entblockungs-Gate fuer AUT-62 (Emergency fail-closed, EA-09). Offene TM-Schaerfung vom 17.04.: verbindliche Semantik fuer `correlation_id` × `generation` × `epoch` im Terminal-Authority-Key.
> **Ausfuehrer:** Technical Manager (Claude, Desktop-Session Dresden)
> **Branch-Basis:** `auto-debugger/work` @ `33ee862c` (refactor(esp32): remove unused seq field from heartbeat payload — AUT-68 Phase 1 Iter1)
> **Linear:** [AUT-62](https://linear.app/...) (Project e16d523e-1891-48b6-98fc-f7173a505de4)
> **Scope:** Nur MQTT-Transport Terminal-Authority-Key. **Out-of-Scope:** MQTT-Auth-Token-Rotation (separat in `PRODUCTION_CHECKLIST.md`), ESP32 EMERGENCY_TOKEN_REQUIRED-Flag (Umsetzung Firmware-Seite bereits committed in `main.cpp` L76-78/L952-967 — wartet auf diese Policy).

---

## 1. Warum dieses Gate

AUT-62 war im TM-Lagebild 2026-04-22 (Abschnitt 2, Kandidat 3) explizit als **nicht-geeignet fuer kontrollierten Durchlauf** markiert wegen "TM-Schaerfung vom 17.04. verlangt zusaetzliche AC (correlation_id/generation/epoch-Konsistenz-Schluesselraum), Code lokal auf master nicht-committed — zu komplexe Gemengelage". Solange `B-TOKEN-GEN-01` nicht entschieden ist, fehlen die harten ACs, und jede Server-Implementierung riskiert Kollisionen generationsuebergreifend.

Dieses Dokument liefert:

1. Evidenz-basierte IST-Aufnahme des Schluesselraums (`_build_terminal_authority_key` × 3 + `command_contract_repo`).
2. Policy-Entscheidvorschlag nach Robins Schema-Entwurf vom 22.04.
3. Migrationspfad mit konkreten Datei/Zeilen-Anpassungen.
4. Testmatrix und DoD fuer Gate-Abnahme.

---

## 2. IST-Zustand (evidenzbasiert)

### 2.1 Drei duplizierte Terminal-Authority-Key-Builder

Alle drei Handler haben eine eigene, fast identische Methode mit demselben Defekt — `generation` und `epoch` werden **nicht in den Key aufgenommen**, sondern nur fuer Out-of-Order-Filter und Audit-Logging verwendet.

| Datei | Methoden-Zeile | Key-Body-Zeilen | Key-Schema | Param `generation`? | Param `epoch`? |
|---|---|---|---|---|---|
| `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py` | L413 | L427-433 | `corr:{correlation_id}` oder Fallback `esp:{id}:cfg:{type}:status:{status}:ts:{ts}` | nur als aufrufseitiger Parameter (L157), nicht im Key | nicht vorhanden |
| `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py` | L358 | L366-369 | `corr:{correlation_id}` oder Fallback `esp:{id}:reason:{reason}:ts:{ts}` | nur als aufrufseitiger Parameter (L181), nicht im Key | nicht vorhanden |
| `El Servador/god_kaiser_server/src/mqtt/handlers/actuator_response_handler.py` | L340 | L349-355 | `corr:{correlation_id}` oder Fallback `esp:{id}:gpio:{gpio}:cmd:{cmd}:ts:{ts}` | nur als aufrufseitiger Parameter (L140), nicht im Key | nicht vorhanden |

**Befund:** Der Schluesselraum ist heute effektiv nur `(correlation_id)` fuer jeden Handler isoliert. Zwei Generationen desselben Intents mit gleichem `correlation_id` kollidieren auf denselben Terminal-Key → der erste Abschluss terminiert die zweite Generation falsch.

### 2.2 `command_contract_repo.py` — Out-of-Order-Filter funktioniert, Dedup-Key nicht

In `El Servador/god_kaiser_server/src/db/repositories/command_contract_repo.py` wird `generation` aktiv verwendet:

- L160, L201-206, L274, L325-328: Out-of-Order-Schutz `(incoming_generation, incoming_seq) < (existing_generation, existing_seq)` → stale reject.
- L182, L234, L297: `epoch` wird persistiert, aber nicht fuer Dedup benutzt.
- L267: `corr = str(correlation_id or dedup_norm or intent_id)[:128]` — Dedup-Key-Material basiert auf `correlation_id` mit Fallback-Kette, **ohne generation/epoch**.

**Befund:** `command_contract_repo` hat die Daten, nutzt sie aber nicht als Dedup-Key-Bestandteil — konsistent mit der Handler-Drift.

### 2.3 Firmware-Seite (ESP32)

`El Trabajante/src/services/communication/mqtt_client.cpp`:

- L79: `correlation_id` wird in Payload-Metadata serialisiert.
- L1241: `session/announce` Payload enthaelt `handover_epoch` + `session_epoch`.
- L1401: `active_handover_epoch` in Ziel-Payloads.

`generation` wurde **nicht direkt in `mqtt_client.cpp` gefunden** — die Generationen werden aus dem Contract/Intent-Kontext uebergeben (Caller-Seite, wahrscheinlich `offline_mode_manager` oder Publisher-Chain). Fuer den Scope dieses Gates genuegt die Feststellung: Der Terminalevent-Pfad auf Server-Seite erhaelt `generation` aus der Payload, aber die Firmware muss bei Emergency-kritischen Events `generation` **und** `epoch` verpflichtend mitsenden.

### 2.4 Zusammenfassung der IST-Druckpunkte

- **Drift:** 3 duplizierte Builder mit identischem Defekt (keine Zentralisierung).
- **Kollisionsrisiko:** generationsuebergreifend bei gleichem `correlation_id`.
- **Fail-closed fehlt:** Handler akzeptieren Fallback-Keys ohne Audit + harten Reject bei sicherheitskritischen Events.
- **Datenbasis OK:** `command_contract_repo` liefert Out-of-Order-Schutz, `epoch`-Persistenz existiert — muss nur im Key-Schema genutzt werden.

---

## 3. SOLL-Policy (Entscheidvorschlag)

### 3.1 Schluesselraum-Contract

**Primaerschluessel (Terminal-Authority-Key):**

```
terminal_key = <event_class>:<esp_id>:<correlation_id_or_fallback>:g<generation>:e<epoch>
```

mit:

- `<event_class>`: stabile Klasse des Terminalevents, z. B. `cfg`, `lwt`, `act`, `emg`.
- `<esp_id>`: normalisiert (lowercase, stripped).
- `<correlation_id_or_fallback>`: `correlation_id` wenn vorhanden; sonst shape-spezifischer Fallback wie bisher (Config: `cfg:{type}:status:{status}:ts:{ts}`, LWT: `reason:{reason}:ts:{ts}`, Actuator: `gpio:{gpio}:cmd:{cmd}:ts:{ts}`).
- `g<generation>`: ganzzahlig, aus Payload. Default `g-1` nur erlaubt fuer **nicht-sicherheitskritische** Events; bei sicherheitskritischen Events (Emergency, Actuator-Set) verpflichtend.
- `e<epoch>`: `session_epoch` (laufende MQTT-Sitzung seit Boot) oder `handover_epoch` (Aera-Wechsel durch Offline-/Online-Uebergang). Default `e0` nur fuer nicht-sicherheitskritische Events.

### 3.2 Semantik der drei Achsen

- **`correlation_id`** = Request-/Intent-Kette. Stabil ueber Retransmits innerhalb derselben Generation. Darf ueber Generationen hinweg wieder auftauchen (Replay-Intent nach Handover).
- **`generation`** = Neuauflage derselben Intent-Kette. Monoton steigend pro `correlation_id`. Dient sowohl Out-of-Order-Schutz (existierende Semantik in `command_contract_repo`) als auch Dedup-Key-Differenzierung (neu).
- **`epoch`** = Session-/Handover-Aera. Serverseitig abgebildet aus dem groesseren von `session_epoch` und `handover_epoch`, zur Klarheit: Wert = `max(session_epoch, handover_epoch)` wenn beide vorhanden.

### 3.3 Fail-closed-Regel (AUT-62 Kernsatz)

- **Sicherheitskritische Events** (`emergency_stop`, `actuator_set` mit nicht-OFF-Transition, `config_apply` fuer Safety-relevante Felder):

  > Fehlt bei einem eingehenden Terminal-Event `generation` oder `epoch`, wird der Event **rejectet** und in `audit_log` als `terminal_authority_guard:missing_keyspace` vermerkt. Kein stilles Fallback.

- **Nicht-sicherheitskritische Events** (`heartbeat`, `sensor/data`, generische Konfigs):

  > Fehlende Werte erhalten Fallback (`g-1`/`e0`). Der Event wird verarbeitet. Audit-Log weniger streng (WARN statt REJECT).

### 3.4 Event-Klassen-Mapping (initial)

| Event-Klasse | Topic-Family | Sicherheitskritisch? | Fail-closed? |
|---|---|---|---|
| `cfg` | `config/response/*` fuer Safety-Configs | teilweise | ja fuer Safety-Configs (GPIO-Reassign, Actuator-Topo-Change) |
| `lwt` | `$SYS/lwt`, `will/*` | ja (fail-closed Semantik) | ja |
| `act` | `actuator/response` | ja bei nicht-OFF | ja bei nicht-OFF |
| `emg` | `actuator/emergency`, `broadcast/emergency` | ja (immer) | ja |

---

## 4. Migrationspfad (konkrete Datei/Zeilen)

### 4.1 Zentralisierter Key-Builder

Neu anlegen: `El Servador/god_kaiser_server/src/mqtt/handlers/terminal_authority.py`

```python
from typing import Optional

SECURITY_CRITICAL_CLASSES = {"emg", "lwt"}  # plus "act" und "cfg" nach Payload-Detail

def build_terminal_authority_key(
    *,
    event_class: str,
    esp_id: str,
    correlation_id: Optional[str],
    generation: Optional[int],
    epoch: Optional[int],
    shape_fallback: str,
    security_critical: bool,
) -> tuple[str, Optional[str]]:
    """Build standardized terminal-authority key.

    Returns:
        (key, reject_reason_or_none). If security_critical and generation/epoch
        missing, reject_reason is 'missing_keyspace'.
    """
    if security_critical and (generation is None or epoch is None):
        return ("", "missing_keyspace")

    corr_part = (
        f"corr:{str(correlation_id).strip().lower()}"
        if correlation_id else shape_fallback
    )
    g = int(generation) if generation is not None else -1
    e = int(epoch) if epoch is not None else 0
    return (
        f"{event_class}:{esp_id.strip().lower()}:{corr_part}:g{g}:e{e}",
        None,
    )
```

### 4.2 Umstellungen (3 Handler + Repo)

- `config_handler.py` L413-433 → ersetzen durch Aufruf von `build_terminal_authority_key(event_class="cfg", ...)`. Payload-Felder `generation`, `epoch` hineinreichen (bereits auf L157 vorhanden).
- `lwt_handler.py` L358-369 → `event_class="lwt"`, `security_critical=True`. Payload-`generation`/`epoch` durchreichen.
- `actuator_response_handler.py` L340-355 → `event_class="act"`, `security_critical` abhaengig von `command` (OFF = False, sonst True).
- `command_contract_repo.py` L267 (Dedup-Key `corr`) → optional spaeter um `:g{generation}:e{epoch}` erweitern, nicht zwingend fuer dieses Gate (Out-of-Order-Filter bleibt vorlagend).

### 4.3 Firmware-Contract

`El Trabajante/src/services/communication/mqtt_client.cpp`:

- Emergency-Publisher (z. B. beim Initiieren einer Emergency-Response): Payload muss `correlation_id`, `generation`, `session_epoch` oder `handover_epoch` (mind. eines, bevorzugt `handover_epoch`) setzen.
- Bei EMERGENCY_TOKEN_REQUIRED=1 (main.cpp L76-78 bereits committed): Fehlt eines der Felder beim Senden eines Emergency-Events → lokaler Self-Reject mit `ERROR_EMERGENCY_REJECTED_NO_TOKEN` (3501, bereits definiert in `error_codes.h` L137).

### 4.4 Dokumentations-Updates (Folge-Arbeit, nicht Teil dieses Gates)

- `reference/security/PRODUCTION_CHECKLIST.md` — Verweis auf diesen Schluesselraum-Contract.
- `reference/errors/ERROR_CODES.md` L247-252 — 3501-Zeile von `SECURITY_TOKEN_MISMATCH` auf `EMERGENCY_REJECTED_NO_TOKEN` umstellen (nach AUT-62-Merge).
- `reference/api/WEBSOCKET_EVENTS.md` — AUT-71-Felder dokumentieren (offen, separates Folge-Ticket).

---

## 5. Regressions-Testmatrix

Drei Tests in `El Servador/god_kaiser_server/tests/mqtt/test_terminal_authority.py` (neu). Alle MUESSEN gruen sein fuer DoD-Abnahme.

| # | Szenario | Input | Erwartung |
|---|---|---|---|
| T1 | **gen+** | 2× actuator_response mit gleichem `correlation_id` und `gpio`, aber `generation=1` vs. `generation=2` | Beide erzeugen distinkte Keys (unterschiedliches `g`-Segment), beide durchlaufen Terminal-Processing. |
| T2 | **seq-** | Gleiche `generation`, aelterer `seq` nach neuerem | Stale reject, audit_log entry `stale_seq`. Kein neuer Terminal-Key (Out-of-Order-Schutz in `command_contract_repo`). |
| T3 | **missing keyspace** | Emergency-Event ohne `generation` oder ohne `epoch` | Reject mit `terminal_authority_guard:missing_keyspace` Audit-Entry, kein Publish/State-Change. |

---

## 6. Definition of Done fuer B-TOKEN-GEN-01

Gate `B-TOKEN-GEN-01` ist **abgenommen**, wenn alle vier Punkte erfuellt sind:

- [ ] **Entscheid-Kommentar** auf Linear AUT-62 mit finaler Policy-Tabelle (Abschnitt 3.1-3.3 aus diesem Dokument als TM-Entscheid uebernommen oder modifiziert).
- [ ] **Einheitlicher Key-Builder** `terminal_authority.py` aktiv; `config_handler.py`, `lwt_handler.py`, `actuator_response_handler.py` rufen ihn auf; die drei lokalen `_build_terminal_authority_key`-Methoden sind entfernt.
- [ ] **Drei Regressions-Tests** (T1, T2, T3 aus Abschnitt 5) implementiert und gruen: `poetry run pytest god_kaiser_server/tests/mqtt/test_terminal_authority.py -v`.
- [ ] **Doku-Verweis** in `reference/security/PRODUCTION_CHECKLIST.md` auf diesen Schluesselraum-Contract + `reference/errors/ERROR_CODES.md` 3501-Korrektur.

Nach DoD-Abnahme kann AUT-62 von "Backlog" auf "In Progress" gezogen werden und die Umsetzung als eigener Durchlauf gemaess §3 TM-Workflow gestartet werden.

---

## 7. Rollback & Risiko

- **Rollback:** Jede der drei Handler-Anpassungen ist isoliert rueckbaubar (je ein git-Revert). Der neue `terminal_authority.py` ist additiv — bleibt bei Rollback als unbenutzter Code liegen, kein Breaking-Change.
- **Risiko bei aktiver Nutzung:** Bestehende `corr:{correlation_id}`-Keys in DB/Cache werden durch neue `cfg:{esp}:corr:{...}:g{gen}:e{epoch}`-Keys ersetzt. Kurze Dedup-Luecke beim Rollout (einzelner Heartbeat kann doppelt verarbeitet werden). Mitigation: Dual-Key-Lookup fuer eine Release-Zyklus (optional, fuer Produktiv-Cutover).

---

## 8. Uebergang

Nach Akzeptanz dieses Dokuments:

1. Linear AUT-62 erhaelt Kommentar mit Link auf diese Datei + DoD-Checkliste.
2. Implementierungs-Durchlauf wird als eigener TM-Durchlauf gemaess §3 Auftragsablauf gestartet.
3. Dieses Dokument bleibt als ADR-Quelle in `docs/analysen/` stehen.

---

*Erstellt: 2026-04-22 Nachmittag. Basis: Evidenz-Scan `auto-debugger/work` @ 33ee862c + TM-Lagebild 2026-04-22 + Robins Schema-Entwurf 22.04.*
