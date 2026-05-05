---
run_mode: artefact_improvement
incident_id: ""
run_id: problemcluster-obs-2026-04-09
order: incident_first
target_docs:
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
  - docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md
scope: |
  Artefakt-Modus: Problemcluster Orchestrierung / Observability / Alert-Pfade / E2E-Verträge in den
  target_docs und in Router-Texten evidenzbasiert schärfen (additive Abschnitte, Tabellen, P0/P1,
  Evidence-Zeilen). Router- und Agent-Doku mit denselben Regeln abgleichen. Spezialisten-Fachlogik
  nicht duplizieren; bei Bedarf TASK-PACKAGES und SPECIALIST-PROMPTS erzeugen — Code-Umsetzung aus
  Paketen erst nach /verify-plan und VERIFY-PLAN-REPORT.md.
forbidden: |
  Keine Secrets; keine erfundenen Logzeilen oder Produktionsdaten.
  Keine Breaking Changes an REST/MQTT/WS/DB-Schema ohne separates Gate und Migrationsplan.
  Orchestrierte und delegierte Code-Änderungen nur auf Branch auto-debugger/work (Abzweigung von master).
  Kein git push, kein force-push, kein Force-Merge/Rebase durch dich; Bash nur für eingeschränktes Git:
  git branch --show-current, git status, git checkout auto-debugger/work wenn sauber, read-only git log/diff.
  Kein git reset --hard auf geteilten Branch ohne explizites menschliches Gate.
done_criteria: |
  Problemcluster A–D (siehe Runbook unten) im IST- und/oder Konzept-Dokument benannt und zugeordnet
  (Tabelle oder nummerierte Liste), ohne stille Auslassungen.
  Trennung NotificationRouter/DB-Inbox vs. WebSocket error_event mindestens ein Absatz plus Debugging-Konsequenz.
  Warnung vor semantischer Vermischung von HTTP-request_id und MQTT-synthetischer CID explizit.
  Router- und Agent-Texte widersprechen nicht: Steuerdatei-Pflicht, Branch auto-debugger/work, Bash-Grenzen, kein Push.
  Vor jedem Commit: git branch --show-current = auto-debugger/work. Abschluss: Änderungsliste (Pfade) + Abnahme-Check gegen diese Kriterien.
---

# Steuerlauf — auto-debugger

**Norm:** Diese Datei ist die alleinige Steuerquelle für den Lauf. Freitext-Chat nur zur Klärung blockierender Fragen — strukturierte Arbeit nur gemäß Frontmatter und folgendem Runbook.

Du bist der Orchestrator-Agent **`auto-debugger`** in diesem Repository. Alle folgenden Imperative gelten für dich als Ausführenden: zuerst Branch prüfen, nur repo-relative Pfade verwenden, Evidence dokumentieren.

## Runbook — Problemcluster (inhaltlich vollständig)

### A) Orchestrierung und Analyse-Artefakte

- Dedizierter Orchestrator soll **IST-/Analyse-Markdown** parallel zu anderen Arbeiten **evidenzbasiert** verbessern — **wiederverwendbar** über Observability hinaus.
- Strukturierte Läufe über **Steuerdatei** (dieses Format); Scope, Verbote und Abnahme sind im Frontmatter fixiert.
- Abgrenzung: reiner **Querschnitt zwischen mehreren Berichten** = Aufgabe eines Meta-Analysten; du fährst hier die **Pflichtsequenz** IST verifizieren → Lücken → additive Doku → ggf. Pakete → Verify, **ohne** Spezialisten-Implementierungslogik zu kopieren.

### B) Observability, Korrelation, E2E-Verträge

- **ID-Semantik:** `request_id` und ähnliche Felder können HTTP und **synthetische MQTT-Correlation-IDs** abdecken — **nicht** blind in einem Cluster zusammenfassen.
- **Zwei Ketten:** persistierte ISA-18.2-Notifications (Router, DB) vs. **Echtzeit-`error_event`** über WebSocket **ohne** denselben Router — Verwechslung vermeiden (Inbox vs. Error-Stream).
- **Finalität UI:** Server kann klare Zustände liefern; Client **Ack/Resolve** darf bei Fehlschlag **nicht** wie Erfolg wirken (`accepted → pending → terminal` mit u. a. failed/timeout/partial).
- **Vertragliche UI-Ausführung:** benannte Flows (z. B. Playwright), stabile Selektoren (`data-testid`); kein Ersatz durch beliebiges UI-Herumklicken für Agenten/CI.
- **Firmware:** Error-/Alert-Pfade timing- und hardwareabhängig; Simulation allein reicht nicht für sicherheitsrelevante Firmware-Abnahme — nur Checklisten/BLOCKER verweisen, nicht „verifiziert“ erfinden.

### C) Prozess und Qualitätstor

- Aus `TASK-PACKAGES.md` abgeleitete **Implementierung** erst nach **`/verify-plan`** und **`VERIFY-PLAN-REPORT.md`**.
- **SPECIALIST-PROMPTS:** jeder Block enthält einen **Git-Pflichtabschnitt** (Branch auto-debugger/work verifizieren; kein Push/Force; bei falscher Branch nur checkout auto-debugger/work nach Prüfung).
- **TASK-PACKAGES:** jedes **Code**-Paket mit messbarem **Git-Akzeptanzkriterium** (z. B. alle Änderungen des Pakets auf auto-debugger/work).

### D) Dokumentation und Router

- Konzept/Roadmap (Flow-API, Alert-Center) **canonical** unter `docs/analysen/`; fachlich **getrennt** von der schlichten Agent-/Skill-Einführung, aber konsistent verlinkt.
- Router und Hilfsdokumentation müssen **Steuerdatei-Pflicht**, **Branch**, **Bash-Grenzen** widerspiegeln.

## Eingebetteter Fachkontext (verbindlich für Formulierungen in target_docs)

**Clustering-Reihenfolge:** (1) Notification-Felder `correlation_id`, `fingerprint`, `parent_notification_id` — (2) HTTP-Request-ID — (3) `esp_id` + Zeitfenster — (4) MQTT-synthetische CID — (5) Titel/Dedup-Key zuletzt.

**Flow-API-Zielbild:** Playwright-Szenarien als vertragliche UI-Ausführung; interne Dev-API nur mit harten Gates, nicht als Ersatz für messbare DOM-Flows.

## Pflichtlektüre (lesen, dann ggf. anpassen)

| Pfad | Zweck |
|------|--------|
| `docs/analysen/IST-observability-correlation-contracts-2026-04-09.md` | IST: Lücken A–D schließen oder P0/P1 markieren |
| `docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md` | Konzept: Roadmap vs. Agent-Einführung, Querverweise |
| `.claude/CLAUDE.md` | Orchestrator-Abschnitt |
| `AGENTS.md` | Kurzverweis inkl. Branch |
| `.claude/reference/testing/agent_profiles.md` | Profil auto-debugger |
| `.claude/agents/auto-debugger.md` | Agent-Text |
| `.claude/skills/auto-debugger/SKILL.md` | Steuerdatei, Gate |
| `.claude/auftraege/auto-debugger/STEUER-VORLAGE.md` | Feldnormen |
| `.claude/agents/Readme.md` | Konsistenz |
| `.claude/commands/README.md` | Command-Doku |

Fehlende Datei = **BLOCKER** mit exaktem Pfad und empfohlener Aktion; nichts erfinden.

## Arbeitsschritte

1. Branch prüfen; falls nötig und sicher `git checkout auto-debugger/work`.
2. Pflichtlektüre und `target_docs` mit Read/Grep/Glob gegen Code/Docs abgleichen (Evidence).
3. Lückenliste zu A–D; dann **additive** Markdown-Ergänzungen in `target_docs` und konsistente Anpassungen in Router-Dateien (nur im Scope).
4. Wenn Code-/Router-Folgearbeit empfohlen: `TASK-PACKAGES.md` und `SPECIALIST-PROMPTS.md` unter `.claude/reports/current/auto-debugger-runs/problemcluster-obs-2026-04-09/` anlegen — jedes Code-Paket mit Git-AK; jeder Prompt mit Git-Pflichtblock. **Keine** Code-Umsetzung aus Paketen ohne vorheriges `/verify-plan`.
5. Abschluss: **Änderungsliste** (alle geänderten Repo-Pfade) und **Abnahme-Check** Punkt für Punkt gegen `done_criteria` im Frontmatter.

## Nicht-Ziele (Wiederholung aus Pflicht)

Keine API-/MQTT-/WS-/DB-Vertragsbrüche ohne Gate. Keine Firmware-„verifiziert“-Behauptung nur aus Simulation bei hardwarekritischen Pfaden.
