# S4 — Server PKG-01a: konkrete Reaktion auf `queue_pressure`-Events

**Linear:** [AUT-357](https://linear.app/autoone/issue/AUT-357)  
**Run-Ordner:** `2026-05-12-mqtt-publish-arch`  
**Datum:** 2026-05-12  
**Schicht:** El Servador (God Kaiser Server)

---

## 1. Handler — Datei, Registrierung, Logik

| Stelle | Pfad / Zeilen | Inhalt |
|--------|----------------|--------|
| Implementierung | `El Servador/god_kaiser_server/src/mqtt/handlers/queue_pressure_handler.py` | Klasse `QueuePressureHandler`, Methode `handle_queue_pressure` |
| Registrierung | `El Servador/god_kaiser_server/src/main.py` ca. Zeilen 326–334 | Subscription `kaiser/+/esp/+/system/queue_pressure` → `queue_pressure_handler.handle_queue_pressure` |
| Topic-Parsing | `El Servador/god_kaiser_server/src/mqtt/topics.py` | `TopicBuilder.parse_queue_pressure_topic`, `build_queue_pressure_topic` |
| Metrik-Helfer | `El Servador/god_kaiser_server/src/core/metrics.py` | `QUEUE_PRESSURE_EVENT_TOTAL` / `increment_queue_pressure_event` |

### Ablauf `handle_queue_pressure` (vollständig)

1. **Topic parsen** — bei Fehler: strukturierter `logger.error` mit `ValidationErrorCode.MISSING_REQUIRED_FIELD`, Rückgabe `False`.
2. **`esp_id`** aus dem Parse-Ergebnis; Payload als `dict` (sonst leeres `dict`).
3. **`event`** = `str(payload.get("event", "unknown"))` (toleriert fehlende Felder).
4. **Prometheus:** `increment_queue_pressure_event(esp_id, event)` → Counter `queue_pressure_event_total` mit Labels `esp_id`, `event`.
5. **Log:** strukturierte Zeile mit `event_class=QUEUE_PRESSURE`, Telemetrie-Feldern; **`entered_pressure` → `logger.warning`**, alle anderen Events → `logger.info` (sichtbar bei `LOG_LEVEL=WARNING` auf Pi).
6. **Keine** DB-Schreibweise, **kein** WebSocket-Broadcast, **keine** Änderung von ESP-Online-Status, **kein** Config-Push-Cooldown, **keine** Drosselung von Sensor-Polling oder Logic-Engine.

Quelle: Modul-Docstring und Implementierung in `queue_pressure_handler.py` (explizit „Pure observability“).

---

## 2. Reaktionstyp (Klassifikation)

| Kategorie | Trifft zu? |
|-----------|------------|
| Nur Logging | Teilweise — ja, plus Metrik |
| Monitoring (Prometheus) | **Ja** — `queue_pressure_event_total` |
| Aktive Backpressure (Pacing, Cooldown, Dispatch-Drossel) | **Nein** |
| Persistenz (`audit_logs` o. ä.) | **Nein** |

**Kurzantwort auf die Kern-Frage aus AUT-357:** Der Server **passt kein Verhalten** gegenüber dem ESP an (kein „Server steuert Last weg“). Er **beobachtet** das Ereignis: Zähler + Logs.

---

## 3. Bewertung: ausreichend oder Lücke?

- **Architektonisch konsistent:** Backpressure entsteht auf dem ESP32 (Publish-Queue, Outbox). Der ESP drosselt/shedet lokal; der Server soll hier **keine** Business-Logik spiegeln (Server-zentrisch = Entscheidungen für Automation, nicht für Firmware-Transport-Puffer).
- **Operativ:** Prometheus reicht für Trend/Alerting; `entered_pressure` als **WARNING** adressiert den Loki-Sichtbarkeits-Fund aus F4 (Pi `LOG_LEVEL=WARNING`).
- **Optionale spätere Erweiterungen** (nicht AUT-357-Pflicht): dediziertes Grafana-Alert-Panel; optional WebSocket nur für Live-Ops — würde neue Verträge mit Frontend erfordern.

**Empfehlung:** Für PKG-01a/PKG-01b ist die **reine Observability-Reaktion ausreichend**. Eine **aktive Server-Backpressure** wäre nur sinnvoll, wenn der TM ausdrücklich Laststeuerung vom Server zum ESP (z. B. reduzierte Publish-Frequenz über Config) verbindlich will — das ist derzeit **nicht** implementiert und wäre ein separates Feature.

---

## 4. Prometheus: `queue_pressure_event_total`

- **Name:** `queue_pressure_event_total`  
- **Typ:** Counter  
- **Labels:** `esp_id`, `event`  
- **Inkrement:** `increment_queue_pressure_event` im Handler  

**Beleg aus AUT-344-Lagebild (zitiert im Issue):**  
`queue_pressure_event_total{esp_id="ESP_EA5484", event="entered_pressure"} = 29` — bestätigt, dass der Handler und die Metrik-Labels in Produktion/Pi greifen.

---

## 5. Firmware-Payload (IST, Abgleich Server)

Emitter: `El Trabajante/src/tasks/communication_task.cpp` — `handleQueuePressureHysteresis()`.

JSON-Felder: `event` (`entered_pressure` | `recovered`), `fill_level`, `high_watermark`, `shed_count`, `drop_count`, `threshold`, `ts`.

Der Server liest primär `event` und die Telemetrie-Felder für Logs; zusätzliche Keys werden toleriert.

**Hinweis QoS:** Firmware publiziert mit `mqttClient.publish(topic, payload, 0)` (QoS **0**). Die Referenzdoku `MQTT_TOPICS.md` hatte historisch QoS 1 — siehe Korrektur in derselben Änderungssession (Abschnitt 3.6a).

---

## 6. Evidenz-Suche „versteckte Reaktion“

Repo-weite Suche nach `queue_pressure` / `QueuePressure` in Python: **nur** Handler, Metrik, TopicBuilder, Tests, Reports — **keine** zweite Code-Stelle, die auf diese Events reagiert.

---

*Beleg für AUT-357 (S4) — Abgleich mit Codestand Repo 2026-05-12.*
