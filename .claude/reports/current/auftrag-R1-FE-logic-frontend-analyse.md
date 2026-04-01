# Auftrag R1-FE: Logic Engine Frontend — IST-Zustand-Analyse

**Ziel-Repo:** auto-one (El Frontend)
**Typ:** Reine Analyse — KEIN Code aendern
**Prioritaet:** HIGH
**Datum:** 2026-04-01
**Geschaetzter Aufwand:** ~2h
**Abhaengigkeit:** Keine
**Blockiert:** R2 (Datenmodell-Redesign), R3 (Frontend-Vereinfachung)

---

## Auftragsziel

Den **kompletten IST-Zustand** des Logic Engine Rule Builders im Frontend dokumentieren. Die Analyse soll ALLE Fragen beantworten die fuer das UX-Redesign (R2/R3) noetig sind. Es wird NICHTS geaendert — nur gelesen, verstanden und dokumentiert.

**Ergebnis:** Ein Analyse-Bericht mit exakten Dateiverweisen, Zeilennummern, Datenstrukturen und Code-Snippets.

---

## System-Kontext

AutomationOne ist ein 3-schichtiges IoT-Framework:
- **El Trabajante** (ESP32 Firmware, C++) — Sensoren auslesen, Aktoren schalten, MQTT-Kommunikation
- **El Servador** (FastAPI Backend, Python) — PostgreSQL (31 Tabellen), MQTT-Broker (Mosquitto), Logic Engine als Background-Service
- **El Frontend** (Vue 3 Dashboard, TypeScript) — Visualisierung, Konfiguration, Rule Builder

Der Rule Builder ist Teil des **El Frontend** (Vue 3, TypeScript, Pinia, VueFlow). Er ermoeglicht dem User, Automationsregeln visuell als Graph zu erstellen — aehnlich Node-Red. Der User zieht Knoten (Sensor-Bedingungen, Logik-Verknuepfungen, Aktor-Aktionen) auf eine Arbeitsflaeche, verbindet sie mit Edges und konfiguriert jeden Knoten ueber ein Seitenpanel.

### Bekanntes Problem (Kontext fuer die Analyse)

Der Rule Builder hat aktuell fundamentale UX-Probleme die diese Analyse aufklaeren soll:

1. **Einseitige Aktorsteuerung:** Einfache Operatoren (>, <, etc.) schalten einen Aktor nur AN oder nur AUS — nie beides. Ein User der "> 40°C → Luefter AN" einstellt, bekommt einen Luefter der NIE automatisch ausgeht. Nur der Hysterese-Operator hat einen eingebauten AUS-Mechanismus.

2. **Multi-Node-Verbindungen funktionieren nicht richtig:** Wenn der User mehrere Sensor-Knoten und Aktor-Knoten miteinander verbindet, reagiert das System "verwirrt". Die visuelle Graph-Topologie (welcher Sensor zu welchem Aktor) scheint bei der Serialisierung verloren zu gehen. Im Backend feuern dann ALLE Aktoren gleichzeitig statt selektiv.

3. **Hysterese Dual-Modus ist Phantom-Feature:** Das Config-Panel zeigt Kuehlung UND Heizung Felder. Im Backend hat aber der Cooling-Modus Vorrang — Heizungs-Einstellungen werden ignoriert wenn Kuehlung gesetzt ist. Ausserdem kann der User den Hysterese-Knoten zu zwei Aktoren verbinden, aber nicht steuern welcher Aktor fuer Kuehlung und welcher fuer Heizung zustaendig ist.

4. **Zu viele redundante Sensor-Knoten:** Die Palette hat 8 sensor-spezifische Knoten (Sensor, Feuchtigkeit, pH, Licht, CO2, Bodenfeuchte, EC, Fuellstand). Sie unterscheiden sich nur im vorgefilterten Sensortyp. Ein generischer "Sensor"-Knoten wuerde reichen, da der User ohnehin ESP und konkreten Sensor auswaehlen muss.

### Bekannte Frontend-Dateien

| Datei | Geschaetzte Zeilen | Rolle |
|-------|---------------------|-------|
| `El Frontend/src/components/rules/RuleFlowEditor.vue` | ~1968 | Haupteditor — Graph, Save, Load, VueFlow |
| `El Frontend/src/components/rules/RuleConfigPanel.vue` | ~1199 | Rechte Sidebar — Node-Konfiguration |
| `El Frontend/src/components/rules/RuleNodePalette.vue` | 558 | Linke Sidebar — Drag-Palette |
| `El Frontend/src/types/logic.ts` | 349 | TypeScript-Typen (LogicCondition, LogicAction, etc.) |
| `El Frontend/src/shared/stores/logic.store.ts` | 710 | Pinia Store: Regeln, History, WebSocket |
| `El Frontend/src/api/logic.ts` | 169 | API Client (CRUD fuer Rules) |
| `El Frontend/src/views/LogicView.vue` | — | Logic-Uebersicht + Execution History |

**Hinweis:** Dateinamen und Pfade im auto-one Repo pruefen — sie koennten sich leicht geaendert haben. Insbesondere: Gibt es weitere Dateien unter `components/rules/` oder `composables/` die zum Rule Builder gehoeren?

---

## Analyse-Bloecke (7 Stueck)

Jeden Block als eigenen Abschnitt im Bericht dokumentieren. Pro Block: exakte Dateien, Zeilennummern, relevante Code-Snippets, Bewertung.

---

### Block 1: RuleNodePalette — Welche Knoten-Typen existieren?

**Datei:** `RuleNodePalette.vue` (558 Zeilen erwartet)

**Fragen:**
1. Welche Knoten-Typen sind in der Palette definiert? Liste ALLE mit:
   - interner Typ-Name (z.B. `sensor`, `humidity`, `ph`, etc.)
   - Anzeige-Label (z.B. "Sensor", "Feuchtigkeit", "pH-Wert")
   - Icon (falls vorhanden)
   - Beschreibung/Untertitel
2. Wie ist die Palette strukturiert? (Sektionen? Kategorien? Scroll?)
3. Wie funktioniert der `onDragStart`-Handler? Welche Daten werden im DragEvent-Payload uebergeben?
4. Gibt es einen Unterschied zwischen dem generischen "Sensor"-Knoten und den spezifischen (Feuchtigkeit, pH, etc.)? Wenn ja: Was genau ist der Unterschied im Payload?
5. Gibt es einen "Vorlagen"-Bereich oder Template-Mechanismus?
6. Gibt es Knoten unter "AKTIONEN" (Aktor, Benachrichtigung, etc.)? Falls ja: welche?

**Bewertung:**
- Welche Knoten sind funktional identisch (nur anderer `sensor_type` Default)?
- Welche Knoten sind genuinely eigenstaendig (anderer Condition-Typ)?
- Koennte man die Palette auf weniger Knoten reduzieren ohne Funktionalitaet zu verlieren?

---

### Block 2: RuleConfigPanel — Sensor-Bedingung (alle Operatoren)

**Datei:** `RuleConfigPanel.vue` (~1199 Zeilen erwartet)

**Fragen:**
1. Wie wird die Sensor-Bedingung konfiguriert? Welche Felder hat das Panel wenn ein Sensor-Knoten ausgewaehlt ist?
   - ESP-Dropdown: Wie wird die Liste befuellt? (Store, API-Call?)
   - Sensor-Dropdown: Wie wird die Liste gefiltert? (nur Sensoren des gewaehlten ESP?)
   - Operator-Dropdown: Welche Werte? Wie werden sie intern gespeichert?
   - Schwellwert-Feld(er): Welche Felder je nach Operator?
2. Welche Operatoren gibt es? Fuer jeden Operator auflisten:
   - Interner Name/Wert (z.B. `"greater_than"`, `">"`, `"gt"`)
   - Anzeige-Label
   - Welche Eingabefelder werden angezeigt (1 Wert? 2 Werte? Spezial-UI?)
3. **Hysterese-Operator im Detail:**
   - Welche Felder werden angezeigt? (Kuehlung: Ein/Aus, Heizung: Ein/Aus)
   - Wie werden die Werte intern gespeichert? (welche Property-Namen im Condition-Objekt?)
   - Kann der User beide Modi (Kuehlung + Heizung) gleichzeitig ausfuellen?
   - Was passiert mit leeren Feldern? Werden sie `null`, `undefined`, `0` oder weggelassen?
4. Was passiert wenn ein NICHT-Sensor-Knoten ausgewaehlt ist? (Zeitfenster, Diagnose, Logik-Verknuepfung, Aktor)

**Bewertung:**
- Hat der User bei einfachen Operatoren (>, <) eine Moeglichkeit, eine Gegen-Aktion (OFF) zu definieren?
- Wird dem User kommuniziert dass einfache Operatoren einseitig sind?
- Ist die Hysterese-UI klar genug? Versteht ein User was Kuehlung vs. Heizung bedeutet?

---

### Block 3: RuleConfigPanel — Aktor-Aktion

**Datei:** `RuleConfigPanel.vue`

**Fragen:**
1. Wie wird die Aktor-Aktion konfiguriert? Welche Felder?
   - ESP-Dropdown
   - Aktor-Dropdown (Typ, GPIO)
   - Befehl-Dropdown: Welche Optionen? (ON, OFF, PWM, Toggle, ...?)
   - Duration/MaxRuntime-Feld
   - PWM-Wert-Feld (falls PWM ausgewaehlt)
2. Wie werden die Werte intern gespeichert? (Property-Namen im Action-Objekt)
3. Gibt es ein Konzept von "bidirektional" (AN wenn TRUE, AUS wenn FALSE)? Falls nein: Was muesste ergaenzt werden?
4. Kann der User MEHRERE Befehle pro Aktor-Knoten definieren? Oder braucht er dafuer mehrere Aktor-Knoten?

**Bewertung:**
- Wie intuitiv ist die Befehl-Auswahl?
- Fehlt ein "Automatisch"-Modus (ON/OFF je nach Bedingung)?

---

### Block 4: RuleFlowEditor — Graph-zu-Daten-Konvertierung (KERNANALYSE)

**Datei:** `RuleFlowEditor.vue` (~1968 Zeilen erwartet)

**Fragen:**
1. **graphToRuleData()** — exakte Zeilen + Logik:
   - Wie werden Condition-Nodes extrahiert? Welche Node-Typen zaehlen als Condition?
   - Wie werden Action-Nodes extrahiert? Welche Node-Typen zaehlen als Action?
   - Wie wird der Compound-Operator bestimmt? (AND/OR)
   - **KRITISCH: Werden Edges (VueFlow-Verbindungen) im Datenmodell gespeichert?** Oder werden sie verworfen?
   - Wie werden Hysterese-Conditions serialisiert? (Welche Felder?)
   - Gibt es Validierung vor dem Speichern?
2. **ruleToGraph()** — exakte Zeilen + Logik:
   - Wie werden Conditions zurueck in Nodes konvertiert?
   - Wie werden Positionen bestimmt? (gespeichert oder neu berechnet?)
   - **KRITISCH: Wie werden Edges beim Laden generiert?** Automatisch alle-zu-alle? Oder aus gespeicherten Daten?
   - Was passiert mit unbekannten Condition-Typen?
3. **VueFlow-Integration:**
   - Welche VueFlow-Features werden genutzt? (Nodes, Edges, Handles, Custom Nodes?)
   - Gibt es Custom Node-Typen? (Vue-Komponenten fuer Nodes?)
   - Wie werden Verbindungen (Edges) validiert? Kann jeder Node mit jedem verbunden werden?
   - Gibt es Verbindungs-Beschraenkungen? (z.B. Sensor nur zu Logic, Logic nur zu Aktor?)
4. **Save/Load API:**
   - Welcher API-Endpoint wird zum Speichern verwendet?
   - Welches JSON-Format wird an die API gesendet?
   - Welcher Endpoint zum Laden? Wie wird die Response zu einem Graph?

**Bewertung:**
- Gehen Informationen bei Save → Load verloren? (Positionen? Edges? Konfiguration?)
- Kann das aktuelle Serialisierungsformat erweitert werden um Edges/Routing zu speichern?
- Welche Aenderungen waeren noetig um Action-Routing zu unterstuetzen?

---

### Block 5: TypeScript-Typen (logic.ts)

**Datei:** `El Frontend/src/types/logic.ts` (349 Zeilen erwartet)

**Fragen:**
1. Wie sieht das `LogicCondition` Interface/Type aus? ALLE Felder auflisten.
2. Wie sieht das `LogicAction` Interface/Type aus? ALLE Felder auflisten.
3. Wie sieht das `LogicRule` Interface/Type aus? ALLE Felder auflisten.
4. Gibt es Union-Types oder Discriminated Unions fuer verschiedene Condition-Typen?
5. Gibt es ein Feld fuer Edge-Routing oder Condition-Action-Zuordnung?
6. `extractSensorConditions()` — exakte Signatur, was macht es, welche Typen werden erkannt?

**Bewertung:**
- Ist das Type-System streng genug? (Erkennt TypeScript wenn ein Feld fehlt?)
- Wo muesste das Type-System erweitert werden fuer Action-Routing?

---

### Block 6: Logik-Verknuepfung (Compound/AND/OR)

**Dateien:** `RuleFlowEditor.vue`, `RuleConfigPanel.vue`

**Fragen:**
1. Wie wird der AND/OR-Knoten im Graph dargestellt?
   - Ist es ein separater Node-Typ oder eine Eigenschaft der Regel?
   - Wie viele AND/OR-Knoten kann eine Regel haben? (Nur einen? Mehrere? Verschachtelt?)
2. Wie wird der Compound-Operator in `graphToRuleData()` extrahiert?
3. Was passiert wenn der User keinen AND/OR-Knoten platziert?
4. Kann der User einen komplexen Ausdruck bauen wie `(A AND B) OR C`? Falls nein: Warum nicht?
5. Wie werden Edges zum AND/OR-Knoten gehandhabt? (Multi-Input? Multi-Output?)

**Bewertung:**
- Ist das AND/OR-System fuer einen nicht-technischen User verstaendlich?
- Welche Compound-Logik ist noetig fuer typische Gaertner-Szenarien?
- Reicht ein flacher AND/OR (alle Conditions global) oder braucht man verschachtelung?

---

### Block 7: Edge-Handling und Graph-Topologie

**Dateien:** `RuleFlowEditor.vue`, VueFlow-Konfiguration

**Fragen:**
1. Wie werden VueFlow-Edges erstellt? (onConnect-Callback? Drag-and-Drop?)
2. Welche Edge-Daten existieren? (source, target, sourceHandle, targetHandle?)
3. Werden Edge-Daten irgendwo gespeichert — auch wenn sie nicht an die API gehen?
4. Gibt es Edge-Typen (z.B. `condition-to-logic`, `logic-to-action`)?
5. Gibt es Validierung beim Verbinden? (z.B. Aktor → Sensor verbinden = Fehler?)
6. Wie viele Handles hat jeder Node-Typ? (Input/Output, Position)
7. Was passiert wenn der User einen Sensor direkt mit einem Aktor verbindet (ohne Logic-Knoten dazwischen)?

**Bewertung:**
- Kann VueFlow Edges als Teil des Graphen exportieren? (ja, das ist ein Standard-Feature — aber wird es genutzt?)
- Welchen Aufwand hat es, Edge-Daten in die API-Payload aufzunehmen?
- Gibt es Edge-Labels oder Edge-Properties die fuer Routing nutzbar waeren?

---

## Ergebnis-Format

Der Analyse-Bericht soll als Markdown-Datei im auto-one Repo oder im Life-Repo abgelegt werden. Format:

```markdown
# R1-FE Analyse-Bericht: Logic Engine Frontend IST-Zustand

## Block 1: RuleNodePalette
### Dateien & Zeilen
### Befunde
### Code-Snippets (relevante Auszuege)
### Bewertung

## Block 2: RuleConfigPanel — Sensor
(gleiche Struktur)

...

## Zusammenfassung
### Was funktioniert gut
### Was ist problematisch
### Empfehlung fuer R2/R3
```

**Bericht ablegen:** Als Markdown-Datei in dem Verzeichnis wo dieser Auftrag liegt (nach Abschluss der Analyse an Robin uebergeben)

---

## Was NICHT gemacht wird

- KEIN Code aendern
- KEINE Fixes implementieren
- KEINE neuen Dateien im auto-one Repo erstellen
- KEINE Backend-Analyse (das ist R1-BE)
- KEINE Performance-Analyse oder Test-Laeufe
- KEIN UX-Design vorschlagen (das ist R2)

---

## Akzeptanzkriterien

- [ ] Alle 7 Bloecke vollstaendig beantwortet mit Datei:Zeile Referenzen
- [ ] graphToRuleData() und ruleToGraph() exakt dokumentiert (Kernanalyse Block 4)
- [ ] Alle Condition-Typen und deren interne Darstellung aufgelistet
- [ ] Alle Action-Typen und deren interne Darstellung aufgelistet
- [ ] Edge-Handling geklaert: Was wird gespeichert, was geht verloren
- [ ] Hysterese-Felder und deren Serialisierung exakt dokumentiert
- [ ] Palette-Eintraege alle aufgelistet mit internem Typ-Namen
- [ ] Bericht als Markdown abgelegt

---

**Ende Auftrag R1-FE.**
