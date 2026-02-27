# UX Audit Report — HardwareView & Gesamte Device-Management Pipeline

**Datum:** 2026-02-27
**Scope:** HardwareView, ZonePlate, DeviceMiniCard, ESPSettingsSheet, SensorConfigPanel, ActuatorConfigPanel, AddSensorModal, AddActuatorModal, PendingDevicesPanel, AccordionSection, SlideOver, ESPCardBase
**Trigger:** Vollständige UX-Prüfung aller Interaktionen, Design Patterns, Abstände, Konfigurationsportale
**Referenz:** PUMP_DEBUG_REPORT.md (Timezone-Bug)

---

## Executive Summary

Die HardwareView bietet ein solides Grundgerüst mit gut durchdachter Two-Level-Navigation und konsistentem Design-Token-System. Die Glassmorphism-Ästhetik ist visuell ansprechend und wird konsequent durchgehalten. **Jedoch gibt es mehrere UX-Probleme**, die von einem kritischen Backend-Bug bis hin zu kleineren Inkonsistenzen reichen, die das Nutzererlebnis beeinträchtigen.

**Gesamtbewertung: 7/10** — Funktional solide, aber mit Raum für Verbesserung in Konsistenz, Discoverability und Edge Cases.

---

## 1. Bugs (gefixt während Audit)

### BUG-001: Timezone-Mismatch in actuator.py [CRITICAL → FIXED]

**Datei:** `El Servador/god_kaiser_server/src/db/models/actuator.py`
**Zeilen:** 255-259 (`last_command_timestamp`) und 397-404 (`timestamp` in ActuatorCommand)

**Problem:** `DateTime` statt `DateTime(timezone=True)` — PostgreSQL lehnt timezone-aware datetime-Objekte ab, die der Handler sendet.

**Impact:**
- Actuator-Status wird NICHT in DB persistiert
- WebSocket-Broadcast `actuator_status` wird NIE gesendet
- Frontend erhält keine Live-Updates für Aktor-Zustandsänderungen
- Betrifft ALLE Mock- UND Real-Actuatoren

**Fix angewendet:** Beide Stellen auf `DateTime(timezone=True)` geändert.
Konsistent mit allen anderen Modellen (esp.py, esp_heartbeat.py, logic.py, auth.py verwenden alle `DateTime(timezone=True)`).

**Ausstehend:** Alembic-Migration erforderlich um DB-Schema anzupassen.

---

## 2. Architektur & Navigation

### Was funktioniert gut

| Aspekt | Bewertung | Details |
|--------|-----------|---------|
| Two-Level-Navigation | Sehr gut | Route-basiert (/hardware → /hardware/:zoneId/:espId), sauber getrennt |
| Zone Accordion | Sehr gut | localStorage-Persistenz, Smart Defaults (≤4 alle offen, >4 nur erste) |
| Offline-Auto-Expand | Gut | Zones mit offline/error Devices werden automatisch aufgeklappt |
| Zone-Sortierung | Gut | Probleme zuerst, dann online, leere zuletzt, alphabetisch innerhalb |
| Keyboard Navigation | Gut | Escape = Zurück, Swipe-Right = Zurück (Mobile) |
| Breadcrumb-Integration | Gut | dashStore.breadcrumb wird korrekt gepflegt |
| EmptyState | Gut | Klarer CTA "Gerät erstellen" wenn keine Devices existieren |
| Filter-Reset | Gut | Eigener "Filter zurücksetzen" Button bei leeren Ergebnissen |

### Probleme identifiziert

#### NAV-001: Zone-Erstellung erfordert unzugewiesenes ESP [MEDIUM]
**Datei:** HardwareView.vue:851-861
```
:disabled="unassignedDevices.length === 0"
```
User kann KEINE leere Zone erstellen. Erwartetes Verhalten: Zone anlegen, dann Devices hineinziehen. Aktuell: Erst ein Device "freigeben", dann Zone erstellen + Device zuweisen in einem Schritt. Das ist uninturitiv.

#### NAV-002: "Zone ändern" Context-Menu erscheint in Bildschirmmitte [LOW]
**Datei:** HardwareView.vue:535-538
```javascript
const x = window.innerWidth / 2
const y = window.innerHeight / 2
uiStore.openContextMenu(x, y, menuItems)
```
Context-Menu sollte bei der Karte erscheinen, die den Klick ausgelöst hat, nicht in der Bildschirmmitte.

---

## 3. Zonenübersicht (ZonePlate)

### Was funktioniert gut

| Aspekt | Bewertung | Details |
|--------|-----------|---------|
| Glassmorphism-Header | Sehr gut | Noise-Texture + Status-Border (iridescent/gelb/rot) |
| Sensor-Aggregation | Gut | aggregateZoneSensors() zeigt Temperatur/Feuchte als Durchschnitt |
| Inline-Rename | Gut | Pencil-Icon → Input mit Enter/Escape/Blur-Handling |
| Drag-Drop-Feedback | Gut | Drop-Target Glow-Animation, Ghost/Chosen/Drag-Klassen |
| Subzone-Chips | Gut | Filter-Funktion für Subzonen-Gruppierung |
| Overflow-Menu | OK | MoreVertical → Umbenennen, Löschen (mit ConfirmDialog) |
| EmptyState in Zone | Gut | Drag-Hint wenn Zone leer ist |

### Probleme identifiziert

#### ZONE-001: Rename-Discoverability [MEDIUM]
Zone-Namen sind editierbar, aber es gibt keinen visuellen Hinweis dafür bis der User über den Namen hovert und das Pencil-Icon sieht. Erstnutzer entdecken diese Funktion möglicherweise nicht.

#### ZONE-002: Zone-Löschung = Devices zu "Unzugewiesen" [INFO]
Zones sind keine DB-Entitäten, sondern String-Felder auf Devices. "Zone löschen" entfernt Devices aus der Zone (verschiebt sie zu "Nicht zugewiesen"). Korrekt implementiert, aber die Kommunikation zum User "Zone gelöscht — Geräte sind jetzt unzugewiesen" ist gut.

#### ZONE-003: Aggregierte Sensorwerte nur Temperatur/Feuchte [LOW]
`aggregateZoneSensors()` aggregiert gut, aber im Header werden nur die häufigsten Typen angezeigt. Bei Zonen mit nur pH-Sensoren oder EC-Sensoren fehlt die Aggregate-Anzeige im Header.

---

## 4. Device-Karten (DeviceMiniCard)

### Was funktioniert gut

| Aspekt | Bewertung | Details |
|--------|-----------|---------|
| Sensor-Anzeige | Gut | Bis 4 Sensoren mit Icons, "+X weitere" Overflow |
| Status-Anzeige | Sehr gut | Farbiger Dot + Text + "Zuletzt gesehen" |
| Mock/Real Badge | Gut | Klare visuelle Unterscheidung |
| Hover-Effekte | Gut | Shimmer-Sweep, translateY(-2px), brightness(1.05) |
| Taktiles Feedback | Gut | Active-State: scale(0.97) |
| Drag-Handle | OK | .esp-drag-handle im Header via ESPCardBase |

### Probleme identifiziert

#### CARD-001: Doppelte Einstiegspunkte für Konfiguration [LOW]
- Settings-Gear-Button (hover-only) → öffnet ESPSettingsSheet
- Overflow-Menu → "Konfigurieren" → öffnet ESPSettingsSheet
- Zwei Wege für dieselbe Aktion. Nicht schädlich, aber leicht verwirrend.

#### CARD-002: Sensor-Icon-Map Coverage [LOW]
12 Icons definiert (Thermometer, Droplets, etc.), aber `iconMap` hat keinen Default-Fallback für unbekannte Sensortypen. Aktuell werden unbekannte Typen einfach ohne Icon gerendert.

#### CARD-003: Hover-only Elemente auf Touch-Geräten [MEDIUM]
- Settings-Gear: `opacity: 0` → `opacity: 1` on hover
- Chevron-Drill-Down Hint: nur on hover sichtbar
- Auf Touch-Geräten (Tablets) sind diese Elemente NICHT erreichbar. Das Overflow-Menu (MoreVertical) ist aber immer sichtbar — teilweise Kompensation.

---

## 5. Konfigurationsportale

### 5.1 ESPSettingsSheet (SlideOver width="lg")

| Sektion | Bewertung | Details |
|---------|-----------|---------|
| Identifikation | Gut | Name editierbar inline, ESP-ID readonly, Mock/Real Badge |
| Status-Sektion | Gut | Connection, Heartbeat, WiFi-Bars, Uptime |
| Zone-Zuweisung | OK | ZoneAssignmentPanel eingebettet |
| Sensor-Liste | Gut | Klickbar → öffnet SensorConfigPanel |
| Actuator-Liste | Gut | Klickbar → öffnet ActuatorConfigPanel |
| Mock Controls | Gut | Heartbeat-Trigger, Auto-Heartbeat Toggle mit Intervall |
| Danger Zone | Gut | Rote "Löschen" Sektion mit ConfirmDialog |

#### SETTINGS-001: SlideOver-Stacking [MEDIUM]
ESPSettingsSheet (SlideOver) → Sensor/Actuator Click → öffnet ZWEITES SlideOver. Beide sind gleichzeitig offen. Die Z-Index-Verwaltung funktioniert (zweites SlideOver liegt über dem ersten), aber:
- Kein visueller Hinweis, dass "dahinter" noch ein Panel offen ist
- Schließen des zweiten Panels kehrt korrekt zum ersten zurück
- Bei 3+ gestapelten Panels (theoretisch möglich) wird es unübersichtlich

#### SETTINGS-002: Name-Edit Race Condition [LOW]
`handleSettingsClose()` nutzt `setTimeout(200ms)` um `settingsDevice.value = null` zu setzen. Bei schnellem Open→Close→Open könnte der Timeout das Device nullen während das Panel schon wieder offen ist.

### 5.2 SensorConfigPanel (3-Zonen-Layout)

| Zone | Bewertung | Details |
|------|-----------|---------|
| Basic (Name, Unit, Type, Enabled, Subzone) | Gut | Klar strukturiert, Sensor-Type disabled (readonly) |
| Thresholds (4-Wert RangeSlider) | Sehr gut | AlarmLow → WarnLow → WarnHigh → AlarmHigh, visuell |
| Calibration (pH/EC Wizard) | Gut | 2-Punkt-Kalibrierung, geführter Prozess |
| Expert (Hardware/Interface, Live Preview) | Gut | ANALOG/I2C/ONEWIRE/DIGITAL spezifisch |
| Save Button | Gut | API-Call für Real, Toast-only für Mock |

#### SENSOR-001: Kalibrierung nur für pH und EC [INFO]
Andere Sensortypen (Temperatur, Feuchte, Lichtintensität) haben keine Kalibrierungsoption. Für industrielle Anwendungen wäre zumindest ein Offset-Calibration für alle Typen sinnvoll.

#### SENSOR-002: Mock-Sensoren → "Gespeichert" Toast ohne Backend-Persistenz [LOW]
Mock-Sensor-Änderungen zeigen einen Erfolgs-Toast, aber die Daten werden nur lokal geändert und gehen bei Server-Neustart verloren. Kein Hinweis darauf für den User.

### 5.3 ActuatorConfigPanel (3-Zonen-Layout)

| Zone | Bewertung | Details |
|------|-----------|---------|
| Control (ON/OFF Toggle, PWM Slider) | Gut | Sofortige Steuerung |
| Type-Settings (Pump, Valve, PWM, Relay) | Gut | Typ-spezifische Parameter |
| Safety (Emergency Stop) | Sehr gut | Prominenter roter Button, klar sichtbar |
| Save Button | Gut | Analog zu SensorConfigPanel |

#### ACTUATOR-001: Emergency-Stop ohne Reset-Pfad [MEDIUM]
Der Emergency-Stop-Button ist prominent (rot, groß), aber es gibt keinen klaren "Reset Emergency Stop" Button. User könnte nicht wissen, wie er nach einem E-Stop den Aktor wieder freigibt.

---

## 6. Add-Flows (Hinzufügen)

### 6.1 AddSensorModal

| Aspekt | Bewertung | Details |
|--------|-----------|---------|
| Sensor-Type Dropdown | Gut | Mit Summary-Info pro Typ |
| OneWire-Scan | Sehr gut | GPIO wählen → Bus scannen → Devices checkboxen → Bulk-Add |
| I2C-Adresse | Gut | Dropdown-Auswahl |
| GPIO-Picker | OK | Standard-GPIO-Auswahl |
| Betriebsmodus | Gut | 4 Modi mit empfohlenem Modus markiert |
| Validierung | Gut | Pflichtfelder geprüft |

#### ADDSENSOR-001: GPIO-Picker ohne visuelle GPIO-Map [LOW]
GPIO-Auswahl ist ein reiner Dropdown. Ein visuelles GPIO-Pinout-Diagram wäre für ESP32-Nutzer intuitiver, ist aber nicht kritisch.

### 6.2 AddActuatorModal

| Aspekt | Bewertung | Details |
|--------|-----------|---------|
| GPIO-Picker | Gut | Mit Validierung |
| Actuator-Type | Gut | 6 Typen (relay, pump, fan, lamp, heater, valve) |
| Conditional Fields | Gut | PWM-Slider nur bei PWM, Runtime/Cooldown nur bei Pump |
| Formular-Umfang | OK | ~241 Zeilen — deutlich einfacher als AddSensorModal |

#### ADDACTUATOR-001: Keine Duplikat-GPIO-Prüfung im Modal [LOW]
User könnte versuchen einen GPIO zuzuweisen, der bereits von einem anderen Sensor/Actuator belegt ist. Die Validierung passiert erst server-seitig.

---

## 7. Device-Management (PendingDevicesPanel)

### Was funktioniert gut

| Aspekt | Bewertung | Details |
|--------|-----------|---------|
| 3-Tab-Layout | Gut | Geräte / Wartend / Anleitung |
| Search-Funktion | Gut | Echtzeit-Filter in Device-Liste |
| Zone-Gruppierung | Gut | Devices nach Zone gruppiert |
| Approve/Reject Flow | Gut | Loading-States, Error-Handling |
| Setup-Anleitung | Gut | 4-Schritt-Guide für ESP32-Verbindung |

#### PENDING-001: "Geräte"-Tab dupliziert HardwareView [MEDIUM]
Der "Geräte"-Tab in PendingDevicesPanel zeigt ALLE registrierten Devices mit Config+Delete-Buttons. Das ist eine funktionale Duplikation der HardwareView. User könnte verwirrt sein, welche Ansicht "die richtige" ist.

#### PENDING-002: RejectDeviceModal z-index [INFO]
Korrekt implementiert: `RejectDeviceModal` wird außerhalb des SlideOver gerendert für korrekten z-index. Gute Lösung für das Stacking-Problem.

---

## 8. Design System & Konsistenz

### Was funktioniert gut

| Aspekt | Bewertung | Details |
|--------|-----------|---------|
| Design Tokens | Sehr gut | Vollständiges Token-System (tokens.css, tailwind.config.js) |
| Dark-Theme-Only | Gut | Konsistent, keine Light-Mode-Reste |
| Glassmorphism | Gut | glass-panel, glass-overlay, iridescent-border konsistent |
| Typography | Gut | Outfit Font, var(--text-xs..display) |
| Spacing | Gut | 4px Grid, var(--space-1..12) |
| Transitions | Gut | var(--transition-fast/base/slow) konsistent |
| AccordionSection | Sehr gut | CSS grid-template-rows Transition, smooth 200ms |
| SlideOver | Gut | 3 Width-Varianten, 300ms slide+fade, ESC-close |

### Inkonsistenzen

#### DESIGN-001: Farbhartkodierung in Unassigned Section [LOW]
**Datei:** HardwareView.vue:1206-1214
```css
background: rgba(245, 158, 11, 0.04);
border: 1px solid rgba(245, 158, 11, 0.15);
```
Statt `var(--color-warning)` mit Opacity. Alle anderen Komponenten nutzen CSS-Variablen. Sollte konsistent sein: `color-mix(in srgb, var(--color-warning) 4%, transparent)`.

#### DESIGN-002: ZonePlate Chevron-Klasse aus fremdem Namespace [LOW]
**Datei:** HardwareView.vue:755-757
```html
<ChevronDown class="zone-plate__chevron" ...>
```
Im Unassigned-Section wird eine CSS-Klasse aus ZonePlate verwendet (`zone-plate__chevron`). BEM-Violation — sollte `unassigned-section__chevron` sein.

---

## 9. Löschen-Flows

| Element | Weg | Bestätigung | Bewertung |
|---------|-----|-------------|-----------|
| Device löschen | DeviceMiniCard → Overflow → Löschen | ConfirmDialog (danger) | Gut |
| Device löschen | ESPSettingsSheet → Danger Zone | ConfirmDialog (danger) | Gut |
| Device löschen | PendingDevicesPanel → Delete-Button | ConfirmDialog (danger) | Gut |
| Zone löschen | ZonePlate → Overflow → Löschen | ConfirmDialog (danger) | Gut |
| Sensor löschen | SensorConfigPanel → (nicht vorhanden) | — | Lücke |
| Actuator löschen | ActuatorConfigPanel → (nicht vorhanden) | — | Lücke |

#### DELETE-001: Kein Sensor/Actuator-Löschen in Config-Panels [MEDIUM]
SensorConfigPanel und ActuatorConfigPanel haben KEINEN Delete-Button. User kann Sensoren/Aktoren nur über die API oder indirekt (Device löschen) entfernen. Das ist eine UX-Lücke — ein "Sensor entfernen"-Button am Ende des Panels wäre erwartet.

---

## 10. Mobile / Responsiveness

| Aspekt | Bewertung | Details |
|--------|-----------|---------|
| Grundlegendes Layout | OK | flex-wrap bei <640px |
| SlideOver Mobile | Gut | 100% Breite unter breakpoint |
| Drag-Drop auf Touch | Problematisch | delay=300ms, touch-threshold=3 — aber Grip-Handle schwer zu treffen |
| Hover-only Elemente | Problematisch | Settings-Gear, Chevron-Hint nicht erreichbar |
| Zone-Create-Form | OK | flex-wrap bei Mobile |
| Subzone-Chips | OK | Horizontal scrollbar |

#### MOBILE-001: Touch-Drag ist fragil [MEDIUM]
Die Drag-Konfiguration (`delayOnTouchOnly=true`, `delay=300`, `fallbackTolerance=5`, `touchStartThreshold=3`) ist technisch korrekt, aber der kleine Drag-Handle (.esp-drag-handle) im Header ist auf Touchscreens schwer präzise zu treffen.

---

## 11. Zusammenfassung nach Priorität

### CRITICAL (sofort beheben)
| ID | Problem | Status |
|----|---------|--------|
| BUG-001 | Timezone DateTime without timezone=True → DB-Write fails → kein WS-Broadcast | **FIXED** |

### MEDIUM (nächste Iteration)
| ID | Problem | Impact |
|----|---------|--------|
| NAV-001 | Zone-Erstellung erfordert unzugewiesenes ESP | Unintuitiver Workflow |
| SETTINGS-001 | SlideOver-Stacking ohne visuellen Hinweis | Orientierungsverlust bei 2+ Panels |
| ACTUATOR-001 | Emergency-Stop ohne klaren Reset-Pfad | User blockiert nach E-Stop |
| DELETE-001 | Kein Sensor/Actuator-Löschen in Config-Panels | Feature-Lücke |
| CARD-003 | Hover-only Elemente auf Touch-Geräten | Eingeschränkte Bedienbarkeit |
| PENDING-001 | "Geräte"-Tab dupliziert HardwareView | Verwirrung über primäre Ansicht |
| ZONE-001 | Rename-Discoverability (nur Hover-Pencil) | Erstnutzer finden Funktion nicht |
| MOBILE-001 | Touch-Drag fragil | Drag-Drop auf Tablets schwierig |

### LOW (Verbesserungen)
| ID | Problem | Impact |
|----|---------|--------|
| NAV-002 | Context-Menu in Bildschirmmitte statt bei Karte | Kleine UX-Irritation |
| CARD-001 | Doppelte Konfiguration-Einstiegspunkte | Redundanz |
| CARD-002 | Sensor-Icon-Map ohne Default-Fallback | Fehlende Icons für exotische Typen |
| SETTINGS-002 | setTimeout Race-Condition bei Open/Close | Edge Case |
| SENSOR-002 | Mock-Toast ohne Persistenz-Hinweis | Irreführende Erwartung |
| DESIGN-001 | Farbhartkodierung in Unassigned-Section | Inkonsistenz |
| DESIGN-002 | BEM-Violation (zone-plate__chevron) | Code-Hygiene |
| ADDSENSOR-001 | GPIO-Picker ohne visuelles Pinout | Nice-to-have |
| ADDACTUATOR-001 | Keine Client-seitige GPIO-Duplikat-Prüfung | Validierung erst server-seitig |

### INFO (Designentscheidungen, kein Bug)
| ID | Problem | Kontext |
|----|---------|---------|
| ZONE-002 | Zone-Löschung = Devices zu "Unzugewiesen" | By Design (Zones = String-Felder) |
| ZONE-003 | Aggregate nur für häufige Sensortypen | By Design |
| SENSOR-001 | Kalibrierung nur für pH/EC | Feature-Scope |
| PENDING-002 | RejectDeviceModal z-index Lösung | Korrekt implementiert |

---

## 12. Gesamturteil

### Stärken
1. **Konsistentes Design-Token-System** — Dark-Theme durchgehend, Glassmorphism visuell ansprechend
2. **Gut strukturierte Komponenten-Hierarchie** — ESPCardBase als Basis, klare Slot-Architektur
3. **Smart Defaults** — Auto-Expand Logik, Zone-Sortierung nach Priorität
4. **Robuste Drag-Drop-Integration** — VueDraggable mit Cross-Zone-Support
5. **Akkordeon-Persistenz** — localStorage pro Zone, überlebt Seitenneuladen
6. **Kalibrierungswizard** — Industriequalität für pH/EC
7. **Safety-First bei Löschen** — ConfirmDialog überall wo destruktiv

### Schwächen
1. **SlideOver-Stacking-Architektur** — Funktioniert, aber fehlendes visuelles Feedback bei Tiefe
2. **Zone-Erstell-Workflow** — Erzwingt "ESP zuerst freisetzen" statt "Zone erstellen, dann zuweisen"
3. **Touch-Device-Support** — Hover-basierte Interaktionen nicht Touch-ready
4. **Feature-Lücken** — Kein Sensor/Actuator-Löschen in Config-Panels
5. **Funktionale Duplikation** — PendingDevicesPanel "Geräte"-Tab vs HardwareView

### Empfehlung
Die Basis ist solide. Der **kritische Timezone-Bug (BUG-001) wurde gefixt** — das war der schwerwiegendste Fund. Die MEDIUM-Issues sollten in der nächsten Iteration angegangen werden, insbesondere DELETE-001 (Sensor/Actuator-Löschen) und NAV-001 (Zone-Erstell-Workflow), da diese direkte Feature-Lücken darstellen.
