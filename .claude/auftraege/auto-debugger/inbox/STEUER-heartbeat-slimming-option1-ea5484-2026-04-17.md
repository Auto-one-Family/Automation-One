---
run_mode: incident
incident_id: INC-2026-04-11-ea5484-mqtt-transport-keepalive
run_id: ""
order: incident_first
target_docs: []
scope: |
  **Problemcluster (Folgeausprägung zu H6/H7 im Lagebild):**
  ESP_EA5484 disconnectet nach erfolgreicher Registrierung reproduzierbar mit
  `errno=11 EAGAIN` (LWIP `tcp_write`) in der ersten Minute nach Boot (aktueller
  Log-Ausschnitt, neuer Post-Fix-Run 2026-04-17). Der AUT-67 Silent-Write-
  Timeout-Fix ist verifiziert (`classified=write_timeout`, `write_timeouts=1,
  last_errno=11`), aber die darunterliegende Ursache ist **Heap-Fragmentierung**:
  `max_alloc` bleibt über den gesamten Run bei ca. **38 900 B** obwohl
  `free_heap=42-49 kB`. IDF-MQTT kann keine zusammenhängenden TCP-Segment-Pbufs
  mehr allozieren → EAGAIN → Disconnect → Reconnect-Loop mit TLS-Connect-Timeouts.

  **Ursache (durch Code-Review belegt, nicht hypothetisch):**
  Der Heartbeat-Payload in `El Trabajante/src/services/communication/mqtt_client.cpp`
  Funktion `sendHeartbeat()` (Zeilen **1299–1449**) enthält ~60 Felder und
  reserviert `payload.reserve(1900)` pro Ausführung. Er enthält u. a.:
  - Komplettes `gpio_status[]`-Array mit Per-Pin-Metadaten (owner, component,
    mode, safe) — Zeilen 1321–1350, ca. 500–800 B.
  - 17 Forensik-Counter (`offline_enter_count`, `adoption_*`, `handover_*`,
    `persistence_drift_*`, `publish_queue_*`, `safe_publish_retry_count`, …)
    — Zeilen 1384–1444, ca. 400 B.
  - `configManager.getDiagnosticsJSON()` (Zeile 1444).
  Diese Größe zwingt `PUBLISH_PAYLOAD_MAX_LEN = 2048` in
  `El Trabajante/src/tasks/publish_queue.h:21` (Kommentar: „Heartbeat with 10+
  GPIO entries exceeds 1024 B"). Publish-Queue mit `PUBLISH_QUEUE_SIZE = 8`
  belegt damit ca. **17,4 kB** permanent (8 × 2180 B pro `PublishRequest`-Slot)
  — verstärkender Hauptbeitrag zur Heap-Fragmentierung.

  **Ziel dieses Laufs (Option 1 — minimal invasiv, Runtime-messbar):**
  1) Das `gpio_status[]`-Array + abhängige Felder (`gpio_status_cached`,
     `gpio_status_cache_age_ms`, `gpio_reserved_count`, Cache-Globals
     `g_last_gpio_status_json` / `g_last_gpio_reserved_count` /
     `g_last_gpio_status_cache_ms`) **ersatzlos** aus dem Heartbeat entfernen
     — der Server hat die Daten bereits aus Config-APIs und
     `actuator/+/status`; im Normalbetrieb reine Redundanz.
  2) `PUBLISH_PAYLOAD_MAX_LEN` von **2048** auf **1024** reduzieren
     (nur sinnvoll NACHDEM `gpio_status` raus ist; sonst werden Heartbeats
     truncated).
  3) `payload.reserve(1900)` → `payload.reserve(640)` in `sendHeartbeat()`
     (Peak-Alloc-Senkung; passt zum schlankeren Payload).
  4) Linear-Issue **`AUT-68 [EA-15] Heartbeat-Slimming Option 1`** unter
     Projekt „MQTT-Transport & Recovery Hardening (INC EA5484)" erstellen
     mit Priority High, Labels `ESP32,Improvement,Heap-Budget`, Referenz auf
     diesen Incident und den Post-Verify-Report dieses Laufs.

  **Scope (nur diese Dateien):**
  - `El Trabajante/src/services/communication/mqtt_client.cpp`
    (Zeilen 45–51: cache globals; 1299–1449: `sendHeartbeat()`)
  - `El Trabajante/src/tasks/publish_queue.h`
    (Zeile 21: `PUBLISH_PAYLOAD_MAX_LEN`)
  - `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
    **nur Verify**: tolerant gegenüber fehlenden Feldern `gpio_status`,
    `gpio_status_cached`, `gpio_status_cache_age_ms`, `gpio_reserved_count`.
    Falls Handler aktuell strikt parsed → Zusatz-PKG für `server-dev`,
    sonst rein dokumentarisch.
  - `El Frontend/src/**` **nur Verify**: ob irgend eine Komponente
    `gpio_status` aus Heartbeat-Payload konsumiert (Grep auf WS-Events
    `esp_heartbeat`/`heartbeat_updated`).

  **Evidence (aus aktuellem Post-Fix-Run, Cursor-Chat 2026-04-17):**
  - Boot + Registration-Konfirmation → `free_heap` schrumpft von 110 kB
    (Phase 2) auf **49 496 B** nach Task-/Queue-Init (t≈21 999).
  - `[MEM] Free heap: 45 072 B, min free: 41 800 B, max alloc: 38 900 B`
    (t=22 143) nach `/config`-Subscribe.
  - `Heartbeat: skipping gpio_status due to low memory headroom
    (free_heap=42 584 B, max_alloc=38 900 B, heap_threshold=46 000 B,
    alloc_threshold=16 384 B)` (t=22 157) — Degradation-Fallback greift,
    aber das Gesamtbudget bleibt kritisch.
  - `E (47813) TRANSPORT_BASE: tcp_write error, errno=No more processes`
    + `MQTT_CLIENT: Writing failed: errno=11`
    + `TCP transport error sock_errno=11 … classified=write_timeout`
    (t=32 674) → Disconnect mit `write_timeouts=1, last_errno=11`.

  **Akzeptanz-Messwert (messbar am Runtime-Log nach Reflash):**
  - `max alloc` in `[MEM]`-Logzeilen steigt von ~38 900 B auf **≥ 46 000 B**
    (damit `Heartbeat: skipping gpio_status` nicht mehr triggert und LWIP
    Pbuf-Segmente zuverlässig alloziert werden).
  - Kein `errno=11 (EAGAIN)` Disconnect im ersten 5-Min-Fenster nach Boot
    unter Normallast (WLAN verbunden, RSSI ≥ -60 dBm, keine Aktor-Bursts).

  **Post-Verify-Übergabe:** TASK-PACKAGES.md erhält ein neues **PKG-17
  [Heartbeat-Slimming Option 1]**; SPECIALIST-PROMPTS.md ergänzt um einen
  `esp32-dev`-Block (Pflicht) und einen `server-dev`-Verify-Block
  (Reihenfolge: Firmware zuerst, Server tolerant). Linear-Issue AUT-68
  wird mit der Mutations-Delta (nach Verify) verlinkt.

forbidden: |
  Keine Breaking-Changes an:
  - MQTT-Topic-Struktur (`kaiser/god/esp/{id}/system/heartbeat`).
  - LWT-Payload-Contract (`system/will`, Reason-Codes).
  - `intent_outcome`-Schema oder Topic.
  - Heartbeat-Feld-Semantik von `esp_id, seq, zone_id, master_zone_id,
    zone_assigned, ts, time_valid, uptime, heap_free, wifi_rssi,
    sensor_count, actuator_count, wifi_ip, reset_reason, boot_sequence_id`.
    Diese Felder bleiben im Heartbeat-Payload unverändert.
  Keine Änderung an:
  - Error-Code-Semantik (3xxx-Band), 60 s Rate-Limit im ErrorTracker.
  - `mqtt_cfg.out_buffer_size` / `mqtt_cfg.buffer_size` / Task-Stacks.
  - NVS-Partition-Layout, `offline_rules`-Schema, Intent-NVS-Replay.
  - Safety-Task / Comm-Task Scheduling und Core-Pinning.
  - `PUBLISH_QUEUE_SIZE` (bleibt 8; Ersparnis kommt aus PAYLOAD-Größe, nicht
    aus Queue-Tiefe — Reduktion wäre separates PKG).
  Keine Produkt-Implementierung durch auto-debugger vor
  abgeschlossenem /verify-plan-Gate. Keine Commits auf `master`; nur
  Branch `auto-debugger/work`. Kein `git push --force`.
  Keine Secrets (MQTT-URI mit Credentials, JWT, .env) in Artefakten oder
  im Linear-Issue-Body.

done_criteria: |
  **Artefakte (Soll-Stand nach diesem Lauf):**
  - `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/INCIDENT-LAGEBILD.md`
    zusätzlicher Abschnitt „Eingebrachte Erkenntnisse" mit Zeitstempel
    2026-04-17 und neuer Hypothese **H8** („Heartbeat-Payload als
    Hauptfragmentierer") inkl. Evidence-Tabelle Heap-Verlauf.
  - `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/TASK-PACKAGES.md`
    neues **PKG-17 Heartbeat-Slimming Option 1** mit Owner `esp32-dev`,
    exakten Zeilenbereichen, Build-/Runtime-Tests und messbarer Akzeptanz
    (`max alloc ≥ 46 000 B`, kein EAGAIN-Disconnect im 5-Min-Fenster).
  - `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/SPECIALIST-PROMPTS.md`
    Nachtrag 2026-04-17 mit `esp32-dev`-Block (Pflicht) und
    `server-dev`-Verify-Block (Kompatibilitäts-Check
    `heartbeat_handler.py`).
  - `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/VERIFY-PLAN-REPORT.md`
    Abschnitt „OUTPUT FÜR ORCHESTRATOR — Delta 2026-04-17 (PKG-17)"
    mit Mutations-Tabelle und geprüften Pfaden.

  **Linear:**
  - Issue `AUT-68 [EA-15] Heartbeat-Slimming Option 1` erzeugt unter
    Projekt „MQTT-Transport & Recovery Hardening (INC EA5484)"
    (projectId `e16d523e-1891-48b6-98fc-f7173a505de4`), Priority `High`,
    Labels `ESP32,Improvement,Bug`, Body enthält:
    (1) Kontext mit Verweis auf Incident-Ordner,
    (2) Evidence-Zitate aus dem Serial-Log,
    (3) konkrete Code-Referenzen mit Zeilenbereichen (nach Verify),
    (4) Akzeptanzkriterien wortgleich zu PKG-17,
    (5) Verweis auf `auto-debugger/work` als Arbeitsbranch.
  - Issue-URL im VERIFY-PLAN-REPORT und in der Chat-Übergabe verlinkt.

  **Gate / Übergabe:**
  - `/verify-plan`-Gate durchlaufen: Scope der Steuerdatei, Zeilenbereiche
    in `mqtt_client.cpp` und `publish_queue.h`, Test-Befehle, Linear-
    Projekt-ID und Handler-Pfade **gegen Repo-IST** bestätigt.
  - Chat-Antwort enthält den normativen Block
    **„OUTPUT FÜR ORCHESTRATOR (auto-debugger)"** mit
    PKG-17 → Delta, Rolle, Abhängigkeiten, BLOCKER.
  - Kurze Handover-Zusammenfassung im Chat: esp32-dev startet mit
    PKG-17, server-dev übernimmt nur Verify-Block (parallel oder nach
    Firmware-Flash); verbleibende BLOCKER benannt.

  **Nicht-Ziel (bewusst):**
  - Keine Entfernung der Forensik-Counter aus dem Heartbeat in diesem Lauf
    (das wäre Option 2 — separates Linear-Issue `AUT-69 [EA-16]`, hier
    nur als **Follow-Up-Hinweis** in PKG-17 dokumentieren).
  - Keine Implementierung von `.../system/telemetry` oder
    `.../system/gpio_status` on-demand Topics in diesem Lauf.
---

# STEUER — Heartbeat-Slimming Option 1 (Heap-Budget-Reclaim, Incident EA5484)

> **Chat-Start:** `@.claude/auftraege/auto-debugger/inbox/STEUER-heartbeat-slimming-option1-ea5484-2026-04-17.md`  
> **Bezug-Incident:** `INC-2026-04-11-ea5484-mqtt-transport-keepalive` (bestehende Artefakte additiv erweitern)  
> **Bezug-Fix:** AUT-67 Silent-Write-Timeout-Heuristik ist **verifiziert** (Log-Evidence vom 2026-04-17, `classified=write_timeout` + `write_timeouts=1, last_errno=11`) — dieser Lauf adressiert die **darunterliegende Heap-Ursache**.  
> **Git:** `git checkout auto-debugger/work` vor jeder delegierten Code-Arbeit (Pflicht). Linear-Issue und alle Commits ausschließlich auf `auto-debugger/work`.

---

## Warum dieser Lauf jetzt?

Das AUT-67-Fix hat die **Telemetrie korrigiert**, nicht die Ursache. Die neuen, jetzt sauber klassifizierten Counter liefern uns die **entscheidende Messung**:

| Zeitpunkt | Symptom | Mess-Hinweis |
|---|---|---|
| t=22 143 ms | `[MEM] free=45 072, min=41 800, max_alloc=38 900` | `max_alloc` ist der **limitierende Parameter**, nicht `free_heap` |
| t=22 157 ms | `Heartbeat: skipping gpio_status …` | Degradation-Fallback deckelt Symptom, behebt Ursache nicht |
| t=32 674 ms | `tcp_write errno=11 (EAGAIN)` → Disconnect | LWIP kann keine zusammenhängenden TCP-Pbuf-Segmente allozieren |
| t=32 789 ms | `managed reconnect scheduled … write_timeouts=1, last_errno=11` | AUT-67-Counter beweist Write-Pfad-Ursache |

**Die 38 900 B `max_alloc` sind konstant über den gesamten Run** — also kein dynamischer Effekt, sondern **fest installierter Heap-Block-Dominator**. Die Rechnung aus dem Code-Review identifiziert die `PUBLISH_PAYLOAD_MAX_LEN=2048` in Kombination mit `PUBLISH_QUEUE_SIZE=8` (= 17,4 kB) als Hauptverursacher, gefolgt von `sendHeartbeat()` Peak-Alloc (1,9 kB String-Reserve) und `g_last_gpio_status_json` Cache (bis 512 B).

Der **kleinste Schritt mit messbarem Effekt** ist: Heartbeat-Payload verschlanken so weit, dass `PUBLISH_PAYLOAD_MAX_LEN` halbiert werden kann — das spart **8,2 kB permanent** in der Publish-Queue und senkt den Peak-Alloc des Heartbeat-Builders.

---

## Erste Analyse (Vorarbeit für auto-debugger)

1. **Heartbeat-Felder-Kategorisierung** (siehe Scope oben): A Liveness / B Boot-Once / C Forensik / D Redundanz / E State-Flags / F DiagnosticsJSON. Nur **Kategorie D (`gpio_status` + Helpers)** wird in diesem Lauf entfernt — sie ist **redundant** mit Config-APIs und `actuator/+/status`, und sie trägt die **größte** Per-Payload-Last.

2. **Server-Kompatibilität prüfen** (Pflicht, *nicht* optional): `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` darf die fehlenden Felder nicht als Schema-Fehler ablehnen. Erwartet: `dict.get("gpio_status", [])`-Muster oder Pydantic-Optional-Feld. Falls strikt, **Mini-Zusatz-PKG für `server-dev`** (tolerant parsen, `gpio_reserved_count` optional).

3. **Frontend-Konsumenten prüfen**: Grep auf `gpio_status` in `El Frontend/src/`. Falls irgend ein Store/View das Feld aus dem `esp_heartbeat`-Event rendert, eigenes Follow-Up-Issue — *kein* Blocker für PKG-17 (Feld fehlt einfach ab Reflash; UI zeigt nichts).

4. **Messprotokoll definieren**: Vor Flash ein `[MEM]`-Snapshot im aktuellen Run dokumentieren; nach Flash über 5 Min die `max_alloc`-Werte sammeln. Ziel: `max_alloc ≥ 46 000 B` konstant.

---

## Pflicht-Checks für SPECIALIST-PROMPTS (übernehmen)

1. **`esp32-dev` (primär):**
   - Entferne `gpio_status`-Block aus `sendHeartbeat()` (Zeilen 1321–1367 in `mqtt_client.cpp`, inkl. `payload_degraded`/`gpio_status_cached`/`gpio_status_cache_age_ms`/`gpio_reserved_count` und Cache-Globals 45–51).
   - Entferne die daraus resultierenden Payload-Zeilen 1370–1381 (`"gpio_status":...`, `"gpio_reserved_count":...`, `"gpio_status_cached":...`, `"gpio_status_cache_age_ms":...`, `"payload_degraded":...`, `"degraded_fields":[...]`, `"heartbeat_degraded_count":...`). **Behalte** `metrics_schema_version` und die Forensik-Counter **in diesem Lauf** — die sind Kategorie C, Option 2.
   - Reduziere `payload.reserve(1900)` auf `payload.reserve(640)` (Zeile 1302).
   - `PUBLISH_PAYLOAD_MAX_LEN`: `2048 → 1024` in `publish_queue.h:21` und Kommentar aktualisieren.
   - Build: `cd "El Trabajante" && pio run -e esp32_dev` (Exit 0).
   - Runtime-Verifikation: `[MEM]`-Werte sammeln und mit Baseline vergleichen.

2. **`server-dev` (Verify, parallel zu esp32-dev flash-bar):**
   - `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` lesen und prüfen, wie `gpio_status`, `gpio_reserved_count`, `gpio_status_cached`, `gpio_status_cache_age_ms`, `payload_degraded`, `degraded_fields`, `heartbeat_degraded_count` konsumiert werden.
   - Falls strikt: Felder auf Optional umstellen mit sinnvollen Defaults (leere Liste, `False`, `0`). Test: `cd "El Servador/god_kaiser_server" && poetry run pytest tests/mqtt/handlers/test_heartbeat_handler.py -q` (falls vorhanden; sonst neuen Test mit synthetischem Payload ohne `gpio_status` ergänzen).
   - **Kein** Breaking-Change an ESPDevice-Model oder WS-Event `esp_heartbeat`.

3. **`/verify-plan` (Pflicht-Gate):**
   - Zeilenbereiche in `mqtt_client.cpp` und `publish_queue.h` gegen Repo-IST prüfen (Zeilennummern können sich durch vorherige PKG-Änderungen verschoben haben — neu einlesen).
   - Prüfen ob `heartbeat_handler.py` tolerant ist (entscheidet, ob Zusatz-PKG nötig).
   - Frontend-Grep auf `gpio_status` ausführen und Ergebnis als Fußnote im Report.
   - Linear-Projekt-ID `e16d523e-1891-48b6-98fc-f7173a505de4` gegen `list_projects` MCP-Tool bestätigen (oder aus dem Incident-Dokument-Bezug ableiten).
   - BLOCKER markieren, falls Serverseite strikt parsed und Handler-Test nicht vorhanden.

---

## Inhaltliche Notizen (Kontext für den Agenten)

- Dieser Lauf ist **nicht** das Follow-Up für AUT-67 — AUT-67 ist erfolgreich geflasht und verifiziert (Log vom 2026-04-17 zeigt `classified=write_timeout`, `write_timeouts=1, last_errno=11`).
- Dieser Lauf **adressiert die Ursache der verbleibenden EAGAIN-Disconnects**, also das Heap-Budget-Problem, das AUT-54 (Transport-Stabilität) und AUT-55 (Outbox-Backpressure) als Hypothesen bereits streifen aber nicht direkt schließen.
- Die Wahl „Option 1" (statt Option 2 Radikalschnitt) ist **bewusst** — Option 2 entfernt Forensik-Counter und braucht ein neues `.../system/telemetry`-Topic + Server-Handler + WS-Event. Das ist ein eigenes Projekt. Option 1 ist chirurgisch, reversibel, und liefert den größten Einzel-Effekt (`gpio_status` + Payload-Limit).
- Die Reduktion `PUBLISH_QUEUE_SIZE: 8 → 6` wurde **explizit verworfen** (siehe `forbidden`), damit das Paket klein bleibt und der Backpressure-Handling-Pfad (AUT-55) nicht zusätzlich stressed wird. Wenn nach Flash `max_alloc` immer noch unter 46 000 B bleibt, kann das als Follow-Up nachgeschoben werden.

---

## Erwartetes Ergebnis nach Umsetzung (durch `esp32-dev`, separater PR)

```
# Vor Flash
[MEM] Free heap: 45 072 B, min free: 41 800 B, max alloc: 38 900 B
Heartbeat: skipping gpio_status due to low memory headroom …
E MQTT_CLIENT: Writing failed: errno=11
classified=write_timeout, write_timeouts=1, last_errno=11

# Nach Flash (Ziel-Evidence)
[MEM] Free heap: 53 000+ B, min free: 49 000+ B, max alloc: 46 000+ B
# „Heartbeat: skipping gpio_status" kommt nicht mehr vor (Feld entfernt)
# Kein errno=11 Disconnect im ersten 5-Min-Fenster
managed reconnect NOT scheduled (Verbindung stabil)
```

Die Heap-Differenz kommt aus:
- `PUBLISH_PAYLOAD_MAX_LEN` 2048 → 1024 × 8 Slots = **8 192 B permanent**
- `payload.reserve` 1900 → 640 = **1 260 B Peak** pro Heartbeat-Call
- `g_last_gpio_status_json` Cache entfällt = bis zu **512 B permanent**

**Summe: ca. 10 kB** Heap-Reclaim — ausreichend, damit `max_alloc` über den aktuell problematischen 38 900-B-Threshold steigt.

---

# VERIFY-PLAN ADDENDUM — 2026-04-19

> **Durchlauf:** `/verify-plan` gegen Repo-IST (commit-stand 2026-04-19)
> **Grundlage:** Direkte Code-Reads `mqtt_client.cpp` (Zeilen 40–69, 1267–1449), `publish_queue.h` (1–40), `heartbeat_handler.py` (1130–1189), `esp.py` (430–479), Agent-Audit Firmware/Server/Frontend (drei parallele Explore-Runs).
> **Scope:** Nur Zeilen-/Namens-Korrekturen und Aktualitäts-Updates. Fachlicher Scope, Ziele, `forbidden`, `done_criteria` der Steuerdatei **bleiben unverändert gültig**.

## A. Name- und Zeilen-Korrekturen (PFLICHT für PKG-17)

| # | Steuerdatei 2026-04-17 | Repo-IST 2026-04-19 | Status |
|---|---|---|---|
| A1 | Funktion `sendHeartbeat()` | `MQTTClient::publishHeartbeat(bool force)` ab **Zeile 1267** | ❌ → `publishHeartbeat` |
| A2 | Funktionsrumpf Z. 1299–1449 | Rumpf 1267–1449 (Z. 1299 ist Payload-Init, nicht Funktions-Start) | ⚠️ Funktionskopf 1267, Payload-Init 1299–1303 |
| A3 | Cache-Globals Z. 45–51 | **Z. 49–51**: `g_last_gpio_status_json`, `g_last_gpio_reserved_count`, `g_last_gpio_status_cache_ms`. Z. 42/43 gehören zu Outbox/Degrade-Counter (siehe A5) | ⚠️ Scope präzisieren auf 49–51 |
| A4 | gpio_status-Assembly 1321–1350 | **Z. 1321–1368**: 1321–1329 Deklarationen, 1330–1350 Live-Assembly, 1351–1368 Degradation-Fallback + Warn-Log | ⚠️ Ende korrekt 1368 |
| A5 | (nicht erwähnt) | **Z. 43** `g_heartbeat_payload_degraded_count` und **Z. 58–64** `#define HB_HEAP_DEGRADE_BYTES` / `HB_ALLOC_DEGRADE_BYTES` sind AUT-58-Artefakte und **ohne gpio_status nutzlos** | ⚠️ Mit entfernen (sauberer Schnitt) |
| A6 | Payload-Append Z. 1370–1381 | Exakt 1370–1381 (gpio_status + gpio_reserved_count + gpio_status_cached + gpio_status_cache_age_ms + payload_degraded + degraded_fields + heartbeat_degraded_count) | ✅ |
| A7 | `payload.reserve(1900)` Z. 1302 | ✅ exakt | ✅ |
| A8 | `PUBLISH_PAYLOAD_MAX_LEN = 2048` `publish_queue.h:21` mit Kommentar „Heartbeat with 10+ GPIO entries exceeds 1024 B" | ✅ exakt | ✅ |
| A9 | (Info-Update) | `HEARTBEAT_INTERVAL_MS = 60000` in `mqtt_client.h:238` — Normalintervall **60 s**, nicht 30 s wie in älteren Dokumenten zitiert | ℹ️ Klarstellung |

**Konsequenz für `esp32-dev`-Block (Pkt. 1 unter „Pflicht-Checks"):**

Die folgenden Punkte ersetzen die ursprüngliche Edit-Liste, sonst bleiben Degradation-Counter als toter Code zurück:

1. `mqtt_client.cpp:43` — `g_heartbeat_payload_degraded_count` löschen (nur von gpio_status-Branch benutzt).
2. `mqtt_client.cpp:49–51` — 3 Cache-Globals löschen.
3. `mqtt_client.cpp:58–64` — `HB_HEAP_DEGRADE_BYTES` / `HB_ALLOC_DEGRADE_BYTES` `#define`-Blöcke löschen.
4. `mqtt_client.cpp:1302` — `payload.reserve(1900)` → `payload.reserve(640)`.
5. `mqtt_client.cpp:1321–1368` — kompletter Assembly-Block (Live + Degradation-Fallback + Warn-Log) löschen.
6. `mqtt_client.cpp:1370–1381` — Payload-Append-Block löschen (inkl. AUT-58 payload_degraded/degraded_fields/heartbeat_degraded_count).
7. `publish_queue.h:21` — `2048 → 1024`, Kommentar anpassen auf „Heartbeat without gpio_status fits 1024 B headroom".
8. Grep-Sweep (Pflicht vor Build): `rg "gpio_status|g_last_gpio_status|g_heartbeat_payload_degraded_count|HB_HEAP_DEGRADE_BYTES|HB_ALLOC_DEGRADE_BYTES" "El Trabajante/src"` → **muss leer sein**, sonst bleiben tote Referenzen.
9. Build: `cd "El Trabajante" && ~/.platformio/penv/Scripts/pio.exe run -e esp32_dev` Exit 0, RAM/Flash-Report in PKG-17-DoD anhängen.

## B. Server-Handler-Toleranz (B-HB-01) — GRÜN

Direkt-Read bestätigt: Handler ist bereits **tolerant**; kein Zusatz-PKG für `server-dev` erforderlich. Nur Regression-Test ergänzen.

- `heartbeat_handler.py:1139` — `if "gpio_status" in payload:` (Guard)
- `heartbeat_handler.py:1163` — `if "payload_degraded" in payload:` (Guard)
- `heartbeat_handler.py:1165` — `if "degraded_fields" in payload:` (Guard)
- `heartbeat_handler.py:1173` — `if "heartbeat_degraded_count" in payload:` (Guard)
- `esp.py:444-447` — `gpio_status: List[GpioStatusItem] = Field(default_factory=list)` → fehlt das Feld, wird `[]` angenommen.
- `esp.py:448-452` — `gpio_reserved_count: int = Field(0, ge=0)` Default.

**Empfehlung:** Neuer Unit-Test in `tests/integration/test_heartbeat_handler.py`:
```
async def test_heartbeat_without_gpio_fields_accepted():
    # Payload ohne gpio_status, gpio_reserved_count, gpio_status_cached,
    # gpio_status_cache_age_ms, payload_degraded, degraded_fields,
    # heartbeat_degraded_count → 200, keine 5xx, device_metadata überschreibt
    # gpio_status NICHT (Alt-State bleibt bis REST-Refresh).
```

## C. Frontend-Grep (B-HB-02) — GRÜN

5 Fundstellen für `gpio_status` in `El Frontend/src`:
- `src/stores/esp.ts:1181-1183` — `if (data.gpio_status && Array.isArray(data.gpio_status))` (defensive Guard).
- `src/shared/stores/gpio.store.ts:192-239` — `updateGpioStatusFromHeartbeat()` (inert ohne Aufruf); Pull-Fallback via `fetchGpioStatus()` bei `!current`.
- `src/composables/useGpioStatus.ts` — Pull-Modell über REST `/api/v1/devices/{id}/gpio-status`.
- `src/domain/esp/espHealth.ts:41` — filtert `gpio_status` explizit **aus** der Telemetrie-Berechnung → kein Health-Coupling.
- `src/types/websocket-events.ts:97` — `gpio_status?: Record<string, boolean>` (bereits Optional).

**Kein Render-Coupling** in HardwareView.vue oder SensorConfigPanel.vue. 0× `gpio_status!`-Assertion, 0× `any`-Cast auf dem Heartbeat-Pfad. Minor-Cleanup (Deprecation der optional-Felder) ist **P1-Follow-up**, **nicht** PKG-17-Blocker.

## D. Linear-Status — AUT-68 existiert bereits

**AUT-68 [EA-15] Heartbeat-Slimming & Heap-Budget-Reduktion (H6 — Root-Cause MQTT-Disconnect)** — angelegt 2026-04-17T22:25:36Z, Projekt `MQTT-Transport & Recovery Hardening (INC EA5484)` (projectId `e16d523e-1891-48b6-98fc-f7173a505de4`), Priority Urgent, Estimate 3 SP, Status Backlog, Labels `Bug`. URL: https://linear.app/autoone/issue/AUT-68/ea-15-heartbeat-slimming-and-heap-budget-reduktion-h6-root-cause-mqtt.

→ **Nicht neu anlegen.** Aktion stattdessen: **Delta-Kommentar** an AUT-68 mit den Mutationen A1–A9 aus diesem Addendum, plus Rückverweis auf diese Steuerdatei und den Post-Verify-Report.

> Konsistenzhinweis: AUT-68 ist im Labelset `Bug`, die Steuerdatei-Wunschliste nennt `ESP32,Improvement,Bug`. Empfehlung: Bei Delta-Kommentar die Labels `ESP32` und `Improvement` additiv anfragen — technisch ist es beides (Bug für Root-Cause, Improvement für Slim-Refactor).

## E. Alternative Distribution (B-HB-03) — GRÜN

REST-Endpoint existiert bereits: `GET /api/v1/devices/{esp_id}/gpio-status` in `api/v1/esp.py:979-1099`, bus-aware (I2C shared, OneWire grouped), nutzt `GpioValidationService` + `device_metadata["gpio_status"]`. Kein Feature-Flag nötig. Kein zusätzliches `.../system/gpio_status`-MQTT-Topic für diesen Lauf erforderlich.

## F. Zusatzbefund (nicht im Scope) — Drift auf `device_metadata`

Aus dem Server-Audit: **fünf unkoordinierte Schreib-Wege** auf die JSONB-Spalte `ESPDevice.device_metadata`, die als SSOT fungiert:

| # | Datei:Zeile | Auslöser |
|---|---|---|
| 1 | `mqtt/handlers/heartbeat_handler.py:925-1179` | jeder HB (60 s) |
| 2 | `mqtt/handlers/lwt_handler.py:224` | Disconnect |
| 3 | `db/repositories/esp_repo.py:358-716` | Simulation-API |
| 4 | `services/zone_service.py:156` | Zone-Reassignment |
| 5 | `api/v1/debug.py:276` | Admin-Note |

Keine `asyncio.Lock`, keine Row-Level-`SELECT ... FOR UPDATE`. Read-modify-write mit `flag_modified()` in `_update_esp_metadata` (HB-Handler) kann konkurrierende Writes überschreiben (Zone-Resync-Flag-Loss, Simulation-Config-Loss möglich). **Nicht PKG-17-Scope.** Empfehlung: **neues Linear-Issue `AUT-69 [EA-16] device_metadata Concurrency-Hardening`** als Follow-up, related to AUT-68/AUT-60, nach erfolgreichem Strang 1.

## G. BLOCKER-Status (Gate-Entscheidung)

| Blocker | Status | Evidence |
|---|---|---|
| B-HB-01 Server tolerant | ✅ GO | heartbeat_handler.py:1139/1163/1165/1173 + esp.py:444/448 |
| B-HB-02 Frontend tolerant | ✅ GO | esp.ts:1181 Array.isArray, gpio.store.ts:197-200 Pull-Fallback, espHealth.ts:41 gefiltert |
| B-HB-03 Alternative Distribution | ✅ GO | api/v1/esp.py:979-1099 REST-Endpoint existiert |
| B-HB-04 config_status bleibt | ✅ GO | Z. 1443-1444 unverändert im Scope |
| B-HB-05 Forensik-Counter bleiben Phase 1 | ✅ GO | Z. 1384-1444 unverändert im Scope |

**Kein offener BLOCKER. Gate: GO für PKG-17.**

## H. OUTPUT FÜR ORCHESTRATOR (auto-debugger)

```yaml
run_type: verify-plan
run_date: 2026-04-19
source_steuerdatei: .claude/auftraege/auto-debugger/inbox/STEUER-heartbeat-slimming-option1-ea5484-2026-04-17.md
incident_id: INC-2026-04-11-ea5484-mqtt-transport-keepalive
linear_issue: AUT-68 (existiert, nicht neu anlegen)
gate_result: GO
blockers_open: []

mutations_for_TASK_PACKAGES_md:
  pkg_id: PKG-17
  title: Heartbeat-Slimming Option 1 (gpio_status + PUBLISH_PAYLOAD_MAX_LEN)
  owner: esp32-dev
  branch: auto-debugger/work
  function: MQTTClient::publishHeartbeat(bool force)   # NICHT sendHeartbeat
  edits:
    - file: El Trabajante/src/services/communication/mqtt_client.cpp
      delete_line: 43          # g_heartbeat_payload_degraded_count
      delete_lines: [49, 51]   # cache globals (3 Zeilen)
      delete_lines_block: [58, 64]   # HB_HEAP_DEGRADE_BYTES / HB_ALLOC_DEGRADE_BYTES #defines
      change_line: 1302        # payload.reserve(1900) -> payload.reserve(640)
      delete_lines_block_1: [1321, 1368]   # Assembly + Fallback + Warn-Log
      delete_lines_block_2: [1370, 1381]   # Payload-Append inkl. AUT-58-Felder
    - file: El Trabajante/src/tasks/publish_queue.h
      change_line: 21          # PUBLISH_PAYLOAD_MAX_LEN 2048 -> 1024, Kommentar anpassen
  grep_sweep_must_be_empty:
    pattern: "gpio_status|g_last_gpio_status|g_heartbeat_payload_degraded_count|HB_HEAP_DEGRADE_BYTES|HB_ALLOC_DEGRADE_BYTES"
    path: El Trabajante/src
  build: cd "El Trabajante" && ~/.platformio/penv/Scripts/pio.exe run -e esp32_dev
  dod:
    - pio_exit: 0
    - serial_heartbeat_payload_len_bytes: "<= 512"
    - heap_max_alloc_bytes: ">= 46000"
    - errno_11_disconnect_in_5min: 0
    - mqtt_event_disconnected_in_5min: 0
    - heartbeat_interval_runtime: 60000   # mqtt_client.h:238, unverändert

mutations_for_SPECIALIST_PROMPTS_md:
  add_block: esp32-dev  (Pflicht, siehe edits oben)
  add_block: server-debug  (Verify, parallel flash-bar)
    - read: El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py:1139-1176
    - read: El Servador/god_kaiser_server/src/schemas/esp.py:444-452
    - new_test: tests/integration/test_heartbeat_handler.py::test_heartbeat_without_gpio_fields_accepted
    - verify: GET /api/v1/devices/{esp_id}/gpio-status liefert 200 auch wenn HB kein gpio_status mehr pusht
    - cmd: cd "El Servador/god_kaiser_server" && poetry run pytest tests/integration/test_heartbeat_handler.py -k "not soft_deleted_device" -q
    - cmd: ruff check src/mqtt/handlers/heartbeat_handler.py
  add_block: frontend-debug  (Verify, parallel flash-bar)
    - grep_verify: 5 Stellen (esp.ts:1181, gpio.store.ts:192, useGpioStatus.ts, espHealth.ts:41, websocket-events.ts:97)
    - cmd: cd "El Frontend" && npm run build
    - cmd: cd "El Frontend" && npx vue-tsc --noEmit
    - manual_check: HardwareView nach Reflash auf Ref-ESP EA5484, keine Console-Errors, GpioPicker zeigt via REST
    - optional_followup: esp.ts:1181-1183 Block entfernen + websocket-events.ts:97 @deprecated (P1, nicht P0)

mutations_for_INCIDENT_LAGEBILD_md:
  new_section: "Eingebrachte Erkenntnisse — 2026-04-19 (Verify-Plan PKG-17)"
  hypothesis: H8  (Heartbeat-Payload als Hauptfragmentierer — durch Code-Read bestätigt)
  evidence:
    - max_alloc_static_38900B: "konstant über Run, kein dynamischer Effekt"
    - free_heap_baseline: "42–49 kB"
    - degradation_already_triggers: "mqtt_client.cpp:1331/1363 Warn-Log live gesehen"
    - write_timeout_classified: "AUT-67 Counter bestätigt errno=11 EAGAIN"

mutations_for_VERIFY_PLAN_REPORT_md:
  new_section: "Delta 2026-04-19 (PKG-17 Heartbeat-Slimming Option 1)"
  paths_checked:
    - El Trabajante/src/services/communication/mqtt_client.cpp:43,49-51,58-64,1267,1302,1321-1368,1370-1381
    - El Trabajante/src/tasks/publish_queue.h:21
    - El Trabajante/src/services/communication/mqtt_client.h:238
    - El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py:1139-1176
    - El Servador/god_kaiser_server/src/schemas/esp.py:444-452
    - El Servador/god_kaiser_server/src/api/v1/esp.py:979-1099
    - El Frontend/src/stores/esp.ts:1181-1183
    - El Frontend/src/shared/stores/gpio.store.ts:192-239
    - El Frontend/src/composables/useGpioStatus.ts
    - El Frontend/src/domain/esp/espHealth.ts:41
    - El Frontend/src/types/websocket-events.ts:97
  gate_result: GO
  blockers_open: []

linear_delta_comment_for_AUT-68:
  target_issue: AUT-68
  comment_body_sections:
    - "Verify-Plan 2026-04-19 (Steuerdatei-Update)"
    - "Funktionsname korrigiert: publishHeartbeat statt sendHeartbeat"
    - "Exakte Zeilenbereiche (Cache 49-51, Defines 58-64, Counter 43, Reserve 1302, Assembly 1321-1368, Append 1370-1381)"
    - "AUT-58-Artefakte mit entfernen (Counter + Defines)"
    - "B-HB-01 GRÜN (Server tolerant), B-HB-02 GRÜN (Frontend tolerant), B-HB-03 GRÜN (REST existiert)"
    - "Heartbeat-Intervall ist 60s (mqtt_client.h:238), nicht 30s"
    - "Follow-up: Drift-Audit 5 Writer auf device_metadata → AUT-69 [EA-16] vorschlagen"
  label_requests_additive: [ESP32, Improvement]

follow_up_issue_suggestion:
  id: AUT-69 [EA-16]
  title: device_metadata Concurrency-Hardening (5-Writer-Drift)
  priority: High
  related_to: [AUT-68, AUT-60]
  scope: asyncio.Lock oder Row-Level-Lock für ESPDevice.device_metadata read-modify-write
```

## I. Handover-Zusammenfassung (Chat)

- **Start-Reihenfolge:** `esp32-dev` führt PKG-17-Edits auf `auto-debugger/work` aus (sequential, ein Commit).
- **Parallel:** `server-debug` führt Regression-Test + REST-Smoke, `frontend-debug` führt Grep + Build-Verify. Beide blocken nicht den Firmware-Flash.
- **Nach grünem `pio run`:** Reflash ESP EA5484 (COM4), 5-min Stresstest mit Serial-Marker `[INC-EA5484]`, DoD-Messung.
- **Nach grüner Live-Verify:** AUT-68 Delta-Kommentar posten (Mutations-Tabelle + Messwerte), INCIDENT-LAGEBILD H8 additiv, VERIFY-PLAN-REPORT Delta 2026-04-19.
- **Follow-up-Tickets:** AUT-69 [EA-16] (device_metadata Concurrency) und optional AUT-70 [EA-17] (Option 2 Forensik-Counter Delta-Only) erst nach abgeschlossenem PKG-17-Live-Test anlegen.
- **Rollback-Plan:** Single-Commit-Revert auf `auto-debugger/work`, `pio run -e esp32_dev`, Reflash. < 2 min.

---

*Ende Verify-Plan-Addendum 2026-04-19. Die darüber stehenden Abschnitte der Steuerdatei (scope/forbidden/done_criteria/Chat-Text) bleiben unverändert in Kraft; dieses Addendum präzisiert nur.*
