# V19 Visueller Audit — Monitor, Editor & Widget-Integration

> **Datum:** 2026-03-26
> **Viewport:** 1920x1080 (Desktop) + 390x844 (Mobile) + 768x1080 (Tablet)
> **Screenshots:** 19 Bilder + 1 Log-Datei in `audit-V19-screenshots/`
> **Browser:** Chrome (Playwright MCP), eingeloggt als `playwright_test` (admin)

## Zusammenfassung

| Kategorie | Status | Kritische Findings |
|-----------|--------|-------------------|
| Monitor L1 | OK | Zone-Tiles funktional, Mini-Gauges lesbar |
| Monitor L2 | PROBLEME | VPD=0, Duplikat-VPD-Sensoren, API 422 Errors |
| FAB / Widget-Add | PROBLEME | Dashboards-MenuItem im FAB macht nichts, kein AddWidgetDialog |
| Editor | OK | Widget-Katalog vorhanden, Config-Panel funktional |
| Widget-Typen | PROBLEME | VPD-Gauges zeigen 0 statt 1.19, keine Sparklines, kein statistics/kpi-card im FAB |
| Layout-Stabilitaet | OK | Responsive funktioniert, keine Layout-Spruenge |
| VPD | CRITICAL | Backend liefert 1.1898 kPa, Frontend zeigt 0,00 kPa |
| Responsive | OK | Mobile/Tablet-Ansichten korrekt, Sidebar collapsed |
| Dashboard-Verwaltung | PROBLEME | 24 Dashboards (15 Auto), massiver Muell von geloeschten Zonen |

## Findings

### Finding V19-F01: VPD-Wert wird als 0 angezeigt — Backend hat 1.19 kPa
- **Schweregrad:** CRITICAL
- **Kategorie:** H (VPD)
- **Screenshot:** B5-vpd-zeitreihe.png, H1-vpd-sensor-liste.png
- **IST:** VPD zeigt ueberall "0 kPa" / "0,00 kPa" an (Monitor L2, Komponenten-Tabelle, Gauge-Widgets im Editor). Backend-API (`GET /api/v1/sensors/?sensor_type=vpd`) liefert `latest_value: 1.1898`, `quality: "good"`, `timestamp: 2026-03-26T07:51:00`.
- **SOLL:** VPD-Wert 1.19 kPa sollte korrekt in allen Views angezeigt werden.
- **Vermutete Ursache:** Das Frontend empfaengt den VPD-Wert nicht korrekt vom Store/API. Moeglicherweise wird `latest_value` nicht in die Sensor-Datenanzeige uebernommen, oder die VPD-Berechnung im Frontend ueberschreibt den Server-Wert mit 0. Die `sensor_data` WebSocket-Events koennten den VPD-Wert als raw_value=0 senden, waehrend der Server den berechneten Wert separat in `latest_value` speichert.

### Finding V19-F02: VPD-Sensor existiert doppelt
- **Schweregrad:** HIGH
- **Kategorie:** H (VPD)
- **Screenshot:** H1-vpd-sensor-liste.png, B1-monitor-L2-gesamt.png
- **IST:** 2x "VPD (berechnet)" Sensoren fuer MOCK_T18V6LOGIC, identische Werte, identische Konfiguration. Beide erscheinen auf Monitor L2 "Zone-weit" und in der Komponenten-Tabelle.
- **SOLL:** Nur 1 VPD-Sensor pro ESP/Zone.
- **Vermutete Ursache:** Duplikat bei Mock-ESP-Erstellung oder VPD-Berechnung erstellt 2 Sensorkonfigurationen statt 1 (SHT31-Split-Problem: Temperatur- und Humidity-Kanal erzeugen je einen VPD).

### Finding V19-F03: VPD-Herkunft nirgends ersichtlich
- **Schweregrad:** MEDIUM
- **Kategorie:** H (VPD)
- **Screenshot:** B5-vpd-zeitreihe.png, H1-vpd-sensor-liste.png
- **IST:** Nirgends im UI steht, dass VPD aus Temperatur und Luftfeuchtigkeit berechnet wird. In der Komponenten-Tabelle steht nur "VPD" als Geraetetyp und "VIRTUAL" als Interface-Typ (nicht sichtbar in der Tabelle). Auf der Sensor-Card steht "VPD (berechnet)" — das "(berechnet)" ist ein Hinweis, aber die Quell-Sensoren werden nicht referenziert.
- **SOLL:** Tooltip oder Info-Badge: "Berechnet aus SHT31 Temperatur + Luftfeuchtigkeit" oder aehnlich.

### Finding V19-F04: FAB "Dashboards" MenuItem funktionslos
- **Schweregrad:** HIGH
- **Kategorie:** C (FAB)
- **Screenshot:** C2-fab-geoeffnet.png
- **IST:** Klick auf "Dashboards" im FAB-Menue schliesst das Menue, oeffnet aber keinen Dashboard-Dialog oder -Panel. Kein AddWidgetDialog erscheint. Es passiert einfach nichts Sichtbares.
- **SOLL:** Sollte eine Dashboard-Verwaltung oeffnen (z.B. QuickDashboardPanel) oder zum Editor navigieren.
- **Vermutete Ursache:** Event-Handler fehlt oder ist nicht korrekt verdrahtet.

### Finding V19-F05: 15 Auto-generierte Dashboards fuer geloeschte Zonen (Muell)
- **Schweregrad:** HIGH
- **Kategorie:** G (Dashboard-Verwaltung)
- **Screenshot:** D1b-dashboard-dropdown.png
- **IST:** 24 Dashboards insgesamt, davon 15 auto-generiert mit "Auto" Badge. Viele davon gehoeren zu Zonen die nicht mehr existieren: "Zelt 1 Dashboard", "Testneu Dashboard", "FINALERTEST Dashboard", "Gewaechshaus-Alpha Dashboard", "Gewaeckshaus Dashboard", "Naehrloesung Dashboard", "Zone 1 Dashboard", "Wokwi-Testzone Dashboard", "Echter ESP Dashboard", "Testzone-Alpha Dashboard", "Test Dashboard".
- **SOLL:** Auto-generierte Dashboards sollten entweder (a) automatisch geloescht werden wenn die Zone geloescht wird, oder (b) es sollte beim Start ein Cleanup geben. Der "Auto-generierte aufraeumen (15)" Button existiert und funktioniert — aber er muss manuell gedrueckt werden.
- **Bewertung:** Die Auto-Dashboards sind **ueberladen und verwirrend**. Ein neuer Benutzer sieht 24 Dashboards wovon die meisten auf nicht-existente Zonen zeigen. Das ist schaedlich fuer die UX.

### Finding V19-F06: API 422 Errors bei Sensordaten-Abfrage
- **Schweregrad:** MEDIUM
- **Kategorie:** I (Querschnitt)
- **Screenshot:** (Console-Logs)
- **IST:** Beim Laden von Monitor L2 erscheinen `GET /sensors/data → 422` Fehler: "Request validation error". Die Historical Charts zeigen "Keine Daten fuer den gewaehlten Zeitraum" und die Multi-Sensor-Charts "Noch keine Daten verfuegbar".
- **SOLL:** Charts sollten entweder Daten anzeigen oder einen klaren "Sensor hat keine historischen Daten" Hinweis geben, ohne API-Fehler.
- **Vermutete Ursache:** Falsche Sensor-ID oder Zeitbereichs-Parameter in der Abfrage. Moeglicherweise wird eine ungueltige `source`-Zeichenkette an den `/sensors/data` Endpoint gesendet.

### Finding V19-F07: TypeError in Console auf Monitor L2
- **Schweregrad:** MEDIUM
- **Kategorie:** I (Querschnitt)
- **Screenshot:** (Console-Logs)
- **IST:** `TypeError: Cannot read properties of undefined (reading ...)` erscheint beim Laden von Monitor L2. Der Fehler kommt aus `chunk-LNAROW3X.js` (Chart-Library).
- **SOLL:** Kein JavaScript-Error.
- **Vermutete Ursache:** Eine Chart-Komponente versucht auf undefined Daten zuzugreifen bevor die Sensordaten geladen sind.

### Finding V19-F08: Widget Konfigurieren/Entfernen Buttons immer sichtbar in Zone-Tiles
- **Schweregrad:** LOW
- **Kategorie:** A (Monitor L1)
- **Screenshot:** A2-zone-tile-detail.png
- **IST:** Die Mini-Gauge-Widgets innerhalb der Zone-Tiles zeigen Konfigurieren/Entfernen Buttons die permanent sichtbar sind (im Accessibility-Snapshot nachweisbar, visuell als kleine Icons ueber dem Gauge).
- **SOLL:** Diese Buttons sollten entweder nur on-hover erscheinen oder im Monitor (Read-Only Kontext) gar nicht sichtbar sein — nur im Editor.

### Finding V19-F09: Kein GridStack-Layout im Editor
- **Schweregrad:** INFO
- **Kategorie:** D (Editor)
- **Screenshot:** D3-editor-bearbeitungsmodus.png
- **IST:** Der Editor zeigt Widgets als vertikale Liste statt als freies GridStack-Layout (12-Spalten-Grid). Es gibt keinen sichtbaren Resize-Handle fuer Widgets. Widget-Anordnung wird durch die Reihenfolge in der Liste bestimmt.
- **SOLL:** Laut Spezifikation war ein GridStack-basiertes frei positionierbares Layout vorgesehen.
- **Vermutete Ursache:** GridStack wurde moeglicherweise noch nicht implementiert oder wurde durch ein einfacheres Listen-Layout ersetzt.

### Finding V19-F10: Sensor-Dropdown nicht gruppiert nach Zone/Subzone
- **Schweregrad:** LOW
- **Kategorie:** D (Editor)
- **Screenshot:** D4-widget-config-panel.png
- **IST:** Der Sensor-Dropdown im Widget-Config-Panel zeigt eine flache Liste: "Temp 0C79, Temp 069E, Luftfeuchte T18-V6, sht31_humidity, ...". Es gibt keine Gruppierung nach Subzone.
- **SOLL:** Gruppierung: Zone → Subzone → Sensor (useSensorOptions).
- **Vermutete Ursache:** `useSensorOptions` Composable wird nicht verwendet oder liefert keine gruppierten Optionen.

### Finding V19-F11: Sensor-Cards ohne sichtbare Sparklines
- **Schweregrad:** LOW
- **Kategorie:** B (Monitor L2)
- **Screenshot:** B2-sensor-cards-L2.png
- **IST:** Die Sensor-Cards zeigen eine flache horizontale Linie statt einer echten Sparkline. Es gibt nur 1 Datenpunkt pro Sensor (Mock-Daten aendern sich nicht).
- **SOLL:** Mit realen Daten wuerden Sparklines sichtbar sein. Fuer Mock-ESPs waere ein "Kein Verlauf" Hinweis hilfreicher als eine flache Linie.

### Finding V19-F12: Widget-Typen statistics und kpi-card fehlen im FAB
- **Schweregrad:** LOW
- **Kategorie:** C (FAB), E (Widget-Typen)
- **Screenshot:** C2-fab-geoeffnet.png
- **IST:** Das FAB-Menue zeigt 9 Widget-Typen (5 Sensor, 2 Aktor, 2 System). "Statistik" ist nur im Editor-Widget-Katalog verfuegbar, nicht im FAB. "KPI-Card" existiert nirgends.
- **SOLL:** Alle verfuegbaren Widget-Typen sollten konsistent an beiden Orten verfuegbar sein.

### Finding V19-F13: Duplikat-Sensoren (sht31_temp, sht31_humidity je 2x)
- **Schweregrad:** MEDIUM
- **Kategorie:** B (Monitor L2), H1
- **Screenshot:** B2-sensor-cards-L2.png, H1-vpd-sensor-liste.png
- **IST:** In der Subzone "Test 2 Sub" erscheinen 4 Sensor-Cards: 2x sht31_temp (Temperatur), 2x sht31_humidity (Luftfeuchte) — alle mit identischem Wert (22°C, 55 %RH). In der Komponenten-Tabelle: jeweils 2 Zeilen fuer sht31_temp und sht31_humidity.
- **SOLL:** Jeder Sensor sollte nur einmal existieren.
- **Vermutete Ursache:** Bekanntes NB6/NB8 Problem — SHT31 Multi-Value Split erzeugt Duplikate (simulation_config vs. sensor_configs Desync).

## Bewertung Auto-generierte Dashboards

**Bewertung: Ueberladen und verwirrend.**

Von 24 Dashboards sind 15 auto-generiert. Die meisten davon gehoeren zu Zonen die laengst geloescht wurden ("Testneu", "FINALERTEST", "Gewaechshaus-Alpha", "Wokwi-Testzone" etc.). Ein neuer Benutzer, der den Dashboard-Dropdown oeffnet, sieht eine unuebersichtliche Liste von 24 Eintraegen wovon >60% Muell sind.

**Positiv:** Der "Auto-generierte aufraeumen (15)" Bulk-Button existiert. Loeschen-Buttons (Papierkorb) pro Dashboard sind vorhanden. Dashboard-Vorlagen ("Zonen-Uebersicht", "Sensor-Detail", "Multi-Sensor-Vergleich", "Leer starten") sind sinnvoll.

**Empfehlung:** Auto-generierte Dashboards sollten automatisch bereinigt werden wenn die zugehoerige Zone geloescht wird. Alternativ: Beim App-Start ein Cleanup fuer verwaiste Auto-Dashboards.

## Gesamtbewertung

### Ist das System fuer einen normalen Benutzer verstaendlich?

**Teils-teils.** Die Grundstruktur (Uebersicht → Monitor → Editor) ist klar. Die Zone-Tiles auf L1 geben einen schnellen Status-Ueberblick ("5-Sekunden-Regel"). Die Navigation (3 Tabs) ist intuitiv. ABER:

- Ein Benutzer der VPD-Werte erwartet sieht ueberall "0" und verliert Vertrauen
- 24 Dashboards im Dropdown sind fuer Neulinge ueberfordernd
- Duplikat-Sensoren erzeugen Verwirrung ("Warum gibt es 2x VPD?")

### Top-3 Prioritaeten zum Fixen

1. **VPD-Anzeige fixen (F01)** — CRITICAL. Backend liefert 1.19 kPa, Frontend zeigt 0. Das ist ein Daten-Rendering-Bug der das Vertrauen in das gesamte System untergaebt. Vermutlich wird `latest_value` nicht korrekt vom Store in die Sensor-Cards und Gauges uebernommen.

2. **Auto-Dashboard Cleanup (F05)** — HIGH. 15 verwaiste Auto-Dashboards aufraeumen und Mechanismus implementieren der verwaiste Dashboards automatisch entfernt. Alternativ: "Auto-generierte aufraeumen" Button prominent anzeigen.

3. **FAB "Dashboards" reparieren (F04)** — HIGH. Der FAB ist ein zentrales UX-Element fuer schnelle Aktionen. Wenn "Dashboards" nichts tut, verliert der User das Vertrauen in den FAB insgesamt.

### Sekundaere Prioritaeten

4. VPD-Duplikate beheben (F02) + Sensor-Duplikate (F13)
5. API 422 Errors fixen (F06) — Chart-Daten muessen korrekt abgefragt werden
6. VPD-Herkunfts-Info ergaenzen (F03) — Tooltip "Berechnet aus Temperatur + Luftfeuchtigkeit"
