# Slack-Konvention — pi-home (@pi-2)

> **Stand:** 2026-05-29  
> **System:** 3b — Pi-2 `AutoOne44` @ 192.168.0.2  
> **Workspace:** automation-one  
> **Live-Channel:** `#pi-home` (C0B5LJ89161, umbenannt 2026-05-29 von `#fix-pi-2`)  
> **Ledger:** `#ledge-pi` (C0B6J8PGPTJ) — COMMIT-Spiegel ≤60s  
> **Risiko-Stufe:** MEDIUM (Cannabis-Indoor Heim, Robin daheim)

---

## Pflicht-Kontext (selbsttragend)

### Counterparts

| Handle | System | Rolle |
|--------|--------|-------|
| `@automation-experte` | Life-Repo | Dirigent, BRIEFINGS via Slack + Linear. Kein Pi-Filesystem-Zugriff. |
| `@pi-1` | pi-elbherb, growy2 @ 192.168.178.67 | Schwester-Session, STRICT-Produktion (LPAP Elbherb). Cross-Pi via `#ledge-pi`. |
| `@dev-local` | Robins Win-PC | Repro-Mirror ohne Hardware (FREE). NEED an ihn für lokale Bug-Repros. |
| TM + TM-Subagents | Auto-one-Repo | Code-Owner. Cross-Repo via Linear. |

### Vier-Systeme-Modell

- **System 1:** Life-Repo (`@automation-experte`)
- **System 2:** Auto-one-Repo (TM + Subagents)
- **System 3a:** `#pi-elbherb` — Pi-1 growy2 @ 192.168.178.67, STRICT
- **System 3b:** `#pi-home` — Pi-2 AutoOne44 @ 192.168.0.2, MEDIUM ← **dieser Host**
- **System 4:** `#dev-local` — Robins Win-PC Docker, FREE
- Slack + Linear = einzige gemeinsame Datenräume

---

## pi-home-spezifische Hardware

| Feld | Wert |
|------|------|
| Hostname | `AutoOne44` |
| LAN-IP | `192.168.0.2` |
| Projektroot | `/home/robin/autoone` |
| ESP | `ESP_698EB4` |
| Aktoren | GPIO **14** (`wasserpumpe`, digital, enabled) · GPIO **25** (`leuchte`, digital, enabled) |
| Sensoren | `sht31_temp`, `sht31_humidity`, `vpd` (berechnet) — alle enabled |
| Logic-Rule | `beleuchtung` → Aktor ESP_698EB4 GPIO25 ON |
| Kontext | Cannabis-Indoor Heim — bei Stromausfall Pflanzen-Risiko, kein Umsatz-Risiko |

---

## Risiko-Stufe MEDIUM — Autonomie-Matrix

### Autonom erlaubt

- Lesen (Repo, Logs, DB-Queries, MQTT-Subscribe)
- Read-only-Forensik, Mess-Skripte
- **Container-Restart** (Server/MQTT/Frontend) via `safe-restart`
- Config-Reload (Compose-Env, Vite-Config → `docker compose restart`)
- Slack-Posts, Linear-Comments

### Pflicht Chat-Block an Robin

Vor Ausführung **Robin explizit fragen** (Template: `chat-block-vorlage`):

| Aktion | Grund |
|--------|-------|
| DB-Schema-Migration | `alembic upgrade` etc. — Datenverlust-Risiko |
| System-Reboot | Pi-Neustart — Stack + ESP offline |
| Firmware-Flash auf ESPs | Hardware-Risiko, GPIO-Zustand |
| Image-Update | `docker pull` neuer Major-Versionen |

**Begründung MEDIUM:** Heim-Setup, niemand schaut zu. Container-Restart darf autonom — schnelle Recovery liegt auf pi-2.

---

## Slack-Konvention

### Channels

| Channel | ID | Zweck |
|---------|-----|-------|
| `#pi-home` | C0B5LJ89161 | Live-Session pi-2 (dieser Channel) |
| `#pi-elbherb` | C0B5HJP66JX | Schwester-Session pi-1 (STRICT) |
| `#dev-local` | C0B70F0TNPK | Robins Win-PC |
| `#ledge-pi` | C0B6J8PGPTJ | Projekt-Ledger, COMMIT-Spiegel |

### Nachrichten-Typen

`ONLINE`, `SYNC`, `CLAIM`, `STRATEGY`, `HEARTBEAT`, `OVERLAP`, `COMMIT`, `RELEASE`, `NEED`, `ACK`, `STRAND-START`, `STRAND-READY`, `STRAND-BARRIER`

### Cadence-SLAs

| Typ | SLA |
|-----|-----|
| HEARTBEAT nach CLAIM | ≤90s |
| HEARTBEAT während Iteration | ≤2min |
| Stiller Blocker | ≤5min mit `blocked-on=<grund>` |
| COMMIT-Spiegel `#ledge-pi` | ≤60s nach Original |

### Lesedisziplin

- Action-not-Check (nur auf eigene Mentions/AUT-IDs reagieren)
- Selektives Lesen: max 15 Messages, kein 3+ Channels gleichzeitig
- Thread-Drilldown statt History-Sweep
- 5-Min-Wait nach „warte"-Post
- Beleg-Vollständigkeit in Slack/Linear (Vollinhalt, Pi-Pfad nur als Zusatz)

### NEED-Format an @automation-experte

5 Pflicht-Felder, je 1 Zeile:

```
TYP / SCHICHT / AUT-ID / SYMPTOM / ERWARTETER OUTPUT
```

Beispiel:

```
briefing / frontend / AUT-529 / pi-home braucht safe-restart Pattern / Shell-Skript + Verify-Schritte
```

### Pre-CLAIM-Checkliste (alle 4 ja oder NEED statt CLAIM)

1. Linear-Issue komplett gelesen (Titel + Beschreibung + Sub-Issues)
2. Scope passt 1:1 zu eigenem Auftrag
3. Keine offenen TM-Entscheidungs-Blöcke
4. Kein anderer Owner hält Issue oder kollidierende Datei

### Session-Start-Sequenz

1. `online-post` (oder manuell ONLINE)
2. `SYNC @pi-2 "ledge-pi=<ts> linear=<issue-ids>"`
3. Pre-CLAIM-Checkliste → dann CLAIM

### Reactji ACK

`:eyes:` gesehen · `:white_check_mark:` erledigt · `:warning:` Blocker · `:rocket:` ausgeführt

---

## Onboarding-Checkliste

Beim Session-Start `online-post` ausführen. Erwartetes Format:

```
ONLINE @pi-2 ip=192.168.0.2 host=AutoOne44 esp=ESP_698EB4 sensoren=<liste> branch=<X> sha=<short> git=<connected|no-auth>
```

**Beispiel (2026-05-29):**

```
ONLINE @pi-2 ip=192.168.0.2 host=AutoOne44 esp=ESP_698EB4 sensoren=sht31_humidity,sht31_temp,vpd branch=feature/phyta-frontend sha=3cbe6557 git=connected
```

Manuelle Checks nach ONLINE:

- [ ] `docker compose ps` — el-servador, mqtt-broker, el-frontend healthy
- [ ] ESP_698EB4 in DB: GPIO14+25 enabled, Rule `beleuchtung` enabled
- [ ] `#ledge-pi` SYNC/COMMIT-Spiegel aktiv
- [ ] Lokale Konventionsdatei = dieser Stand

---

## Notfall-Pfade

### Logs

| Quelle | Pfad / Befehl |
|--------|---------------|
| Server (Host-Bind) | `/home/robin/autoone/logs/server/god_kaiser.log` |
| Server (Docker) | `docker compose logs -f --tail=100 el-servador` |
| MQTT | `docker compose logs -f --tail=100 mqtt-broker` |
| Frontend | `docker compose logs -f --tail=100 el-frontend` |
| PostgreSQL | Loki `compose_service=postgres` oder `make shell-db` |
| ESP32 Serial | `/home/robin/autoone/El Trabajante/logs/device-monitor-*.log` |
| PIO CLI | `/home/robin/autoone/El Trabajante/.venv-pio/bin/pio` |
| Session-Logs | `/home/robin/autoone/logs/current/` |
| Loki-Query | `/home/robin/autoone/scripts/loki-query.sh` |

### Backups

| Typ | Pfad |
|-----|------|
| DB-Backups (Cron) | `/home/robin/autoone/backups/database/` |
| Manuelles Backup | `make db-backup` → `backups/automationone_*.sql.gz` |
| Restore | `make db-restore FILE=backups/...` |

### Mess-Skripte / Verifikation

| Skript | Pfad |
|--------|------|
| GPIO14 Disconnect-Verify | `/home/robin/autoone/logs/verification/scripts/gpio14-b4-disconnect-verify.sh` |
| AUT-481 Paced Verify | `/home/robin/autoone/scripts/verify/aut-481-paced-verify.sh` |
| Hardware Runtime Gate | `/home/robin/autoone/scripts/hardware/measure_runtime_gate.py` |
| Debug-Session Start | `/home/robin/autoone/scripts/debug/start_session.sh` |

### Health-Checks

```bash
curl -sf http://localhost:8000/api/v1/health/live && echo OK
curl -sf http://localhost:5173 >/dev/null && echo OK
docker compose -f /home/robin/autoone/docker-compose.yml ps el-servador mqtt-broker el-frontend
```

### Container-Restart (autonom)

```bash
safe-restart                    # el-servador mqtt-broker el-frontend
safe-restart el-servador        # einzelner Service
```

---

## Bootstrap-Helfer (~/.local/bin/)

| Skript | Zweck |
|--------|-------|
| `slack-post` | Slack-Nachricht via Bot-Token (channel_id + Text) |
| `online-post` | ONLINE + COMMIT-Spiegel mit Auto-Detect Branch/SHA/ESP |
| `chat-block-vorlage` | MEDIUM Chat-Block-Template für Robin-Freigabe |
| `safe-restart` | Container-Restart mit Pre-/Post-Health + Ledger-Spiegel |

Token-Konfiguration: `~/.config/automationone/slack.env` (optional, sonst `$SLACK_BOT_TOKEN` aus Umgebung).

---

## Quellen

- AUT-455, AUT-529 — Vier-Systeme + Risiko-Stufen
- `.claude/rules/slack-koordination.md` — globale Koordinationsregeln
- `#pi-home` Konventions-Post 2026-05-29 (Slack Canvas-Anker)
- `#ledge-pi` LEDGE-Broadcast 2026-05-29
