# Steuerauftrag: Beleg-MD nachpflegen — PhotosynQ/Pflanzen-Wissensbasis

**Datum:** 2026-04-30
**Run-ID:** gar-005-multispeq-2026-04-30
**Auftrag an:** auto-debugger (Analyst, nicht Implementierer)
**Prioritaet:** Low (kein blockierendes Finding, reine Dokumentations-Pflege)

---

## Aufgabe

Das Beleg-MD fuer den Run gar-005-multispeq-2026-04-30 muss nachgepflegt werden. Die Architektur-Uebergabe ist abgeschlossen, aber das Beleg-MD wurde noch nicht erstellt.

**Zielpfad im Auto-one-Repo:**
```
.claude/reports/current/auto-debugger-runs/gar-005-multispeq-2026-04-30/BELEG-photosynq-wissensbasis-2026-04-30.md
```

Falls der Ordner `gar-005-multispeq-2026-04-30/` noch nicht existiert: anlegen.

---

## Inhalt des Beleg-MD (vollstaendig, selbsttragend)

Das Beleg-MD muss folgende Sektionen enthalten:

### 1. Session-Kontext

- Session: gar-005-multispeq + gar-006-pflanzen-entity (2026-04-30)
- Thema: PhotosynQ/MultispeQ-Integration + eigenstaendige Pflanzen-Wissensbasis in AutomationOne
- Rolle: Analyst (keine Implementierung)

### 2. Zwei-Strang-Architektur-Entscheidung

**Strang A — Pflanzen-Wissensbasis (eigenstaendig in AutomationOne):**
- Pflanzendaten kommen ausschliesslich aus AutomationOne-Eingabe
- PhotosynQ-Snapshots erscheinen in Plant-Detail-Panel nur als read-only Mess-Historie (Einbahnstrasse)
- Issues: AUT-221 (Plant-Tab + Panel), AUT-222 (DB-Schema)

**Strang B — PhotosynQ/MultispeQ (Snapshot-Sensortyp in /sensors):**
- Heimat in SensorsView, Audits-Tab (Variante B, AUT-223 Done)
- Aus PhotosynQ kommen NUR Sensordaten via JSON
- PhotosynQ-App laeuft parallel weiter, wird nicht ersetzt
- Issues: AUT-217 (IngestService), AUT-213 (Audits-Tab + Upload-Modal), AUT-218 (Snapshot-Widgets)

**Gestrichene Variante:**
- Variante 3 (App-Fork / eigene Phyta-MultispeQ-App) war nie in Betracht gezogen worden
- Variante C (Upload nur im Plant-Detail-Panel) gestrichen — Upload muss ohne vorhandene Pflanze erreichbar sein

### 3. Plant-Matching-Strategie C+D

**Variante C — Custom-Field im PhotosynQ-Projekt:**
- Custom-Field-Name: `AutomationOne-Plant-ID` (hartcodiert, F1-Entscheidung)
- Wert = `external_plant_id` der Pflanze (= `qr_code`-Wert im Normalfall)
- IngestService liest Feld → Auto-Match gegen `plants.external_plant_id`
- Snapshots ohne Feld werden importiert (plant_id = NULL) → "needs review"-Liste

**Variante D — QR-Code am Standort:**
- AutomationOne generiert PNG-Etikett (GET /api/v1/plants/{id}/qr-code.png)
- Format: `PL-` + 8 Hex-Chars (D5-Entscheidung, z.B. `PL-A3F2C819`)
- Etikett am Topf/Standort; QR-Scan beim Messen fuellt Custom-Field automatisch
- Fallback: manuell aus Pflanzenliste ablesen und eintragen

### 4. Robin-Entscheidungen F1-F5 (verbindlich)

| # | Entscheidung | Begruendung |
|---|---|---|
| F1 | Custom-Field-Name = `AutomationOne-Plant-ID` | ASCII, selbsterklaerend, QR-tauglich, hartcodiert im Importer |
| F2 | IngestService mit abstrakter `ImportSource` (`manual_upload` / `api_pull`) + normalisiertes JSON-Schema | Parsing/Matching/Insert identisch fuer beide Quellen; nur Eintrittsschicht unterschiedlich |
| F3 | Hub-Eintrag im Life-Repo (C9 neu angelegt), kein Linear-Dach-Issue | Strategische Architektur in Hub; Linear bleibt issue-flach |
| F4 | AUT-223 = Variante B (eigener "Audits"-Tab in SensorsView) | Sensor-Tab = Streaming, Audits-Tab = Punktmessungen. Variante C gestrichen, OQ-4 gestrichen |
| F5 | Soll-Werte = Sensor-Config-Ebene via `loadThresholdsFromAlertConfig()` | DRY, Single Source of Truth, konsistent mit Alert-System |

### 5. Auswirkungen auf bestehende Issues

| Issue | Aenderung |
|---|---|
| AUT-223 | Komplett umgeschrieben + auf Done gesetzt. Entscheidungs-Anker, keine Implementierung hier. |
| AUT-217 | IngestService-Abstraktion + Plant-Matching + "needs review"-Endpoint ergaenzt. Abhaengigkeit AUT-222 ergaenzt. |
| AUT-213 | Audits-Tab-Spezifikation + Plant-Matching-UI + needs_review-Sektion ergaenzt. |
| AUT-218 | F5-Streichung: kein WidgetConfigPanel-Snapshot-Abschnitt; Schwellen aus alert_config. |
| AUT-216 | Teil 0 (PhotosynQ-Setup) + Teil 1 (QR-Workflow) ergaenzt; AutomationOne-Plant-ID als Pflichtfeld in SOP. |
| AUT-221 | Pflicht-Klarstellung Strang A; needs_review-Badge; external_plant_id bei POST automatisch setzen. |
| AUT-222 | external_plant_id-Konvention (auto-set = qr_code); UNIQUE-Index external_plant_id; qr-code.png-Endpoint; Verweis auf C9-Hub. |

### 6. Verweis auf Hub und neue Dateien

- Hub C9 (Life-Repo): `arbeitsbereiche/automation-one/architektur-autoone/C9-pflanzen-wissensbasis.md`
- Hub C8 (related-Verweis auf C9 ergaenzt): `arbeitsbereiche/automation-one/architektur-autoone/architektur-komplett.md`
- AUT-223: https://linear.app/autoone/issue/AUT-223 (Done)
- AUT-217: https://linear.app/autoone/issue/AUT-217 (Backlog, erweitert)
- AUT-221: https://linear.app/autoone/issue/AUT-221 (Backlog, geschaerft)
- AUT-222: https://linear.app/autoone/issue/AUT-222 (Backlog, geschaerft)

---

## Hinweis fuer auto-debugger

Dieser Steuerauftrag ist reine Dokumentations-Pflege. Keine Code-Analyse noetig. Das Beleg-MD soll die obigen Inhalte in der vorgeschriebenen Struktur abbilden — vollstaendig und selbsttragend, ohne Referenzen auf Life-Repo-Pfade im Beleg-MD selbst.

Nach Erstellung des Beleg-MD diese Steuerdatei als erledigt markieren (oder loeschen, je nach Konvention).
