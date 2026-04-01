# ANALYSE-FIX-FW-MQTT-RECONNECT — MQTT Reconnect TLS-Timeout Endlosschleife

> **Typ:** Analyse + Fix (Code noch nicht analysiert — Agent muss erst den Code pruefen)
> **Prio:** CRITICAL
> **Schicht:** Firmware (El Trabajante)
> **Aufwand:** ~3-4h Analyse + ~2-4h Fix
> **Empfohlener Agent:** esp32-dev
> **Datum:** 2026-03-31
> **Quelle:** Live-Test ESP_EA5484 auf Pi 5

---

## Zusammenfassung

Nach der RTOS-IMPL Migration (Dual-Task-Architektur, ESP-IDF MQTT statt PubSubClient, Custom Partition) verbindet sich der ESP nach Boot erfolgreich, laeuft ~28 Minuten stabil, und verliert dann die MQTT-Verbindung. **Er reconnected NIE wieder.** Jeder Reconnect-Versuch endet mit `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT`. Der CircuitBreaker zaehlt Fehler, resettet, zaehlt wieder — endlos. WiFi bleibt verbunden, Heap ist stabil.

Dieser Auftrag hat zwei Teile: **Erst analysieren** (Code-Stellen finden die das Problem verursachen), **dann fixen**.

---

## Symptome aus dem Log (exakt)

### Pattern 1: TLS-Timeout alle ~20 Sekunden

```
E (4094580) esp-tls: [sock=48] select() timeout
E (4094581) TRANSPORT_BASE: Failed to open a new connection: 32774
E (4094581) MQTT_CLIENT: Error transport connect
[4087933][E][mqtt_client.cpp:889] mqtt_event_handler(): [MQTT] TCP transport error: 0
    (esp_err=ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT)
```

- Der Socket ist IMMER `sock=48` — die gleiche Socket-Nummer bei jedem Versuch
- Der Fehler-Code ist IMMER `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT`
- Kein DNS-Fehler, kein Connection-Refused, kein Certificate-Error
- Intervall: ~20s (TLS-Timeout ~6.6s + ESP-IDF Reconnect-Pause)

### Pattern 2: CircuitBreaker zaehlt 1→2→3→1→2→3...

```
[4067901] CircuitBreaker [MQTT]: Failure recorded (count: 2/5)
[4087995] CircuitBreaker [MQTT]: Failure recorded (count: 3/5)
[4108090] CircuitBreaker [MQTT]: Failure recorded (count: 1/5)  ← RESET
[4128187] CircuitBreaker [MQTT]: Failure recorded (count: 2/5)
[4148271] CircuitBreaker [MQTT]: Failure recorded (count: 3/5)
[4168365] CircuitBreaker [MQTT]: Failure recorded (count: 1/5)  ← RESET
```

- Der CB erreicht NIE count=4 oder count=5
- Er resettet nach 3 Fehlern — das deutet auf einen Timer-Reset alle ~60s hin
- Der CB erreicht nie den OPEN-State (der bei 5 liegt) — er kann also den Client nie stoppen

### Pattern 3: Stabile Ressourcen

```
[4093688] [MEM] Free heap: 135900 B, min free: 123856 B
[4153716] [MEM] Free heap: 135900 B, min free: 123856 B
[4213742] [MEM] Free heap: 135900 B, min free: 123856 B
```

- Heap ist stabil bei ~135KB — kein Memory-Leak
- min_free bei ~123KB — keine kurzfristigen Spikes
- Stack HWM (Safety-Task): 2624 Bytes frei — ausreichend
- COMM Task Stack HWM: 3588 Bytes frei — ausreichend

### Pattern 4: Vor dem Disconnect war alles stabil

```
[2352705] [BOOT] [SAFETY-P1] All 11 MQTT topics subscribed
[2352715] [BOOT] [SAFETY-P1] MQTT reconnected — syncing actuator state with server
[2353031] MQTT message received: kaiser/god/esp/ESP_EA5484/system/heartbeat/ack
[2353034] REGISTRATION CONFIRMED BY SERVER
[2353066] Gate opened - publishes now allowed
...
[2832981] [MEM] Free heap: 135288 B  ← ~2833s = 47min nach Boot, alles stabil
```

- Boot bis erster Disconnect: ~28 Minuten stabiler Betrieb
- Heartbeat-ACKs kommen regelmaessig
- Registration erfolgreich

---

## Analyse-Aufgaben (5 Bloecke) — MUSS VOR FIX ERLEDIGT WERDEN

### Block A: ESP-IDF MQTT Client Konfiguration pruefen

**Datei:** `src/services/communication/mqtt_client.cpp`

Suche nach `esp_mqtt_client_config_t` und dokumentiere ALLE gesetzten Felder. Speziell pruefen:

1. **`reconnect_timeout_ms`** — Wenn nicht gesetzt: ESP-IDF Default ist 10s mit exponentiellem Backoff (verdoppelt bis endlos). MUSS ein Maximum haben.
2. **`disable_auto_reconnect`** — Wenn `true`: Wer managed den Reconnect dann? Gibt es einen manuellen `esp_mqtt_client_reconnect()` Aufruf?
3. **`network_timeout_ms`** — Default 10s. Wenn der TLS-Handshake laenger dauert (instabiles Netz), muss dieser hoeher sein.
4. **`transport`** — `MQTT_TRANSPORT_OVER_TCP` oder `MQTT_TRANSPORT_OVER_SSL`? Falls kein TLS: Warum dann TLS-Timeout?
5. **`buffer_size`** — Bereits gesetzt: `4096`. Dokumentieren, ob das ausreichend ist.
6. **`task_stack`** — Bereits gesetzt: `10240`. Dokumentieren.
7. **`disable_clean_session`** — Bekannt: `= 0` (clean session true). Fuer P4-NVS-FINAL relevant, aber NICHT fuer den Reconnect-Bug.

**Ergebnis Block A:** Tabelle mit allen gesetzten Config-Feldern + Bewertung ob die Werte korrekt sind.

### Block B: CircuitBreaker-Logik vollstaendig nachvollziehen

Implementierung liegt in `src/error_handling/circuit_breaker.cpp` + `src/error_handling/circuit_breaker.h`.

1. **Wann resettet der CB?** Im Log resettet er nach 3 auf 1. Gibt es einen Timer (z.B. 60s) nach dem der Zaehler zurueckgesetzt wird?
2. **Was passiert bei count >= 5 (OPEN)?** Wird `esp_mqtt_client_stop()` aufgerufen? Wird der Client destroyed? Oder nur ein Flag gesetzt?
3. **Interferiert der CB mit ESP-IDF Auto-Reconnect?** ESP-IDF hat eigenen Reconnect-Mechanismus. Der CB zaehlt Disconnects und koennte:
   - Den Client stoppen → ESP-IDF Auto-Reconnect greift nicht mehr
   - Den Client destroyen und neu erstellen → Doppelter Client
   - Nichts tun (nur zaehlen) → Dann ist der CB irrelevant fuer den Bug
4. **Wird `esp_mqtt_client_reconnect()` manuell aufgerufen?** Falls ja: Kann das mit Auto-Reconnect kollidieren?
5. **Gibt es `esp_mqtt_client_stop()` oder `esp_mqtt_client_destroy()` Aufrufe?** Falls ja: In welchem Kontext?

**Kern-Hypothese:** Der CB oder anderer Custom-Code ruft `esp_mqtt_client_stop()` oder `esp_mqtt_client_disconnect()` auf, und danach greift der ESP-IDF Auto-Reconnect nicht mehr. ODER: Der ESP-IDF Client reconnected korrekt, aber die Verbindung scheitert am TLS-Layer (→ Block C).

**Ergebnis Block B:** Zustandsdiagramm des CB (CLOSED → HALF_OPEN → OPEN → CLOSED) mit allen Triggern und Aktionen.

### Block C: TLS/Socket-Layer

Der Log zeigt `[sock=48] select() timeout` — IMMER Socket 48. Das bedeutet entweder:
- **Gleicher Socket wird wiederverwendet** (alter Socket nicht geschlossen) → broken Socket bleibt offen
- **Neuer Socket bekommt zufaellig gleiche FD-Nummer** (unwahrscheinlich bei so vielen Versuchen)

Pruefen:
1. Wird TLS ueberhaupt verwendet? Wenn ja: Wo ist das Zertifikat konfiguriert? (`cert_pem`, `client_cert_pem`)
2. Falls KEIN TLS: Warum kommt `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT`? ESP-IDF nutzt esp-tls auch fuer Plain-TCP wrapping.
3. Gibt es eine `esp_tls_conn_destroy()` oder `esp_transport_close()` irgendwo?
4. Was sagt Mosquitto auf dem Pi 5? Log pruefen: `sudo tail -f /var/log/mosquitto/mosquitto.log` (oder `journalctl -u mosquitto`). Sieht Mosquitto den Connection-Versuch ueberhaupt?
5. Gibt es ein `max_connections` Limit in Mosquitto? Default ist unbegrenzt, aber eine Config koennte das limitieren.

**Kern-Hypothese:** Der alte Socket (48) wird nicht korrekt geschlossen. Der neue Connection-Versuch blockiert im TLS-Handshake weil der Broker den alten Socket noch als offen betrachtet. Das erklaert den dauerhaften TLS-Timeout.

**Ergebnis Block C:** Bestaetigung oder Widerlegung der Socket-Hypothese. Falls bestaetigt: Wo genau muss der Socket geschlossen werden?

### Block D: Dual-Task Kontext

Die RTOS-IMPL hat:
- **Safety-Task** auf Core 1 (Offline-Rules, Aktor-Safety)
- **Comm-Task** auf Core 0 (MQTT, Sensor-Publishing)
- ESP-IDF MQTT-Client erstellt **eigenen Task** (Standard bei esp_mqtt_client_init)

Pruefen:
1. Auf welchem Core laeuft der ESP-IDF MQTT-Task? Default: kein Core-Pinning. Kann mit Comm-Task kollidieren.
2. Gibt es Mutex-Locks die den MQTT-Event-Handler blockieren? Wenn ein Mutex von der Safety-Task gehalten wird und der MQTT-Handler darauf wartet → Deadlock.
3. Wird `mqtt_event_handler_cb` im MQTT-Task oder im Comm-Task aufgerufen? Falls im falschen Kontext: Thread-Safety-Problem.
4. Gibt es `xSemaphoreTake` mit `portMAX_DELAY` in einem Pfad der den MQTT-Task blockieren koennte?

**Ergebnis Block D:** Task-Diagramm mit allen relevanten Tasks, deren Cores, Prioritaeten, und shared Mutexes.

### Block E: WiFi-Connectivity

Ausschliessen dass WiFi das Problem ist:
1. Gibt es `wifi_event_handler` Code? Was loggt er bei Disconnect?
2. Gibt es RSSI-Monitoring? WiFi kann "connected" sein aber mit sehr schwachem Signal → TCP-Timeouts.
3. Ist WiFi Power-Save aktiv? (`WIFI_PS_MIN_MODEM` oder `WIFI_PS_MAX_MODEM`). Power-Save kann TLS-Handshake stoeren.
4. Kann man mit `ping` vom ESP zum Broker pruefen ob TCP grundsaetzlich funktioniert?

**Ergebnis Block E:** WiFi als Ursache ausgeschlossen oder bestaetigt.

---

## Vorab bekannte Fakten (codebase-check 2026-03-31)

> **Agent-Hinweis:** Diese Fakten sind bereits verifiziert — nicht nochmal analysieren, direkt nutzen.

### Block A — MQTT Config (`mqtt_client.cpp:168-189`)

| Feld | Wert | Status |
|------|------|--------|
| `uri` | `mqtt://host:port` | Kein TLS — plain TCP |
| `buffer_size` | 4096 | ✅ ausreichend |
| `out_buffer_size` | 2048 | ✅ ausreichend |
| `task_stack` | 10240 | ✅ ausreichend |
| `task_prio` | 3 | ⚠️ gleich wie CommTask auf Core 0 |
| `disable_clean_session` | 0 | Clean Session ON — on_connect_callback_ re-subscribed |
| `network_timeout_ms` | NICHT GESETZT | Default 10s TCP-Connect-Timeout |
| `reconnect_timeout_ms` | NICHT GESETZT | Exponentieller Backoff ohne Ceiling |
| `disable_auto_reconnect` | NICHT GESETZT | Default false — Auto-Reconnect ON ✅ |

**Wichtig:** `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT` ist kein TLS-Fehler. ESP-IDF nutzt `esp-tls` auch fuer plain TCP. Der Fehler bedeutet: TCP connect() select()-Timeout — Broker antwortet nicht auf SYN.

### Block B — CircuitBreaker (`mqtt_client.cpp:84`, `circuit_breaker.cpp`)

CB-Konfiguration: `CircuitBreaker("MQTT", 5, 30000, 10000)` — 5 failures → OPEN, 30s recovery, 10s half-open.

| Event | CB-Aufruf |
|-------|-----------|
| `MQTT_EVENT_CONNECTED` | `recordSuccess()` → count=0 |
| `MQTT_EVENT_DISCONNECTED` | `recordFailure()` → count++ |
| `MQTT_EVENT_ERROR` | **kein Aufruf** — TCP-Timeouts werden nicht gezaehlt |
| Core 1 Publish (queue enqueue) | `recordSuccess()` — auch wenn disconnected! |

**Root Cause "1→2→3→1":** Safety-Task (Core 1) enqueued einen Publish erfolgreich → `recordSuccess()` → count reset → danach MQTT_EVENT_DISCONNECTED → count=1. CB erreicht OPEN nie, weil Core 1 periodisch resettet. Zusaetzlich: `MQTT_EVENT_ERROR` inkrementiert den CB nicht — TCP-Timeouts sind fuer den CB unsichtbar.

### Block C — Socket

`sock=48` ist normales LWIP-Verhalten: FD wird nach `close()` recycled. Gleiche FD-Nummer = kein Socket-Leak. Eigentlicher Bug: TCP SYN erreicht den Broker nicht (oder Broker lehnt ab). Mosquitto-Log auf Pi 5 entscheidend.

### Block D — Tasks

| Task | Core | Prio | Stack |
|------|------|------|-------|
| CommTask (`communication_task.cpp`) | 0 | 3 | 6144 |
| ESP-IDF MQTT Task (intern) | 0 | 3 (`task_prio`) | 10240 |
| SafetyTask (`safety_task.h`) | 1 | 5 | — |

**Race Condition:** `circuit_breaker_` wird von Core 0 (MQTT event handler) und Core 1 (Safety-Task publish via `queuePublish`) **ohne Mutex** verwendet.

### Block E — WiFi

`WiFi.setAutoReconnect(false)` in `wifi_manager.cpp:60` — korrekt, WiFiManager managed manuell (30s Intervall, 10 Versuche, 20s Timeout).

### Offene Kernfrage

Warum antwortet Mosquitto auf dem Pi 5 nicht auf neue TCP-SYNs? Kandidaten:
1. Mosquitto `max_connections` oder Client-ID-Limit
2. Pi 5 hat half-open TCP-Session der alten Verbindung noch offen
3. iptables/conntrack blockiert neue Verbindungen vom selben src-IP
4. WiFi-Signal zu schwach — TCP-Pakete verloren (trotz `WiFi.isConnected() == true`)

---

## Fix-Strategie (nach Analyse)

Basierend auf den wahrscheinlichsten Root Causes, hier die erwarteten Fixes. Der genaue Fix haengt vom Analyse-Ergebnis ab.

### Fix-Richtung 1: ESP-IDF MQTT Config korrigieren (sehr wahrscheinlich)

Bereits gesetzt (nicht anfassen): `buffer_size = 4096`, `out_buffer_size = 2048`, `task_stack = 10240`.

Fehlend — falls nicht gesetzt, ergaenzen:

```cpp
// In mqtt_client.cpp, bestehende esp_mqtt_client_config_t ergaenzen:
mqtt_cfg.network_timeout_ms = 15000;        // 15s statt Default 10s
mqtt_cfg.reconnect_timeout_ms = 5000;       // Startwert 5s (ESP-IDF verdoppelt exponentiell)
mqtt_cfg.disable_auto_reconnect = false;    // ESP-IDF managed Reconnect
```

### Fix-Richtung 2: CircuitBreaker anpassen (wahrscheinlich)

Wenn der CB den ESP-IDF-Client stoert:

**Option A:** CB fuer MQTT komplett entfernen und ESP-IDF Auto-Reconnect vertrauen. Der ESP-IDF Client hat eigenen Backoff (exponentiell, bis `reconnect_timeout_ms` Maximum).

**Option B:** CB nur als Monitoring/Logging nutzen (zaehlen, aber nie eingreifen):

```cpp
// Statt:
if (count >= threshold) {
    esp_mqtt_client_stop(client);  // ← DAS NICHT
}

// Besser:
if (count >= threshold) {
    LOG_W(TAG, "MQTT CB: %d failures in %ds — ESP-IDF auto-reconnect handles recovery", count, window);
    // KEIN stop/destroy/reconnect Aufruf
}
```

### Fix-Richtung 3: Socket-Cleanup (falls Block C bestaetigt)

Wenn der alte Socket nicht geschlossen wird:

```cpp
// Im MQTT_EVENT_DISCONNECTED Handler:
void onMqttDisconnected() {
    // ESP-IDF sollte das automatisch machen, aber sicherheitshalber:
    // NICHTS manuell am Transport machen — ESP-IDF managed den Socket
    // Nur Logging + State-Update
    LOG_W(TAG, "MQTT disconnected — ESP-IDF auto-reconnect active");
}
```

Falls Custom-Code den Transport manuell managed (z.B. `esp_mqtt_client_stop()` + `esp_mqtt_client_start()`), muss das entfernt werden. ESP-IDF handled Reconnect besser als Custom-Code.

### Fix-Richtung 4: Mosquitto-Konfiguration (Server-Seite)

Falls Mosquitto die Verbindungen ablehnt:

```
# /etc/mosquitto/mosquitto.conf
max_connections -1           # Unbegrenzt (Default)
persistent_client_expiration 0  # Keine Session-Expiration
```

Log pruefen: `sudo journalctl -u mosquitto -f` waehrend des ESP-Reconnect-Versuchs.

---

## Implementierungs-Reihenfolge

1. **Analyse Block A-E durchfuehren** (~3-4h)
   - Alle Fragen beantworten, Code-Referenzen dokumentieren
   - Root Cause identifizieren
2. **Fix implementieren** basierend auf Root Cause (~2-4h)
   - MQTT Config korrigieren
   - CircuitBreaker anpassen falls noetig
   - Socket-Cleanup falls noetig
3. **Testen** (~1h)
   - ESP booten, warten bis Heartbeat laeuft
   - Mosquitto neustarten (`sudo systemctl restart mosquitto`)
   - Beobachten ob ESP reconnected (Ziel: < 30s)
   - WiFi kurz trennen und wiederherstellen
   - ESP muss in allen Szenarien reconnecten

---

## Akzeptanzkriterien

- [ ] Alle 5 Analyse-Bloecke (A-E) beantwortet mit Code-Referenzen
- [ ] Root Cause identifiziert und begruendet
- [ ] ESP-IDF MQTT Config dokumentiert (alle Felder)
- [ ] CircuitBreaker-Zustandsdiagramm erstellt
- [ ] ESP reconnected nach Mosquitto-Restart in < 30s
- [ ] ESP reconnected nach WiFi-Unterbrechung in < 30s
- [ ] Kein dauerhafter TLS-Timeout-Loop
- [ ] CircuitBreaker interferiert nicht mit ESP-IDF Auto-Reconnect
- [ ] Heap bleibt stabil bei wiederholten Reconnects (kein Leak)

---

## Abgrenzung

- **NICHT:** clean_session Fix (→ SAFETY-P4-NVS-FINAL)
- **NICHT:** QoS Fix (→ L1)
- **NICHT:** Offline-Rule-Logik (→ FIX-FW-OFFLINE-SAFETY)
- **NICHT:** Frontend Logic Builder UX
- **NICHT:** Server-seitige Logic Engine
- **NICHT:** MQTT-Auth/ACL (→ ANALYSE-1)

---

## Betroffene Dateien (erwartet)

| Datei | Aenderung |
|-------|-----------|
| `src/services/communication/mqtt_client.cpp` | Config korrigieren, ggf. CircuitBreaker-Interaktion fixen |
| `src/services/communication/mqtt_client.h` | Ggf. Config-Konstanten |
| `src/error_handling/circuit_breaker.cpp` | Ggf. MQTT-spezifisches Verhalten anpassen |
| `src/tasks/communication_task.cpp` | Ggf. MQTT-Task-Interaktion |
