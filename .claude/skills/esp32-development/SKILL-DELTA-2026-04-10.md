# ESP32-Development-Skill — Delta 2026-04-10

Kurzdokumentation der Optimierung von `.claude/skills/esp32-development/SKILL.md` (inkl. Abgleich mit `MODULE_REGISTRY.md` als progressive disclosure — inhaltlich unverändert gelassen, nur Skill angepasst).

---

## Phase A — Bestandsaufnahme

### A.1 Skill-Pfad

- Hauptskill: `.claude/skills/esp32-development/SKILL.md`
- Progressive disclosure: `.claude/skills/esp32-development/MODULE_REGISTRY.md`

### A.2 Inventar-Tabelle (Skill vs. Repo)

| Bereich | Was war im Skill bereits explizit? | Was fehlte oder war vage? | Nachweis im Repo |
|--------|-------------------------------------|---------------------------|------------------|
| **Build / `platformio.ini`** | `pio run -e esp32_dev`, Wokwi-Envs, native Tests | Exakte Env-Namen (`seeed_xiao_esp32c3`); früher: CLAUDE.md wies fälschlich auf `seeed` — **2026-04-11:** CLAUDE.md auf `esp32_dev` / XIAO-Env korrigiert | `El Trabajante/platformio.ini` |
| **Framework** | Arduino, ESP-IDF-MQTT vs. PubSubClient | `sdkconfig.defaults` nur bei `esp32_dev`; Version pinning über `platform = espressif32` | `platformio.ini`, `sdkconfig.defaults` |
| **Einstieg / Tasks** | Init-Reihenfolge, Safety-/Comm-Tasks | Zeilenzahl `main.cpp` veraltet; fehlende „Kontrakt“-Verknüpfung | `El Trabajante/src/main.cpp` |
| **Sensor/Aktor** | Manager, Registry-Beispiele, `IActuatorDriver` | Kein Hinweis auf echte Header-Signaturen + String-Policy | `sensor_manager.h`, `iactuator_driver.h` |
| **MQTT** | TopicBuilder, QoS-Tabelle | Widerspruch Doku vs. Code (QoS 2 in Doku/Regel vs. Subscribe 1 in Code); Header-Konflikt `mqtt_client.h` | `topic_builder.h`, `main.cpp`, `mqtt_client.h`, `.claude/reference/api/MQTT_TOPICS.md` |
| **Config / NVS / Provisioning** | ConfigManager, ProvisionManager, Wokwi NVS | — | `MODULE_REGISTRY.md`, `platformio.ini` (Wokwi-Flags) |
| **Safety / Watchdog** | SafetyController, Offline-Rules, P1/P4 | — | `safety_controller.h`, Skill-Abschnitt |
| **GPIO / ADC** | Pin-Reservation | ADC2+WiFi, Boards — jetzt verweist Skill auf Hardware-Header | `El Trabajante/src/config/hardware/esp32_dev.h`, `xiao_esp32c3.h` |
| **Logging** | Logger erwähnt | TAG-Makros `LOG_D`…`LOG_C` explizit | `El Trabajante/src/utils/logger.h` |
| **Feature-Flags** | Teilweise in Ordnerstruktur | Zentrale Makros aus `platformio.ini` gebündelt | `platformio.ini` `build_flags` |
| **Simulation / Tests** | Wokwi, native | Testanzahl „22“ nicht verifiziert — entfernt zugunsten Verweis auf `test/` + `test_ignore` | `El Trabajante/platformio.ini` `[env:native]` |
| **Legacy / fragil** | ORPHANED-Kommentare in TopicBuilder | Im Skill verankert: `Mqtt_Protocoll.md` + `MQTT_TOPICS.md` | `topic_builder.h`, `El Trabajante/docs/Mqtt_Protocoll.md` |

### A.3 Projektdokumentation (Auszug)

- `.claude/CLAUDE.md`: Verifikationszeile Firmware — **2026-04-11** auf `esp32_dev` / `seeed_xiao_esp32c3` angeglichen (Kurzname `seeed` existiert nicht).
- `.cursor/rules/firmware.mdc`: Blocking, kein `delay()` in Hauptloop, kein Arduino-`String` bevorzugt, TopicBuilder, Safety, Error-Bereiche — im Skill verstärkt verknüpft.

---

## Phase B — Recherche (stack-spezifisch, Web)

Gezielt zur Abstützung der **Ist-Konfiguration** (Arduino-ESP32 + ESP-IDF `esp_mqtt_client` bzw. PubSubClient-Pfad) und **Hardware-Leitplanken** im gleichen Repo:

| Thema | Quellen (extern) | Übernehmen / ablehnen |
|--------|------------------|------------------------|
| **ESP-IDF MQTT-Client (Arduino nutzt IDF)** | [ESP-IDF MQTT](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/protocols/mqtt.html) | Übernehmen: asynchroner Client, Event-Loop — passt zu `mqtt_client.cpp` (ESP-IDF-Pfad). Keine zusätzliche Dritt-Bibliothek einführen. |
| **ADC2 und WiFi auf ESP32** | [ESP32 Datasheet](https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf), [arduino-esp32 #440](https://github.com/espressif/arduino-esp32/issues/440) | Übernehmen: klassischer ESP32: ADC2 ungeeignet bei aktivem WiFi — **bereits** im Projekt in `esp32_dev.h` kommentiert; Agenten sollen diese Header nutzen, keine generischen Tutorials. |
| **Koexistenz / RF** | [ESP-IDF Coexistence](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-guides/coexist.html) | Nur als Hintergrund; Umsetzung im Repo = konkrete Pin-Listen + kein ADC2 für Analogsensoren unter WiFi. |

---

## Phase C — Synthese (was im Skill steht)

- **Stack-Anker** und **Kontrakte**-Tabelle verbinden `platformio.ini`, `topic_builder`, MQTT-Doku und `main.cpp`.
- **Ende-zu-Ende:** Payload/Topic-Änderungen immer mit eingecheckter MQTT-Referenz und Firmware-Subscribe/Publish abgleichen.
- **Keine parallelen Stile:** ein MQTT-Singleton, ein TopicBuilder; kein zweiter Client.

---

## Phase D

Der Abschnitt **„Coding-Agenten: typische Fehler und Soll-Verhalten“** ist vollständig in `SKILL.md` eingefügt (Checklistencharakter).

---

## Optional: PR-Review-Checkliste (Firmware-Agenten)

1. Stimmt der **PlatformIO-`-e`-Name** mit `El Trabajante/platformio.ini` überein?
2. Sind **GPIO/ADC** an `config/hardware/*.h` und `GPIOManager` angeglichen (keine Strapping/ADC2-Fallen)?
3. Sind **Topics** nur über `TopicBuilder` gebaut und mit `MQTT_TOPICS.md` / `Mqtt_Protocoll.md` abgeglichen?
4. Sind **QoS-Annahmen** im **Code** (`main.cpp`, `mqtt_client.cpp`) verifiziert, nicht nur in der Markdown-Tabelle?
5. Bleibt **`raw_mode: true`** für Sensordaten erhalten?
6. Laufen Aktor-Befehle weiterhin über **SafetyController** / bestehende Queues?
7. Kein **`delay()`** in MQTT-/Watchdog-kritischen Pfaden?
8. Sind **Error-Codes** aus `error_codes.h` und ggf. `.claude/reference/errors/ERROR_CODES.md` aktualisiert?
9. **`pio run`** (und bei Logik-Änderungen **`pio test -e native`**) ausgeführt?
10. Kein unauftraglicher **Großrefactor** (Scope nur Auftrag)?

---

*Erstellt als Lieferartefakt zum Skill-Optimierungsauftrag 2026-04-10.*
