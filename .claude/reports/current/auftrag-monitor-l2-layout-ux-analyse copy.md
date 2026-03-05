# Auftrag: Monitor L2 — Layout & UX-Analyse (Subzone-Darstellung optimieren)

> **Erstellt:** 2026-03-04  
> **Basis:** `zonen-subzonen-vollanalyse-bericht-2026-03-04.md`, Robins Layout-Vorstellungen  
> **Priorität:** Mittel (nach Funktional-Fix)  
> **Ziel:** Ein **ordentlicher Ansatz** für die Monitor L2 Darstellung, der sich an das bestehende System angleicht, professionell und menschenverständlich ist. Die Unterteilung Sensoren/Aktoren ist aktuell **zu unübersichtlich** und **nimmt Platz weg** — funktional OK, aber UX verbesserungswürdig.

---

## 1. Robins Layout-Vorstellungen (Anforderungen)

- **Monitor L2:** Sensoren und Aktoren müssen **nach ihren Subzonen geordnet** sein.
- **Keine Subzone:** Ist nicht schlimm — Geräte ohne Subzone werden in einer eigenen Gruppe (z. B. „Keine Subzone“) angezeigt.
- **Aktuelles Problem:** Die Unterteilung der Sensoren und Aktoren ist **zu unübersichtlich** und **nimmt Platz weg**. Funktional ist es OK.
- **Ziel:** Ordentlicher Ansatz, **bestehendes System** nutzen, **super funktionieren** mit Backend.
- **Design:** Professionell, menschenverständlich — an UI/UX Best Practices und AutomationOne Design-System angepasst.

---

## 2. UX/UX-Wissen aus dem Automation-Experten (Referenz)

### 2.1 IoT Dashboard Design Best Practices (wissen/iot-automation/iot-dashboard-design-best-practices-2026.md)

| Prinzip | Anwendung auf Monitor L2 |
|---------|---------------------------|
| **Informationshierarchie** | Das Wichtigste zuerst: Zone-Header → Sensoren/Aktoren nach Subzone gruppiert. Subzone-Labels klar, aber nicht dominierend. |
| **5-Sekunden-Regel** | Status (OK/Warnung/Kritisch) muss in 5 Sekunden erkennbar sein. Farb-Kodierung (tokens.css) nutzen. |
| **Hierarchisches Drill-Down** | Zone → Subzone → Sensor/Aktor. Jede Ebene hat den richtigen Detailgrad. |
| **Progressive Disclosure** | Details (Kalibrierung, Historie) nur auf Nachfrage — nicht alles auf einmal. |
| **Eine Information einmal** | Keine doppelte Zählung (Sektion „Sensoren (N)“ + Subzone-Zeile „N Sensoren“) — eine klare Regel. |

### 2.2 Device Config Panel UX (wissen/iot-automation/iot-device-config-panel-ux-patterns.md)

| Prinzip | Anwendung auf Monitor L2 |
|---------|---------------------------|
| **Accordion > Tabs** | Subzone-Gruppen als Accordion (einklappbar) statt starrer Liste — spart Platz, Nutzer expandiert nur was relevant ist. |
| **Container nach Feldanzahl** | Wenige Subzonen → flache Liste; viele Subzonen → kompakte Gruppierung, ggf. Collapse. |
| **40px Trennung** zwischen Major Sections | Klare visuelle Hierarchie; nicht zu viel Weißraum, nicht zu gedrängt. |
| **Vertikales Stacking** | 1 Spalte als Default; Subzone-Blöcke untereinander. |

### 2.3 Layout Monitor (auftrag-layout-monitor-seite-ueberschriften-reihenfolge.md)

- **Doppelte Zählung vermeiden:** Entweder nur in Sektionsüberschrift ODER nur in Subzone-Zeile — einheitlich.
- **Reihenfolge L2:** Zonen-Header → Sensoren → Aktoren → Zone-Dashboards → Inline-Panels.
- **„Keine Subzone“:** Eindeutig und nur anzeigen, wenn tatsächlich keine Subzone zugewiesen.

### 2.4 Design-System AutomationOne (tokens.css, Glassmorphism)

- **Status-Farben:** `--color-success`, `--color-warning`, `--color-alarm`, `--color-critical`
- **Glass-BG:** Leicht transparente Karten für Subzone-Gruppen
- **Accent-Border:** Linke Border für Subzone-Header (wie SubzoneArea.vue)
- **Typography:** Klare Hierarchie (H2 Zone, H3 Subzone, Body Sensor/Aktor-Name)

---

## 3. Analyse: Aktuelle Probleme (aus Bericht + Robin)

### 3.1 Unübersichtlichkeit

- **Doppelte Zählung:** „Sensoren (5)“ in Sektion + „5 Sensoren“ in Subzone-Zeile → redundant.
- **Zu viele Ebenen:** Sektion → Subzone-Zeile → Geräte-Liste → ggf. weitere Unterteilung. Visuell schwer zu erfassen.
- **Platzverschwendung:** Jede Subzone-Zeile nimmt viel vertikalen Raum ein; bei vielen Subzonen wird gescrollt.

### 3.2 Funktional OK

- Gruppierung nach Subzone funktioniert (sobald B2 gefixt ist).
- „Keine Subzone“ als Konzept ist klar.
- Navigation Zone → Detail ist vorhanden.

### 3.3 Robins Ziel

- **Übersichtlicher:** Weniger visueller Ballast, klare Hierarchie.
- **Platzsparend:** Kompaktere Darstellung ohne Informationsverlust.
- **Professionell:** An Best Practices und Design-System angepasst.

---

## 4. Layout-Varianten (zu prüfen)

### 4.1 Variante A: Accordion pro Subzone

- Jede Subzone = einklappbarer Accordion-Block.
- Header: Subzone-Name + Badge (Anzahl Sensoren/Aktoren) + Chevron.
- Inhalt: Sensor-/Aktor-Karten (kompakt).
- **Vorteil:** Platzsparend; User expandiert nur relevante Subzonen.
- **Nachteil:** Ein Klick mehr für erste Information.

### 4.2 Variante B: Flache Liste mit Subzone-Labels

- Sensoren/Aktoren in einer Liste; jedes Item hat ein kleines Subzone-Label (Chip/Badge).
- Gruppierung durch visuelle Trenner (dünne Linie oder leichte Hintergrundfarbe) zwischen Subzone-Wechsel.
- **Vorteil:** Alles auf einen Blick, kein Accordion.
- **Nachteil:** Bei vielen Geräten lange Liste.

### 4.3 Variante C: Kompakte Subzone-Karten (Grid)

- Pro Subzone eine Karte (Glass-BG, Accent-Border).
- Inhalt: Mini-Sensor-/Aktor-Chips (Name, Wert, Status) in 2–3 Spalten.
- „Keine Subzone“ als eigene Karte.
- **Vorteil:** Übersichtlich, platzsparend, klare visuelle Trennung.
- **Nachteil:** Bei vielen Subzonen viele Karten.

### 4.4 Variante D: Tab-System (Sensoren | Aktoren) mit Subzone-Gruppierung

- Zwei Tabs: „Sensoren“ und „Aktoren“.
- Innerhalb jedes Tabs: Gruppierung nach Subzone (Accordion oder flache Liste).
- **Vorteil:** Klare Trennung Sensor/Aktor; weniger gemischt.
- **Nachteil:** Zwei Klicks für Gesamtüberblick.

---

## 5. Empfohlener Ansatz (für Analyse-Agenten)

1. **Bestandsaufnahme:** Aktuelle Monitor L2 Struktur (MonitorView.vue, HierarchyTab, Sektionen) — exakte Komponenten, DOM-Struktur, CSS-Klassen.
2. **Abgleich mit Design-System:** tokens.css, SubzoneArea.vue, ZonePlate — welche Patterns werden bereits genutzt?
3. **Varianten-Bewertung:** A–D gegen Robins Anforderungen (übersichtlich, platzsparend, professionell) prüfen.
4. **Konkrete Empfehlung:** Eine Variante (oder Hybrid) mit Begründung; exakte Änderungen (Komponenten, Reihenfolge, Zählung, Accordion ja/nein).
5. **Keine doppelte Zählung:** Eine klare Regel dokumentieren (nur Sektion ODER nur Subzone-Zeile).
6. **„Keine Subzone“:** Eindeutiges Label, kompakte Darstellung.

---

## 6. Abhängigkeiten

- **Auftrag 1 (Subzone-Funktional-Fix)** muss vorher oder parallel erledigt sein — ohne korrekte Daten (Sensoren/Aktoren pro Subzone) ist Layout-Optimierung sinnlos.
- **Backend:** Hierarchy oder erweiterte API muss Sensoren/Aktoren pro Subzone liefern (siehe Auftrag 1).

---

## 7. Akzeptanzkriterien für diesen Analyseauftrag

- [ ] Bestandsaufnahme der aktuellen Monitor L2 Struktur (Komponenten, Datenfluss, CSS).
- [ ] Abgleich mit UI/UX-Wissen (iot-dashboard-design-best-practices, device-config-panel-ux, layout-monitor).
- [ ] Robins Layout-Vorstellungen (übersichtlich, platzsparend, professionell) dokumentiert.
- [ ] Bewertung der Varianten A–D (oder weitere) mit Empfehlung.
- [ ] Konkreter Layout-Vorschlag mit exakten Änderungspunkten (für nachfolgenden Implementierungs-Auftrag).
- [ ] Regel für Zählung (keine Dopplung) und „Keine Subzone“-Darstellung festgelegt.

---

## 8. Referenzen

| Dokument | Inhalt |
|----------|--------|
| `zonen-subzonen-vollanalyse-bericht-2026-03-04.md` | Analyse, B2 Monitor L2 |
| `auftrag-layout-monitor-seite-ueberschriften-reihenfolge.md` | Zählung, Reihenfolge |
| `wissen/iot-automation/iot-dashboard-design-best-practices-2026.md` | 5-Sekunden-Regel, Hierarchie, ECharts |
| `wissen/iot-automation/iot-device-config-panel-ux-patterns.md` | Accordion, Progressive Disclosure |
| `auftrag-subzone-funktional-fix.md` | Funktional-Fix (Voraussetzung) |
| `.claude/agents/automation-experte.md` | Wissensreferenz UX/UI |
