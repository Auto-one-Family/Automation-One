# Auftrag: Layout-Optimierung Monitor-Seite — Ueberschriften, Zaehlung, Reihenfolge der Sektionen

> **Erstellt:** 2026-03-03  
> **Erstellt von:** Automation-Experte (Life-Repo)  
> **Ziel-Repo:** AutomationOne (El Frontend)  
> **Kontext:** Drei getrennte Analyse- und Fix-Auftraege; hier: Monitor-UI uebersichtlicher machen — keine doppelte Zaehlung, selbst erstellte Dashboards nicht „im Weg“.  
> **Prioritaet:** Mittel (UX-Verbesserung)  
> **Kernursache:** Doppelte Zaehlung (Sektion + Subzone-Zeile); Dashboard-Sektionen stehen vor Sensoren/Aktoren und werden als „im Weg“ empfunden.

---

## Ist-Zustand / Befund

**Relevante View:** `El Frontend/src/views/MonitorView.vue` (ca. 3112 Zeilen; L1/L2 per `v-if="!isZoneDetail"` / `v-else` getrennt)

### Zwei Ebenen

- **L1** = Monitor-Uebersicht (Zonen-Kacheln)
- **L2** = Zonen-Detail (eine Zone mit Sensoren/Aktoren)

### Verwirrende Ueberschriften und doppelte Zaehlung (L2)

- Sektionen: **„Sensoren ({{ zoneSensorCount }})“** (Zeile 1528) und **„Aktoren ({{ zoneActuatorCount }})“** (Zeile 1622).
- Die **Subzone-Zeile** (Name „Keine Subzone“ bzw. Subzone-Name + Count rechts) wird nur gerendert, wenn `zoneSensorGroup.subzones.length > 1 || subzone.subzoneName` (Sensoren: Zeilen 1542–1543; Aktoren: 1632–1633). Bei **genau einer** Subzone ohne Namen ist die Zeile ausgeblendet.
- **Doppelte Zaehlung** entsteht vor allem bei **mehreren** Subzones: Sektionsueberschrift zeigt Gesamtzahl, jede Subzone-Zeile zeigt nochmal die Teilsumme (z. B. „Keine Subzone · 3 Sensoren“) → redundant. Count-Anzeige: Sensoren-Zeile 1547, Aktoren-Zeile 1639.

### „Selbst erstellte Dashboards versperren den Weg“

- **L1 (Uebersicht):** Zonen-Kacheln enden Zeile 1379. Danach: Karte **„Dashboards (N)“** Zeilen 1381–1424, dann **InlineDashboardPanel** 1429–1435. Gewuenschte Reihenfolge „Zonen zuerst, danach Dashboards/Inline“ ist im Code bereits so; optional: Dashboards/Inline weiter nach unten oder in kollabierbaren Bereich setzen, falls sie als „im Weg“ empfunden werden.
- **L2 (Zonen-Detail):** Aktuelle Reihenfolge: Zonen-Header → **Zone-Dashboards** (Zeilen 1487–1526) → **Sensoren** (1527–1620) → **Aktoren** (1621–1663) → **InlineDashboardPanel** (1665–1671). Zone-Dashboards stehen also vor Sensoren/Aktoren und werden als „im Weg“ empfunden.

---

## Ziel

- **Klare, nicht redundante** Ueberschriften und Zaehlung.
- **Selbst erstellte Dashboards** (Karte „Dashboards“, Zone-Dashboards, Inline-Panels) **stoeren nicht** und liegen **am Ende** des sichtbaren Bereichs (nach Zonen-Uebersicht bzw. nach Sensoren/Aktoren).

---

## Vorgehen (technische Schritte)

### 1. Ueberschriften und Zaehlung (L2)

- **Eine klare, einheitliche Regel** umsetzen (nur eine Stelle zeigt die Zahl):
  - **Variante A:** Sektionsueberschrift „Sensoren“ / „Aktoren“ **mit** Gesamtzahl (Zeilen 1528, 1622); in der Subzone-Zeile **nur** Subzone-Name + Status, **keine** Count-Anzeige (Zeilen 1547, 1639 entfernen oder nur bei mehreren Subzones als Teilsumme zeigen).
  - **Variante B:** Zaehlung **nur** in der Subzone-Zeile (1547, 1639); in der Sektionsueberschrift **keine** Zahl (1528, 1622: „Sensoren“ / „Aktoren“ ohne `({{ zoneSensorCount }})`).
- **„Keine Subzone“:** Wird heute mit `{{ subzone.subzoneName || 'Keine Subzone' }}` (1545, 1638) ausgegeben. Beibehalten; optional nur anzeigen, wenn `!subzone.subzoneId` bzw. tatsaechlich keine Subzone.
- Subzone-Header-Sichtbarkeit nicht aendern: `v-if="zoneSensorGroup.subzones.length > 1 || subzone.subzoneName"` (1542, 1632) bleibt, damit bei einer Subzone ohne Namen keine redundante Zeile erscheint.

### 2. Reihenfolge L1 (Monitor-Uebersicht)

- L1 hat bereits die Reihenfolge: Zonen-Grid (bis 1379) → „Dashboards (N)“-Karte (1381–1424) → InlineDashboardPanel (1429–1435). Kein Verschieben noetig, sofern nur „Zonen zuerst“ gewuenscht ist.
- Falls gewuenscht: Dashboard-Karte + Inline-Panels optisch zuruecknehmen (z. B. standardmaessig eingeklappt oder unter einen „Weitere Dashboards“-Abschnitt am Seitenende).

### 3. Reihenfolge L2 (Zonen-Detail)

- **Block verschieben:** Die komplette `<section class="monitor-dashboards">` **Zone-Dashboards** (Zeilen 1487–1526) als Ganzes **ausschneiden** und **nach** der Aktoren-Sektion (nach Zeile 1663) und **vor** dem Kommentar „Inline Dashboard Panels for this zone“ (vor Zeile 1665) **einfuegen**.
- Ergebnis: Zonen-Header → Sensoren (1527–1620) → Aktoren (1621–1663) → Zone-Dashboards → InlineDashboardPanel (1665–1671). **Zielreihenfolge: Zonen-Header → Sensoren → Aktoren → Zone-Dashboards → Inline-Panels.**

### 4. UI/UX-Konsistenz

- Ueberschriften nutzen bereits `class="monitor-section__title"` (H3); Styles in MonitorView.vue ab Zeile 2237. Pruefen, ob Lesbarkeit und Hierarchie mit **Design-Tokens** (`El Frontend/src/styles/tokens.css`: `--color-text-*`, `--space-*`, `--radius-*`) und bestehenden Monitor-Klassen (z. B. `monitor-subzone__header`, 2252) konsistent sind.

---

## Akzeptanzkriterien

- [x] L2: Keine doppelte Zaehlung; entweder nur in Sektionsueberschrift oder nur in Subzone-Zeile (einheitliche Regel); „Keine Subzone“ klar und nur bei fehlender Subzone.
- [x] L1: Reihenfolge „Zonen-Kacheln → Dashboards (N) → Inline-Panels“; Hauptinhalte (Zonen) zuerst.
- [x] L2: Reihenfolge „Zonen-Header → Sensoren → Aktoren → Zone-Dashboards → Inline-Panels“; Dashboards am Ende.
- [x] Ueberschriften-Hierarchie (H2/H3) und Abstaende mit Design-System konsistent.

## Erledigt (2026-03-03)

- **Zaehlung (Variante A):** Sektionsueberschrift „Sensoren (N)“ / „Aktoren (N)“ unveraendert. Subzone-Zeile zeigt Count nur bei `subzones.length > 1` (Teilsumme), sonst keine doppelte Anzeige.
- **L2 Reihenfolge:** Block `monitor-dashboards` (Zone-Dashboards) von vor Sensoren nach hinter Aktoren verschoben; Reihenfolge jetzt: Zonen-Header → Sensoren → Aktoren → Zone-Dashboards → Inline-Panels.
- **Design:** `monitor-section__title` und Subzone-Styles nutzen bereits `var(--text-base)`, `var(--color-text-*)`, `var(--space-*)`, `var(--radius-sm)` aus tokens.css.
- **Backend/ESP32:** Keine Aenderung noetig; Zaehlung kommt aus Frontend-computed (zoneSensorGroup/zoneActuatorGroup aus espStore).

---

## Referenzen (Codebase)

| Bereich | Datei / Ort |
|--------|-------------|
| View | `El Frontend/src/views/MonitorView.vue` — L1: 1292–1436, L2: 1439–1674; Sektionen „Sensoren“ 1527–1620, „Aktoren“ 1621–1663, „Zone-Dashboards“ 1487–1526, InlineDashboardPanel 1429–1435 (L1), 1665–1671 (L2) |
| Komponente | `El Frontend/src/components/dashboard/InlineDashboardPanel.vue` (Import Zeile 63) |
| Design | `El Frontend/src/styles/tokens.css`; Monitor-spezifische Styles in MonitorView.vue ab ca. Zeile 2237 (`monitor-section__title`, `monitor-subzone__*`) |

---

## Verify-Plan Prüfung (2026-03-03)

- **Pfade:** `El Frontend/src/views/MonitorView.vue` und `El Frontend/src/styles/tokens.css` existieren; `InlineDashboardPanel` aus `@/components/dashboard/InlineDashboardPanel.vue`.
- **Zeilennummern:** An Ist-Zustand und Vorgehen angepasst (Zone-Dashboards enden bei 1526, nicht 1572; L2 Inline 1665–1671).
- **Subzone-Logik:** Bedingung `subzones.length > 1 || subzone.subzoneName` fuer die Subzone-Zeile im Plan ergaenzt, damit Redundanz bei einer Subzone verstanden wird.
- **L2 Reihenfolge:** Konkrete Anweisung eingefuegt: Block 1487–1526 nach Zeile 1663 einfügen, vor 1665.

---

## Kurzuebersicht

| # | Thema | Kernursache |
|---|--------|-------------|
| 3 | Layout Monitor | Doppelte Zaehlung (Sektion + Subzone-Zeile); Dashboard-Sektionen stehen vor Sensoren/Aktoren und werden als „im Weg“ empfunden. |
