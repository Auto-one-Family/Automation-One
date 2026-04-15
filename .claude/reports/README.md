# Debug-Reports

> **Für Claude:** Hier speicherst du Debug-Analyse-Ergebnisse.

## Struktur

```
reports/
├── current/           # Aktuelle Debug-Session
│   ├── ESP32_REPORT.md
│   ├── SERVER_REPORT.md
│   ├── MQTT_REPORT.md
│   └── SYSTEM_REPORT.md
│
└── archive/           # Abgeschlossene Sessions
    └── [session-id]/
```

## Report-Zuordnung

| Agent | Report-Datei |
|-------|--------------|
| esp32-debug | `current/ESP32_REPORT.md` |
| server-debug | `current/SERVER_REPORT.md` |
| mqtt-debug | `current/MQTT_REPORT.md` |
| meta-analyst | `current/META_DEV_HANDOFF.md` (Default), `current/META_ANALYSIS.md` (Legacy Reports) |

## Report schreiben

1. **Immer in `current/` schreiben** (nicht archive/)
2. **Datei überschreiben** bei neuer Analyse (nicht append)
3. **Report-Template** aus Agent-Skill verwenden

## Report-Template

```markdown
# [AGENT] Report

**Datum:** [YYYY-MM-DD HH:MM]
**Modus:** [z.B. BOOT, SENSOR, STARTUP]
**Log-Quelle:** [Pfad zur analysierten Log-Datei]

---

## Zusammenfassung

| Prüfpunkt | Status | Details |
|-----------|--------|---------|
| ... | ✅/⚠️/❌ | ... |

**Gesamtstatus:** ✅ OK / ⚠️ Warnings / ❌ Fehler

---

## Findings

### Finding 1: [Titel]
**Log-Zeile:** `[relevanter Auszug]`
**Bedeutung:** [Interpretation]
**Empfehlung:** [Nächster Schritt]

---

## Nächste Schritte

1. [Empfehlung]
2. [Empfehlung]
```
