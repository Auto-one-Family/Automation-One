# Implementierungsplan — PKG-ESP-LOG-NVS-TRACE

| Feld | Wert |
|------|------|
| **Datum** | 2026-04-11 |
| **Branch** | `auto-debugger/work` (Commits nur dort; kein `master`) |
| **Paket-ID** | `PKG-ESP-LOG-NVS-TRACE` |
| **Scope** | Zusätzliche **Serial-/Logger-Zeilen** in der Firmware zur Nachverfolgung von **MQTT-Eingang**, **NVS-Transaktionen** und **Config-/Heartbeat-Pfad** — **ohne** Protokoll-, Topic- oder Payload-Schema-Änderungen. |
| **Referenz Topics** | Abgleich nur mit `.claude/reference/api/MQTT_TOPICS.md` (z. B. `…/config`, `…/system/heartbeat/ack`, `…/system/command`). |

---

## 1. IST (repo-verifiziert)

### 1.1 Vorarbeit / Tracepoint-Inventar

Die Steuerdatei erwartete Vorlage  
`.claude/reports/current/incidents/INC-ESP32-SERIAL-LOGGING-2026-04-11/IST-ESP-MQTT-NVS-TRACEPOINTS.md`  
**existiert im Repo derzeit nicht** (nur `README.md` unter dem Incident-Ordner).  

**BLOCKER (weich):** Für eine **evidenzbasierte** Lückenliste „IST-Tracepoints“ zuerst den Lauf  
`STEUER-esp32-serial-logging-nvs-mqtt-2026-04-11.md` ausführen und die IST-Datei erzeugen.  
**Dieser Plan** ist trotzdem **umsetzbar**: die unten genannten Anker stammen aus direktem `Read`/`Grep` auf den genannten Quelldateien.

### 1.2 Aktuelle Logger-Nutzung (TAGs, grobe Abdeckung)

| TAG | Datei(en) (Anker) | Kurzbeschreibung |
|-----|-------------------|------------------|
| `NVS` | `El Trabajante/src/services/config/storage_manager.cpp` (`static const char* TAG = "NVS";`, ca. Zeile 7) | Umfangreiche `LOG_*` bei Mutex, Namespace-Konflikten, Reads/Writes, Quota — **keine** explizite Dauer-Messung für `beginTransaction`/`endTransaction`. |
| `CONFIG` | `El Trabajante/src/services/config/config_manager.cpp` (ca. Zeile 12) | Lade-/Speicherpfade, u. a. `setDeviceApproved` mit `LOG_I` nach NVS (ca. 1310–1314). |
| `BOOT` | `El Trabajante/src/main.cpp` (ca. Zeile 77) | MQTT-Router `routeIncomingMessage`, Heartbeat-ACK, System-Command u. a.; bereits `LOG_I` „MQTT message received“ + `LOG_D` Payload (ca. 587–588). |
| `SYNC` | `El Trabajante/src/tasks/config_update_queue.cpp` (`CFG_Q_TAG`, ca. Zeile 25) | Queue-Erstellung, Enqueue `LOG_D`, Verarbeitung `LOG_I` pro Item (ca. 391, 405), Parse-Fehler `LOG_E` (ca. 469). |

### 1.3 Bekannte Lücken (ohne separate IST-Datei)

- **Cross-Core-Kette:** Config-Push wird in `routeIncomingMessage` (Core 0 / MQTT) nur gequeued; **Apply** passiert in `processConfigUpdateQueue` auf Core 1 — Serial-Reihenfolge muss über **korrelation_id / intent_id** lesbar gemacht werden, nicht nur über generisches „MQTT message received“.
- **Heartbeat → NVS:** `setDeviceApproved` in `config_manager.cpp` (ca. 1291+) schreibt still in NVS; außer den bestehenden `LOG_I`-Zeilen nach dem Write fehlt ein **eng gekoppelter** Trace „ACK-Status → NVS-Transaktion Start/Ende“.
- **Mutex-Owner bei Timeout:** `StorageManager` loggt Timeouts ohne blockierenden Task-Namen — **FreeRTOS liefert hier keinen Owner-Namen** ohne eigene Instrumentierung; Plan markiert das als **nicht machbar ohne zusätzliche Datenstruktur** (Abgrenzung).

---

## 2. SOLL (messbare Log-Ziele)

1. **Jeder MQTT-Eingang** im zentralen Router: neben vollem Topic (bereits `LOG_I`) zusätzlich **kompakte** Kennzahlen: Topic-Länge, letztes Pfadsegment (z. B. `config`, `heartbeat/ack`, `command`), Payload-Länge — **ohne** Payload-Inhalt auf `LOG_I` (Datenschutz/Überlauf); optionale Payload-Vorschau nur `LOG_D` und begrenzt (≤ 64 Zeichen).
2. **Config-Push:** Nach erfolgreicher Admission und **vor** `queueConfigUpdateWithMetadata`: eine Zeile mit `correlation_id`, `intent_id` (falls gesetzt), `generation`, **Payload-Länge** (bereits Grenzwert-Logik nahe `CONFIG_PAYLOAD_MAX_LEN` in `main.cpp` ca. 643+).
3. **Config-Queue (Core 1):** Beim Dequeue: dieselben IDs wie oben; nach erfolgreichem `deserializeJson`: Flags `has_sensors` / `has_actuators` / `has_offline_rules` (bool), **keine** vollständige JSON-Dump auf INFO.
4. **Sensor-Config-Handler:** `handleSensorConfig`: **Sensoranzahl** (`sensors.size()`), `correlation_id` kurz (max. 36 Zeichen UUID), Erfolg/Fail-Count vor `publishWithFailures`.
5. **Heartbeat-ACK:** Nach erfolgreicher Contract-Prüfung: `status`, `handover_epoch`, `config_available` auf INFO **einmal pro ACK** (teilweise schon `LOG_D` ca. 2194 — SOLL: mindestens ein INFO-Band für Feldbetrieb).
6. **NVS:** Pro `beginTransaction`/`endTransaction`-Paar in `setDeviceApproved`: optional **Dauer** (`micros()`-Delta) auf DEBUG — mit Hinweis **Timing-Risiko** (siehe Risiken).
7. **System-Command:** Erkennung `command`-String und `correlation_id` nach Parse (bereits Logs ca. 1082–1084) — SOLL: einheitliches Präfix z. B. `[SYS_CMD]` in **neuen** Zeilen zur grep-Freundlichkeit.

---

## 3. Log-Insertion-Matrix (Kern, Ausführungsreihenfolge Implementierung)

Spalten: **ID** | **Datei** | **Ort (Funktion / Kommentar-Anker)** | **Trigger** | **Level** | **Message-Pattern (Beispiel)** | **Datenfelder (max. Länge)** | **Abhängigkeit**

| ID | Datei | Ort (Funktion / Anker) | Trigger | Level | Message-Pattern (Beispiel) | Datenfelder (max. Länge) | Abhängigkeit |
|----|-------|------------------------|---------|-------|---------------------------|--------------------------|--------------|
| L01 | `main.cpp` | `routeIncomingMessage` — direkt nach `const String topic(t);` / vor existierendem `LOG_I` „MQTT message received“ (ca. 582–587) | jede eingehende MQTT-Nachricht | D | `[MQTT_IN] len=%u tail=%s pay_len=%u` | topic_len ≤ 3 digits; tail ≤ 32 chars (letztes `/`-Segment oder letzte 32 des Topics); payload_len ≤ 5 digits | — |
| L02 | `main.cpp` | `routeIncomingMessage` — Zweig `topic == config_topic`, **nach** erfolgreicher `shouldAcceptCommand` und **vor** `queueConfigUpdateWithMetadata` (ca. 621–665) | Config-Push zugelassen | I | `[CFG_IN] corr=%.*s gen=%lu pay_len=%u` | corr max 40; generation; pay_len | L01 |
| L03 | `config_update_queue.cpp` | `queueConfigUpdateWithMetadata` — direkt **nach** erfolgreichem `xQueueSend` (ca. 379–392) | Enqueue OK | I | `[CFG_Q] enqueued corr=%.*s intent=%.*s` | corr 40; intent_id 40 | L02 |
| L04 | `config_update_queue.cpp` | `processConfigUpdateQueue` — Zeilenanfang der Schleife nach `xQueueReceive` (ca. 404–406) | pro Queue-Item | I | `[CFG_Q] dequeue core=%u corr=%.*s` | core 1 digit; corr 40 | L03 |
| L05 | `config_update_queue.cpp` | nach erfolgreichem `deserializeJson` / vor Generation-Logik (ca. 489–498) | Parse OK | D | `[CFG_Q] scopes s=%d a=%d o=%d gen_in=%lu` | drei bool als 0/1; gen | L04 |
| L06 | `config_update_queue.cpp` | Zweig `g_config_lane_mutex` Timeout (ca. 540–556) — **ergänzen** um `correlation_id` / `intent_id` in **einer** Zeile | Mutex 500 ms | E | `[CFG_Q] lane_timeout corr=%.*s` | corr 40 | L04 |
| L07 | `main.cpp` | `handleSensorConfig` — unmittelbar nach Log „Handling sensor configuration“ (ca. 3711–3718) | Config mit `sensors` | I | `[CFG_SENS] n=%u corr=%.*s` | n ≤ 2 digits; corr 40 | L05 |
| L08 | `main.cpp` | `routeIncomingMessage` — Heartbeat-ACK Zweig nach erfolgreicher `validateServerAckContract` (ca. 2174–2193) | gültiger ACK | I | `[HB_ACK] epoch=%lu cfg_avail=%d` | epoch; cfg_available 0/1 | L01 |
| L09 | `main.cpp` | Heartbeat-ACK — vor `setDeviceApproved` (ca. 2196–2199) | status approved/online/pending/rejected | I | `[HB_ACK] status=%.*s → NVS approve` | status string ≤ 16 | L08 |
| L10 | `config_manager.cpp` | `setDeviceApproved` — Eintritt (ca. 1291) | jeder Aufruf | D | `[NVS_APPR] begin approved=%d ts=%lu` | bool; ts ulong | L09 (typisch) |
| L11 | `storage_manager.cpp` | `beginTransaction` — nach erfolgreichem `xSemaphoreTakeRecursive` (ca. 101–108) | Transaktion start | D | `[NVS_TX] begin txn=1` | — | L10 |
| L12 | `storage_manager.cpp` | `endTransaction` — unmittelbar vor `transaction_active_ = false` (ca. 125–130) | Transaktion Ende | D | `[NVS_TX] end txn=0` | — | L11 |
| L13 | `main.cpp` | `routeIncomingMessage` — System-Command Zweig nach `command` parse (ca. 1082–1085) | Topic == system command | I | `[SYS_CMD] cmd=%.*s corr=%.*s` | cmd ≤ 32; corr 40 | L01 |
| L14 | `config_manager.cpp` | `setDeviceApproved` — nach `endTransaction` (ca. 1307–1315) | NVS-Write abgeschlossen | I | bestehende Logs beibehalten; optional **Dauer** siehe NVS-Tabelle | Dauer nur DEBUG ≤ 10 Zeichen | L12 |

**Hinweis:** Konkrete Zeilennummern können sich durch Parallelarbeit verschieben — Implementierung immer über **Funktionsname + Ankerstring** aus diesem Plan verorten (`Grep`).

---

## 4. NVS-spezifische Untertabelle (Dauer & Risiko)

| API / Pfad | Datei (ca.) | Dauer-Log? | Vorschlag Level | Risiko / Mitigation |
|------------|-------------|------------|-----------------|---------------------|
| `beginTransaction` | `storage_manager.cpp` ~96–108 | Optional `micros()`-Delta nur **innerhalb** `#if defined(LOG_NVS_TIMING)` oder `LOG_D` | D | Zusätzliche `micros()`-Lesung minimal; **kein** `delay()`. |
| `beginNamespace` | `storage_manager.cpp` ~152–212 | Nein (bereits hohe Dichte); nur bei **neuen** Aufrufern ergänzen | — | Bereits `LOG_D` „Opened namespace“. |
| `endNamespace` | `storage_manager.cpp` ~215–241 | Nein | — | `LOG_D` „Closed namespace“ vorhanden. |
| `endTransaction` | `storage_manager.cpp` ~111–130 | Paar zu L11/L12 oben | D | Bei Fehlerpfaden weiterhin `LOG_E` beibehalten. |
| `setDeviceApproved` | `config_manager.cpp` ~1291–1315 | Optional Delta **nur DEBUG**, von Eintritt bis nach `endTransaction` | D | Schreibt Flash — Dauer-Logs nicht in schneller Schleife auf INFO. |

**Ehrliche Grenze:** Bei `beginTransaction`/`beginNamespace` **Lock-Timeout** liefert der aktuelle Code keine **Owner-Task-ID** in der Message — Erweiterung nur mit **Zusatzspeicher** pro Mutex-Inhaber; **nicht** Teil dieses PKG außer dokumentiertem Follow-up.

---

## 5. MQTT-Eingang (Dispatch + kritische Sub-Handler)

| Aspekt | Anker im Code | Matrix-IDs |
|--------|---------------|------------|
| Zentraler Dispatch | `routeIncomingMessage` (`main.cpp` ca. 582+) | L01 |
| Config-Push | `topic == TopicBuilder::buildConfigTopic()` (ca. 593+) | L02 |
| System-Command | `topic == TopicBuilder::buildSystemCommandTopic()` (ca. 1047+) | L13 |
| Heartbeat-ACK | `TopicBuilder::buildSystemHeartbeatAckTopic()` (ca. 2128+) | L08, L09 |

Weitere Handler (Zone, Subzone, Sensor-/Actuator-Command) sind **nicht redundant** zur Matrix, sofern L01 `tail=` ausreicht; bei Bedarf **Follow-up-PKG** (nicht PKG-CAL).

---

## 6. Tests / Verify

| Schritt | Befehl (Windows PowerShell, voller Pfad) | Erfolg |
|---------|------------------------------------------|--------|
| Firmware-Build | `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante"; pio run -e esp32_dev` | Exit-Code 0 |
| Optional native | Nur wenn **reine** Hilfsfunktionen ohne HW angefasst werden: `pio test -e native` — für dieses PKG **typisch nicht nötig** (Änderungen in `.cpp` Produktpfad). | n/a |

**Hinweis:** In `.claude/CLAUDE.md` ist zusätzlich `pio run -e seeed_xiao_esp32c3` als Beispiel genannt; **dieser Plan** bindet `esp32_dev` laut Steuerdatei (existiert in `platformio.ini`).

---

## 7. Risiken

| Risiko | Mitigation |
|--------|------------|
| **Serial-Überlauf** / hohe Last | Neue `LOG_I`-Zeilen sparsam; Details `LOG_D`; optional Compile-Flag `MQTT_TRACE_VERBOSE`. |
| **Logger-Puffer** (`LogEntry.message[128]` in `logger.h`) | Keine langen `String`-Ketten auf einem `LOG_I`; IDs kürzen (`%.36s` für UUID). |
| **Timing / Watchdog** | Keine blockierenden Prints in ISR; nur bestehende Kontexte; `micros()` nur DEBUG und nur an NVS-Grenzen. |
| **Geheimnisse** | Keine WiFi-/MQTT-Passwörter in Logs; Payload weiterhin nur `LOG_D` und truncated. |

---

## 8. Abgrenzung

- Keine Änderungen an **El Servador**, **El Frontend**, **MQTT-Topics**, QoS oder JSON-Verträgen.
- Kein **PKG-CAL-*** (Kalibrierung) in diesem Plan.
- Keine Ersetzung des bestehenden Arduino-`String`-Patterns in `storage_manager.cpp` im Rahmen dieses PKG (nur additive Logs; Refactor wäre eigenes Risiko-PKG).

---

## 9. verify-plan-Gate

Gebundener Report:  
`.claude/reports/current/auto-debugger-runs/impl-plan-esp32-logging-nvs-trace-2026-04-11/VERIFY-PLAN-REPORT.md`

---

*Ende Implementierungsplan*
