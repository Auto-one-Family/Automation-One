# Incident-Report: Standby -> MQTT-Disconnect-Loop (ESP_EA5484)

## Kurzfazit

Nach Standby des Laptops liegt ein reproduzierbarer Disconnect-Loop vor, der aus zwei ueberlappenden Effekten besteht:

1. **Primar auf ESP-Seite:** MQTT-Write-Timeouts (`classified=write_timeout_silent`, spaeter `write_timeout` mit `errno=11`) bei weiterhin verbundenem WLAN, gefolgt von Reconnect-Spirale bis Circuit-Breaker OPEN.  
2. **Zeitgleich in Infrastruktur sichtbar:** Broker-Restarts und LWT-Wellen sind in Loki/Alloy nachvollziehbar und verstaerken die Sichtbarkeit des Loops serverseitig (LWT/Offline-Events, stale sensors, Alert-Flut).

Die UI zeigt den Zustand grundsaetzlich korrekt als Offline/Alerts, aber **nicht als Flapping/Loop-Qualitaet**; dadurch ist die Stoerung als "instabile Verbindung" schwerer zu erkennen als noetig.

---

## Artefakte in diesem Ordner

- `ui-01-hardware-offline-overview.png`
- `ui-02-system-monitor-overview.png`
- `ui-03-monitor-view-connectivity.png`
- `ui-04-alert-drawer-active-alerts.png`
- `ui-05-system-monitor-mqtt-traffic.png`
- `alloy-01-home.png`

---

## 1) Log-Evidenz (forensisch)

## 1.1 ESP-Serial (direkt aus Lauf)

Aus den bereitgestellten Logs:

- Vor dem Fehler kommen regelmaessig Heartbeat-ACKs an (`.../system/heartbeat/ack`), Heap wirkt zunaechst stabil.
- Dann tritt wiederholt auf:
  - `MQTT_CLIENT: Writing didn't complete in specified timeout`
  - `MQTT_EVENT_ERROR ... classified=write_timeout_silent`
  - `MQTT_EVENT_DISCONNECTED`
  - Reconnect-Scheduling (`managed reconnect scheduled ...`)
- In der Eskalationsphase:
  - `tcp_write error, errno=No more processes`
  - `Writing failed: errno=11`
  - `classified=write_timeout`
  - spaeter `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT`
  - Circuit Breaker: `Failure threshold reached -> OPEN`

Wichtig: waehrend vieler Fehler bleibt `wifi_connected=true` und RSSI im brauchbaren Bereich (ca. -49 bis -63 dBm). Das spricht gegen einen reinen WLAN-Abbruch als Hauptursache.

## 1.2 Incident-Logset (Server/Broker, 2026-04-20T05:37Z)

Datei `logs/broker-2026-04-20T053720Z-053825Z-clean.log` zeigt:

- normale Subscription-Phase von `ESP_EA5484`
- dann mehrfach:
  - `mosquitto version 2.1.2 terminating`
  - anschliessend Neustart + erneute Client-Verbindungen

Datei `logs/server-2026-04-20T053720Z-053840Z-clean.log` korreliert dazu:

- wiederholte `LWT received: ESP ESP_EA5484 disconnected unexpectedly`
- direkt danach wieder ACK/online-Indizien
- parallel sensor stale Warnungen fuer EA5484

=> Das ist ein klassisches Flapping-Muster: kurz online, dann wieder abrupt offline.

## 1.3 Alloy/Loki-Pruefung (live)

Monitoring-Stack ist gesund (`docker compose --profile monitoring ps`): `alloy`, `loki`, `prometheus`, `grafana` laufen healthy.

Loki-Health:

- `Loki is ready`
- aktive Streams enthalten u.a. `alloy`, `mqtt-broker`, `el-servador`.

Loki-Query-Belege:

- `compose_service="mqtt-broker"`:
  - `10:20:37Z: mosquitto version 2.1.2 terminating`
- `compose_service="el-servador"`:
  - wiederholte `LWT received: ESP ESP_EA5484 disconnected unexpectedly`
  - mehrfache stale/timeout-Folgen.

Alloy selbst:

- UI (`alloy-01-home.png`) zeigt Komponenten **healthy**.
- Es gibt punktuelle Alloy-Fehler beim Inspecten bereits beendeter Container (`No such container`, `context canceled`).  
  Diese Fehler deuten auf Container-Churn hin, nicht auf einen dauerhaften Alloy-Ausfall.

---

## 2) Korrelation und Problemkette

## 2.1 Zeitliche Kette (vereinfachtes Muster)

1. Heartbeat-ACK laeuft normal.  
2. ESP meldet Write-Timeout im MQTT-Transport.  
3. ESP disconnectet, startet Managed-Reconnect.  
4. Server sieht LWT und markiert offline/recovery-Pfade.  
5. Kurzzeitige Reconnects (ACK wieder da), dann erneute Fehler.  
6. Bei Haeufung: TLS-Timeouts + Circuit-Breaker OPEN.

## 2.2 Technische Einordnung

- Die Fehlerklasse wechselt von "silent write timeout" zu harten TCP/TLS-Folgen (`errno=11`, TLS connect timeout).
- Das Verhalten passt zur bereits bekannten Heap-/Allokations-Engpass-Hypothese im Incident: genug freier Heap insgesamt, aber zu wenig zusammenhaengender Block (`max alloc` relevant), wodurch Publish/Write-Pfade instabil werden.
- Zusaetzliche Broker-Restarts verschlechtern die Recovery weiter und erzeugen mehr LWT-/Offline-Rauschen.

---

## 3) UI/UX-Befund (wie der Loop aktuell dargestellt wird)

## 3.1 Was sichtbar ist (positiv)

- Hardware/Monitor markieren betroffene Geraete als offline (`ui-01`, `ui-03`).
- System Monitor zeigt "3 Geraete offline" + Warning Alerts (`ui-02`).
- Alert Drawer listet relevante Infrastruktur-/Heartbeat-Meldungen (`ui-04`).

## 3.2 Wo die Darstellung irrefuehrend ist

1. **Topbar-Zustand "Server verbunden" bleibt gruen**, waehrend Device-Flapping laeuft.  
   Das signalisiert nur Backend-WebSocket, nicht Device-Stabilitaet.

2. **MQTT-Traffic-Tab zeigt hohen Zaehler (`3084`) aber Live 0/0 + "Warte auf Nachrichten..."** (`ui-05`).  
   Ohne Kontext wirkt das wie "kein Problem", obwohl im selben Zeitraum Disconnect-/LWT-Wellen bestehen.

3. **Keine explizite Flapping-Kennzahl** (z.B. "N Disconnects in 5 min", "Reconnect-Rate", "CB state").  
   Nutzer sehen Offline-Symptome, aber nicht die Dynamik des Loops.

4. **Alerts sind stark gemischt (alt + neu + andere Ursachen)**.  
   Priorisierung der aktuell laufenden Loops ist im Drawer nicht deutlich genug.

## 3.3 Code-Hinweise zur Darstellung

- `TopBar`-Punkt basiert auf WebSocket-Status (`useWebSocket`) und kann daher gruen sein, obwohl ein einzelnes ESP flapped.
- `MonitorView` berechnet Snapshot/Hybrid anhand `resolveMonitorConnectivityState`, aber nicht explizit nach "Flapping pro Device".
- `esp.ts` verarbeitet LWT/online/offline korrekt und erzeugt Offlinestatus + optional Toast, jedoch ohne dedizierten Loop-Aggregator.

---

## 4) Root-Cause-Bewertung

**Wahrscheinlichste Hauptursache:** MQTT-Transportinstabilitaet auf ESP-Seite nach Standby/Resume-Fenstern, mit Write-Timeouts als Primaertrigger; kompatibel mit bekanntem Heap-Fragmentierungs-/Allokationsdruck.

**Verstaerker:** Broker-Neustarts/Container-Churn im gleichen Zeitraum erzeugen zusaetzliche Verbindungsabbrueche und erschweren saubere Recovery.

**Nicht primaer:** reines WLAN-Signalproblem (RSSI ist oft gut, `wifi_connected=true` waehrend Fehlern).

---

## 5) Konkrete Probleme (nach Schwere)

1. **P0 Betrieb:** ESP_EA5484 verliert MQTT wiederholt und erreicht Circuit-Breaker OPEN (degraded mode).  
2. **P1 Stabilitaet:** Broker-Restarts im selben Zeitfenster erzeugen zusaetzliche LWT-/Offline-Wellen.  
3. **P1 UX/Operations:** UI zeigt keinen klaren "Disconnect-Loop"-Indikator; Topbar kann "verbunden" signalisieren trotz kritischem Device-Flapping.  
4. **P2 Diagnostik:** MQTT-Traffic-Tab liefert ohne Flapping-Metrik/letzte Fehlerursache zu wenig operativen Kontext.

---

## 6) Empfohlene Sofortmassnahmen

1. **Device-Stabilitaet verifizieren:** nach jedem Resume ein 5-10min Fenster auf `write_timeout*`, `errno=11`, `tls_timeout`, `cb_state` beobachten.
2. **Broker-Restarts isolieren:** Ursache fuer `mosquitto terminating` um 10:20:37 klaeren (Host Sleep, Compose Restart, Healthcheck, manuelle Aktion).
3. **UI-Hotfix klein:** Device-Flapping-Badge im Monitor/System Monitor (z.B. `disconnects_last_5m`, `reconnects_last_5m`, `cb_state`).
4. **MQTT-Traffic-Tab verbessern:** Header mit "letztes Disconnect-Ereignis", "letzter LWT", "Loop aktiv ja/nein".
5. **Alert-Priorisierung:** aktive Loop-Alerts oben pinnen (nicht zwischen historischen Alerts verstecken).

---

## 7) Abschlussstatus dieses Laufs

- Neuer Incident-Unterordner erstellt.
- Alloy-, Infrastruktur- und UI-Evidenz gesammelt.
- 6 Screenshots erstellt und abgelegt.
- Vollstaendiger forensischer Bericht mit Logbelegen erstellt.

