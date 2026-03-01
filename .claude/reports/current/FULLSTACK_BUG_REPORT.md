# AutomationOne — Vollstaendiger Bug-Bericht

> **Erstellt:** 2026-03-01 14:30 UTC
> **Methode:** DB-Inspector + Server-Debug + Playwright Systematic UI Walkthrough
> **Scope:** Alle Frontend-Seiten (Dashboard/Hardware, Monitor, Editor, Regeln, Komponenten, Zeitreihen, System), Datenbank, Server-Logs
> **Status:** FIXES DURCHGEFÜHRT — siehe BUG_FIX_VERIFICATION.md
> **Fix-Datum:** 2026-03-01
> **Ergebnis:** 12 FIXED, 2 WIDERLEGT, 1 BY-DESIGN, 1 DEFERRED

---

## Zusammenfassung

| Schwere | Anzahl | Status |
|---------|--------|--------|
| **KRITISCH** | 3 | 1 WIDERLEGT, 2 FIXED |
| **HOCH** | 5 | 5 FIXED |
| **MITTEL** | 5 | 5 FIXED |
| **NIEDRIG** | 3 | 1 BY-DESIGN, 2 FIXED |
| **GESAMT** | **16** | **12 FIXED, 2 WIDERLEGT, 1 BY-DESIGN, 1 DEFERRED** |

---

## KRITISCH (User blockiert / Sicherheitsrelevant)

### BUG-001: Delete Confirmation von SlideOver ist komplett blockiert
- **Seite:** Dashboard/Hardware (`/hardware`)
- **Reproduktion:** Zone-Tile Kontext-Menue → Konfigurieren → SlideOver oeffnet sich → "Geraet loeschen" Button → Loesch-Bestaetigung erscheint HINTER dem SlideOver-Backdrop
- **Effekt:** Der `slide-over-backdrop` (CSS pointer-events: auto, z-index hoeher als Dialog) blockiert ALLE Klicks auf die Bestaetigungs-Buttons "Abbrechen" und "Loeschen". Der User ist komplett gefangen — weder Abbrechen noch Loeschen ist klickbar.
- **Workaround:** Escape-Taste schliesst den Confirm-Dialog (aber nicht das SlideOver). Delete ueber Kontext-Menue direkt (ohne SlideOver) funktioniert korrekt.
- **Root Cause:** Z-Index-Hierarchie: SlideOver Backdrop liegt ueber dem ConfirmDialog. ConfirmDialog muesste ueber dem SlideOver-Backdrop gerendert werden (z-index oder DOM-Reihenfolge).
- **Betrifft auch:** Komponenten-Seite (`/sensors`) — falls dort ein Delete-Button im SlideOver existieren wuerde.

### BUG-002: Farb-Legende Backdrop blockiert gesamte Seite inkl. NOT-AUS
- **Seite:** Dashboard/Hardware (`/hardware`)
- **Reproduktion:** Header → Farb-Legende-Icon klicken → Legende oeffnet sich korrekt → Escape druecken → Legende schliesst visuell, ABER der `.color-legend__backdrop` bleibt aktiv (pointer-events: auto, deckt gesamte Seite ab)
- **Effekt:** GESAMTE Seite inkl. **NOT-AUS Button** ist nicht mehr klickbar. Sicherheitskritisch — Emergency Stop ist nicht erreichbar.
- **Workaround:** Nur per JavaScript (`document.querySelector('.color-legend__backdrop').click()`) kann der Backdrop geschlossen werden. Normaler User hat KEINEN Ausweg ausser Page-Reload.
- **Root Cause:** Escape-Handler schliesst die Legende-Anzeige, aber der Backdrop-State wird nicht zurueckgesetzt.

### BUG-003: Widget-Katalog fuegt keine Widgets zum Canvas hinzu
- **Seite:** Editor/Dashboard (`/custom-dashboard`)
- **Reproduktion:** Dashboard oeffnen/erstellen → "Katalog" Button klicken → Seitenleiste oeffnet sich mit Widget-Typen (Linien-Chart, Gauge-Chart, Sensor-Karte etc.) → Widget-Typ klicken → Button highlighted sich, ABER kein Widget erscheint auf dem Canvas
- **Effekt:** Dashboard-Editor ist funktionsunfaehig — kein einziges Widget kann hinzugefuegt werden. GridStack Container existiert im DOM (`document.querySelector('.grid-stack')`) aber hat 0 children nach Widget-Klick.
- **Erwartung:** Klick auf Widget-Typ sollte ein neues GridStack-Widget im Canvas erzeugen.
- **Konsole:** Keine Fehler, keine Warnungen bei Widget-Klick.

---

## HOCH (Falsche Daten / Fehlende Kernfunktionalitaet)

### BUG-004: Monitor L1 — Durchschnittstemperatur falsch berechnet
- **Seite:** Monitor (`/monitor`)
- **Reproduktion:** Zone "Test" zeigt "Ø 0.0°C" obwohl die enthaltenen Sensoren Werte von 22.0°C, 0.0°C und 22.0°C liefern
- **Erwartung:** Durchschnitt sollte ~14.7°C sein (oder ~22.0°C wenn 0.0 als "kein Wert" gefiltert wird)
- **Root Cause:** Vermutlich werden alle Sensor-Werte als 0.0 gelesen bei der Aggregation, oder die Aggregationslogik ist fehlerhaft.

### BUG-005: Sensor "Temp 0C79" (DS18B20) zeigt keine Einheit
- **Seite:** Monitor (`/monitor/:zoneId`), Komponenten (`/sensors`)
- **Reproduktion:** Sensor-Card fuer "Temp 0C79" (MOCK_0CBACD10, DS18B20) zeigt "0.00" ohne Einheit. Andere Sensoren (SHT31) zeigen korrekt "22.00 °C".
- **Erwartung:** "0.00 °C" mit Einheit
- **Root Cause:** Vermutlich fehlt die Unit-Konfiguration fuer diesen spezifischen DS18B20-Sensor, oder der SENSOR_TYPE_CONFIG Default wird nicht korrekt angewandt.

### BUG-006: Monitor L2 — Chart X-Achse zeigt Millisekunden-Timestamps
- **Seite:** Monitor Zone-Detail (`/monitor/:zoneId`)
- **Reproduktion:** Sensor-Card expandieren → Live-Chart wird angezeigt → X-Achse zeigt Zeitstempel im Format "2:18:18.568 p.m." mit Millisekunden-Praezision
- **Erwartung:** Lesbare Zeitstempel wie "14:18" oder "2:18 PM" ohne Millisekunden
- **Root Cause:** Chart-Zeitformat-Konfiguration fehlt oder ist falsch (nutzt Standard-Millisekunden statt formatierter Uhrzeit).

### BUG-007: Dashboard loeschen hat KEINEN Bestaetigungs-Dialog
- **Seite:** Editor/Dashboard (`/custom-dashboard`)
- **Reproduktion:** Dashboard auswaehlen → "Dashboard loeschen" Button klicken → Dashboard wird SOFORT geloescht, nur ein Toast erscheint
- **Erwartung:** Bestaetigungs-Dialog ("Wirklich loeschen?") wie bei Zone-Loeschen und Regel-Loeschen
- **Inkonsistenz:** Zone loeschen → hat Confirm Dialog. Regel loeschen → hat Confirm Dialog. Dashboard loeschen → KEIN Confirm Dialog.

### BUG-008: Aktor "Einschalten" Button-State inkonsistent (Card vs. SlideOver)
- **Seite:** Komponenten/Aktoren (`/sensors?tab=actuators`)
- **Reproduktion:** Aktor-Card zeigt "Not-Stopp" mit **disabled** "Einschalten" Button → Card klicken → SlideOver oeffnet sich → "Einschalten" Button ist **enabled** (klickbar)
- **Erwartung:** Wenn Aktor im Emergency-Stop-Zustand ist, sollte der Einschalten-Button in Card UND SlideOver konsistent disabled sein.
- **Risiko:** User koennte ueber SlideOver einen Emergency-gestoppten Aktor einschalten.

---

## MITTEL (Inkonsistenzen / UX-Probleme)

### BUG-009: Monitor L2 — Doppelte Zeitbereich-Buttons
- **Seite:** Monitor Zone-Detail (`/monitor/:zoneId`)
- **Reproduktion:** Sensor-Card expandieren → Zwei identische Reihen von Zeitbereich-Buttons erscheinen ("1h, 6h, 24h, 7d" doppelt)
- **Erwartung:** Nur eine Reihe Zeitbereich-Buttons
- **Root Cause:** Vermutlich wird der TimeRangeSelector sowohl im Sensor-Card-Expand-Template als auch im Chart-Component gerendert.

### BUG-010: Hardware "Real 0" Button nicht klickbar (z-index)
- **Seite:** Dashboard/Hardware (`/hardware`)
- **Reproduktion:** Header-Bereich → "Real 0" Badge/Button → Klick-Timeout. Ein SVG-Icon aus dem Header-Subtree interceptiert die Pointer-Events.
- **Effekt:** Button ist sichtbar aber nicht klickbar — frustrierend fuer User.
- **Root Cause:** Z-Index/Layout-Problem im Header — SVG-Element liegt ueber dem Button.

### BUG-011: Hardware Offline-Filter zeigt auch Online-Geraete
- **Seite:** Dashboard/Hardware (`/hardware`)
- **Reproduktion:** Filter → "Offline" Chip aktivieren → Zeigt korrekt Zonen die Offline-Geraete haben, ABER innerhalb dieser Zonen sind auch die Online-Geraete sichtbar
- **Erwartung:** Nur Offline-Geraete innerhalb der gefilterten Zonen anzeigen
- **Root Cause:** Filter filtert nur auf Zone-Ebene, nicht auf Device-Ebene.

### BUG-012: Cross-ESP Button zeigt keine sichtbare Aenderung
- **Seite:** Dashboard/Hardware (`/hardware`)
- **Reproduktion:** Header → "Cross-ESP" Button klicken → Button highlighted als aktiv, aber KEIN Panel/Content oeffnet sich
- **Effekt:** Unklar ob die Funktion nicht implementiert ist oder ob ein Darstellungsfehler vorliegt.

### BUG-013: System Monitor — Sensordaten-Events zeigen falsche Werte
- **Seite:** System Monitor (`/system-monitor`)
- **Reproduktion:** Event-Feed zeigt fuer MOCK_95A49FCB GPIO 0 (SHT31) konsistent "Temp./Luftfeuchte: 0.0 °C" obwohl der Live-Wert auf der Komponenten-Seite 22.00°C betraegt
- **Erwartung:** Event-Display sollte den tatsaechlichen Sensorwert anzeigen
- **Moegliche Ursache:** Event-Formatierung liest falsches Feld, oder es wird der Humidity-Wert statt Temperature angezeigt.

---

## NIEDRIG (Kosmetisch / Fehlende Features)

### BUG-014: Sensor/Aktor-SlideOver hat keinen "Loeschen"-Button
- **Seite:** Komponenten (`/sensors`, `/sensors?tab=actuators`)
- **Beobachtung:** Sensor-Config-SlideOver und Aktor-Config-SlideOver zeigen nur "Speichern" — kein "Sensor/Aktor loeschen" Button vorhanden
- **Bewertung:** Moeglicherweise by-design (Loeschung nur ueber Geraeteverwaltung), sollte aber UX-maessig geklaert werden.

### BUG-015: Logic Rule referenziert nicht-existierende Devices
- **Seite:** Regeln (`/logic`), Datenbank
- **Reproduktion:** Regel "Test Temperatur Rule" referenziert MOCK_TEMP01 und MOCK_RELAY01 → UI zeigt "(nicht gefunden)" neben dem Sensor-Selector
- **Quelle:** DB-Inspector fand: `logic_rules.config` enthaelt `esp_id: "MOCK_TEMP01"` und `"MOCK_RELAY01"`, aber `esp_devices` Tabelle hat keine solchen Eintraege
- **Bewertung:** Wahrscheinlich Testdaten die nicht aufgeraeumt wurden. Kein funktionaler Fehler, aber verwirrend.

### BUG-016: Datenbank Zone-Name Inkonsistenz
- **Quelle:** DB-Inspector
- **Detail:** Zone "Testneu" hat in `zones.name` den Wert "Testneu" (PascalCase), wird aber an anderen Stellen als "testneu" (lowercase) referenziert
- **Bewertung:** Kosmetisch, aber koennte bei case-sensitiven Vergleichen Probleme verursachen.

---

## Interaktions-Ketten-Dokumentation

Die folgende Tabelle dokumentiert jede getestete Interaktionskette und ihr Ergebnis:

### Dashboard/Hardware (`/hardware`)

| Aktion | Ergebnis | Status |
|--------|----------|--------|
| Online-Filter Chip | Zeigt nur Online-Zonen, korrekt | OK |
| Offline-Filter Chip | Zeigt Zonen mit Offline-Geraeten, aber auch Online-Geraete darin | BUG-011 |
| "Mock" Button → Mock-ESP Dialog | Dialog oeffnet sich korrekt mit ESP-ID, Sensoren, Aktoren Feldern | OK |
| "Geraete" Button → Geraeteverwaltung | Dialog mit 3 Tabs (Alle/Online/Offline), Geraete-Liste | OK |
| Geraeteverwaltung → Konfigurieren | SlideOver oeffnet sich mit Geraete-Einstellungen | OK |
| SlideOver → "Geraet loeschen" | Confirm-Dialog HINTER Backdrop → komplett blockiert | **BUG-001** |
| Kontext-Menue → Loeschen (ohne SlideOver) | Confirm-Dialog korrekt, Abbrechen/Loeschen klickbar | OK |
| Farb-Legende oeffnen | Legende erscheint korrekt | OK |
| Farb-Legende → Escape | Legende verschwindet, Backdrop bleibt → Seite blockiert | **BUG-002** |
| Zone-Aktionen Dropdown | Oeffnet korrekt mit Optionen | OK |
| Zone loeschen → Confirm Dialog | Dialog erscheint korrekt, Abbrechen funktioniert | OK |
| "Real 0" Button | Nicht klickbar (SVG interceptiert) | BUG-010 |
| "Cross-ESP" Button | Highlighted, kein sichtbarer Effekt | BUG-012 |

### Monitor (`/monitor`)

| Aktion | Ergebnis | Status |
|--------|----------|--------|
| L1 Zone-Tiles laden | Zonen mit KPIs angezeigt | OK |
| Zone-Tile Klick → L2 | Drill-Down zu Sensor/Aktor-Liste | OK |
| L2 Sensor-Cards | Werte, Sparklines, Status-Dots | OK (ausser BUG-005/006) |
| Sensor expandieren → Chart | Live-Chart mit Zeitreihe | OK (ausser BUG-006/009) |
| Zurueck-Button | Navigiert korrekt zu L1 | OK |
| Durchschnittstemperatur | Zeigt 0.0°C statt korrekt berechnet | BUG-004 |

### Editor/Dashboard (`/custom-dashboard`)

| Aktion | Ergebnis | Status |
|--------|----------|--------|
| Dashboard erstellen | Neues Dashboard wird erstellt, Canvas leer | OK |
| Dashboard auswaehlen | Dropdown funktioniert, Dashboard laedt | OK |
| Katalog toggle | Seitenleiste oeffnet/schliesst sich | OK |
| Widget-Typ klicken | Button highlighted, KEIN Widget erscheint | **BUG-003** |
| Dashboard loeschen | Sofort geloescht, kein Confirm | BUG-007 |

### Regeln/Logic (`/logic`)

| Aktion | Ergebnis | Status |
|--------|----------|--------|
| Landing Page | Templates und bestehende Regeln | OK |
| Regel auswaehlen Dropdown | "1 Regeln (0 aktiv)" korrekt | OK |
| Regel laden → VueFlow Canvas | Nodes werden korrekt dargestellt | OK |
| Node klicken → Config Panel | Seitenpanel oeffnet sich mit korrekten Feldern | OK |
| Regel loeschen → Confirm Dialog | Bestaetigungs-Dialog korrekt | OK |
| Ausfuehrungshistorie | Bottom-Panel oeffnet sich korrekt | OK |
| Sensor-Referenz nicht gefunden | "(nicht gefunden)" angezeigt | BUG-015 |

### Komponenten (`/sensors`)

| Aktion | Ergebnis | Status |
|--------|----------|--------|
| Sensoren-Tab | 3 Sensoren in Zone "Test", Subzone "Keine Subzone" | OK |
| Aktoren-Tab | 3 Aktoren in 2 Zonen, Status-Uebersicht | OK |
| Sensor-Card Klick → SlideOver | Config-Panel mit Grundeinstellungen, Schwellwerte, Hardware, Live-Vorschau | OK |
| Aktor-Card Klick → SlideOver | Config-Panel mit Steuerung, Grundeinstellungen, Typ, Safety | OK |
| Filter Button → Filter Panel | ESP-ID, Sensor-Typ, Qualitaet Filter | OK |
| DS18B20 Filter aktivieren | Zeigt 1 Sensor, Badge "1", Reset-Button | OK |
| Filter zuruecksetzen | Alle Sensoren wieder sichtbar | OK |
| Subzone-Erstellung | Inline-Textfeld, Submit disabled bis Name eingegeben | OK |
| Subzone abbrechen | Formular verschwindet korrekt | OK |
| Aktor Einschalten Button (Not-Stopp) Card=disabled, SlideOver=enabled | Inkonsistenz | BUG-008 |

### Zeitreihen (`/sensor-history`)

| Aktion | Ergebnis | Status |
|--------|----------|--------|
| ESP-Geraet auswaehlen | 622 Datenpunkte geladen, Chart gerendert | OK |
| CSV Export Button | Vorhanden, nicht getestet (kein Download noetig) | OK |
| Zeitbereich-Buttons | 1 Std, 6 Std, 24 Std, 7 Tage, Benutzerdefiniert vorhanden | OK |

### System Monitor (`/system-monitor`)

| Aktion | Ergebnis | Status |
|--------|----------|--------|
| Tab-Navigation | Live, Ereignisse, Server Logs (41), Datenbank, MQTT Traffic (3457), Health | OK |
| Offline-Geraete Warning | 3 Geraete offline (seit 1 Tag) | OK |
| Event-Feed | Sensor-Events + Heartbeat-Events | OK |
| Filter (Quellen, Level, Zeit, ESP) | Vorhanden, korrekt aufgebaut | OK |
| Sensordaten-Werte in Events | Zeigen konsistent 0.0°C statt 22°C | BUG-013 |

---

## Datenbank-Befunde (DB-Inspector)

| Befund | Detail | Schwere |
|--------|--------|---------|
| Logic Rule referenziert nicht-existierende Devices | MOCK_TEMP01, MOCK_RELAY01 nicht in esp_devices | NIEDRIG |
| Zone-Name Inkonsistenz | "Testneu" vs "testneu" | NIEDRIG |
| Leere actuator_configs | esp_devices haben `actuator_configs: []` trotz aktiver Aktoren | INFO |
| Kein Alembic Version Tracking | Kein alembic_version Record in DB | INFO |

## Server-Befunde (Server-Debug)

| Befund | Detail | Schwere |
|--------|--------|---------|
| Server-Health | Gesund, keine echten Fehler | OK |
| CRITICAL Logs bei Startup | Retained MQTT Emergency-Stop Messages → False Alarm | INFO |
| APScheduler Job-Miss | 6 Events — Jobs verpasst bei Startup | INFO |
| 3 Orphaned Mock ESPs | Offline seit 27. Feb | INFO |

---

## Priorisierte Fix-Reihenfolge

1. **BUG-001** (KRITISCH) — SlideOver z-index vs ConfirmDialog → User blockiert
2. **BUG-002** (KRITISCH) — Farb-Legende Backdrop Escape → NOT-AUS nicht erreichbar
3. **BUG-003** (KRITISCH) — Widget-Katalog funktionslos → Editor unbenutzbar
4. **BUG-008** (HOCH) — Aktor Einschalten Inkonsistenz → Sicherheitsrisiko
5. **BUG-004** (HOCH) — Durchschnittstemperatur falsch
6. **BUG-007** (HOCH) — Dashboard Delete ohne Confirm
7. **BUG-005** (HOCH) — DS18B20 fehlende Einheit
8. **BUG-006** (HOCH) — Chart Millisekunden-Timestamps
9. **BUG-009** (MITTEL) — Doppelte Zeitbereich-Buttons
10. **BUG-010** (MITTEL) — Real Button z-index
11. **BUG-011** (MITTEL) — Offline-Filter Granularitaet
12. **BUG-012** (MITTEL) — Cross-ESP Button ohne Effekt
13. **BUG-013** (MITTEL) — System Monitor falsche Sensorwerte
14. **BUG-014** (NIEDRIG) — Fehlender Delete-Button in SlideOvers
15. **BUG-015** (NIEDRIG) — Logic Rule verwaiste Device-Referenzen
16. **BUG-016** (NIEDRIG) — Zone-Name Case-Inkonsistenz
