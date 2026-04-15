# Metrik-Notiz: TM-Workflow Ueberarbeitung + Monitor L2 Layout-Analyse

**Datum:** 2026-04-15
**Paket:** TM-Workflow v2.0 + Monitor L2 Layout & Sensor-Card Fixes

---

## Kennzahlen

| Metrik | Wert |
|--------|------|
| F1-Zyklen bis Issues standen | 1 (Analyse direkt, kein voller Debug-Cycle noetig) |
| Erster Agent korrekt? | Ja — `frontend-dev` fuer alle 12 Issues |
| Schaetzung Analyse | ~2h (real: ~2h via 3 parallele Sub-Agenten) |
| Schaetzung TM-Workflow-Dateien | ~1h (real: ~1h) |
| Issues erstellt | 12 (6 Cluster, 3 Phasen) |
| Analyse-Dokumente | 4 Dateien unter docs/analysen/frontend/ |
| TM-Workspace-Dateien aktualisiert | 3 (TECHNICAL_MANAGER.md, README.md, TM_WORKFLOW.md) |

## Workflow-Pfad gewaehlt

**Analysepfad (nicht Fast-Track)** — Begruendung:
- Mehrere Sub-Bereiche betroffen (CSS, Vue, Store, Formatierung, Mock-Logik)
- Mock vs. Real Abgrenzung erforderte Datenpfad-Analyse
- EC als Fokus-Sensor brauchte Tiefenanalyse

## Format-Compliance der Issues

| Pflichtfeld | Erfuellt? | Anmerkung |
|------------|-----------|-----------|
| Titel mit [Schicht] | Teilweise | `fix:` Prefix vorhanden, `[Frontend]` fehlt |
| Agent-Zuweisung | Ja | Alle: `frontend-dev` |
| Kontextblock (Problem/Scope/Ursache/Loesung) | Ja | Vollstaendig |
| Abhaengigkeiten | Ja | Linear-Relations gesetzt |
| verify-plan Hinweis | Nein | Nachtraeglich hinzufuegen |
| Akzeptanzkriterien | Ja | 3-7 Punkte pro Issue |
| Pattern-Referenz | Teilweise | Dateipfade genannt, aber kein "wie X Pattern" |

**Todo fuer naechste Session:** Titel-Format und verify-plan Hinweis in allen 12 Issues nachtragen.

## Erkenntnisse

1. Parallele Sub-Agenten (3x) fuer Code-Analyse funktioniert gut — 3 verschiedene Perspektiven (Layout, CSS, Datenpfad)
2. Linear-Issue-Erstellung direkt aus Analyse (ohne Zwischen-Datei-Schritt) spart Copy/Paste
3. Anti-KI-Regeln: "Belegt vs. Hypothese" Kennzeichnung in Issues gut umgesetzt
4. 12 Issues statt 5 grosse: richtige Entscheidung — jedes Issue hat klaren Single-Agent-Scope

---

*Naechstes Paket: verify-plan Phase 1 Quick Wins (AUT-26, AUT-28, AUT-30)*
