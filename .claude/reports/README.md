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
| ESP32_DEBUG_AGENT | `current/ESP32_REPORT.md` |
| SERVER_DEBUG_AGENT | `current/SERVER_REPORT.md` |
| MQTT_DEBUG_AGENT | `current/MQTT_REPORT.md` |
| DEBUG_ORCHESTRATOR | `current/SYSTEM_REPORT.md` |

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
