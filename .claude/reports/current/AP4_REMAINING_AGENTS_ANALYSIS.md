# AP4 – Bestandsaufnahme: Docs-, Git- und Test-Agenten

> **Erstellt:** 2026-02-09
> **Erstellt von:** agent-manager
> **Zweck:** Vollständiger IST-Zustand der 6 verbleibenden Agenten/Skills
> **Typ:** Reine Analyse – keine SOLL-Definition, keine Änderungsvorschläge

---

## 1. collect-reports

### A) Dateien

| Typ | Pfad | Existiert |
|-----|------|-----------|
| Agent-Datei | — | **NEIN** (kein Agent) |
| Skill | `.claude/skills/collect-reports/SKILL.md` | Ja |

**Fazit:** Reiner Skill, kein Agent. Wird von Robin manuell via `/collect-reports` aufgerufen.

### B) IST-Zustand

**Frontmatter:**
```yaml
name: collect-reports
description: Report-Konsolidierer für AutomationOne. Verwenden bei: "Reports sammeln"...
allowed-tools: Read, Glob, Write
user-invocable: true
```
- Kein `model` definiert (erbt Default)
- Kein `context` definiert (Default: inline)
- Kein `disable-model-invocation` (Default: false – kann also auch automatisch getriggert werden)

**Rolle:** Konsolidiert alle Reports aus `.claude/reports/current/` in eine einzelne Datei für den Technical Manager.

**Arbeitsweise:**
1. Glob: Alle `.md` in `reports/current/` finden (CONSOLIDATED_REPORT.md ausschließen)
2. Read: Jede gefundene Datei vollständig lesen
3. Analyse: Probleme extrahieren (KRITISCH/WARNUNG/INFO anhand von Markern)
4. Write: CONSOLIDATED_REPORT.md erstellen mit Header, Tabelle, vollständigem Inhalt, priorisierter Problemliste

**Referenzen:** Keine externen Referenzen. Liest nur die Reports selbst.

**Andere Agenten:** Keine Verweise auf andere Agenten. Kennt seine Position im TM-Workflow nicht explizit.

**Output:** `.claude/reports/current/CONSOLIDATED_REPORT.md`

**Trigger:** Manuell durch Robin (`/collect-reports`). Im TM-Workflow: Nach allen Debug-Agent-Reports, vor Übergabe an TM.

### C) 7-Prinzipien-Check

| # | Prinzip | Status | Befund |
|---|---------|--------|--------|
| P1 | Kontexterkennung | **Fehlt** | Kein Modi-System. Macht immer dasselbe: Reports sammeln. Kein Unterschied ob 2 oder 20 Reports vorliegen, ob es eine Quick-Session oder Full-Debug-Session ist. |
| P2 | Eigenständigkeit | **Erfüllt** | Braucht keinen Input außer den Reports selbst. Funktioniert ohne SESSION_BRIEFING oder STATUS.md. |
| P3 | Erweitern statt delegieren | **Fehlt** | Kein Extended Check. Wenn z.B. Reports widersprüchlich sind oder Lücken haben (z.B. esp32-debug Report fehlt aber Server-Log zeigt ESP-Kommunikationsfehler), wird das nicht bemerkt. |
| P4 | Erst verstehen, dann handeln | **Teilweise** | Liest alle Reports bevor er schreibt, aber keine Analyse-Phase die den Kontext versteht. Extrahiert nur Marker-basiert. |
| P5 | Fokussiert aber vollständig | **Teilweise** | Vollständig in der Report-Sammlung. Aber: Die priorisierte Problemliste ist rein Marker-basiert (Textsuche nach "KRITISCH", "ERROR" etc.), nicht inhaltlich. |
| P6 | Nachvollziehbare Ergebnisse | **Erfüllt** | Report-Format mit Timestamp, Branch, Tabelle, vollständigem Inhalt, Problemliste. Klarer Output-Pfad. |
| P7 | Querreferenzen | **Fehlt** | Kennt meta-analyst nicht (der seine Outputs weiterverarbeitet). Kennt den TM-Workflow nicht explizit. Keine Empfehlung wer als nächstes aktiviert werden sollte. |

### D) Besonderheiten

- **Einzigartigkeit:** Einziger Skill der Reports aggregiert. Kein anderer Skill macht das.
- **Überschneidung mit meta-analyst:** meta-analyst analysiert dieselben Reports inhaltlich. collect-reports sammelt sie nur. Aber: Die "Priorisierte Problemliste" in collect-reports IST bereits eine Analyse-Leistung – hier gibt es eine Überschneidung.
- **Agent vs. Skill:** Reiner Skill ergibt Sinn. Die Aufgabe ist deterministisch und braucht keinen eigenen Kontext.
- **Abhängigkeiten:** Abhängig davon, dass Debug-Agents vorher gelaufen sind und Reports geschrieben haben. Weiß aber nicht WELCHE Reports es erwarten sollte.

### E) Offene Fragen

1. Soll collect-reports eine Vollständigkeitsprüfung machen? (z.B. "ESP32-Debug-Report fehlt" warnen?)
2. Soll die priorisierte Problemliste intelligenter sein als reine Marker-Erkennung?
3. Soll der Skill den TM-Workflow kennen und einen Hinweis geben wer als nächstes dran ist (meta-analyst)?
4. Soll er auch Reports aus Unterordnern sammeln (z.B. `.claude/reports/Testrunner/`)?

---

## 2. updatedocs

### A) Dateien

| Typ | Pfad | Existiert |
|-----|------|-----------|
| Agent-Datei | — | **NEIN** (kein Agent) |
| Skill | `.claude/skills/updatedocs/SKILL.md` | Ja |

**Fazit:** Reiner Skill, kein Agent. Wird von Robin manuell via `/updatedocs` aufgerufen.

### B) IST-Zustand

**Frontmatter:**
```yaml
name: updatedocs
description: Dokumentations-Aktualisierung für AutomationOne nach Code-Änderungen...
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
```
- Kein `user-invocable` definiert (Default: false) – **ABER** laut CLAUDE.md soll es via `/updatedocs` aufrufbar sein
- Kein `model` definiert
- Kein `context` definiert

**Rolle:** Aktualisiert bestehende Dokumentation nach Code-Änderungen. Chirurgisch editieren, nie neu schreiben.

**Arbeitsweise:**
1. Input analysieren: Beschreibung der Änderungen vom User extrahieren
2. Betroffene Docs identifizieren: Abhängigkeits-Matrix (Sektion 4) matchen
3. Jede betroffene Doc komplett lesen
4. Chirurgisch editieren (str_replace, Pattern der existierenden Einträge kopieren)
5. Bericht: Liste aller geänderten Dateien

**Referenzen:** Keine externen Referenzen direkt geladen. Aber enthält intern eine umfangreiche Abhängigkeits-Matrix (Sektion 4) die Pfade zu allen relevanten Docs listet:
- `.claude/rules/docker-rules.md`
- `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md`
- `.claude/reference/debugging/LOG_LOCATIONS.md`
- `.claude/CLAUDE.md`
- `.claude/agents/Readme.md`
- `.claude/skills/README.md`
- `.claude/reference/api/MQTT_TOPICS.md`
- `.claude/reference/api/REST_ENDPOINTS.md`
- `.claude/reference/api/WEBSOCKET_EVENTS.md`
- `.claude/reference/errors/ERROR_CODES.md`
- `El Trabajante/docs/Mqtt_Protocoll.md`
- `El Trabajante/docs/NVS_KEYS.md`
- Agent-Dateien (server-debug, mqtt-debug, esp32-debug, frontend-debug)
- Skill-Dateien (server-development, esp32-development, mqtt-development, frontend-development, system-control)
- `scripts/debug/README.md`

**Andere Agenten:** Keine Verweise. Kennt keine Agenten.

**Output:** Kein Report. Editiert bestehende Dateien direkt. Am Ende: Liste der geänderten Dateien im Chat.

**Trigger:** Manuell durch Robin (`/updatedocs`). Nach Code-Implementierungen, Stack-Änderungen, neuen Services.

### C) 7-Prinzipien-Check

| # | Prinzip | Status | Befund |
|---|---------|--------|--------|
| P1 | Kontexterkennung | **Fehlt** | Kein Modi-System. Erkennt den Änderungstyp aus dem User-Input, aber keine automatische Kontexterkennung (z.B. git diff lesen um selbst zu erkennen was geändert wurde). |
| P2 | Eigenständigkeit | **Teilweise** | Braucht User-Input ("was wurde geändert"). Könnte theoretisch git diff selbst lesen um Änderungen zu erkennen, tut es aber nicht. |
| P3 | Erweitern statt delegieren | **Fehlt** | Kein Extended Check. Wenn eine Doc-Änderung weitere Docs betrifft die nicht in der Matrix stehen, wird das nicht bemerkt. Kein Cross-Check ob die Änderung konsistent ist. |
| P4 | Erst verstehen, dann handeln | **Erfüllt** | Explizite Regel: "Lies JEDE betroffene Datei KOMPLETT bevor du sie editierst." Analysiert Heading-Struktur, Tabellen-Format, existierende Einträge. |
| P5 | Fokussiert aber vollständig | **Teilweise** | Die Abhängigkeits-Matrix ist umfangreich und deckt viele Szenarien ab. Aber: Sie ist statisch. Neue Doc-Typen oder Pfade müssen manuell hinzugefügt werden. |
| P6 | Nachvollziehbare Ergebnisse | **Teilweise** | Kein Report nach `.claude/reports/current/`. Output ist nur eine Chat-Nachricht mit Liste der geänderten Dateien. Nicht archivierbar. |
| P7 | Querreferenzen | **Fehlt** | Kennt keine anderen Agenten. Keine Empfehlung. Keine Strategie-Information. |

### D) Besonderheiten

- **Einzigartigkeit:** Einziger Skill der Dokumentation aktualisiert (nicht erstellt, nicht analysiert). Chirurgische Edits.
- **Überschneidung mit collect-reports:** Keine inhaltliche Überschneidung. collect-reports sammelt Reports, updatedocs editiert Reference-Docs.
- **Überschneidung mit agent-manager:** agent-manager editiert auch `.claude/agents/` und `.claude/skills/`. Updatedocs ebenfalls (z.B. "Neuer Agent hinzugefügt" → aktualisiert Agent-Dateien). Potenzielle Kollisionsgefahr.
- **Agent vs. Skill:** Reiner Skill ergibt Sinn. Wird nur auf expliziten Aufruf aktiv, macht chirurgische Edits.
- **Abhängigkeiten:** Abhängig von User-Input der beschreibt was geändert wurde. Könnte git diff nutzen um das selbst zu erkennen.
- **Fehlendes `user-invocable: true`:** Im Frontmatter fehlt `user-invocable: true`, obwohl der Skill als `/updatedocs` via CLAUDE.md registriert ist. Die Tatsache, dass er im Skills-Menü erscheint, deutet darauf hin, dass er trotzdem via model-invocation oder über die description erkannt wird.

### E) Offene Fragen

1. Soll updatedocs git diff selbst lesen können um Änderungen automatisch zu erkennen?
2. Wie wird die Abhängigkeits-Matrix aktuell gehalten wenn neue Doc-Typen oder Pfade hinzukommen?
3. Soll updatedocs einen Report schreiben (nachvollziehbar) statt nur eine Chat-Nachricht?
4. Wie wird Kollision mit agent-manager vermieden wenn beide Agent-/Skill-Dateien editieren?
5. Fehlt `user-invocable: true` absichtlich oder versehentlich?

---

## 3. git-commit

### A) Dateien

| Typ | Pfad | Existiert |
|-----|------|-----------|
| Agent-Datei | — | **NEIN** (kein Agent) |
| Skill | `.claude/skills/git-commit/SKILL.md` | Ja |

**Fazit:** Reiner Skill, kein Agent. Wird von Robin manuell via `/git-commit` aufgerufen.

### B) IST-Zustand

**Frontmatter:**
```yaml
name: git-commit
description: Analysiert Git-Changes und bereitet saubere Commits vor...
allowed-tools: Read, Grep, Glob, Bash
user-invocable: true
```
- Kein `model` definiert
- Kein `context` definiert

**Rolle:** Analysiert alle aktuellen Änderungen, gruppiert sie in logische Commits, formuliert Conventional Commit Messages. Führt KEIN git add/commit/push aus.

**Arbeitsweise:**
1. Phase 1 – Änderungen erfassen: `git status`, `git diff --stat`, `git diff --cached --stat`, `git ls-files --others`, `git log --oneline -5`
2. Phase 2 – Änderungen verstehen: Für jede Datei `git diff` lesen, kategorisieren (feat/fix/docs/refactor/chore/test/ci/style/perf), Scope bestimmen
3. Phase 3 – Logische Gruppierung: Regeln für Zusammengehörigkeit (eine logische Einheit pro Commit, Doku mit Code, Config separat, Agents/Skills zusammen)
4. Phase 4 – Commit-Plan schreiben: Report nach `GIT_COMMIT_PLAN.md`

**Referenzen:** Keine externen Referenzen. Enthält intern:
- Scope-Mapping-Tabelle (Pfad-Pattern → Scope)
- Kategorisierungs-Tabelle (Änderungstyp → Conventional Prefix)
- Reihenfolge-Priorität

**Andere Agenten:** Keine Verweise auf andere Agenten.

**Output:** `.claude/reports/current/GIT_COMMIT_PLAN.md`

**Trigger:** Manuell durch Robin. "git-commit", "Commit vorbereiten", "Changes analysieren".

### C) 7-Prinzipien-Check

| # | Prinzip | Status | Befund |
|---|---------|--------|--------|
| P1 | Kontexterkennung | **Fehlt** | Kein Modi-System. Macht immer denselben Ablauf unabhängig davon ob 2 oder 200 Dateien geändert sind. Hat zwar einen "Sonderfall >20 Dateien", aber das ist kein Modus. |
| P2 | Eigenständigkeit | **Erfüllt** | Braucht keinen Input – liest git status selbst. Vollständig autark. |
| P3 | Erweitern statt delegieren | **Fehlt** | Kein Extended Check. Wenn z.B. ein Commit Server + ESP32 betrifft, wird nicht geprüft ob MQTT-Topics kompatibel sind. Kein Cross-Layer-Bewusstsein. |
| P4 | Erst verstehen, dann handeln | **Erfüllt** | Explizite Regel: Führt KEIN git add/commit/push aus. Liest jeden Diff vollständig. Analysiert vor dem Plan. |
| P5 | Fokussiert aber vollständig | **Erfüllt** | Vollständige Abdeckung: Modified, Staged, Untracked. Priorisierte Reihenfolge. Sonderfälle dokumentiert (gestaged, Merge-Konflikte, untracked Dirs). |
| P6 | Nachvollziehbare Ergebnisse | **Erfüllt** | Report nach `.claude/reports/current/GIT_COMMIT_PLAN.md` mit klarer Struktur: Pro Commit Dateien, Begründung, Befehle, Zusammenfassung. |
| P7 | Querreferenzen | **Fehlt** | Kennt keine anderen Agenten. Keine Empfehlung ob z.B. vor dem Commit noch Tests laufen sollten. |

### D) Besonderheiten

- **Einzigartigkeit:** Einziger Skill der Git-Changes analysiert und Commit-Pläne erstellt. Klar abgegrenzt von git-health (der den Repo-Zustand prüft).
- **Überschneidung mit git-health:** Beide lesen `git status`, `git log`, `git diff`. Aber: git-commit analysiert für Commits, git-health für Repo-Gesundheit. Klare Zwecktrennung.
- **Read-Only:** Hat `Bash` in allowed-tools, nutzt es aber NUR für lesende Git-Befehle. Regel: "Du führst KEIN git add, git commit, git push aus."
- **Agent vs. Skill:** Reiner Skill ergibt Sinn. Deterministischer Ablauf, manuell getriggert.
- **Scope-Mapping:** Hat eine projektspezifische Scope-Tabelle die Pfad-Patterns auf Conventional Commit Scopes mappt. Diese ist Domänenwissen das im Skill eingebettet ist.

### E) Offene Fragen

1. Soll git-commit nach dem Plan eine Empfehlung geben (z.B. "Tests laufen lassen bevor Commit")?
2. Soll der Skill automatisch erkennen ob seit dem letzten Aufruf neue Änderungen hinzukamen?
3. Die Scope-Tabelle muss manuell gepflegt werden wenn neue Pfade hinzukommen – wer aktualisiert das?
4. Soll git-commit den Commit dann auch ausführen können wenn Robin es bestätigt, oder bleibt es rein read-only?

---

## 4. git-health

### A) Dateien

| Typ | Pfad | Existiert |
|-----|------|-----------|
| Agent-Datei | — | **NEIN** (kein Agent) |
| Skill | `.claude/skills/git-health/SKILL.md` | Ja |

**Fazit:** Reiner Skill, kein Agent. Wird von Robin manuell via `/git-health` aufgerufen.

### B) IST-Zustand

**Frontmatter:**
```yaml
name: git-health
description: Git & GitHub Vollanalyse für AutomationOne...
allowed-tools: Read, Grep, Glob, Bash
user-invocable: true
```
- Kein `model` definiert
- Kein `context` definiert

**Rolle:** Vollständige Analyse des Git- und GitHub-Zustands ohne Änderungen. Prüft Secrets, CI/CD, Branch-Schutz, Repo-Hygiene.

**Arbeitsweise:**
1. Phase 1 – Git-Grundzustand: Remotes, Branches, unpushed Commits, Tags, Hooks, Stash
2. Phase 2 – Arbeitsverzeichnis-Status: Modified, Staged, Untracked
3. Phase 3 – Secrets & Sensible Dateien: .gitignore Abdeckung, getrackte Secrets, Inventar, Docker-Secrets
4. Phase 4 – CI/CD Pipeline: Workflow-Dateien lesen, referenzierte Secrets, Action-Versions
5. Phase 5 – Branch-Schutz & Strategie: Merge-Historie, Conventional Commits Einhaltung
6. Phase 6 – Repo-Hygiene: Größe, große Dateien, Stale Branches, Submodules, LFS
7. Phase 7 – Report schreiben

**Referenzen:** Keine externen Referenzen definiert. Liest nur Git-Daten und Projektdateien (.gitignore, docker-compose, .github/workflows).

**Andere Agenten:** Keine Verweise auf andere Agenten.

**Output:** `.claude/reports/current/GIT_HEALTH_REPORT.md`

**Trigger:** Manuell durch Robin. "git-health", "Repo-Check", "Git prüfen", "GitHub Status".

### C) 7-Prinzipien-Check

| # | Prinzip | Status | Befund |
|---|---------|--------|--------|
| P1 | Kontexterkennung | **Fehlt** | Kein Modi-System. Führt immer die komplette 7-Phasen-Analyse durch, auch wenn Robin nur "Secrets prüfen" will. |
| P2 | Eigenständigkeit | **Erfüllt** | Braucht keinen Input – liest alles selbst aus dem Git-Zustand und der Codebase. |
| P3 | Erweitern statt delegieren | **Fehlt** | Kein Extended Check. Wenn z.B. ein Workflow fehlschlägt, wird nicht geprüft ob die referenzierten Secrets existieren. Keine Verbindung zum CI-Status (gh run list). |
| P4 | Erst verstehen, dann handeln | **Erfüllt** | Rein read-only. Ändert nichts. Belegt jede Aussage mit dem Befehl der sie erzeugt hat. |
| P5 | Fokussiert aber vollständig | **Erfüllt** | 7 Phasen decken den gesamten Git/GitHub-Zustand ab: Config, Status, Secrets, CI/CD, Branches, Hygiene. Umfangreiche Checklisten. |
| P6 | Nachvollziehbare Ergebnisse | **Erfüllt** | Report nach `.claude/reports/current/GIT_HEALTH_REPORT.md` mit Schnellübersicht (Ampel-System), 6 Detail-Sektionen, Bewertung (KRITISCH/WICHTIG/GUT), Empfehlungen. |
| P7 | Querreferenzen | **Fehlt** | Kennt keine anderen Agenten. Keine Empfehlung ob z.B. nach einem Secrets-Fund die PRODUCTION_CHECKLIST konsultiert werden sollte. |

### D) Besonderheiten

- **Einzigartigkeit:** Einziger Skill der Git/GitHub-Gesundheit analysiert. Umfangreichster der 6 analysierten Skills (536 Zeilen).
- **Security-Fokus:** Hat einen starken Secrets-/Security-Fokus (Phase 3 mit 4 Sub-Phasen). Prüft .gitignore, getrackte Secrets, Hardcoded Credentials, Docker-Secrets.
- **CI/CD-Analyse:** Liest GitHub Workflows und prüft Action-Versions, Caching, Secrets. Aber: Nutzt NICHT `gh run list` um den aktuellen CI-Status zu prüfen.
- **Überschneidung mit system-control:** system-control hat auch Docker-Befehle und kann `git status` lesen. Aber: system-control fokussiert auf den laufenden Stack, git-health auf den Repo-Zustand. Klare Trennung.
- **Agent vs. Skill:** Reiner Skill ergibt Sinn. Deterministische Vollanalyse, manuell getriggert.
- **Linux-spezifische Befehle:** Mehrere Bash-Befehle nutzen Linux-Syntax (find, date -d, awk, for-loops mit `$f`). Auf Windows/PowerShell funktionieren diese nicht ohne Git Bash oder WSL.

### E) Offene Fragen

1. Soll git-health `gh run list` nutzen um den aktuellen CI-Status zu prüfen (nicht nur die Workflow-Dateien)?
2. Sind die Linux-spezifischen Bash-Befehle auf dem Windows-System des Users (PowerShell) funktionsfähig?
3. Soll git-health einen fokussierten Modus haben (z.B. "nur Secrets prüfen")?
4. Soll git-health auf `.claude/reference/security/PRODUCTION_CHECKLIST.md` verweisen?

---

## 5. verify-plan

### A) Dateien

| Typ | Pfad | Existiert |
|-----|------|-----------|
| Agent-Datei | — | **NEIN** (kein Agent) |
| Skill | `.claude/skills/verify-plan/SKILL.md` | Ja |

**Fazit:** Reiner Skill, kein Agent. Wird von Robin manuell via `/verify-plan` aufgerufen.

### B) IST-Zustand

**Frontmatter:**
```yaml
name: verify-plan
description: Reality-Check für TM-Pläne gegen die echte Codebase...
allowed-tools: Read, Grep, Glob, Bash, Edit
user-invocable: true
```
- Kein `model` definiert
- Kein `context` definiert
- Hat `Edit` in allowed-tools (kann Plan-Dateien korrigieren)

**Rolle:** Prüft TM-Pläne gegen den echten Systemzustand. Findet Diskrepanzen in Pfaden, Agent-Referenzen, Docker-Services, Config-Werten, API-Endpunkten, Abhängigkeiten. Zwei Modi: Plan-Datei korrigieren (Modus A) oder Chat-Antwort (Modus B).

**Arbeitsweise:**
1. Phase 1 – Plan-Extraktion: 10 Aspekte extrahieren (Pfade, Agents, Skills, Services, Config, MQTT, API, Vorbedingungen, Outputs, Test-Flow)
2. Phase 2 – System-Prüfung: 12 Prüfketten (2a-2j + 2z Quality Gates)
   - 2a: Pfad-Validierung (Glob, Read)
   - 2b: Agent-Validierung (Glob, Read, CLAUDE.md)
   - 2c: Docker-Validierung (docker-compose, make status)
   - 2d: Config-Validierung (.env, docker-compose environments)
   - 2e: API-Validierung (MQTT_TOPICS, REST_ENDPOINTS, WEBSOCKET_EVENTS)
   - 2f: Abhängigkeits-Validierung (ARCHITECTURE_DEPENDENCIES)
   - 2g: Skill-Validierung (Glob, Read)
   - 2h: Output-Pfad-Validierung
   - 2i: Test-Infrastruktur-Validierung
   - 2j: Wokwi vs. Echter ESP
   - 2z: Quality Gates (Konsistenz, Struktur, Naming, Kompatibilität, Ressourcen, Fehlertoleranz)
3. Phase 3 – Ergebnis: Modus A (Edit Plan-Datei) oder Modus B (Chat-Antwort)

**Referenzen (umfangreich):**
- `.claude/reference/api/MQTT_TOPICS.md`
- `.claude/reference/api/REST_ENDPOINTS.md`
- `.claude/reference/api/WEBSOCKET_EVENTS.md`
- `.claude/reference/infrastructure/DOCKER_REFERENCE.md`
- `.claude/reference/testing/TEST_WORKFLOW.md`
- `.claude/reference/testing/TEST_ENGINE_REFERENCE.md`
- `.claude/reference/debugging/LOG_LOCATIONS.md`
- `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md`
- `.claude/reference/testing/flow_reference.md`
- `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md`
- `.claude/reference/security/PRODUCTION_CHECKLIST.md` (indirekt, in Anhang)

**Andere Agenten:** Kennt alle Agenten als Inventar (Anhang A mit exakten Pfaden und Tools). Kennt den TM-Workflow (Test-Flow-spezifische Befehlskorrektur). Kennt die Agent-Aktivierungsreihenfolge.

**Output:** Modus A: Korrektur in Plan-Datei. Modus B: Chat-Antwort. KEIN Report nach `.claude/reports/`.

**Trigger:** Manuell durch Robin. "TM-Plan prüfen", "verify-plan", "Reality-Check".

### C) 7-Prinzipien-Check

| # | Prinzip | Status | Befund |
|---|---------|--------|--------|
| P1 | Kontexterkennung | **Teilweise** | Hat zwei Modi (A: Plan-Datei, B: Chat). Erkennt Test-Flow-Pläne und aktiviert zusätzliche Prüfungen. Aber: Kein vollständiges Modi-System mit automatischer Erkennung. |
| P2 | Eigenständigkeit | **Erfüllt** | Braucht nur den TM-Plan als Input (im Chat oder als Datei). Liest alles andere selbst. |
| P3 | Erweitern statt delegieren | **Erfüllt** | Umfangreiche Prüfketten (12 Stück). Cross-Layer-Prüfung (Docker, API, MQTT, Config zusammen). Quality Gates am Ende. |
| P4 | Erst verstehen, dann handeln | **Erfüllt** | Reihenfolge: Extrahieren → Prüfen → Ergebnis. Bei Plan-Datei: Korrigiert präzise, schreibt nicht neu. |
| P5 | Fokussiert aber vollständig | **Erfüllt** | 12 Prüfketten decken praktisch alles ab. Häufige TM-Fehler dokumentiert. 6 Quality Gates. Test-Infrastruktur-Validierung. Wokwi vs. ESP Unterscheidung. |
| P6 | Nachvollziehbare Ergebnisse | **Teilweise** | Chat-Output mit klarem Format (Bestätigt, Korrekturen, Vorbedingungen, Ergänzungen). ABER: Kein persistenter Report – Chat verschwindet nach Session-Ende. |
| P7 | Querreferenzen | **Erfüllt** | Kennt alle Agenten (Anhang A), kennt den TM-Workflow, kennt die Agent-Aktivierungsreihenfolge. Gibt dem TM Empfehlungen welche Agents er braucht. |

### D) Besonderheiten

- **Einzigartigkeit:** Einziger Skill der als Qualitäts-Gate zwischen TM und Ausführung fungiert. Umfangreichster Skill im System (536 Zeilen Skill-Datei).
- **Bereits nah am universellen Muster:** 5 von 7 Prinzipien erfüllt oder teilweise erfüllt. Hat Modi, Querreferenzen, umfangreiche Prüfketten.
- **Überschneidung mit agent-manager:** agent-manager prüft auch Agent-Konsistenz. verify-plan prüft ob TM-Pläne korrekte Agent-Referenzen haben. Verschiedene Perspektiven auf dasselbe.
- **Anhänge:** Hat 6 Anhänge (A-F) mit IST-Zustand-Inventaren (Agents, Docker, Skills, Referenzen, ENV, Tests). Diese sind statisch und müssen manuell gepflegt werden.
- **Agent vs. Skill:** Reiner Skill ergibt Sinn. Wird nur bei TM-Plan-Prüfung aktiviert, braucht keinen eigenen Kontext.
- **Kein Report:** Explizite Regel "Du schreibst KEINEN Report nach .claude/reports/". Output nur im Chat (vergänglich).

### E) Offene Fragen

1. Sollen die Anhänge (A-F) dynamisch generiert werden statt statisch im Skill zu stehen? Sie veralten schnell.
2. Soll verify-plan doch einen Report schreiben damit das TM-Feedback nachvollziehbar archiviert wird?
3. Wie wird sichergestellt dass die Anhänge mit dem echten System synchron bleiben?
4. Soll verify-plan auch Dev-Flow-Pläne prüfen können (nicht nur Test-Flow)?
5. Der Skill ist mit 536 Zeilen sehr lang – nähert sich dem 15.000-Zeichen-Budget. Wie nah ist er am Limit?

---

## 6. test-log-analyst

### A) Dateien

| Typ | Pfad | Existiert |
|-----|------|-----------|
| Agent-Datei | `.claude/agents/testing/test-log-analyst.md` | Ja |
| Skill | `.claude/skills/test-log-analyst/SKILL.md` | Ja |

**Fazit:** Hat sowohl Agent als auch Skill. Einziger der 6 analysierten mit Agent-Datei.

### B) IST-Zustand

**Agent-Frontmatter:**
```yaml
name: test-log-analyst
description: Test-Log-Analyse für AutomationOne... MUST BE USED when...
tools: [Read, Grep, Glob, Bash]
model: claude-sonnet-4-20250514
skills: test-log-analyst
```

**Skill-Frontmatter:**
```yaml
name: test-log-analyst
description: Test-Log-Analyse für AutomationOne... MUST BE USED when...
allowed-tools: Read, Grep, Glob, Bash
```

**Rolle:** Analysiert Test-Outputs (pytest, Vitest, Playwright, Wokwi) lokal und CI. Gibt Befehle aus, Robin führt aus, Agent analysiert Logs.

**Arbeitsweise (Agent):**
1. Robin ruft `/test` auf oder beschreibt ein Test-Problem
2. Agent gibt gruppierte Befehle aus (mit vollem Projektpfad, PowerShell-kompatibel)
3. Robin führt Tests aus und signalisiert Fertigstellung
4. Agent analysiert Logs und aktualisiert Report fortlaufend

**Arbeitsweise (Skill):**
1. Quick Reference: Log-Locations pro Framework
2. JUnit XML Parsing Patterns
3. CI-Zugriff via gh CLI
4. Report-Template

**Referenzen:**
- `.claude/reference/debugging/LOG_LOCATIONS.md`
- `.claude/reference/debugging/CI_PIPELINE.md`
- `.claude/reference/testing/TEST_ENGINE_REFERENCE.md`
- `.claude/reference/testing/TEST_WORKFLOW.md`
- `.claude/reference/testing/flow_reference.md`

**Andere Agenten (Agent-Datei):** Explizite Abgrenzung:
- "NICHT mein Bereich: Runtime-Logs → server-debug, esp32-debug, mqtt-debug"
- "Datenbank-Inhalte → db-inspector"
- "System-Operationen → system-control"
- "Ich bin NICHT Teil des F1 Test-Flows."

**Output:** `.claude/reports/Testrunner/test.md` (fortlaufend aktualisiert)

**Trigger:** `/test`, "CI ist rot", "warum schlägt Test X fehl", "Vergleiche lokal vs CI".

### C) 7-Prinzipien-Check

| # | Prinzip | Status | Befund |
|---|---------|--------|--------|
| P1 | Kontexterkennung | **Teilweise** | Hat User-Workflow-Beschreibung (Robin gibt Befehle, Robin führt aus, Agent analysiert). Aber: Kein formales Modi-System. Erkennt nicht automatisch ob es um pytest, Vitest, Playwright oder Wokwi geht – wartet auf Robin-Signal. |
| P2 | Eigenständigkeit | **Erfüllt** | Braucht kein SESSION_BRIEFING, STATUS.md oder andere Vorbedingungen. Eigenständiger Flow (F4 laut flow_reference). |
| P3 | Erweitern statt delegieren | **Fehlt** | Kein Extended Check. Wenn z.B. ein pytest fehlschlägt wegen DB-Verbindung, wird nicht geprüft ob Docker läuft. Keine Cross-Layer-Prüfung. |
| P4 | Erst verstehen, dann handeln | **Erfüllt** | Gibt zuerst Befehle aus, wartet auf Robin, analysiert dann. Liest Logs bevor Report geschrieben wird. |
| P5 | Fokussiert aber vollständig | **Erfüllt** | Deckt alle 4 Test-Frameworks ab (pytest, Vitest, Playwright, Wokwi). Lokal und CI. JUnit XML und Coverage. Fortlaufender Report. |
| P6 | Nachvollziehbare Ergebnisse | **Erfüllt** | Report nach `.claude/reports/Testrunner/test.md` mit klarer Struktur (Zusammenfassung, pro Bereich, Nächste Schritte). Fortlaufend aktualisiert. |
| P7 | Querreferenzen | **Teilweise** | Kennt Debug-Agents und grenzt sich ab. Aber: Gibt keine Strategie-Empfehlung wer als nächstes aktiviert werden sollte (z.B. "dieser Test-Fehler deutet auf ein Server-Problem hin → server-debug"). |

### D) Besonderheiten

- **Einzigartigkeit:** Einziger Agent der Test-Framework-Outputs analysiert. Hat einen einzigartigen interaktiven Workflow (Agent gibt Befehle, Robin führt aus).
- **Doppel-Datei-Redundanz:** Agent-Datei (188 Zeilen) und Skill-Datei (143 Zeilen) haben erhebliche inhaltliche Überschneidung. Beide enthalten:
  - User-Workflow-Beschreibung
  - Log-Locations
  - CI-Zugriff (gh CLI)
  - Report-Template
  - Referenzen
  - Abgrenzung
  Die Agent-Datei hat zusätzlich: Befehlsgruppen-Tabelle, Input/Output-Pfade detailliert, Report-Update-Verhalten. Der Skill hat zusätzlich: JUnit XML Parsing.
- **Separater Report-Pfad:** `.claude/reports/Testrunner/test.md` statt `.claude/reports/current/`. Das ist ein Sonderpfad der in collect-reports nicht erfasst wird (collect-reports liest nur `reports/current/*.md`).
- **Model-Spezifikation:** Hat `model: claude-sonnet-4-20250514` explizit gesetzt (einziger der 6 mit explizitem Model).
- **Überschneidung mit Debug-Agents:** Die Abgrenzung ist explizit definiert: test-log-analyst für Test-Framework-Output, Debug-Agents für Runtime-Logs. Aber: Wenn ein Test wegen eines Runtime-Problems fehlschlägt, fällt das in eine Grauzone.
- **Agent vs. Skill:** Hat beides, aber die Aufteilung ist redundant. Die meisten Informationen stehen in beiden Dateien.

### E) Offene Fragen

1. Soll die Redundanz zwischen Agent- und Skill-Datei aufgelöst werden? Welche Datei führt?
2. Soll der Report-Pfad `.claude/reports/Testrunner/test.md` beibehalten werden oder nach `reports/current/` verschoben werden damit collect-reports ihn erfasst?
3. Soll test-log-analyst bei Test-Failures die durch Runtime-Probleme verursacht werden eine Strategie-Empfehlung geben (z.B. "→ server-debug")?
4. Wie wird der interaktive Workflow (Agent gibt Befehle, Robin führt aus) im universellen Muster abgebildet? Das ist ein Sonderfall den kein anderer Agent hat.
5. Soll das explizite Model (`claude-sonnet-4-20250514`) aktualisiert werden? Ist ein gepinntes Model absichtlich?

---

## Überschneidungen und Gruppierung

### Erkannte Überschneidungen

| Überschneidung | Betroffene | Art |
|----------------|------------|-----|
| **Report-Sammlung vs. Report-Analyse** | collect-reports, meta-analyst | collect-reports extrahiert "Priorisierte Problemliste" – das ist bereits eine Analyse. meta-analyst macht dieselbe Analyse gründlicher. |
| **Agent/Skill-Dateien editieren** | updatedocs, agent-manager | Beide editieren `.claude/agents/` und `.claude/skills/` Dateien. updatedocs bei Doc-Updates, agent-manager bei Agent-Optimierung. Keine definierte Abgrenzung. |
| **Git-Status lesen** | git-commit, git-health | Beide lesen `git status`, `git log`, `git diff`. Aber: Verschiedene Ziele (Commit-Plan vs. Repo-Health). Keine echte Kollision. |
| **System-Prüfung** | verify-plan, system-control | Beide prüfen Docker-Status, Pfade, Services. verify-plan im Kontext von TM-Plänen, system-control im Kontext von Operationen. Verschiedene Perspektiven. |
| **Test-Analyse** | test-log-analyst, Debug-Agents | Grauzone bei Tests die wegen Runtime-Problemen fehlschlagen. test-log-analyst analysiert Test-Output, Debug-Agents die Runtime-Logs. |

### Natürliche Gruppierungen

| Gruppe | Skills/Agents | Gemeinsamer Nenner |
|--------|---------------|-------------------|
| **Git-Operationen** | git-commit, git-health | Arbeiten mit Git-Daten, read-only, Report als Output |
| **Docs-Lifecycle** | updatedocs, collect-reports | Arbeiten mit `.claude/`-Dokumenten, einer editiert, einer sammelt |
| **TM-Workflow** | verify-plan, collect-reports | Beide dienen dem TM-Workflow. verify-plan prüft TM-Input, collect-reports liefert TM-Output |
| **Test-Lifecycle** | test-log-analyst (allein) | Eigenständiger Flow, interaktiver Workflow, kein Overlap mit anderen |

### Statusverteilung

| Typ | Anzahl | Skills |
|-----|--------|--------|
| Nur Skill (kein Agent) | 5 | collect-reports, updatedocs, git-commit, git-health, verify-plan |
| Agent + Skill | 1 | test-log-analyst |

### Prinzipien-Erfüllungsgrad (Zusammenfassung)

| Skill/Agent | P1 | P2 | P3 | P4 | P5 | P6 | P7 | Erfüllt |
|-------------|----|----|----|----|----|----|----|----|
| collect-reports | ❌ | ✅ | ❌ | ⚠️ | ⚠️ | ✅ | ❌ | 2/7 |
| updatedocs | ❌ | ⚠️ | ❌ | ✅ | ⚠️ | ⚠️ | ❌ | 1/7 |
| git-commit | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | 3/7 |
| git-health | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | 3/7 |
| verify-plan | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | 4/7 |
| test-log-analyst | ⚠️ | ✅ | ❌ | ✅ | ✅ | ✅ | ⚠️ | 3/7 |

**Legende:** ✅ = Erfüllt, ⚠️ = Teilweise, ❌ = Fehlt

### Hauptdefizite über alle 6 hinweg

| Prinzip | Fehlt bei | Beobachtung |
|---------|-----------|-------------|
| **P1 Kontexterkennung** | 4 von 6 (komplett fehlend) | Keiner der reinen Skills hat ein Modi-System. Sie machen immer denselben Ablauf. |
| **P3 Erweitern statt delegieren** | 5 von 6 (komplett fehlend) | Nur verify-plan hat Extended Checks. Alle anderen arbeiten strikt in ihrem Bereich ohne Cross-Layer-Prüfung. |
| **P7 Querreferenzen** | 4 von 6 (komplett fehlend) | Nur verify-plan und test-log-analyst (teilweise) kennen andere Agenten. Die reinen Skills sind isoliert. |

---

**Ende des Berichts. Reine IST-Analyse – keine Optimierungsvorschläge.**
