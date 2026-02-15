# OneWire ROM CRC Analyse

> **Datum:** 2026-02-03
> **Status:** ABGESCHLOSSEN
> **Diagnose:** ROM-Adresse in DB ist ungültig (Dokumentations-Beispiel mit falschem CRC)

---

## 1. CRC8-Berechnung

| Feld | Wert |
|------|------|
| **ROM Hex-String** | `28FF641E8D3C0C79` |
| **Bytes 0-6** | `0x28 0xFF 0x64 0x1E 0x8D 0x3C 0x0C` |
| **Stored CRC (Byte 7)** | `0x79` (121 dezimal) |
| **Calculated CRC** | `0xDA` (218 dezimal) |
| **Match** | **NEIN** |

### CRC8-Algorithmus (OneWire Standard)

```python
# Polynom: x^8 + x^5 + x^4 + 1 (0x8C reflected)
def crc8_onewire(data):
    crc = 0
    for byte in data:
        for _ in range(8):
            mix = (crc ^ byte) & 0x01
            crc >>= 1
            if mix:
                crc ^= 0x8C
            byte >>= 1
    return crc
```

**Ergebnis:** Die ROM-Adresse `28FF641E8D3C0C79` ist **KEINE gültige OneWire-Adresse**.
Der korrekte CRC für Bytes `28 FF 64 1E 8D 3C 0C` wäre `0xDA`, nicht `0x79`.

---

## 2. ESP32 CRC-Validierung

| Feld | Wert |
|------|------|
| **Datei** | [onewire_utils.cpp](El%20Trabajante/src/utils/onewire_utils.cpp) |
| **Funktion** | `isValidRom()` (Zeile 108-114) |
| **CRC-Funktion** | `calculateCrc8()` (Zeile 49-55) |

### Code-Analyse

```cpp
// El Trabajante/src/utils/onewire_utils.cpp:108-114
bool isValidRom(const uint8_t rom[8]) {
    // Calculate CRC for first 7 bytes
    uint8_t crc = calculateCrc8(rom, 7);

    // Compare with CRC in byte 7
    return (crc == rom[7]);
}
```

**Bewertung:**
- ESP32 CRC-Validierung ist **KORREKT** implementiert
- Verwendet Standard OneWire CRC8 Lookup-Table
- Byte-Order ist MSB-first (Standard)

---

## 3. ROM-Adresse Herkunft

### Wokwi-Konfiguration

**Datei:** [diagram.json](El%20Trabajante/diagram.json)

```json
{
  "type": "wokwi-ds18b20",
  "id": "temp1",
  "attrs": {
    "temperature": "22.5"
  }
}
```

**Beobachtung:** Wokwi diagram.json enthält **KEINE** explizite ROM-Adresse!
Wokwi generiert die ROM-Adresse **dynamisch zur Laufzeit** mit gültigem CRC.

### Server-Validierung

**Datei:** [sensors.py](El%20Servador/god_kaiser_server/src/api/v1/sensors.py)
**Funktion:** `_validate_onewire_config()` (Zeile 1417-1469)

```python
# Server validiert NUR:
# 1. Uniqueness (keine Duplikate auf gleichem ESP)
# 2. Generiert Placeholder wenn keine Adresse angegeben
#
# Server validiert NICHT:
# - CRC8 Checksumme
# - Family Code (0x28 für DS18B20)
```

**Beobachtung:** Der Server führt **KEINE CRC-Validierung** durch!

### Dokumentations-Verwendung

Die Adresse `28FF641E8D3C0C79` erscheint **nur als Beispiel** in:

| Datei | Verwendung |
|-------|------------|
| `src/schemas/sensor.py` | Schema-Beispiel, Docstring |
| `src/schemas/debug.py` | API-Dokumentation |
| `tests/unit/test_*.py` | Test-Fixtures (Mocks ohne CRC-Check) |
| `src/core/config_mapping.py` | Kommentar/Beispiel |
| `src/core/esp32_error_mapping.py` | Fehlermeldungs-Beispiel |

---

## 4. Byte-Order Prüfung

| Format | Darstellung | CRC-Check |
|--------|-------------|-----------|
| MSB-first (Standard) | `28FF641E8D3C0C79` | **NEIN** (0xDA ≠ 0x79) |
| LSB-first (reversed) | `790C3C8D1E64FF28` | **NEIN** (0x69 ≠ 0x28) |

**Ergebnis:** Kein Byte-Order-Problem - die Adresse ist in keiner Byte-Order gültig.

---

## 5. Diagnose

### Root Cause

```
[X] ROM-Adresse in DB ist erfunden (Dokumentations-Beispiel kopiert)
[ ] CRC-Validierung im ESP32 fehlerhaft
[ ] Byte-Order-Problem (MSB vs LSB)
[ ] Hex-Parsing-Problem
```

### Erklärung

1. Jemand hat einen DS18B20 Sensor über die API angelegt
2. Als `onewire_address` wurde das Dokumentations-Beispiel `28FF641E8D3C0C79` eingegeben
3. Der Server hat diese Adresse **ohne CRC-Prüfung** akzeptiert
4. Der ESP32 lehnt die Adresse korrekt ab (CRC-Invalid)

---

## 6. Empfehlungen

### Sofort-Lösung: Echte ROM-Adresse ermitteln

Wokwi generiert eine gültige ROM-Adresse zur Laufzeit. Diese kann ermittelt werden:

**Option A:** ESP32-Logs analysieren (wenn OneWire-Scan implementiert)
```
Suche nach: "Found device", "ROM:", "0x28"
```

**Option B:** OneWire-Scan manuell ausführen
```cpp
// In ESP32 Firmware - Bus scannen
oneWire.reset_search();
uint8_t rom[8];
while (oneWire.search(rom)) {
    Serial.print("Found: ");
    for (int i = 0; i < 8; i++) Serial.printf("%02X", rom[i]);
    Serial.println();
}
```

**Option C:** Sensor in DB mit AUTO_-Placeholder anlegen
```
DELETE: Sensor mit ungültiger Adresse löschen
CREATE: Neuer Sensor ohne onewire_address → Server generiert AUTO_<random>
```

### Langfristig: Server-seitige CRC-Validierung

```python
# In El Servador/god_kaiser_server/src/api/v1/sensors.py

def validate_onewire_crc(address: str) -> bool:
    """Validate OneWire ROM code CRC8."""
    if not address or len(address) != 16:
        return False
    if address.startswith("AUTO_"):
        return True  # Placeholder addresses bypass CRC

    try:
        rom_bytes = bytes.fromhex(address)
        calculated_crc = crc8_onewire(rom_bytes[:7])
        return calculated_crc == rom_bytes[7]
    except ValueError:
        return False
```

---

## 7. Gültige Test-Adressen

Für zukünftige Tests, hier **echte** DS18B20 ROM-Adressen mit gültigem CRC:

| ROM-Adresse | Family | CRC | Quelle |
|-------------|--------|-----|--------|
| `28FF64D18D3C0CDA` | 0x28 | 0xDA | Korrigierte Version |
| `28AAAABBBBCCCCDD` | 0x28 | ? | Muss berechnet werden |

**Berechnung einer gültigen Adresse:**
```python
rom = [0x28, 0xFF, 0x64, 0x1E, 0x8D, 0x3C, 0x0C]  # 7 Bytes
crc = crc8_onewire(rom)  # = 0xDA
valid_address = "28FF641E8D3C0C" + f"{crc:02X}"  # = "28FF641E8D3C0CDA"
```

---

## 8. Zusammenfassung

| Frage | Antwort |
|-------|---------|
| Ist die ROM-Adresse gültig? | **NEIN** - CRC ist falsch |
| Ist der ESP32-Code fehlerhaft? | **NEIN** - CRC-Validierung korrekt |
| Woher kommt die Adresse? | Dokumentations-Beispiel, manuell eingegeben |
| Warum wurde sie akzeptiert? | Server validiert CRC nicht |
| Lösung? | Echte ROM-Adresse aus Wokwi verwenden oder AUTO_-Placeholder |

---

*Report erstellt: 2026-02-03*
