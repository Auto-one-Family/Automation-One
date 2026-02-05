---
name: collect-reports
description: |
  Report-Konsolidierer für AutomationOne.
  Verwenden bei: "Reports sammeln", "Reports konsolidieren", "Report für TM",
  "collect reports", "alle Reports zusammenfassen", Session-Ende, Übergabe an TM.
  NICHT verwenden für: Einzelne Reports lesen, Report-Analyse, Debugging.
  Output: .claude/reports/current/CONSOLIDATED_REPORT.md
allowed-tools: Read, Glob, Write
user-invocable: true
---

# Collect-Reports Skill

> **Zweck:** Konsolidiert alle Reports aus `.claude/reports/current/` in eine einzelne Datei für den Technical Manager (TM).

---

## Workflow

### 1. Reports sammeln

```bash
# Alle .md Dateien aus reports/current/ auflisten
Glob: .claude/reports/current/*.md
```

**Ausschluss:** `CONSOLIDATED_REPORT.md` selbst (falls vorhanden)

### 2. Reports lesen

Für jede gefundene Datei:
- Vollständigen Inhalt lesen
- Dateiname merken

### 3. Konsolidierten Report erstellen

**Zieldatei:** `.claude/reports/current/CONSOLIDATED_REPORT.md`

**Struktur:**

```markdown
# Konsolidierter Report

**Erstellt:** {ISO-Timestamp}
**Branch:** {aktueller Git-Branch}
**Anzahl Reports:** {n}

## Einbezogene Reports

| # | Report | Zeilen |
|---|--------|--------|
| 1 | SESSION_BRIEFING.md | 156 |
| 2 | AGENT_DUPLICATE_ANALYSIS.md | 89 |
| ... | ... | ... |

---

## 1. SESSION_BRIEFING.md

{Vollständiger Inhalt des Reports}

---

## 2. AGENT_DUPLICATE_ANALYSIS.md

{Vollständiger Inhalt des Reports}

---

## Priorisierte Problemliste

### KRITISCH
- {Aus Reports extrahierte kritische Probleme}

### WARNUNG
- {Aus Reports extrahierte Warnungen}

### INFO
- {Aus Reports extrahierte Informationen}

---

**Konsolidierter Report bereit.**
Kopiere `.claude/reports/current/CONSOLIDATED_REPORT.md` zum Technical Manager.
```

---

## Extraktion der Problemliste

Suche in allen Reports nach:

| Marker | Priorität |
|--------|-----------|
| `KRITISCH`, `CRITICAL`, `ERROR`, `FEHLER` | KRITISCH |
| `WARNUNG`, `WARNING`, `WARN`, `⚠️` | WARNUNG |
| `INFO`, `HINWEIS`, `NOTE`, `ℹ️` | INFO |

Zusätzlich:
- Tabellenzeilen mit `❌` → KRITISCH
- Tabellenzeilen mit `⚠️` → WARNUNG
- Bullet-Points unter "Probleme", "Issues", "Fehler" → entsprechend kategorisieren

---

## Ausführungsbeispiel

```
1. Glob: .claude/reports/current/*.md
   → Gefunden: SESSION_BRIEFING.md, AGENT_DUPLICATE_ANALYSIS.md, DOCUMENTATION_INVENTORY.md

2. Read: Alle 3 Dateien

3. Analyse: Probleme extrahieren
   - KRITISCH: Keine gefunden
   - WARNUNG: 2 gefunden (aus AGENT_DUPLICATE_ANALYSIS.md)
   - INFO: 5 gefunden

4. Write: CONSOLIDATED_REPORT.md
   - Header mit Timestamp
   - Tabelle der Reports
   - Vollständiger Inhalt jedes Reports
   - Priorisierte Problemliste
   - Abschluss-Hinweis
```

---

## Regeln

1. **Vollständig einbetten** – Reports NICHT zusammenfassen, vollständig kopieren
2. **Reihenfolge** – Alphabetisch nach Dateiname
3. **Selbst-Ausschluss** – `CONSOLIDATED_REPORT.md` NICHT einbeziehen
4. **Immer überschreiben** – Vorherige `CONSOLIDATED_REPORT.md` ersetzen
5. **Timestamp** – ISO-8601 Format mit Zeitzone

---

## Trigger-Keywords

- "Reports sammeln"
- "Reports konsolidieren"
- "Report für TM"
- "collect reports"
- "alle Reports zusammenfassen"
- "Session-Übergabe"
- "Briefing erstellen"

---

*Konsolidiert Reports für Technical Manager Übergabe.*
