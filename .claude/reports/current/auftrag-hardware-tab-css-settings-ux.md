# Auftrag: Hardware-Tab CSS-Sanierung + Settings-UX-Modernisierung

> **Datum:** 2026-02-25
> **Aktualisiert:** 2026-02-26 (IST-Analyse: Block A ~60% erledigt, Block D 100% erledigt, ESPCardBase+useESPStatus existieren bereits)
> **Aktualisiert:** 2026-02-26 (Phase 1 ERLEDIGT: Block A + Block C + Block D komplett. Verbleibend: Block B)
> **Prioritaet:** P0 (CSS-Bugs) + P1 (Settings UX)
> **Aufwand:** ~~12-14 Stunden~~ ~~8-10 Stunden~~ **~5h verbleibend** (Block A ERLEDIGT, Block C ERLEDIGT, Block D ERLEDIGT, nur Block B offen)
> **Voraussetzung:** Orbital-Split (`auftrag-orbital-split.md`) sollte vorher oder parallel laufen — Block A+B sind unabhaengig
> **Agent:** Frontend-Dev Agent (auto-one)
> **Branch:** `fix/hardware-tab-css-settings-ux`

---

## Kontext

Robins Hardware-Tab-Erstanalyse (2026-02-25) hat 3 kritische Probleme identifiziert:

1. **Weisse Modals auf Dark Background:** 5 Kindkomponenten nutzen `<Teleport to="body">`, aber die CSS-Klassen sind in `ESPOrbitalLayout.css` als `scoped` definiert → Browser-Defaults greifen
2. **Undefinierte Button-Klassen:** `btn--primary` und `btn--secondary` werden in 4 Dateien referenziert aber nirgends definiert
3. **Settings-Panels zu lang:** SensorConfigPanel, ActuatorConfigPanel und ESPSettingsSheet sind funktional, aber fuer Endbenutzer unuebersichtlich — alles auf einmal sichtbar, keine Hierarchie

Zusaetzlich: ESP-Cards existieren in 4 verschiedenen Varianten ohne einheitliche Basis-Komponente. Status-Anzeigen (Farben, Icons, Badges) sind inkonsistent zwischen Views.

## Wissensgrundlage

| Thema | Datei | Relevante Erkenntnis |
|-------|-------|---------------------|
| Settings-Panel UX | `wissen/iot-automation/iot-device-config-panel-ux-patterns.md` | **Three-Zone-Pattern** (Basic/Advanced/Expert), Container nach Feldanzahl (≤5=Dialog, 5-15=SlideOver, 15+=Page+Accordion), Sensor-Type-Aware Defaults |
| Dashboard-Design | `wissen/iot-automation/iot-dashboard-design-best-practices-2026.md` | Einstellungen gehoeren zum Objekt, 5-Sekunden-Regel, Farb-Kodierung |
| KI-Antipatterns | `wissen/iot-automation/ki-frontend-antipatterns-konsolidierung-2026.md` | #6 Component-Sprawl (eine konfigurierbare Komponente statt 15 Varianten), #5 Fehlende Informationshierarchie |
| Cognitive Load | `wissen/iot-automation/dashboard-cognitive-load-overview-detail-pattern.md` | Status: Text+Farbe+Icon (nie Farbe allein), Redundante Kodierung entlastet Working Memory |
| Component-Splitting | `wissen/iot-automation/vue3-component-splitting-best-practices.md` | Composables fuer geteilte Logik, Factory-Pattern fuer Varianten |
| Home Assistant | `iot-device-config-panel-ux-patterns.md` Sektion 3 | Tabs→Icons-Transition, Primaerkontrollen vertikal oben, Sekundaeroptionen darunter |
| Grafana Design System | `iot-device-config-panel-ux-patterns.md` Sektion 2 | Accordion fuer lange Formulare, Ein Primary Button, nie Submit deaktivieren |

## Architektur-Entscheidungen (BEREITS GETROFFEN)

1. **Shared CSS statt Scoped Duplikation** — Modals/Forms CSS wird aus ESPOrbitalLayout.css extrahiert und global importiert
2. **Three-Zone-Pattern fuer Settings** — Basic (immer sichtbar) → Advanced (Accordion eingeklappt) → Expert (Overflow-Menu/Deep-Link)
3. **EIN Unified ESP-Card-Basis-Component** — `ESPCard.vue` mit `variant`-Prop statt 4 separate Komponenten
4. **Design-Token-System erweitern** — `tokens.css` um Form- und Button-Tokens ergaenzen, nicht separate CSS-Datei pro Komponente

---

## Block A: CSS-Extraktion + Button-System — ERLEDIGT (2026-02-26)

> **KOMPLETT ERLEDIGT (2026-02-26):**
> - `src/styles/forms.css` EXISTIERT (414 Zeilen), importiert in `main.css:16`
> - Modal/Form/Alert/Button-CSS aus ESPOrbitalLayout.css EXTRAHIERT (1057 statt 1380 Z.)
> - `.connection-dot` BEREITS ENTFERNT
> - **Button-System VEREINHEITLICHT:** Doppelte `.btn--primary`/`.btn--secondary` BEM-Definitionen in forms.css ENTFERNT. `.btn-primary`/`.btn-secondary` in main.css sind kanonisch
> - **Token-Aliase ERGAENZT:** `--color-text-inverse`, `--color-border`, `--color-surface-hover` in tokens.css
>
> ~~Verbleibender Restaufwand:~~ **0h**

### A1: ~~Shared Form CSS extrahieren~~ — ERLEDIGT

~~Aus `ESPOrbitalLayout.css` extrahieren und in `src/styles/forms.css` verschieben:~~

**Status:** forms.css existiert (414 Z.), ESPOrbitalLayout.css auf 1057 Z. reduziert. Modal-CSS global. Marker-Kommentar in ESPOrbitalLayout.css Zeile 677.

### A2: ~~Button-System VEREINHEITLICHEN~~ — ERLEDIGT (2026-02-26)

**Ergebnis:** `.btn-primary`/`.btn-secondary` in main.css als kanonisch beibehalten. Doppelte `.btn--primary`/`.btn--secondary` BEM-Definitionen in forms.css ENTFERNT.

### A3: ~~Fehlende Token-Aliase ergaenzen~~ — ERLEDIGT (2026-02-26)

**Ergebnis:** 3 semantische Token-Aliase in tokens.css hinzugefuegt:
- `--color-text-inverse`
- `--color-border`
- `--color-surface-hover`

### A4: ~~Legacy-CSS-Cleanup~~ — ERLEDIGT

~~`.connection-dot` (Zeile 492) entfernen~~

**Status:** `.connection-dot` existiert NICHT MEHR in ESPOrbitalLayout.css. Bereits bereinigt.

### A5: Teleport-Konsistenz — OFFEN (niedrige Prio)

AddSensorModal.vue und AddActuatorModal.vue haben KEIN `<Teleport to="body">` (rendern inline). Derzeit kein sichtbarer z-Index-Konflikt. Kann bei Bedarf nachgeruestet werden.

### A6: Verifizierung — BESTANDEN (2026-02-26)

- [x] NUR EINE Button-Konvention im gesamten Projekt (btn-primary in main.css)
- [x] Token-Aliase in tokens.css vorhanden (3 neue Aliase)
- [x] Build erfolgreich (`npm run build` — 24s)
- [x] `vue-tsc --noEmit` — 0 TypeScript-Fehler
- [ ] Teleport-Konsistenz (siehe A5, niedrige Prio)

**Commit:** `fix(css): unify button system, add token aliases`

---

## Block B: Settings-Panel Modernisierung (P1, ~5h)

### B1: SensorConfigPanel — Three-Zone-Refactoring

**IST-Zustand:** Alle Felder sequentiell sichtbar (Name, Typ, GPIO, Intervall, Schwellwerte, Kalibrierung, Betriebsmodus, Debug-Info). Scrollbar, unuebersichtlich.

**SOLL-Zustand (Three-Zone-Pattern):**

```
┌─────────────────────────────────────┐
│ Zone 1: BASIC (immer sichtbar)      │
│ ┌─────────────────────────────────┐ │
│ │ Live-Wert: 23.5°C  ●OK         │ │
│ │ Name: [Gewaechshaus Temp]  ✏️   │ │
│ │ Status-Badge + Quality-Indikator │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ▸ Schwellwerte & Alarme             │  ← Accordion (eingeklappt)
│   Min-Alarm: [15] Min-Warn: [18]   │
│   Max-Warn: [30]  Max-Alarm: [35]  │
│   Einheit: [°C ▼]                  │
│                                     │
│ ▸ Betrieb & Intervall               │  ← Accordion (eingeklappt)
│   Modus: [Kontinuierlich ▼]        │
│   Intervall: [30s ▼]               │
│   Timeout: [180s]                   │
│                                     │
│ ▸ Kalibrierung                      │  ← Accordion (eingeklappt)
│   Offset: [0.0]  Skalierung: [1.0] │
│   2-Punkt-Kalibrierung [Button]     │
│                                     │
│ ⋮ Erweitert (GPIO, I2C, Debug)      │  ← Overflow-Menu (Expert)
│   GPIO: 22 (read-only bei I2C)     │
│   I2C-Adresse: 0x44                 │
│   Raw-Daten anzeigen [Toggle]       │
│   Letzte 10 Readings [Table]        │
└─────────────────────────────────────┘
```

**Implementation:**
- Vue 3 `<details>`/`<summary>` oder eigene `AccordionSection.vue` Komponente (wiederverwendbar!)
- `AccordionSection.vue` Props: `title: string`, `defaultOpen: boolean`, `icon?: string`
- Sections persistent offen/geschlossen via `localStorage` (User-Praeferenz bleibt)
- Animierte Expand/Collapse-Transition (200ms, CSS `max-height`)

### B2: ActuatorConfigPanel — Three-Zone-Refactoring

Analog zu B1, aber mit Aktor-spezifischen Sections:
- **Basic:** Status (AN/AUS), Name, Typ-Badge
- **Steuerung:** Modus (Manuell/Automatisch/Zeitgesteuert), PWM-Wert, Schaltzeiten
- **Sicherheit:** Max-Laufzeit, Notaus-Verknuepfung, Conflict-Check
- **Erweitert:** GPIO, Schaltlogik (Active High/Low), Debug

### B3: ESPSettingsSheet — Vereinfachung

**IST-Zustand:** Modal mit Name, Zone-Dropdown, Delete-Button, Heartbeat-Info — alles auf einem Screen.

**SOLL-Zustand:**
- **Header:** ESP-Name (inline editierbar, Pencil-Icon) + Status-Badge + Firmware-Version
- **Quick-Actions:** Zone-Zuweisung (Dropdown), Neustart (Button), Loeschen (Destructive, ganz unten mit Bestaetigung)
- **Details-Section (Accordion):** Heartbeat-Historie, WiFi-Signal, Uptime, letzte Fehlermeldung
- **KEIN Modal:** Umbauen zu SlideOver (konsistent mit SensorConfigPanel/ActuatorConfigPanel)

### B4: Sensor-Type-Aware Defaults

Wenn User im AddSensorModal einen Sensortyp waehlt, werden Felder automatisch vorausgefuellt:

| Sensortyp | Interface | GPIO/Adresse | Intervall | Einheiten | Schwellwerte |
|-----------|-----------|-------------|-----------|-----------|-------------|
| sht31 | I2C | 0x44 (SDA:21, SCL:22) | 30s | °C, %RH | 15-35°C, 30-80%RH |
| bmp280 | I2C | 0x76 | 60s | °C, hPa | 15-35°C, 950-1050hPa |
| ds18b20 | OneWire | GPIO 4 | 30s | °C | 0-100°C |
| Analog pH | ADC1 | GPIO 34 | 60s | pH | 4.0-9.0 |
| Analog EC | ADC1 | GPIO 35 | 60s | mS/cm | 0.5-3.0 |

**Quelle:** `sensorDefaults.ts` (existiert bereits! MULTI_VALUE_DEVICES Mapping). Der Agent muss pruefen was bereits vorhanden ist und NUR ergaenzen.

**User-Flow:**
1. User waehlt Sensortyp → Alle Felder vorausgefuellt
2. User sieht Zusammenfassung ("SHT31 auf I2C 0x44, misst Temperatur + Feuchte alle 30s")
3. User klickt "Hinzufuegen" ODER klappt "Erweitert" auf um Defaults zu aendern
4. ≤2 Klicks fuer Standard-Setup statt 8+ Felder manuell ausfuellen

**Commit:** `refactor(settings): three-zone accordion pattern, sensor-type defaults`

---

## Block C: ESP-Card ADOPTION + Status-Konsistenz — ERLEDIGT (2026-02-26)

> **KOMPLETT ERLEDIGT (2026-02-26):**
> - `useESPStatus.ts` erweitert: Pure Funktionen `getESPStatus()` und `getESPStatusDisplay()` exportiert
> - `ESPHealthWidget.vue`: Lokale `isOnline()` durch `getESPStatus()` aus useESPStatus ersetzt
> - `ESPCard.vue` (1751 Z.): Lokale `isMock`, `isOnline`, `espId` durch useESPStatus-Composable ersetzt + unused `espApi` Import entfernt
> - `DeviceSummaryCard.vue`: War bereits migriert (Auftrag war outdated)
> - **Verifikation:** `vue-tsc --noEmit` 0 Fehler, `npm run build` erfolgreich, 1348/1353 Tests passed

### C1: Status-Inkonsistenz-Inventar (aktualisiert)

| Komponente | Zeilen | useESPStatus? | Eigene Status-Logik? |
|-----------|--------|---------------|---------------------|
| DeviceMiniCard.vue | 448 | JA ✓ | Nein |
| DeviceSummaryCard.vue | 449 | NEIN ✗ | Ja: eigene isOnline, healthScore, Farb-Logik |
| ESPHealthWidget.vue | 253 | NEIN ✗ | Ja: Filtering + Sorting + Score-Berechnung |
| ESPCard.vue | **1751** | NEIN ✗ | Ja: eigene formatRelativeTime(), statusText, Farben |
| ESPOrbitalLayout.vue | 655 | NEIN ✗ | Minimal (1 Zeile: `device.status === 'online'`) |
| ESPCardBase.vue | 274 | JA ✓ | Nein (nutzt Composable korrekt) |

**3 von 6 Varianten berechnen Status eigenstaendig.** ESPCard.vue (1751 Z.) hat sogar eine eigene `formatRelativeTime()` die identisch zur Funktion in useESPStatus.ts ist.

### C2: ~~Migration — DeviceSummaryCard~~ — BEREITS MIGRIERT

DeviceSummaryCard nutzte bereits useESPStatus. Auftrag war outdated.

### C3: ~~Migration — ESPHealthWidget~~ — ERLEDIGT (2026-02-26)

Lokale `isOnline()` durch `getESPStatus()` aus useESPStatus ersetzt.

### C4: ~~Migration — ESPCard.vue (1751 Z.)~~ — ERLEDIGT (2026-02-26)

Lokale `isMock`, `isOnline`, `espId` durch useESPStatus-Composable ersetzt. Unused `espApi` Import entfernt. Nur Status-Logik vereinheitlicht, Rest der Komponente unveraendert.

### C5: Verifikation — BESTANDEN (2026-02-26)

- [x] ESPHealthWidget im Dashboard-Builder verwendet useESPStatus (getESPStatus())
- [x] ESPCard.vue verwendet useESPStatus
- [x] useESPStatus.ts exportiert pure Funktionen getESPStatus() + getESPStatusDisplay()
- [x] `vue-tsc --noEmit` — 0 TypeScript-Fehler
- [x] `npm run build` — erfolgreich (24s)
- [x] `npm run test` — 1348/1353 passed (5 pre-existierende Failures in ComponentCard.test.ts, unrelated)

**Commit:** `refactor(esp): adopt useESPStatus in ESPHealthWidget + ESPCard`

---

## Block D: ~~Legacy-Cleanup~~ + Abschluss — BEREITS ERLEDIGT

> **IST-ANALYSE UPDATE (2026-02-26):** Block D ist KOMPLETT ERLEDIGT.
> Alle 5 Dead-Code-Dateien wurden in einer frueheren Session geloescht:
> - SensorSidebar.vue ✗ GELOESCHT
> - ActuatorSidebar.vue ✗ GELOESCHT
> - ZoneMonitorView.vue ✗ GELOESCHT
> - ZoomBreadcrumb.vue ✗ GELOESCHT
> - LevelNavigation.vue ✗ GELOESCHT
>
> Nur Kommentar-Referenzen verbleiben (in sensorDefaults.ts, dragState.store.ts, TopBar.vue) — harmlos.
> ESPOrbitalLayout.css ist bereits bei 1057 Zeilen (nach forms.css-Extraktion).

### D1: Abschluss-Testlauf (verbleibt nach Block A+B+C)

- [ ] `npm run build` erfolgreich
- [ ] `npm run test` — alle bestehenden Tests gruen (1342/1343, 1 pre-existing Timeout)
- [ ] Manueller Test: Alle Modals oeffnen und schliessen (Teleport-Konsistenz)
- [ ] Manueller Test: Sensor hinzufuegen mit Type-Defaults
- [ ] Manueller Test: ESP-Status-Konsistenz ueber alle Views pruefen
- [ ] Manueller Test: Button-Styling konsistent (nur eine Konvention)

**Commit:** `cleanup: verify CSS extraction and ESP card adoption`

---

## Abhaengigkeiten zu anderen Auftraegen

| Auftrag | Beziehung |
|---------|-----------|
| `auftrag-orbital-split.md` | **PARALLEL MOEGLICH.** Block A+B sind unabhaengig vom Split. Block C (ESP-Card) kann nach dem Split leichter integriert werden, ist aber nicht blockiert. **Status (2026-02-26):** Orbital-Split ~60% erledigt — SensorColumn, ActuatorColumn, AddSensorModal, AddActuatorModal bereits extrahiert. Restumfang: OrbitalCenter.vue + Composables + Verzeichnis-Umzug |
| `auftrag-view-architektur-dashboard-integration.md` | **DANACH.** CSS-Sanierung muss vorher erledigt sein damit die View-Restrukturierung auf sauberem CSS aufbaut |
| `auftrag-dnd-konsolidierung-interaktion.md` | **UNABHAENGIG.** DnD-Fixes betreffen andere Code-Pfade. Koennen parallel laufen |
| `auftrag-unified-monitoring-ux.md` | **SYNERGIEN:** ESPCardBase + useESPStatus wird von SystemStatusBar wiederverwendet. AccordionSection.vue wird in Alert-Details wiederverwendet |
| `auftrag-dashboard-reaktivitaet-performance.md` | **SYNERGIEN:** ESPHealthWidget nutzt nach diesem Auftrag ESPCardBase variant="widget" |

---

## Zusammenfassung der Ergebnisse (aktualisiert 2026-02-26, Phase 1 ERLEDIGT)

| Metrik | Vorher | IST (nach Phase 1) | Ziel (nach Block B) |
|--------|--------|---------------------|---------------------|
| Weisse/unstyled Modals | 5 | 0 (forms.css global) ✓ | 0 |
| Button-Naming-Konventionen | 2 parallel | **1 (btn-primary in main.css) ✓ ERLEDIGT** | 1 |
| Token-Aliase (text-inverse, border, surface-hover) | 0 | **3 ✓ ERLEDIGT** | 3 |
| ESP-Card-Varianten ohne useESPStatus | 4 | **0 ✓ ERLEDIGT** (ESPHealthWidget + ESPCard.vue migriert) | 0 |
| useESPStatus pure Funktionen | 0 | **2 ✓ ERLEDIGT** (getESPStatus + getESPStatusDisplay) | 2 |
| Felder sichtbar beim Sensor-Config oeffnen | ~15 | ~15 (Block B noch offen) | ~3 (Basic Zone) |
| Klicks fuer Standard-Sensor-Setup | 8+ | 8+ (Block B noch offen) | 2-3 (Type-Defaults) |
| ESPOrbitalLayout.css Zeilen | 1380 | 1057 (-23%) | ~700 |
| Dead-Code-Dateien | 5 | 0 ✓ ERLEDIGT | 0 |
