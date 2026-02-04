# AutomationOne - Entwicklungsregeln

> **IMMER befolgen. Keine Ausnahmen.**

---

## 1. Architektur-Prinzipien

### Server-Zentrische Architektur (UNVERÄNDERLICH)

```
ESP32 = Rohdaten senden + Befehle empfangen
Server = ALLE Intelligenz, Validierung, Business-Logic
```

- **NIEMALS** Business-Logic auf ESP32 implementieren
- **NIEMALS** Datenverarbeitung auf ESP32 (außer RAW-Sensor-Auslesung)
- **NIEMALS** Entscheidungslogik auf ESP32
- ESP32 ist ein "dummer Agent" - absichtlich so designed

### MQTT-Protokoll

- **NIEMALS** Topic-Schema ändern ohne Dokumentation in `El Trabajante/docs/Mqtt_Protocoll.md`
- **NIEMALS** Payload-Struktur ändern ohne ESP32 + Server Kompatibilität zu prüfen
- Topic-Änderungen betreffen IMMER: ESP32 + Server + ggf. Frontend

---

## 2. Coding-Standards (Industrielles Niveau)

### VOR jeder Implementierung

```
1. Codebase-Analyse durchführen
2. Bestehende Patterns finden (grep/find)
3. Vorhandene Funktionen, Methoden, APIs identifizieren
4. Lösung auf Basis des Bestehenden entwerfen
```

### Patterns erweitern, NICHT neu bauen

```bash
# Patterns finden
grep -r "class.*Manager" src/
grep -r "def handle_" src/
grep -r "async function" src/
```

- Vorhandene Patterns kopieren und anpassen
- **KEINE** parallelen Implementierungen
- **KEINE** alternativen Lösungswege wenn Pattern existiert
- Bei Unsicherheit: FRAGEN bevor neu implementieren

### Qualitäts-Anforderungen

| Aspekt | Anforderung |
|--------|-------------|
| **Robustheit** | Fehlertoleranz, Graceful Degradation, keine Crashes |
| **Funktionalität** | Vollständig implementiert, keine Stubs/TODOs in Production |
| **Industrielles Niveau** | Wie Siemens, Rockwell, Schneider Electric |
| **Flexibilität** | Erweiterbar ohne Breaking Changes |
| **Dynamik** | Konfigurierbar ohne Code-Änderungen wo möglich |
| **Sicherheit** | Input-Validierung, keine Injection-Risiken |

---

## 3. Konsistenz & Kompatibilität

### Namenskonventionen (STRIKT einhalten)

| Komponente | Konvention | Beispiel |
|------------|------------|----------|
| ESP32 C++ | snake_case | `sensor_manager`, `handle_mqtt_message` |
| Python | snake_case | `sensor_service`, `handle_sensor_data` |
| Vue/TS | camelCase | `sensorData`, `handleSensorUpdate` |
| Types/Interfaces | PascalCase | `SensorConfig`, `ESPDevice` |
| Konstanten | UPPER_SNAKE | `MAX_SENSORS`, `MQTT_QOS` |
| Dateien (ESP32) | snake_case | `sensor_manager.cpp` |
| Dateien (Python) | snake_case | `sensor_service.py` |
| Dateien (Vue) | PascalCase | `SensorCard.vue` |

### Struktur & Einbindung

- Neue Dateien in **bestehende Ordnerstruktur** einordnen
- **KEINE** neuen Top-Level-Ordner ohne explizite Genehmigung
- Imports folgen bestehendem Pattern der Komponente
- Re-Exports in `index.ts`/`__init__.py` aktualisieren

### Rückwärtskompatibilität

- API-Änderungen: Alte Endpoints/Parameter weiter unterstützen
- MQTT-Änderungen: Alte Payload-Felder nicht entfernen
- DB-Änderungen: Alembic Migration mit Rollback-Möglichkeit
- Breaking Changes: NUR mit expliziter Genehmigung

---

## 4. Ressourcen & Performance

### ESP32 (Kritisch - Limitierte Ressourcen)

- **RAM:** Heap-Nutzung minimieren, keine dynamischen Allokationen in Loops
- **Flash:** Keine unnötigen Strings, PROGMEM wo möglich
- **Stack:** Keine großen lokalen Arrays, Rekursion vermeiden
- **Watchdog:** Tasks müssen regelmäßig yielden

### Server (Python)

- Async wo möglich für I/O-Operationen
- Database-Sessions korrekt schließen
- Keine Memory-Leaks in Long-Running-Services
- Bulk-Operationen statt Einzelabfragen

### Frontend (Vue)

- Reactive State sparsam einsetzen
- WebSocket-Subscriptions aufräumen (cleanup in onUnmounted)
- Keine Memory-Leaks durch Event-Listener

---

## 5. Fehlertoleranz & Sicherheit

### Fehlerbehandlung

```
IMMER:
✓ Try-Catch um externe Operationen (MQTT, DB, HTTP)
✓ Sinnvolle Fehlermeldungen (nicht "Error occurred")
✓ Logging bei Fehlern (mit Kontext)
✓ Graceful Degradation (System läuft weiter)

NIEMALS:
✗ Exceptions verschlucken (catch ohne Handling)
✗ Generic Error-Messages ohne Kontext
✗ System-Crash bei Einzelfehlern
```

### Seiteneffekte vermeiden

- Funktionen sollten vorhersagbar sein
- Keine versteckten State-Änderungen
- Dokumentieren wenn Seiteneffekte unvermeidbar

### Funktionale Kollisionen prüfen

Vor Implementierung prüfen:
- Gibt es bereits ähnliche Funktionalität?
- Könnte meine Änderung bestehende Features brechen?
- Welche anderen Module nutzen die betroffenen Funktionen?

---

## 6. Workflow bei Code-Änderungen

```
1. ANALYSE
   └─► Relevanten Skill lesen
   └─► Betroffene Dateien identifizieren
   └─► Bestehende Patterns finden

2. PLAN
   └─► Lösung auf Basis bestehender Patterns
   └─► Cross-Component Impact prüfen (ESP32 ↔ Server ↔ Frontend)
   └─► Bei Unsicherheit: FRAGEN

3. IMPLEMENTIERUNG
   └─► Pattern erweitern, nicht neu bauen
   └─► Namenskonventionen einhalten
   └─► Fehlerbehandlung implementieren

4. VERIFIKATION
   └─► Tests ausführen
   └─► Manuelle Prüfung der Änderung
   └─► Cross-Component testen falls MQTT/API betroffen

5. DOKUMENTATION
   └─► Code-Kommentare wo nötig
   └─► API-Docs aktualisieren falls Endpoints geändert
   └─► MQTT-Protokoll aktualisieren falls Topics geändert
```

---

## 7. Verbotene Aktionen

| Aktion | Grund |
|--------|-------|
| Business-Logic auf ESP32 | Architektur-Verletzung |
| MQTT-Topics ohne Doku ändern | Bricht Kompatibilität |
| Neue Patterns bei existierenden | Inkonsistenz |
| Code ohne Fehlerbehandlung | Nicht produktionsreif |
| Breaking Changes ohne Genehmigung | Rückwärtskompatibilität |
| Große Refactorings ohne Plan | Risiko |

---

**Diese Regeln gelten IMMER. Bei Konflikten: FRAGEN statt annehmen.**
