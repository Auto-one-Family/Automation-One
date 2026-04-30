# BELEG: PhotosynQ / MultispeQ — Wissensbasis-Tab Optik + Konfiguration (Frontend)
**Datum:** 2026-04-30
**run_id:** gar-005-multispeq-2026-04-30
**Erstellt von:** @automation-experte (Life-Repo)
**Ziel-Issue:** AUT-223 (neu, s.u.)

---

## 1. Suchprotokoll (Search-vor-Create-Pflicht)

### Linear-Suchen durchgefuehrt:
| Query | Treffer |
|---|---|
| `photosynq` | 0 Issues (kein Match) |
| `MultispeQ` | 12 Issues: AUT-211..AUT-222 (alle heute 2026-04-30 erstellt) |
| `Wissensbasis` | 1 Issue: AUT-175 (Architektur-Wissensausbau, Done, unrelated) |
| `SensorsView` | 0 Issues (kein Match) |

**Befund:** Kein bestehender Issue adressiert die Optik/Konfiguration von MultispeQ
im Wissensbasis-Tab aus Operator-Perspektive (wie sieht es aus, wie stellt man es ein).
AUT-221 (Plant-Tab + Wissens-Schicht-Refactor) ist der naechste Verwandte, behandelt
aber Pflanzen-Entity und nicht die MultispeQ-Konfigurationsflaeche.

---

## 2. Bestandsanalyse — Wo lebt was heute?

### IST-Zustand MultispeQ im Frontend (Stand 2026-04-30):
- **Noch nicht implementiert** — AUT-211 bis AUT-222 alle Status: Backlog
- Kein MultispeQ-Touchpoint im Frontend vorhanden
- SensorsView.vue (`/sensors`) = einzige Tab-Ansicht "Sensoren" (Inventartabelle)
- AUT-213 plant: Upload-Modal (in HardwareView ODER eigene Route — Entscheidung offen)
- AUT-218 plant: Snapshot-Kennzeichnung in bestehenden Widgets
- AUT-221 plant: neuer Tab "Pflanzen" in SensorsView

### Kanonische Stelle fuer MultispeQ-Konfiguration (Konsolidierungs-Regel):
**`/sensors` (SensorsView.vue)** ist die kanonische Stelle fuer alles, was Wissen
und Inventar betrifft — nicht HardwareView (dort nur technische Konfiguration).
Beleg: architektur-frontend.md §4.5: "SensorsView — Inventar und Wissensbasis.
Keine Konfigurationspanels. Reines Inventar/Wissensdatenbank-Modell."

Konsequenz: Der MultispeQ-Upload-Button (AUT-213) sollte in `/sensors` sitzen,
NICHT in HardwareView. Aktuell ist AUT-213 offen gelassen ("HardwareView ODER
eigene Route"). Diese Entscheidung muss fixiert werden, bevor Implementation startet.

---

## 3. Optik-Optionen fuer den Wissensbasis-Tab (Robin-Entscheidung noetig)

### Variante A — "Tab-Erweiterung mit Sensor-Filter-Chip"
```
SensorsView (/sensors)
  Tab: "Sensoren"  |  Tab: "Pflanzen" (AUT-221)
  [Tab: "MultispeQ-Audits" NEU — optional, wenn Volumen gross genug]

  OR (einfacher):
  Tab: "Sensoren" mit Filter-Chip "Nur Snapshots" (sensor_kind=snapshot)
  -> zeigt alle 9 MultispeQ-Sensor-Zeilen mit letztem Messwert + Timestamp
  -> Upload-Button prominent in Tab-Header (nicht in Modal versteckt)
```
**Aufwand:** +0,5 PT (nur Filter-Chip + Upload-Button-Placement)
**Vorteil:** Kein neuer Tab, geringste Komplexitaet.
**Nachteil:** MultispeQ-Messungen verlieren sich zwischen allen Sensoren.

### Variante B — "Eigenstaendiger Tab 'Audits' in SensorsView"
```
SensorsView (/sensors)
  Tab: "Sensoren"  |  Tab: "Pflanzen" (AUT-221)  |  Tab: "Audits" (NEU)

  "Audits"-Tab:
  +-----------------------------------------------------------+
  | [Upload CSV/JSON] [Letzte 10 Messungen]                   |
  +-----------------------------------------------------------+
  | Messungs-Liste (pro Messung eine Zeile):                  |
  | Datum | Zone | Pflanze | Phi2 | NPQt | SPAD | Kalibrierung |
  | [>] Klick -> Detail-Drawer (alle 9 Parameter + Metadata)  |
  +-----------------------------------------------------------+
  | Konfiguration [Expand]:                                   |
  | Geraet-Seriennummer | Kalibrierungsdatum | Warnungsgrenze |
  +-----------------------------------------------------------+
```
**Aufwand:** +2-3 PT Frontend
**Vorteil:** Klare Trennung, voller Kontext fuer Operator, logisch neben "Pflanzen"-Tab.
**Nachteil:** Dritter Tab; macht nur Sinn wenn AUT-221 (Pflanzen-Tab) auch gebaut wird.

### Variante C — "Integriert in Plant-Detail-Panel (Sektion 3)"
```
Plant-Detail-Panel (AUT-221, SlideOver):
  Sektion 3: MultispeQ-Verlauf
    [Upload neue Messung fuer diese Pflanze] Button
    Scatter-Chart Phi2-Zeitreihe
    Letzte 5 Messungen als Tabelle
    Konfiguration: Soll-Wert-Bereich konfigurierbar (pro Phase)
```
**Aufwand:** 0 PT extra (integriert in AUT-221)
**Vorteil:** Kontextuell (immer im Bezug zur Pflanze), kein neuer Tab.
**Nachteil:** Upload nur erreichbar wenn man zuerst eine Pflanze oeffnet. Nicht
geeignet fuer Erstkonfiguration oder geraete-unabhaengige Audits.

---

## 4. Konsolidierungs-Befund

### Was dedupliziert werden muss (vor AUT-213-Implementation):
1. AUT-213 hat noch offene Platzierungs-Entscheidung: "HardwareView ODER eigene Route".
   Diese muss auf "SensorsView /sensors" festgelegt werden (kanonische Stelle).

2. Konfiguration (Soll-Wert-Baender, Snapshot-Warning-Tage) ist derzeit in
   AUT-218 (WidgetConfigPanel) geplant. Das ist Widget-Kontext, nicht Operator-Kontext.
   Ein dedizierterer Konfig-Pfad in SensorsView waere besser (Operator stellt einmal ein,
   Widget erbt den Wert). Diese Frage ist in AUT-223 zu klaeren.

3. Upload-Trigger: Soll der Upload-Button IN der Pflanzen-Ansicht (AUT-221 Sektion 3)
   oder davor (SensorsView Tab-Header / Audits-Tab) sitzen? Beide Issues (AUT-213 +
   AUT-221) beruehren das gerade — kein Konflikt solange die Platzierung eindeutig ist.

---

## 5. Quell-Referenzen

| Quelle | Typ | Relevanz |
|---|---|---|
| AUT-211 | Linear, Backlog | DB-Schema-Basis; kein Frontend-Bezug |
| AUT-213 | Linear, Backlog | Upload-Modal (offen: Platzierung) |
| AUT-218 | Linear, Backlog | Snapshot-Kennzeichnung + WidgetConfigPanel-Erweiterung |
| AUT-221 | Linear, Backlog | Plant-Tab + Plant-Detail-Panel (Sektion 3 = MultispeQ-Verlauf) |
| architektur-frontend.md §4.5 | C5-Hub | SensorsView = kanonische Wissensbasis-Stelle |
| multispeq-wissensschicht-automationone-2026-04-30.md | Life-Repo | IST/SOLL-Analyse F4' |
| multispeq-virtueller-sensor-datenmodell-2026-04-30.md | Life-Repo | Sektion 5 Dashboard-Widgets |
| report-frontend-F10-inventar-kalibrierung-2026-04-05.md | Life-Repo | F10: SensorsView-Inventarfluss |
