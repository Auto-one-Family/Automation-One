---
name: updatedocs
description: |
  Dokumentations-Aktualisierung für AutomationOne nach Code-Änderungen.
  Verwenden bei: /updatedocs Trigger, nach Implementierungen, nach Stack-Änderungen,
  nach neuen Services, Agents, Skills, Ports, Endpoints, Log-Pfaden.
  NICHT verwenden für: Neue Docs schreiben, Reports erstellen, Code-Änderungen.
  Abgrenzung: collect-reports (Reports), system-manager (Session-Briefing)
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# updatedocs - Dokumentations-Aktualisierung

> **Trigger:** `/updatedocs`
> **Prinzip:** Chirurgisch aktualisieren. Nie neu schreiben. Bestehendes Pattern fortführen.

---

## 0. Quick Reference

| Ich will... | Primäre Quelle | Aktion |
|-------------|---------------|--------|
| Docs nach Code-Änderung aktualisieren | Abhängigkeits-Matrix (Sektion 4) | Betroffene Docs identifizieren → lesen → updaten |
| Wissen welche Docs betroffen sind | Abhängigkeits-Matrix (Sektion 4) | Änderungstyp matchen → Doc-Liste |
| Pattern einer Doc-Kategorie prüfen | Konventionen (Sektion 3) | Kategorie nachschlagen → Format einhalten |

---

## 1. Workflow

### Schritt 1: Input analysieren

Der User gibt dir eine Beschreibung der durchgeführten Änderungen. Extrahiere daraus:

1. **Was wurde geändert?** (Dateien, Services, Konfigurationen)
2. **Welcher Änderungstyp?** (Neuer Service, Port-Änderung, neuer Agent, etc.)
3. **Welche konkreten Werte?** (Neue Ports, Pfade, Endpoints, Container-Namen)

### Schritt 2: Betroffene Docs identifizieren

Matche den Änderungstyp gegen die Abhängigkeits-Matrix in Sektion 4. Erstelle eine Liste aller zu aktualisierenden Docs.

### Schritt 3: Jede betroffene Doc lesen

**PFLICHT:** Lies JEDE betroffene Datei KOMPLETT bevor du sie editierst.

```bash
cat .claude/reference/debugging/LOG_LOCATIONS.md
```

Analysiere dabei:
- Heading-Struktur und -Level
- Tabellen-Format (Spalten, Alignment)
- Wie ähnliche Einträge bereits formuliert sind
- Wo genau der neue/geänderte Eintrag hingehört

### Schritt 4: Chirurgisch editieren

Für jede Datei:

1. **Finde die exakte Stelle** wo die Änderung hingehört (Tabelle, Sektion, Liste)
2. **Kopiere das Pattern** des nächsten existierenden Eintrags
3. **Editiere NUR die betroffenen Zeilen** – kein Rewrite, kein Umformatieren
4. **Prüfe Konsistenz** mit dem Rest der Datei

### Schritt 5: Bericht

Nach Abschluss: Liste alle geänderten Dateien mit je einer Zeile was geändert wurde.

---

## 2. Regeln

- **NIEMALS** eine Datei neu schreiben oder umstrukturieren
- **NIEMALS** Heading-Level ändern die bereits existieren
- **NIEMALS** Tabellen-Spalten hinzufügen oder entfernen die bereits existieren
- **IMMER** die Datei komplett lesen bevor du editierst
- **IMMER** das Pattern der existierenden Einträge exakt kopieren
- **IMMER** den Edit-Tool nutzen (str_replace), nicht die ganze Datei überschreiben
- Wenn eine Sektion nicht existiert die du brauchst: Füge sie am Ende der Datei ein, im selben Heading-Level wie die anderen Sektionen
- Wenn du unsicher bist wo ein Eintrag hingehört: Lies die 3 nächsten ähnlichen Einträge und folge deren Position

---

## 3. Konventionen

### Datei-Benennung

| Kategorie | Konvention | Beispiel |
|-----------|-----------|---------|
| Skills | `SKILL.md` (UPPER_CASE) | `SKILL.md` |
| Agents | kebab-case.md | `esp32-debug.md` |
| Reference | UPPER_SNAKE_CASE.md | `MQTT_TOPICS.md` |
| Rules | kebab-case.md | `docker-rules.md` |
| Reports | UPPER_SNAKE_CASE.md | `ESP32_BOOT_REPORT.md` |

### Formatierung

- **Heading-Level:** H1 = Dokumenttitel, H2 = Hauptsektionen, H3 = Subsektionen
- **Tabellen:** Pipe-Format, links-aligned, ein Leerzeichen nach/vor Pipe
- **Code-Blöcke:** Sprach-Tags `bash`, `yaml`, `python`, `typescript`, `cpp`, `json`
- **Listen:** `-` für Bullets, `1.` für nummerierte Schritte
- **Hervorhebungen:** **Bold** für Warnungen/Kritisches, `Backticks` für Pfade/Befehle/Variablen
- **Emojis:** Nur in Reports (✅ ⚠️ ❌), nicht in Reference/Skills/Rules
- **Pfade:** Relativ ohne führendes `./`, in Backticks: `reference/api/MQTT_TOPICS.md`
- **Frontmatter:** YAML mit `---` Delimiter, `name:` und `description:` Pflicht für Skills/Agents

### Version-Pattern

Wenn vorhanden, aktualisiere:
```
> **Version:** X.X | **Aktualisiert:** YYYY-MM-DD
```

---

## 4. Abhängigkeits-Matrix

### Docker-Service hinzugefügt/geändert

| Doc | Was aktualisieren |
|-----|-------------------|
| `.claude/rules/docker-rules.md` | Container-Name, Port, Volume, Network in relevanter Tabelle |
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Docker-Befehle, Service-Liste |
| `.claude/reference/debugging/LOG_LOCATIONS.md` | Log-Pfad des neuen Service |
| `scripts/debug/README.md` | Falls session.sh betroffen |

### Port geändert

| Doc | Was aktualisieren |
|-----|-------------------|
| `.claude/rules/docker-rules.md` | Port-Mapping-Tabelle |
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Port-Referenzen |
| `.claude/reference/debugging/LOG_LOCATIONS.md` | Falls Port in Befehlen vorkommt |

### Neues Log-Verzeichnis / Log-Pfad geändert

| Doc | Was aktualisieren |
|-----|-------------------|
| `.claude/reference/debugging/LOG_LOCATIONS.md` | Pfad-Tabelle, Befehle |
| `.claude/agents/server/server-debug-agent.md` | Input-Pfade (falls Server-Logs) |
| `.claude/agents/mqtt/mqtt-debug-agent.md` | Input-Pfade (falls MQTT-Logs) |
| `.claude/agents/esp32-debug.md` | Input-Pfade (falls ESP32-Logs) |
| `.claude/agents/frontend/frontend-debug-agent.md` | Input-Pfade (falls Frontend-Logs) |
| `.claude/skills/server-debug/SKILL.md` | Log-Pfad-Referenzen |
| `.claude/skills/mqtt-debug/SKILL.md` | Log-Pfad-Referenzen |
| `.claude/skills/esp32-debug/SKILL.md` | Log-Pfad-Referenzen |

### Neuer Agent hinzugefügt

| Doc | Was aktualisieren |
|-----|-------------------|
| `.claude/CLAUDE.md` | Neue Zeile in der passenden Agent-Tabelle (Debug/Dev/System) |
| `.claude/agents/Readme.md` | Agent-Index ergänzen |
| `.claude/skills/README.md` | Falls zugehöriger Skill existiert |

### Neuer Skill hinzugefügt

| Doc | Was aktualisieren |
|-----|-------------------|
| `.claude/CLAUDE.md` | Neue Zeile in Skills-Tabelle |
| `.claude/skills/README.md` | Skill-Index ergänzen |

### API-Endpoint geändert/hinzugefügt

| Doc | Was aktualisieren |
|-----|-------------------|
| `.claude/reference/api/REST_ENDPOINTS.md` | Endpoint-Tabelle |
| `.claude/skills/server-development/SKILL.md` | Falls in Quick-Reference |
| `.claude/skills/frontend-development/SKILL.md` | Falls Frontend den Endpoint nutzt |

### MQTT-Topic geändert/hinzugefügt

| Doc | Was aktualisieren |
|-----|-------------------|
| `.claude/reference/api/MQTT_TOPICS.md` | Topic-Tabelle |
| `El Trabajante/docs/Mqtt_Protocoll.md` | Topic-Dokumentation |
| `.claude/skills/mqtt-development/SKILL.md` | Falls in Quick-Reference |
| `.claude/skills/esp32-development/SKILL.md` | Falls ESP32 das Topic nutzt |

### Error-Code hinzugefügt

| Doc | Was aktualisieren |
|-----|-------------------|
| `.claude/reference/errors/ERROR_CODES.md` | Code-Tabelle (ESP32: 1000-4999, Server: 5000-5999) |

### Neues Makefile-Target

| Doc | Was aktualisieren |
|-----|-------------------|
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Target-Liste |

### WebSocket-Event hinzugefügt

| Doc | Was aktualisieren |
|-----|-------------------|
| `.claude/reference/api/WEBSOCKET_EVENTS.md` | Event-Tabelle |
| `.claude/skills/frontend-development/SKILL.md` | Falls in Quick-Reference |

### NVS-Key hinzugefügt

| Doc | Was aktualisieren |
|-----|-------------------|
| `El Trabajante/docs/NVS_KEYS.md` | Key-Tabelle |
| `.claude/skills/esp32-development/MODULE_REGISTRY.md` | Falls Modul-bezogen |

### session.sh geändert

| Doc | Was aktualisieren |
|-----|-------------------|
| `scripts/debug/README.md` | Nutzungsanleitung, Argumente, Output |
| `.claude/reference/debugging/LOG_LOCATIONS.md` | Falls Log-Pfade betroffen |
| `.claude/skills/system-control/SKILL.md` | Falls Session-Befehle betroffen |
| `.claude/skills/System Manager/SKILL.md` | Falls STATUS.md-Format betroffen |

### Docker-Compose Konfiguration geändert

| Doc | Was aktualisieren |
|-----|-------------------|
| `.claude/rules/docker-rules.md` | Betroffene Regeln/Tabellen |
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Betroffene Befehle |

---

## 5. Vorgehen bei Unsicherheit

Wenn du nicht sicher bist ob eine Doc betroffen ist:

```bash
# Suche nach dem geänderten Wert in allen .claude/ Docs
grep -r "alter_wert" .claude/ --include="*.md" -l

# Suche in Komponenten-Docs
grep -r "alter_wert" El\ Servador/docs/ El\ Trabajante/docs/ scripts/ --include="*.md" -l
```

Jeder Treffer ist eine potenziell betroffene Datei. Lies sie und prüfe ob das Vorkommen aktualisiert werden muss.

---

*Dieser Skill ändert nur Dokumentation. Er ändert keinen Code, keine Configs, keine Docker-Dateien.*