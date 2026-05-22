# SOLL — ESP32 Serial-Logging (MQTT · NVS · Config)

**Incident:** INC-ESP32-SERIAL-LOGGING-2026-04-11  
**Bezug:** `.claude/auftraege/auto-debugger/inbox/STEUER-esp32-serial-logging-nvs-mqtt-2026-04-11.md`

## Log-Level-Richtlinie

| Level | Verwendung |
|-------|----------------|
| **INFO** | Einzeiler mit Präfix (`[MQTTIN]`, `[NVS]`, `[CFGIN]`, `[HBINF]`, `[CFGRESP]`) — grep-freundlich, keine Geheimnisse |
| **DEBUG** | Vollständiges MQTT-Payload (bestehend `LOG_D` in `routeIncomingMessage`) nur wenn Serial-Last akzeptabel |
| **WARN/ERROR** | unverändert Semantik; NVS-Timeouts und Publish-Failures mit Präfix |

## Payload- und Längen-Disziplin

- **Max. Vorschau** am MQTT-Ingress: ca. **40** druckbare Zeichen im INFO-String; Gesamtzeile ≤ **128** Zeichen (Logger-Puffer in `logger.h`).
- **Config-Topic** (`TopicBuilder::buildConfigTopic()`): am Ingress **keine** Payload-Vorschau (`pvw=off`) — vermeidet große JSON-Dumps und indirekte Secret-Leaks.
- **Keine** WiFi-Passwörter, MQTT-Pass, JWT in Logs (unverändert Projektregel).

## Präfixe (Monitor-Filter)

| Präfix | Bedeutung |
|--------|-----------|
| `[MQTTIN]` | MQTT-Eingang vor Dispatch |
| `[NVS]` | Mutex-/Namespace-Lifecycle (`StorageManager`) |
| `[CFGIN]` | Config-Sensor-Apply-Schleife (pro Eintrag) |
| `[HBINF]` | Heartbeat-ACK um `setDeviceApproved` |
| `[CFGRESP]` | `config_response`-Publish inkl. MQTT-Erfolgs-/Fehlzähler |

## Korrelation

- Wo Server-Payloads `correlation_id` führen, bleibt die **Quelle** der Korrelation im JSON; zusätzliche INFO-Zeilen nur bei Bedarf (kein Voll-Dump).
- `CFGRESP`-Logs enthalten Wechselzähler `mqtt_ok` / `fail` für Drift-Erkennung (Broker/Publish-Pfad).

## Technik

- Nur `LOG_*` aus `logger.h` / bestehende Infrastruktur.
- Formatierung bevorzugt mit **festen `char`-Puffern** und `snprintf` in den neuen Hochsignal-Pfaden.

## Folge-Steuer (verbindlich laut STEUER)

Nach diesem Dokument die **finalen** Log-Orte tabellarisch festziehen:

`@.claude/auftraege/auto-debugger/inbox/STEUER-impl-plan-esp32-logging-nvs-trace-2026-04-11.md`

Abweichungen zwischen IST-Tabelle und späterem Plan sind im Plan zu begründen.
