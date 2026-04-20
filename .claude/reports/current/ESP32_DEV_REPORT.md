# ESP32 Dev Report: AUT-57 — safePublish retries-Parameter Fix

## Modus: B (Implementierung)

## Auftrag
SafePublish ignoriert `retries`-Parameter effektiv und macht nur 2 Versuche.
Umbau auf echte retry-gesteuerte Schleife mit Backoff+Jitter und CB-Respekt.

## Codebase-Analyse

### Analysierte Dateien
- `El Trabajante/src/services/communication/mqtt_client.h` (277 Zeilen)
- `El Trabajante/src/services/communication/mqtt_client.cpp` (1768 Zeilen)
- `El Trabajante/src/error_handling/circuit_breaker.h` (API-Referenz)
- 8 Callsites: main.cpp, intent_contract.cpp (×2), actuator_manager.cpp (×3), config_response.cpp (×2)

### Befund (IST-Zustand)
```cpp
// Zeile 633-656: retries-Parameter wird KOMPLETT ignoriert
bool safePublish(..., uint8_t retries) {
    // CB check → publish → CB check → yield → publish → return false
    // = immer genau 2 Versuche, unabhängig von retries
}
```

### Patterns gefunden
- `computeReconnectJitterMs_()`: Exponential backoff + `esp_random()` Jitter — Referenz-Pattern
- `isCriticalPublishTopic()`: Bereits vorhanden für Kritikalitätsprüfung (war aber nur im ESP-IDF ifdef)
- `delay()` / `vTaskDelay()`: Standardmechanismus für nicht-blockierende Pausen in FreeRTOS

## Qualitätsprüfung (8-Dimensionen-Checkliste)

| # | Dimension | Ergebnis |
|---|-----------|----------|
| 1 | Struktur & Einbindung | ✅ Keine neuen Dateien, gleiche Ordnerstruktur |
| 2 | Namenskonvention | ✅ `safe_publish_retry_count_` mit `_` Suffix, snake_case |
| 3 | Rückwärtskompatibilität | ✅ Signatur unverändert, Default retries=3 bleibt. Verhalten jetzt korrekt: retries=1 → 2 Versuche (vorher auch ~2), retries=3 → 4 Versuche (vorher 2) |
| 4 | Wiederverwendbarkeit | ✅ Nutzt existierendes `isCriticalPublishTopic()`, `esp_random()` Pattern |
| 5 | Speicher & Ressourcen | ✅ +4 Bytes RAM (uint32_t Counter). Kein Heap, keine dynamische Allokation |
| 6 | Fehlertoleranz | ✅ CB-Check vor jedem Attempt. Kritische Topics bekommen einen Versuch auch bei CB OPEN |
| 7 | Seiteneffekte | ✅ `isCriticalPublishTopic()` aus `#ifndef` Guard herausgezogen → jetzt in beiden Backends verfügbar (war vorher nur ESP-IDF). Kein Breaking Change |
| 8 | Industrielles Niveau | ✅ Exponential backoff (50/100/200/250ms cap) + Jitter (0-31ms). Kein Blocking in ISR. delay() = vTaskDelay auf ESP32 |

## Cross-Layer Impact

| Bereich | Impact |
|---------|--------|
| Server (heartbeat_handler) | Neues Telemetrie-Feld `safe_publish_retry_count` im Heartbeat-Payload — Server ignoriert unbekannte Felder (JSON) |
| Frontend (ESPHealthWidget) | Kein Impact — Frontend zeigt nur bekannte Felder an |
| MQTT-Payloads | Heartbeat-Payload +1 JSON-Feld (ca. 35 Bytes). Kein Topic geändert |
| Error-Codes | Keine neuen Codes. Bestehende `ERROR_MQTT_PUBLISH_FAILED` unverändert |

## Ergebnis: Geänderte Dateien

### A) `El Trabajante/src/services/communication/mqtt_client.cpp`

1. **`isCriticalPublishTopic()` verschoben** (Zeile ~30): Aus `#ifndef MQTT_USE_PUBSUBCLIENT` Guard herausgezogen, damit beide MQTT-Backends darauf zugreifen können.

2. **`safePublish()` komplett umgeschrieben**: Echte Retry-Schleife `for (attempt = 0; attempt < retries+1; ++attempt)` mit:
   - CB-Check **vor jedem** Attempt (früher Abbruch)
   - Kritische Topics: 1 Versuch auch bei CB OPEN (bestehendes Verhalten erhalten)
   - Exponential Backoff: 50ms → 100ms → 200ms → 250ms (cap)
   - Jitter: `esp_random() & 0x1F` = 0-31ms pro Retry
   - `delay()` = `vTaskDelay()` auf ESP32 (RTOS-kompatibel, yield-basiert)

3. **Constructor**: `safe_publish_retry_count_(0)` initialisiert.

4. **Getter**: `getSafePublishRetryCount()` implementiert.

5. **Heartbeat-Payload**: `safe_publish_retry_count` Feld eingefügt (zwischen `sensor_command_queue_overflow_count` und `config_status`).

### B) `El Trabajante/src/services/communication/mqtt_client.h`

1. **Public API**: `uint32_t getSafePublishRetryCount() const;` hinzugefügt.
2. **Private Member**: `uint32_t safe_publish_retry_count_;` hinzugefügt.

## Verifikation

```
pio run -e esp32_dev → SUCCESS (13.03s)
RAM:   36.7% (120220 / 327680 bytes)
Flash: 95.1% (1495161 / 1572864 bytes)
Exit Code: 0
```

Keine Tests für `safePublish` im Repo vorhanden (`El Trabajante/test/` hat keinen safePublish-Test).

## Restrisiken

| Risiko | Schwere | Mitigation |
|--------|---------|------------|
| **delay() in MQTT-Event-Context**: `safePublish` kann aus dem ESP-IDF MQTT-Event-Handler aufgerufen werden (z.B. config_response). Bei retries=3 max ~443ms Blockierung des MQTT-Tasks. | Mittel | Default retries=3 ergibt worst-case ~443ms. MQTT-Task hat interne 100ms-Loops. Bei Latenz-Sensitivität retries auf 1 setzen. |
| **Core-1 Retries wenig effektiv**: Vom Safety-Task (Core 1) routet `publish()` über die Queue — Queue-Enqueue ist schnell (~µs). Retries bei Queue-Full sinnvoll, bei normalem Betrieb nicht. | Niedrig | Kein Schaden — Queue-Retry ist billig. |
| **Heartbeat-Payload wächst**: +35 Bytes pro Heartbeat. | Niedrig | payload.reserve(1900) hat Headroom. Heartbeat-Buffer ist 4096 Bytes. |
| **Kein Reset des Counters**: `safe_publish_retry_count_` ist kumulativ über die gesamte Laufzeit. | Info | Reboot setzt zurück. Für Delta-Analyse: Server kann letzten Wert speichern. |

## Empfehlung

- **server-dev**: Optional `safe_publish_retry_count` in `heartbeat_handler.py` als Telemetrie-Feld persistieren (nicht blockierend).
- **Kein mqtt-dev nötig**: Keine Topic-Änderung, nur Payload-Erweiterung.
