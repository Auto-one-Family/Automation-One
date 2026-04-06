# Wokwi MCP (optional)

## Ziel

Optionaler MCP-Zugriff fuer Wokwi-Diagnose und agentische Automatisierung, ohne CI/Release-Gate-Abhaengigkeit.

## Konfiguration

Die Server-Definition liegt in `.mcp.json`:

- `command`: `wokwi-cli`
- `args`: `mcp`
- `cwd`: `El Trabajante`
- `env`: `WOKWI_CLI_TOKEN`

## Voraussetzungen

- `wokwi-cli` installiert
- `WOKWI_CLI_TOKEN` gesetzt
- Firmware gebaut (`make wokwi-build`)

## Start / Validierung

1. MCP-Server indirekt ueber den MCP-Client starten (liest `.mcp.json`)
2. PoC ausfuehren:
   - Simulationslauf starten
   - Serial-Ausgabe lesen
   - Ergebnis dokumentieren (Pass/Fail + Timestamp)

## Grenzen

- MCP ist **nicht** Teil des harten Release-Gates.
- Bei MCP-Ausfall muessen CI und lokale Nicht-MCP-Tests weiter funktionieren.
- Hardware-only Themen (z.B. I2C Sensor-Kommunikation) bleiben auch mit MCP hardware-only.
