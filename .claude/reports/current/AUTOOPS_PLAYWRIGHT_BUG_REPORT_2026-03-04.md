# AutoOps Playwright Bug-Report — Dashboard Sensor + Subzone Flow

**Datum:** 2026-03-04  
**Flow:** Dashboard Übersicht → ESP öffnen → Sensor hinzufügen → Subzone zuweisen → Speichern  
**Methode:** Playwright MCP (browser_navigate, browser_drag, browser_fill_form, browser_click)

---

## Durchgeführter Flow

1. **Dashboard Übersicht** (`/hardware`) — Zone "Test" mit Mock #9FCB
2. **ESP-Karte klicken** → Level 2 (`/hardware/test/MOCK_95A49FCB`)
3. **pH-Sensor** aus Komponenten-Sidebar auf ESP-Drop-Zone gezogen
4. **AddSensorModal:** GPIO 32 gewählt, Name "pH Wassertank", Subzone "test_reihe_1"
5. **Hinzufügen** → Sensor erfolgreich hinzugefügt
6. **Sensor-Klick** → SensorConfigPanel (pH-Dialog)
7. **Subzone:** "+ Neue Subzone erstellen..." → Name "Reihe 1" → Erstellen
8. **Speichern** → "Sensor-Konfiguration gespeichert"

---

## Gefundene Bugs

### BUG-1: Ungültiger GPIO als Default (AddSensorModal)

**Schwere:** Mittel  
**Ort:** `AddSensorModal.vue` / GpioPicker

- **Symptom:** Beim pH-Sensor war GPIO 0 vorausgewählt, obwohl "GPIO 0 ist ein System-Pin und nicht verfügbar" angezeigt wurde.
- **Folge:** Button "Hinzufügen" war deaktiviert, bis manuell ein anderer GPIO (z.B. 32) gewählt wurde.
- **Erwartung:** Default sollte ein freier, gültiger GPIO sein (z.B. 32 oder 33 mit ★).

---

### BUG-2: Subzone aus AddSensorModal wird nicht übernommen

**Schwere:** Hoch  
**Ort:** AddSensorModal → Backend / SensorConfigPanel

- **Symptom:** Im AddSensorModal wurde Subzone "test_reihe_1" eingegeben. Nach dem Hinzufügen zeigte das SensorConfigPanel bei Subzone "Keine Subzone" [selected].
- **Folge:** Subzone musste erneut im SensorConfigPanel gesetzt werden.
- **Root Cause (verifiziert):**
  - Backend speichert `subzone_id` korrekt (debug.py:822, sensor_metadata)
  - Mock-ESP-Response liefert `subzone_id` (debug.py:132)
  - **SensorConfigPanel** lädt für Mock-Devices (`!isMock`) KEINE Config von der API — nur Real-Devices rufen `sensorsApi.get()` auf
  - Im Mock-Branch (Zeile 166–175) wird `subzoneId` nie aus dem Sensor gesetzt
  - Fix: Im Mock-Branch Sensor aus `device.sensors` holen und `subzoneId.value = sensor.subzone_id` setzen

---

### BUG-3: Subzone-Dropdown zeigt Zone-Namen als Option

**Schwere:** Niedrig (UX)  
**Ort:** SensorConfigPanel / Subzone-Combobox

- **Symptom:** Im Subzone-Dropdown erscheint "Test" als Option — "Test" ist der Zonenname, kein Subzonenname.
- **Folge:** Verwechslungsgefahr zwischen Zone und Subzone.
- **Hinweis:** Könnte beabsichtigt sein, wenn "Test" als Subzone existiert; dann wäre die Darstellung unklar.

---

### BUG-4: Floating-Point-Anzeige in Spinbuttons

**Schwere:** Niedrig  
**Ort:** SensorConfigPanel — Schwellwerte

- **Symptom:** Spinbutton "Warn ↓" zeigt `1.4000000000000001` statt `1.4`.
- **Folge:** Optisch unschön, keine funktionale Auswirkung.

---

### BUG-5: SHT31-Wert springt nach Speichern

**Schwere:** Unklar (evtl. kein Bug)  
**Ort:** ESP-Orbital-Layout / Mock-Daten

- **Symptom:** SHT31 zeigte vor dem Speichern 22,0°C, danach 35,0°C.
- **Folge:** Könnte Mock-Fluktuation sein; bei echten Geräten wäre das verdächtig.

---

## Zusammenfassung

| Bug  | Kurzbeschreibung                          | Schwere |
|------|-------------------------------------------|---------|
| BUG-1 | Ungültiger GPIO 0 als Default              | Mittel  |
| BUG-2 | Subzone aus AddSensorModal wird ignoriert  | Hoch    |
| BUG-3 | Zone-Name "Test" im Subzone-Dropdown       | Niedrig |
| BUG-4 | Float-Anzeige 1.4000... in Spinbutton      | Niedrig |
| BUG-5 | SHT31-Wert springt (22→35)                | Unklar  |

---

## Empfehlung

- **BUG-2** zuerst prüfen: `addSensor`-Payload und Backend-API auf `subzone_id` untersuchen.
- **BUG-1** im GpioPicker/AddSensorModal beheben: Default auf ersten freien GPIO setzen.

---

## Backend-Analyse: Was tatsächlich ankommt

### Request-Flow (Frontend → Backend)

- **POST** `/v1/debug/mock-esp/{esp_id}/sensors` mit `MockSensorConfig`
- Schema (`schemas/debug.py:67`): `subzone_id: Optional[str]` ✅
- Frontend sendet `sensorData` inkl. `subzone_id` (z.B. `"test_reihe_1"`)

### Backend-Verarbeitung

| Schritt | Datei | subzone_id |
|---------|-------|------------|
| add_sensor sensor_config | `debug.py:822` | ✅ `config.subzone_id` |
| add_sensor_to_mock | `esp_repo.py:507` | ✅ Vollständiger Dict in `device_metadata.simulation_config.sensors` |
| sensor_repo.create | `debug.py:874` | ✅ In `sensor_metadata` |
| _build_mock_esp_response | `debug.py:132` | ✅ `config.get("subzone_id")` |

### Fazit Backend

**Das Backend speichert und liefert `subzone_id` durchgängig korrekt.** Der Fehler liegt ausschließlich im Frontend.

### Root Cause (Frontend)

**SensorConfigPanel.vue** (`components/esp/SensorConfigPanel.vue:166-175`):

- Für **Real-Devices** wird `sensorsApi.get()` aufgerufen → `config.subzone_id` wird geladen.
- Für **Mock-Devices** wird `subzoneId` **nie** gesetzt — der Mock-Branch lädt nur Defaults (unitValue, alarmLow, etc.).
- `device.subzone_id` (Zeile 179) ist die Subzone des **ESP**, nicht des **Sensors** — falsche Quelle.

**Korrekte Quelle für Mock:** `device.sensors.find(s => s.gpio === props.gpio)?.subzone_id`

### Fix-Vorschlag

Im Mock-Branch von SensorConfigPanel nach dem Setzen der Defaults ergänzen:

```javascript
const device = espStore.devices.find(d => espStore.getDeviceId(d) === props.espId)
const sensor = device?.sensors?.find(s =>
  s.gpio === props.gpio &&
  (s.sensor_type === props.sensorType || !props.sensorType)
)
if (sensor?.subzone_id) {
  subzoneId.value = sensor.subzone_id
}
```
