# Bericht: Lasttest-Sweep im neuen Netzwerk (16.05.2026)

## Ziel

Nach dem Wechsel auf das neue WLAN wurde ein gestaffelter Lasttest gefahren, um die Stabilitaetsschwelle bei verschiedenen Command-Raten zu bestimmen und die beobachteten Probleme mit Log-Belegen nachzuweisen.

## Testmethode

- Device: `ESP_EA5484`
- Netzwerk: neues WLAN (`Funkturm`)
- Pro Delay-Stufe:
  - **Precondition-Gate**: Start nur, wenn Device per API `status=online`.
  - **100 Commands** im Wechsel:
    - ungerade: `GPIO25 OFF`
    - gerade: `GPIO14 ON`
  - Delays: `0.10s`, `0.14s`, `0.18s`, `0.22s`
  - Parallel: serieller Mitschnitt (`/dev/ttyUSB0`, `115200`, `strings` gefiltert)
  - Nachlauf: beide GPIOs auf `OFF`
- API-Auswertung: HTTP-/Success-Quote aus Command-Logs
- Serial-Auswertung: Treffer auf
  - `MQTT_EVENT_DISCONNECTED`
  - `write_timeout`
  - `tls_timeout`
  - `Publish queue full` / `[4062]`
  - `queue_pressure entered/recovered`

Hinweis: `write_timeout`/`tls_timeout` sind Regex-Treffer in den Serial-Logs (inkl. Klassifizierungs-/DBG-Zeilen), also als Belastungsindikatoren zu lesen, nicht als exakt deduplizierte Ereignisanzahl.

## Verwendete Artefakte

Alle Rohdaten wurden archiviert unter:

- `logs/current/hardware/disconnect-repro/newnet_delay_sweep_20260516/`
  - `delay_0_10.commands.log`
  - `delay_0_10.serial.log`
  - `delay_0_14.commands.log`
  - `delay_0_14.serial.log`
  - `delay_0_18.commands.log`
  - `delay_0_18.serial.log`
  - `delay_0_22.commands.log`
  - `delay_0_22.serial.log`
  - `newnet_delay_sweep_gated.json`
  - `server_last20m.log`

## Ergebnisse

### API-Erfolg pro Delay (100 Commands je Lauf)

- `0.10s`: `100/100` erfolgreich, `0`x HTTP409
- `0.14s`: `73/100` erfolgreich, `27`x HTTP409, erster 409 bei Command `#74`
- `0.18s`: `100/100` erfolgreich, `0`x HTTP409
- `0.22s`: `100/100` erfolgreich, `0`x HTTP409

### Serial-Indikatoren pro Delay

- `0.10s`: disconnected `2`, write_timeout `12`, tls_timeout `8`, queue_full/4062 `46`
- `0.14s`: disconnected `0`, write_timeout `10`, tls_timeout `3`, queue_full/4062 `91`
- `0.18s`: disconnected `0`, write_timeout `9`, tls_timeout `6`, queue_full/4062 `32`
- `0.22s`: disconnected `2`, write_timeout `7`, tls_timeout `4`, queue_full/4062 `5`

## Belege aus Logs

### 1) 0.14s-Lauf kippt in API-Offline (HTTP409)

Aus `delay_0_14.commands.log`:

- Bis `#73` noch HTTP 200
- Ab `#74` HTTP 409 `DEVICE_OFFLINE`

Konkreter Eintrag:

- `i=74`, `http=409`, `code=DEVICE_OFFLINE`, `message="Cannot send command: ESP ESP_EA5484 is offline (status=offline)"`

### 2) Gleichzeitig LWT/Offline im Server

Aus `server_last20m.log`:

- `09:41:54` LWT: `ESP_EA5484 disconnected unexpectedly`
- direkt danach mehrfach:
  - `API error: DEVICE_OFFLINE - Cannot send command: ESP ESP_EA5484 is offline`

Das korreliert zeitlich mit dem 0.14s-Fenster, in dem die API-409 einsetzt.

### 3) Transport-Fehlerbild auf ESP (write_timeout -> disconnect)

Aus `delay_0_10.serial.log` (repräsentativer Ausschnitt):

- `classified=write_timeout_silent`
- kurz danach `MQTT_EVENT_DISCONNECTED`
- danach `disconnect marker ... wifi_connected=true`

Das zeigt ein transportseitiges Problem auf MQTT-Ebene (nicht primaer Heap-Kollaps).

### 4) Queue-Druck bleibt sichtbar

Aus `server_last20m.log`:

- wiederholte `Queue pressure event: ... entered_pressure ...`

Aus den Serial-Logs:

- viele `Publish queue full` / `[4062]` Treffer, besonders bei `0.14s`.

## Interpretation

- Der kritische Bereich ist **nicht streng monoton** nur ueber Delay abbildbar:
  - `0.14s` zeigte den klarsten API-Ausfall (409-Block)
  - `0.10s` war in diesem Lauf API-seitig noch erfolgreich, zeigte aber dennoch deutliche Transport-/Queue-Symptome im Serial-Log
- Das spricht fuer ein **instabiles Lastfenster mit burst-/zeitfensterabhaengiger Kippdynamik** (MQTT-Transport + Queue-Pressure), nicht nur fuer eine feste "harte" Grenzfrequenz.

## Konkrete Findings

1. Im neuen Netzwerk sind Lastspitzen weiterhin reproduzierbar problematisch.
2. Bei `0.14s` trat ein klarer Offline-Kippzustand auf (HTTP409 ab Command #74).
3. Transportfehler (`write_timeout`/`tls_timeout`) und Queue-Druck (`4062`) treten auch in Runs ohne API-Fehler auf.
4. Damit ist "API 200-Quote allein" als Stabilitaetskriterium unzureichend; Serial- und Broker/Server-Logs muessen immer mitbewertet werden.

## Empfohlene naechste Schritte

- Stabilitaets-Gate fuer "ok"-Bewertung definieren (alle Bedingungen zugleich):
  - `0x` HTTP409
  - `0x` LWT disconnect im Testfenster
  - `0x` write/tls-timeout Klassifizierungen im Testfenster
  - `queue_pressure recovered == entered`
- Danach erneut Sweep in feiner Abstufung fahren, z. B. `0.16 / 0.17 / 0.18 / 0.19`.
- Parallel den bekannten Backend-Statusfehler (`ActuatorState value=255.0`) separat beheben, damit Diagnose-APIs nicht zusaetzlich rauschen.
