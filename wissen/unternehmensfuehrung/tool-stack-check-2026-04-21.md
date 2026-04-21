# Tool-Stack-Check — 2026-04-21

> **Linear:** AUT-105 — S1-G4
> **Deadline:** 2026-04-21 (Di) — vorbereitend zum Christoph-Termin
> **Scope:** Einmaliges Aufraeumen des Tool-Stacks, damit nichts durch die Maschen faellt
> **Owner:** Robin (Setup-Review) + `web-experte` (Integrations-Check)

**Wichtiger Hinweis zur Ausfuehrung:** Dieser Check wurde am 21.04. vormittag aus der Cowork-Sandbox erstellt. Die Sandbox hat Zugriff auf das Auto-one-Repo (Branch `auto-debugger/work`), **nicht** aber auf das Life-Repo (`C:\...\life-management`), wo die Pflichtlektuere liegt (`.claude/rules/trello-integration.md`, `.claude/rules/arbeitsweise.md`, `docs/mcp-lokale-konfiguration.md`). Robin muss die Empfehlungen dieses Dokuments gegen die Life-Repo-Regeln manuell abgleichen.

Das Fragezeichen hinter einzelnen Zeilen bedeutet: aus der Sandbox nicht pruefbar, Robin-Input noetig.

---

## 1. Claude-Kopplung (Desktop + MCPs)

### 1.1 MCP-Konfigurationen im Auto-one-Repo

| Datei | Inhalt | Ergebnis |
|-------|--------|----------|
| `.mcp.json` | `linear`, `sentry`, `wokwi` | existiert, valide JSON |
| `.cursor/mcp.json` | — | **existiert NICHT**. Im `.cursor/`-Verzeichnis liegen nur `BUGBOT.md` und `rules/` (api, backend, docker, firmware, frontend, general, mqtt, testing) |
| `.cursor/rules/*.mdc` | 9 Dateien (Cursor-Projektregeln) | vorhanden — sollte mit `.claude/rules/*.md` gespiegelt sein (Check offen) |

**Diff-Befund:** `.mcp.json` vs. `.cursor/mcp.json` laesst sich nicht vergleichen — die Cursor-Variante fehlt. Das widerspricht der Erwartung aus AUT-105 ("gespiegelt?"). Mogliche Ursachen:
- Cursor wird fuer Auto-one nicht mehr genutzt (Claude Code / Cowork haben Cursor abgeloest)
- Datei wurde geloescht und nicht neu angelegt
- Lokale Cursor-MCP-Konfig liegt ausserhalb des Repos (zentrale Cursor-Settings)

**Empfehlung:**

1. Entweder `.cursor/mcp.json` entfernt endgueltig (Regel anpassen, Zeile "gespiegelt" aus AUT-105 streichen) oder
2. Eine gespiegelte Version anlegen (wenn Cursor weiter eingesetzt wird). Vorschlag: Single-Source-of-Truth in `.mcp.json`, Cursor-Variante per Script/Symlink ableiten.

> Entscheidung von Robin gewuenscht. Bis dahin: **`.mcp.json` ist die alleinige Source of Truth im Auto-one-Repo.**

### 1.2 MCP-Probe aus der Cowork-Sandbox

| Server | Zweck | Probe | Status | Probe-Ergebnis |
|--------|-------|-------|--------|----------------|
| Linear (`mcp.linear.app/mcp`) | Sprint-Steuerung, Issues, Projects | `list_teams`, `list_projects`, `get_issue AUT-102/103/105` | OK | 1 Team `AutoOne`, 7+ Projects; AUT-102/103/105 voll geladen |
| Trello | Elbherb + Management-Board (lesen) | `list_boards` | **nicht in Cowork-Sandbox verfuegbar** | kein Trello-MCP in der deferred-Tool-Liste |
| Google Calendar | Lesen von Kalender-Eintraegen | `list_calendars` | **nicht verbunden** | nur `authenticate` + `complete_authentication` sichtbar — Auth-Flow nicht abgeschlossen in Cowork |
| Gmail | Lesen | list-Operation | **nicht verbunden** | wie Google Calendar |
| Zotero | Literaturdatenbank | `search` | **nicht in Cowork-Sandbox verfuegbar** | kein Zotero-MCP in der deferred-Tool-Liste |
| Sentry (Auto-one `.mcp.json`) | Error-Monitoring | — | nur Claude-Code-Kopplung (Auto-one-Repo), nicht Cowork | Definiert in `.mcp.json`, kein Cowork-Endpoint |
| Wokwi (Auto-one `.mcp.json`) | ESP32-Simulator | — | nur Claude-Code-Kopplung, benoetigt `WOKWI_CLI_TOKEN` | Env-Var muss gesetzt sein |

**Fazit Claude-Kopplung:**

- Aus **Cowork** (also aus der Chat-Umgebung in der Robin diesen Auftrag gibt) ist **nur Linear zuverlaessig lese- und schreibfaehig**.
- Google Workspace (Calendar, Gmail) ist in Cowork sichtbar, aber nicht authentifiziert.
- Trello und Zotero sind in Cowork **nicht** verfuegbar — sie laufen ueber Claude Desktop auf Robins Windows 11 PC (anderer MCP-Container).
- Sentry + Wokwi sind nur fuer Claude Code im Auto-one-Repo eingerichtet (nicht fuer Cowork).

> **Robin-Aktion (manuell, heute 21.04.):** in Claude Desktop auf Windows 11 fuer jeden MCP einmal eine List-/Search-Operation ausfuehren und Ergebnis notieren. Diese Pruefung kann Cowork nicht ersetzen.

### 1.3 Checkliste fuer Robins lokalen Claude-Desktop-Test (Windows 11 Dresden)

- [ ] Claude Desktop laeuft, zeigt Cowork + alle Connectors
- [ ] Linear: "zeig mir AUT-102" -> gibt die Issue zurueck
- [ ] Trello: "liste Boards" -> zeigt `Elbherb - Planung 2026` und (falls schon) das Management-Board
- [ ] Zotero: "suche nach 'Automation' in meiner Bibliothek" -> liefert Treffer oder leere Liste ohne Fehler
- [ ] Google Calendar: "liste Kalender" -> `robin.herbig@googlemail.com` als Haupt-Kalender
- [ ] Platzhalter im `.mcp.json` / Claude-Config aufgeloest (keine `${VAR}` ohne Env-Setting)

---

## 2. Jamie.ai Inventar

### 2.1 Gefundene Jamie-Referenzen (Auto-one-Repo-Sandbox)

Suchergebnis (grep `jamie|Jamie` im Auto-one-Repo): **keine Treffer**. Jamie-Links scheinen im Life-Repo zu liegen (docs/, Trello-Karten), nicht im Auto-one-Repo.

### 2.2 Erwartete Jamie-Quellen (laut AUT-105)

| Quelle | Annahme | Pruefung fuer Robin |
|--------|--------|---------------------|
| Life-Repo `docs/` (oder `wissen/`) | Jamie-Transkripte/Summaries abgelegt | Pfadliste erstellen |
| Trello-Karten (`Elbherb - Planung 2026` + Management) | Jamie-Links in Beschreibungen/Kommentaren | manuell durchsehen |
| E-Mail (Jamie-Benachrichtigungen) | Jamie-Mails archivieren | Inbox-Review |
| Jamie-Web-Dashboard | alle Meetings der letzten 4 Wochen | Export als Liste |

### 2.3 Meeting-Summary 2026-04-20 (Robin + Christoph)

- Thema: Sprint S1 Kickoff (auf Basis dessen wurden AUT-102/103/105 angelegt)
- Jamie-Link: **unbekannt** (aus Cowork-Sandbox nicht auffindbar)
- Vorschlag Ablage (wenn noch nicht): `life/meetings/2026-04-20-robin-christoph-sprint-s1-kickoff.md` mit Jamie-URL oben + Kurzzusammenfassung und verlinkten Linear-Issues (AUT-102, AUT-103, AUT-105, weitere Sprint-1-Issues)
- Regel fuer kuenftige Meetings: **Jamie-Link immer als erste Zeile**, darunter 3-5 Stichpunkte Zusammenfassung, darunter Linear-Issues/Trello-Karten/Entscheidungen

### 2.4 Offene Fragen Jamie

1. Ist Jamie.ai per MCP angebunden oder nur Web/E-Mail? (Kein MCP sichtbar.)
2. Gibt es einen Auto-Ablage-Workflow (Jamie -> Webhook -> Repo-Commit)? Wenn nein: vorschlagen, aber vorerst manuell ablegen.
3. Soll es eine zentrale `jamie-inventar.md` im Life-Repo geben? (Empfohlen: ja, in `wissen/unternehmensfuehrung/`.)

---

## 3. Trello-Boards pruefen (nur LESEN)

### 3.1 "Elbherb - Planung 2026"

- **Board-ID:** `67433180dfb3902a4868b593` (aus AUT-105-Beschreibung)
- **Status Probe aus Cowork:** nicht pruefbar (kein Trello-MCP in Cowork). Robin muss aus Claude Desktop (Windows 11) testen.
- **Soll-Check (manuell):**
  - Karten seit letztem Sync (Datum des letzten Sync bitte in `.claude/rules/trello-integration.md` nachschlagen)
  - Offene Checklisten vs. Life-Repo-STATUS.md
  - Welche Karten entsprechen welchem Linear-Sprint-1-Issue? (Mapping-Tabelle)

### 3.2 Management-Trello-Board (neu von Christoph)

**Status:** Board-URL und ID **noch nicht bekannt** — Robin muss bei Christoph erfragen.

**Soll-Check (nach Bereitstellung):**
- URL und Board-ID dokumentieren
- Wer schreibt (Robin, Christoph, beide)?
- Wer liest (Nur Robin + Christoph, oder auch Kunden)?
- Welche Listen existieren (Status-Konvention)?

### 3.3 Vorschlag: Diff fuer `.claude/rules/trello-integration.md` (Life-Repo)

> Der folgende Abschnitt ist ein **Vorschlag**, kein Auto-Edit. Er gehoert ins Life-Repo — Cowork hat hier keinen direkten Zugriff. Robin prueft und mergt manuell.

```markdown
## Boards (Stand 2026-04-21)

| Board | ID | URL | Rolle | Lese-Zugriff via MCP | Schreib-Zugriff |
|-------|----|-----|-------|----------------------|-----------------|
| Elbherb - Planung 2026 | 67433180dfb3902a4868b593 | https://trello.com/b/<slug> | operative Tagesarbeit Elbherb | ja | nur auf Robin-Triggern, nie autonom |
| Management (Christoph) | TBD — bei Christoph erfragen | TBD | Unternehmensfuehrung, Quartals-/Monatssteuerung | ja (read-only) | **nie autonom**, nie ohne Robin-Freigabe, keine Karten erzeugen |

**Workflow-Regel:**
- Jedes neue Management-Board-Card-Lese-Ergebnis muss in `wissen/unternehmensfuehrung/` abgelegt werden, wenn es eine bleibende Entscheidung enthaelt
- Kein Cross-Posting zwischen Elbherb- und Management-Board
```

> **Robin-Aktion:** Management-Board-ID von Christoph holen, obiges Snippet in `.claude/rules/trello-integration.md` des Life-Repos einfuegen und committen.

---

## 4. Linear <-> Trello <-> Repo Verantwortungs-Matrix

| System | Zustaendigkeit (Source of Truth) | Was gehoert hierher | Was NICHT hierher |
|--------|-------------------------------|---------------------|------------------|
| **Linear** | Sprint-Steuerung, 6-Wochen-Micromanagement, Projekt-Prioritaeten, Akzeptanzkriterien | Alle Sprint-1-Issues (AUT-*) mit Deadline, Owner, DoD; Abhaengigkeiten; Cycle-Management | operative Tages-To-Dos (Checklisten ohne DoD, Ad-hoc-Besorgungen) |
| **Trello — Elbherb** | operative Tagesarbeit Elbherb | Wochenkarten, Aufgaben-Checklisten, Kundenkontakte, Lead-Status | langfristige Sprint-Planung, Projekt-Entscheidungen |
| **Trello — Management** | Unternehmensfuehrung Robin/Christoph | Quartals-Themen, Meeting-Agenda, personale Fragen | technische Fehler (gehoeren in Linear als Issue) |
| **Life-Repo** | Wissen, Architektur, STATUS, MANIFEST, Regeln | `architektur-uebersicht.md`, Meeting-Summaries, Sprint-Protokolle, Tool-Dokus | Kurzfristige To-Dos (Trello), Sprint-Akzeptanzkriterien (Linear) |
| **Auto-one-Repo** | AutomationOne Code, Incidents, auto-debugger-Steuerdateien | Code, verify-plan-Reports, Reports unter `.claude/reports/`, Agents | Sprint-Steuerung, Life-Themen, Meeting-Notizen (gehoeren ins Life-Repo) |

### 4.1 Entdeckte Redundanzen (aus diesem Check)

1. **STATUS.md AutomationOne** lebt im Life-Repo, die Versions-Info aber im Auto-one-Repo (firmware_version.h, pyproject.toml, package.json). -> Dopplungsrisiko. Empfehlung: `STATUS.md` referenziert die Auto-one-Repo-Quellen, schreibt keine Versionen doppelt.
2. **Sprint-Akzeptanzkriterien** in Linear + Trello-Karten gleichzeitig. -> Risiko ungesynct. Empfehlung: Linear ist DoD-Source, Trello nur Arbeits-Checkliste (kurzlebig, nicht archivieren).
3. **TECHNICAL_MANAGER.md** im Auto-one-Repo `.technical-manager/` verlaeuft parallel zu Sprint-Steuerung im Life-Repo. -> funktional getrennt (Technical Manager = technische Incidents/INC-EA5484, Sprint-Steuerung = Life-breit). Empfehlung: an beiden Stellen einen wechselseitigen Pointer setzen.

### 4.2 Empfehlung was rausfliegt

- Keine Checklisten im Linear-Issue-Body anlegen, wenn dieselbe Checkliste in Trello schon existiert (Statusdrift!). Entweder Linear-Body halten und Trello loeschen, oder umgekehrt — aber nicht beide.
- Cursor-Rules (`.cursor/rules/*.mdc`) sollten entweder mit `.claude/rules/*.md` auto-gespiegelt werden oder stillgelegt (wenn Cursor nicht mehr aktiv). Momentan existieren beide Dateibaeume — Verwirrungspotenzial.

---

## 5. Google Calendar Audit (nur LESEN)

### 5.1 Status aus Cowork

- Google-Workspace-MCP: **nicht authentifiziert** (nur `authenticate` + `complete_authentication` in Cowork sichtbar).
- `list_calendars` konnte daher nicht ausgefuehrt werden.
- Schreibzugriff bleibt per Regel verboten — gut so, keine Aenderung dieser Regel vorgesehen.

### 5.2 Soll-Pruefung durch Robin (lokales Claude Desktop)

- [ ] **Hauptkalender** bestaetigen: `robin.herbig@googlemail.com`
- [ ] Nebenkalender auflisten (Name + Zweck). Duplikate (z.B. zwei "Elbherb"-Kalender) hier als Notiz markieren — Loeschung **nicht** durch MCP/Claude, sondern manuell durch Robin.
- [ ] Sprint-Deadlines aus Linear: sind sie im Kalender? Wenn nein, ob Robin manuell uebertragen will oder nicht (beide Varianten sind ok, nur Klarheit ist wichtig).
- [ ] Christoph-Termine (Daily / Weekly Deep Dive): korrekt im Hauptkalender?

### 5.3 Regel

- Schreiben nach Google Calendar **nur auf expliziten Befehl von Robin**. Dieser Check setzt die Regel nicht aus.

---

## 6. Offene Fragen / Next Actions fuer Robin

1. **Management-Trello-Board-ID/URL** — bei Christoph erfragen (am liebsten heute, damit der Eintrag in `.claude/rules/trello-integration.md` vor dem Christoph-Termin steht).
2. **`.cursor/mcp.json`-Strategie** — abschaffen oder spiegeln? Eine einmalige Entscheidung.
3. **Jamie-Ablage-Konvention** — soll ich (Claude) einen Vorschlag fuer `life/meetings/`-Template schreiben? Nur auf Trigger.
4. **Google-Calendar-Audit** — selbst machen oder auf Robin delegieren? Meine Empfehlung: Robin, weil Schreibzugriff ohnehin bei ihm bleibt.
5. **Kalender-Erinnerung fuer VPN-Key-Rotation** (siehe AUT-103): 2026-10-27 in Kalender? Benoetigt Schreibzugriff — Robin muss triggern.

---

## 7. Ergebnis kompakt

| Baustein | Status heute (21.04.) |
|----------|----------------------|
| Claude-Kopplung (Cowork) | Linear OK, Google/Gmail nicht verbunden, Trello/Zotero nicht in Cowork verfuegbar |
| Claude-Kopplung (Desktop Win11) | **offen — Robin prueft lokal** |
| Jamie-Inventar | Struktur steht, konkrete Links fehlen (Robin) |
| Trello Elbherb-Board | Pruefung delegiert an lokalen Desktop (Claude auf Win11) |
| Management-Trello-Board | URL/ID fehlt (Christoph) |
| Linear/Trello/Repo-Matrix | Entwurf in Abschnitt 4 — bereit zum Uebernehmen |
| Google-Calendar-Audit | delegiert an Robin |
| `.cursor/mcp.json` | existiert nicht — Entscheidung noetig |
