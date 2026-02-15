# TM-Command-Struktur Korrektur

Datum: 2026-02-11
Status: ✅ Durchgeführt

---

## Problem

Die Datei `Unit_tests_esp32.md` (1443 Zeilen) war im falschen Ordner:
- **War:** `.technical-manager/commands/pending/Unit_tests_esp32.md`
- **Typ:** Vollständiger Implementierungsplan (Output)
- **Gehört:** Nach `.technical-manager/inbox/agent-reports/`

---

## Korrektur durchgeführt

### Verschoben
```
Von: .technical-manager/commands/pending/Unit_tests_esp32.md
Nach: .technical-manager/inbox/agent-reports/esp32-native-unit-tests-plan-2026-02-11.md
```

### Grund
- TM-Commands (`commands/pending/`) = Kurze Aufträge AN Agents (Input)
- Agent-Reports (`inbox/agent-reports/`) = Detaillierte Reports VON Agents (Output)

---

## Verbleibende Dateien in commands/pending/

Die korrekte TM-Command-Datei bleibt erhalten:

**esp32-native-unit-tests-integration.md** (215 Zeilen)
- ✅ Korrekte Länge (< 300 Zeilen)
- ✅ Korrekte Struktur: Context → Goal → Success Criteria
- ✅ Datum: 2026-02-11 01:00
- ✅ Klarer Auftrag: "Erstelle einen vollständigen Implementierungsplan"
- ✅ Ziel-Pfad spezifiziert: `.technical-manager/inbox/agent-reports/`

---

## Nächste Schritte

1. **Robin:** Liest `esp32-native-unit-tests-integration.md` (Command)
2. **Robin:** Startet Agent (z.B. esp32-dev im Plan-Mode)
3. **Agent:** Analysiert Codebase, erstellt detaillierten Plan
4. **Agent:** Schreibt Report nach `.technical-manager/inbox/agent-reports/`
5. **TM:** Liest Report, gibt nächste Anweisungen

---

## Struktur-Pattern (korrekt)

```
.technical-manager/
├── commands/
│   └── pending/
│       └── [kurze-befehle-an-agents].md     # 50-300 Zeilen
│
└── inbox/
    └── agent-reports/
        └── [detaillierte-reports-yyyy-mm-dd].md  # 500-2000+ Zeilen
```

---

**Fazit:** Struktur korrigiert. TM-Workflow kann nun sauber funktionieren.
