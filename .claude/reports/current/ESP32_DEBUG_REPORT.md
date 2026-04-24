# ESP32 Debug Report

**Erstellt:** 2026-04-22
**Modus:** B (Spezifisch: "5:33h Offlinefenster ESP_EA5484 — H8/H10-Triage")
**Linear-Issue:** AUT-109 ([EA-18] 12h-Offline-Wiederholung EA5484, H8-H10)
**Quellen:**
- `docs/analysen/testfeld-live2-klima-forensik-evidenz-2026-04-22.md`
- `docs/analysen/testfeld-live2-klima-forensik-bericht-2026-04-22.md`
- `El Trabajante/src/services/communication/wifi_manager.cpp`
- `El Trabajante/src/services/communication/mqtt_client.cpp` (2091 LOC)
- `El Trabajante/src/utils/watchdog_storage.cpp`
- `El Trabajante/src/main.cpp` (Boot-Loop-Detektion, Watchdog-Init)
- `El Trabajante/src/services/config/config_manager.cpp` (boot_count NVS)

---

## 1. Zusammenfassung

Das 5:33h Offlinefenster (22:12 UTC → 03:45 UTC) von ESP_EA5484 ist firmware-seitig durch **fehlendes Serial-Log** für diesen Zeitraum nicht final trennbar. Aus der Codeanalyse ergibt sich jedoch: Die WiFi-Reconnect-Schleife kann theoretisch in unter 15 min erschöpft sein; 5.5h Ausfall ist **nur** erklärbar durch (a) Firmware-Freeze/WDT-Reset-Loop, (b) SafeMode-Eintritt, (c) Portal-Öffnung blockiert STA-Reconnect, oder (d) WiFi-Layer meldete "connected" während TCP/MQTT dead war (Silent-Stall-Szenario → H10). H8 (WLAN-Supplicant) bleibt plausibel, ist aber derzeit schwächer gestützt.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `docs/analysen/*-evidenz-2026-04-22.md` | OK | Broker-Log, DB-Gap, Server-Skip-Logs |
| `docs/analysen/*-bericht-2026-04-22.md` | OK | Hypothesenbewertung H1-H5 |
| `wifi_manager.cpp` | OK | Reconnect-Logik, CB-Konfiguration |
| `mqtt_client.cpp` | OK | ESP-IDF-Pfad, ManagedReconnect, INC-EA5484-Marker |
| `watchdog_storage.cpp` | OK | WDT-NVS-History, Snapshot-Logging |
| `main.cpp` (Boot-Abschnitt) | OK | boot_count, Boot-Loop-Schwelle, WDT-Konfiguration |
| `esp32_serial.log` | **NICHT VERFÜGBAR** | Kein Serial-Log für 22:10–03:45 UTC Fenster |

---

## 3. Befunde

### 3.1 Broker-Disconnect: `exceeded timeout` — Bedeutung

- **Evidenz:** `2026-04-21T22:12:01Z: Client ESP_EA5484 disconnected: exceeded timeout.`
- **Bedeutung:** Mosquitto feuert `exceeded timeout` wenn der Client 1.5× das keepalive-Intervall keine PINGREQ sendet. keepalive = `k60` (Zeile `main.cpp:3105`: `mqtt_config.keepalive = 60`).
- **Konsequenz:** ESP sendete spätestens 90s vor 22:12 UTC keinen Heartbeat mehr. Das bedeutet entweder WiFi war weg ODER MQTT-Transport war still gestorben (keine ACKs, kein PINGREQ trotz WiFi-Layer „connected").
- **Schwere:** Hoch — eindeutiger Startpunkt des Offline-Fensters

### 3.2 WiFi-Manager: `setAutoReconnect(false)` + Circuit Breaker

- **Code-Anker:** `wifi_manager.cpp:60` — `WiFi.setAutoReconnect(false)` (Manual reconnect only)
- **CB-Konfiguration:** `circuit_breaker_("WiFi", 10, 60000, 15000)` — 10 Fehler → OPEN → 60s Recovery
- **Reconnect-Interval:** `RECONNECT_INTERVAL_MS = 30000` (30s zwischen Versuchen)
- **Rechnerisch:** 10 Fehler × 30s + CB 60s OPEN ≈ 5–10 Minuten bis CB persistently cycles. Dann: CB wechselt HALF_OPEN → ein Test → schlägt fehl → OPEN → 60s.
- **Gap:** `handleDisconnection()` loggt Disconnect **einmalig** (`static bool disconnection_logged = false`). Danach keine periodischen "still disconnected"-Logs. 5.5h Funkstille im Log ist damit für WiFi-Drops möglich.
- **Schwere:** Mittel — Logging-Lücke ist ein Beobachtbarkeitsproblem

### 3.3 MQTT Managed Reconnect: `[INC-EA5484]`-Marker vorhanden

- **Code-Anker:** `mqtt_client.cpp:51–59` — PKG-18: `WRITE_TIMEOUT_ESCALATION_THRESHOLD = 3`, `MANAGED_RECONNECT_WRITE_TIMEOUT_BOOST_MS = 5000`
- **Code-Anker:** `mqtt_client.cpp:979` — `scheduleManagedReconnect_` mit Exp. Backoff max 12s+649ms Jitter
- **Code-Anker:** `mqtt_client.cpp:449–453` — ESP-IDF-Pfad: `reconnect()` ist No-Op, auto-reconnect via ESP-IDF
- **Beobachtung:** Auch mit Managed Reconnect sollte ein Recovery in 10–30 Minuten erfolgen, nicht in 5.5h. **Ausnahme:** Wenn WiFi-Layer `WL_CONNECTED` meldet, aber TCP-Socket dead ist — dann triggert `handleDisconnection()` nicht, und ESP-IDF-MQTT-Reconnect läuft gegen einen scheinbar aktiven WiFi-Stack.
- **Schwere:** Hoch — Silent-TCP-Stall (H10) ist technisch möglich

### 3.4 WDT-Reset / Boot-Loop-Muster

- **Code-Anker:** `main.cpp:2735` — Boot-Loop-Schwelle: **>5 Boots in <60s** → SafeMode `while(true)`
- **Code-Anker:** `main.cpp:2808` — Bei WDT-Reset: `watchdogStorageLogLastSnapshotIfAny()` loggt gespeicherten Snapshot (last_feed_component, state, heap)
- **Code-Anker:** `watchdog_storage.cpp:111` — `s_boot_was_wdt = (esp_reset_reason() == ESP_RST_TASK_WDT)` — WDT-Boot wird erkannt und in NVS als History persistiert
- **Code-Anker:** `main.cpp:3772` — boot_count wird nach 60s Uptime resettet
- **Gap:** Wenn jeder Reboot-Zyklus >60s dauert (WiFi-Init + MQTT-Connect-Timeout), wird `boot_count` auf 0 zurückgesetzt und die 5-Boot-Schwelle niemals erreicht — aber WDT-Resets ohne SafeMode-Eintritt sind möglich, sind aber **nicht im Serial-Log sichtbar** wenn kein Monitor angeschlossen.
- **Vorläufer-Indiz:** `grafana_523710512a5bbf17` — ESP32 Error-Kaskade auf ESP_EA5484 um 17:00 UTC (5h vor Offline-Start), bestätigt Instabilität desselben Geräts am selben Tag.
- **Schwere:** Mittel — Boot-Loop ohne SafeMode-Trigger bleibt unsichtbar

### 3.5 `reset_reason` im Heartbeat — aber nur wenn verbunden

- **Code-Anker:** `mqtt_client.cpp:1377` — `reset_reason` wird im Heartbeat-Payload als `\"reset_reason\":\"POWERON/WDT/PANIC...\"` gemeldet
- **Gap:** Diese Telemetrie ist nur verfügbar wenn ESP verbunden ist. Im Offline-Fenster selbst gehen reset_reason-Events verloren — sie erscheinen erst beim nächsten Reconnect-Heartbeat.
- **Schwere:** Mittel — Reconnect-Heartbeat um 03:45:21 UTC enthält reset_reason des letzten Boots; dieser Wert ist in den Server-Logs zu prüfen

### 3.6 Logging-Lücken für lange Offline-Fenster

| Fehlende Sichtbarkeit | Code-Stelle | Impact |
|---|---|---|
| Kein "WiFi still disconnected"-Polling-Log | `wifi_manager.cpp:260-277` (`disconnection_logged` einmalig) | WiFi-Dropout unsichtbar nach erstem Log |
| Kein periodischer MQTT-"still disconnected"-Counter | ESP-IDF-Pfad: kein Loop-Log bei Disconnect | Silent-Stall nicht erkennbar |
| reset_reason nur bei Reconnect | `mqtt_client.cpp:1377` | Crash-Ursache verfügbar aber muss aus Server-Log extrahiert werden |
| boot_count-Reset bei >60s Uptime | `main.cpp:3772` | Reboot-Schleife ohne SafeMode unsichtbar wenn Boots >60s |
| WDT-Snapshot NVS | `watchdog_storage.cpp:199-218` | Vorhanden, aber nur lesbar nach manuellem Boot + Serial |

---

## 4. Extended Checks (eigenständig durchgeführt — keine Laufzeitdaten verfügbar)

| Check | Ergebnis |
|-------|----------|
| Docker / Server-Health | Nicht ausgeführt (keine Laufzeitumgebung in dieser Analyse) |
| MQTT-Traffic live | Nicht ausgeführt |
| DB-Query boot_count/reset_reason | Nicht ausgeführt — Quelle: Server-Log heartbeat_handler |
| Serial-Log Offline-Fenster | **Nicht vorhanden** — größte Lücke |

---

## 5. H8 vs H10 Triage

### H8: WLAN-Supplicant-/Auth-Reconnect-Problem

**Wahrscheinlichkeit: MITTEL**

**Argumente dafür:**
- `WiFi.setAutoReconnect(false)` + manueller CB-Zyklus: nach 10 Failures → OPEN → 60s Pause. Dieses Muster könnte sich mehrfach wiederholen.
- Kein WiFi-RSSI-Log im Offline-Fenster (kein Serial). RSSI-Abfall wäre erstes Indiz.
- WiFi-Reconnect-Logik loggt nach erstem "WiFi disconnected" nicht mehr — 5.5h sind damit log-mäßig stumm.
- AP-side: wenn Fritzbox o.ä. nach langer Inaktivität einen Auth-State löscht, muss der ESP einen vollen 4-Way-Handshake machen. Mit CB-OPEN-Zyklen kann das verlangsamt werden.

**Argumente dagegen:**
- Reconnect-Timing: Selbst mit 10×(30s+60s) ≈ 15min wäre der ESP nach 30–60 Minuten wieder verbunden, nicht nach 5.5h.
- Selbe IP bei Reconnect (192.168.178.91): Deutet entweder auf persistente DHCP-Lease oder schnelle Reassociation hin.
- Kein WL_CONNECT_FAILED im bekannten Log-Bestand.

### H10: TCP/MQTT-Silent-Stall ohne WLAN-Drop

**Wahrscheinlichkeit: HOCH**

**Argumente dafür:**
- Gerät hat **dokumentierten History** von Transport-Write-Timeouts: `INC-2026-04-11-ea5484-mqtt-transport-keepalive`, PKG-01/PKG-18/AUT-67 betreffen explizit EA5484.
- Silent-Stall-Muster: WiFi-Layer `WL_CONNECTED`, aber TCP-Socket zum Broker dead. `handleDisconnection()` triggert NICHT (prüft nur WiFi-Layer). MQTT `MQTT_EVENT_DISCONNECTED` müsste von ESP-IDF kommen — aber bei TCP-Stall ohne RST/FIN kann ESP-IDF dies erst nach keepalive-Timeout erkennen.
- Brokers `exceeded timeout` = keepalive missed — kompatibel mit Silent-Stall (ESP sendet kein PINGREQ über die dead TCP-Connection).
- Nach `MQTT_EVENT_DISCONNECTED` läuft Managed Reconnect. Aber: Wenn WiFi-Layer connected, versucht ESP-IDF MQTT-Reconnect über bestehenden TCP-Stack — der ggf. nach NAT-Timeout im Router ebenfalls blockiert.
- Code-Kommentar `mqtt_client.cpp:357-358`: `// Do not force custom network/reconnect timeouts here. ESP-IDF defaults are currently more stable in the observed field setup (EA5484 + second ESP)` — zeigt bekannte Timeout-Empfindlichkeit.
- Reconnect-Loop nach Silent-Stall kann sehr lang dauern wenn TCP-Establish selbst timeoutet (NAT-Session abgelaufen, kein RST vom Router) → `MQTT_EVENT_ERROR` mit silent-write-timeout errno=119.

**Argumente dagegen:**
- ESP-IDF Managed Reconnect hat Exp. Backoff max ~12s → sollte innerhalb von 30–60 Minuten recovern.
- 5.5h ist auch für Silent-Stall sehr lang; außer wenn Firmware gleichzeitig in einem anderen Zustand feststeckt (SafeMode, Portal).

### Kombinations-Szenario (wahrscheinlichstes): HOCH

**TCP-Silent-Stall (H10) tritt auf → MQTT_EVENT_DISCONNECTED fires → Managed Reconnect beginnt → WiFi wird für neue TCP-Connection gebraucht → WiFi-DHCP/AP-Session ist abgelaufen (Fritzbox NAT-Timeout nach ~30–60 min Inaktivität) → WiFi reconnect nötig → CB-Zyklus startet → nach mehreren Failures Portal öffnet → Portal-Mode blockiert STA-Reconnect → 5.5h Ausfall.**

Oder einfacher: Silent-Stall + WiFi-Layer-Disconnect in derselben Nacht, ohne hinreichend granulare Logs zur Trennung.

### Fehlende Evidenz (zwingend)

| Evidenz | Warum zwingend | Quelle |
|---|---|---|
| `reset_reason` aus Reconnect-Heartbeat 03:45 UTC | Zeigt ob ESP rebooted (WDT/PANIC/POWERON) oder durchgelaufen | Server-Log `heartbeat_handler` |
| WiFi-RSSI im Offline-Fenster | Zeigt ob WiFi physisch weg war | Serial-Log (nicht verfügbar) |
| `boot_sequence_id` aus 03:45 UTC Heartbeat | `-b<N>-r<reason>` zeigt boot_count beim Reconnect | Server-Log |
| WDT-NVS-Snapshot beim nächsten Boot | `watchdogStorageLogLastSnapshotIfAny()` im Serial | Serial-Log |
| `mqtt_circuit_breaker_open` / `wifi_circuit_breaker_open` im Heartbeat | Zeigt CB-State bei Reconnect | Server-Log |

---

## 6. Konkrete nächste Schritte (ohne Produktcode-Änderung)

1. **Server-Log 03:45 UTC Heartbeat auslesen:**
   ```bash
   grep "ESP_EA5484" logs/server/god_kaiser.log* | grep "03:45" | head -30
   # Ziel: reset_reason, boot_sequence_id, wifi_circuit_breaker_open, mqtt_circuit_breaker_open
   ```

2. **boot_sequence_id aus Reconnect-Heartbeat extrahieren:**
   ```bash
   grep "ESP_EA5484" logs/server/god_kaiser.log* | grep -E "boot_sequence_id|reset_reason" | grep "03:4[0-9]" | head -10
   ```

3. **Sentry/Grafana: Error-Kaskade 17:00 UTC analysieren:**
   - `grafana_523710512a5bbf17` — Error-Kaskade 5h vor Offline. Welche Error-Codes? (→ legt Basis-Instabilität offen)

4. **Serial-Capture beim nächsten Auftreten:**
   - ESP32 am Monitor belassen oder seriellen Logger an NVS/Serial bridgen, so dass `[INC-EA5484]`-Marker und `watchdogStorageLogLastSnapshotIfAny()` im nächsten Offline-Event capture werden.

5. **Fritzbox/Router: DHCP-Lease und ARP-Table für 192.168.178.91 prüfen:**
   - War IP während des Offline-Fensters noch im ARP-Table? → Zeigt ob WiFi-Layer wirklich verbunden war.

---
