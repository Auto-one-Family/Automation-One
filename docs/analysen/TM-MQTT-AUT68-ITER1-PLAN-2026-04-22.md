# Implementierungsplan AUT-68 Phase 1 Iteration 1 — Heartbeat-Feld `seq` entfernen

**Ersteller:** esp32-dev (Spezialagent)
**Datum:** 2026-04-22
**Branch:** auto-debugger/work
**Status:** PLAN — noch nicht verify-plan-geprüft, noch nicht implementiert

---

## 1. Ziel (1 Satz)

Entferne das ungenutzte Feld `seq` aus dem ESP32-Heartbeat-Payload (`publishHeartbeat`, `mqtt_client.cpp:1371`), um die Payload-Baseline fuer AUT-68 Phase 1 messbar zu verkleinern, ohne Server- oder Frontend-Konsumenten zu beeintraechtigen.

---

## 2. Scope (IN/OUT mit Datei+Zeile)

### IN (exakt 1 Aenderung, 1 Datei, 1 Zeile)

| Datei | Zeile | Aenderung |
|-------|-------|-----------|
| `El Trabajante/src/services/communication/mqtt_client.cpp` | 1371 | Zeile vollstaendig entfernen (1-Zeilen-Deletion) |

### OUT (explizit nicht Teil dieser Iteration)

- `getNextSeq()`-Funktion bleibt unveraendert — wird in ~30 weiteren Publish-Pfaden genutzt (main.cpp, intent_contract.cpp, actuator_manager.cpp, config_response.cpp etc.).
- Alle anderen Heartbeat-Felder (`esp_id`, `zone_id`, `master_zone_id`, `zone_assigned`, `ts`, `time_valid`, `boot_sequence_id`, `reset_reason`, `segment_start_ts`, `uptime`, `heap_free`, `wifi_rssi`, `sensor_count`, `actuator_count`, …) bleiben unberuehrt.
- `payload.reserve(768)` bleibt unveraendert (Ueberdimensionierung toleriert, keine Regression).
- Keine Aenderungen an `heartbeat_handler.py`, `subscriber.py`, `request_context.py` oder Frontend.
- Keine weiteren dirty files (~100 auf Branch) werden mitcommitted.

---

## 3. Konkreter Edit (before/after Code-Block)

### Before (aktueller Stand, `mqtt_client.cpp:1369-1375`)

```cpp
    payload = "{";
    payload += "\"esp_id\":\"" + g_system_config.esp_id + "\",";
    payload += "\"seq\":" + String(getNextSeq()) + ",";
    payload += "\"zone_id\":\"" + g_kaiser.zone_id + "\",";
    payload += "\"master_zone_id\":\"" + g_kaiser.master_zone_id + "\",";
    payload += "\"zone_assigned\":" + String(g_kaiser.zone_assigned ? "true" : "false") + ",";
    payload += "\"ts\":" + String((unsigned long)unix_timestamp) + ",";
```

### After (Iteration 1 Ziel)

```cpp
    payload = "{";
    payload += "\"esp_id\":\"" + g_system_config.esp_id + "\",";
    payload += "\"zone_id\":\"" + g_kaiser.zone_id + "\",";
    payload += "\"master_zone_id\":\"" + g_kaiser.master_zone_id + "\",";
    payload += "\"zone_assigned\":" + String(g_kaiser.zone_assigned ? "true" : "false") + ",";
    payload += "\"ts\":" + String((unsigned long)unix_timestamp) + ",";
```

**Diff-Groesse:** -1 Zeile, +0 Zeilen. Keine umgebenden Zeilen werden modifiziert (keine Whitespace-/Format-/Kommentar-Aenderungen).

---

## 4. Grep-Evidence-Kurzform (3 Zeilen, Referenz auf Linear-Kommentar vom 08:42)

Siehe Linear AUT-68 Kommentar vom 2026-04-22 08:42 (vollstaendige Grep-Matrix). Kurzform:

1. **Server:** `heartbeat_handler.py` hat **kein** `payload.get("seq")`; `subscriber.py:190,500` greift `seq` topic-agnostisch ab und `generate_mqtt_correlation_id` (core/request_context.py:44) akzeptiert `seq: Union[int,str,None]` — None-safe.
2. **Frontend:** `El Frontend/src` enthaelt 0 Referenzen auf `.seq` oder `"seq"` im Heartbeat-Kontext.
3. **ESP32:** `getNextSeq()` wird in ~30 anderen Publish-Pfaden weiterhin aufgerufen — Counter-Logik bleibt intakt und ungestoert.

---

## 5. Commit-Plan

### Message (Conventional Commits)

```
refactor(esp32): remove unused seq field from heartbeat payload (AUT-68 Phase 1 Iter1)
```

### Body

```
Entfernt das Feld `seq` aus dem Heartbeat-Payload in
MQTTClient::publishHeartbeat (mqtt_client.cpp:1371).

Begruendung (Grep-Evidence, siehe Linear AUT-68 Kommentar 2026-04-22 08:42):
- heartbeat_handler.py greift `seq` nicht ab (kein payload.get("seq")).
- subscriber.py:190,500 nutzt `seq` topic-agnostisch; request_context.py:44
  akzeptiert seq=None (Union[int,str,None]).
- Frontend: 0 Referenzen auf .seq oder "seq" im Heartbeat-Kontext.
- getNextSeq() bleibt intakt; wird von ~30 anderen Publish-Pfaden weiter
  genutzt (main.cpp, intent_contract.cpp, actuator_manager.cpp,
  config_response.cpp, actuator_manager.cpp u.a.).

Ziel: Payload-Baseline fuer AUT-68 Phase 1 messbar verkleinern,
ohne Server- oder Frontend-Konsumenten zu beeintraechtigen.

Refs: AUT-68
```

### git-Kommandos (Commit-Isolation — nur DIESE eine Datei!)

```bash
# WICHTIG: Branch auto-debugger/work enthaelt ~100 dirty files aus vorherigen Sessions.
# Deshalb KEIN `git add -A` und KEIN `git add .`.

git status --short                                                    # Vorher: Diff nur an 1371 verifizieren
git diff -- "El Trabajante/src/services/communication/mqtt_client.cpp" # Exakt -1 Zeile erwarten
git add "El Trabajante/src/services/communication/mqtt_client.cpp"     # Genau dieser Pfad, KEIN -A
git diff --cached --stat                                               # Muss 1 file / 1 deletion zeigen
git commit -m "refactor(esp32): remove unused seq field from heartbeat payload (AUT-68 Phase 1 Iter1)" \
  -m "Entfernt das Feld seq aus dem Heartbeat-Payload ... Refs: AUT-68"
```

**Commit-Gate:** `git diff --cached --stat` MUSS genau 1 file changed, 0 insertions, 1 deletion zeigen. Sonst Commit abbrechen.

---

## 6. Verifikations-Matrix (Agent-Seite vs. User-Hand)

| Check | Wer | Kommando | Erwartet |
|-------|-----|----------|----------|
| Diff-Groesse | Agent | `git diff --cached --stat` | 1 file, 0 insertions, 1 deletion |
| ESP32 Build | **User-Hand** (PlatformIO nicht in Sandbox) | `cd "El Trabajante" && pio run -e esp32_dev` | Exit 0, 0 Errors, RAM/Flash unter Limit |
| Server Test | Agent | `cd "El Servador/god_kaiser_server" && pytest -q tests/integration/test_heartbeat_handler.py` | Alle gruen |
| Server Lint | Agent | `cd "El Servador/god_kaiser_server" && ruff check src/core/request_context.py src/mqtt/handlers/ src/mqtt/subscriber.py` | 0 Errors (Warnings OK) | [verify-plan 2026-04-22: relative Pfade korrigiert zu `src/...`; entfällt ggf., da K1-Entfernung 0 Server-Code-Change ist — optional als Smoke-Check] |
| Frontend Build | nicht noetig | — | (kein Konsument — 0 Referenzen auf `.seq` in `El Frontend/src`) |
| Live-Stresstest | **User-Hand** | Reflash ESP32 + 10 min beobachten (MQTT-Logs, heap_free, Grafana-Heartbeat-Panel) | 0 Disconnect, heap_free stabil, `system/heartbeat` weiter alle 30s empfangen |
| Payload-Baseline | **User-Hand** (optional, Phase-1-Exit-Kriterium) | `mosquitto_sub -t 'kaiser/+/esp/+/system/heartbeat' -C 1 \| wc -c` vs. Pre-Change | Messbar kleiner (~-20 B) |

**Sandbox-Grenze:** `pio` steht im Agent-Container nicht zur Verfuegung — ESP32-Build und Live-Reflash sind User-Hand-Schritte. Agent darf nur Server-Seite (pytest, ruff) ausfuehren.

---

## 7. Rollback-Plan

Falls der Live-Stresstest Regressionen zeigt (Server-Disconnect, Correlation-ID-Fehler, fehlende Heartbeats), Rollback in 2 Schritten:

1. `git revert <sha-der-iter1-commit>` auf `auto-debugger/work` — erzeugt Revert-Commit, keine History-Umschreibung.
2. ESP32 reflashen mit der Pre-Revert-Firmware (User-Hand, `pio run -t upload -e esp32_dev`).

Keine Daten-/DB-Migration noetig (Server ist payload-tolerant gegenueber fehlendem `seq`, ebenso gegenueber vorhandenem `seq`).

---

## 8. Risiken + Mitigation (3 Zeilen)

1. **Risiko:** Unentdeckter Konsument von `seq` in Log-Parsing/Grafana. **Mitigation:** Live-Stresstest 10 min + Grafana-Heartbeat-Panel checken; Grep-Evidence belegt 0 Konsumenten im Repo.
2. **Risiko:** Versehentliches Mitcommitten der ~100 dirty files auf `auto-debugger/work`. **Mitigation:** `git add <exakter Pfad>` + Hard-Gate via `git diff --cached --stat` (muss 1 file / 1 deletion zeigen).
3. **Risiko:** Build bricht wegen syntaktischer Nebenwirkung (`+=`-Kette). **Mitigation:** User-Hand-Build `pio run -e esp32_dev` ist Pflicht-Gate vor Reflash; Zeile ist strukturell unabhaengig (eigenes `+=`-Statement mit abschliessendem `";"`).

---

## 9. Offene Fragen (fuer verify-plan) — BEANTWORTET 2026-04-22

1. ~~Grafana-Dashboards/Prometheus-Queries mit `seq` aus Heartbeat?~~ — **User-Hand**: Prüfung `infra/grafana/provisioning/dashboards/` ist sandbox-blockiert (tool timeout). Der Plan-Risiko-Eintrag (Sektion 8 Nr. 1) deckt dieses Risiko bereits ab; User soll vor Reflash `rg "seq" infra/grafana/provisioning/dashboards/` laufen lassen.
2. ~~Commit-Body mit Pre/Post-Payload-Byte-Count?~~ — **Plan-Entscheid**: Qualitativ reicht für Iter1 (K1 = ~3 B). Quantitative Messung gehört in DoD-Item B-HB-A als User-Hand-Schritt (Sektion 6), nicht in die Commit-Message. Beibehalten wie im Plan.
3. ~~Pytest-Pfad `tests/integration/test_heartbeat_handler.py` korrekt?~~ — **verify-plan: bestätigt**. Datei existiert (zusätzlich `test_heartbeat_gpio.py`). Pfad aus Plan ist korrekt.
4. ~~`git diff`-Gates vom Agenten oder User-Hand?~~ — **verify-plan-Empfehlung**: Agent (esp32-dev) darf `git status/diff/add/commit` auf Branch `auto-debugger/work` ausführen (CLAUDE.md 0a erlaubt Code-Änderungen explizit auf dieser Branch). User-Hand bleibt nur für `pio`/Reflash/Live-Stresstest (Sandbox-Grenze).

---

## 9a. Verify-Plan-Report (2026-04-22)

**Gate-Ergebnis: GO (mit Pfad-Korrektur in Sektion 6).**

**Geprüft (Reality-Check gegen Repo-Stand auf Branch `auto-debugger/work`):**

- ✅ Datei `El Trabajante/src/services/communication/mqtt_client.cpp` existiert, Zeile 1371 enthält **exakt** `payload += "\"seq\":" + String(getNextSeq()) + ",";` (per Read verifiziert).
- ✅ `heartbeat_handler.py` enthält **kein** `payload.get("seq")` (rg-Treffer: 0).
- ✅ `El Servador/god_kaiser_server/src/mqtt/subscriber.py:190` und `:500` nutzen `payload.get("seq")` topic-agnostisch.
- ✅ `El Servador/god_kaiser_server/src/core/request_context.py:44` Signatur: `def generate_mqtt_correlation_id(esp_id: str, topic_suffix: str, seq: Union[int, str, None]) -> str` — **None-safe** (per Read verifiziert).
- ✅ Frontend: 0 Treffer auf `.seq` oder `"seq"` in `El Frontend/src/` (rg-Grep).
- ✅ `getNextSeq()` bleibt in ~30 anderen Publish-Pfaden aktiv (mqtt_client.h:140 Definition, ~30 Call-Sites). Counter-Logik unversehrt.
- ✅ PlatformIO-Env `esp32_dev` ist in `El Trabajante/platformio.ini` definiert (neben `seeed_xiao_esp32c3`, `esp32_prod`, `wokwi_simulation`, u. a.) → Build-Befehl `pio run -e esp32_dev` ist syntaktisch valide.
- ✅ Pytest-File `tests/integration/test_heartbeat_handler.py` existiert (zusätzlich `test_heartbeat_gpio.py`).
- ✅ Branch `auto-debugger/work` ist aktuell ausgecheckt (`git branch --show-current`).

**Korrektur:**

- Sektion 6 Server-Lint-Pfad berichtigt: `ruff check core/request_context.py mqtt_handlers/ subscribers/` → `ruff check src/core/request_context.py src/mqtt/handlers/ src/mqtt/subscriber.py` (relativ zur CWD `El Servador/god_kaiser_server/`).

**Fehlende Vorbedingungen:**

- [ ] Grafana-Konsumenten-Prüfung (`infra/grafana/provisioning/dashboards/` Grep auf `seq`) — User-Hand vor Reflash.
- [ ] Pre-Change-Serial-Log-Baseline für Payload-Byte-Count — User-Hand (Serial-Log auf EA5484 mit `mosquitto_sub -t 'kaiser/+/esp/+/system/heartbeat' -C 1`).

**Ergänzungen:**

- Die Commit-Message-Body-Zeile "Entfernt das Feld seq ..." ist im `git commit -m`-Beispiel in Sektion 5 ohne Umbrüche abgebildet; der Plan-Vorschlag im Body-Block mit Zeilenumbrüchen ist die Referenz — bei Bash-Ausführung HEREDOC nutzen.
- Cowork-Sandbox: Git-Operationen sind ausführbar (Branch-Check, status/diff funktionierten im Session-Log). Nur PlatformIO und Hardware fehlen.

**Zusammenfassung:** Plan ist ausführbar. Scope auf 1 Zeile ist bewusst klein und matcht die Workflow-Test-Semantik des TM-Auftrags. GO für Umsetzung durch `esp32-dev` (Schritt C4).

---

## 10. OUTPUT FUER ORCHESTRATOR (Chat-Block)

```
HANDOVER AUT-68 Iter1 -> verify-plan

SCOPE: 1 Datei, 1 Zeile-Deletion
  - El Trabajante/src/services/communication/mqtt_client.cpp:1371
  - Entfernt: payload += "\"seq\":" + String(getNextSeq()) + ",";

VERIFY-PLAN bitte pruefen:
  [1] Grep-Evidence gegen aktuellen Repo-Stand (heartbeat_handler.py kein seq,
      subscriber.py:190,500 None-safe, Frontend 0 Refs, getNextSeq weiter genutzt).
  [2] Pytest-Pfad verifizieren: tests/integration/test_heartbeat_handler.py
      -> existiert dieser File exakt so?
  [3] Commit-Isolation-Strategie (git add <exakter Pfad> + diff --cached --stat Gate)
      ausreichend gegen ~100 dirty files auf auto-debugger/work?
  [4] Grafana/Prometheus-Konsumenten von `seq` ausserhalb Repo? (externe Evidence).
  [5] Rollback-Plan (git revert + Reflash) ausreichend, oder zusaetzliche
      Feature-Flag-Absicherung noetig?

USER-HAND-SCHRITTE (nicht automatisierbar):
  - pio run -e esp32_dev (PlatformIO nicht im Sandbox-Container)
  - Reflash + 10 min Live-Stresstest (MQTT + Grafana-Heartbeat-Panel)

NAECHSTER SCHRITT nach verify-plan GO: esp32-dev fuehrt Edit + Commit
(nur mqtt_client.cpp) auf Branch auto-debugger/work aus, dann
VERIFY-PLAN-REPORT.md, dann User-Hand-Build + Reflash.
```
