# Agent-Management Report

**Erstellt:** 2026-02-10
**Modus:** Neuer Skill angelegt (auf Robin-Anfrage)
**Auftrag:** Neuen Skill erstellen, der Kontext aus dem Chat versteht, betroffene Bereiche vollständig auf KI-Fehler untersucht; Report standardmäßig, Fix nur auf Anfrage. Alle gelieferten Fehlerkategorien erfassen und nach Projekt-Pattern/Referenzen ausrichten.

---

## 1. Zusammenfassung

Neuer Skill **ki-audit** wurde erstellt und im Router registriert. Der Skill leitet den Prüfumfang aus dem vom User im Chat bereitgestellten Kontext ab (vs_claude_best_practice-konform), wendet den vollständigen KI-Fehler-Katalog (9 Kategorien inkl. aller Unterpunkte) an und nutzt die Projekt-Referenzen für faktenbasierte Prüfung. Standardverhalten: Analyse + Report; Korrekturen nur bei ausdrücklicher User-Anfrage. CLAUDE.md und skills/README.md wurden um den Eintrag für ki-audit ergänzt.

---

## 2. Angelegter Skill / Dokument

| Eigenschaft | Wert |
|-------------|------|
| Skill-Datei | `.claude/skills/ki-audit/SKILL.md` |
| Report-Output | `.claude/reports/current/KI_AUDIT_REPORT.md` |
| Trigger | ki-audit, KI-Fehler prüfen, Qualitätsaudit, Bereich auf KI-Fehler untersuchen, halluzinierte API, falsches Mapping |
| Abgrenzung | Kein Runtime-Debug (server/esp32/mqtt/frontend-debug), keine Cross-Report-Analyse (meta-analyst), kein TM-Plan-Check (verify-plan) |

---

## 3. Inhalt des Skills (Überblick)

- **Kontexterkennung:** Umfang aus User-Aussage (Datei, Bereich, Modul) → passende Fehler-Kategorien anwenden.
- **KI-Fehler-Katalog:** Strukturell (1.1–1.4), Logik/Semantik (2.1–2.4), Format/Encoding (3.1–3.3), Integration (4.1–4.4), Grafana (5.1–5.5), Docker (6.1–6.4), Python/FastAPI (7.1–7.3), ESP32 (8.1–8.3), Meta (9.1–9.5).
- **Referenzen:** api/, errors/, patterns/, infrastructure/, debugging/, testing/ – explizit in Skill Section 7 aufgeführt.
- **Regel:** Nur Report, außer User fordert explizit „fixen“ / „korrigieren“ / „anpassen“.

---

## 4. Durchgeführte Änderungen

### .claude/skills/ki-audit/SKILL.md (neu)
- **Inhalt:** Frontmatter (name, description mit MUST BE USED when / NOT FOR / Keywords), Kontexterkennung, vollständiger Fehler-Katalog, Arbeitsweise, Report-Format, Regeln, Trigger, Referenz-Tabelle, Abgrenzung.
- **Grund:** Robin-Anfrage nach neuem Skill für KI-Fehler-Audit mit allen gelieferten Fehlertypen und Referenz-Anbindung.

### .claude/CLAUDE.md
- **Vorher:** Skills-Tabelle endete mit verify-plan.
- **Nachher:** Eine Zeile ergänzt: „KI-Audit, Bereich auf KI-Fehler prüfen, Qualitätsaudit | `ki-audit`“.
- **Grund:** Skill im Haupt-Router sichtbar machen.

### .claude/skills/README.md
- **Vorher:** Skill-Auswahl und Ordnerstruktur ohne ki-audit.
- **Nachher:** ki-audit in Tabelle und in der Ordnerstruktur (ki-audit/SKILL.md) ergänzt.
- **Grund:** Index und Struktur aktuell halten.

---

## 5. Offene Punkte

- Keine. Skill ist eigenständig aufrufbar; kein neuer Agent oder Flow-Eintrag nötig (Skill-only wie verify-plan, git-commit).

---

## 6. Empfehlungen

- Optional: In `.claude/reference/testing/agent_profiles.md` einen Eintrag „Skill ki-audit“ in einer Skills-Sektion ergänzen, falls ihr Skills dort katalogisieren wollt.
- Bei ersten Einsätzen: Kontext im Chat klar benennen (z. B. „Grafana-Dashboards“, „docker-compose“, „El Servador health.py“), damit der Prüfumfang eindeutig ist.
