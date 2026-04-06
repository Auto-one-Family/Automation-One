# Wokwi Scenario Template V1 (verbindlich)

## Geltungsbereich

Pflicht fuer priorisierte Kategorien:

- `01-boot`
- `03-actuator`
- `06-config`
- `07-combined`
- `11-error-injection`

## Pattern

1. **Start-Handshake**
   - `wait-serial: "MQTT connected..."`
   - optional: `wait-serial: "REGISTRATION"`
2. **Wartefenster fuer externe Injection**
   - explizites `delay`-Fenster dokumentieren
3. **Externe Injection**
   - via `mosquitto_pub`/Helper, nicht via fragiles Fake-`set-control` fuer MQTT
4. **Serial-Pruefsequenz**
   - mindestens 1 funktionale Signatur nach Injection
5. **Timeout/Fehler**
   - klarer Timeout-Fail mit Ursache im Log

## Anti-Pattern

- `set-control` als MQTT-Transport-Ersatz in MQTT-Szenarien
- zu generische waits (`"success"`, `"ok"`)
- fehlendes Injection-Wartefenster
- stilles Skip ohne Blocker-Markierung

## Minimalbeispiel

```yaml
name: Example MQTT Injection Scenario
version: 1
steps:
  - wait-serial: "MQTT connected"
  - wait-serial: "REGISTRATION"
  - delay: 5000ms
  # externe Injection hier (mosquitto_pub / helper)
  - wait-serial: "ConfigResponse published"
```

## Referenz

- `scripts/verify_top3_gaps.py` (Paket B Audit + Suite)
