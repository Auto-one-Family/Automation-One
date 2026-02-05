# ESP32 HTTP Watchdog Crash Analysis

**Datum:** 2026-02-05
**Agent:** esp32-debug
**Trigger:** Watchdog-Crash-Loop alle ~90 Sekunden

---

## 1. Fix-Status: JA - Timeout-Fix ist im Code

### http_client.cpp - Zeilen 234-247

```cpp
// Set read timeout BEFORE connect (used by connect() internally on ESP32)
wifi_client_.setTimeout(timeout_ms);                    // ✅ Zeile 235

// Connect to server WITH TIMEOUT
yield();                                                // ✅ Zeile 239
if (!wifi_client_.connect(host, port, timeout_ms)) {   // ✅ Zeile 240 - 3 Parameter!
    ...
}
yield();                                                // ✅ Zeile 247
```

### pi_enhanced_processor.cpp - Zeilen 139-140

```cpp
HTTPResponse response = http_client_->post(url.c_str(), payload.c_str(),
                                           "application/json", 2500);  // ✅ 2500ms Timeout
```

**Bewertung:** Der Timeout-Fix wurde korrekt implementiert:
- `setTimeout()` wird VOR `connect()` aufgerufen
- `connect()` hat den dritten Parameter (timeout)
- `yield()` wird vor und nach `connect()` aufgerufen
- Timeout ist 2500ms (2.5 Sekunden)

---

## 2. Build-Status: Kompiliert - Fix ist im Build enthalten

| Datei | Timestamp (verifiziert) |
|-------|-------------------------|
| http_client.cpp (Source) | **Feb 5 21:28:36** |
| pi_enhanced_processor.cpp (Source) | **Feb 5 21:16:39** |
| firmware.elf (Build) | **Feb 5 21:30:40** |

**Timeline:**
- Source-Änderungen: 21:16 - 21:28
- Build erstellt: 21:30:40 (NACH den Source-Änderungen)
- Crash-Zeit: 21:55:02

**Schlussfolgerung:** Der Build enthält definitiv den Fix-Code.

**Problem:** Die Firmware wurde kompiliert, aber der Serial Log zeigt ~50 Sekunden Blockierung:

```
21:55:02.740 > PiEnhancedProcessor: HTTP POST START url=...
[... 50 Sekunden STILLE ...]
21:55:52.664 > E (88848) task_wdt: Task watchdog got triggered.
```

**Bei 2500ms Timeout sollte das Blockieren max 2.5 Sekunden dauern!**

---

## 3. Root Cause Analyse

### Hypothese A: Firmware nicht geflasht (WAHRSCHEINLICHSTE)

Der ESP32 läuft noch mit **alter Firmware ohne Timeout-Fix**.

**Beweis:**
- Build-Timestamp: 21:30
- Crash-Log: 21:55
- **Kein Upload-Log sichtbar zwischen Build und Crash**

### Hypothese B: readStringUntil() blockiert (MÖGLICH)

In `http_client.cpp` Zeile 337:

```cpp
String line = wifi_client_.readStringUntil('\n');
```

Diese Funktion kann **trotz setTimeout()** unbegrenzt blockieren, wenn:
- Der Server TCP-connected aber keine Daten sendet
- Die ESP32-IDF Timeout-Implementation nicht alle Operationen abdeckt

### Hypothese C: TCP SYN-Retransmit (UNWAHRSCHEINLICH)

Bei unerreichbarem Server versucht TCP mehrere SYN-Retransmits (default ~15-30 Sekunden OS-abhängig), bevor `connect()` scheitert.

---

## 4. Code-Analyse: HTTP-relevante Stellen

### sendRawData() Aufrufkette

```
sensor_manager.cpp:848   →  pi_processor_->sendRawData(raw_data, processed)
sensor_manager.cpp:955   →  pi_processor_->sendRawData(raw_data, processed)  // Multi-Value
                         ↓
pi_enhanced_processor.cpp:86  →  sendRawData()
                         ↓
pi_enhanced_processor.cpp:139 →  http_client_->post(url, payload, "application/json", 2500)
                         ↓
http_client.cpp:68       →  post() → sendRequest()
                         ↓
http_client.cpp:229      →  sendRequest(method, host, port, path, payload, content_type, timeout_ms)
                         ↓
http_client.cpp:240      →  wifi_client_.connect(host, port, timeout_ms)  // ← HIER!
http_client.cpp:281-298  →  wifi_client_.print(), readResponse()
```

### Circuit Breaker Status

`pi_enhanced_processor.cpp` Zeilen 98-116 zeigen einen funktionierenden Circuit Breaker:
- Nach 5 Failures → OPEN State
- 60 Sekunden Recovery-Timeout
- Bei OPEN: Lokaler Fallback mit Raw-Values

**Problem:** Der Circuit Breaker schützt nicht vor dem ERSTEN Timeout! Der Watchdog triggert bevor der CB greifen kann.

---

## 5. Empfehlungen

### SOFORT: Firmware flashen und verifizieren

```bash
# PlatformIO Upload
pio run -t upload -e seeed_xiao_esp32c3

# Nach Boot: Build-Timestamp im Serial Log prüfen
# Sollte zeigen: "Build: Feb  5 2026 21:30:xx"
```

### FIX 1: yield() in readResponse() Loop (KRITISCH)

**http_client.cpp Zeile 297** - Füge `yield()` hinzu:

```cpp
while (millis() - start_time < (unsigned long)timeout_ms) {
    if (wifi_client_.available()) {
        response_ok = readResponse(response, timeout_ms);
        break;
    }
    yield();  // ← FEHLEND! Watchdog füttern während Warten
    delay(10);
}
```

### FIX 2: yield() in readResponse() selbst (KRITISCH)

**http_client.cpp Zeile 331** - Füge `yield()` hinzu:

```cpp
while (millis() - start_time < (unsigned long)timeout_ms) {
    if (!wifi_client_.available()) {
        yield();  // ← FEHLEND! Watchdog füttern
        delay(10);
        continue;
    }
    String line = wifi_client_.readStringUntil('\n');
    // ...
}
```

### FIX 3: Aggressiverer Timeout (OPTIONAL)

Reduziere den HTTP-Timeout weiter auf 1500ms da LAN-Latenz minimal sein sollte:

```cpp
// pi_enhanced_processor.cpp:139-140
HTTPResponse response = http_client_->post(url.c_str(), payload.c_str(),
                                           "application/json", 1500);  // ← 1500ms statt 2500ms
```

---

## 6. Verifizierungs-Checkliste

- [ ] `pio run -t upload` erfolgreich
- [ ] Serial Log zeigt aktuellen Build-Timestamp
- [ ] HTTP POST zeigt "duration=XXXXms" Logs (nicht 50+ Sekunden)
- [ ] Circuit Breaker öffnet nach 5 Failures
- [ ] Watchdog triggert NICHT mehr

---

## 7. Zusammenfassung

| Aspekt | Status |
|--------|--------|
| Timeout-Fix im Code | ✅ JA (Zeile 240, 2500ms) |
| yield() bei connect() | ✅ JA (Zeile 239, 247) |
| yield() bei read() | ❌ FEHLT (Zeile 297, 331) |
| Firmware geflasht | ❓ UNKLAR - muss verifiziert werden |
| Circuit Breaker | ✅ Implementiert, aber schützt nicht vor erstem Timeout |

**Nächster Schritt:**
1. Firmware flashen: `pio run -t upload`
2. Build-Timestamp im Boot-Log verifizieren
3. Falls Crash weiterhin: yield() in readResponse() hinzufügen
