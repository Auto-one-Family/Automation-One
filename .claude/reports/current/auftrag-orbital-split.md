## Status-Update (2026-02-25, aktualisiert 2026-02-26 nach Implementierung)

**~95% ERLEDIGT:** ESPOrbitalLayout.vue ist von 3913 auf **410 Zeilen** reduziert (unter 500-Zeilen-Ziel!). Folgende Komponenten sind BEREITS extrahiert:
- SensorColumn.vue ✓
- ActuatorColumn.vue ✓
- SensorSatellite.vue ✓ (im Auftrag nicht erwaehnt, existiert aber)
- ActuatorSatellite.vue ✓ (im Auftrag nicht erwaehnt, existiert aber)
- DeviceHeaderBar.vue ✓ (im Auftrag nicht erwaehnt, existiert aber)
- AnalysisDropZone.vue ✓ (im Auftrag nicht erwaehnt, existiert aber)
- ConnectionLines.vue ✓ (existiert, wird aber NICHT von ESPOrbitalLayout importiert)
- AddSensorModal.vue ✓
- AddActuatorModal.vue ✓

**Composable-Extraktion (2026-02-26):**
- useOrbitalDragDrop.ts ✓ (250 Zeilen: DnD-Handler, Modal-State, Analysis-Auto-Open, Watchers)
- useDeviceActions.ts ✓ (bereits vorhanden, wird genutzt)

**OrbitalCenter.vue: BEWUSST NICHT extrahiert** — Vue 3 `<style scoped src>` penetriert nur Root-Elemente von Child-Komponenten. Die `esp-info-compact__*` CSS-Klassen in ESPOrbitalLayout.css wuerden OrbitalCenter.vue nicht erreichen. Composable-Only-Extraktion war die korrekte Strategie.

**ESPOrbitalLayout.css:** 1057 Zeilen (nach forms.css-Extraktion, war 1380)

**Verbleibend (~30min):** `orbital/` Verzeichnis erstellen + Imports anpassen (OPTIONAL — bei 410 Zeilen nicht mehr kritisch). useOrbitalSensors/useOneWireScanning-Extraktion OPTIONAL.

**DeviceDetailView.vue ist der EINZIGE Importeur** von ESPOrbitalLayout (bestaetigt durch IST-Analyse).

**DnD-Bugs in diesem Bereich:** Separater gezielter Auftrag erstellt → `auftrag-dnd-sensor-aktor-drop-fix.md` (Payload-Durchreichung an Modals, Real-ESP Aktor-Support, Drop-Indicator-Text, Toter Code). Kann OHNE weiteren Orbital-Split umgesetzt werden.

---

## Auftrag: ESPOrbitalLayout.vue aufteilen (~~3913~~ 655 Zeilen → 7 Sub-Komponenten + 5 Composables)

**Ziel-Repo:** auto-one
**Kontext:** ~~ESPOrbitalLayout.vue ist mit 3913 Zeilen die groesste Datei im gesamten Projekt.~~ ESPOrbitalLayout.vue wurde bereits von 3913 auf 655 Zeilen reduziert (SensorColumn, ActuatorColumn, AddSensorModal, AddActuatorModal extrahiert). Weiterer Split ist optional fuer Code-Qualitaet.
**Bezug:** `auftrag-phase3-analyse-dnd-widgets.md` Aufgabe A, `auftrag-frontend-ux-konsolidierung.md` Aufgabe 5.9, **NEU:** `auftrag-dnd-sensor-aktor-drop-fix.md` (DnD-Bugs separat)
**Prioritaet:** ~~Hoch~~ NIEDRIG — 655 Zeilen sind handhabbar. DnD-Bugs werden separat gefixt
**Aufwand:** ~~3-4h~~ ~2h (IST-Analyse: ~80% statt ~60% erledigt, mehr Sub-Komponenten als erwartet)
**Datum:** 2026-02-24
**Update:** 2026-02-25 — Status aktualisiert nach Code-Verifikation (655 Zeilen, teilweise erledigt)
**Update:** 2026-02-26 — IST-Analyse: ~80% erledigt, ESPOrbitalLayout.css auf 1057 Z., orbital/ Verzeichnis noch nicht erstellt
**Review:** 2026-02-23 durch Automation-Experten — 6 Ergaenzungen eingearbeitet (Composable-Extraktion, Hybrid-State-Pattern, ConnectionLines-Strategie, provide/inject, offene Punkte aufgeloest)
**Recherche-Basis:** `wissen/iot-automation/vue3-component-splitting-best-practices.md` (12 Quellen)

---

# An den naechsten Agenten

Du bekommst eine 3913-Zeilen Vue-Komponente die du in 7 handhabbare Sub-Komponenten aufteilen sollst. Das ist ein reines Refactoring — KEINE neuen Features, KEINE Design-Aenderungen. Am Ende muss ALLES genauso funktionieren wie vorher. Die einzige Aenderung ist die Datei-Struktur.

**WICHTIG:** Kein Feature darf verloren gehen. Teste nach jedem Split-Schritt dass `npm run build` erfolgreich ist und die bestehenden Tests (1342/1343) weiterhin bestehen.

---

### Ist-Zustand (aktualisiert 2026-02-25)

- `ESPOrbitalLayout.vue`: **655 Zeilen** (von 3913 reduziert)
- **Bereits extrahiert:** SensorColumn.vue, ActuatorColumn.vue, AddSensorModal.vue, AddActuatorModal.vue, AnalysisDropZone.vue, ESPCard.vue, ConnectionLines.vue, GpioPicker.vue, ZoneAssignmentDropdown.vue
- Verbleibendes: 3-Spalten-Layout, DnD-Handler (onDragEnter/onDragOver/onDrop), Analysis-Drop-Zone-State, Device-Actions Composable, Zone-Assignment-Logik
- Wird genutzt in: HardwareView Level 3 (`/hardware/:zoneId/:espId`)
- Frontend Phase 1+2+3(Widgets) sind abgeschlossen
- **DnD-Bugs:** Werden separat in `auftrag-dnd-sensor-aktor-drop-fix.md` gefixt (Payload-Durchreichung, Real-ESP Aktor-Support)

### Was getan werden muss

Die Monster-Komponente in logische Sub-Komponenten aufteilen. Jede Sub-Komponente soll maximal 500 Zeilen haben und eine klar abgegrenzte Verantwortlichkeit.

- Alle bestehende Funktionalitaet muss erhalten bleiben
- DnD fuer Sensor/Aktor-Hinzufuegen muss weiterhin funktionieren
- Charts im Orbital-Center muessen weiterhin funktionieren
- Connection-Lines (SVG) muessen korrekt rendern
- OneWire-Scanning muss weiterhin funktionieren
- SensorConfigPanel / ActuatorConfigPanel muessen weiterhin per Klick oeffnen

### Technische Details

**Betroffene Schichten:**
- [ ] Backend (El Servador)
- [ ] Firmware (El Trabajante)
- [x] Frontend (El Frontend)
- [ ] Monitoring (Grafana/Prometheus/Loki)

**Betroffene Module/Komponenten:**
- `El Frontend/src/components/esp/ESPOrbitalLayout.vue` — aufzuteilen
- `El Frontend/src/components/esp/ESPOrbitalLayout.css` — **separate CSS-Datei, muss mit nach `orbital/` verschoben werden**
- `El Frontend/src/components/esp/orbital/` — neuer Ordner fuer Sub-Komponenten
- ~~`El Frontend/src/components/esp/ConnectionLines.vue` — existiert, nach `orbital/` verschieben~~ **KORREKTUR K5:** ConnectionLines.vue wird NICHT von ESPOrbitalLayout importiert — nicht Teil dieses Splits

**Vorhandene Infrastruktur:**
- ConnectionLines.vue existiert bereits als separate Komponente
- SensorConfigPanel.vue und ActuatorConfigPanel.vue existieren (SlideOver-Pattern)
- dragState.store.ts fuer komponentenuebergreifenden DnD-State
- cssTokens.ts fuer Design-Token-Zugriff in JS
- Vitest-Tests fuer Frontend (1342/1343 bestehen)

**Ziel-Struktur (Komponenten + Composables):**

```
El Frontend/src/components/esp/orbital/
  ESPOrbitalLayout.vue          (Hauptcontainer, <500 Zeilen)
  SensorColumn.vue              (Sensor-Liste links)
  ActuatorColumn.vue            (Aktor-Liste rechts)
  OrbitalCenter.vue             (Center mit Charts + AnalysisDropZone)
  # ConnectionLines.vue         ENTFERNT aus Split-Plan (wird nicht von ESPOrbitalLayout importiert)
  AddSensorFlow.vue             (Drag-Drop + Modal-Logik fuer neuen Sensor)
  AddActuatorFlow.vue           (Drag-Drop + Modal-Logik fuer neuen Aktor)

El Frontend/src/composables/
  useOrbitalSensors.ts          (Sensor-Liste, Filterung, Auswahl-Logik)
  useOrbitalActuators.ts        (Aktor-Liste, Filterung, Auswahl-Logik)
  # useConnectionCoords.ts      ENTFAELLT (ConnectionLines nicht Teil dieses Splits)
  useOneWireScanning.ts         (OneWire-Discovery-Logik)
  useOrbitalDragDrop.ts         (DnD-Logik spezifisch fuer Orbital, ergaenzt dragState.store)
  # KONVENTION: Flache Struktur — KEIN Subdirectory `orbital/`
  # Das Frontend nutzt durchgaengig `composables/` ohne Unterordner
```

**Begruendung Composables:** ~~3913 Zeilen bedeuten ~2000 Zeilen Script-Logik.~~ Bei 655 verbleibenden Zeilen ist die Composable-Extraktion OPTIONAL — wuerde das 500-Zeilen-Ziel erreichbar machen, ist aber nicht mehr kritisch. ~~Die Composable-Extraktion ist ZWINGEND fuer das 500-Zeilen-Ziel.~~

**Was konkret implementiert/geaendert werden muss:**

### Schritt 1: Analyse und Planung (45-60 Min)

1. **ESPOrbitalLayout.vue komplett lesen und logische Bloecke identifizieren:**
   - Wo beginnt/endet der Sensor-Bereich (Template + Script)?
   - Wo beginnt/endet der Aktor-Bereich (Template + Script)?
   - Wo beginnt/endet der Center-Bereich (Charts)?
   - Wo ist die AddSensor-Logik (DnD + Modal)?
   - Wo ist die AddActuator-Logik (DnD + Modal)?
   - Welche `computed`, `ref`, `watch` gehoeren wohin?
   - **NEU:** Welche Script-Bloecke koennen in Composables extrahiert werden?

2. **Abhaengigkeiten kartieren:**
   - Welche Props braucht jede Sub-Komponente?
   - Welche Events emittiert jede Sub-Komponente?
   - Welche Store-Zugriffe hat jeder Bereich (esp.store, dragState.store)?
   - Welche Methoden werden bereichsuebergreifend genutzt?
   - **NEU:** Welcher State ist Subtree-scoped (→ provide/inject) vs. global (→ Store)?

3. **Import-Abhaengigkeiten pruefen:**
   - **DeviceDetailView.vue → ESPOrbitalLayout** — das ist der EINZIGE Importeur (nicht HardwareView!)
   - Barrel-Exports (index.ts) in `components/esp/` pruefen
   - ~~Andere Importe von ConnectionLines.vue pruefen~~ (ConnectionLines wird nicht von ESPOrbitalLayout importiert, siehe Korrektur K5)

### Schritt 2: SensorColumn.vue extrahieren (1h) — BEREITS ERLEDIGT

> **ERLEDIGT:** SensorColumn.vue existiert bereits als separate Komponente im auto-one Repo. Keine Aktion noetig.

~~1. Den gesamten Sensor-Listen-Bereich (linke Spalte) extrahieren~~
~~2. Props definieren~~
~~3. Events definieren~~
~~4. SensorConfigPanel-Oeffnung: Event nach oben, Parent oeffnet SlideOver~~
~~5. `npm run build` + `npm run test` nach Extraktion~~

### Schritt 3: ActuatorColumn.vue extrahieren (1h) — BEREITS ERLEDIGT

> **ERLEDIGT:** ActuatorColumn.vue existiert bereits als separate Komponente im auto-one Repo. Keine Aktion noetig.

### Schritt 4: OrbitalCenter.vue extrahieren (1h)

1. Center-Bereich mit Charts (GaugeChart, LiveLineChart, HistoricalChart)
2. AnalysisDropZone (fuer Sensor-Auswahl im Center)
3. ESP-Info-Anzeige (Name, Status, RSSI, Uptime)

### Schritt 5: AddSensorFlow.vue extrahieren (1h) — BEREITS ERLEDIGT

> **ERLEDIGT:** AddSensorModal.vue existiert bereits als separate Komponente im auto-one Repo (unter anderem Namen extrahiert). Wird **definitiv genutzt** — NICHT loeschen. Keine Aktion noetig.

~~1. DnD-Logik fuer neuen Sensor aus ComponentSidebar~~
~~2. Modal-Logik~~
~~3. Integration mit dragState.store.ts~~

### Schritt 6: AddActuatorFlow.vue extrahieren (1h) — BEREITS ERLEDIGT

> **ERLEDIGT:** AddActuatorModal.vue existiert bereits als separate Komponente im auto-one Repo (unter anderem Namen extrahiert). Wird **definitiv genutzt** — NICHT loeschen. Keine Aktion noetig.

### Schritt 7: ESPOrbitalLayout.vue als Hauptcontainer (45 Min)

1. Imports der 6 Sub-Komponenten + Composables
2. `provide()` Calls fuer Subtree-State: `espId`, `isEditing`, `selectedSensorId`
3. Layout-Grid (CSS Grid oder Flexbox fuer 3-Spalten)
4. Event-Handling (Sub-Komponenten-Events → SlideOver-Oeffnung, State-Updates)
5. ~~ConnectionLines-Integration~~ ENTFAELLT (ConnectionLines wird nicht von ESPOrbitalLayout importiert)
6. Import-Pfad in DeviceDetailView.vue anpassen (einziger Importeur von ESPOrbitalLayout — NICHT HardwareView!)
7. Ziel: **unter 500 Zeilen**

### Schritt 8: Verifizierung (30 Min)

1. `npm run build` — erfolgreich
2. `npm run test` — 1342+ Tests bestehen
3. `npm run type-check` — 0 Fehler
4. Manuelle Pruefung im Browser:
   - Hardware → Zone → ESP → Orbital oeffnet sich
   - Sensoren links sichtbar, Aktoren rechts
   - Charts im Center funktionieren
   - Sensor-Klick oeffnet SensorConfigPanel
   - DnD aus ComponentSidebar funktioniert
   - ~~Connection-Lines rendern korrekt~~ (ConnectionLines nicht Teil dieses Splits)
   - OneWire-Scanning funktioniert

### State-Management-Pattern (Hybrid-Ansatz)

**NICHT alles ueber Props routen** — das fuehrt zu Prop-Drilling bei 2-3 Ebenen Tiefe. Stattdessen ein Hybrid-Ansatz basierend auf Vue 3 Best Practices (12 Quellen, siehe `wissen/iot-automation/vue3-component-splitting-best-practices.md`):

| State-Typ | Mechanismus | Beispiele |
|-----------|------------|-----------|
| **Globaler App-State** | Pinia Store direkt importieren | `useEspStore()`, `useDragStateStore()` |
| **Subtree-State** | provide/inject vom Parent | `espId`, `isEditing`, `selectedSensorId` |
| **Komponenten-Konfig** | Props | `sensors: SensorConfig[]` an SensorColumn |
| **UI-Aktionen** | Events (emit) nach oben | `'select-sensor'`, `'sensor-added'` |
| **Wiederverwendbare Logik** | Composable | `useOrbitalSensors()`, `useConnectionCoords()` |

**Architektur-Diagramm:**
```
ESPOrbitalLayout.vue (Parent)
│
├── provide('espId', espId)              ← Subtree-State
├── provide('isEditing', isEditing)
├── provide('selectedSensorId', ref)
│
├── SensorColumn.vue
│   ├── inject('espId')                  ← Subtree-State
│   ├── useEspStore()                    ← Globaler State (direkt)
│   ├── useOrbitalSensors()              ← Composable
│   └── emit('select-sensor')            ← UI-Event nach oben
│
├── ActuatorColumn.vue (analog)
│
├── OrbitalCenter.vue
│   ├── inject('espId', 'selectedSensorId')
│   └── useEspStore()
│
│   # ConnectionLines.vue entfernt — wird nicht von ESPOrbitalLayout importiert
│
├── AddSensorFlow.vue
│   ├── useDragStateStore()              ← Globaler DnD-State (direkt)
│   ├── useOrbitalDragDrop()             ← Composable
│   └── emit('sensor-added')             ← UI-Event nach oben
│
└── AddActuatorFlow.vue (analog)
```

**Entscheidungsregel:**
- UI-Orchestrierung (SlideOver oeffnen, Sensor auswaehlen) → **Events**
- Daten-Mutation (Sensor hinzufuegen, Aktor steuern) → **Store-Action**
- Geteilte Berechnung (Sensor-Liste filtern) → **Composable**

### ConnectionLines-Koordinaten-Strategie

> **KORREKTUR K5:** ConnectionLines.vue wird NICHT von ESPOrbitalLayout importiert. Diese Sektion ist daher fuer den aktuellen Split NICHT relevant. Falls ConnectionLines in Zukunft in den Orbital-Bereich integriert wird, gelten die folgenden Ueberlegungen:

~~ConnectionLines.vue braucht DOM-Koordinaten der Sensor/Aktor-Elemente. Nach dem Split liegen diese in SensorColumn und ActuatorColumn.~~

~~**Loesung:** Composable `useConnectionCoords.ts` das via ResizeObserver + MutationObserver die Positionen der Sensor/Aktor-Elemente trackt. Der Parent (ESPOrbitalLayout) instanziiert den Composable und gibt das Ergebnis als Prop an ConnectionLines weiter.~~

~~**Alternative (falls zu aufwaendig):** SensorColumn und ActuatorColumn exponieren via `defineExpose()` eine Methode `getElementPositions()` die der Parent aufruft.~~

~~**Empfehlung:** Composable-Ansatz bevorzugen. defineExpose nur als Fallback wenn die Koordinaten-Berechnung zu komplex fuer einen Composable wird.~~

### Regeln fuer den Split

- **Keine Sub-Komponente ueber 500 Zeilen**
- **Hybrid-State-Pattern:** Props fuer Konfig-Daten, Store-Zugriff fuer globalen State, provide/inject fuer Subtree-State (NICHT alles ueber Props routen)
- **Events statt direkter Eltern-Manipulation** (Child emittiert, Parent reagiert) — fuer UI-Orchestrierung
- **Store-Actions fuer Daten-Mutationen** (Child kann Store direkt aufrufen)
- **Composable-Extraktion PARALLEL zum Component-Split** — Script-Logik in Composables, nicht nur Template aufteilen
- **Alle bestehenden CSS-Klassen und Token-Referenzen beibehalten**
- **Keine neuen Features oder Design-Aenderungen**
- **Import-Pfade konsistent: `@/components/esp/orbital/SensorColumn.vue`**
- **Composable-Pfade: `@/composables/useOrbitalSensors.ts`** (flach, KEIN Subdirectory — Projekt-Konvention)

### Akzeptanzkriterien

**Struktur:**
- [ ] ESPOrbitalLayout.vue ist unter 500 Zeilen
- [ ] Alle 6 Sub-Komponenten existieren in `components/esp/orbital/`
- [ ] Mindestens 3 Composables existieren in `composables/` (flach, kein Subdirectory)
- [ ] Keine Sub-Komponente und kein Composable ueber 500 Zeilen

**Funktionalitaet (keine Regression):**
- [ ] DnD fuer Sensor/Aktor-Hinzufuegen funktioniert weiterhin
- [ ] Charts im Orbital-Center funktionieren weiterhin
- ~~[ ] Connection-Lines (SVG) rendern korrekt~~ (nicht Teil dieses Splits)
- [ ] OneWire-Scanning funktioniert weiterhin
- [ ] SensorConfigPanel / ActuatorConfigPanel oeffnen per Klick

**Build + Tests (nach JEDEM Split-Schritt UND am Ende):**
- [ ] `npm run build` erfolgreich
- [ ] `npm run test` — keine Regression (1342+ Tests bestehen)
- [ ] `npm run type-check` — 0 TypeScript-Fehler

**Architektur:**
- [ ] provide/inject wird fuer Subtree-State genutzt (espId, isEditing)
- [ ] Globale Stores (espStore, dragState) werden in Sub-Komponenten direkt importiert (kein Prop-Drilling)
- [ ] Import-Pfad in DeviceDetailView.vue aktualisiert (einziger Importeur von ESPOrbitalLayout)
- [ ] Keine neuen Features oder Design-Aenderungen eingefuehrt

### Referenzen

**Life-Repo:**
- `arbeitsbereiche/automation-one/auftrag-phase3-analyse-dnd-widgets.md` — TEIL 3.3 ESPOrbitalLayout-Split Anforderungen
- `arbeitsbereiche/automation-one/auftrag-frontend-ux-konsolidierung.md` — Aufgabe 5.9
- `arbeitsbereiche/automation-one/Dashboard_analyse.md` — Komponenteninventar
- `wissen/iot-automation/vue3-component-splitting-best-practices.md` — **Vue 3 Splitting Best Practices** (12 Quellen, Entscheidungsmatrix, provide/inject vs Props vs Store)
- `.claude/reports/current/review-auftrag-orbital-split-2026-02-23.md` — Review-Bericht mit 6 Ergaenzungen

**Ziel-Repo (auto-one):**
- `El Frontend/src/components/esp/ESPOrbitalLayout.vue` — 655 Zeilen, aufzuteilen
- `El Frontend/src/components/esp/ESPOrbitalLayout.css` — separate CSS-Datei, muss mit nach `orbital/` verschoben werden
- ~~`El Frontend/src/components/esp/ConnectionLines.vue` — existiert, nach orbital/ verschieben~~ (nicht Teil dieses Splits)
- `El Frontend/src/components/esp/SensorConfigPanel.vue` — SlideOver-Panel
- `El Frontend/src/components/esp/ActuatorConfigPanel.vue` — SlideOver-Panel
- `El Frontend/src/shared/stores/dragState.store.ts` — Zentraler DnD-State
- `El Frontend/src/stores/esp.ts` — WebSocket-Dispatcher
- `El Frontend/src/styles/tokens.css` — Design-Tokens

### Aufgeloeste Punkte (ehemals "Offen")

| # | Frage | Entscheidung | Begruendung |
|---|-------|-------------|-------------|
| 1 | OneWire-Scanning: SensorColumn oder eigene Komponente? | **SensorColumn** + Composable `useOneWireScanning.ts` | OneWire ist sensor-spezifisch, nicht layout-spezifisch. Die Logik kommt in einen Composable, das UI bleibt in SensorColumn |
| 2 | Werden AddSensorModal/AddActuatorModal noch genutzt? | **JA, definitiv genutzt** | ~~Phase 1+2 hat Konfiguration auf SensorConfigPanel/ActuatorConfigPanel (SlideOver) zentralisiert. Falls Modals noch existieren: entfernen und durch SlideOver ersetzen~~ **KORREKTUR K9:** AddSensorModal + AddActuatorModal sind aktiv im Einsatz. NICHT loeschen. Sie dienen dem Hinzufuegen neuer Sensoren/Aktoren (andere Funktion als die Config-Panels) |
| 3 | Muss der Import-Pfad angepasst werden? | **JA, zwingend — in DeviceDetailView.vue** | Import-Pfad aendert sich von `@/components/esp/ESPOrbitalLayout.vue` zu `@/components/esp/orbital/ESPOrbitalLayout.vue`. **DeviceDetailView.vue ist der EINZIGE Importeur** (nicht HardwareView!) |

### Noch zu pruefen durch den Agent

- ~~Ob `DeviceDetailView.vue` den ESPOrbitalLayout-Import hat~~ → **BESTAETIGT: DeviceDetailView.vue ist der EINZIGE Importeur** (nicht HardwareView)
- Ob es `index.ts` Barrel-Exports in `components/esp/` gibt die angepasst werden muessen
- ~~Ob andere Komponenten ConnectionLines.vue direkt importieren~~ → **ConnectionLines wird NICHT von ESPOrbitalLayout importiert** (siehe Korrektur K5)

### Wissens-Referenz

Die Vue 3 Best Practices fuer diesen Split sind dokumentiert in:
→ `wissen/iot-automation/vue3-component-splitting-best-practices.md` — 12 Quellen, Entscheidungsmatrix, Anti-Patterns
→ 12 Quellen in Zotero: Research > Programmierung (importiert 2026-02-23)

---

### Verifikations-Protokoll (2026-02-26)

**9 Korrekturen eingearbeitet nach Code-Verifikation:**

| # | Korrektur | Stellen | Was geaendert |
|---|-----------|---------|---------------|
| K1 | Zeilenanzahl 633 → 655 | Status-Update, Titel, Kontext, Ist-Zustand, Ziel-Repo | 5x korrigiert |
| K2 | Schritte 2+3 ERLEDIGT | Schritt 2, Schritt 3 | SensorColumn + ActuatorColumn existieren bereits — als erledigt markiert |
| K3 | Schritte 5+6 ERLEDIGT | Schritt 5, Schritt 6 | AddSensorModal + AddActuatorModal existieren bereits — als erledigt markiert |
| K4 | HardwareView → DeviceDetailView | Schritt 1.3, Schritt 7.6, Aufgeloeste Punkte #3, Noch zu pruefen, Akzeptanzkriterien | DeviceDetailView.vue ist der EINZIGE Importeur |
| K5 | ConnectionLines entfernt | Betroffene Module, Ziel-Struktur, Architektur-Diagramm, Schritt 7.5, Schritt 8, ConnectionLines-Strategie, Akzeptanzkriterien, Noch zu pruefen, Ziel-Repo | Wird NICHT von ESPOrbitalLayout importiert |
| K6 | Composables flat statt subdirectory | Ziel-Struktur, Regeln, Akzeptanzkriterien | `composables/` statt `composables/orbital/` — Projekt-Konvention |
| K7 | ESPOrbitalLayout.css ergaenzt | Betroffene Module, Ziel-Repo | Separate CSS-Datei muss mit verschoben werden |
| K8 | Test-Anzahl 1355 → 1342 | An den naechsten Agenten, Vorhandene Infrastruktur, Schritt 8, Akzeptanzkriterien | 4x korrigiert |
| K9 | AddSensorModal/AddActuatorModal definitiv genutzt | Aufgeloeste Punkte #2 | NICHT loeschen — andere Funktion als Config-Panels |

**Zusaetzlich korrigiert:**
- Begruendung Composables: "ZWINGEND" → "OPTIONAL" (bei 655 Z. nicht mehr kritisch)
- Ziel-Repo Referenz: 3913 → 655 Zeilen
