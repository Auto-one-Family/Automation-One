# Wokwi ESP - Kritischer Fehler Analyse

**Datum:** 2026-01-11  
**Zeit:** ~02:10 Uhr  
**Status:** 🔴 **KRITISCH - Watchdog Timeout führt zu Reboot-Loop**

---

## 🔴 Gefundener Fehler

### Watchdog Timeout - Reboot-Loop

**Fehlermeldung:**
```
Guru Meditation Error: Core 0 panic'ed (Interrupt wdt timeout on CPU0).
```

**Problem:**
- ESP32 Watchdog-Timer (WDT) läuft ab
- System hängt und kann nicht weiter booten
- Automatischer Neustart (Reboot-Loop)
- Reset-Typ: `TG1WDT_SYS_RESET` (Watchdog Reset)

---

## 📋 Log-Analyse

**Boot-Sequenz:**
1. ✅ ESP32 Boot (POWERON_RESET)
2. ✅ Flash-Loading erfolgreich
3. ❌ **FEHLER:** Watchdog Timeout nach ~6 Sekunden
4. ❌ **AUTOMATISCHER NEUSTART**

**Pattern:**
- Boot startet normal
- Nach ca. 6 Sekunden: Watchdog Timeout
- System reboots automatisch
- Loop wiederholt sich

---

## 🔍 Mögliche Ursachen

### 1. Watchdog nicht konfiguriert
- Watchdog sollte innerhalb von 30 Sekunden gefüttert werden
- In Wokwi-Simulation wird Watchdog möglicherweise übersprungen

### 2. Blockierende Operation
- Eine blockierende Operation hält den Main-Loop auf
- Watchdog kann nicht gefüttert werden
- Timeout nach 30 Sekunden (Standard)

### 3. Initialisierungs-Fehler
- Eine Initialisierungs-Funktion hängt
- System kommt nicht zum Main-Loop
- Watchdog läuft ab

### 4. Wokwi-Simulation-Limit
- Wokwi könnte Watchdog anders handhaben
- Simulation-Limits könnten Problem sein

---

## 🔧 Erwartetes vs. Tatsächliches Verhalten

### Erwartet:
1. Boot-Sequenz
2. Watchdog wird konfiguriert (30s Timeout)
3. GPIO Safe-Mode
4. Logger init
5. WiFi connect
6. MQTT connect
7. System READY

### Tatsächlich:
1. Boot startet
2. Nach ~6 Sekunden: Watchdog Timeout
3. Reboot
4. Loop

---

## 📊 Log-Statistik

- **Fehler:** 1x Watchdog Timeout
- **Reboots:** Mehrfach (Loop)
- **Boot-Dauer bis Fehler:** ~6 Sekunden
- **Reset-Typ:** `TG1WDT_SYS_RESET` (Watchdog)

---

## ⚠️ Kritikalität

🔴 **SEHR HOCH**
- System kann nicht booten
- Funktionalität komplett blockiert
- Reboot-Loop verhindert normale Operation

---

## 🔧 Nächste Schritte

1. **Logs weiter überwachen** - Vielleicht stabilisiert sich das System
2. **Watchdog-Konfiguration prüfen** - Sollte in Wokwi-Simulation angepasst werden
3. **Code-Analyse** - Blockierende Operationen finden
4. **Wokwi-spezifische Fixes** - Watchdog in Simulation anders handhaben

---

**Erstellt:** 2026-01-11 02:10 Uhr  
**Quelle:** `El Trabajante/logs/wokwi_serial.log`


