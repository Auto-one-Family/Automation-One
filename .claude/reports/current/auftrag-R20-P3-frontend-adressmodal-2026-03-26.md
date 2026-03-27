# Auftrag R20-P3 — Frontend Store: I2C-Adresse wird ignoriert

**Typ:** Bugfix — Frontend (El Frontend)
**Schwere:** HIGH
**Erstellt:** 2026-03-26
**Ziel-Agent:** frontend-dev (`.claude/agents/frontend/frontend_dev_agent.md`)
**Aufwand:** ~15-30min (2 Zeilen in 2 Dateien)
**Abhaengigkeit:** Kann unabhaengig umgesetzt werden; sinnvollerweise nach R20-P1 testen

---

## Hintergrund und Root Cause

Das `AddSensorModal` (`El Frontend/src/components/esp/AddSensorModal.vue`) ermoeglicht
dem User das Hinzufuegen neuer Sensoren zu einem ESP. Der Server-Endpoint
`POST /api/v1/sensors/{esp_id}/{gpio}` erwartet im Body u.a.:
- `i2c_address` (Integer) fuer I2C-Sensoren (z.B. SHT31: 0x44=68 oder 0x45=69)
- `onewire_address` (String, ROM-Code) fuer OneWire-Sensoren

**Das UI ist bereits korrekt implementiert:**
- I2C-Dropdown existiert (`AddSensorModal.vue:462-471`, `selectedI2CAddress` ref, `getI2CAddressOptions()`)
- OneWire ROM-Code wird in `addMultipleOneWireSensors()` korrekt uebergeben (Zeile 338-344)

**Der eigentliche Bug sitzt im Store-Layer (`stores/esp.ts:706`):**

```typescript
// esp.ts:706 — BUG: config.i2c_address wird IGNORIERT
i2c_address: interfaceType === 'I2C' ? defaultI2CAddress : null,
```

Egal was der User im Dropdown waehlt — der Store nutzt immer `getDefaultI2CAddress()`
(= 0x44 fuer SHT31). Die vom Modal uebergebene `config.i2c_address` wird verworfen.

Zusaetzlich fehlt das Feld `i2c_address` im TypeScript-Type `MockSensorConfig`
(`types/index.ts:370-387`), was den Durchreichpfad unterbricht.

**Indiz aus Server-Logs:**
```
POST /api/v1/sensors/.../0  {"sensor_type": "sht31_temp"}  ← kein i2c_address im Body
```

---

## IST-Zustand

**2 Dateien betroffen:**

| Datei | Zeile | Bug |
|-------|-------|-----|
| `El Frontend/src/stores/esp.ts` | 706 | `i2c_address` hardcoded auf Default statt aus `config` gelesen |
| `El Frontend/src/types/index.ts` | 370-387 | `MockSensorConfig` hat kein Feld `i2c_address` |

**NICHT betroffen (bereits korrekt implementiert):**
- `AddSensorModal.vue` — I2C-Dropdown funktioniert, OneWire ROM-Code wird uebergeben
- OneWire-Pfad — `addMultipleOneWireSensors()` setzt `onewire_address: romCode` korrekt
- Store OneWire-Pfad — `esp.ts:708`: `onewire_address: config.onewire_address || null` nutzt config-Wert

---

## SOLL-Zustand

### Fix 1 — Type erweitern

**Datei:** `El Frontend/src/types/index.ts`, Interface `MockSensorConfig` (Zeile 370-387)

Feld hinzufuegen:
```typescript
i2c_address?: number | null
```

### Fix 2 — Store: config.i2c_address nutzen

**Datei:** `El Frontend/src/stores/esp.ts`, Zeile 706

```typescript
// VORHER (Bug — Default wird immer genutzt):
i2c_address: interfaceType === 'I2C' ? defaultI2CAddress : null,

// NACHHER (Fix — Modal-Wert hat Vorrang, Default als Fallback):
i2c_address: interfaceType === 'I2C' ? (config.i2c_address ?? defaultI2CAddress) : null,
```

### Verifizieren

Nach dem Fix pruefen dass der API-Request im Browser DevTools Network-Tab korrekt aussieht:

```json
{
  "sensor_type": "sht31_temp",
  "name": "SHT31 Aussen",
  "i2c_address": 69
}
```

Wenn der User im Dropdown 0x45 waehlt, muss `69` (Dezimalwert) im Request-Body erscheinen.

---

## Einschraenkungen

- Keine Aenderungen am Backend-API-Schema
- Keine Aenderungen an der HardwareView-Routing-Logik (3-Level)
- Keine Aenderungen am AddSensorModal UI (Dropdown existiert bereits)
- OneWire-Pfad nicht anfassen (funktioniert bereits)

---

## Akzeptanzkriterien

- [ ] I2C: User waehlt 0x45 im Dropdown → API-Request enthaelt `i2c_address: 69`
- [ ] I2C: Ohne Auswahl (Default) → API-Request enthaelt `i2c_address: 68` (0x44)
- [ ] OneWire: ROM-Code aus Scan wird weiterhin korrekt als `onewire_address` gesendet (Regression-Check)
- [ ] Analog-/Digital-Sensoren ohne Adresse funktionieren weiterhin
- [ ] `npm run build` ohne neue Fehler
- [ ] TypeScript-Typen korrekt (keine `any` fuer `i2c_address`)

---

> Erstellt von: automation-experte Agent
> Begleitender Server-Fix: R20-P1 (Server Sensor-CRUD Adress-Lookup)
> Begleitender Firmware-Fix: R20-P2 (ESP32 findSensorConfig adressbasiert)
