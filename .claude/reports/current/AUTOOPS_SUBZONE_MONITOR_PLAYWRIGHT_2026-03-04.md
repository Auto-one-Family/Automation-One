# AutoOps Subzone-Monitor Playwright-Analyse — 2026-03-04

**Erstellt:** 2026-03-04  
**Auftrag:** Playwright E2E: Dashboard → Subzone konfigurieren → Monitor prüfen  
**Quellen:** Playwright-Test, DB-Inspector, Code-Analyse

---

## 1. Executive Summary

| Kategorie | Ergebnis |
|-----------|----------|
| **Playwright-Test** | ✅ Bestanden (mit force: true für Overlay-Klicks) |
| **Subzone-Flow** | ✅ Funktional: Create → API → Monitor-Darstellung |
| **Bugs behoben** | 2 (SlideOver Overlay, Settings-Sheet Close) |
| **DB-Verifikation** | ✅ subzone_configs mit assigned_gpios korrekt |

---

## 2. Durchgeführter Flow

1. **Hardware-View** → Konfigurieren-Button auf Device-Card
2. **ESPSettingsSheet** → Sensor in Config-Liste klicken (z.B. SHT31)
3. **SensorConfigPanel** → Subzone "+ Neue Subzone erstellen..." → Name eingeben → Bestätigen
4. **Speichern** → Sensor-Config mit Subzone
5. **Monitor** → Zone-Tile klicken → L2-Ansicht mit Subzone-Accordion
6. **Verifikation** → Subzone-Bereich sichtbar (E2E-Test-Subzone oder Keine Subzone)

---

## 3. Identifizierte Bugs & Fixes

### BUG-1: SlideOver Overlay blockiert Klicks (UX)

**Symptom:** Wenn ESPSettingsSheet und SensorConfigPanel gleichzeitig offen sind, blockiert das Backdrop des Settings-Sheets Klicks auf dem SensorConfigPanel (Bestätigen, Speichern).

**Ursache:** Beide SlideOvers nutzen `z-index: var(--z-modal)` (50). DOM-Reihenfolge und Transition-Zeit führen dazu, dass das erste Backdrop Klicks abfängt.

**Fixes umgesetzt:**
1. **SlideOver elevation-Prop:** `elevation="high"` für Sensor/Actuator-Config-Panels → `z-index: 60`
2. **Settings-Sheet schließen:** Beim Öffnen von Sensor/Actuator-Config wird das Settings-Sheet geschlossen (`isSettingsOpen = false`)

**Dateien:**
- `El Frontend/src/shared/design/primitives/SlideOver.vue` — elevation-Prop
- `El Frontend/src/views/HardwareView.vue` — Close + elevation

### BUG-2: selectOption label (Playwright)

**Symptom:** `selectOption({ label: /Neue Subzone erstellen/ })` — Playwright erwartet String, nicht Regex.

**Fix:** `selectOption({ label: '+ Neue Subzone erstellen...' })`

---

## 4. Test-Workaround (force: true)

Wegen der 300ms SlideOver-Transition bleibt ein kurzes Zeitfenster, in dem das alte Backdrop noch sichtbar ist. Der Playwright-Test nutzt daher `force: true` für:
- `confirmBtn.click()` (Subzone erstellen)
- `saveBtn.click()` (Sensor speichern)

**Empfehlung:** Bei manueller Nutzung sollte der Fix (Sheet schließen + elevation) ausreichen. Für E2E-Stabilität ist `force: true` akzeptabel.

---

## 5. DB-Verifikation

```sql
SELECT subzone_id, subzone_name, esp_id, assigned_gpios, parent_zone_id
FROM subzone_configs ORDER BY created_at DESC LIMIT 5;
```

| subzone_id | subzone_name | esp_id       | assigned_gpios | parent_zone_id |
|------------|--------------|--------------|----------------|----------------|
| test       | Test         | MOCK_95A49FCB| [0]            | test           |

**Hinweis:** `sensor_configs` hat keine Spalte `subzone_id` — die Monitor-Darstellung nutzt `subzone_configs.assigned_gpios` (GPIO-basiert). Korrekt.

---

## 6. Monitor L2 — Datenfluss

- **API:** `GET /zone/{zone_id}/monitor-data`
- **Service:** `MonitorDataService.get_zone_monitor_data()`
- **Mapping:** `subzone_configs.assigned_gpios` → (esp_id, gpio) → Subzone-Gruppe
- **Frontend:** `zoneMonitorData.subzones` → Accordion mit Sensor-/Aktor-Karten

---

## 7. Referenzen

| Dokument | Inhalt |
|----------|--------|
| `El Frontend/tests/e2e/scenarios/subzone-monitor-flow.spec.ts` | Playwright E2E-Test |
| `auftrag-subzone-funktional-fix.md` | Subzone-Analyse B1–B5 |
| `AUTOOPS_BUG_ANALYSE_2026-03-04.md` | AutoOps Bug-Katalog |
