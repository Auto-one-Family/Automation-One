# ESP32 Offline-Rule-Persistierung nach Power-Cycle — Praxisbeispiele und Best Practices

**Datum:** 2026-03-31
**Bereich:** IoT-Technik / AutomationOne Safety
**Quellen:** 22 Quellen ausgewertet (Plattform-Dokumentation, Espressif Dev Portal, Community-Diskussionen)
**Anlass:** SAFETY-RTOS-IMPL Auftrag — Luecke: Offline-Rules (P4) leben nur im RAM. Bei ESP-Stromverlust + Server-Down = keine lokale Logik nach Reboot. Wie persistieren professionelle IoT-Systeme lokale Regeln?

---

## Zusammenfassung

Die zentrale Frage lautet: Wenn der Server abstuerzt, kann der ESP lokal die Logik weiterfuehren (SAFETY-P4 Offline-Hysterese). Aber was passiert, wenn der ESP selbst abgesteckt wird und wieder angesteckt — RAM futsch, Server immer noch down? Dann steht der ESP "nackt" da ohne Regeln.

Die Recherche ueber Tasmota, ESPHome, Shelly Gen2/Gen3, AWS IoT Greengrass und Espressifs eigene Best Practices zeigt: **Jede ernstzunehmende Plattform persistiert lokale Automatisierungsregeln in Flash-Speicher (NVS oder Dateisystem), so dass sie nach Power-Cycle SOFORT verfuegbar sind — auch ohne Server-Verbindung.** Das ist kein Nice-to-Have, sondern Standard-Praxis.

Die Implementierungsstrategien unterscheiden sich je nach Komplexitaet der Regeln:

1. **Tasmota** speichert Rules direkt in Flash. Sie ueberleben jeden Reboot. Variablen gibt es in zwei Klassen: `Var` (RAM-only, leer nach Boot) und `Mem` (Flash-persistiert, ueberlebt Reboot). `PowerOnState` bestimmt pro Relay den Zustand nach Stromausfall. Das ist ein schlankes, bewaehrtes Modell.

2. **ESPHome** nutzt das ESP32-NVS ueber das `globals`-Komponenten-System. Variablen mit `restore_value: true` werden in NVS geschrieben und beim Boot zurueckgelesen. Der `flash_write_interval` (Default: 60s) steuert, wie oft Aenderungen tatsaechlich in Flash geschrieben werden — Kompromiss zwischen Datensicherheit und Flash-Wear. Automationen selbst sind direkt in die kompilierte Firmware eingebettet (C++), nicht dynamisch ladbar. Das ist der Hauptunterschied zu AutomationOne: ESPHome-Regeln sind zur Kompilierzeit fest, AutomationOne-Regeln kommen dynamisch vom Server.

3. **Shelly Gen2/Gen3** speichert Scripts im Flash des ESP32. Scripts mit "Start on boot" starten automatisch nach Power-Cycle. Die mJS-Engine (Minimal JavaScript) fuehrt sie lokal aus. Shelly hat zudem einen KVS (Key-Value Store) fuer persistente Daten innerhalb von Scripts.

4. **Espressif selbst** (Blog 2025) demonstriert sogar NVS-Lesen im Bootloader — der LED-Zustand wird VOR der Applikation wiederhergestellt, mit verschluesseltem NVS. Das zeigt: NVS-basierte State-Restoration ist die von Espressif empfohlene Strategie.

5. **AWS IoT Greengrass** nutzt "Local Shadow" — eine lokale Kopie des Device-States die in Flash persistiert wird. Bei Connectivity Loss interagieren Components mit dem lokalen Shadow. Bei Reconnect synchronisiert Greengrass automatisch (Desired vs. Reported State Reconciliation). Das ist architektonisch am naechsten an AutomationOnes Offline-Rules.

**Kernfolgerung fuer AutomationOne:** Die Offline-Rules MUESSEN in NVS persistiert werden. Der Flow ist:
1. Server sendet `offline_rules` via Config-Push
2. ESP speichert in RAM (wie bisher) UND in NVS (NEU)
3. Bei Boot: ESP laedt Offline-Rules aus NVS in den OfflineModeManager
4. ESP startet sofort im Offline-Mode wenn kein MQTT verfuegbar
5. Bei Server-Reconnect: Server sendet aktualisierte Rules → ESP aktualisiert RAM + NVS

---

## 1. Plattform-Vergleich: Wie wird persistiert?

### Tasmota — Rules in Flash, Mem-Variablen persistiert

Tasmota speichert Rules als Text direkt in den Flash-Einstellungen des ESP. Drei Rule-Slots (Rule1, Rule2, Rule3) mit je 512 Bytes (ESP8266) bzw. 4096 Bytes (ESP32). Rules ueberleben Reboot und Firmware-Update.

**Variablen-Persistenz:**
- `Var1`-`Var16`: RAM-only, leer nach Reboot — fuer temporaere Berechnung
- `Mem1`-`Mem16`: Flash-persistiert, ueberlebt Reboot — fuer Zustandsspeicherung

**PowerOnState** bestimmt den Relay-Zustand nach Stromausfall:
- `0` = OFF (sicherster Default)
- `3` = Letzten gespeicherten Zustand wiederherstellen
- Die Einstellung selbst ist persistiert

**Boot-Sequenz mit Rules:**
1. Flash-Einstellungen laden (inkl. Rules, Mem-Variablen, PowerOnState)
2. WiFi verbinden (oder AP-Mode)
3. MQTT verbinden (oder offline bleiben)
4. Rules auswerten — inkl. `System#Boot`-Trigger (laeuft IMMER, auch ohne MQTT)
5. Bei MQTT-Verbindung: Server-Befehle empfangen; ohne MQTT: lokale Rules laufen weiter

**Relevanz fuer AutomationOne:** Das Tasmota-Modell zeigt: Regeltext in Flash + typisierte persistente Variablen + konfigurierbarer Boot-Zustand pro Aktor = alles was man braucht. AutomationOnes `offline_rules` (max 8, Hysterese-Structs) sind deutlich einfacher als Tasmota-Rules-Text. NVS-Blob-Persistierung ist hier der richtige Weg.

### ESPHome — NVS-Globals + kompilierte Automationen

ESPHome-Automationen sind C++ zur Compile-Zeit. Sie koennen NICHT dynamisch vom Server geladen werden. Was ESPHome aber bietet:

**Globals mit `restore_value: true`:**
```yaml
globals:
  - id: my_counter
    type: int
    restore_value: true
    initial_value: '0'
```
Wird in ESP32-NVS gespeichert. Bei Boot wird der letzte Wert geladen. `flash_write_interval` (Default: 60s) bestimmt die Schreib-Frequenz.

**Switch `restore_mode`:**
- `ALWAYS_OFF` / `ALWAYS_ON` — deterministisch nach Boot
- `RESTORE_DEFAULT_OFF` — versucht letzten Zustand (NVS), Fallback OFF
- `RESTORE_DEFAULT_ON` — versucht letzten Zustand (NVS), Fallback ON

**Boot-Sequenz:**
1. NVS lesen → Globals und Switch-States wiederherstellen
2. WiFi verbinden (mit Timeout)
3. API/MQTT verbinden
4. Automationen starten (laufen IMMER, auch offline)
5. `on_boot` Trigger feuert (konfigurierbare Prioritaet)

**Relevanz fuer AutomationOne:** Das `restore_value`-Pattern ist direkt uebertragbar. AutomationOne kann Offline-Rules als NVS-Blob speichern und beim Boot restoren. Der Unterschied: ESPHome-Automationen sind Firmware-eingebettet, AutomationOne muss dynamisch geladene Rules nach dem Restore aktivieren.

### Shelly Gen2/Gen3 — Scripts im Flash, KVS fuer State

Shelly speichert Scripts (mJS JavaScript) direkt im Flash. Konfiguration "Start on boot" = Script startet automatisch nach Power-Cycle.

**Persistenz-Mechanismen:**
- Script-Code: Im Flash gespeichert, ueberlebt alles ausser Factory Reset
- KVS (Key-Value Store): `Shelly.setComponentConfig()` + `Shelly.getComponentConfig()` — persistenter Konfigurationsspeicher
- Script-Variablen: Standardmaessig NICHT persistiert — muessen explizit in KVS geschrieben werden

**Boot-Sequenz:**
1. Firmware laden
2. Konfiguration laden (WiFi, MQTT, Component Configs)
3. Scripts mit "Start on boot" starten
4. WiFi verbinden
5. MQTT/Cloud verbinden (oder offline bleiben)
6. Scripts laufen weiter — unabhaengig von Konnektivitaet

**Relevanz fuer AutomationOne:** Shellys Modell ist dem von AutomationOne am aehnlichsten: Dynamisch geladene Regeln (Scripts) + persistenter KVS + "Start on boot". AutomationOne braucht kein JavaScript — die vereinfachten Hysterese-Rules als Struct in NVS sind das Aequivalent.

### AWS IoT Greengrass — Local Shadow mit Persist

**Shadow-Modell:**
- Jedes Geraet hat einen "Shadow" — JSON-Dokument mit `desired` + `reported` State
- Shadow wird LOKAL persistiert (in Flash/Disk)
- Bei Disconnect: Components lesen/schreiben den LOKALEN Shadow
- Bei Reconnect: Shadow-Sync — Server sendet `desired`, Geraet sendet `reported`, Delta-Reconciliation

**Relevanz fuer AutomationOne:** Das Shadow-Konzept ist konzeptuell das was AutomationOne braucht: Der Server definiert `desired` (Offline-Rules), der ESP speichert sie lokal. Bei Disconnect arbeitet der ESP mit der lokalen Kopie. Bei Reconnect wird verglichen und ggf. aktualisiert.

---

## 2. NVS vs SPIFFS vs LittleFS — Welche Speicherstrategie?

### NVS (Non-Volatile Storage) — EMPFOHLEN fuer AutomationOne Offline-Rules

| Eigenschaft | NVS |
|-------------|-----|
| **Datenmodell** | Key-Value Pairs + Blobs (bis 508KB) |
| **Power-Loss-Schutz** | Ja — CRC-Checksum pro Eintrag, inkomplette Writes werden verworfen |
| **Wear Leveling** | Ja — Log-basiertes Dateisystem, automatisch |
| **RAM-Overhead** | Minimal (~20 Bytes pro offenen Handle) |
| **Zugriffs-API** | `nvs_get_blob()` / `nvs_set_blob()` + `nvs_commit()` |
| **Ideal fuer** | Kleine, haeufig wechselnde Key-Value-Daten < 4KB |
| **Partition Size** | Typisch 16-32KB (AutomationOne: 32KB nach M0) |

**Warum NVS fuer Offline-Rules:**
- AutomationOnes Offline-Rules sind max. 8 Regeln × ~60 Bytes = ~480 Bytes — perfekt fuer NVS
- NVS wird bereits fuer Sensor/Aktor-Configs genutzt — keine neue Infrastruktur noetig
- CRC-Schutz bei Power-Loss = Daten sind entweder komplett oder gar nicht da
- Sehr schneller Zugriff beim Boot (keine Dateisystem-Initialisierung noetig)

### SPIFFS — NICHT empfohlen

- **Veraltet** (nicht mehr maintained, Espressif empfiehlt LittleFS)
- Kein Verzeichnis-Support
- Schlechterer Power-Loss-Schutz als NVS oder LittleFS
- Langsamer als LittleFS

### LittleFS — Fuer groessere Datenmengen

- Besser als SPIFFS (aktiv maintained, echte Verzeichnisse, besseres Wear Leveling)
- Macht Sinn wenn Rules als JSON-Dateien gespeichert werden sollen (>4KB)
- Fuer AutomationOnes 8 Hysterese-Rules ueberdimensioniert — NVS reicht

### Empfehlung

**NVS-Blob fuer die Offline-Rules.** Das ist konsistent mit der bestehenden Sensor/Aktor-Config-Persistierung und fuegt keine neue Abhaengigkeit hinzu. Die Datengroesse (max ~480 Bytes + Versionierung) liegt weit im NVS-Sweet-Spot.

---

## 3. Konkrete Implementierungsstrategie fuer AutomationOne

### NVS-Schema fuer Offline-Rules

```cpp
// Bestehendes NVS-Schema Sensor (Referenz):
// sen_{i}_gpio, sen_{i}_type, sen_{i}_name, sen_{i}_sz, sen_{i}_act, etc.

// IMPLEMENTIERTES NVS-Schema (Namespace: "offline") — Individual-Keys-Variante
// [Korrektur 2026-03-31: Blob-Empfehlung wurde nicht umgesetzt — Individual Keys implementiert]
// Key: "ofr_count"      (uint8_t)  — Anzahl gespeicherter Rules (0-8)
// Key: "ofr_{i}_en"     (uint8_t)  — Rule i enabled (1) oder not (0)
// Key: "ofr_{i}_agpio"  (uint8_t)  — Aktor-GPIO
// Key: "ofr_{i}_sgpio"  (uint8_t)  — Sensor-GPIO
// Key: "ofr_{i}_svtyp"  (String)   — sensor_value_type (z.B. "sht31_humidity")
// Key: "ofr_{i}_actb"   (float)    — activate_below (Heating-Modus)
// Key: "ofr_{i}_deaa"   (float)    — deactivate_above (Heating-Modus)
// Key: "ofr_{i}_acta"   (float)    — activate_above (Cooling-Modus)
// Key: "ofr_{i}_deab"   (float)    — deactivate_below (Cooling-Modus)

// NOCH OFFEN: "ofr_ver" (uint32_t) — Versions-Counter fuer Server-Sync
// (offline_rules_version im Config-Push + Vergleich beim Load)
```

**Empfehlung ursprünglich: Blob-Variante.** [Korrektur 2026-03-31: Tatsächlich implementiert wurde die Individual-Keys-Variante (Namespace `"offline"`, Keys `ofr_count` + `ofr_{i}_*`). Change-Detection via Shadow-Copy (`memcmp`) verhindert unnötige NVS-Writes — Wear-Schutz damit bereits gelöst.]

### Boot-Recovery-Sequenz (nach RTOS-Migration)

```
1. Hardware-Init (GPIO, I2C, SPI)
2. NVS initialisieren
3. Sensor-Configs aus NVS laden (BESTEHT BEREITS)
4. Aktor-Configs aus NVS laden (BESTEHT BEREITS)
5. *** NEU: Offline-Rules aus NVS laden → OfflineModeManager ***
6. Safety-Task erstellen (Core 1) — hat sofort Offline-Rules verfuegbar
7. WiFi verbinden (AP+STA)
8. Communication-Task erstellen (Core 0)
9. MQTT verbinden (non-blocking, ESP-IDF)
   a) Verbindung OK → Server sendet Config-Push mit aktuellen Rules
      → Rules in RAM + NVS aktualisieren (wenn Version neuer)
   b) Verbindung NICHT OK → ESP arbeitet mit NVS-Rules im Offline-Mode
```

**Kritischer Punkt:** Schritt 5 muss VOR Schritt 6 passieren. Der Safety-Task liest die Rules sofort. Wenn Rules noch nicht geladen sind = Null-Pointer oder leere Logic.

### Versions-Sync zwischen Server und ESP

```
Server Config-Push: { "offline_rules": [...], "offline_rules_version": 42 }

ESP empfaengt:
  if (server_version > nvs_version) {
      // Neue Rules → RAM + NVS aktualisieren
      offlineModeManager.updateRules(new_rules);
      saveOfflineRulesToNVS(new_rules, server_version);
  }
  // Wenn server_version == nvs_version → keine Aenderung noetig

ESP bootet ohne Server:
  rules = loadOfflineRulesFromNVS();  // Laedt letzte bekannte Version
  offlineModeManager.setRules(rules);
  offlineModeManager.activateOfflineMode();
  // ESP arbeitet mit letzter bekannter Konfiguration
```

**Warum Versionierung:** Ohne Version weiss der ESP nicht ob seine NVS-Rules aktuell sind oder veraltet. Der Server muss nur einen Zaehler hochzaehlen wenn sich Rules aendern. Der ESP vergleicht beim Config-Push.

### Flash-Write-Strategie (Wear-Schutz)

**Problem:** Offline-Rules aendern sich selten (nur bei Config-Push). Flash-Wear ist hier KEIN Problem — im Gegensatz zu ESPHome-Globals die sich staendig aendern.

**Regel:** Nur bei Config-Push in NVS schreiben (= selten). NICHT zyklisch. KEIN `flash_write_interval` noetig. AutomationOne schreibt Sensor/Aktor-Configs bereits bei Config-Push in NVS — Offline-Rules folgen demselben Pattern.

### Was passiert in jedem Szenario

| Szenario | ESP-Verhalten |
|----------|---------------|
| **Normalbetrieb** | Server steuert, Offline-Rules inaktiv (im Hintergrund in NVS) |
| **Server-Crash** | ESP wechselt nach ACK-Timeout in Offline-Mode, fuehrt RAM-Rules aus |
| **ESP Power-Cycle, Server OK** | ESP bootet, laedt NVS-Rules, verbindet mit Server, Server sendet aktuelle Rules → NVS-Update |
| **ESP Power-Cycle, Server DOWN** | ESP bootet, laedt NVS-Rules, MQTT-Connect fehlschlaegt → sofort Offline-Mode mit NVS-Rules |
| **Beide down, ESP zuerst wieder da** | ESP bootet mit NVS-Rules im Offline-Mode, wartet auf Server |
| **Factory Reset** | NVS geloescht → keine Offline-Rules → ESP startet "nackt" (akzeptabel bei Factory Reset) |
| **Erster Boot (neues Geraet)** | Keine NVS-Rules → ESP wartet auf Server fuer ersten Config-Push |

---

## 4. Lessons Learned aus den Plattformen

### DO — Was die Profis richtig machen

1. **Tasmota:** Zwei Variablen-Klassen (RAM vs. Flash). Nicht alles persistieren — nur was den Reboot ueberleben MUSS.

2. **ESPHome:** `flash_write_interval` als Kompromiss zwischen Datensicherheit und Flash-Wear. Fuer AutomationOne irrelevant (Rules aendern sich selten), aber gutes Pattern fuer zukuenftige Erweiterungen.

3. **Shelly:** "Start on boot" als explizites Opt-In. Nicht jede Regel muss beim Boot aktiv sein. AutomationOne sollte ein `persist: true/false` Flag pro Offline-Rule haben.

4. **Greengrass Shadow:** Versions-basierte Reconciliation. Exakt was AutomationOne braucht: `offline_rules_version` im Config-Push, ESP vergleicht mit NVS-Version.

5. **Espressif Bootloader-NVS (2025):** NVS kann sogar VOR der App gelesen werden. Fuer AutomationOne nicht noetig (App startet schnell genug), aber zeigt dass NVS die von Espressif empfohlene Strategie ist.

### DONT — Haeufige Fehler

1. **NVS ohne `nvs_commit()`:** Aenderungen werden im RAM gecached. Ohne `commit()` gehen sie bei Power-Loss verloren. IMMER committen nach Schreiben.

2. **Flash-Wear durch zu haeufiges Schreiben:** ESPHome hat Issues mit `restore_value` bei haeufig wechselnden Globals. AutomationOne ist hier sicher — Offline-Rules aendern sich nur bei Config-Push (selten).

3. **Kein CRC/Versions-Check beim Laden:** Wenn NVS-Daten korrupt sind (Power-Loss waehrend Write), muss der Code das erkennen und mit Defaults arbeiten. NVS hat eingebauten CRC — bei korrupten Daten gibt `nvs_get_blob()` einen Fehler zurueck. Dann = keine Rules = Safe State.

4. **Rules und State vermischen:** Tasmota trennt klar: Rules (Logik) in Flash, Var (Laufzeitwerte) in RAM. AutomationOne sollte das auch tun: Offline-Rules (Hysterese-Parameter) in NVS, Hysterese-State (aktuell aktiv/inaktiv) nur in RAM.

---

## 5. Auswirkungen auf den RTOS-IMPL Auftrag

### Neue Phase noetig: M1.5 oder M6 "Offline-Rule-Persistierung"

Der aktuelle Auftrag SAFETY-RTOS-IMPL hat 5 Phasen (M0-M5). Die NVS-Persistierung der Offline-Rules sollte als **Phase M6** (nach Migration stabil) oder als **M1.5** (zwischen M1 und M2) eingefuegt werden:

**Option A: M6 (empfohlen) — Nach stabiler Migration:**
- Vorteil: RTOS-Migration ist unabhaengig testbar
- Vorteil: Kein zusaetzliches Risiko in der Migration
- Aufwand: ~4-6h
- Boot-Reihenfolge wird in M6 angepasst

**Option B: M1.5 — Frueh integrieren:**
- Vorteil: Offline-Rules von Anfang an im Safety-Task verfuegbar
- Nachteil: Macht M1 komplexer
- Aufwand: ~3-4h (wenn in M1 integriert)

### Beziehung zu P4 (Offline-Hysterese)

P4 hat die 4-State-Machine + max 8 Rules + Config-Push-Empfang BEREITS implementiert. Was FEHLT (Stand 2026-03-31):
1. ~~`saveOfflineRulesToNVS()` — beim Config-Push~~ **✅ BEREITS IMPLEMENTIERT** (`offline_mode_manager.cpp:285`, aufgerufen in `parseOfflineRules()`)
2. ~~`loadOfflineRulesFromNVS()` — beim Boot~~ **✅ BEREITS IMPLEMENTIERT** (`offline_mode_manager.cpp:196`, aufgerufen in `main.cpp:2135`)
3. Versionierung (`offline_rules_version`) ← **einziger offener Punkt**
4. ~~Boot-Sequenz-Anpassung (NVS-Load VOR Safety-Task)~~ **✅ BEREITS KORREKT** (`main.cpp:2135` vor `createSafetyTask():2155`)

Das sind ~20-40 Zeilen Code (nur Version-Sync). Kein Architektur-Umbau.

---

## Quellen

1. [Tasmota Rules Documentation](https://tasmota.github.io/docs/Rules/) — Rules in Flash, Var/Mem-Persistenz
2. [Tasmota PowerOnState](https://tasmota.github.io/docs/PowerOnState/) — Pro-Relay Boot-Zustand
3. [Tasmota Discussion #18403](https://github.com/arendst/Tasmota/discussions/18403) — Save data across reboots/power blackout
4. [Tasmota Discussion #17825](https://github.com/arendst/Tasmota/discussions/17825) — Avoiding data loss on power cycle
5. [ESPHome Core Configuration](https://esphome.io/components/esphome/) — flash_write_interval, on_boot
6. [ESPHome Globals](https://esphome.io/components/globals/) — restore_value, update_interval, NVS persistence
7. [ESPHome Issue #3006](https://github.com/esphome/issues/issues/3006) — Restoring preferences from flash on ESP32
8. [ESPHome Issue #3298](https://github.com/esphome/issues/issues/3298) — Preferences stored only once (ESP-IDF)
9. [ESPHome Feature Request #1189](https://github.com/esphome/feature-requests/issues/1189) — Persistent state across reboot/reflash
10. [Flash Memory Wear Effects — New Screwdriver](https://newscrewdriver.com/2022/03/25/flash-memory-wear-effects-of-esphome-recovery-esp8266-vs-esp32/) — ESP32 NVS vs ESP8266 Flash Wear
11. [Shelly Scripting Guide](https://shelly.guide/scripting/) — mJS Engine, Start on boot, KVS
12. [Shelly Script Examples GitHub](https://github.com/ALLTERCO/shelly-script-examples) — Praxis-Beispiele
13. [Shelly IoT Automation Control](https://tryfix.it.com/how-to-use-shelly-script-for-advanced-iot-automation-control/) — Edge Computing mit Shelly
14. [Espressif — Boot Secure, Restore Smart (2025)](https://developer.espressif.com/blog/2025/07/faster-device-restoration/) — NVS im Bootloader, schnelle State-Restoration
15. [Espressif NVS Demo App](https://github.com/Harshal5/esp-idf-faster-device-state-restoration-example) — NVS State Restoration Beispielcode
16. [ESP-IDF NVS Library v6.0](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/storage/nvs_flash.html) — Offizielle API-Dokumentation
17. [ESP-IDF File System Considerations](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-guides/file-system-considerations.html) — NVS vs SPIFFS vs LittleFS
18. [ESP32 NVS Flash Storage — Zbotic](https://zbotic.in/esp32-nvs-flash-storage-persist-settings-between-reboots/) — Praxis-Tutorial
19. [ESP32 Forum — Storing structs in NVS](https://www.esp32.com/viewtopic.php?t=7998) — Blob-API fuer Structs
20. [LittleFS vs SPIFFS — Techrm](https://www.techrm.com/file-management-on-esp32-spiffs-and-littlefs-compared/) — Dateisystem-Vergleich
21. [ESPHome Resilient Local Control](https://newerest.space/mastering-resilient-local-control-esphome-devices-home-assistant/) — Offline-Automationen, Uptime-Strategien
22. [Industrial Shields — ESP32 NVS Memory](https://www.industrialshields.com/blog/arduino-industrial-1/how-to-use-esp32-nvs-memory-to-store-data-permanently-550) — Industrielle NVS-Nutzung

## Offene Fragen

- **Max-Rules-Limit:** 8 Rules × ~60 Bytes = ~480 Bytes. Reicht das langfristig? Oder soll ein groesserer Blob-Platz reserviert werden?
- **Rule-Typen:** Aktuell nur Hysterese. Sollen zukuenftige Rule-Typen (Zeitbasiert, Threshold, Sequenz) auch persistiert werden? Wenn ja → generischeres Blob-Format.
- **Encryption:** Espressif bietet NVS-Encryption. Brauchen Offline-Rules Verschluesselung? Wahrscheinlich nicht (keine sensitiven Daten).
