# Bericht: Serial-Monitor COM4 — ESP32 Dev (WROOM), vollständige Findings

| Feld | Inhalt |
|------|--------|
| **Datum** | 2026-04-11 |
| **Port** | COM4 (USB-SERIAL CH340) |
| **Baud** | 115200 8N1 |
| **Firmware-Env** | `esp32_dev` (ESP32-D0WD-V3) |
| **Methode** | Direkter Monitor per Python `pyserial` (kein `pio device monitor`, um Port-Konflikte zu vermeiden); zusätzlich **Hardware-Reset** per DTR/RTS für vollständigen Boot-Mitschnitt |

---

## 1. Methodik und Datengrundlage

### 1.1 Sitzung A (laufender Betrieb, 75 s)

- Nur **2657 Bytes** empfangen: Gerät war überwiegend **still** (kein kontinuierlicher UART-Spam).
- Enthalten: typischer **Heartbeat-ACK-Zyklus** inkl. NVS-Freigabe, `wdt_diag`-Zugriffe durch `SafetyTask`, ein `[MEM]`-Sample.

### 1.2 Sitzung B (Boot nach Reset, ca. 55 s, **~25 KB**)

- **Reset:** DTR/RTS-Toggle über serielle Leitung (übliches CH340/ESP32-Verhalten).
- Ergebnis: vollständige Kette von **ROM-Bootloader** bis **Post-Setup** und erstem stabilen MQTT-Reconnect inkl. Subscriptions.
- Rohdatei `_monitor_COM4_boot.txt` wurde nach Auswertung **gelöscht** (nur Analyse-Artefakt); dieser Bericht ist die **kanonische** Dokumentation.

---

## 2. Identität des Zielgeräts

| Befund | Quelle (Serial) |
|--------|------------------|
| **Chip** | `ESP32-D0WD-V3` (Revision v3.1) |
| **Board-Profil** | `ESP32_WROOM_32` |
| **Reset-Ursache** | `rst:0x1 (POWERON_RESET)` — erwartet nach RTS-Reset / Flash |
| **ESP-ID (Topics)** | `ESP_6B27C8` |
| **Kaiser / Zone** | Kaiser: `god`, Zone: `zelt_wohnzimmer`, Master leer |
| **WiFi** | SSID `Vodafone-6F44`, IP `192.168.0.182`, RSSI ca. **-52 dBm** |
| **NTP** | Erfolg; primärer NTP: `192.168.0.39` (Server im LAN) |
| **MQTT-Broker** | `mqtt://192.168.0.39:1883` (plain TCP, kein `mqtts://` in der Log-Zeile) |
| **Boot-Zähler** | `Boot count: 5 (last boot 60s ago)` — wiederholte Neustarts im Testfenster |

---

## 3. Boot- und Initialisierungssequenz (Phasen 1–5)

Die Firmware folgt der dokumentierten **Phasenstruktur**; alle kritischen Schritte erscheinen **ohne Abbruch**:

1. **GPIO Safe-Mode** zuerst; I2C-Pins 21/22 reserviert; Safe-Mode „complete“.
2. **Logger** aktiv, **Log Level: INFO** (aus NVS wiederhergestellt).
3. **StorageManager** mit Thread-Safety; **NVS**-Namespaces `wdt_diag`, `system_config`, `wifi_config`, `zone_config` lesbar.
4. **Config Phase 1** vollständig; **Phase 2** WiFi + MQTT-Start (non-blocking ESP-IDF-Client).
5. **HealthMonitor**, **I2C/PWM**, **SensorManager** mit **1 Sensor** (`moisture`, **GPIO 33**), **ActuatorManager** mit **0 Aktoren**, **Offline-Rules** 0 Einträge.
6. **SAFETY-RTOS:** `SafetyTask` Core 1, **Communication task** Core 0; **Config-Update-Queue** `depth=3`, Item **4244 B** (loggt).
7. **Post-Setup Diagnostics:** `System State: 8`, **Critical Errors: NO**, **Active Sensors: 1**.

**Fazit Boot:** Sauber, konsistent mit Server-zentrischem Modell; kein Watchdog-Reset im erfassten Fenster.

---

## 4. Netzwerk und MQTT

### 4.1 Erstes MQTT-„connected“ vs. späterer Fehler

- Kurz nach WiFi/NTP meldet die Firmware **„MQTT connected“** und **Subscriptions via on_connect_callback** (Phase-2-READY inkl. „Device previously approved“).
- **Ca. 9 s nach erstem Messintervall** (Timestamp-Sprung zu `30004` ms): Sensor-Warnungen, dann **TCP/TLS-Stack-Fehler**:
  - `esp-tls: [sock=48] select() timeout`
  - `MQTT_CLIENT: Error transport connect`
  - App-Log: `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT`, `MQTT_EVENT_DISCONNECTED`
- **CircuitBreaker [MQTT]:** Failure **1/5** registriert.
- **Reconnect:** bei ca. **47000 ms** erneut `MQTT_EVENT_CONNECTED`, danach **Bootstrap-Heartbeat**, **REGISTRATION CONFIRMED**, Subscriptions erneut (gestaffelt).

**Wichtige technische Beobachtung:** Der Broker-URI ist in den Logs **`mqtt://` (Port 1883)**, der Fehlerpfad meldet jedoch **`esp-tls`** / **`ESP_ERR_ESP_TLS_*`**. Das deutet darauf hin, dass der **ESP-IDF-Transport-Layer** intern TLS-Pfade oder Timeouts nutzt (oder eine Konfigurationsinkonsistenz zwischen URI und `esp_mqtt_client`-Config). Das ist **nicht** aus dem Serial allein vollständig auflösbar — verdient Abgleich mit `mqtt_client.cpp` / Transport-Konfiguration und Broker-Erreichbarkeit zum Zeitpunkt `~31 s` Uptime.

### 4.2 SAFETY-P4 bei Disconnect

- Pfad: `MQTT_EVENT` → **30 s Grace-Timer** gestartet.
- **Keine Offline-Rules** → Aktoren sofort **safe state** (0 Aktoren betroffen, dennoch korrekt geloggt).

### 4.3 SAFETY-P5 / Server-Status

- Nach erneutem Connect: `[MQTTIN]` auf `…/server/status` mit **online**-Hint.
- Log: **„waiting for heartbeat ACK as authoritative recovery“** — konsistent mit P5-Design (Heartbeat-ACK > Status-Hint).

---

## 5. PKG-ESP-LOG-NVS-TRACE — sichtbare Trace-Muster (INFO)

| Token | Vorkommen im Boot-Mitschnitt | Bewertung |
|-------|------------------------------|-----------|
| `[MQTTIN]` | **2×** (Heartbeat-ACK-Topic, `server/status`) | **INFO**-Ingress wie geplant; zeigt `len`, `tail` (Suffix des Topic-Strings), gekürzte `pvw` |
| `[MQTT_IN]` | **0×** | **DEBUG**-Zeile; bei **Log Level INFO** am UART **nicht** sichtbar — erwartetes Verhalten |
| `[HB_ACK]` | **1×** (`epoch=4 cfg_avail=0`) | Korrelation ACK → Felder **sichtbar** |
| `[HBINF]` | **pre/post** um `setDeviceApproved` | Zusätzliche Diagnose (nicht im ursprünglichen PKG-Matrix-Namen, aber im Code) |
| `[CFG_IN]` / `[CFG_Q]` / `[SYS_CMD]` / `[CFG_SENS]` | **0×** | Kein **Config-Push** und kein **System-Command** im Erfassungsfenster — keine Aussage über deren Implementierung |
| `[NVS_TX]` / `[NVS_APPR]` (DEBUG) | **0×** | Ebenfalls **DEBUG**; NVS bleibt über **`[NVS] txn_begin` / `ns_open`** auf INFO gut sichtbar |

**NVS-Schreibkette Heartbeat (INFO, exemplarisch):**

`[HB_ACK]` → `[HBINF] pre setDeviceApproved …` → `[NVS] txn_begin` (**owner=mqtt_task**) → `ns_open system_config` → `Device approval saved` → `[HBINF] post setDeviceApproved approved=1`

Das bestätigt **Core-0-MQTT-Task** als Transaktions-Inhaber für die Freigabe — passt zur Architektur (Router auf MQTT-Task, NVS über StorageManager).

---

## 6. Konfiguration / Laufzeit-Zustand

### 6.1 `CONFIG_PENDING` / Runtime-Readiness

- **WARNING:** `Runtime config partial … policy_decision=MISSING_ACTUATORS` (sensors=1, actuators=0, offline_rules=0).
- **WARNING:** `[CONFIG] Pending exit blocked: MISSING_ACTUATORS` (nach Heartbeat-ACK und erneutem Laden von Sensor/Aktor aus NVS).

**Interpretation:** Das Gerät bleibt bewusst in einem **„partial runtime“**-Zustand, solange die Readiness-Politik **Aktoren** erwartet, aber **keine** in NVS sind. Das ist **logisch konsistent** mit der aktuellen Bestandskonfiguration (nur Bodenfeuchte-Sensor), kein Firmware-Defekt per se — eher **Soll/Ist** der Policy vs. Deployment.

### 6.2 Sensor GPIO 33

- **WARNING:** `ADC rail on GPIO 33: raw=4095` — Hinweis auf **offenes Kabel**, **falsche Beschaltung** oder **Sensor am oberen Ende** (Log nennt explizit „dry soil“ als Beispiel).
- Beim ersten Messzyklus während MQTT-Disconnect: **„MQTT not connected, skipping publish“** — erwartbar während der TLS/TCP-Ausfallphase.

---

## 7. Speicher und Tasks

- **Heap** nach Setup grob **59–60 KB** free (Logs `[MEM]`), **min free** bis ca. **51 KB** im Fenster — kein akuter OOM-Hinweis im Trace.
- **`wdt_diag`:** periodische `ns_open` von **`SafetyTask`** — plausibles **Watchdog-/Diagnose-Polling**.

---

## 8. Risiken und Abweichungen (priorisiert)

| Prio | Finding | Risiko | Empfehlung |
|------|---------|--------|------------|
| P1 | **TLS-/Transport-Timeout** trotz `mqtt://1883` um ~31 s Uptime | MQTT weg bis Reconnect; Sensorpublish ausfallend; SAFETY-P4 aktiv | Broker-Last, Firewall, `esp_mqtt`-Config (TLS vs. TCP), Netz-Spike prüfen; Log-Zeit mit **Server-Mosquitto-Log** korrelieren |
| P2 | **MISSING_ACTUATORS** blockiert Pending-Exit | Betrieb mit „nur Sensor“-ESP bleibt in Warnpfad | Policy anpassen **oder** mindestens einen Aktor konfigurieren **oder** Server-Push mit leerer Aktorliste laut Produkt-Soll klären |
| P3 | **GPIO 33 raw 4095** | Feuchte-Werte unbrauchbar / falsch hoch | Verkabelung/Spannungsteiler/Sensor prüfen |
| P4 | **DEBUG-Traces** (`[MQTT_IN]`, `[CFG_Q] scopes`, `[NVS_TX]`) unsichtbar bei INFO | Feldtriage ohne Loglevel-Wechsel erschwert | Kurzzeitig Log-Level **DEBUG** per NVS/Command erlauben oder gezielte **INFO**-Ergänzung nur für Operatoren-Marker |

---

## 9. Gesamtfazit

- **Hardware / Flash / Boot:** stabil; **ESP32-D0WD-V3 WROOM** identifiziert; **vollständige** Phasen-1–5-Initialisierung im Mitschnitt nachgewiesen.
- **Netz:** WiFi und NTP **OK**; MQTT **zeitweise gestört** mit **Reconnect** und anschließend **registrierter** Betrieb inkl. **Heartbeat-ACK** und **NVS approval**.
- **PKG-Trace auf INFO:** `[MQTTIN]` und `[HB_ACK]` sind **live verifiziert**; DEBUG-Anteile fehlen sichtbar nur wegen **INFO-Loglevel**.
- **Domänenbefunde:** `MISSING_ACTUATORS` und **ADC 4095** sind **konfigurations-/hardwarenah**, nicht durch den Monitor-Artefakt erklärbar.

---

*Ende Bericht*
