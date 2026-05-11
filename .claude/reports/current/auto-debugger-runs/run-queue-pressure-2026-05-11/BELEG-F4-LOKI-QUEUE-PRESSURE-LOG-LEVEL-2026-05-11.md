# BELEG F4 — Observability: Queue-Pressure-Events nicht in Loki sichtbar

**Run-ID:** run-queue-pressure-2026-05-11
**Datum:** 2026-05-11
**Finding-ID:** F4-LOKI-QUEUE-PRESSURE-LOG-LEVEL
**Kategorie:** tracing-gap
**Schicht:** Server / Infra (Observability-Stack)

---

## Symptom

29 Prometheus-Events `queue_pressure_event_total{event="entered_pressure"}` für ESP_EA5484
— aber KEIN entsprechender Loki-Eintrag aus dem QueuePressureHandler.

**Ursache:**
- `QueuePressureHandler` in `El Servador/god_kaiser_server/src/mqtt/handlers/queue_pressure_handler.py`
  loggt Queue-Pressure-Events auf **INFO**-Level.
- `docker-compose.pi.yml` setzt `LOG_LEVEL: WARNING`.
- Ergebnis: Prometheus-Counter steigen korrekt, aber Loki empfängt keine Logs.

---

## Prometheus-Beleg

```
queue_pressure_event_total{esp_id="ESP_EA5484", event="entered_pressure"} = 29
queue_pressure_event_total{esp_id="ESP_EA5484", event="recovered"} = 28
god_kaiser_mqtt_queued_messages = 0  (kein Server-Backlog)
```

---

## Kanonischer Codepfad

- `El Servador/god_kaiser_server/src/mqtt/handlers/queue_pressure_handler.py`
- `docker-compose.pi.yml` — `LOG_LEVEL: WARNING`
- Topic-Subscription: `kaiser/+/esp/+/system/queue_pressure` (registriert in `src/main.py`)
- Topic-Pattern-Parser: `src/mqtt/topics.py` (`parse_queue_pressure_topic`)

---

## Fix-Optionen (Analyst-Bewertung)

**Option A (bevorzugt, minimal-invasiv):**
Queue-Pressure "entered_pressure"-Event von INFO auf WARNING hochstufen.
Queue-Pressure ist ein operativ relevantes Betriebsereignis — 29 Events in einer Session
sind ein klares Signal für Ressourcendruck. WARNING ist sachlich korrekt.

**Option B (granular, aufwändiger):**
Modul-spezifisches Log-Level via Umgebungsvariable (z.B. `LOG_LEVEL_QUEUE_PRESSURE: INFO`
während globales Level WARNING bleibt). Erfordert Logging-Konfiguration im Server.

**Option C (kein Code, Monitoring):**
Dediziertes Grafana-Alert-Panel auf Prometheus-Counter `queue_pressure_event_total`.
Kein Loki-Eintrag, aber Alerting wäre trotzdem möglich.

---

## Abgrenzung

Kein Overlap mit bestehenden Issues (AUT-191 Observability-Verifikation ist allgemeiner Platzhalter,
kein Log-Level-spezifisches Issue). Dieses Finding ist eigenständig.

---

## Offene Fragen (TM-Entscheidungs-Block)

1. Ist WARNING für entered_pressure sachlich richtig, oder ist INFO akzeptabel wenn
   Prometheus-Alerting eingerichtet wird?
2. Gibt es bereits einen Grafana-Alert auf queue_pressure_event_total? Falls ja,
   ist dieses Finding obsolet.
