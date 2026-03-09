# TM-Workflow (Technical Manager Integration)

Der Technical Manager (TM) ist eine Claude Desktop-Instanz – hat **KEINEN direkten Projektzugriff**. Der User ist die einzige Schnittstelle (Copy/Paste zwischen VS Code und Claude Desktop).

**TM-Workspace:** `.technical-manager/` (Router: `TECHNICAL_MANAGER.md`, 3 Skills, Config, Archive)
**TM-Skills:** infrastructure-status, ci-quality-gates, strategic-planning
**Kommunikation:** TM schreibt nach `commands/pending/`, VS Code Reports nach `inbox/agent-reports/`

## Test-Flow (Analyse & Debugging)

```
1. User fuehrt `scripts/debug/start_session.sh` aus -> `logs/current/STATUS.md` wird generiert
2. User schreibt "Session gestartet" + Hardware-Info -> system-control (Briefing-Modus) aktiviert sich
3. system-control liest STATUS.md, erstellt SESSION_BRIEFING.md
4. User kopiert SESSION_BRIEFING.md zum Technical Manager (Claude Desktop, extern)
5. TM analysiert Briefing, formuliert Agent-Befehle (einzeln pro Agent)
6. User fuehrt system-control ZUERST aus -> generiert Log-Daten, Operations-Bericht
7. User fuehrt Debug-Agents EINZELN aus (esp32-debug, server-debug, mqtt-debug, frontend-debug) -> jeder schreibt eigenen Report
8. User ruft /collect-reports auf -> CONSOLIDATED_REPORT.md
9. User kopiert CONSOLIDATED_REPORT.md zum TM
10. TM analysiert, aktiviert meta-analyst fuer Cross-Report-Vergleich
11. Weitere TM-Analysen oder Wechsel zum Dev-Flow
```

## Dev-Flow (Implementierung)

```
1. TM hat durch Test-Flow alle Probleme identifiziert und priorisiert
2. TM formuliert gezielte Dev-Agent-Befehle (je ein Befehl pro Agent)
3. User fuehrt Dev-Agents EINZELN aus (esp32-dev, server-dev, mqtt-dev, frontend-dev)
4. Nach Implementierung -> zurueck zum Test-Flow zur Verifikation
```

## Agent-Aktivierungsreihenfolge (Test-Flow)

| Schritt | Agent/Skill | Funktion | Output |
|---------|-------------|----------|--------|
| 1 | `system-control` (Briefing-Modus) | Erstellt Session-Briefing | SESSION_BRIEFING.md -> zum TM |
| 2 | `system-control` (Ops-Modus) | Generiert Logs, fuehrt Operationen aus | Operations-Bericht (MUSS VOR Debug-Agents) |
| 3 | Debug-Agents | Logs analysieren (einzeln, parallel moeglich) | Individuelle Reports |
| | - `esp32-debug` | ESP32 Serial-Log | ESP32_*_REPORT.md |
| | - `server-debug` | Server JSON-Log | SERVER_*_REPORT.md |
| | - `mqtt-debug` | MQTT-Traffic | MQTT_*_REPORT.md |
| | - `frontend-debug` | Frontend Build/Runtime | FRONTEND_*_REPORT.md |
| 4 | `/collect-reports` | Konsolidiert alle Reports | CONSOLIDATED_REPORT.md -> zum TM |
| 5 | `meta-analyst` | Cross-Report-Vergleich, Widersprueche finden | META_ANALYSIS.md |

## Wechsel Test-Flow -> Dev-Flow

Der Technical Manager entscheidet den Wechsel wenn:
- Alle Probleme durch Test-Flow + meta-analyst identifiziert und priorisiert sind
- Die Problemliste praezise genug ist um gezielte Dev-Auftraege zu formulieren
- Keine weiteren Analyse-Runden noetig sind

Der Wechsel zurueck (Dev-Flow -> Test-Flow) erfolgt nach jeder Implementierung zur Verifikation.

## Wichtige Regeln im TM-Workflow

- **Agents werden IMMER einzeln** im VS Code Chat-Fenster gestartet
- **system-control kommt IMMER vor den Debug-Agents** (er generiert die Logs)
- **Der TM codet nicht** – er beschreibt praezise, die Dev-Agents setzen um
- **Jeder Report geht via User zum TM** – keine direkte Agent-Kommunikation
