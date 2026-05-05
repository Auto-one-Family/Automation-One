# SI-5 ZonesView/SubzonesView — Hierarchie, Assignment, assigned_gpios-Primärpfad

**Datum:** 2026-05-06
**Strang:** 5 von 8 — Frontend-Konsolidierung 2026
**Linear-Issue:** AUT-242
**Analysebasis:** Repo-Stand Branch `auto-debugger/work` (HEAD a4a4caec)
**Autor:** meta-analyst

---

## 1. Assignment-Workflow-Inventar

| Stelle | Typ | Pfad | Kanonisch? | Bemerkung |
|--------|-----|------|------------|-----------|
| `ZoneAssignmentPanel.vue` | Freitext-Input | `El Frontend/src/components/zones/ZoneAssignmentPanel.vue` | Ja | Kanonischer Pfad. Freitext → `generateZoneId()` → REST `POST /zone/devices/{id}/assign`. State-Machine: `idle | sending | pending_ack | success | timeout | error`. ACK-Timeout 30 s. |
| `ZoneAssignmentDropdown.vue` | HTML-`<select>`-Dropdown | `El Frontend/src/components/esp/ZoneAssignmentDropdown.vue` | Nein | Emittiert nur `zone-changed`; keine eigene API-Call-Logik. Parent muss Aktion ausführen. Verwendet in `ESPOrbitalLayout.vue`. |
| `ZonePlate.vue` (HardwareView) | Drag-and-Drop (VueDraggable) | `El Frontend/src/components/dashboard/ZonePlate.vue` | Nein | Nutzt `useZoneDragDrop` composable. Ruft `zonesApi.assignZone()` direkt auf. Kein State-Machine-Muster, kein ACK-Warten. Subzone-Strategie-Handling fehlt hier. |
| `useZoneDragDrop.ts` | Composable | `El Frontend/src/composables/useZoneDragDrop.ts` | Nein | Wrapper um `zonesApi.assignZone()` mit Undo/Redo-Stack (max 20 Einträge). `generateZoneId()` ist identisch mit `ZoneAssignmentPanel.vue` dupliziert. |
| `ESPSettingsSheet.vue` | SlideOver-Panel | `El Frontend/src/components/esp/ESPSettingsSheet.vue` | Mittel | Mountet `ZoneAssignmentPanel` (kanonisch), ergänzt `ZoneSwitchDialog` für Strategienwahl. Vollständigster Pfad. |
| `SubzoneAssignmentSection.vue` | Dropdown + Inline-Create | `El Frontend/src/components/devices/SubzoneAssignmentSection.vue` | Ja | Kanonischer Subzone-Pfad. Ruft `subzonesApi.assignSubzone()` mit `assigned_gpios: [props.gpio]` direkt auf. |
| `useSubzoneCRUD.ts` | Composable (Create/Rename/Delete) | `El Frontend/src/composables/useSubzoneCRUD.ts` | Ja | Kanonisch für Subzone-CRUD außerhalb SensorConfig. Nutzt `subzonesApi.assignSubzone()`. Rename liest `assigned_gpios` explizit aus `getSubzone` (B5-Fix). |
| `ZoneSwitchDialog.vue` | Strategiedialog (Modal) | `El Frontend/src/components/zones/ZoneSwitchDialog.vue` | Ergänzend | Reine UI-Auswahl ohne eigene API-Call-Logik. Strategie-Optionen: `transfer | copy | reset`. Emittiert `confirm(strategy)` an Parent. |

**Diff-Befund:** Drei divergente Einstiegspunkte für Zone-Assignment-REST-Calls:
1. `ZoneAssignmentPanel.vue` → `zonesApi.assignZone()` (mit ACK-State-Machine, Timeout-Guard)
2. `useZoneDragDrop.ts` → `zonesApi.assignZone()` (ohne ACK-State-Machine, mit Undo/Redo)
3. `ZonePlate.vue` direkt → `useZoneDragDrop`

Die Kernlogik `generateZoneId()` ist in `ZoneAssignmentPanel.vue` (Z. 257–266) und `useZoneDragDrop.ts` (Z. 97–107) identisch dupliziert — kein gemeinsamer Utils-Aufruf.

---

## 2. assigned_gpios-Kohärenz-Befund

Zwei Zuordnungs-Mechanismen existieren parallel:
- **Primär:** `subzone_configs.assigned_gpios` — GPIO-Array, wird beim Assign/Rename immer mitgesendet
- **Sekundär:** `sensor_configs.subzone_id` — FK-Feld, wird beim Read aus Backend gelesen (SensorConfigPanel Z. 201)

| Komponente | Liest `assigned_gpios` | Liest `subzone_id` | Inkonsistenz? |
|------------|------------------------|---------------------|---------------|
| `useSubzoneResolver.ts` | Ja (primär, Z. 73) | Nein | Kein Konflikt — explizit als Fallback für Monitor L2 wenn API unavailable. |
| `ESPSettingsSheet.vue` → `getEffectiveSubzoneId()` | Ja (Z. 221, zweiter Priorität) | Ja (Z. 216, erste Priorität) | Bewusste 2-Stufen-Priorierung: `subzone_id` FK first, dann `assigned_gpios`. Dokumentiert. |
| `SensorConfigPanel.vue` | Nein | Ja (Z. 201) | Liest nur `subzone_id` beim Laden der Konfiguration. `assigned_gpios` wird beim Schreiben via `SubzoneAssignmentSection` gesetzt, nicht beim Lesen direkt ausgewertet. |
| `SubzoneAssignmentSection.vue` | Schreibt (Z. 106) | Liest `modelValue` = `subzone_id` | Schreibt `assigned_gpios: [gpio]` beim Create; beim Select einer bestehenden Subzone wird nur `subzone_id` emittiert — `assigned_gpios` wird dabei NICHT aktualisiert. |
| `useSubzoneCRUD.ts` (Rename) | Ja — liest aus `getSubzone()` (Z. 126) | Nein | Rename-Pfad liest `assigned_gpios` explizit um Überschreiben zu vermeiden (B5-Fix). Korrekt. |
| `MonitorView.vue` (L2-Accordion) | Via `useSubzoneResolver` (Fallback) | Via `monitor-data` API (primär, Z. 1466) | Zwei Codepfade: primär `GET /zone/{id}/monitor-data`, Fallback `assigned_gpios`-Map. Explicit Fallback dokumentiert. |
| `HierarchyTab.vue` | Ja (Z. 206, Display only) | Nein | Nur Anzeige der GPIO-Nummern. Kein Schreibzugriff. |
| `ZonePlate.vue` (Dashboard) | Nein | Ja (`device.subzone_id` indirekt) | Subzone-Label im Drag-List kommt aus `device.subzone_id` (Device-Objekt), nicht aus `assigned_gpios`. |

**Bezug AUT-227 (Legacy `assigned_subzones`):** Das Feld `assigned_subzones` ist in `sensor_configs` (DB-Model `El Servador/.../models/sensor.py` Z. 247) und `actuator_configs` (Z. 179) als JSON-Spalte vorhanden. In der Server-API (`sensors.py` Z. 176, `actuators.py` Z. 151) ist es als "Legacy field, passed through the API layer but not evaluated" kommentiert. Im Frontend ist es in `types/index.ts` (Z. 735, 779, 956, 985) als `assigned_subzones?: string[] | null` typisiert — aber in keiner UI-Komponente gelesen oder geschrieben. Es ist reiner Payload-Durchschleifer. Nach AUT-227-Cleanup kann dieses Feld aus den Frontend-Types entfernt werden, ohne funktionale Auswirkung.

---

## 3. Zone/Subzone-Tile-Komponenten-Status

### ZoneTileCard

`El Frontend/src/components/monitor/ZoneTileCard.vue` existiert und ist vollständig implementiert. Einzige Nutzung: `MonitorView.vue` (Z. 69, 2106–2132). Wird nicht in `HardwareView`, `SensorsView`, `CustomDashboardView` oder `ZonesView` wiederverwendet. Es gibt keine dedizierte `ZonesView`-Route im Router — die Zone-Übersicht außerhalb MonitorView ist in `HardwareView.vue` integriert (via `ZonePlate.vue` + `ZoneDetailView.vue`).

**Befund:** `ZoneTileCard` ist MonitorView-exklusiv und zeigt KPIs (Ø-Sensorwerte, Regeln, Device-Counts, Flapping-Badge). Für andere Kontexte gibt es keine Wiederverwendung — HardwareView nutzt `ZonePlate.vue` (Dashboard-Widget-Stil, kein KPI-Muster).

### SubzoneTileCard

Eine Komponente `SubzoneTileCard.vue` existiert nicht im Repository. Es gibt:
- `SubzoneArea.vue` (`El Frontend/src/components/zones/SubzoneArea.vue`) — reiner Layout-Wrapper (tinted background, accent border, header mit MapPin + Gerätecount, Slot für `DeviceSummaryCards`). Keine KPIs, keine Sensor-Aggregate.
- `ZoneDetailView.vue` nutzt `SubzoneArea` für Subzone-Gruppierung (L2-Level in HardwareView Orbital-Zoom).
- MonitorView rendert Subzonen in L2 direkt inline ohne dedizierte Tile-Komponente (Accordion-Pattern).

**AUT-203 Status:** Laut Auftrag noch nicht implementiert. Bestätigt — `SubzoneTileCard.vue` fehlt. Aktuelle Subzone-Anzeige in MonitorView ist inline im L2-Accordion direkt im MonitorView-Template; für HardwareView ist es `SubzoneArea.vue` (nur Layout, keine eigene Card-Semantik).

### Zone-Übersicht außerhalb MonitorView

| Kontext | Komponente | Subzone-Anzeige? |
|---------|-----------|------------------|
| HardwareView L1 (Dashboard) | `ZonePlate.vue` | Subzone-Labels als Inline-Badge in VueDraggable-Liste |
| HardwareView L2 (Orbital/Detail) | `ZoneDetailView.vue` + `SubzoneArea.vue` | Subzone als Layout-Wrapper, Devices darin |
| SystemMonitorView | `HierarchyTab.vue` | Baumansicht: Zone → Subzone → GPIO-Liste |
| MonitorView L1 | `ZoneTileCard.vue` | Keine Subzone-Anzeige |
| MonitorView L2 | Inline-Accordion | Subzonen als Accordion-Sektionen |

---

## 4. Soft-Delete-UI-Befund

**Zone-Soft-Delete:** Zonen haben `status: 'active' | 'archived'` (kein `'deleted'`-Status in der Zone-Entity). Der hard-delete-Pfad (`zonesApi.deleteZoneEntity`) entfernt aus dem Store-Array sofort (`zoneEntities.value.filter()`). Es gibt keinen `status = 'deleted'`-Guard im Frontend.

**Archivierungs-Guard:** `ZoneSettingsSheet.vue` verhindert Archivierung wenn `deviceCount > 0` (Z. 143–153 — `uiStore.confirm()` mit "Archivierung aktuell gesperrt"-Dialog). Kein Cascade-Delete-Preview vor dem Archivieren.

**Hard-Delete-Guard:** Löschen ist gesperrt wenn `deviceCount !== 0` (`canDeleteZone = deviceCount === 0`, Z. 138). Double-Confirm-Dialog vorhanden (Z. 196–214). Keine Cascade-Warning für abhängige `sensor_configs` — der Dialog nennt nur Geräte, nicht Sensor-Konfigurationen.

**Server-Seite:** `El Servador/god_kaiser_server/src/api/v1/esp.py` (Z. 666–678) dokumentiert Cascade-Delete nur für ESP-Devices, nicht für Zone-Entities. Kein `GET /zones/{id}/delete_preview`-Endpoint im Repository vorhanden.

**Zone-Filter in Store/Views:**
- `zone.store.ts` liefert `activeZones` (filter `status === 'active'`) und `archivedZones` (filter `status === 'archived'`) als Computed.
- `MonitorView.vue` (Z. 1171) ruft `zoneStore.fetchZoneEntities()` ohne Status-Filter auf — listet also sowohl aktive als auch archivierte Zonen. In der Template-Ebene (Z. 166) gibt es ein `archived: zone.status === 'archived'`-Flag für visuelle Unterscheidung.
- `ZonePlate.vue` prüft `isArchived` und deaktiviert Drag-Drop für archivierte Zonen (`!isArchived && ...`).
- Wiederherstellungs-UI: Vorhanden in `ZoneSettingsSheet.vue` via `handleReactivate()` (Z. 176–187) — Button "Zone reaktivieren" bei `status === 'archived'`.

**Cascade-Delete-Warnung:** Beim Löschen einer Zone wird nicht gewarnt, dass abhängige Sensor-Konfigurationen (`sensor_configs` mit `subzone_id` FK) betroffen sind. Der `ZoneSettingsSheet`-Delete-Dialog nennt explizit nur Geräte als Blockierungsgrund, keine Configs.

---

## 5. Subzone-ACK-Befund

### WS-Event-Verarbeitung

Die `subzone_assignment` WS-Events werden in zwei Schichten verarbeitet:
1. `El Frontend/src/stores/esp-websocket-subscription.ts` (Z. 49, 102) — registriert `subzone_assignment` als `'patch'`-Strategie.
2. `El Frontend/src/stores/esp.ts` (Z. 1992) — `ws.on('subzone_assignment', handleSubzoneAssignment)` → delegiert an `zone.store.ts`.
3. `zone.store.ts` → `handleSubzoneAssignment()` (Z. 306) — patched `device.subzone_id` / `device.subzone_name` im ESPDevice-Objekt.

### ACK-Timeout bei Subzones

Im Gegensatz zu Zone-Assignment (`ZoneAssignmentPanel.vue`: 30-s-Timeout, State-Machine mit `pending_ack`-Zustand) gibt es für Subzone-Assignment keinen expliziten ACK-Timeout-Mechanismus im Frontend.

`SubzoneAssignmentSection.vue` und `useSubzoneCRUD.ts` rufen `subzonesApi.assignSubzone()` auf und warten nur auf die HTTP-Response. Nach HTTP-200 wird `espStore.fetchAll()` ausgelöst — kein Warten auf WS `subzone_assignment`.

**Befund:** Die UI committed Subzone-Zuweisung silent nach HTTP-Response, ohne auf WS-ACK zu warten. Das WS-Event (`subzone_assignment`) wird im ESP-Store verarbeitet und patched den Device-State, aber es gibt keine UI-Komponente die auf diesen Patch wartet (kein `pending_ack`-State für Subzones).

### Subzone-Refresh-Debounce

Nach `subzone_assignment`-Event prüft `esp.store.ts` (Z. 1422–1432) ob ein `needsRefresh` vorliegt (wenn Delta-Patch fehlschlug). Falls ja: `fetchAll()` mit 250-ms-Debounce-Timer (`subzoneRefreshTimer`).

### MQTT-Topics (aus Kommentar zone.store.ts Z. 9)

`kaiser/{esp_id}/subzone/ack` → Server → WS `subzone_assignment`

Die MQTT-Topics `…/subzone/assign|remove|safe|ack` sind in zone.store.ts-Kommentar referenziert aber nicht als SSOT-Konstanten im Frontend definiert.

---

## 6. Server-Touchpoints-Vorschläge

| Endpoint | Warum fehlend | Priorität |
|----------|---------------|-----------|
| `GET /zones/{id}/delete_preview` | Vor Lösch-Dialog: Zeige Anzahl abhängiger sensor_configs, actuator_configs, subzones. Aktuell: UI blockt nur bei deviceCount > 0, nennt aber keine Config-Counts. | Mittel |
| `GET /zones` mit `status` Query-Filter in Frontend-Fetch | `fetchZoneEntities()` wird ohne Status-Filter aufgerufen; MonitorView holt alle Zonen inkl. archivierter. Sinnvoll: Standard-Fetch filtert auf `status=active`, separater Fetch für archived. | Niedrig |
| Subzone-ACK-Mechanismus in API-Response | `POST /subzone/assign` könnte `mqtt_sent: bool` zurückgeben (analog `ZoneAssignResponse`), damit Frontend entscheiden kann ob ACK-Warten sinnvoll ist. Heute fehlt dieser Flag im Subzone-Assign-Response. | Mittel |

---

## 7. Follow-up-Vorschläge (priorisiert)

### P1 — Kritisch für AUT-227-Cleanup

**`assigned_subzones` aus Frontend-Types entfernen**
- Pfad: `El Frontend/src/types/index.ts` Z. 735, 779, 956, 985
- Das Feld ist in keiner UI-Komponente gelesen oder geschrieben (nur in Type-Definitionen).
- Blockiert AUT-227-Cleanup: Nach Server-seitigem Entfernen des Legacy-Felds werden Frontend-Typfehler auftreten wenn das Feld noch als `assigned_subzones?: string[] | null` deklariert ist.
- Kein Frontend-Test oder Komponenten-Logik abhängig — safe to remove.

### P2 — Konsistenz

**`generateZoneId()` in gemeinsame Utils-Funktion auslagern**
- Identische Implementierung in `ZoneAssignmentPanel.vue` (Z. 257–266) und `useZoneDragDrop.ts` (Z. 97–107).
- Ziel: `El Frontend/src/utils/zoneHelpers.ts` (analog zu `subzoneHelpers.ts`).
- Beide Dateien referenzieren dieselbe Server-seitige Logik; Drift-Risiko bei Änderungen.

**`SubzoneTileCard.vue` erstellen (AUT-203)**
- `SubzoneArea.vue` ist nur Layout-Wrapper ohne KPI-Semantik.
- Für MonitorView L2 und HardwareView L2 wäre eine einheitliche `SubzoneTileCard` mit Sensor-Aggregaten (analog `ZoneTileCard`) sinnvoll.
- Aktuell: MonitorView L2 rendert Subzonen direkt im 800+ Zeilen langen `MonitorView.vue`-Template.

### P3 — Sicherheit/UX

**Cascade-Warning beim Zone-Löschen**
- `ZoneSettingsSheet.vue` `handleDelete()` nennt nur Geräte als Blockierungsgrund.
- Server-seitig existiert Cascade-Delete-Logik für Subzones bei Zone-Removal (`zone_service.py` Z. 334).
- Empfehlung: `GET /zones/{id}/delete_preview`-Endpoint + Dialog zeigt Counts für abhängige Configs.

**Subzone-ACK-Timeout einführen**
- Zone-Assignment hat 30-s-State-Machine mit `pending_ack`/`timeout`.
- Subzone-Assignment ist silent commit nach HTTP-Response.
- Einheitliches ACK-Muster: `subzonesApi.assignSubzone()` Response um `mqtt_sent`-Flag erweitern; `SubzoneAssignmentSection` zeigt `pending_ack`-Badge wenn `mqtt_sent === true`.

### P4 — Optionale Verbesserung

**`fetchZoneEntities()` Standard-Status-Filter**
- `MonitorView.vue` holt alle Zonen (aktiv + archiviert) ohne Filter.
- Archivierte Zonen in MonitorView L1 werden zwar visuell markiert (`archived: true`), aber nicht ausgeblendet — kann für Nutzer verwirrend sein.
- Option: Standard-Fetch nur `active`; archivierte Zonen explizit über Einstellungs-Toggle laden.

---

*Bericht erstellt durch meta-analyst, evidenzbasiert aus Repo-Code. Kein Code wurde geändert.*
