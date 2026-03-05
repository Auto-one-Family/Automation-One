# Auftrag: Untersuchung und Behebung — Not-Aus „Aufheben“ (clear_emergency) bei Mock-ESPs und Konsistenz mit echten ESPs

> **Erstellt:** 2026-03-03  
> **Erstellt von:** Automation-Experte (Life-Repo)  
> **Ziel-Repo:** AutomationOne (El Servador, El Frontend, Simulation, ggf. El Trabajante)  
> **Kontext:** Drei getrennte Analyse- und Fix-Aufträge aus technischem Befund (Not-Aus, Subzonen Mock, Layout Monitor).  
> **Prioritaet:** Hoch (Safety-relevant: Not-Aus-Aufheben muss zuverlaessig funktionieren)  
> **Kernursache:** Mock-Handler wertet `command` in `actuator/emergency` nicht aus; `clear_emergency` wird wie `emergency_stop` behandelt → Flag bleibt true, Aktoren bleiben deaktiviert.

---

## Ist-Zustand / Root Cause

### Frontend (korrekt angebunden)

- **EmergencyStopButton.vue:** Gruener Button „Aufheben“ ruft bei Klick `espStore.clearEmergencyAll()` auf.
- **espStore / actuatorsApi:** `clearEmergency()` → `POST /api/v1/actuators/clear_emergency` mit Body `{ esp_id: undefined, reason: 'manual' }`.
- Nach Erfolg wird `fetchAll()` ausgefuehrt, State wird neu geladen.

### Backend (korrekt implementiert)

- **El Servador** `god_kaiser_server/src/api/v1/actuators.py` (Route Zeile 876, Handler ab Zeile 884): `clear_emergency` laedt alle ESPs (oder den einen aus `request.esp_id`), sendet pro Geraet eine MQTT-Nachricht auf `kaiser/god/esp/{esp_id}/actuator/emergency` mit Payload `{"command": "clear_emergency", "reason": "..."}` und ruft `safety_service.clear_emergency_stop(esp_id)` bzw. `clear_emergency_stop(None)` auf. Serverseitiger E-Stop-Flag wird korrekt geloescht.

### Ursache des Fehlers (nur bei Mock-ESPs)

- **Mock-Actuator-Handler** behandelt das Topic `actuator/emergency` **ohne auf den Inhalt der Payload zu achten**.
- **main.py** (`god_kaiser_server/src/main.py` Zeile 305/309) registriert fuer `kaiser/+/esp/+/actuator/emergency` und `kaiser/broadcast/emergency` den `mock_actuator_command_handler`.
- **SimulationScheduler._handle_mock_message()** (scheduler.py: ESP-spezifisch Zeile 285–288, Broadcast Zeile 291–292) leitet an `_actuator_handler.handle_emergency()` bzw. `handle_broadcast_emergency()` weiter.
- **actuator_handler.py** (Zeile 171–211): `handle_emergency()` macht ausschliesslich:
  - `runtime.emergency_stopped = True`
  - alle Aktoren auf OFF setzen
  - Status publishen  
  **Es gibt keine Auswertung von `payload["command"]`.**

Wenn das Backend „Aufheben“ ausfuehrt und `{"command": "clear_emergency", "reason": "manual"}` auf dasselbe Topic publiziert, wird das vom gleichen Handler als „Emergency“ interpretiert und fuehrt **erneut** zu `emergency_stopped = True`. Folge: Bei nur Mock-ESPs bleibt der Zustand nach „Aufheben“ faktisch im Not-Aus oder wird erneut gesetzt. Bei echten ESPs haengt das Verhalten davon ab, ob die Firmware `clear_emergency` auf diesem Topic unterstuetzt.

---

## Ziel

Ein Klick auf „Aufheben“ hebt den Not-Aus **systemweit** auf; Aktoren sind danach wieder steuerbar — fuer **Mock-ESPs und echte ESPs** gleichermassen.

---

## Vorgehen (technische Schritte)

### 1. Mock-Simulation: Payload in `handle_emergency()` auswerten

**Datei:** `El Servador/god_kaiser_server/src/services/simulation/actuator_handler.py`

- In `handle_emergency(topic, payload_str, esp_id)` die Payload parsen (JSON).
- **Wenn** `payload.get("command") == "clear_emergency"`:
  - `clear_emergency(esp_id)` aufrufen (Funktion/Methode ist laut Befund bereits vorhanden).
- **Sonst** (emergency_stop oder fehlender/anderer command):
  - Bisheriges Verhalten beibehalten: `runtime.emergency_stopped = True`, alle Aktoren OFF, Status publishen.

### 2. Mock-Simulation: Broadcast-Handler fuer clear_emergency

- In `handle_broadcast_emergency()` (actuator_handler.py Zeile 213–230) die Payload parsen und pruefen, ob `payload.get("command") == "clear_emergency"`.
- **Falls ja:** Fuer alle aktiven Mocks `clear_emergency(esp_id)` aufrufen (nicht `handle_emergency()` – sonst erneut `emergency_stopped = True`). **Falls nein:** Bisheriges Verhalten (handle_emergency fuer alle) beibehalten.

### 3. Echte ESPs: Topic- und Payload-Konsistenz

- **El Trabajante** wertet in `src/main.cpp` (ca. Zeile 895–912) bereits `command == "clear_emergency"` auf demselben Topic `actuator/emergency` aus; Aufheben ist firmware-seitig vorhanden.
- In **.claude/reference/api/MQTT_TOPICS.md** Abschnitt 2.5 pruefen: Dort ist aktuell `"action": "stop_all"` dokumentiert; der Code (Server + ESP32) nutzt **`command`** mit Werten `emergency_stop` und `clear_emergency`. Doku anpassen (Payload-Beispiel `{"command": "clear_emergency", "reason": "..."}` ergaenzen und mit Abschnitt 2.5 vereinheitlichen).

### 4. Frontend (optional)

- Pruefen, ob nach `clearEmergencyAll()` ein kurzer Delay oder ein gezieltes WebSocket-Event noetig ist, damit die UI sofort den freigegebenen Zustand anzeigt. Aktuell reicht `fetchAll()` in der Regel; nur bei Race oder verzoegerter Aktualisierung nachbessern.

---

## Akzeptanzkriterien

- [x] Bei Klick auf „Aufheben“ (nur Mock-ESPs im System): `emergency_stopped` wird false, Aktoren sind wieder steuerbar; erneuter Klick loest keinen erneuten E-Stop aus.
- [x] Bei Klick auf „Aufheben“ (mit echten ESPs): Echte ESPs heben Not-Aus ebenfalls auf, sofern Firmware das Topic/Payload-Schema unterstuetzt; Doku ist angepasst.
- [x] Mock: `handle_emergency` und Broadcast-Pfad werten `command` aus; `clear_emergency`-Payload fuehrt nur zu Aufheben, nicht zu erneutem E-Stop.
- [x] Optional: UI zeigt freigegebenen Zustand ohne Verzoegerung (gegebenenfalls mit kleinem Delay oder WS-Event verifiziert). — `fetchAll()` nach API-Erfolg reicht; kein zusaetzlicher Delay noetig.

---

## Referenzen (Codebase)

| Bereich | Datei / Ort |
|--------|-------------|
| Frontend | El Frontend/src/components/safety/EmergencyStopButton.vue, src/stores/esp.ts (clearEmergencyAll), src/api/actuators.ts (clearEmergency) |
| Backend API | El Servador/god_kaiser_server/src/api/v1/actuators.py (clear_emergency) |
| Simulation | god_kaiser_server/src/services/simulation/actuator_handler.py (handle_emergency, handle_broadcast_emergency, clear_emergency), scheduler.py (_handle_mock_message Zeile 285–292) |
| MQTT/Doku | .claude/reference/api/MQTT_TOPICS.md Abschnitt 2.5 (Payload: `command` nicht `action`); El Trabajante src/main.cpp (actuator/emergency, command clear_emergency) |

**Hinweis:** `POST /api/v1/actuators/clear_emergency` ist in REST_ENDPOINTS.md (Abschnitt 4.5) und in der Quick-Lookup-Tabelle dokumentiert.

---

## Kurzuebersicht

| # | Thema | Kernursache |
|---|--------|-------------|
| 1 | Not-Aus „Aufheben“ | Mock-Handler wertet `command` in `actuator/emergency` nicht aus; `clear_emergency` wird wie `emergency_stop` behandelt → Flag bleibt true. |

---

## Umsetzung (2026-03-03)

- **actuator_handler.py:** `handle_emergency()` parst Payload; bei `command == "clear_emergency"` wird `clear_emergency(esp_id)` aufgerufen, sonst bisheriges Verhalten (emergency_stopped = True, alle Aktoren OFF). `handle_broadcast_emergency()` analog: bei `clear_emergency` fuer alle aktiven Mocks `clear_emergency(esp_id)`, sonst `handle_emergency` pro Mock.
- **MQTT_TOPICS.md:** Abschnitt 2.5 und 6.1 auf `command`-Schema umgestellt (`emergency_stop` / `clear_emergency`), Payload-Beispiele und Code-Referenzen ergaenzt.
- **REST_ENDPOINTS.md:** `POST /actuators/clear_emergency` in Quick-Lookup (13 Actuator-Endpoints) und als Abschnitt 4.5 mit Request/Response dokumentiert.
- **Frontend:** Unveraendert; `clearEmergencyAll()` → `actuatorsApi.clearEmergency()` → `fetchAll()` reicht fuer sofortige UI-Aktualisierung.
- **ESP32:** Bereits `command == "clear_emergency"` in `main.cpp` (ca. Zeile 900); keine Aenderung noetig.
