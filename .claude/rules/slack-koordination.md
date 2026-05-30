# Slack-Koordination (AutomationOne)

Workspace: automation-one. Kanäle: `#pi-home` (C0B5LJ89161, Pi-2 @pi-2 MEDIUM), `#pi-elbherb` (Pi-1 @pi-1 STRICT), `#dev-local` (C0B70F0TNPK FREE), `#ledge-pi` (C0B6J8PGPTJ) COMMIT-Spiegel ≤60s. Pi-2 Detail: `.claude/slack-konvention-pi-home.md`.

## Nachrichten-Typen

ONLINE, SYNC, CLAIM, STRATEGY, HEARTBEAT (≤90s nach CLAIM, dann ≤2min), OVERLAP, COMMIT, RELEASE, NEED, ACK, STRAND-START, STRAND-READY, STRAND-BARRIER.

## Regeln

- Jeder CLAIM → STRATEGY vor erster Code-Änderung
- Threads pro AUT-ID (BRIEFING-Anker)
- Branch+SHA in ONLINE
- Keine Phantom-Owner-Posts
- Kein History-Sweep (limit=15 + thread replies)
- 2× Heartbeat ohne Update → STOP + NEED + 5min Wait
- Owner-Marker: `@frontend-dev`, `@server-dev` (Text, keine Slack-Handles)
- Keine neuen `#fix-frontend` etc. anlegen

## Reactji ACK

:eyes: gesehen, :white_check_mark: erledigt, :warning: Blocker, :rocket: ausgeführt

## Vier-Systeme

| System | Ort | Owner | Risiko |
|--------|-----|-------|--------|
| 1 Life-Repo | Strategie/Konventionen | `@automation-experte` | — |
| 2 Auto-one-Repo | Code | TM + Subagents (`@server-dev` … als Text-Marker) | — |
| 3a `#pi-elbherb` | Pi-1 growy2, LPAP-Produktion | `@pi-1` | STRICT |
| 3b `#pi-home` | Pi-2 AutoOne44, Cannabis-Indoor | `@pi-2` | MEDIUM |
| 4 `#dev-local` | Robins Win-PC, Docker ohne Hardware | `@dev-local` | FREE |

Slack + Linear = einzige gemeinsame Datenräume. TM-Subagent-Channels (`#fix-server` etc.) existieren nicht — Cross-Layer über Linear-Sub-Issues.

## Risiko-Stufen

- **STRICT** (`#pi-elbherb`): nur Read/Logs/Mess-Skripte autonom; docker-restart, Migration, Reboot, Flash → Chat-Block an Robin
- **MEDIUM** (`#pi-home`): Container-Restart + Config-Reload + Read-Forensik autonom; Schema-Migration, Reboot, Flash → Chat-Block
- **FREE** (`#dev-local`): voll autonom (Recompose, DB-Reset, Migration, Test, Build, Push); wächst auf MEDIUM sobald echte ESPs lokal angeschlossen

## Session-Start (Pflicht)

1. `ONLINE @<handle> ip=… host=… branch=… sha=…` (+ ESP/Stack je nach System)
2. `SYNC @<handle> "ledge-pi=<ts> linear=<ids>"`
3. Pre-CLAIM-Checkliste (4× ja) → dann CLAIM
4. STRATEGY vor erster Code-Änderung; HEARTBEAT ≤90s nach CLAIM, dann ≤2min

## @automation-experte NEED (5 Felder)

TYP / SCHICHT / AUT-ID / SYMPTOM / ERWARTETER OUTPUT — je 1 Zeile. Post in Live-Channel oder `#ledge-pi`.

## Polling

5-Min-Default für Channel-Lesen; 2-Min nur bei Thread-Drilldown. Kein History-Sweep.
