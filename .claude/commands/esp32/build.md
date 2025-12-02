---
description: Build ESP32 Firmware für XIAO oder ESP32 Dev
---

# ESP32 Firmware Build

Baue die El Trabajante ESP32 Firmware für das gewählte Environment.

## Aufgabe

1. **Environment auswählen:**
   - Zeige verfügbare Environments aus platformio.ini
   - Frage welches Environment gebaut werden soll (falls nicht spezifiziert)
   - Standard: `seeed_xiao_esp32c3`

2. **Build durchführen:**
   ```bash
   cd "El Trabajante"
   pio run -e <environment>
   ```

3. **Ergebnisse anzeigen:**
   - Build-Status (Success/Failed)
   - Binary-Größe und Flash-Auslastung
   - RAM-Nutzung (falls verfügbar)
   - Warnungen oder Fehler

4. **Nächste Schritte zeigen:**
   - Upload-Command: `pio run -e <env> -t upload`
   - Monitor-Command: `pio device monitor`
   - Test-Command: `pio test -e <env>`

## Verfügbare Environments

- **seeed_xiao_esp32c3**: XIAO ESP32-C3 (10 Sensoren, 6 Aktoren, limitierter Flash)
- **esp32_dev**: ESP32 Dev Board (20 Sensoren, 12 Aktoren, mehr Ressourcen)

## Wichtige Build-Flags

Beide Environments haben folgende Features aktiviert:
- `DYNAMIC_LIBRARY_SUPPORT=1` - OTA Library Support
- `HIERARCHICAL_ZONES=1` - Zone-System
- `OTA_LIBRARY_ENABLED=1` - OTA Updates
- `SAFE_MODE_PROTECTION=1` - GPIO Safe-Mode
- `ZONE_MASTER_ENABLED=1` - Zone-Master
- `CONFIG_ENABLE_THREAD_SAFETY` - Thread-Safety (Phase 6+)

## Environment-Spezifische Limits

**Quelle:** `El Trabajante/platformio.ini`

| Flag | XIAO ESP32-C3 | ESP32 Dev | Bedeutung |
|------|---------------|-----------|-----------|
| **MAX_SENSORS** | 10 | 20 | Max. Anzahl Sensoren gleichzeitig |
| **MAX_ACTUATORS** | 6 | 12 | Max. Anzahl Aktoren gleichzeitig |
| **MAX_LIBRARY_SIZE** | 32768 | 65536 | OTA Library Buffer-Größe |
| **MQTT_MAX_PACKET_SIZE** | 1024 | 2048 | Max. MQTT-Message-Größe |
| **CORE_DEBUG_LEVEL** | 2 | 3 | Arduino Core Debug-Level |

**Warum unterschiedlich?**
- XIAO ESP32-C3 hat weniger Flash/RAM → Konservativere Limits
- ESP32 Dev hat mehr Ressourcen → Höhere Parallelität möglich

**Anpassen:**
```ini
# platformio.ini - Environment-spezifisch
[env:seeed_xiao_esp32c3]
build_flags =
    ${common.build_flags}
    -DXIAO_ESP32C3_MODE=1
    -DMAX_SENSORS=10  # ← Hier anpassen falls nötig
```

## Bei Fehlern

- Prüfe ob PlatformIO installiert ist: `pio --version`
- Zeige detaillierte Fehler-Meldungen
- Schlage Lösungen vor
- Prüfe ob Dependencies fehlen
