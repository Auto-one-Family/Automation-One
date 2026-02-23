# AutomationOne — BugBot Review Rules

## Projekt-Kontext

AutomationOne ist ein modulares IoT-Framework fuer Gewaechshausautomation mit 3 Schichten:

- **El Servador** (Backend): Python 3.11/FastAPI, ~170 REST-Endpoints, 14 MQTT-Handler, PostgreSQL, SQLAlchemy async
- **El Trabajante** (Firmware): C++/Arduino, ESP32, PlatformIO, 4 Sensor-Schnittstellen, 4 Aktor-Typen
- **El Frontend**: Vue 3/TypeScript, Vite, 97 Komponenten, 20 Pinia Stores, WebSocket, Tailwind CSS

**Architektur-Prinzip:** Server-Zentrisch. ESP32 = dumme Agenten. ALLE Logik laeuft auf dem Server.

```
El Frontend (Vue 3) <--HTTP/WS--> El Servador (FastAPI) <--MQTT--> El Trabajante (ESP32)
```

**Datenfluss Sensor:** ESP32 -> MQTT -> Handler -> SensorLibrary -> DB -> WebSocket -> Frontend
**Datenfluss Aktor:** Frontend -> REST API -> SafetyCheck -> MQTT -> ESP32

---

## Allgemeine Regeln (alle Schichten)

### SAFETY-KRITISCH — Immer als CRITICAL flaggen:

1. Jede Aenderung an Emergency-Stop-Logik ist CRITICAL
2. Aenderungen am SafetyController (`safety_service.py`, `safety_controller.h`), ConflictManager, RateLimiter oder LoopDetector erfordern besondere Aufmerksamkeit
3. Alle Aktor-Befehle MUESSEN durch das Safety-System laufen — direktes Schalten ohne Safety-Check ist ein Bug
4. Circuit-Breaker-Logik darf nie umgangen werden (DB, MQTT, externe APIs)

### Error-Handling:

5. Keine bare `except:` oder `except Exception:` ohne spezifischen Grund und Logging
6. Error-Codes muessen der Taxonomie folgen: Firmware 1000-4999, Server 5000-5699 (siehe `.claude/reference/errors/ERROR_CODES.md`)
7. MQTT-Handler muessen ALLE Exceptions fangen und loggen (duerfen nie still fehlschlagen)
8. Sensor-Werte ausserhalb der Plausibilitaetsgrenzen muessen als `quality: "error"` markiert werden

### Security:

9. Keine Secrets oder Credentials hardcoded im Code (JWT_SECRET_KEY, DB-Passwoerter, API-Keys)
10. Alle API-Endpoints ausser Health-Checks MUESSEN JWT-Auth erfordern
11. MQTT-Topics muessen dem Schema `kaiser/{kaiser_id}/esp/{esp_id}/...` folgen — keine Wildcard-Publishes
12. SQL-Queries muessen parametrisiert sein (kein String-Formatting/f-Strings fuer Queries)

---

## Python-Regeln (El Servador)

### FastAPI Best Practices:

13. Async-Endpoints muessen `async def` verwenden (nicht `def` mit blocking I/O)
14. DB-Sessions muessen via `async with` gemanagt werden (kein manuelles close vergessen)
15. Pydantic-Schemas fuer ALLE Request/Response-Bodies (kein `dict` als Return-Type in Endpoints)
16. Sensor-Processing-Libraries muessen `process()` und `calibrate()` implementieren (Interface-Kontrakt)
17. MQTT-Handler in `El Servador/god_kaiser_server/src/mqtt/handlers/` muessen von `base_handler.py` erben

### Testing:

18. Neue Endpoints brauchen mindestens einen Unit-Test
19. MQTT-Handler brauchen Tests fuer: valide Message, invalide Message, fehlende Felder
20. `psutil` Import muss mit `try/except ImportError` geschuetzt sein (optionale Dependency)
21. pytest-Fixtures muessen aufgeraeumt werden (kein DB-State-Leak zwischen Tests)

### Deprecation-Vermeidung:

22. `datetime.utcnow()` ist deprecated — `datetime.now(UTC)` verwenden
23. Pydantic `class Config:` ist deprecated — `model_config = ConfigDict(...)` verwenden
24. `from_orm()` ist deprecated — `model_validate()` verwenden
25. SQLAlchemy synchrone Session-Patterns vermeiden — async verwenden

---

## C++-Regeln (El Trabajante Firmware)

### ESP32-spezifisch:

26. KEIN `delay()` in der Haupt-Loop — blockiert MQTT-Client und Watchdog
27. KEIN `String` (Arduino String-Klasse) — NUR `const char*` oder `std::string` (Heap-Fragmentierung!)
28. Alle GPIO-Pins MUESSEN ueber den GPIOManager (`drivers/gpio_manager.h`) registriert werden — kein direktes `pinMode`/`digitalWrite`
29. MQTT-Nachrichten MUESSEN ueber `TopicBuilder` (`utils/topic_builder.h`) konstruiert werden — kein manueller String-Bau
30. NVS-Zugriffe MUESSEN Fehlerbehandlung haben (Flash kann voll oder korrupt sein)
31. WiFi-Reconnect MUSS Exponential Backoff verwenden
32. Sensor-Rohdaten werden IMMER als `raw_mode: true` gesendet (Kalibrierung laeuft auf Server)
33. Heap-Allokationen in ISRs sind verboten
34. Watchdog-Timer darf NIE deaktiviert werden (nur Feed erlaubt)
35. Alle Hardware-Zugriffe MUESSEN ueber HAL-Interface (`drivers/hal/igpio_hal.h`) laufen fuer Testbarkeit

### Memory-Safety:

36. Buffer-Groessen muessen als Konstanten definiert sein (keine Magic Numbers)
37. JSON-Parsing muss mit Groessencheck erfolgen (ArduinoJson: `JsonDocument` mit definierter Kapazitaet)
38. Stack-Overflow-Schutz: Task-Stack-Groessen explizit definieren, nicht Default verwenden

---

## TypeScript/Vue-Regeln (El Frontend)

### Vue 3 Best Practices:

39. Composition API mit `<script setup lang="ts">` verwenden (kein Options API in neuen Komponenten)
40. Pinia-Stores fuer State-Management (kein lokaler reaktiver State fuer geteilte Daten), Stores in `src/stores/` oder `src/shared/stores/`
41. WebSocket-Events MUESSEN in `onUnmounted()` aufgeraeumt werden (Memory Leaks!)
42. Props muessen typisiert sein (`defineProps<Props>()` mit TypeScript-Interface)
43. API-Aufrufe gehoeren in `src/api/` Clients (18 API-Module), NICHT direkt in Komponenten
44. `vue-tsc --noEmit` muss fehlerfrei sein (keine TypeScript-Fehler akzeptieren)

### Design-System:

45. Neue UI-Komponenten MUESSEN das bestehende Design-System nutzen (`src/shared/design/primitives/` — BaseButton, BaseCard, BaseModal, BaseToggle, BaseInput, BaseSelect, BaseBadge, BaseSkeleton, BaseSpinner)
46. Layout-Komponenten: AppShell, Sidebar, TopBar aus `src/shared/design/layout/`
47. Patterns: ConfirmDialog, ContextMenu, EmptyState, ErrorState, ToastContainer aus `src/shared/design/`
48. Tailwind CSS — keine inline-Styles oder separaten CSS-Dateien, Dark Theme ONLY
49. Icons ausschliesslich aus `lucide-vue-next` — kein neues Icon-Paket installieren
50. Imports mit `@/` Alias — keine relativen `../../` Pfade

### Safety-UI:

51. Emergency-Stop-Button muss IMMER sichtbar und erreichbar sein (kein Verstecken hinter Modals)
52. Aktor-Schaltungen brauchen eine Bestaetigung (ConfirmDialog) — nie direkt bei Klick ausfuehren

---

## Cross-Layer-Regeln

### MQTT-Konsistenz:

53. Server-Handler und ESP32-Publisher muessen dasselbe Topic-Schema verwenden
54. QoS-Level muessen zur Kategorie passen: 0=Heartbeat, 1=Sensordaten, 2=Aktor-Befehle
55. Jede neue MQTT-Topic-Subscription im Server braucht einen entsprechenden Handler in `mqtt/handlers/`

### Datenfluss-Integritaet:

56. Sensor-Datenfluss: ESP -> MQTT -> Handler -> Library -> DB -> WebSocket -> Frontend — keine Abkuerzungen
57. Aktor-Befehlsfluss: Frontend -> API -> SafetyCheck -> MQTT -> ESP — Safety-Check darf NIE uebersprungen werden
58. Error-Codes muessen in `.claude/reference/errors/ERROR_CODES.md` dokumentiert sein

### Architektur-Regeln:

59. Server-Zentrisch: Logik NIEMALS auf ESP32 implementieren (ESP32 = dumme Agenten)
60. Neue Services muessen dem bestehenden Repository/Service-Pattern folgen
61. WebSocket-Events fuer Frontend-Updates muessen ueber den WebSocket-Manager (`websocket/manager.py`) laufen
