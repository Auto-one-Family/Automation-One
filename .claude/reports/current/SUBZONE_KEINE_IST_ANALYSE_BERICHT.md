# Subzone „Keine“ — Vollständige IST-Analyse

**Erstellt:** 2026-03-05  
**Priorität:** HOCH  
**Typ:** Analyse-Bericht  
**Auftrag:** `auftrag-subzone-keine-ist-analyse.md`

---

## 1. Code-Pfade-Tabellen (Schritt 1)

### 1.1 Initiales Config-Panel

| Datei | Funktion/Stelle | Was passiert mit subzone_id? |
|-------|-----------------|------------------------------|
| **AddSensorModal.vue** | `newSensor.subzone_id` (Zeile 64, 190) | Initial `null`, SubzoneAssignmentSection (Dropdown) — „Keine Subzone“ + bestehende Subzonen + „Neue Subzone erstellen“ |
| **AddSensorModal.vue** | `resetForm()` (Zeile 190) | Setzt `subzone_id: null` zurück |
| **AddSensorModal.vue** | `addSensor()` (Zeile 202–210) | Übergibt `sensorData = { ...newSensor.value }` unverändert an `espStore.addSensor()` — enthält `subzone_id: null` oder gewählte Subzone |
| **AddSensorModal.vue** | `addMultipleOneWireSensors()` (Zeile 263–276) | `chosenSubzoneId = normalizeSubzoneId(newSensor.value.subzone_id)` — `null` bei „Keine Subzone“; übergibt `subzone_id: chosenSubzoneId ?? undefined` pro ROM |
| **AddActuatorModal.vue** | `newActuator.subzone_id` (Zeile 64, 137) | Initial `null`, SubzoneAssignmentSection (Dropdown) — gleiche Logik wie AddSensorModal |
| **AddActuatorModal.vue** | `resetForm()` (Zeile 137) | Setzt `subzone_id: null` zurück |
| **AddActuatorModal.vue** | `addActuator()` (Zeile 147–154) | Übergibt `newActuator.value` komplett an `espStore.addActuator()` |
| **esp.ts** | `addSensor()` (Zeile 699–700) | `subzone_id: config.subzone_id \|\| null` — `''` und `undefined` → `null`; **`"__none__"` bleibt `"__none__"`** (truthy!) |
| **esp.ts** | `addActuator()` (Zeile 911–912) | `subzone_id: config.subzone_id \|\| null` — gleiche Logik wie addSensor |

### 1.2 SensorConfigPanel / ActuatorConfigPanel

| Datei | Funktion/Stelle | Was passiert mit subzone_id? |
|-------|-----------------|------------------------------|
| **SubzoneAssignmentSection.vue** | `NONE_OPTION = '__none__'` (Zeile 42) | Sentinel für HTML-Select (verhindert `"null"`-String) |
| **SubzoneAssignmentSection.vue** | `selectedValue` getter (Zeile 46–49) | `modelValue == null \|\| modelValue === ''` → zeigt `NONE_OPTION` im Dropdown |
| **SubzoneAssignmentSection.vue** | `selectedValue` setter (Zeile 51–58) | Bei Auswahl `NONE_OPTION`: `emit('update:modelValue', null)` — **sendet nie `"__none__"` an Parent** |
| **SubzoneAssignmentSection.vue** | `selectOptions` (Zeile 64–70) | Option `{ value: NONE_OPTION, label: 'Keine Subzone' }` |
| **SensorConfigPanel.vue** | `subzoneId` ref (Zeile 72) | v-model mit SubzoneAssignmentSection |
| **SensorConfigPanel.vue** | `handleSave` (Zeile 277–282) | **Explizite Normalisierung:** `config.subzone_id = (rawSubzone === '__none__' \|\| rawSubzone == null \|\| rawSubzone === '') ? null : rawSubzone` |
| **SensorConfigPanel.vue** | Config-Load (Zeile 146–147, 171) | `subzoneId.value = config.subzone_id ?? null` |
| **ActuatorConfigPanel.vue** | `subzoneId` ref (Zeile 63) | v-model mit SubzoneAssignmentSection |
| **ActuatorConfigPanel.vue** | `handleSave` (Zeile 251) | `subzone_id: subzoneId.value \|\| null` — **keine `__none__`-Normalisierung** (SubzoneAssignmentSection emittiert aber immer `null`) |
| **ActuatorConfigPanel.vue** | Config-Load (Zeile 123–124, 144–145) | `subzoneId.value = (config as any).subzone_id` bzw. `device.subzone_id` |

### 1.3 Backend

| Datei | Funktion | Wie wird subzone_id verarbeitet? |
|-------|----------|-----------------------------------|
| **sensors.py** | `_normalize_subzone_id()` (Zeile 83–96) | `None`, `""`, `"__none__"` (nach strip) → `None`; sonst `v` zurück |
| **sensors.py** | `create_or_update_sensor` (Zeile 621–633) | `subzone_id_val = _normalize_subzone_id(request.subzone_id)`; wenn truthy → `assign_subzone`, sonst → `remove_gpio_from_all_subzones` |
| **sensors.py** | PATCH-Update (Zeile 822–834) | Gleiche Logik wie create |
| **actuators.py** | `create_or_update_actuator` (Zeile 505–516) | **Kein `_normalize_subzone_id`!** Direkt `if request.subzone_id:` — `"__none__"` wäre truthy → würde Subzone `"__none__"` anlegen |

---

## 2. Sentinel-Dokumentation (Schritt 2)

| Kontext | Wert bei „Keine Subzone“ | Wo gesetzt? | Was an API? |
|---------|--------------------------|-------------|-------------|
| **AddSensorModal** („Keine Subzone“) | `null` | SubzoneAssignmentSection Dropdown | `emit('update:modelValue', null)` → esp.ts: `null` ✓ |
| **AddSensorModal** (Subzone gewählt) | `subzone_id` als String | SubzoneAssignmentSection Dropdown | esp.ts: `normalizeSubzoneId()` → API ✓ |
| **AddActuatorModal** („Keine Subzone“) | `null` | SubzoneAssignmentSection Dropdown | `emit('update:modelValue', null)` → esp.ts: `null` ✓ |
| **AddActuatorModal** (Subzone gewählt) | `subzone_id` als String | SubzoneAssignmentSection Dropdown | esp.ts: `normalizeSubzoneId()` → API ✓ |
| **SubzoneAssignmentSection** | `NONE_OPTION = "__none__"` (nur Anzeige) | Intern für Select | Setter emittiert **immer `null`** bei Auswahl „Keine Subzone“ ✓ |
| **SensorConfigPanel** handleSave | `subzoneId.value` | Nach v-model | Explizit: `__none__`/null/'' → `null` ✓ |
| **ActuatorConfigPanel** handleSave | `subzoneId.value \|\| null` | Nach v-model | SubzoneAssignmentSection emittiert null; **keine defensive Normalisierung** |

---

## 3. Datenbank-Semantik (Schritt 3)

| Frage | Antwort |
|-------|---------|
| **Wo wird „Keine Subzone“ gespeichert?** | GPIO erscheint in **keiner** Zeile von `subzone_configs.assigned_gpios` für diesen `esp_id` |
| **parent_zone_id** | Subzone-Zeilen gehören zur Zone des ESPs (`parent_zone_id` = Zone des ESPs) |
| **„Keine“ =** | GPIO aus allen Subzonen des ESPs entfernt via `remove_gpio_from_all_subzones(esp_id, gpio)` |
| **Monitor L2** | `monitor_data_service.py`: GPIO nicht in `gpio_to_subzone` → `(None, "Keine Subzone")` (Zeile 119) |
| **SubzoneGroup** | `subzone_id=None`, `subzone_name="Keine Subzone"` (schemas/monitor.py Zeile 46) |

---

## 4. UI/UX — Verwirrungsquellen (Schritt 4)

| Stelle | Potenzielle Verwirrung | Empfehlung |
|--------|------------------------|------------|
| **Initial: Dropdown** | SubzoneAssignmentSection wie Config-Panel — „Keine Subzone“ + bestehende Subzonen + „Neue Subzone erstellen“ | ✅ Implementiert (Auftrag 3, 2026-03-05) |
| **Initial vs. Config: Einheitliche UI** | Beide nutzen SubzoneAssignmentSection (Dropdown) | ✅ Konsistent |
| **Config: Dropdown „Keine Subzone“** | Sentinel `__none__` nur für Anzeige; SubzoneAssignmentSection emittiert korrekt `null` | Keine Änderung nötig; SensorConfigPanel hat bereits defensive Normalisierung |
| **ActuatorConfigPanel** | Keine `__none__`-Normalisierung — falls irgendwo `__none__` ins ref gelangt, würde an API gehen | Defensive Normalisierung für Konsistenz hinzufügen |
| **esp.ts** | `config.subzone_id \|\| null` lässt `"__none__"` durch | Normalisierung vor API-Call: `"__none__"` → `null` |

---

## 5. Empfehlung (Schritt 5)

1. **Einheitliche API-Semantik:** „Keine Subzone“ = **null** (oder fehlendes Feld). Nie `"__none__"` oder `""` an Backend senden.
2. **Frontend-Normalisierung:** Vor jedem API-Call: `(val === '__none__' \|\| val === '' \|\| val == null) ? null : val`
3. **SubzoneAssignmentSection:** Bereits korrekt — bei Auswahl „Keine Subzone“ wird `null` emittiert; `__none__` ist nur für HTML-Select-Anzeige.
4. **Backend defensiv:** `actuators.py` sollte `_normalize_subzone_id` nutzen (wie sensors.py) — `"__none__"`, `""`, `None` → `remove_gpio_from_all_subzones`
5. **esp.ts:** `addSensor` und `addActuator` sollten `subzone_id` normalisieren, bevor `realConfig` gebaut wird.

---

## 6. Priorisierte Fix-Liste

| Nr. | Datei | Änderung | Priorität | Status |
|-----|-------|----------|-----------|--------|
| 1 | **actuators.py** | `_normalize_subzone_id()` (analog sensors.py) einführen; vor Subzone-Zuweisung aufrufen | **HOCH** — Bug: `"__none__"` würde Subzone anlegen | ✅ 2026-03-05 |
| 2 | **esp.ts** | `addSensor` und `addActuator`: `subzone_id` normalisieren, z.B. `(config.subzone_id === '__none__' \|\| config.subzone_id === '' \|\| config.subzone_id == null) ? null : config.subzone_id` | **HOCH** | - |
| 3 | **ActuatorConfigPanel.vue** | `handleSave`: `subzone_id` wie SensorConfigPanel normalisieren (Block B1) | **MITTEL** — Defense in Depth | - |
| 4 | **AddSensorModal.vue** / **AddActuatorModal.vue** | Freitext durch SubzoneAssignmentSection ersetzen (Dropdown) | **NIEDRIG** — UX-Verbesserung | ✅ 2026-03-05 |

---

## Anhang: Relevante Code-Zitate

### sensors.py / actuators.py: normalize_subzone_id (utils/subzone_helpers.py)
```python
def normalize_subzone_id(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    v = value.strip()
    if v in ("", "__none__"):
        return None
    return v
```

### actuators.py: Normalisierung (seit 2026-03-05)
```python
subzone_id_val = normalize_subzone_id(request.subzone_id)
if subzone_id_val:
    await subzone_service.assign_subzone(...)
else:
    await subzone_service.remove_gpio_from_all_subzones(esp_id, gpio)
```

### SubzoneAssignmentSection: Korrekte Emit-Logik
```typescript
const emitted = v === NONE_OPTION || v == null || v === '' ? null : String(v)
emit('update:modelValue', emitted)
```

### SensorConfigPanel: Explizite Normalisierung (Block B1)
```typescript
config.subzone_id =
  rawSubzone === '__none__' || rawSubzone == null || rawSubzone === ''
    ? null
    : rawSubzone
```
