# Slack + Linear Konventionen — AutomationOne Vier-Systeme-Modell

> Stand: 2026-05-29 — selbsttragende Referenz für alle Auto-one-Sessions (kein Life-Repo-Zugriff nötig)

---

## 1. Vier-Systeme-Modell

| System | Ort | Wer schreibt | Risiko |
|---|---|---|---|
| 1. Life-Repo | Robins PC, Strategie/Konventionen | @automation-experte + Robin | n/a |
| 2. Auto-one-Repo | dieses Repo (Code) | TM + TM-Subagents | n/a |
| 3a. Pi-Live pi-elbherb | growy2 @ 192.168.178.67 (FritzBox-LAN; früher fälschlich .0.211), LPAP-Produktion | @pi-1-Session | STRICT |
| 3b. Pi-Live pi-home | AutoOne44 @ 192.168.0.2, Robin daheim Cannabis-Indoor | @pi-2-Session | MEDIUM |
| 4. Dev-Local | Robins Win-PC, Auto-one-Stack in Docker, keine Hardware | @dev-local-Session | FREE |

Slack + Linear sind die einzigen gemeinsamen Datenräume zwischen allen Systemen.
TM und TM-Subagents haben KEINEN Zugriff auf Life-Repo (System 1) oder Pi-Filesysteme (3a/3b).

---

## 2. Slack-Channel-Inventar

Workspace: `automation-one`, Team: `T0ASYEG8MEH`, Bot @AutoOne: `U0B58HGTM47`

| Channel-ID | Name (2026-05-29) | Zweck | Risiko |
|---|---|---|---|
| `C0B6J8PGPTJ` | #ledge-pi | Projekt-Ledger aller Sessions, COMMIT-Spiegel, Cross-System-Hand-offs | n/a |
| `C0B5HJP66JX` | #pi-elbherb (ex #fix-pi-3) | @pi-1-Live-Channel, Produktion LPAP | STRICT |
| `C0B5LJ89161` | #pi-home (ex #fix-pi-2) | @pi-2-Live-Channel, Heim Cannabis | MEDIUM |
| `C0B70F0TNPK` | #dev-local (neu 2026-05-29) | @dev-local-Live-Channel, lokaler Stack | FREE |

**Wichtig:** Channel-IDs bleiben bei Umbenennungen unverändert — immer über `channel_id` adressieren, nicht über Slugs/Namen.

Die geplanten Subagent-Channels (#fix-server / #fix-frontend / #fix-firmware / #fix-db) existieren im Workspace **noch nicht**. Bis diese angelegt sind: Cross-Layer-Fixes laufen über Linear-Sub-Issues + Pi-Sessions als faktische Owner.

---

## 3. Risiko-Stufen-Disziplin

| Stufe | Autonom erlaubt | Pflicht-Chat-Block an Robin |
|---|---|---|
| STRICT (pi-elbherb) | Read, Logs, DB-Queries, Mess-Skripte | docker-restart, apt, Schema-Migration, Git-Push, Reboot, Firmware-Flash |
| MEDIUM (pi-home) | Read + Container-Restart + Config-Reload | Schema-Migration, Reboot, Firmware-Flash, Image-Update |
| FREE (dev-local) | alles autonom | nichts (außer wenn Hardware angeschlossen wird → wächst auf MEDIUM) |

---

## 4. @automation-experte — Wer er ist und wie ihr ihn erreicht

**Wer er ist:** Robins technischer AutomationOne-Spezialist im Life-Repo (System 1). Einziger Life-Repo-Agent mit Linear-Schreibzugriff für AUT-*. Dirigent, nicht Coder. Hat **keinen** Zugriff auf dieses Repo oder Pi/Dev-Filesysteme.

**Was er liefert:**
1. RECHERCHE — 4-6-Satz-Synthese aus Wissensbasis/C-Hubs/Zotero/Web
2. BRIEFING — Hypothesen + Reihenfolge + Datei-Verweise + AUT-ID + Verify-Plan
3. AUFTRAG — Linear-Parent AUT-* + Sub-Issues mit Schicht-Zuweisung
4. ERKLÄRUNG — Kontext, kein Code

**Wie ihr ihn erreicht:**
- Slack: Post in `#ledge-pi` (C0B6J8PGPTJ) mit `@automation-experte NEED <typ>: <inhalt>`
- Alternativ: im jeweiligen Live-Channel des aktiven Pi/Dev
- Linear: Comment am AUT-Issue mit `@automation-experte` + konkrete Frage

---

## 5. NEED-Format (5 Pflichtfelder — sonst fragt er zurück)

```
@automation-experte NEED <TYP>:
TYP: recherche | briefing | auftrag | erklärung
SCHICHT: firmware | server | frontend | db | cross-layer
AUT-ID: vorhanden (AUT-###) | neu-erforderlich | nicht-anwendbar
SYMPTOM/FRAGE: 1-3 Sätze konkret
ERWARTETER OUTPUT: was muss bei dir ankommen damit du loslegen kannst
```

**Verify-Plan-Gate als Autonomie-Trennlinie:** Vor Gate führt @automation-experte eng. Ab `verify-plan=pass` arbeitet TM autonom bis DONE/RELEASE — keine Mikro-Sync-Heartbeats dazwischen.

---

## 6. Action-not-Check + Polling-Schwellen

**Drei States:** IN PROGRESS / DONE / BLOCKED-mit-NEED — kein "ich prüfe ob X" als State.

**Polling-Schwellen:**
- ≥ 2 "kein Post / warte"-Heartbeats → Stop + konkretes NEED
- ≥ 3 "kein Post / warte"-Heartbeats → Auftrag wird neu zugewiesen

---

## 7. Pattern-First-Regel

Wenn du was implementierst: prüfe ZUERST ob im Code schon eine kanonische Stelle existiert.

**AUT-210-Regel:** "bestehende Stelle als kanonisch erklären, nie neue Funktion erfinden"

Unklar ob eine Stelle existiert? → NEED-Recherche an @automation-experte.

---

## 8. Slack-Polling-Empfehlung

- **Default: 5-Min-Tick** (stabil, Token-Budget-freundlich — jeder Channel-History-Sweep ~80kB)
- **2-Min-Tick:** nur bei aktiver Iteration UND nur via Thread-Drilldown (`slack_get_thread_replies` auf konkrete AUT-ID), nicht via Channel-History
- **Socket Mode** ist für unsere Architektur nicht anwendbar — wir sind Agent-Polling-basiert, nicht persistent-Daemon
- Rate-Limits sind nicht das Problem (wir sind Tier 3 Custom App, 50+/min erlaubt)

---

## 9. VERIFY-DRIFT-Format (für Track-C-Befunde aus diesem Repo)

Wenn Memory-Claims von @automation-experte nicht mehr mit dem Code übereinstimmen:

```
@automation-experte NEED recherche:
VERIFY-DRIFT memory-claim=<X> code-stand=<Y> file:line=<Z>
```

Post in #ledge-pi (C0B6J8PGPTJ).
