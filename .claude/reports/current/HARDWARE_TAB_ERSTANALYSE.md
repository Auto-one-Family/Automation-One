# Hardware-Tab Erstanalyse

> **Datum:** 2026-02-25
> **Branch:** fix/trockentest-bugs
> **Scope:** CSS-Bugs, Drag&Drop, Zone-Assignment UX, ESP-Konfigurationspfade

---

## 1. KRITISCHER BUG: Weisse Elemente auf Dark Background

### Root Cause: Scoped CSS + Teleport Mismatch

**Problem:** Alle Form- und Modal-CSS-Klassen sind **ausschliesslich** in einer Datei definiert:
- `El Frontend/src/components/esp/ESPOrbitalLayout.css` (1380 Zeilen)
- Importiert als `<style scoped>` in `ESPOrbitalLayout.vue:633`

Da die Styles **scoped** sind, gelten sie NUR innerhalb der ESPOrbitalLayout-Komponente. **5 Kindkomponenten** nutzen aber `<Teleport to="body">`, was den DOM-Inhalt **ausserhalb** des Scoped-Bereichs rendert:

| Datei | Zeile | Betroffene CSS-Klassen |
|-------|-------|----------------------|
| `AddSensorModal.vue` | 267 | `.modal-overlay`, `.modal-content`, `.form-input`, `.form-select`, `.form-group`, `.form-label`, `.btn--primary`, `.btn--secondary` |
| `AddActuatorModal.vue` | 132 | Gleiche Klassen |
| `EditSensorModal.vue` | 216 | Gleiche Klassen + `.modal-header--edit`, `.modal-subtitle` |
| `ESPSettingsSheet.vue` | 410 | `.modal-overlay`, `.modal-content`, diverse Form-Klassen |
| `PendingDevicesPanel.vue` | 236 | `.modal-overlay`, `.modal-content` |

**Ergebnis:** Browser-Defaults greifen = weisse Hintergruende, unstyled Inputs/Selects/Buttons.

### Screenshot-Zuordnung (verifiziert)

Die weissen Elemente im Bild kommen **alle** aus `AddSensorModal.vue`:
- "-Geraete auf GPIO 4 zu finden" = Zeile 342 (OneWire Scan Hint)
- "Kontinuierlich" (Dropdown) = Zeile 369 (Betriebsmodus Select)
- "180" = Zeile 379 (Timeout Input, Placeholder-Wert)
- "eratur" = Zeile 385 (abgeschnittenes "Wassertemperatur" Placeholder)
- "aus_reihe_1" = Zeile 391 (abgeschnittenes "gewaechshaus_reihe_1" Placeholder)

### Zusatzproblem: `btn--primary` und `btn--secondary` NIRGENDS definiert

Diese CSS-Klassen werden in 4 Dateien referenziert aber haben **keine einzige CSS-Definition** im gesamten Projekt:
- `AddSensorModal.vue:409-410`
- `AddActuatorModal.vue`
- `EditSensorModal.vue`
- `ESPSettingsSheet.vue`

### Fix-Optionen (nach Prioritaet)

1. **Empfohlen: Shared Form CSS extrahieren** - Form/Modal-Styles aus `ESPOrbitalLayout.css` in eine globale Datei verschieben (z.B. `src/styles/forms.css`) und in `main.ts` importieren
2. **Quick-Fix: CSS in jedes Modal kopieren** - Scoped styles in jede Modal-Komponente kopieren (nicht empfohlen: Duplikation)
3. **Alternative: `:deep()` Selektoren** - Parent-Komponente styled Kinder mit `:deep()` (fragil bei Teleport)

### Betroffene Styles (zu extrahieren aus ESPOrbitalLayout.css)

```
Zeile 707-777:  .modal-overlay, .modal-content, .modal-header, .modal-title, .modal-close, .modal-body, .modal-footer
Zeile 792-832:  .form-row, .form-group, .form-label, .form-input, .form-select, .form-input--readonly
Zeile 834-917:  .modal-header--edit, .modal-subtitle, .form-label-row, .btn-reset, .form-hint, .info-box
Zeile 918-963:  .alert, .alert--error, .alert--success
Zeile 965-986:  .btn--sm, .btn--accent
NEU:            .btn--primary, .btn--secondary (muessen neu definiert werden!)
```

---

## 2. Drag & Drop Analyse

### 2.1 Zone-Zuweisung (VueDraggable)

**Infrastruktur:** `vue-draggable-plus` Bibliothek mit `group="esp-devices"`

| Komponente | Drag-Rolle | Bemerkung |
|------------|-----------|-----------|
| `ZonePlate.vue` | Drag-Source + Drop-Target | `handle=".esp-drag-handle"`, `force-fallback: true` |
| `UnassignedDropBar.vue` | Drop-Target + Drag-Source | `@change` statt `@add` (potentielles Problem) |
| `SubzoneArea.vue` | Subzone-internes DnD | VueDraggable fuer Subzone-Reorganisation |

**Potentielle Probleme:**
1. **`@change` vs `@add`:** UnassignedDropBar nutzt `@change="handleDragAdd"` - dieses Event feuert bei ALLEN Aenderungen (add, remove, update). Sollte `@add` sein fuer praezises Handling
2. **`position: fixed` UnassignedDropBar:** Z-Index-Konflikte moeglich waehrend Cross-Zone-Drag wenn Sidebar oder Modals offen sind
3. **Kein visuelles Drag-Feedback auf Zonen:** `zone-plate--drop-target` wird nur gesetzt wenn `dragStore.isDraggingEspCard` aktiv ist - aber `handleDragStart/End` muss korrekt in DeviceMiniCard propagiert werden

### 2.2 Sensor/Aktor DnD (ComponentSidebar → ESPOrbitalLayout)

**Infrastruktur:** Native HTML5 Drag & Drop (dragover/drop Events)

| Quelle | Ziel | Mechanismus |
|--------|------|-------------|
| `ComponentSidebar.vue` | `SensorColumn.vue` | Native DnD + `useDragStateStore` |
| `ComponentSidebar.vue` | `ActuatorColumn.vue` | Native DnD + `useDragStateStore` |
| `SensorSatellite.vue` | `AnalysisDropZone.vue` | Native DnD fuer Chart-Analyse |

**Potentielle Probleme:**
1. **Nur auf Level 3 verfuegbar:** ComponentSidebar wird mit `v-show="currentLevel === 3"` eingeblendet - kein DnD-Hinweis auf Level 1/2
2. **Keine DropZone-Indikation** wenn Sidebar collapsed ist
3. **Mixed DnD Libraries:** VueDraggable (Zone-Drag) + Native DnD (Sensor-Drag) koexistieren - kann zu Event-Konflikten fuehren

---

## 3. ESP-Konfigurationspfade (User-Journey Mapping)

### Wo werden ESPs konfiguriert? (9 Stellen)

| # | Ort | Aktion | Zugang |
|---|-----|--------|--------|
| 1 | **ZonePlate** (Level 1) | Zone anzeigen, Drag zwischen Zonen | `/hardware` |
| 2 | **UnassignedDropBar** (Level 1) | Unzugewiesene ESPs anzeigen, aus Zone entfernen | Fixed Bottom Bar, immer sichtbar |
| 3 | **DeviceSummaryCard** (Level 2) | Heartbeat, Delete, Settings | `/hardware/:zoneId` |
| 4 | **ESPOrbitalLayout** (Level 3) | Name bearbeiten, Zone-Dropdown, Sensoren/Aktoren verwalten | `/hardware/:zoneId/:espId` |
| 5 | **ESPSettingsSheet** (Modal) | Name, Zone, Delete, Heartbeat | Von Level 2/3 aus Settings-Button |
| 6 | **SensorConfigPanel** (SlideOver) | Sensor-Config (Thresholds, Kalibrierung, etc.) | Von Level 3, Sensor-Satellite klicken |
| 7 | **ActuatorConfigPanel** (SlideOver) | Aktor-Config | Von Level 3, Aktor-Satellite klicken |
| 8 | **AddSensorModal** (Modal) | Neuen Sensor hinzufuegen (GPIO/OneWire/I2C) | Von Level 3, "+" Button |
| 9 | **AddActuatorModal** (Modal) | Neuen Aktor hinzufuegen | Von Level 3, "+" Button |

### Wo werden Sensoren angezeigt? (5 Stellen)

| # | Ort | Was wird angezeigt |
|---|-----|--------------------|
| 1 | **DeviceMiniCard** (Level 1) | 1-2 Key-Werte als CSS-Spark-Bars |
| 2 | **ZonePlate Metrics** (Level 1) | Aggregierte Temp/Humidity Ranges |
| 3 | **DeviceSummaryCard** (Level 2) | Sensor-Count Badge |
| 4 | **SensorSatellite** (Level 3) | Live-Wert mit Quality-Indikator |
| 5 | **SensorConfigPanel** (SlideOver) | Live-Preview Chart |

### Wo werden ESPs in Zonen angezeigt? (4 Stellen)

| # | Ort | Darstellung |
|---|-----|-------------|
| 1 | **ZonePlate** (Level 1) | DeviceMiniCards gruppiert nach Subzone |
| 2 | **ZoneDetailView** (Level 2) | DeviceSummaryCards mit Subzone-Grouping |
| 3 | **ESPOrbitalLayout** (Level 3) | Zone-Dropdown im ESP-Card Header |
| 4 | **UnassignedDropBar** (Level 1) | Nur ESPs OHNE Zone |

### User-Klickpfad: ESP erstellen bis konfiguriert

```
1. ActionBar → "Mock ESP erstellen" → CreateMockEspModal → ESP erstellt (zone: null)
2. ESP erscheint in UnassignedDropBar (unten fixiert)
3. Drag ESP von UnassignedDropBar → ZonePlate (Zone-Zuweisung)
   ODER: Level 3 → ESPOrbitalLayout → ZoneAssignmentDropdown
4. Klick auf ZonePlate → Level 2 (Zone Detail)
5. Klick auf DeviceSummaryCard → Level 3 (ESP Detail)
6. Level 3: "+" Sensor → AddSensorModal → Sensor hinzufuegen
7. Klick auf SensorSatellite → SlideOver mit SensorConfigPanel
8. Settings-Button → ESPSettingsSheet (Name, Zone, Delete)
```

**UX-Problem:** Der User muss mindestens **5 Klicks** um von der Uebersicht zum Sensor-Config zu kommen. Zone-Zuweisung erfordert entweder DnD (nicht intuitiv ohne Anleitung) oder Navigation bis Level 3 + Dropdown.

---

## 4. Identified Legacy/Unused Components

| Datei | Status | Grund |
|-------|--------|-------|
| `SensorSidebar.vue` | Legacy | Ersetzt durch konsolidierte `ComponentSidebar.vue` |
| `ActuatorSidebar.vue` | Legacy | Ersetzt durch konsolidierte `ComponentSidebar.vue` |
| `.connection-dot` in CSS | Legacy (Kommentar) | "kept for backwards compatibility" - Zeile 492 |

---

## 5. Zusammenfassung der Probleme (Prioritaet)

### P0 - Kritisch (UI unbenutzbar)
1. **Scoped CSS + Teleport = weisse Modals** - 5 Modals/Panels betroffen

### P1 - Hoch (Funktionalitaet eingeschraenkt)
2. **`btn--primary` / `btn--secondary` undefiniert** - Buttons in Modals haben keine Styles
3. **UnassignedDropBar `@change` statt `@add`** - Kann falsche Events triggern

### P2 - Mittel (UX-Verbesserung)
4. **Kein DnD-Onboarding** - Keine Hinweise dass ESPs per Drag in Zonen verschoben werden koennen
5. **5+ Klicks bis Sensor-Config** - Langer User-Pfad
6. **Mixed DnD Libraries** - VueDraggable + Native DnD koexistieren ohne klare Abgrenzung

### P3 - Niedrig (Cleanup)
7. **Legacy SensorSidebar/ActuatorSidebar** - Nicht mehr aktiv genutzt, koennen entfernt werden
8. **ESPOrbitalLayout.css: 1380 Zeilen** - Monolithische CSS-Datei mit Styles die eigentlich global sein sollten

---

## 6. Empfohlene Fix-Reihenfolge

1. Shared Form/Modal CSS extrahieren → `src/styles/forms.css`
2. `btn--primary` + `btn--secondary` definieren
3. UnassignedDropBar: `@change` → `@add` korrigieren
4. Legacy-Sidebar-Komponenten entfernen
5. DnD-Feedback und Drop-Zone-Indikatoren verbessern
