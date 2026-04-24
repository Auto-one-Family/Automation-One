# Heartbeat-Architektur & Metrics-Routing (2026-04-23)

## Zielbild

Der Heartbeat bleibt der stabile Verbindungsanker (Registration + ACK), waehrend Forensik-/Debug-Metriken separat, belastbar und auswertbar transportiert werden.

Leitprinzip: **erst Stabilitaet, dann Entkopplung, dann Nutzung**.

## Ist-Befund (Code-validiert)

- Firmware baut den Heartbeat mit vielen Counter-/Flag-Feldern in jedem Zyklus (`El Trabajante/src/services/communication/mqtt_client.cpp`).
- Publish-Queue hat harte Payload-Grenze 1024 Byte (`El Trabajante/src/tasks/publish_queue.h` + `publish_queue.cpp`).
- Oversize wird direkt verworfen (`Publish rejected (oversize)`), danach Queue-Drop/Circuit-Breaker-Eintrag.
- Server persistiert nur eine definierte Teilmenge von Heartbeat-Telemetrie (`El Servador/god_kaiser_server/src/db/repositories/esp_heartbeat_repo.py`).
- WebSocket gibt Runtime-Telemetrie top-level weiter (`El Servador/god_kaiser_server/src/services/event_contract_serializers.py`).
- Frontend mappt nur einen Teil auf Runtime-Health; Rest landet in `rawTelemetry` (`El Frontend/src/domain/esp/espHealth.ts`).
- Prometheus zaehlt aktuell primar bool-Flags aus Heartbeat, nicht die meisten Delta-Counter (`El Servador/god_kaiser_server/src/core/metrics.py`).

## Architektur-Schnitt (Core vs Metrics)

### Core-Heartbeat (muss immer robust bleiben)

- Verbindungs-/Statuskern (`esp_id`, `ts`, `uptime`, `heap_free`, `wifi_rssi`)
- ACK-/Session-relevante Felder (`active_handover_epoch`, kompatible Contract-Felder)
- Felder fuer unmittelbare Operatorik (nur low-cardinality, kleine Payload)

### Metrics-Pfad (separat oder delta-basiert)

- Monotone Counter (Drop-, Retry-, Reject-, Drift-, Queue-Counter)
- Forensikfelder, die nicht jede 30s im Core noetig sind
- Freshness-Regel mit `max_interval` als Sicherheitsnetz

## Verbindliche Reihenfolge

1. **R0 Heartbeat stabilisieren**
   - Keine neuen Contract-Brueche.
   - Ziel: keine Oversize-Drops in Boot/Reconnect/Zone-Assign-Pfaden.

2. **R1 Metrics-Split (AUT-121)**
   - Hybrid bevorzugt: kritische bool-Health-Felder im Core, Counter auf Metrics-Pfad.
   - Out-of-order Merge serverseitig idempotent.

3. **R2 Metrics-Utilization (AUT-133)**
   - Persistenzmatrix vervollstaendigen.
   - WS-Contract + Frontend-Operatorik auf zentrale Counter heben.
   - Monitoring/Alerting counter-basiert ausbauen.

## Issue-Mapping

- `AUT-68`: konservatives Core-Slimming (Phase 1)
- `AUT-121`: Metrics-Split (Transport/Entkopplung)
- `AUT-133`: Metrics produktiv nutzbar machen (DB/WS/UI/Monitoring)
- flankierend: `AUT-69`, `AUT-72`, `AUT-109`, `AUT-110`, `AUT-111`

## Verify-Plan-Gates (Mindestset)

- **B-HB-STAB-01:** kein Oversize-Drop im 10-min Reconnect-Stresstest
- **B-HB-STAB-02:** ACK/Registration-Pfad unveraendert stabil
- **B-MS-CORE-01:** Core/Metrics-Feldmatrix dokumentiert und getestet
- **B-MS-ORD-01:** Out-of-order Metrics/Heartbeat Merge idempotent
- **B-MU-UI-01:** Frontend zeigt mindestens 3 Counter strukturiert (nicht nur raw)
- **B-MU-MON-01:** Prometheus/Grafana Trend auf Queue-Drops/Rejects/Drift
