# Slack + Linear Koordination (Auto-one-Repo)

> **Stand:** 2026-05-29 | **Quelle:** AUT-455, AUT-529, `#ledge-pi` Broadcast  
> **Life-Repo-Detail:** `.claude/rules/slack-koordination.md` (falls lesbar)

Workspace **automation-one**. Slack + Linear sind die einzigen gemeinsamen Datenräume zwischen Life-Repo, Auto-one-Repo und Pi-Sessions.

## Vier-Systeme

| System | Ort | Owner-Handle | Risiko |
|--------|-----|--------------|--------|
| 1 | Life-Repo (Strategie) | `@automation-experte` | — |
| 2 | Auto-one-Repo (Code) | TM + `@server-dev` / `@frontend-dev` / `@firmware-dev` / `@db-inspector` (Text-Marker) | — |
| 3a | `#pi-elbherb` — Pi-1 growy2 @ 192.168.178.67 | `@pi-1` | STRICT |
| 3b | `#pi-home` — Pi-2 AutoOne44 @ 192.168.0.2 | `@pi-2` | MEDIUM |
| 4 | `#dev-local` — Robins Win-PC Docker | `@dev-local` | FREE |
| Ledger | `#ledge-pi` (C0B6J8PGPTJ) | alle | COMMIT-Spiegel ≤60s |

**Phantom-Owner-Verbot:** Keine `#fix-server` / `#fix-frontend` / `#fix-firmware` / `#fix-db` Channels — Cross-Layer-Fixes laufen über Linear-Sub-Issues + reale Pi-/Dev-Sessions als Owner.

## Channel-IDs

| Channel | ID |
|---------|-----|
| `#ledge-pi` | C0B6J8PGPTJ |
| `#pi-home` | C0B5LJ89161 |
| `#pi-elbherb` | C0B5HJP66JX |
| `#dev-local` | C0B70F0TNPK |

## Risiko-Stufen

| Stufe | Channel | Autonom erlaubt | Chat-Block an Robin |
|-------|---------|-----------------|---------------------|
| STRICT | `#pi-elbherb` | Read, Logs, Mess-Skripte | docker-restart, apt, Migration, Git-Push, Reboot, Flash |
| MEDIUM | `#pi-home` | Container-Restart, Config-Reload, Read-Forensik | Schema-Migration, Reboot, Firmware-Flash, Image-Update |
| FREE | `#dev-local` | Recompose, DB-Reset, Migration, Test, Build, Push | sobald echte ESPs lokal → MEDIUM bis Freigabe |

## Nachrichten-Typen

`ONLINE`, `SYNC`, `CLAIM`, `STRATEGY`, `HEARTBEAT` (≤90s nach CLAIM, dann ≤2min), `OVERLAP`, `COMMIT`, `RELEASE`, `NEED`, `ACK`, `STRAND-START`, `STRAND-READY`, `STRAND-BARRIER`, `VERIFY-DRIFT`.

## Session-Start (Pflicht)

1. `ONLINE @<handle> … branch=<name> sha=<short> …`
2. `SYNC @<handle> "ledge-pi=<ts> linear=<AUT-ids>"`
3. Pre-CLAIM (4× ja): Linear gelesen · Scope passt · keine TM-Blocker · kein fremder Owner
4. `STRATEGY` vor erster Code-Änderung

## @automation-experte NEED (5 Felder)

```
TYP: recherche | briefing | auftrag | erklärung
SCHICHT: firmware | server | frontend | db | cross-layer
AUT-ID: AUT-### | neu-erforderlich | nicht-anwendbar
SYMPTOM/FRAGE: …
ERWARTETER OUTPUT: …
```

Post in Live-Channel oder `#ledge-pi`. Belege als Vollinhalt in Slack-Thread oder Linear-Comment — Pi-Pfad nur als Re-Run-Zusatz.

## Polling

5-Min-Default; 2-Min nur bei Thread-Drilldown. Kein History-Sweep (`limit=15` + Thread-Replies).

## Cross-Repo (System 2 ↔ Pi)

- COMMIT aus Live-Channels spiegeln nach `#ledge-pi` ≤60s
- TM-Subagent „ready“ → Linear-Comment, nicht Slack-Post
- Multi-Strang: `STRAND-START` / `STRAND-READY` / `STRAND-BARRIER` in `#ledge-pi`
