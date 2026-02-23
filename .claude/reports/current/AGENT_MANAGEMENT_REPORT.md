# Agent-Management Report

**Erstellt:** 2026-02-21
**Modus:** 1 (Dokument-Analyse / Frage beantworten)
**Auftrag:** Pruefen ob die 4 Dev-Agents Serena MCP-Tools in ihrem Frontmatter/Toolset erwaehnen koennen oder sollten.

---

## 1. Zusammenfassung

Alle 4 Dev-Agents wurden auf ihre `tools:` Felder und Relevanz von Serena MCP-Tools geprueft.
**Ergebnis:** Subagenten haben KEINEN direkten Zugriff auf MCP-Tools - Serena-Tools erscheinen im Frontmatter nicht als nutzbare Tools. Eine Erwaehnung in den Agent-Dateien als Hinweis an den Hauptkontext-Nutzer waere moeglich, ist aber nach aktueller Bewertung nicht notwendig - die bestehenden Grep/Glob/Read-Workflows decken die gleichen Anwendungsfaelle ab.

---

## 2. Analysierte Agents

| Agent | Datei | tools: Feld |
|-------|-------|-------------|
| esp32-dev | `.claude/agents/esp32-dev.md` | `["Read", "Grep", "Glob", "Bash", "Write", "Edit"]` |
| server-dev | `.claude/agents/server-dev.md` | `["Read", "Grep", "Glob", "Bash", "Write", "Edit"]` |
| frontend-dev | `.claude/agents/frontend-dev.md` | `["Read", "Write", "Edit", "Bash", "Grep", "Glob"]` |
| mqtt-dev | `.claude/agents/mqtt-dev.md` | `["Read", "Grep", "Glob", "Bash", "Write", "Edit"]` |

**Befund:** Keiner der 4 Agents erwaehnt MCP-Tools irgendeiner Art im Frontmatter oder im Agent-Body.

---

## 3. Technische Grundlage: MCP in Subagenten

### Kernfakt (aus Auftrags-Kontext)

**Subagenten haben KEINEN direkten Zugriff auf MCP-Tools.** MCP-Tools sind ausschliesslich im Hauptkontext (der primaeeren Claude Code Session) verfuegbar.

### Was das bedeutet

| Kontext | MCP-Tool-Zugriff | Serena verfuegbar? |
|---------|-----------------|-------------------|
| Hauptkontext (direkte Claude Code Session) | Ja | Ja (`mcp__plugin_serena_serena__*`) |
| Subagent (via Task-Aufruf) | Nein | Nein |

Das `tools:` Feld im Agent-Frontmatter akzeptiert nur die Standard Claude Code Tools:
`Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`, `WebFetch`, `Task`, `TodoRead`, `TodoWrite`.

MCP-Tool-Namen wie `mcp__plugin_serena_serena__find_symbol` sind im Frontmatter nicht eintragbar und wuerden ignoriert werden, selbst wenn sie eingetragen waeren.

---

## 4. Relevanz-Bewertung pro Agent

### 4.1 esp32-dev

**Serena-Use-Cases die theoretisch relevant waeren:**

| Serena-Tool | Anwendungsfall | Aktueller Ersatz |
|-------------|---------------|-----------------|
| `find_symbol` | C++ Klasse/Methode direkt finden ohne Dateipfad zu kennen | `grep -rn "class XManager"` |
| `find_referencing_symbols` | Impact-Analyse: Wer nutzt `IActuatorDriver`? | `grep -rn "IActuatorDriver"` |
| `get_symbols_overview` | Schneller Ueberblick ueber alle Symbole in `El Trabajante/src/` | `grep -rn "class\|struct" --include="*.h"` |
| `rename_symbol` | Klasse/Methode projektweit umbenennen ohne manuelle Grep-Kette | Manuell: Grep + Edit |
| `replace_symbol_body` | Methoden-Implementation ersetzen ohne Offset zu kennen | Read + Edit |

**Bewertung:** Grep-basierte Patterns im Pattern-Katalog (P1-P6) sind ausreichend fuer regulaere Entwicklung. Bei grossem Refactoring (z.B. Rename eines Core-Interfaces) waere `rename_symbol` im Hauptkontext nuetzlich - aber der Subagent selbst hat keinen Zugriff.

**Handlungsbedarf:** Keiner.

---

### 4.2 server-dev

**Serena-Use-Cases die theoretisch relevant waeren:**

| Serena-Tool | Anwendungsfall | Aktueller Ersatz |
|-------------|---------------|-----------------|
| `find_referencing_symbols` | Impact-Analyse: Wer importiert `BaseRepository`? | `grep -rn "from.*base_repo import"` |
| `get_symbols_overview` | Alle Services/Repositories auf einen Blick | `grep -rn "class.*Service\|class.*Repository"` |
| `rename_symbol` | Python-Klasse oder Methode projektweit umbenennen | Manuell: Grep + Edit |
| `insert_after_symbol` | Methode direkt nach einer bestimmten Methode einfuegen | Read + Edit mit Offset |
| `find_symbol` | Schnell `BaseMQTTHandler` lokalisieren | `grep -rn "class BaseMQTTHandler"` |

**Besonderheit server-dev:** Der Server hat die groesste Codebase (~60.604 Zeilen). Bei umfangreichen Refactorings (z.B. Umbenennung von Service-Methoden die in 20+ Dateien genutzt werden) waere `find_referencing_symbols` + `rename_symbol` im Hauptkontext eine erhebliche Zeitersparnis. Der server-dev Subagent kann das jedoch nicht direkt nutzen.

**Handlungsbedarf:** Keiner im Agent selbst. Aber: Bei komplexen Refactoring-Auftraegen sollte der User Serena im Hauptkontext nutzen, bevor er server-dev startet.

---

### 4.3 frontend-dev

**Serena-Use-Cases die theoretisch relevant waeren:**

| Serena-Tool | Anwendungsfall | Aktueller Ersatz |
|-------------|---------------|-----------------|
| `find_referencing_symbols` | Impact-Analyse: Welche Komponenten nutzen `useWebSocket()`? | `grep -rn "useWebSocket"` |
| `get_symbols_overview` | TypeScript-Interface-Uebersicht in `types/index.ts` (~979 Zeilen) | Read ganzer Datei |
| `rename_symbol` | TypeScript Interface oder Composable umbenennen | Manuell |
| `find_symbol` | Store-Action direkt finden | `grep -rn "function fetchAll"` |

**Besonderheit frontend-dev:** `types/index.ts` hat ~979 Zeilen und ist als "kritisch" markiert (Breaking Changes ueberall). `get_symbols_overview` waere hier beim Navigieren in grossen Type-Dateien hilfreich. `find_referencing_symbols` waere nuetzlich vor dem Aendern eines zentralen Types.

**Handlungsbedarf:** Keiner im Agent selbst. Der Hinweis in der kritischen Datei-Tabelle (Sektion 5) koennte um Serena-Empfehlung ergaenzt werden - aber da Subagenten keinen Zugriff haben, waere das eine Empfehlung an den menschlichen User, nicht an den Agenten.

---

### 4.4 mqtt-dev

**Serena-Use-Cases die theoretisch relevant waeren:**

| Serena-Tool | Anwendungsfall | Aktueller Ersatz |
|-------------|---------------|-----------------|
| `find_referencing_symbols` | Wer nutzt `TopicBuilder.build_sensor_topic()`? | `grep -rn "build_sensor_topic"` |
| `get_symbols_overview` | Alle `build_*` / `parse_*` Methoden in `topics.py` (~992 Zeilen) | Read + grep |
| `rename_symbol` | Topic-Methode umbenennen (Server + ESP32 synchron) | Manuell auf beiden Seiten |

**Besonderheit mqtt-dev:** Dieser Agent prueft BEIDE Seiten (Server + ESP32). `find_referencing_symbols` koennte bei der Synchronisations-Verifikation helfen: "Wird dieses Topic nirgendwo anders noch referenziert?" Das Grep-basierte Vorgehen reicht aber aus.

**Handlungsbedarf:** Keiner.

---

## 5. Gesamtbewertung: Soll Serena erwaehnt werden?

### Option A: Serena NICHT erwaehnen (empfohlen)

**Begruendung:**
1. Subagenten haben keinen MCP-Zugriff - jede Erwaehnung im Frontmatter ist technisch wirkungslos
2. Die bestehenden Grep/Glob/Read-Workflows decken alle Use-Cases ab (moeglicherweise langsamer, aber funktional)
3. Eine Erwaehnung wuerde falsche Erwartungen wecken: Der Agent kann Serena nicht aufrufen
4. Alle 4 Agents sind auf Version 2.0 und ihre Pattern-Kataloge sind vollstaendig

### Option B: Serena als Hinweis im Agent-Body erwaehnen

**Wo es stehen koennte:** In Sektion 9 (Referenzen) oder Sektion 10 (Querreferenzen) als Hinweis:
"Bei grossem Refactoring: Im Hauptkontext `mcp__plugin_serena_serena__find_referencing_symbols` nutzen vor Agent-Aufruf"

**Gegenargument:** Das waere ein Hinweis an den menschlichen User, nicht an den Agenten - besser in einem separaten Onboarding-Dokument oder dem SKILL.md des jeweiligen Entwicklungs-Skills aufgehoben.

### Option C: Serena in den SKILL.md Dateien erwaehnen

**Bewertung:** Die SKILL.md Dateien der Dev-Skills (esp32-development, server-development, etc.) werden im Hauptkontext gelesen. Dort waere ein Serena-Hinweis technisch sinnvoller, da der Hauptkontext-User tatsaechlich Zugriff auf Serena hat. Das faellt aber ausserhalb dieses Auftrags.

---

## 6. Fazit

**Antwort auf die Kernfrage:** Nein, die 4 Dev-Agents sollten Serena MCP-Tools weder im Frontmatter noch als erwaehnte nutzbare Tools aufnehmen, weil:

1. **Technisch unmoeglich:** `tools:` Frontmatter akzeptiert keine MCP-Tool-Namen
2. **Subagenten-Einschraenkung:** MCP-Tools sind nur im Hauptkontext verfuegbar
3. **Kein funktionaler Mehrwert:** Bestehende Grep/Glob/Read-Workflows erreichen dasselbe
4. **Kein Handlungsbedarf:** Alle 4 Agents sind auf Version 2.0 und voll funktional

**Wo Serena sinnvoll waere (ausserhalb des Auftrags-Scope):**
- In den SKILL.md Dateien als optionaler Beschleuniger fuer Refactoring-Szenarien im Hauptkontext
- Als expliziter Hinweis an den User bei komplexen Rename-/Impact-Analyse-Aufgaben

---

## 7. Offene Punkte

- Keine. Die Frage ist klar beantwortet: keine Aenderungen an den 4 Agent-Dateien notwendig oder sinnvoll.

## 8. Empfehlungen

- Falls Robin Serena-Hints fuer Entwickler dokumentieren moechte: In `.claude/skills/*/SKILL.md` als optionalen "Hauptkontext-Tipp"-Abschnitt ergaenzen (getrennt von den Subagenten-Workflows)
- Kein Aenderungsauftrag an den 4 Dev-Agents notwendig
