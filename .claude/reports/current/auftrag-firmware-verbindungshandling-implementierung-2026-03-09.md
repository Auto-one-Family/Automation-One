# Auftrag: Firmware — Verbindungshandling Stabilisierung (Implementierung)

> **Erstellt:** 2026-03-09  
> **Ziel-Repo:** AutomationOne (El Trabajante = ESP32-Firmware)  
> **Typ:** Implementierung  
> **Prioritaet:** HOCH  
> **Geschaetzter Umfang:** ~4–6 Stunden  
> **Basis:** BERICHT_FIRMWARE_VERBINDUNGSHANDLING_2026-03-09.md + Recherche `wissen/iot-automation/esp32-verbindungshandling-provisioning-reconnect-best-practices-2026-03.md`

---

## 1. Kontext und Ziel

### 1.1 Problem (aus Bericht)

- **IST:** Bei MQTT-Verbindungsverlust loescht der ESP nach 5 Minuten die Config und startet das Portal neu. User muss jedes Mal neu konfigurieren.
- **Ziel:** User soll bei Disconnect **immer** Zugang zum Config-Portal haben (um neu zu konfigurieren ODER alte Config wiederzuverwenden), waehrend der ESP im Hintergrund weiter reconnectet.

### 1.2 Gewuenschtes Verhalten (SOLL)

| Szenario | Portal | Config | Hintergrund |
|----------|--------|--------|-------------|
| **Server getrennt** (Neustart, Netzwerk) | **Oeffnet sich** (User kann umkonfigurieren) | **Bleibt erhalten** | ESP versucht weiter zu reconnecten |
| **Server wieder da** | User kann im Portal per Klick verbinden (alte oder neue Config) | Bleibt | Oder ESP verbindet sich automatisch → Portal schliesst |
| **User will umkonfigurieren** | Ist bereits offen (weil Disconnect) | User gibt neue ein, speichert | — |
| **Falsche Config** (erster Versuch) | Oeffnet sich (Config vorausgefuellt) | **Bleibt** (User korrigiert) | ESP versucht weiter |
| **Factory Reset** (Boot-Button, MQTT) | Oeffnet sich (leer) | Wird geloescht | — |

**Kernprinzip:** Jedes Mal wenn der Server getrennt wird, oeffnet sich das Config-Portal — damit der User bei Bedarf umkonfigurieren kann. Im Hintergrund laeuft der Reconnect weiter. Config wird **nie** bei Disconnect geloescht (nur bei Factory Reset). Wenn der Server zurueck ist: Entweder verbindet der ESP automatisch (Portal schliesst) oder der User klickt im Portal auf Verbinden (alte oder neue Config).

### 1.3 Randbedingungen

- Portal schliesst sich, sobald Verbindung steht (Ressourcenschonung).
- Boot-Button Factory Reset (10s) und MQTT `factory_reset` loeschen weiterhin alles.
- Bei Portal oeffen: **AP+STA-Modus** — Portal laeuft (AP), Reconnect-Versuche laufen parallel (STA).

---

## 2. Systemkontext (aus Bericht)

**Verbindungskonfiguration:** NVS Namespace `wifi_config` (SSID, Passwort, Server-IP, MQTT-Port, `configured`-Flag).

**Config-Loeschung aktuell an 5 Stellen — SOLL nur noch 3 (Factory Reset):**
1. Boot-Button 10s (main.cpp:227) — **bleibt** (Factory Reset)
2. MQTT Connect FAIL in setup() (main.cpp:747) — **aendern:** Config NICHT loeschen, Portal oeffnen (Config vorausgefuellt)
3. MQTT factory_reset (main.cpp:1000) — **bleibt** (Factory Reset)
4. MQTT 5 min Circuit Breaker OPEN in loop() (main.cpp:2398) — **aendern:** Config NICHT loeschen, Portal oeffnen (kein Reboot)
5. HTTP POST /reset (provision_manager.cpp:1057) — **bleibt** (Factory Reset via Portal)

**Reconnect:** Bereits implementiert (exponential backoff). Muss parallel zum Portal laufen → AP+STA-Modus.

**ProvisionManager:** Kann Portal mit bestehender Config starten (laut Bericht bei WiFi-Fehler bereits so). Formular zeigt gespeicherte Werte vorausgefuellt.

---

## 3. Betroffene Dateien und Stellen

| Datei | Aenderung |
|-------|-----------|
| `main.cpp` | 5-min-Block (2379–2410): Portal oeffnen statt Config loeschen + Reboot; setup() Zeile 747: resetWiFiConfig() entfernen; loop(): Disconnect-Debounce, bei portal_open_due_to_disconnect_ zusaetzlich wifiManager.loop()/mqttClient.loop(), bei Reconnect-Erfolg provisionManager.stop() |
| `provision_manager.cpp` / `.h` | Neue Methode `startAPModeForReconfig()` mit `WiFi.mode(WIFI_AP_STA)` (Zeile 693: startWiFiAP() erweitern oder Overload) |

**Kein `connected_once`** — Config wird nie bei Disconnect geloescht, nur bei Factory Reset.

**Neue Variable:** `portal_open_due_to_disconnect_` (bool, in main.cpp) — true wenn Portal wegen MQTT-Disconnect geoeffnet wurde (nicht wegen fehlender Config). Steuert: Reconnect parallel laufen lassen, bei Erfolg Portal schliessen.

---

## 4. Implementierungs-Schritte (genau)

### Block A: main.cpp — 5-min-Block: Portal oeffnen statt Config loeschen

#### A.1 Aktuelle Stelle (main.cpp)

- **Zeilen:** 2372–2410 (Block beginnt bei Kommentar „MQTT PERSISTENT FAILURE DETECTION“)

- **IST-Code (vereinfacht):**
  ```cpp
  if (!mqttClient.isConnected() && mqttClient.getCircuitBreakerState() == CircuitState::OPEN) {
    if (mqtt_failure_start == 0) {
      mqtt_failure_start = millis();
    } else if (millis() - mqtt_failure_start > MQTT_PERSISTENT_FAILURE_TIMEOUT_MS) {
      configManager.resetWiFiConfig();
      ESP.restart();
    }
  }
  ```

#### A.2 SOLL-Code

- **Logik:** Config **nicht** loeschen. **Portal oeffnen** (ohne Reboot). Reconnect laeuft weiter im Hintergrund.

- **Beispiel:**
  ```cpp
  if (!mqttClient.isConnected() && mqttClient.getCircuitBreakerState() == CircuitState::OPEN) {
    if (mqtt_failure_start == 0) {
      mqtt_failure_start = millis();
    } else if (millis() - mqtt_failure_start > MQTT_PERSISTENT_FAILURE_TIMEOUT_MS) {
      // Config NICHT loeschen — Portal oeffnen, Reconnect laeuft weiter
      if (!portal_open_due_to_disconnect_) {
        provisionManager.startAPModeForReconfig();  // NEU: AP+STA-Modus, handleRoot() fuellt Formular aus configManager.getWiFiConfig()
        portal_open_due_to_disconnect_ = true;
      }
      mqtt_failure_start = 0;  // Reset fuer naechsten Zyklus
    }
  }
  ```

- **Hinweis:** `startAPModeForReconfig()` existiert noch nicht — muss in ProvisionManager ergaenzt werden. `startAPMode()` nutzt aktuell `WiFi.mode(WIFI_AP)` (provision_manager.cpp:693), was STA trennt. Fuer parallelen Reconnect: `startAPModeForReconfig()` mit `WiFi.mode(WIFI_AP_STA)`. handleRoot() (Zeile 803) fuellt das Formular bereits aus `configManager.getWiFiConfig()` — keine Aenderung noetig.

---

### Block B: main.cpp — setup() MQTT-Fehler: Config behalten, Portal oeffnen

#### B.1 Aktuelle Stelle (main.cpp)

- **Zeile:** 747 (direkt vor `provisionManager.begin()`)

- **IST:** `configManager.resetWiFiConfig()` (Zeile 747) → dann `provisionManager.startAPMode()` → `return` (Zeile 776), loop() uebernimmt. **Kein** Reboot in setup(), aber Config wird geloescht.

- **SOLL:** `resetWiFiConfig()` **entfernen**. Stattdessen `provisionManager.startAPModeForReconfig()` (oder `startAPMode()` falls AP+STA noch nicht noetig) — **ohne** Config-Loeschung. handleRoot() fuellt Formular bereits aus NVS (provision_manager.cpp:806–841).

- **Aenderung:** Zeile 747 loeschen. Optional: `startAPModeForReconfig()` wenn AP+STA fuer parallelen MQTT-Reconnect gewuenscht (WiFi ist bei MQTT-Fehler bereits verbunden).

---

### Block C: Portal bei Disconnect + paralleler Reconnect (AP+STA)

#### C.0 Disconnect-Erkennung (vor 5-min-Block)

- **Neu:** In `loop()` Disconnect erkennen: `!mqttClient.isConnected()` ueber mindestens `PORTAL_OPEN_DEBOUNCE_MS` (z.B. 30s). Pruefung nur wenn `g_system_config.current_state == STATE_OPERATIONAL` (sonst waere ESP schon im Provisioning-Modus).
- Wenn Disconnect erkannt und Portal noch nicht offen: `provisionManager.startAPModeForReconfig()`, `portal_open_due_to_disconnect_ = true`, `g_system_config.current_state = STATE_SAFE_MODE_PROVISIONING`.
- Damit oeffnet sich das Portal **frueher** (nach Debounce), nicht erst nach 5 min. Der 5-min-Block bleibt Fallback.

#### C.1 Anforderung

- Wenn Portal wegen Disconnect offen ist: **AP+STA-Modus** — Portal (AP) und Reconnect-Versuche (STA) laufen parallel.
- In `loop()` bei `STATE_SAFE_MODE_PROVISIONING` **und** `portal_open_due_to_disconnect_`: `provisionManager.loop()` (ruft intern `dns_server_.processNextRequest()` und `server_->handleClient()` auf) **und** zusaetzlich `wifiManager.loop()`, `mqttClient.loop()` — aktuell wird bei diesem State nur provisionManager.loop() aufgerufen (main.cpp:2298–2327), Reconnect fehlt.
- Wenn Reconnect erfolgreich: `mqttClient.isConnected()` und `mqttClient.isRegistrationConfirmed()` → Portal schliessen (`provisionManager.stop()`), `portal_open_due_to_disconnect_ = false`, `g_system_config.current_state = STATE_OPERATIONAL`, zurueck zu STA-only.

#### C.2 ProvisionManager / main.cpp

- **handleRoot()** (provision_manager.cpp:803) fuellt Formular bereits aus `configManager.getWiFiConfig()` — keine Aenderung noetig.
- **startAPMode()** loescht Config nicht, nutzt aber `WiFi.mode(WIFI_AP)` (Zeile 693) → STA wird getrennt. Neue Methode `startAPModeForReconfig()`: `WiFi.mode(WIFI_AP_STA)` vor `softAP()`, Rest wie startAPMode(). ESP32 unterstuetzt WIFI_AP_STA.

#### C.3 Portal schliessen bei Reconnect-Erfolg

- In `loop()`: Wenn `portal_open_due_to_disconnect_` und `mqttClient.isConnected()` und `mqttClient.isRegistrationConfirmed()` → `provisionManager.stop()`, `portal_open_due_to_disconnect_ = false`, `g_system_config.current_state = STATE_OPERATIONAL`.

---

### Block D: Verifikation und Edge Cases

#### D.1 Boot-Button, MQTT factory_reset, HTTP POST /reset

- **Unveraendert:** Alle drei loeschen weiterhin Config via `resetWiFiConfig()`: main.cpp:227 (Boot-Button), main.cpp:1000 (MQTT), provision_manager.cpp:1057 (HTTP POST /reset).

#### D.2 Disconnect-Erkennung — wann Portal oeffnen?

- **User-Anforderung:** "Jedes mal wenn der Server getrennt wird" — Portal soll sich oeffnen, sobald Disconnect erkannt wird.
- **Option 1:** Sofort bei `!mqttClient.isConnected()` (nach erstem Erkennen)
- **Option 2:** Nach kurzer Debounce (z.B. 30s) um Flackern bei sehr kurzen Disconnects zu vermeiden

- **Empfehlung:** Option 2 — Debounce 30s. Konstante `PORTAL_OPEN_DEBOUNCE_MS` definieren.
- **5-min-Block:** Zusaetzlicher Trigger — falls Portal aus anderem Grund noch nicht offen ist, hier oeffnen. Kein Reboot, keine Config-Loeschung.

#### D.3 Portal-Timeout (10 min)

- Laut Bericht: Nach 10 min Portal-Timeout geht ESP in Safe-Mode. **Unveraendert** beibehalten.

---

### Block E: Zusaetzliche Empfehlungen (optional)

- **"Verbinden"-Button im Portal:** Wenn Portal wegen Disconnect offen ist, Button "Mit aktueller Config verbinden" — triggert erneuten Connect-Versuch (ohne Formular-Speichern). User kann warten bis Server da ist und dann klicken.
- **Logging:** Bei Portal-Oeffnung wegen Disconnect: Log "Config-Portal geoeffnet (Server getrennt), Reconnect laeuft im Hintergrund".

---

## 6. Akzeptanzkriterien

| # | Kriterium | Test |
|---|-----------|------|
| 1 | Server getrennt: Portal oeffnet sich, Config bleibt, Reconnect laeuft im Hintergrund | Server stoppen → nach 5 min (oder Debounce) Portal oeffnet, Config in Formular sichtbar |
| 2 | Server wieder da: ESP verbindet automatisch ODER User klickt im Portal "Verbinden" | Server starten → ESP verbindet, Portal schliesst |
| 3 | User will umkonfigurieren: Portal ist offen (wegen Disconnect), User gibt neue Config ein, speichert | Im offenen Portal neue Server-IP eingeben, Speichern → Reboot, Verbindung zu neuem Server |
| 4 | Falsche Config (erster Versuch): Portal oeffnet mit vorausgefuellter Config, User korrigiert | Falsche IP eingeben, nach Fehler Portal mit falscher IP vorausgefuellt → User korrigiert |
| 5 | Boot-Button 10s / factory_reset: Config geloescht, Portal oeffnet leer | Boot-Button 10s → Reboot → Portal leer |

---

## 7. Abgrenzung

- **Keine Aenderung** an Server (El Servador), MQTT-Broker, Heartbeat-ACK-Format.
- **Keine Aenderung** an Reconnect-Backoff (bereits vorhanden).
- **Keine Aenderung** an Portal-Timeout (10 min) oder Circuit-Breaker-Parametern.
- **Keine Aenderung** an WiFi-Credentials-Handling bei WiFi-Fehler (laut Bericht wird Config bei WiFi-Fehler nicht geloescht — beibehalten).
- **Config wird nie bei Disconnect geloescht** — nur bei Boot-Button und MQTT factory_reset.

---

## 8. Referenzen

| Dokument | Inhalt |
|----------|--------|
| `BERICHT_FIRMWARE_VERBINDUNGSHANDLING_2026-03-09.md` | Vollanalyse, Zustandsdiagramm, NVS-Struktur, exakte Zeilen |
| `wissen/iot-automation/esp32-verbindungshandling-provisioning-reconnect-best-practices-2026-03.md` | [Korrektur: Pfad existiert nicht im Repo — ggf. extern oder umbenannt] |
| `auftraege/auftrag-firmware-verbindungshandling-vollanalyse-2026-03-09.md` | Original-Analyse-Auftrag |
| `mqtt-server-esp32-echtzeit-kommunikation-2026-03.md` | MQTT Patterns (ACK, Correlation) |

---

## 9. Reihenfolge der Umsetzung

1. Block A (5-min-Block: Portal oeffnen statt Config loeschen)
2. Block B (setup() MQTT-Fehler: Config behalten, Portal oeffnen)
3. Block C (AP+STA-Modus, paralleler Reconnect, Portal schliessen bei Erfolg)
4. Block D (Debounce, Verifikation)
5. Block E (optional: "Verbinden"-Button im Portal)
6. Manuelle Tests gemäß Akzeptanzkriterien
7. Build verifizieren: `cd "El Trabajante" && pio run -e seeed_xiao_esp32c3` (platformio.ini: env seeed_xiao_esp32c3)
