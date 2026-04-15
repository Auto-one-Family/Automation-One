# VERIFY-PLAN-REPORT — INC-2026-04-10-esp32-mqtt-tls-errtrak-6014

**Gebundener Ordner:** `.claude/reports/current/incidents/INC-2026-04-10-esp32-mqtt-tls-errtrak-6014/`  
**Datum:** 2026-04-11  
**Geprüft gegen:** `TASK-PACKAGES.md` (Vorentwurf) + Steuerdatei-Pfade + Repo-IST

---

## /verify-plan Ergebnis (kurz)

**Plan:** Firmware-Fix PKG-01 + Infra-Check PKG-02 + optional Heap PKG-03  
**Geprüft:** 3 Kern-Pfade, 2 Agent-Referenzen, 1 Build-Umgebung (`platformio.ini`)

### Bestätigt

- `El Trabajante/src/services/communication/mqtt_client.cpp` existiert; `MQTT_EVENT_DISCONNECTED` / `logCommunicationError(ERROR_MQTT_DISCONNECT, …)` Zeile **1179**.
- `El Trabajante/src/error_handling/error_tracker.cpp` — `logCommunicationError` **114–116**; `getCategoryString` **275–286**.
- `El Trabajante/src/models/error_codes.h` — `ERROR_MQTT_DISCONNECT` **3014**; Kommunikations-Range dokumentiert **3000–3999**.
- `El Trabajante/src/services/sensor/sensor_manager.cpp` — „MQTT not connected, skipping publish“ **1682** (Folgesymptom).

### Korrekturen (in TASK-PACKAGES eingearbeitet)

| Kategorie | Plan sagte / Risiko | System sagt | Empfehlung |
|-----------|---------------------|-------------|------------|
| Build-ENV | `pio run -e seeed` (AGENTS.md-Beispiel) | `platformio.ini` definiert `[env:seeed_xiao_esp32c3]` | **`pio run -e seeed_xiao_esp32c3`** verwenden. |
| Agent-Pfade | Verify-Anhang: `mqtt/mqtt-debug-agent.md` | IST: `.claude/agents/mqtt-debug.md` | Prompts auf **IST-Pfad** stellen. |

### Fehlende Vorbedingungen

- [ ] Broker-Log oder TLS-Gegenprobe für PKG-02 (Robin/Infra).
- [ ] Optional: Heap-Snapshot für PKG-03.

### Ergänzungen

- Gleiches Baseline-Muster betrifft potenziell **`logApplicationError`** (`ERROR_APPLICATION` + voller Code) — im PKG-01-Audit erwähnt.

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger) — Archivkopie

Dieser Block entspricht der verbindlichen Chat-Struktur für Post-Verify-Patches.

### PKG → Delta

| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-01 | Testbefehl `pio run -e seeed` → **`pio run -e seeed_xiao_esp32c3`**; Scope um Audit **`logApplicationError`/`logServiceError`** erweitert; kein verworfener Fix. |
| PKG-02 | Keine Pfadänderung; BLOCKER `B-NET-01` bleibt bis Broker-Evidence. |
| PKG-03 | Unverändert; BLOCKER `B-HEAP-01` bleibt. |

### PKG → empfohlene Dev-Rolle

| PKG | Rolle |
|-----|--------|
| PKG-01 | `esp32-dev` |
| PKG-02 | `mqtt-debug` (+ Robin Ops) |
| PKG-03 | `esp32-dev` / `esp32-debug` |

### Cross-PKG-Abhängigkeiten

- PKG-03 → PKG-02: keine harte Kante; PKG-03 blockiert nur auf Messdaten.
- PKG-01 unabhängig von PKG-02 (Software-Bug ist auch bei erreichbarem Broker falsch).

### BLOCKER

- `B-NET-01`: Keine Broker-/Netz-Evidence im Repo für TLS-Timeout-Root-Cause.
- `B-HEAP-01`: Keine Heap-Messwerte zum optionalen PKG-03.

---

## Zusammenfassung für TM

Der Plan ist **ausführbar**: Pfade und Codebelege für 6014/UNKNOWN stimmen. Vor Implementierung: Branch **`auto-debugger/work`**. Build-Verify muss **`seeed_xiao_esp32c3`** nutzen, nicht `seeed`. Kein widersprüchlicher RC: TLS-Timeout bleibt **infra-verdächtig**; 6014/UNKNOWN ist **Software-bewiesen**.
