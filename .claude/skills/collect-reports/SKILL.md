---
name: collect-reports
description: |
  Report-Konsolidierer für AutomationOne.
  Verwenden bei: "Reports sammeln", "Reports konsolidieren", "Report für TM",
  "collect reports", "alle Reports zusammenfassen", Session-Ende, Übergabe an TM,
  "räum mal auf", "konsolidiere die Reports in {Ordner}".
  NICHT verwenden für: Einzelne Reports lesen, Report-Analyse, Debugging.
allowed-tools: Read, Glob, Write, Bash
user-invocable: true
---

# Collect-Reports Skill

> **Zweck:** Konsolidiert Reports aus einem beliebigen Ordner in ein zusammenhängendes Dokument. Archiviert die verarbeiteten Quell-Reports anschließend.

---

## Quellordner-Erkennung

Der Quellordner ist **nicht hardcoded**. Er kommt aus dem Kontext — Robin nennt ihn explizit oder er ergibt sich aus dem Auftrag.

**Beispiele:**
- "konsolidiere die Reports in `.technical-manager/inbox/agent-reports/`" → Ordner klar
- "collect reports" (ohne Pfad) → Default: `.claude/reports/current/`
- "räum mal `.technical-manager/inbox/system-logs/` auf" → Ordner klar

**Regel:** Wenn kein Ordner erkennbar → `.claude/reports/current/` als Default verwenden.

---

## Workflow (3 Schritte)

### Schritt 1 — Inventar

Scanne den Quellordner und gib Robin per Chatnachricht einen Überblick:

1. **Glob** alle `.md` Dateien im Quellordner
2. `CONSOLIDATED_REPORT.md` ausschließen (falls vorhanden)
3. Jeden Report kurz lesen (Header, erste Zeilen) um Thema zu erkennen
4. **Zusammenhänge identifizieren:**
   - Thematisch (z.B. Debug-Report + Dev-Report zum selben Problem)
   - Zeitlich (Timestamps vergleichen, Reihenfolge rekonstruieren)
   - Als Kette (z.B. Analyse → Fix → Verifikation)
   - Alleinstehende Reports markieren
5. Robin den Überblick als Chatnachricht präsentieren:
   - Welche Reports sind da
   - Welche gehören zusammen (mit Begründung)
   - Welche stehen allein

**Bei wenigen Reports oder klarem Zusammenhang:** Direkt starten vorschlagen. Robin entscheidet.

### Schritt 2 — Konsolidieren

Eins nach dem anderen. Langsam, schrittweise, gründlich.

1. Jeden Quell-Report **vollständig lesen** und verstehen bevor er eingearbeitet wird
2. Konsolidierten Bericht als **zusammenhängendes Dokument** aufbauen
3. **Nichts weglassen** was relevant ist — der Bericht muss so vollständig sein, dass jemand der die Einzelreports nie gesehen hat den kompletten Stand versteht
4. Konsolidiertes Dokument in den **Quellordner** schreiben (oder Robin gibt Zielort vor)

**Zieldatei:** `{Quellordner}/CONSOLIDATED_REPORT.md`

**Struktur:**

```markdown
# Konsolidierter Report

**Erstellt:** {ISO-Timestamp}
**Branch:** {aktueller Git-Branch}
**Quellordner:** {Pfad}
**Anzahl Reports:** {n}

## Einbezogene Reports

| # | Report | Thema | Zeilen |
|---|--------|-------|--------|
| 1 | grafana-analysis-2026-02-09.md | Grafana Setup | 312 |
| 2 | prometheus-analysis-2026-02-09.md | Prometheus Config | 198 |
| ... | ... | ... | ... |

---

## 1. {Report-Name}

{Vollständiger Inhalt des Reports}

---

## 2. {Report-Name}

{Vollständiger Inhalt des Reports}

---

## Priorisierte Problemliste

### KRITISCH
- {Aus Reports extrahierte kritische Probleme}

### WARNUNG
- {Aus Reports extrahierte Warnungen}

### INFO
- {Aus Reports extrahierte Informationen}
```

### Schritt 3 — Archivieren

Quell-Reports die im konsolidierten Bericht enthalten sind werden in den Archiv-Ordner verschoben.

**Archiv-Zuordnung:**

| Quellordner | Archiv-Ordner |
|-------------|---------------|
| `.claude/reports/current/` | `.claude/reports/archive/` |
| `.technical-manager/inbox/agent-reports/` | `.technical-manager/archive/` |
| `.technical-manager/inbox/system-logs/` | `.technical-manager/archive/` |
| Anderer Ordner | Robin gibt Archiv-Pfad vor, oder `archive/` Unterordner im selben Verzeichnis |

**Archivierungs-Pattern erkennen:**
Vor dem Verschieben den bestehenden Archiv-Ordner scannen und das vorhandene Muster übernehmen.

Bekanntes Pattern in `.claude/reports/archive/`:
```
YYYY-MM-DD_HH-MM_beschreibung/
  └── report1.md
  └── report2.md
```

**Ablauf:**
1. Archiv-Ordner anhand der Tabelle bestimmen
2. Bestehendes Archiv-Pattern prüfen (Datums-Ordner vorhanden? Flat? Etc.)
3. Neuen Archiv-Unterordner nach dem bestehenden Pattern erstellen
4. **Nur Reports verschieben die tatsächlich konsolidiert wurden** — was nicht einbezogen wurde bleibt wo es ist
5. Verschiebung per Bash: `mv {quelle} {archiv-ordner}/`
6. Robin über die Verschiebung informieren

**Wichtig:** `CONSOLIDATED_REPORT.md` wird NICHT archiviert — sie bleibt im Quellordner.

---

## Extraktion der Problemliste

Suche in allen Reports nach:

| Marker | Priorität |
|--------|-----------|
| `KRITISCH`, `CRITICAL`, `ERROR`, `FEHLER` | KRITISCH |
| `WARNUNG`, `WARNING`, `WARN` | WARNUNG |
| `INFO`, `HINWEIS`, `NOTE` | INFO |

Zusätzlich:
- Tabellenzeilen mit `❌` → KRITISCH
- Tabellenzeilen mit `⚠️` → WARNUNG
- Bullet-Points unter "Probleme", "Issues", "Fehler" → entsprechend kategorisieren

---

## Ausführungsbeispiel

```
Robin: "konsolidiere die Reports in .technical-manager/inbox/agent-reports/"

1. Quellordner erkannt: .technical-manager/inbox/agent-reports/

2. Inventar:
   Glob: .technical-manager/inbox/agent-reports/*.md
   → 11 Reports gefunden
   → Zusammenhänge: 5x Monitoring-Stack (Grafana, Prometheus, Promtail, Loki, pgAdmin),
     3x system-control Korrekturen, 2x Dev-Reports, 1x agent-manager
   → Robin: "11 Reports, 3 thematische Gruppen. Soll ich konsolidieren?"

3. Robin: "ja"

4. Konsolidieren:
   → Jeden Report vollständig lesen und einarbeiten
   → CONSOLIDATED_REPORT.md in .technical-manager/inbox/agent-reports/ schreiben

5. Archivieren:
   → Archiv-Ordner: .technical-manager/archive/
   → Pattern prüfen (oder neuen Ordner erstellen)
   → 11 Quell-Reports nach .technical-manager/archive/YYYY-MM-DD_HH-MM_beschreibung/ verschieben
   → CONSOLIDATED_REPORT.md bleibt
```

---

## Regeln

1. **Vollständig einbetten** — Reports NICHT zusammenfassen, vollständig kopieren
2. **Reihenfolge** — Thematisch gruppiert, innerhalb der Gruppe chronologisch
3. **Selbst-Ausschluss** — `CONSOLIDATED_REPORT.md` NICHT einbeziehen und NICHT archivieren
4. **Immer überschreiben** — Vorherige `CONSOLIDATED_REPORT.md` ersetzen
5. **Timestamp** — ISO-8601 Format
6. **Erst konsolidieren, dann archivieren** — Nie Dateien verschieben bevor der konsolidierte Bericht geschrieben ist
7. **Nur Konsolidiertes archivieren** — Was nicht im Bericht ist, bleibt im Quellordner

---

## Trigger-Keywords

- "Reports sammeln"
- "Reports konsolidieren"
- "Report für TM"
- "collect reports"
- "alle Reports zusammenfassen"
- "Session-Übergabe"
- "räum mal auf"
- "konsolidiere die Reports in {Ordner}"

---

*Konsolidiert Reports aus beliebigen Ordnern, archiviert verarbeitete Quellen.*
