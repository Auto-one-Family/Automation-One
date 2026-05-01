# MultispeQ-Messung & Phyta-Upload — Operator-Anleitung

Zielgruppe: Anbauer/Betreiber (kein technisches Vorwissen erforderlich).

---

## Teil 0: Einmaliges PhotosynQ-Projekt-Setup

Bevor die erste Messung hochgeladen werden kann, muss das PhotosynQ-Projekt ein Custom-Field enthalten.

**Schritte in der PhotosynQ-App (einmalig pro Projekt):**

1. Projekt öffnen → **Project Design** → **Custom Parameters**
2. **Add Parameter** → Name: `AutomationOne-Plant-ID` *(exakt so — Groß-/Kleinschreibung und Bindestriche sind Teil des Standards, keine Abweichungen)*
3. Typ: **Short text**
4. Pflicht: **Optional** — Messungen ohne Wert werden trotzdem importiert, erscheinen aber als "needs review"

**Wert des Feldes:** Der QR-Code der Pflanze (`PL-` + 8 Zeichen, z. B. `PL-A3F2C819`). Dieser Wert steht auf dem Etikett am Pflanzenstandort.

---

## Teil 1: QR-Code-Workflow am Standort

AutomationOne erzeugt für jede Pflanze ein QR-Code-Etikett mit dem Wert `PL-XXXXXXXX`.

**Vorbereitung (einmalig je Pflanze):**

1. In AutomationOne: **Sensoren → Pflanzen → Neue Pflanze** anlegen (Genotyp, Charge, Phase, Zone eingeben)
2. QR-Label drucken: Zeile anklicken → **QR-Label drucken** → PNG-Download → auf Thermodrucker oder Klebeetikett ausgeben
3. Etikett an der Pflanze/am Standort befestigen (wasserfest, gut sichtbar)

**Bei jeder Messung:**

- Etikett scannen oder `PL-XXXXXXXX`-Wert manuell in das PhotosynQ-Custom-Field `AutomationOne-Plant-ID` eintragen

**Messung ohne Etikett:** Trotzdem importieren — danach im Audits-Tab unter "Ohne Pflanzenzuordnung" die Pflanze manuell zuordnen.

---

## Teil 2: Mess-Protokoll (Checkliste)

| # | Schritt | Detail |
|---|---------|--------|
| 1 | Gerät akklimatisieren | 30 min vor Messung in Messraum legen |
| 2 | App-Update prüfen | PhotosynQ-App auf aktuellem Stand, Bluetooth-Pairing (Code: 1234) |
| 3 | Protokoll wählen | **Photosynthesis RIDES 2.0** (Standard) oder Phi2 Quick (bei Zeitdruck) |
| 4 | Messzeitpunkt | Indoor: mindestens 4 h nach Lichtstart, nicht in den letzten 90 min vor Licht-Aus |
| 5 | Lampen-Dimmer | Dimmer NICHT zwischen Messungen ändern; Far-Red >5 % während Messung reduzieren |
| 6 | Blatt wählen | Vollentfaltetes Blatt oberes Drittel, gleiches Entwicklungsstadium jede Messung |
| 7 | Messen | Clamp anlegen, ~15 s warten. Min. 3 Blätter/Pflanze, 2 min Pause zwischen Messungen am gleichen Blatt |
| 8 | Pflichtfelder ausfüllen | `AutomationOne-Plant-ID`, `phase`, `lamp_model`, `lamp_distance_cm`, `lamp_dimmer_pct`, `time_since_light_on_min`, `qa_flag` |
| 9 | Kalibrierung notieren | Datum der letzten CaliQ-Kalibrierung für Upload bereit halten |
| 10 | Export | PhotosynQ-App → Projektseite → Download → **JSON** (bevorzugt) oder CSV |

---

## Teil 3: Upload in Phyta (Schritt-für-Schritt)

Navigation: **Sensoren → Audits → Datei importieren**

| Feld | Typ | Pflicht | Hinweis |
|------|-----|---------|---------|
| Datei | Datei-Picker (CSV/JSON, max 10 MB) | Ja | PhotosynQ-Export direkt hochladen |
| Device Serial | Textfeld | Ja | Seriennummer des MultispeQ-Geräts (steht auf Rückseite) |
| Zone | Dropdown | Ja | Zone in der gemessen wurde |
| Subzone | Dropdown | Nein | Optional, für genauere Zuordnung |
| Kalibrierungsdatum | Datumsfeld | Ja | Letztes CaliQ-Kalibrierungsdatum |
| Vorschau | Checkbox | Nein | Aktivieren um Import zu simulieren (kein DB-Schreibvorgang) |

**Nach erfolgreichem Upload:**

- Grüne Meldung: *"N Messungen importiert, M Duplikate übersprungen"*
- Gelbe Meldung: *"N Messungen importiert, K ohne Pflanzenzuordnung"* → Audits-Tab zeigt Liste zur manuellen Zuordnung

**Dashboard-Verhalten nach Import:**

- Widget zeigt *"Letzte Messung: vor X Stunden"* — **kein blinkendes Live-Licht** (MultispeQ ist ein Snapshot-Sensor, kein Echtzeit-Stream)
- Gelbe Badge *"Messung fällig"* erscheint nach mehr als 7 Tagen ohne neue Messung
- Tooltip: *"Snapshot-Messung — kein Echtzeit-Stream"*

---

## Teil 4: Troubleshooting

| Meldung | Ursache | Lösung |
|---------|---------|--------|
| *"N Duplikate übersprungen"* | Datei wurde bereits importiert | Normal — kein Problem, Daten sind vollständig |
| *"Validierungsfehler: fehlende Pflichtfelder"* | `calibration_date` oder `zone_id` fehlt | Formular vollständig ausfüllen |
| *"K ohne Pflanzenzuordnung"* | Kein `AutomationOne-Plant-ID` in Messung oder Wert nicht in Pflanzenliste | Im Audits-Tab → "Ohne Pflanzenzuordnung" → Pflanze manuell zuordnen |
| Sensor im Dashboard nicht sichtbar | Falsche Zone gewählt oder Snapshot-Ansicht nicht aktiviert | Zone im Upload korrekt wählen; Snapshot-Badge erscheint automatisch |
| Kein grünes Live-Licht | Kein Bug — MultispeQ ist Snapshot-Sensor | Tooltip zeigt *"Snapshot-Messung"*, letzter Messwert wird angezeigt |
| *"Datei > 10 MB"* | Export-Datei zu groß | Zeitraum im PhotosynQ-Export einschränken und erneut exportieren |
