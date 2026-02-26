# IST-Analyse Frontend-Konsolidierung

> **Datum:** 2026-02-26
> **Agent:** Claude Opus 4.6 (direkt, kein Skill)
> **Methode:** Reine Code-Analyse (grep, read, glob) — kein Code veraendert
> **Basis:** master Branch (einziger Branch)

---

## Teil 1: Dashboard-Umbenennung

### A1: Sidebar-Label
- **Status:** OK
- **IST:** Label = "Dashboard", Icon = `LayoutDashboard` (Sidebar.vue:81-82)
- **SOLL:** Label = "Dashboard", Icon = `LayoutDashboard`
- **Auswirkung:** Keine

### A2: ViewTabBar Tab-Labels
- **Status:** OK
- **IST:** `[Uebersicht] [Monitor] [Editor]` (ViewTabBar.vue:17-21)
- **SOLL:** `[Uebersicht] [Monitor] [Editor]`
- **Auswirkung:** Keine

### Branch-Status
- **Status:** OK
- **IST:** Aenderungen sind auf `master` gemergt (Commit 31e03a9). Kein separater Branch mehr vorhanden.
- **SOLL:** Auf master gemergt
- **Auswirkung:** Keine

---

## Teil 2: CSS-Zustand

### ESPOrbitalLayout.css Groesse
- **Status:** ABWEICHUNG
- **IST:** 1057 Zeilen
- **SOLL:** ~1380 Zeilen
- **Auswirkung:** Positiv — 323 Zeilen wurden bereits nach forms.css extrahiert (Modal, Form, Button-Styles). Block A ist damit TEILWEISE bereits erledigt.

### Modal-CSS Scoped?
- **Status:** ABWEICHUNG (positiv)
- **IST:** Modal-Klassen (`.modal-overlay`, `.modal-content`, `.modal-header`) sind NICHT MEHR in ESPOrbitalLayout.css. Nur ein Kommentar-Marker in Zeile 677: `Modal/Form/Alert/Button styles extracted to src/styles/forms.css (global).` Verbleibend: Schedule-Config-Styles (Zeilen 681-1057).
- **SOLL:** Auftrag erwartete sie noch in ESPOrbitalLayout.css
- **Auswirkung:** Block A CSS-Extraktion ist fuer Modals BEREITS ERLEDIGT. Nur schedule-config und verbleibende Orbital-spezifische Styles sind noch im File.

### Shared forms.css
- **Status:** ABWEICHUNG (positiv)
- **IST:** `src/styles/forms.css` EXISTIERT (414 Zeilen). Importiert in `main.css:16`. Enthaelt: Modal-Overlay/Content/Header/Footer, Form-Groups/Labels/Inputs/Selects/Ranges/Checkboxes, Button-Varianten (BEM), Info-Box, Alert-Messages.
- **SOLL:** Auftrag nahm an, forms.css muesse ERSTELLT werden
- **Auswirkung:** Block A Teilaufgabe "forms.css erstellen" ist BEREITS ERLEDIGT.

### btn--primary / btn--secondary
- **Status:** ABWEICHUNG (Inkonsistenz)
- **IST:** Es existieren ZWEI Button-Namenskonventionen:
  1. `btn-primary` / `btn-secondary` (Bootstrap-Stil, ohne BEM) — definiert in `main.css:102,123` (in `@layer components`)
  2. `btn--primary` / `btn--secondary` (BEM Doppel-Dash) — definiert in `forms.css:240,262`
  - Vue-Dateien nutzen UEBERWIEGEND die main.css-Variante (`btn btn-primary`): AddSensorModal, AddActuatorModal, EditSensorModal, EmergencyStopButton
  - Nur EditSensorModal.vue nutzt auch BEM-Varianten: `btn btn--accent btn--sm`
- **SOLL:** Auftrag erwartete "btn--primary verwendet in 4 Dateien, definiert NIRGENDS"
- **Auswirkung:** Die BEM-Varianten in forms.css sind grossteils UNGENUTZT (tote Definitionen). Das Button-System braucht VEREINHEITLICHUNG statt Neuerstellung. Block A sollte die Inkonsistenz aufloesen.

### tokens.css Design-Tokens
- **Status:** OK (mit Luecken)
- **IST:**
  - `--color-accent: #3b82f6` ✓
  - `--color-text-inverse`: FEHLT (kein Aequivalent, muesste als `#fff` oder aehnlich definiert werden)
  - `--color-border`: FEHLT (Aequivalent: `--glass-border: rgba(255,255,255,0.06)`)
  - `--color-surface-hover`: FEHLT (Aequivalent: `--color-bg-hover: #1d1d2a` / `--color-bg-quaternary`)
  - `--radius-md: 10px` ✓
  - `--space-sm: var(--space-2)` (8px), `--space-lg: var(--space-6)` (24px) ✓ (Legacy-Aliase)
- **SOLL:** Alle Token vorhanden
- **Auswirkung:** Fehlende Aliase sollten in Block A ergaenzt werden, statt Hardcoded-Werte zu nutzen.

### Teleport-Modals
- **Status:** ABWEICHUNG
- **IST:** 17 Teleport-Nutzungen im Projekt. Die erwarteten 5 ESP-bezogenen:
  - `EditSensorModal.vue:216` ✓ Teleport
  - `ESPSettingsSheet.vue:410` ✓ Teleport
  - `PendingDevicesPanel.vue:236` ✓ Teleport
  - `AddSensorModal.vue` ✗ KEIN Teleport
  - `AddActuatorModal.vue` ✗ KEIN Teleport
- **SOLL:** 5 ESP-Dateien mit Teleport
- **Auswirkung:** AddSensorModal und AddActuatorModal werden OHNE Teleport gerendert — sie rendern inline im Parent. Das funktioniert aktuell, aber widerspricht dem erwarteten Pattern. Pruefen ob z-Index-Konflikte entstehen.

### .connection-dot Legacy
- **Status:** ABWEICHUNG
- **IST:** `.connection-dot` existiert NICHT in ESPOrbitalLayout.css
- **SOLL:** Erwartet in Zeile ~492
- **Auswirkung:** Bereits bereinigt. Keine Aktion noetig.

---

## Teil 3: Dead-Code-Inventar

### Alle 5 Dead-Code-Dateien
- **Status:** ABWEICHUNG (positiv)

| Datei | Existiert? | Imports | Erwartet Zeilen |
|-------|-----------|---------|----------------|
| SensorSidebar.vue | NEIN | 0 (nur Kommentare in sensorDefaults.ts, dragState.store.ts) | ~573 |
| ActuatorSidebar.vue | NEIN | 0 (nur Kommentare in actuatorDefaults.ts, dragState.store.ts) | ~518 |
| ZoneMonitorView.vue | NEIN | 0 | ~633 |
| ZoomBreadcrumb.vue | NEIN | 0 (nur Kommentar in TopBar.vue) | ~121 |
| LevelNavigation.vue | NEIN | 0 | ~124 |

- **SOLL:** Dateien existieren mit 0 Imports → loeschbar
- **Auswirkung:** **Block D ist BEREITS ERLEDIGT.** Alle 5 Dateien wurden in einer frueheren Session geloescht. Nur Kommentar-Referenzen verbleiben (harmloss, koennen bei Gelegenheit bereinigt werden). Die geplanten ~1969 Zeilen Dead-Code-Loeeschung ist nicht mehr noetig.

---

## Teil 4: ESP-Card-Varianten

### ESPCardBase.vue
- **Status:** ABWEICHUNG (kritisch)
- **IST:** EXISTIERT (274 Zeilen, `components/esp/ESPCardBase.vue`). Nutzt useESPStatus. Hat 4 Varianten (mini/summary/detail/widget) via Props. Bietet Named Slots (name, actions, default, metrics, footer). ABER: wird NIRGENDS importiert — null Consumer.
- **SOLL:** Sollte NICHT existieren (erst in Block C erstellt)
- **Auswirkung:** Block C muss umformuliert werden: Statt "ESPCardBase erstellen" → "ESPCardBase in alle Varianten ADOPTIEREN". Die Komponente existiert, ist gut designed, aber hat keine Nutzer.

### useESPStatus.ts
- **Status:** ABWEICHUNG (kritisch)
- **IST:** EXISTIERT (176 Zeilen, `composables/useESPStatus.ts`). Vollstaendig implementiert mit:
  - 6 Status-Werte: online, stale, offline, error, safemode, unknown
  - Heartbeat-Schwellwerte: STALE=90s, OFFLINE=300s
  - Computed: status, statusColor, statusText, statusIcon, statusPulse, isReachable, isOnline, isMock, borderColor, displayName, deviceId, lastSeenText
  - Re-exportiert in `composables/index.ts`
  - Genutzt von: DeviceMiniCard.vue, ESPCardBase.vue
- **SOLL:** Sollte NICHT existieren (erst in Block C erstellt)
- **Auswirkung:** Block C muss umformuliert werden: Statt "useESPStatus erstellen" → "useESPStatus in verbleibende Varianten migrieren".

### Status-Logik Vergleich

| Komponente | Zeilen | Status-Quelle | useESPStatus? | Eigene Schwellwerte? |
|-----------|--------|---------------|---------------|---------------------|
| DeviceMiniCard.vue | 448 | useESPStatus | JA ✓ | Nein (nutzt Composable) |
| DeviceSummaryCard.vue | 449 | Inline (`.status`, `.connected`, `last_seen`) | NEIN | Ja: eigene isOnline, healthScore, Farb-Logik |
| ESPHealthWidget.vue | 253 | Inline (`.status`, `.connected`) | NEIN | Ja: Filtering + Sorting + Score-Berechnung |
| ESPCard.vue | 1751 | Inline (`.connected`, `.last_heartbeat`, `.status`) | NEIN | Ja: `formatRelativeTime()`, statusText, eigene Farben |
| ESPOrbitalLayout.vue | 655 | Minimal (1 Zeile: `device.status === 'online'`) | NEIN | Nein (delegiert an Child-Komponenten) |
| ESPCardBase.vue | 274 | useESPStatus | JA ✓ | Nein (nutzt Composable) |

**Inkonsistenz:** 3 von 6 Varianten berechnen Status unabhaengig. DeviceSummaryCard hat eigene `healthScore`-Berechnung (0-100). ESPCard hat eigene `formatRelativeTime()` (identisch zur Funktion in useESPStatus.ts).

---

## Teil 5: Settings-Panels

### SensorConfigPanel.vue
- **Status:** OK
- **IST:** 943 Zeilen. Sektionen: Basic Fields (Name, Zone, Unit, Active), Interface-spezifisch (GPIO/I2C/OneWire), Threshold-Config (RangeSlider), Calibration-Wizard (pH/EC), Live-Preview-Chart. Hat INLINE Accordion-Buttons (`.sensor-config__accordion`) fuer Thresholds und Calibration — keine separate Komponente.
- **Auswirkung:** Block B AccordionSection koennte SensorConfigPanel refactoren.

### ActuatorConfigPanel.vue
- **Status:** OK
- **IST:** 737 Zeilen. Kein Accordion-Pattern sichtbar.
- **Auswirkung:** Keine

### ESPSettingsSheet.vue
- **Status:** OK
- **IST:** 1413 Zeilen. Custom Modal-Implementierung (NICHT SlideOver-Primitive). Nutzt `z-index: var(--z-modal)` direkt. Hat eigene Action-Button-Varianten (`.action-btn--secondary`, `.action-btn--heartbeat`, etc.).
- **Auswirkung:** Grosse Datei, aber kein akuter Refactoring-Bedarf.

### AccordionSection.vue
- **Status:** OK
- **IST:** Existiert NICHT
- **SOLL:** Sollte NICHT existieren (wird in Block B erstellt)
- **Auswirkung:** Keine Abweichung.

### sensorDefaults.ts
- **Status:** OK
- **IST:** EXISTIERT. Enthaelt `MULTI_VALUE_DEVICES` Mapping (SHT31, BME280 etc.), `SENSOR_TYPE_CONFIG`, Hilfsfunktionen (`inferInterfaceType`, `getSensorUnit`, `getMultiValueConfig`).
- **Auswirkung:** Keine

---

## Teil 6: Uebersicht-Tab IST-Zustand

### P2 Bug deviceCounts
- **Status:** BUG BESTAETIGT
- **IST:** `dashboard.store.ts:61` definiert `deviceCounts = ref({ all: 0, mock: 0, real: 0 })`. Diese Ref wird NIRGENDS beschrieben — kein `deviceCounts.value = ...` im gesamten Codebase. TopBar.vue liest `dashStore.deviceCounts.all/mock/real` → zeigt immer "Alle 0 / Mock 0 / Real 0".
- **SOLL:** Counter sollen echte Geraetezahlen anzeigen
- **Root Cause:** `deviceCounts` hat keinen Writer. Kein Store-Action, kein Watcher, kein WebSocket-Handler aktualisiert die Werte.
- **Auswirkung:** Quick-Win P2 Fix = computed property aus espStore.devices berechnen.

### P11 "Geraete"-Button
- **Status:** ABWEICHUNG (nicht kaputt, anders als erwartet)
- **IST:** "Geraete" Button existiert in TopBar.vue:229. Oeffnet `dashStore.showPendingPanel = true` (PendingDevicesPanel). Zeigt "N Neue" bei Pending Devices, sonst "Geraete". Funktioniert korrekt.
- **SOLL:** Auftrag beschrieb "Button kaputt oder fehlt"
- **Auswirkung:** P11 ist KEIN Bug — der Button existiert und funktioniert. Pruefen ob der Auftrag einen ANDEREN Button meint.

### ZonePlate.vue
- **Status:** OK
- **IST:** 755 Zeilen. Zeigt Zonen als Accordion-Sektionen mit ESP-Devices. Hat VueDraggable fuer Cross-Zone DnD. Nutzt DeviceMiniCard. Features: Glassmorphism, Subzone-Grouping, Sensor/Actuator-Counts, Status-Aggregation.
- **Auswirkung:** Keine

### ZoneGroup.vue
- **Status:** OK
- **IST:** 951 Zeilen. Existiert in `components/zones/ZoneGroup.vue`. Hat deviceCount, onlineCount. Wird vermutlich in SensorsView genutzt.
- **Auswirkung:** Keine

### UnassignedBar
- **Status:** OK
- **IST:** `components/dashboard/UnassignedDropBar.vue` (568 Zeilen). Zeigt nicht-zugewiesene ESPs als Tray am unteren Rand. Hat DnD-Faehigkeit.
- **Auswirkung:** Keine

---

## Teil 7: ESPOrbitalLayout Split-Status

### ESPOrbitalLayout.vue
- **Status:** OK
- **IST:** 655 Zeilen
- **SOLL:** ~655 Zeilen
- **Auswirkung:** Keine

### ESPOrbitalLayout.css
- **Status:** ABWEICHUNG
- **IST:** 1057 Zeilen (reduziert durch forms.css-Extraktion)
- **SOLL:** ~1380 Zeilen
- **Auswirkung:** Positiv — CSS ist bereits kompakter.

### Bereits extrahierte Komponenten
- **Status:** ABWEICHUNG (mehr als erwartet)
- **IST:** Folgende Dateien in `components/esp/`:
  - SensorColumn.vue ✓
  - ActuatorColumn.vue ✓
  - SensorSatellite.vue (nicht im Auftrag erwaehnt)
  - ActuatorSatellite.vue (nicht im Auftrag erwaehnt)
  - DeviceDetailView.vue ✓ (Wrapper um ESPOrbitalLayout)
  - DeviceHeaderBar.vue (nicht im Auftrag erwaehnt)
  - AnalysisDropZone.vue (nicht im Auftrag erwaehnt)
  - ConnectionLines.vue (nicht im Auftrag erwaehnt)
  - AddSensorModal.vue ✓
  - AddActuatorModal.vue ✓
- **SOLL:** Erwartet: SensorColumn, ActuatorColumn, AddSensorModal, AddActuatorModal
- **Auswirkung:** Der Orbital-Split ist WEITER FORTGESCHRITTEN als der Auftrag annahm. Viele Sub-Komponenten existieren bereits. Der Auftrag "orbital-split ~60% erledigt" ist konservativ — eher 80%.

### orbital/ Verzeichnis
- **Status:** OK
- **IST:** Existiert NICHT
- **SOLL:** Noch nicht erstellt
- **Auswirkung:** Wenn erstellt wird, muessen Imports in DeviceDetailView und ESPOrbitalLayout aktualisiert werden.

### DeviceDetailView.vue als einziger Importeur
- **Status:** OK
- **IST:** Bestaetigt. `DeviceDetailView.vue:25: import ESPOrbitalLayout from './ESPOrbitalLayout.vue'` ist der EINZIGE Import.
- **Auswirkung:** Keine

---

## Teil 8: Backend-API Zustand

### Zone-CRUD Endpoints
- **Status:** FEHLT (BLOCKER bestaetigt)
- **IST:** `zone.py` enthaelt nur DEVICE-zentrische Endpoints:
  - `POST /zones/devices/{esp_id}/assign` — ESP einer Zone zuweisen
  - `DELETE /zones/devices/{esp_id}/zone` — Zone-Zuweisung entfernen
  - `GET /zones/devices/{esp_id}` — Zone-Info fuer ESP
  - `GET /zones/{zone_id}/devices` — ESPs in Zone auflisten
  - `GET /zones/unassigned` — Nicht-zugewiesene ESPs
- **SOLL (fehlend):**
  - `POST /zones` — Zone erstellen ✗
  - `PUT /zones/:id` — Zone umbenennen/bearbeiten ✗
  - `DELETE /zones/:id` — Zone loeschen ✗
  - `GET /zones` — Alle Zonen auflisten ✗
- **Auswirkung:** **BLOCKER fuer Uebersicht-Tab Bloecke 2.3 + 5.** Zonen werden aktuell implizit durch ESP-Zuweisung erstellt — es gibt keine unabhaengige Zone-Entitaet. Fuer Zone-Drag-Reorder oder Zone-Rename im Frontend ist ein Zone-CRUD-Backend ZWINGEND noetig.

### Dashboard-Persistenz Endpoint
- **Status:** FEHLT
- **IST:** Kein `dashboard*.py` in `api/v1/`. CustomDashboardView nutzt localStorage.
- **SOLL:** `/v1/dashboards` erwartet als fehlend
- **Auswirkung:** Wie erwartet. Kein Blocker fuer aktuelle Konsolidierung.

---

## Teil 9: Routing + Tab-System

### Router Routes (aktiv, ohne Deprecated-Redirects)

| Pfad | View-Komponente | Name | Meta |
|------|-----------------|------|------|
| `/` | — | redirect → /hardware | — |
| `/login` | LoginView | login | public |
| `/setup` | SetupView | setup | public |
| `/hardware` | HardwareView | hardware | Uebersicht |
| `/hardware/:zoneId` | HardwareView | hardware-zone | Uebersicht |
| `/hardware/:zoneId/:espId` | HardwareView | hardware-esp | Uebersicht |
| `/monitor` | MonitorView | monitor | Monitor |
| `/monitor/:zoneId` | MonitorView | monitor-zone | Monitor |
| `/custom-dashboard` | CustomDashboardView | custom-dashboard | Dashboard |
| `/system-monitor` | SystemMonitorView | system-monitor | Admin |
| `/sensors` | SensorsView | sensors | Komponenten |
| `/logic` | LogicView | logic | Automatisierung |
| `/settings` | SettingsView | settings | Einstellungen |
| `/calibration` | CalibrationView | calibration | Admin |
| `/sensor-history` | SensorHistoryView | sensor-history | — |
| `/users` | UserManagementView | users | Admin |
| `/load-test` | LoadTestView | load-test | Admin |
| `/maintenance` | MaintenanceView | maintenance | Admin |

### ViewTabBar Konfiguration
- **Status:** OK
- **IST:** Hartcodiert in ViewTabBar.vue (3 Tabs: `/hardware`, `/monitor`, `/custom-dashboard`). ActiveTab via `route.path.startsWith()`.
- **Auswirkung:** Fuer View-Architektur-Aenderungen muss ViewTabBar manuell angepasst werden.

### Sidebar Active-State
- **Status:** OK
- **IST:** Sidebar.vue:77 prueft `isActive('/hardware') || isActive('/monitor') || isActive('/custom-dashboard')` fuer den "Dashboard"-Eintrag.
- **Auswirkung:** Wenn neue Tabs/Routes unter dem Dashboard-Dach hinzukommen, muss Sidebar.vue angepasst werden.

### MonitorView Route
- **Status:** OK — existiert als `/monitor` (eigenstaendige Route)

### CustomDashboardView Route
- **Status:** OK — existiert als `/custom-dashboard` (eigenstaendige Route)

---

## Teil 10: Abhaengigkeitskette

### Block A (CSS) hat keine Vorbedingungen?
- **Status:** BESTAETIGT — aber TEILWEISE ERLEDIGT
- **IST:** forms.css existiert bereits, Modal-CSS ist extrahiert. Verbleibend: Button-System vereinheitlichen (BEM vs Bootstrap-Stil), fehlende Token-Aliase ergaenzen, schedule-config-Styles ggf. auslagern.
- **Auswirkung:** Block A ist ~60% erledigt statt 0%. Geschaetzter Restaufwand: ~1.5h statt ~3h.

### Quick-Wins brauchen NUR Block A?
- **Status:** TEILWEISE BESTAETIGT
- **IST:**
  - P2 (deviceCounts): Braucht KEINEN Block A. Reiner Store-Fix (computed aus espStore.devices). Sofort machbar.
  - P11 ("Geraete"-Button): Button existiert und funktioniert. KEIN Bug gefunden. Auftrag pruefen ob anderer Button gemeint.
- **Auswirkung:** P2 ist ein SOFORT-Quick-Win ohne jegliche Abhaengigkeit.

### Block B+C brauchen Block A?
- **Status:** TEILWEISE BESTAETIGT
- **IST:** Block B (AccordionSection) braucht ein konsistentes Button-System. Durch die Button-Inkonsistenz (BEM vs Bootstrap) muss Block A das VORHER klaeren. Block C (ESPCardBase-Adoption) braucht Block A NICHT — die Komponenten existieren bereits.
- **Auswirkung:** Block C kann PARALLEL zu Block A laufen.

### Block D (Dead Code) hat keine Abhaengigkeiten?
- **Status:** NICHT MEHR RELEVANT
- **IST:** Block D ist BEREITS ERLEDIGT. Alle 5 Dateien wurden geloescht.
- **Auswirkung:** Block D aus der Reihenfolge STREICHEN.

### Uebersicht-Tab BRAUCHT Zone-CRUD?
- **Status:** BESTAETIGT
- **IST:** Zone-CRUD fehlt. Bloecke die Zone-Erstellung/-Bearbeitung/-Loeschung erfordern sind blockiert. Konkret: Block 2.3 (Zone-CRUD UI) und Block 5 (Zone-DnD-Reorder).
- **Auswirkung:** Wie im Auftrag. Entscheidungspunkt bleibt.

### View-Architektur hat KEINEN Backend-Blocker?
- **Status:** BESTAETIGT
- **IST:** View-Architektur betrifft Frontend-Routing und Komponenten-Organisation. Kein Backend-Blocker.
- **Auswirkung:** Keine

### Neue Abhaengigkeiten (nicht im Auftrag erfasst)?
- **Status:** 3 NEUE FINDINGS

1. **Button-System-Chaos:** Zwei parallele Naming-Konventionen (`btn-primary` in main.css vs `btn--primary` in forms.css). Muss VOR Block B vereinheitlicht werden, da AccordionSection das Button-System nutzen wird. **Neuer Micro-Task fuer Block A.**

2. **ESPCardBase existiert aber ist verwaist:** Die Komponente ist gebaut, getestet, aber hat null Consumer. Block C muss "Adoption" statt "Erstellung" fokussieren. DeviceSummaryCard, ESPHealthWidget und ESPCard.vue muessen migriert werden.

3. **AddSensorModal + AddActuatorModal ohne Teleport:** Diese rendern inline, waehrend EditSensorModal und ESPSettingsSheet via Teleport rendern. Potenzieller z-Index-Konflikt bei tief verschachtelten Layouts. Sollte in Block A als optionaler Fix aufgenommen werden.

---

## Zusammenfassung

### Bestaetigte Reihenfolge (korrigiert)

```
0. SOFORT: P2 deviceCounts Fix (~15min) — KEINE Abhaengigkeit
1. Block A REST (CSS Vereinheitlichung, ~1.5h statt 3h) — Button-Chaos, Token-Aliase
2. Block C (ESPCardBase ADOPTION, ~4h) — PARALLEL zu Block A moeglich
3. Block B (AccordionSection + Settings-Refactor, ~4h) — braucht Block A
4. Block D — ENTFAELLT (bereits erledigt)
5. ENTSCHEIDUNGSPUNKT: Zone-CRUD Backend-API verfuegbar?
   5a. JA → Uebersicht-Tab Bloecke 2-8 (~28-38h)
   5b. NEIN → View-Architektur Block A-E (~14-18h)
6. Orbital-Split (~2h statt 3-4h, weiter fortgeschritten als angenommen)
```

### Gefundene Abweichungen

| Nr | Bereich | IST vs SOLL | Schwere |
|----|---------|-------------|---------|
| 1 | ESPOrbitalLayout.css | 1057 statt ~1380 Zeilen (forms.css extrahiert) | Positiv |
| 2 | forms.css | EXISTIERT (414 Zeilen) statt "muss erstellt werden" | Positiv |
| 3 | btn--primary | DEFINIERT in forms.css, aber ZWEI Naming-Systeme | Mittel |
| 4 | Dead-Code (Block D) | BEREITS GELOESCHT, alle 5 Dateien fehlen | Positiv |
| 5 | ESPCardBase.vue | EXISTIERT (274 Zeilen), aber 0 Consumer | Kritisch |
| 6 | useESPStatus.ts | EXISTIERT (176 Zeilen), nur 2 von 6 Varianten nutzen es | Kritisch |
| 7 | AddSensorModal/AddActuatorModal | KEIN Teleport (Auftrag erwartete 5, nur 3 haben es) | Gering |
| 8 | .connection-dot | NICHT vorhanden (Auftrag erwartete Legacy-Klasse) | Positiv |
| 9 | P11 "Geraete"-Button | FUNKTIONIERT korrekt (Auftrag erwartete Bug) | Info |
| 10 | Orbital-Split | ~80% statt ~60% erledigt (mehr Sub-Komponenten als erwartet) | Positiv |

### Neue Blocker/Risiken

1. **Button-System-Vereinheitlichung (P0):** Muss in Block A erledigt werden bevor Block B startet. Zwei konkurrierende Systeme fuehren zu Verwirrung und inkonsistentem UI.

2. **ESPCardBase verwaist:** 274 Zeilen gut designte Komponente ohne Consumer. Risiko: Drift — wenn die Komponente zu lange ungenutzt bleibt, passt sie nicht mehr zu den tatsaechlichen Varianten. Adoption sollte zeitnah erfolgen.

3. **1751-Zeilen ESPCard.vue:** Die groesste Einzeldatei im Projekt. Eigene Status-Logik, eigene Button-Styles, eigene formatRelativeTime(). Jeder Refactoring-Schritt muss diese Datei beruecksichtigen.

### Empfehlung

Die Reihenfolge sollte ANGEPASST werden:

1. **deviceCounts Fix** als erstes (sofort machbar, P0 Bug)
2. **Block A REST** reduziert (Button-Vereinheitlichung + Token-Aliase, ~1.5h)
3. **Block C als "Adoption"** umformulieren und PARALLEL zu Block A ausfuehren
4. **Block D komplett streichen**
5. Rest wie geplant

Geschaetzte Gesamtersparnis durch bereits erledigte Arbeit: ~6-8 Stunden.
