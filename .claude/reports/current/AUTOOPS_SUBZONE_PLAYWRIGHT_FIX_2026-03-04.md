# AutoOps Playwright Subzone-Test — Analyse & Fixes

> **Datum:** 2026-03-04  
> **Flow:** Hardware/Übersicht → Mock ESP → SHT31 → Subzone konfigurieren → Speichern

---

## 1. Playwright-Test durchgeführt

### Ablauf
1. **Frontend** http://localhost:5173/hardware geöffnet
2. **Mock #CD10** (Zone Test) → Konfigurieren
3. **SHT31 GPIO 0** angeklickt → SensorConfigPanel (SlideOver)
4. **Subzone:** "+ Neue Subzone erstellen..." gewählt
5. **Name:** "SHT31-Bereich" eingegeben
6. **Erstellen** (Check-Button) geklickt

### Ergebnis
- **422 Unprocessable Entity** bei `POST /subzone/devices/MOCK_0CBACD10/subzones/assign`
- Toast: "Subzone konnte nicht erstellt werden"
- Panel blieb offen (erwartetes Verhalten bei Fehler)

---

## 2. Root Cause: subzone_id Validierung

### Problem
Der Server akzeptiert nur **Buchstaben, Zahlen und Unterstriche** (`schemas/subzone.py`):

```python
@field_validator("subzone_id")
def validate_subzone_id_format(cls, v: str) -> str:
    if not v.replace("_", "").isalnum():
        raise ValueError("subzone_id must contain only letters, numbers, and underscores")
    return v.lower()
```

Das Frontend erzeugte `"sht31-bereich"` (Bindestrich aus "SHT31-Bereich") → **422**.

### Fix (SubzoneAssignmentSection.vue)
```typescript
// Vorher
const subzoneId = name.toLowerCase().replace(/\s+/g, '_')

// Nachher
const subzoneId = name
  .toLowerCase()
  .replace(/\s+/g, '_')
  .replace(/-/g, '_')
  .replace(/[^a-z0-9_]/g, '_')
```

"SHT31-Bereich" → `sht31_bereich` ✓

---

## 3. Panel schließt sich nicht nach Speichern

### Problem
Nach erfolgreichem Speichern blieb das SensorConfigPanel/ActuatorConfigPanel offen.

### Fix
- **SensorConfigPanel.vue:** `emit('saved')` nach erfolgreichem Save (Mock + Real)
- **ActuatorConfigPanel.vue:** `emit('saved')` nach erfolgreichem Save (Mock + Real)
- **HardwareView.vue:** `@saved="showSensorConfig = false; espStore.fetchDevice(...)"` und analog für Actuator

---

## 4. Übersicht vs. Monitor — Subzone-Logik

### Beobachtung
- **Monitor L2:** Subzone-Anzeige funktioniert (Datenquelle: `zonesApi.getZoneMonitorData()` → GPIO→Subzone-Mapping)
- **Übersicht (HardwareView):** ZonePlate gruppiert nach `device.subzone_id`

### Ursache
- Subzonen sind **pro GPIO** (Sensor/Aktor), nicht pro ESP
- Ein ESP kann mehrere Subzonen haben (verschiedene Sensoren in verschiedenen Subzonen)
- `device.subzone_id` ist semantisch ungeeignet für ESPs mit mehreren Subzonen
- ZonePlate nutzt `device.subzone_id` für Gruppierung — bei ESPs mit gemischten Subzonen ungenau

### Empfehlung (aus auftrag-subzone-funktional-fix.md)
- **Option A:** HardwareView nutzt `getZoneMonitorData` oder ähnliche API mit GPIO→Subzone-Auflösung
- **Option B:** ESP-Liste um `subzone_ids[]` oder abgeleitete Anzeige erweitern
- **Option C:** ZonePlate zeigt Subzone-Chips nur wenn alle Geräte einer Zone dieselbe Subzone haben (vereinfacht)

---

## 5. Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `SubzoneAssignmentSection.vue` | subzone_id: Bindestriche und Sonderzeichen → Unterstriche |
| `SensorConfigPanel.vue` | emit('saved') nach erfolgreichem Save |
| `ActuatorConfigPanel.vue` | emit('saved') nach erfolgreichem Save |
| `HardwareView.vue` | @saved-Handler für beide Config-Panels |

---

## 6. Verifikation

```bash
cd "El Frontend"
npx vue-tsc --noEmit   # ✓ OK
```

**Manueller Test:** Nach Frontend-Neustart (Hot-Reload) erneut Subzone "SHT31-Bereich" erstellen → sollte 200 liefern, Panel schließt nach Speichern.

---

## 7. Referenzen

- `.claude/reports/current/auftrag-subzone-funktional-fix.md`
- `El Servador/god_kaiser_server/src/schemas/subzone.py` (Zeile 80–86)
- `El Frontend/src/components/devices/SubzoneAssignmentSection.vue`
