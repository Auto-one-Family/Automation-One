# SAFETY-RTOS-IMPL — Phase M5 (Cleanup + Monitoring): Abschlussbericht IST

**Referenz:** `auftrag-SAFETY-RTOS-IMPL-dual-task-migration-2026-03-30.md` (Abschnitt Phase M5)  
**Voraussetzung:** Phasen M0–M4 abgeschlossen (Dual-Task, ESP-IDF MQTT auf `esp32_dev`, Thread-Safety).

---

## 1. Abweichung zur ursprünglichen M5.1-Formulierung (bewusst)

Die Auftrags-PDF sprach von `MQTT_USE_ESP_IDF=1` und vollständiger Entfernung von PubSubClient.

**Ist-Architektur (M5.1 umgesetzt):**

| Aspekt | Spezifikation (historisch) | Implementierung |
|--------|---------------------------|-----------------|
| Build-Schalter | `MQTT_USE_ESP_IDF` | **`MQTT_USE_PUBSUBCLIENT=1`** nur für **seeed_xiao_esp32c3** und **Wokwi** (`wokwi_simulation`, `wokwi_esp01` …). **`esp32_dev`:** kein Define → **ESP-IDF** `<mqtt_client.h>` (SDK), kein PubSubClient in `lib_deps`. |
| Offline-Puffer | `offline_buffer_[]` entfernen | Nur im **PubSubClient-Pfad** kompiliert; **ESP-IDF:** Outbox, `hasOfflineMessages()` → false. |
| Begründung Fallback | — | Wokwi/Single-Core-Szenarien: ESP-IDF-MQTT-Task nicht sinnvoll nutzbar; siehe Kommentare in `platformio.ini`. |

Damit ist M5.1 für das **Produktions-Target `esp32_dev`** erfüllt; PubSubClient bleibt **nur** für dokumentierte Nischen-Environments.

---

## 2. Umsetzung nach Arbeitspaketen

### M5.1 PubSubClient / ESP-IDF

- **`esp32_dev`:** keine `knolleary/PubSubClient`-Abhängigkeit; MQTT über `esp_mqtt_client`-API (`mqtt_client.h` aus SDK, siehe Kommentar in `mqtt_client.h` zum Namenskonflikt).
- **Conditional:** `#ifndef MQTT_USE_PUBSUBCLIENT` = ESP-IDF-Zweig; `#ifdef MQTT_USE_PUBSUBCLIENT` = PubSubClient + `offline_buffer_`, manueller Reconnect.
- **`g_mqtt_connected`:** nur ESP-IDF-Pfad (`mqtt_client.h`).

### M5.2 `loop()` minimal

`main.cpp`: Wenn `g_safety_rtos_tasks_created` gesetzt ist:

```cpp
void loop() {
  if (!g_safety_rtos_tasks_created) {
    loopLegacySingleThreadedWhenNoRtosTasks();
    return;
  }
  vTaskDelay(pdMS_TO_TICKS(1000));
}
```

Ohne RTOS-Tasks (früher Provisioning-Pfad) läuft weiterhin die Legacy-Schleife — kein leerer Spin.

### M5.3 Logging-TAGs

| Präfix / TAG | Verwendung |
|--------------|------------|
| `SAFETY` | Safety-Task (`safety_task.cpp`), relevante Safety-Logs |
| `COMM` | Communication-Task (`communication_task.cpp`) |
| `MQTT` | `mqtt_client.cpp` (`static const char* TAG = "MQTT"`) |
| `SYNC` | Queues/Mutex-Init (`publish_queue`, `actuator_command_queue`, `rtos_globals`, …) |
| `MEM` | Heap-Zeile in `MQTTClient::publishHeartbeat()` |

Bestehende Module-Logs (Sensor/Aktor) unverändert — wie gefordert.

### M5.4 Dauerhaftes Monitoring

| Ort | Intervall | Inhalt |
|-----|-----------|--------|
| Safety-Task | ca. 60 s (6000 × 10 ms Tick) | Stack High Water Mark in Bytes (`uxTaskGetStackHighWaterMark(g_safety_task_handle)` × `sizeof(StackType_t)`) |
| Communication-Task | 60 s (`handleHeapMonitoring`) | Free heap, min heap, optional Stack HWM Comm-Task |
| Heartbeat-Pfad | `HEARTBEAT_INTERVAL_MS` (**60 s** in `mqtt_client.h`) | `LOG_I("MEM", "[MEM] Free heap …")` direkt in `publishHeartbeat()` |

**Hinweis:** Die M5-Beispieltexte nennen teils „30 s“ für Heartbeat/MEM. Im Code ist das Heartbeat-Intervall **60 s** (`HEARTBEAT_INTERVAL_MS`); der Server nutzt großzügige Offline-Schwellen (z. B. 300 s) — konsistent. Zusätzlich liefert der Comm-Task alle 60 s Heap+Stack — Redundanz für Langzeit-Diagnose ist akzeptiert.

---

## 3. Build-Messung (Verifikation)

**Datum:** 2026-03-31  
**Befehl:** `pio run -e esp32_dev` (aus `El Trabajante/`)

| Metrik | Wert | Soll Gesamt-Spez (nach M0–M5) |
|--------|------|--------------------------------|
| Flash | **86,9 %** (1.366.429 / 1.572.864 B) | &lt; 90 % |
| RAM (statisch) | **21,3 %** (69.652 / 327.680 B) | &lt; 25 % |
| Ergebnis | SUCCESS | — |

---

## 4. Akzeptanzkriterien M5 (Checkliste)

- [x] **esp32_dev:** Kein PubSubClient in der Binary (kein `lib_deps`-Eintrag); PubSubClient-Code nur anderer Environments.
- [x] Kompiliert ohne Fehler (`pio run -e esp32_dev`). *(Optional: `-Wall -Wextra` ist nicht als Standard in `platformio.ini` gesetzt — bei Bedarf separat ergänzen.)*
- [x] Flash nach Cleanup gemessen und dokumentiert (siehe Abschnitt 3).
- [x] Stack-Monitoring Safety-Task aktiv; Comm-Task loggt Stack HWM + Heap.
- [x] Heap-Monitoring: `MEM` bei Heartbeat + Comm-Task-Heap-Log.
- [x] Log-TAGs für Task-/MQTT-/Sync-/MEM-Pfade konsistent.

---

## 5. Gesamt-Verifikation (Spezifikation Ende Auftrag — Status)

Die folgenden Punkte sind **Prozess-/Hardware-Tests** und werden hier nicht als „im Code erledigt“ markiert, sondern als offene Validierung auf realem ESP32 (laut Hauptauftrag: Wokwi ungeeignet für KERN-Tests).

| Bereich | Kriterium | Status |
|---------|-----------|--------|
| Funktional | Sensoren, Aktoren, Config-Push, Heartbeat, LWT, E-Stop, Zonen, Discovery | Feldtest |
| SAFETY-P1 A–E | unverändert vorgesehen | Feldtest |
| KERN-TEST | MQTT aus, Safety-Task aktiv; ACK-Timeout bei Offline; kein WDT bei MQTT-Blockade | Feldtest |
| Performance | Loop-Zeiten, 24 h Heap, Stack HWM &gt; 1 KB | Feldtest/Langzeit |

**Code-Review-Ergebnis:** Implementierung ist mit Phase-M5-Zielen und der invertierten PubSubClient-Strategie konsistent; keine zusätzliche Komplexität eingeführt.

---

## 6. Wartung / Zukünftiges

- Bei **vollständiger** Abschaffung von PubSubClient: `MQTT_USE_PUBSUBCLIENT`-Zweig und `lib_deps` nur nach Entfall von Seeed/Wokwi-Builds entfernen.
- Heartbeat-Intervall bei Änderung von `HEARTBEAT_INTERVAL_MS`: Server-Erwartungen (Handler) kurz prüfen.

---

*Ende Bericht M5.*
