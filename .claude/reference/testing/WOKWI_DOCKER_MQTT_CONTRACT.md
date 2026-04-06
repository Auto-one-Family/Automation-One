# Wokwi Docker MQTT Contract (verbindlich)

## Ziel

Deterministischer Transportpfad fuer Wokwi-Simulationen in Lokal, Docker und CI:

- Wokwi ESP32 -> MQTT Broker erreichbar
- gleicher Host/Port-Vertrag in allen Testpfaden
- keine impliziten Zufallspfade

## Verbindlicher Routing-Contract

- Primärer Hostname: `host.wokwi.internal`
- MQTT Port: `1883`
- Docker-Hinweis (Host-Aufloesung): `host.docker.internal`
- Broker im Compose-Stack: Service `mqtt-broker`, Container `automationone-mqtt`

## Pflicht-Env-Variablen

- `WOKWI_MQTT_HOST` (Default: `host.wokwi.internal`)
- `WOKWI_MQTT_PORT` (Default: `1883`)
- `WOKWI_CLI_TOKEN` (nur fuer Wokwi-Ausfuehrung)

## Betriebsregeln

1. Kein Hardcoding von Tokens oder Secrets im Repo.
2. Tests muessen den gleichen Host/Port-Contract lesen (Env statt ad-hoc Werte).
3. Vor Wokwi-Lauf: Broker-Connectivity pruefen.
4. Bei fehlender Erreichbarkeit: Lauf als Blocker markieren, nicht "silent skip".

## Pflichtsignaturen im Serial-Log

- Boot abgeschlossen (`Phase 5: Actuator System READY`)
- MQTT verbunden (`MQTT connected`)
- bei Injection-Szenarien: Reaktion auf Kommando (`Actuator` / `command` / `config_response`)

## Referenz

- `scripts/verify_top3_gaps.py` (Paket A)
- `El Trabajante/wokwi.toml`
- `.github/workflows/wokwi-tests.yml`
