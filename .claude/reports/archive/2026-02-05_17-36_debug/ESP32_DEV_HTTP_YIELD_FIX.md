# ESP32 Dev Report: HTTP yield() Fix

**Datum:** 2026-02-05
**Agent:** esp32-dev
**Status:** ERLEDIGT

---

## Zusammenfassung

`yield()` wurde in die Warteschleifen der HTTP-Client Response-Verarbeitung eingefuegt, um Watchdog-Timeouts bei langsamen Server-Antworten zu verhindern.

---

## Geaenderte Datei

**Pfad:** `El Trabajante/src/services/communication/http_client.cpp`

---

## Aenderung 1: sendRequest() Warteschleife

**Zeile:** 292-298 (jetzt 292-299)
**Funktion:** Wartet auf erste Response-Daten vom Server

### Vorher:
```cpp
while (millis() - start_time < (unsigned long)timeout_ms) {
    if (wifi_client_.available()) {
        response_ok = readResponse(response, timeout_ms);
        break;
    }
    delay(10);
}
```

### Nachher:
```cpp
while (millis() - start_time < (unsigned long)timeout_ms) {
    if (wifi_client_.available()) {
        response_ok = readResponse(response, timeout_ms);
        break;
    }
    yield();  // Feed watchdog while waiting for response
    delay(10);
}
```

---

## Aenderung 2: readResponse() Warteschleife

**Zeile:** 331-335 (jetzt 332-337)
**Funktion:** Wartet auf weitere Daten waehrend des Response-Lesens

### Vorher:
```cpp
// Read response line by line
while (millis() - start_time < (unsigned long)timeout_ms) {
    if (!wifi_client_.available()) {
        delay(10);
        continue;
    }
```

### Nachher:
```cpp
// Read response line by line
while (millis() - start_time < (unsigned long)timeout_ms) {
    if (!wifi_client_.available()) {
        yield();  // Feed watchdog while waiting for more data
        delay(10);
        continue;
    }
```

---

## Technischer Hintergrund

### Problem
Die ESP32 Task Watchdog (TWDT) erwartet, dass der Main-Task regelmaessig "gefuettert" wird. Bei HTTP-Requests mit langsamen Server-Antworten blockierten die Warteschleifen ohne `yield()`, was zu Watchdog-Timeouts fuehrte.

### Loesung
`yield()` gibt die Kontrolle kurzzeitig an den FreeRTOS Scheduler zurueck. Dies:
1. Fuettert den Task Watchdog
2. Ermoeglicht anderen Tasks kurze Ausfuehrungszeit
3. Verhindert System-Resets bei langen Wartezeiten

### Zusammenspiel mit connect() Fix
Der vorherige Fix hatte bereits `yield()` um `wifi_client_.connect()` hinzugefuegt. Jetzt ist die gesamte HTTP-Kette abgesichert:

```
connect() [yield vorher/nachher]
    -> sendRequest() Warteschleife [yield neu]
        -> readResponse() Warteschleife [yield neu]
```

---

## Naechste Schritte

- Build-Verifikation: `pio run -e esp32_dev`
- Flash und Test mit langsamem Server (simuliert durch Server-Delay)
- Monitoring der Watchdog-Timeouts im Serial-Log

---

## Referenzen

- Pattern-Referenz: Zeile 239/247 im selben File (yield um connect())
- ESP32 Watchdog-Dokumentation: FreeRTOS TWDT
