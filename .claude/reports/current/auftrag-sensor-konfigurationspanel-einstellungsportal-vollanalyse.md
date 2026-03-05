# Auftrag: Sensor-Konfigurationspanel (Einstellungsportal) — Vollanalyse & Fix

> **Erstellt:** 2026-03-04  
> **Ziel:** Das gesamte Einstellungsportal im Frontend gründlich analysieren und funktional korrekt verdrahten  
> **Priorität:** Hoch (Blocker für zuverlässige Sensor/Aktor-Konfiguration)  
> **Ziel-Repo:** auto-one (El Frontend)

---

## 1. Kontext

Robin möchte das **Sensor-Konfigurationspanel** (Einstellungsportal) im Frontend systematisch durchgehen. Es „funktioniert noch nicht wirklich“ — alle Sektionen und Verknüpfungen müssen geprüft und korrekt fixiert werden.

**Screenshot-Referenz:** AutomationOne Dashboard mit geöffnetem SensorConfigPanel (pH-Sensor), Grundeinstellungen, Subzone-Dropdown „Keine Subzone“, Schwellwerte, Kalibrierung, Hardware, Live-Vorschau, Verknüpfte Regeln.

---

## 2. Relevante Dateien (El Frontend)

| Datei | Zweck |
|-------|-------|
| `El Frontend/src/components/esp/SensorConfigPanel.vue` | Hauptpanel (SlideOver); sensorDbId aus config.id (Zeile 136); handleSave baut config inkl. subzone_id (Zeile 289) |
| `El Frontend/src/components/devices/SubzoneAssignmentSection.vue` | Subzone-Dropdown; Props: espId, gpio, modelValue, zoneId; „Neue Subzone“ → assignSubzone mit assigned_gpios: [props.gpio] |
| `El Frontend/src/components/devices/AlertConfigSection.vue` | Alert-Konfiguration (eigener Save); benötigt entity-id = sensorDbId |
| `El Frontend/src/components/devices/RuntimeMaintenanceSection.vue` | Laufzeit & Wartung (eigener Save); benötigt entity-id = sensorDbId |
| `El Frontend/src/components/devices/DeviceMetadataSection.vue` | Geräte-Metadaten (über Haupt-Save) |
| `El Frontend/src/components/devices/LinkedRulesSection.vue` | Verknüpfte Regeln (read-only); filtert logicStore.connections nach espId/gpio, nicht sensor_id |
| `El Frontend/src/api/sensors.ts` | Sensor-CRUD: createOrUpdate(espId, gpio, config) → POST `/sensors/{esp_id}/{gpio}`; updateAlertConfig/updateRuntime nutzen **sensorDbId** (UUID) → PATCH `/sensors/{sensorId}/alert-config`, `/sensors/{sensorId}/runtime` |
| `El Frontend/src/api/subzones.ts` | Subzone: assignSubzone(deviceId, request) → POST `/subzone/devices/{esp_id}/subzones/assign`; getSubzones(deviceId) → GET `/subzone/devices/{esp_id}/subzones` |
| `src/api/zones.ts` | Zonen-Zuweisung, Monitor-Daten |
| `El Frontend/src/composables/useSubzoneCRUD.ts` | Subzone-CRUD (Create/Rename/Delete); B1/B5 siehe Referenz-Berichte |
| `El Frontend/src/composables/useSubzoneResolver.ts` | GPIO → Subzone-Auflösung für Monitor |
| `El Frontend/src/composables/useZoneGrouping.ts` | Gruppierung nach Zone/Subzone |
| `El Frontend/src/shared/stores/zone.store.ts` | WebSocket-Handler für Zone/Subzone-Events |
| `El Frontend/src/shared/stores/logic.store.ts` | connections (computed); LinkedRulesSection filtert nach sourceEspId/sourceGpio bzw. targetEspId/targetGpio |

---

## 3. Sektion-für-Sektion Analyse mit Fix-Punkten

### 3.1 GRUNDEINSTELLUNGEN

| Feld | Erwartet | API-Pfad | Prüfpunkt |
|------|----------|----------|-----------|
| Name | v-model → name | createOrUpdate | Wird bei Save mitgeschickt |
| Beschreibung | optional | createOrUpdate | |
| Einheit | unit | createOrUpdate | |
| Sensor-Typ | read-only | — | |
| Aktiv | enabled | createOrUpdate | |
| **Subzone** | SubzoneAssignmentSection | createOrUpdate **subzone_id** ODER subzonesApi.assignSubzone | **KRITISCH** |

**Subzone-Logik (Backend-Architektur):**

- `sensor_configs` und `actuator_configs` haben **kein** `subzone_id`-Feld.
- Zuordnung erfolgt ausschließlich über `subzone_configs.assigned_gpios`.
- Wenn User `subzone_id` wählt und speichert: Backend muss `subzone_configs` aktualisieren (GPIO zu `assigned_gpios` der gewählten Subzone hinzufügen, aus anderen entfernen).

**Fix-Punkte:**

- [ ] **S1:** Frontend sendet `subzone_id` (SensorConfigPanel.vue Zeile 289: `config.subzone_id = subzoneId.value`, Typ fehlt in `SensorConfigCreate`). **Backend:** `SensorConfigCreate` (schemas/sensor.py) hat **kein** `subzone_id`-Feld; `create_or_update_sensor` in `sensors.py` ruft **keinen** SubzoneService auf. Subzone-Zuordnung nur über `POST /subzone/devices/{esp_id}/subzones/assign`. Fix-Optionen: (a) Backend: `subzone_id` in Schema + nach Save SubzoneService.assign aufrufen, oder (b) Frontend: nach Haupt-Save bei geänderter Subzone zusätzlich `subzonesApi.assignSubzone` aufrufen.
- [ ] **S2:** SubzoneAssignmentSection: `props.gpio` korrekt? Bei „Neue Subzone erstellen“ wird `assigned_gpios: [props.gpio]` gesendet — OK.
- [ ] **S3:** Subzone-Liste: `subzonesApi.getSubzones(espId)` — Mock-ESP? `auftrag-subzonen-mock-geraete-analyse-integration.md`: Frontend blockiert Mock, Backend akzeptiert MOCK_* — prüfen ob SubzoneAssignmentSection für Mock funktioniert.

---

### 3.2 Schwellwerte & Alarme (RangeSlider + Inputs)

| Feld | Variable | API-Pfad | Prüfpunkt |
|------|----------|----------|-----------|
| alarmLow | threshold_min | createOrUpdate | |
| alarmHigh | threshold_max | createOrUpdate | |
| warnLow | warning_min | createOrUpdate | |
| warnHigh | warning_max | createOrUpdate | |

**Fix-Punkte:**

- [ ] **S4:** Werte werden beim Öffnen des Panels korrekt aus Sensor-Config geladen?
- [ ] **S5:** Speichern: Alle 4 Werte im config-Objekt für createOrUpdate?

---

### 3.3 Kalibrierung (pH/EC/Moisture)

| Typ | Daten | API-Pfad | Prüfpunkt |
|-----|-------|----------|-----------|
| pH/EC/Moisture | calibration.getCalibrationData() | createOrUpdate | |

**Fix-Punkte:**

- [ ] **S6:** CalibrationWizard/Composable: Kalibrierungsdaten werden korrekt in config.calibration eingebettet?
- [ ] **S7:** Backend: Akzeptiert sensors API `calibration`-Objekt?

---

### 3.4 Hardware & Interface

| Feld | Variable | API-Pfad | Prüfpunkt |
|------|----------|----------|-----------|
| gpioPin | gpio | createOrUpdate | |
| i2cAddress | i2c_address | createOrUpdate | |
| i2cBus | i2c_bus | createOrUpdate | |
| measureRange | measure_range | createOrUpdate | |
| pulsesPerLiter | pulses_per_liter | createOrUpdate | |
| interface_type | interfaceType | createOrUpdate | |

**Fix-Punkte:**

- [ ] **S8:** I2C-Sensoren: GPIO 0 als Platzhalter — Backend akzeptiert; **sensors.py Zeilen 621–630**: für `interface_type == "I2C"` wird nur `_validate_i2c_config` aufgerufen, keine GPIO-Konfliktprüfung („No GPIO validation needed“).
- [ ] **S9:** Alle Hardware-Felder korrekt gemappt (Frontend→API-Payload)?

---

### 3.5 Alert-Konfiguration (AlertConfigSection)

| Eigenschaft | API-Pfad | Prüfpunkt |
|-------------|---------|-----------|
| Eigener „Speichern“-Button | sensorsApi.updateAlertConfig(sensorDbId, config) | |
| Nutzt sensorDbId (UUID aus config.id) | PATCH `/sensors/{sensorId}/alert-config` (API-Base: `/api/v1`) | SensorConfigPanel setzt sensorDbId aus Response von get/createOrUpdate (Zeile 136) |

**Fix-Punkte:**

- [ ] **S10:** sensorDbId: Wird erst nach erstem Haupt-Save verfügbar. AlertConfigSection: Zeigt Hinweis „Zuerst Sensor speichern“ wenn sensorDbId fehlt?
- [ ] **S11:** updateAlertConfig-Payload: alerts_enabled, suppression_*, custom_thresholds — korrekt?

---

### 3.6 Laufzeit & Wartung (RuntimeMaintenanceSection)

| Eigenschaft | API-Pfad | Prüfpunkt |
|-------------|---------|-----------|
| Eigener „Speichern“-Button | sensorsApi.updateRuntime(sensorDbId, stats) | |
| last_maintenance, interval, maintenance_log | PATCH `/sensors/{sensorId}/runtime` (sensorId = sensorDbId) | |

**Fix-Punkte:**

- [ ] **S12:** Wie S10: sensorDbId-Abhängigkeit. UX: „Zuerst speichern“-Hinweis?
- [ ] **S13:** Phase 4A.8: Runtime-Stats JSONB vorhanden? Backend-Endpoint implementiert?

---

### 3.7 Geräte-Informationen (DeviceMetadataSection)

| Feld | Variable | API-Pfad | Prüfpunkt |
|------|----------|----------|-----------|
| Hersteller, Modell, Seriennummer, etc. | metadata | createOrUpdate (config.metadata) | |

**Fix-Punkte:**

- [ ] **S14:** mergeDeviceMetadata(null, metadata.value) — Implementierung in `El Frontend/src/types/device-metadata.ts` (Zeile 80): merged nur DeviceMetadata-Felder (manufacturer, model, serial_number, …), nicht subzone_id. Subzone wird separat als config.subzone_id gesetzt.
- [ ] **S15:** Metadata wird beim Laden des Panels aus Sensor-Config gelesen?

---

### 3.8 Verknüpfte Regeln (LinkedRulesSection)

| Eigenschaft | API-Pfad | Prüfpunkt |
|-------------|---------|-----------|
| Read-only | logicStore.connections | |

**Fix-Punkte:**

- [ ] **S16:** LinkedRulesSection filtert **nach (esp_id, gpio)**: Quelle `logicStore.connections` mit `sourceEspId === espId && sourceGpio === gpio` (Sensor) bzw. `targetEspId`/`targetGpio` (Aktor). Es wird **kein** sensor_id verwendet — Zuordnung ist (esp_id, gpio). Prüfen: Korrekte Anzeige bei mehreren Sensoren gleichen GPIO (multi-value)?

---

### 3.9 Live-Vorschau (LiveDataPreview)

| Eigenschaft | API-Pfad | Prüfpunkt |
|-------------|---------|-----------|
| WebSocket sensor_data | espStore | |

**Fix-Punkte:**

- [ ] **S17:** WebSocket-Verbindung (F003): Proxy/WS-URL — wenn 403, dann live keine Daten.
- [ ] **S18:** espStore: Key (esp_id, gpio) oder sensor_config_id? Korrekte Zuordnung?

---

### 3.10 Haupt-Speichern-Button

| Aktion | Code-Pfad | Prüfpunkt |
|--------|-----------|----------|
| handleSave() | SensorConfigPanel.vue (Zeile ~240–309) | |
| Mock: Toast | isMock → toast.success | |
| Real: sensorsApi.createOrUpdate(props.espId, props.gpio, config) | POST `/sensors/{esp_id}/{gpio}`; Response liefert config.id → sensorDbId für Alert/Runtime | |

**Config-Objekt (Soll):**

```ts
{
  esp_id, gpio, sensor_type,
  name, description, unit, enabled,
  interface_type,
  threshold_min, threshold_max, warning_min, warning_max,
  subzone_id,
  metadata: mergeDeviceMetadata(...),
  calibration: calData
  // + Hardware-spezifisch: i2c_address, i2c_bus, measure_range, pulses_per_liter
}
```

**Fix-Punkte:**

- [ ] **S19:** Mock-ESP: Zeigt Toast, aber Daten gehen bei Server-Neustart verloren (SENSOR-002) — kein Hinweis für User?
- [ ] **S20:** Fehlerbehandlung: (err as any)?.response?.data?.detail — Toast mit Fehlermeldung?
- [ ] **S21:** Nach Save: emit('saved') — Parent schließt Panel? espStore/zoneStore aktualisiert?

---

### 3.11 Sensor entfernen

| Aktion | API-Pfad | Prüfpunkt |
|--------|----------|-----------|
| sensorsApi.delete(espId, gpio) → DELETE `/sensors/{esp_id}/{gpio}` (sensors.ts Zeile 33) | Prüfen: wird im Panel aufgerufen? |

**Fix-Punkte:**

- [ ] **S22:** DELETE-001 (Quelle: **auftrag-ux-audit-hardwareview.md**; kein Agent „automation-experte“ im Repo): „Kein Sensor-Löschen in SensorConfigPanel“ — Feature-Lücke. Prüfen: Existiert Button „Sensor entfernen“? sensorsApi.delete(espId, gpio) existiert (sensors.ts Zeile 33); ruft Panel sie auf?
- [ ] **S23:** Subzone: Wenn Sensor gelöscht, wird GPIO aus subzone_configs.assigned_gpios entfernt? Backend-Cascade?

---

## 4. Subzone-spezifische Fixes (aus Berichten)

| ID | Fix | Quelle |
|----|-----|--------|
| B1 | useSubzoneCRUD.confirmCreateSubzone: assigned_gpios aus Kontext (nicht []) | zonen-subzonen-vollanalyse-bericht, auftrag-subzone-funktional-fix |
| B5 | useSubzoneCRUD espWithSubzone: ESP über getSubzones(espId) finden, nicht device.subzone_id | wie oben |
| — | SubzoneAssignmentSection: Bei Create subzonesApi.assignSubzone mit assigned_gpios: [gpio] | User-Overview — bereits korrekt |

**Wichtig:** SubzoneAssignmentSection nutzt eigenen Flow für „Neue Subzone erstellen“. useSubzoneCRUD wird anderswo (z. B. ZonePlate) genutzt. Beide müssen konsistent sein.

---

## 5. Verknüpfungs-Matrix (Soll)

| Sektion | Speicherweg | API |
|---------|-------------|-----|
| Grundeinstellungen | Haupt-Save | sensorsApi.createOrUpdate |
| Schwellwerte | Haupt-Save | sensorsApi.createOrUpdate |
| Kalibrierung | Haupt-Save | sensorsApi.createOrUpdate |
| Hardware & Interface | Haupt-Save | sensorsApi.createOrUpdate |
| Geräte-Informationen | Haupt-Save | sensorsApi.createOrUpdate |
| Alert-Konfiguration | eigener Save | sensorsApi.updateAlertConfig |
| Laufzeit & Wartung | eigener Save | sensorsApi.updateRuntime |
| Verknüpfte Regeln | — | read-only |
| Live-Vorschau | — | read-only |
| Subzone | Haupt-Save ODER SubzoneAssignmentSection.assignSubzone | createOrUpdate subzone_id ODER subzonesApi.assignSubzone |

**Subzone-Dual-Pfad:**  
- Bestehende Subzone wählen → Haupt-Save sendet subzone_id → Backend aktualisiert subzone_configs.  
- Neue Subzone erstellen → SubzoneAssignmentSection ruft subzonesApi.assignSubzone direkt auf → danach Haupt-Save für restliche Config.

---

## 6. Priorisierte Fix-Liste

| Prio | Fix-ID | Beschreibung |
|------|--------|--------------|
| 1 | S1, S2, S3 | Subzone: Backend subzone_id-Verarbeitung; Frontend korrekte Payload; Mock-Support |
| 2 | S10, S12 | Alert/Runtime: sensorDbId-Hinweis wenn fehlt |
| 3 | S4, S5, S14, S15 | Laden/Speichern: Schwellwerte, Metadata korrekt roundtrip |
| 4 | S19, S20, S21 | Mock-Hinweis, Fehler-Toast, emit('saved')-Kette |
| 5 | S22, S23 | Sensor entfernen: Button + API + Subzone-Cleanup |
| 6 | S6–S9, S16–S18 | Kalibrierung, Hardware, LinkedRules, Live-Vorschau |

---

## 7. Verifikations-Checkliste

- [ ] Alle Sektionen des SensorConfigPanel durchgeklickt
- [ ] Subzone: Bestehende wählen + Speichern → Monitor L2 zeigt korrekte Subzone
- [ ] Subzone: Neue erstellen → GPIO in Subzone
- [ ] Schwellwerte ändern + Speichern → Roundtrip OK
- [ ] AlertConfigSection: Speichern (wenn sensorDbId vorhanden)
- [ ] RuntimeMaintenanceSection: Speichern (wenn sensorDbId vorhanden)
- [ ] Metadata: Roundtrip
- [ ] Mock-ESP: Alle Aktionen ohne 4xx/5xx
- [ ] Real-ESP: createOrUpdate 200, WebSocket subzone_assignment bei Subzone-Änderung

---

## 8. Referenzen

| Dokument | Inhalt |
|----------|--------|
| `.claude/reports/current/zonen-subzonen-vollanalyse-bericht-2026-03-04.md` | B1, B2, B5, Datenstruktur |
| `.claude/reports/current/auftrag-subzone-funktional-fix.md` | useSubzoneCRUD, espWithSubzone |
| `.claude/reports/current/backend-datenkonsistenz-bericht-2026-03-04.md` | subzone_configs.assigned_gpios, kein subzone_id auf sensor_configs |
| `.claude/reports/current/trockentest-bericht-layout-zonen-komponenten-2026-03-03.md` | F002 Zone-Context 404, F003 WebSocket 403 |
| `.claude/reports/current/auftrag-ux-audit-hardwareview.md` | DELETE-001, SENSOR-002, UX-Audit (kein Agent „automation-experte“ im Repo) |

---

## 9. Nächster Schritt (Session)

1. **Mit Robin:** Sektion für Sektion durchgehen — Screenshot, erwartetes Verhalten, Fix.
2. **Im auto-one Repo:** Fix-Punkte S1–S23 abarbeiten, Verifikations-Checkliste ausführen.
3. **Optional:** Playwright-Test für SensorConfigPanel (Öffnen, Felder laden, Speichern, Subzone-Zuweisung).
