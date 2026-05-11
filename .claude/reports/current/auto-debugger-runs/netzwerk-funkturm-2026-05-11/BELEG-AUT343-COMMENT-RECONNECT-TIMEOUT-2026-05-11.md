# BELEG: AUT-343 Comment — reconnect_timeout_ms zu niedrig (Funkturm-Befund)

**Datum:** 2026-05-11
**Run-ID:** netzwerk-funkturm-2026-05-11
**Linear-Aktion:** Comment auf AUT-343 (kein neues Issue — AUT-343 deckt session taken over bereits ab)
**Priorität im Bericht:** 3 (Folge von P1)
**Schicht:** Firmware (El Trabajante)

---

## Verify-Begründung (kein neues Issue)

AUT-343 (`mqtt_client.cpp` — sauberer DISCONNECT vor Reconnect) deckt `session taken over` bereits als eigenständiges Firmware-Issue ab. Die Empfehlung `reconnect_timeout_ms = 15000ms` aus dem Funkturm-Bericht ist ein additiver Parameter, kein separater Root Cause. Ein neues Issue wäre ein Duplikat. Der Befund wurde als Comment auf AUT-343 eingetragen.

**AUT-332** (Session-Takeover-Replay als OUTBOX-Füllfaktor) behandelt denselben Mechanismus aus OUTBOX-Perspektive — ebenfalls kein Duplikat erstellt.

---

## Finding-Beschreibung

`reconnect_timeout_ms` in `mqtt_client.cpp` liegt bei ca. 10000ms. Nach einem WLAN-Auth-Fail (AUTH_FAIL 202) reconnectet der ESP sofort wenn WLAN wieder da ist. Zeitabstand disconnect → reconnect: typisch unter 10 Sekunden. Mosquitto hat die alte TCP-Session noch nicht freigegeben → `session taken over`.

---

## Belege aus dem Netzwerk-Diagnose-Bericht

### Befund-Tabelle-Zeile (§Befund-Tabelle)

| Symptom | Schicht | Ursache | Priorität | Abhilfe |
|---------|---------|---------|-----------|---------|
| `session taken over` (2× im selben Lauf) | Firmware / Broker | ESP reconnectet zu schnell nach WLAN-Drop | **3** | `reconnect_timeout_ms` auf 15000ms in Firmware erhöhen |

### Bericht-Kontext (§Schritt 4)

> "**Zeitabstand < 10 Sekunden** → ESP reconnectet zu früh, Broker hat alte Session noch offen."
> "```c // In mqtt_client.cpp — reconnect_timeout_ms erhöhen: mqtt_cfg.reconnect_timeout_ms = 15000;   // 15s warten statt sofort```"

---

## Empfehlung (aus Bericht §Firmware-Änderungstabelle)

| Was | Datei | Aktuell | Empfehlung |
|-----|-------|---------|------------|
| Reconnect-Delay | mqtt_client.cpp | ~10000ms | 15000ms |

**Bewertung:** Wirksam als Ergänzung zu AUT-343-Fix (Option A oder B). Primärfix bleibt AUT-352 (Router-AUTH_FAIL).
