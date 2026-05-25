# Agent-Auftrag: GPIO-14 / Offline-Mode / AUT-481 — Verifikation und Kommunikation

> **Pflichtlektüre:** `docs/analysen/OFFLINE-MODE-AKTOR-SAFETY-FORENSIK-ESP_698EB4-2026-05-25.md`  
> **Linear Parent:** [AUT-481](https://linear.app/autoone/issue/AUT-481) (In Review)  
> **Gerät:** `ESP_698EB4`, Aktor **GPIO 14** (`wasserpumpe`)

---

## Ziel

In **gezielten Zyklen** prüfen, ob das Verhalten nach den letzten Fixes (AUT-481, Server-Serialize, ESP-Correlation) **produktionsreif** ist — insbesondere:

1. Offline-Mode läuft bei Disconnect **korrekt weiter** (P4, GPIO 25 mit Rule).
2. Manueller Aktor **ohne Offline-Rule** (GPIO 14) verhält sich gemäß **dokumentiertem SOLL** (Klärung: auto-OFF vs. Last-State-Hold).
3. REST/API-Pfad stabil (kein Disconnect unter paced Commands).
4. Ergebnisse **präzise** auf **Linear** (Issue AUT-481 + ggf. Sub-Issues) und **Slack** (bestehender Thread zu AUT-481/Pi-2) posten.

---

## Strategie (Reihenfolge)

### Phase A — IST verstehen (readonly, ~30 min)

1. Lies vollständig: `docs/analysen/OFFLINE-MODE-AKTOR-SAFETY-FORENSIK-ESP_698EB4-2026-05-25.md`
2. Code-Stichproben (nur diese Funktionen):
   - `El Trabajante/src/services/actuator/actuator_manager.cpp` → `setUncoveredActuatorsToSafeState`
   - `El Trabajante/src/tasks/safety_task.cpp` → `NOTIFY_MQTT_DISCONNECTED`
   - `El Trabajante/src/services/safety/offline_mode_manager.cpp` → `onDisconnect`, `activateOfflineMode`, `hasCoveringRule`
3. Linear: `get_issue AUT-481` — letzte Kommentare/Status lesen, **nicht** duplizieren was schon steht.
4. Slack: Thread zur **gleichen** AUT-481 / Pi-2 / Disconnect-Arbeit finden (recent posts vom 2026-05-25) — dort **antworten**, kein paralleler Spam-Kanal.

### Phase B — Messung (Hardware + API, ~45 min)

**Voraussetzungen:** Stack läuft (Docker healthy), ESP online, PIO-Monitor **oder** nur Skript-Serial (`SERIAL_SOURCE=auto`).

```bash
# Credentials nur in der Shell, nie in Repo committen
export API_USER=Robin
export API_PASSWORD='<aus User-Vorgabe>'
export AUTH_TOKEN="$(curl -sS -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$API_USER\",\"password\":\"$API_PASSWORD\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['access_token'])")"

# T5 — REST paced (Pflicht)
/home/robin/autoone/logs/verification/scripts/gpio14-b4-disconnect-verify.sh

# T1 — Disconnect während ON (manuell oder kontrolliert: WiFi/MQTT kurz stören NUR mit Robin-Rückendeckung)
# Vorher: POST ON GPIO 14, dann Disconnect provozieren, 60s Serial beobachten
# Erwartung laut Forensik-Doku klären mit Robin vor Fix
```

**Log-Pflicht pro Lauf:** neuer Ordner unter `logs/verification/<run_id>/` (Skript erzeugt automatisch).

**Auswertung grep (Serial):**

```bash
grep -E 'MQTT_EVENT_DISCONNECTED|Disconnect\+rules|offline_rule_hold|safety_forced_off|OFFLINE_ACTIVE|GPIO 14' \
  logs/verification/<run_id>/esp32_serial.log
```

**Server:**

```bash
grep 'LWT received: ESP ESP_698EB4' logs/server/god_kaiser.log | tail -5
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT gpio, actuator_name FROM actuator_configs ac JOIN esp_devices e ON ac.esp_id=e.id WHERE e.device_id='ESP_698EB4';"
```

### Phase C — SOLL vs. IST Entscheidung

| Befund | Aktion |
|--------|--------|
| GPIO 14 bleibt ON ohne Rule bei Disconnect | **Wenn SOLL = auto-OFF:** Bug/Config — Server Default `fail_safe_on_disconnect=true` für manuelle Aktoren + Migration; Frontend Toggle. **Wenn SOLL = Hold:** Doku + UI-Hinweis, Alert-Reason `offline_rule_hold` bei fail_safe=false umbenennen. |
| Offline-Mode P4 bricht ab | Firmware-Bug → Sub-Issue, Assign esp32-dev |
| REST PASS, nur MQTT-Sturm disconnect | In Linear als „Transport/Stress“ trennen von „UI-Pfad OK“ |
| DB `actuator_states=off` aber Hardware ON | Cross-Layer Gap dokumentieren (Heartbeat-Timeout vs. P4) |

### Phase D — Kommunikation (Linear + Slack)

#### Linear (AUT-481)

**Ein Kommentar** (Markdown), Struktur:

```markdown
## Verifikation GPIO14 / Offline-Mode (2026-05-25)

**Dokument:** docs/analysen/OFFLINE-MODE-AKTOR-SAFETY-FORENSIK-ESP_698EB4-2026-05-25.md

### Ergebnis Kurz
- Offline-Mode P4: [weiter / broken]
- GPIO 25 (mit Rule): [hold OK / …]
- GPIO 14 (ohne Rule): [ON gehalten / forced OFF] — fail_safe effektiv: [true/false]
- REST paced T5: [PASS/FAIL] — Run: logs/verification/…

### Offene Punkte
- [ ] …

### Vorschlag nächster Commit
- …
```

- Nur **neue** Sub-Issues anlegen wenn klar abgrenzbar (z. B. „AUT-481-P4: fail_safe Default für Dashboard-Aktoren“).
- Status AUT-481 nur ändern wenn alle T1–T5 erfüllt oder explizit als Known-Gap akzeptiert.

#### Slack

- **Antwort im bestehenden Thread** zu AUT-481 / Pi-2 / letzten Deploy-Änderungen (vom 2026-05-25).
- Format:
  - 3 Bullet **Ergebnis**
  - Link zum Forensik-Doc (Pfad im Repo)
  - 1 Bullet **Risiko** (GPIO 14 Hold wenn ON)
  - 1 Bullet **Nächster Schritt**
- Keine Credentials, keine JWTs.

---

## Zyklen (wiederholen bis grün oder Known-Gap dokumentiert)

```
A (lesen) → B (messen) → C (entscheiden) → D (posten) → bei FAIL: Fix-Branch auto-debugger/work → B erneut
```

Max. **3 Zyklen** ohne Robin-Rückfrage; danach in Linear „blocked: product decision fail_safe default“.

---

## Erfolgskriterien (Definition of Done)

- [ ] Forensik-Dokument gelesen und Test-Matrix T1–T5 abgearbeitet oder begründet übersprungen
- [ ] Mindestens ein REST-Lauf `VERDICT.md` = **PASS**
- [ ] Disconnect-Lauf dokumentiert: Serial-Zeilen `held=` / `forced=` / GPIO 14 Zustand
- [ ] Linear AUT-481: **ein** strukturierter Kommentar mit Doc-Link
- [ ] Slack: **ein** Thread-Reply im richtigen Kontext (nicht neuer Kanal)
- [ ] Offene Bugs als Linear-Sub-Issues mit Assignee-Hinweis (`esp32-dev` / `server-dev` / `frontend-dev`)

---

## Verboten

- Passwörter/Tokens in Git, Markdown oder Slack
- MQTT-Sturm ohne REST als einziger Abnahme-Nachweis
- Paralleles Lesen von `/dev/ttyUSB0` (PIO + Skript) — `SERIAL_SOURCE=auto` nutzen
- AUT-481 auf Done setzen ohne GPIO-14-SOLL-Klärung

---

## Skills

| Phase | Skill |
|-------|--------|
| Serial/Firmware | `esp32-debug` |
| Server/LWT/DB | `server-debug` |
| MQTT | `mqtt-debug` |
| Linear/Slack Posting | dieser Prompt + `meta-analyst` bei Cross-Layer |

---

*Referenz-Dokument ist die Single Source of Truth für IST-Befunde vom 2026-05-25.*
