# Paket 06: ESP32 Netzwerk-State-Machine und Betriebsmodi (P1.6)

## 1) Ziel und Scope

Dieses Dokument spezifiziert das effektive Netzwerk- und Betriebsmodell der ESP32-Firmware (`El Trabajante`) fuer deterministischen Recovery.

Fokus:
- WiFi-Provisioning, Connect, Reconnect, Offline-Verhalten als belastbare State-Machine.
- Trigger, Guards, Timer und Failure-Paths pro Uebergang.
- Safety-konformer Rueckweg zu ONLINE nur mit konsistentem ACK-/Sync-Stand.

ID-Schema:
- Netzwerk-Zustaende/Uebergaenge: `FW-NET-STATE-XXX`

## 2) Quellen und Evidenz

Verwendete Pflichtinputs:
- Paket 02-05 aus `.claude/auftraege/Auto_One_Architektur/esp32/`
- Ergaenzende Seed-/Inventar-Dateien aus Repo-Root `architektur-autoone/` (z. B. Paket-01-Artefakte; Umfang je nach Branch)

Code-Evidenz (read-only):
- `El Trabajante/src/main.cpp`
- `El Trabajante/src/tasks/communication_task.cpp`
- `El Trabajante/src/tasks/safety_task.cpp`
- `El Trabajante/src/services/communication/mqtt_client.cpp`
- `El Trabajante/src/services/communication/wifi_manager.cpp`
- `El Trabajante/src/services/safety/offline_mode_manager.*`
- `El Trabajante/src/tasks/*_queue.*`

Hinweis:
- `roadmap-komplettanalyse.md` ist im aktuellen Workspace weiterhin nicht als Pflichtdatei auffindbar; die P1.6-Ableitung basiert auf Paket 02-06 unter `.claude/auftraege/Auto_One_Architektur/esp32/` plus Firmware-Code und `.claude/reference/api/MQTT_TOPICS.md`.

Evidenzgrade:
- **sicher**: direkt aus Codepfad + Paket-02..05 belegt.
- **teilweise**: Richtung klar, aber nicht voll telemetriert/contractualisiert.

## 3) Konsolidierter Netzwerk-Zustandsraum

| ID | Zustand | Owner | Entry | Exit | Evidence |
|---|---|---|---|---|---|
| FW-NET-STATE-001 | PROVISIONING_REQUIRED | Core0 | fehlende/ungueltige WiFi-Config oder Recovery-Fallback | AP/Portal aktiv oder normaler Connect-Pfad | sicher |
| FW-NET-STATE-002 | PROVISIONING_ACTIVE | Core0 | `STATE_SAFE_MODE_PROVISIONING` + Portal aktiv | Config erhalten + Reboot, oder Reconnect erfolgreich + Registrierung bestaetigt | sicher |
| FW-NET-STATE-003 | WIFI_CONNECTING | Core0 | `wifiManager.connect()` gestartet | WiFi up oder Timeout/Fail | sicher |
| FW-NET-STATE-004 | WIFI_CONNECTED | Core0 | `WL_CONNECTED` | WiFi down | sicher |
| FW-NET-STATE-005 | MQTT_CONNECTING | Core0 (async) | `mqttClient.connect()` gestartet | `MQTT_EVENT_CONNECTED` oder dauerhafter Failure-Fallback | sicher |
| FW-NET-STATE-006 | MQTT_CONNECTED_GATE_CLOSED | Core0 + Shared | MQTT connected, Registration-Gate aktiv | Heartbeat-ACK bestaetigt oder Gate-Timeout (10s) | sicher |
| FW-NET-STATE-007 | ONLINE_UNREGISTERED | Shared | Gate-Timeout ohne explizites ACK | erstes valides ACK / Status-Sync | teilweise |
| FW-NET-STATE-008 | ONLINE_ACKED | Shared (Core0+1) | ACK validiert (`confirmRegistration`) | Disconnect, ACK-Timeout, Server offline/reject/error path | sicher |
| FW-NET-STATE-009 | OFFLINE_GRACE | Core1-State, Core0 Trigger | `onDisconnect()` gesetzt, 30s Timer laeuft | Reconnect vor Ablauf oder Grace->Offline-Active | sicher |
| FW-NET-STATE-010 | OFFLINE_ACTIVE | Core1 | Grace abgelaufen (`OFFLINE_ACTIVATION_DELAY_MS=30000`) | Server-ACK, Emergency, Restart | sicher |
| FW-NET-STATE-011 | RECONNECTING_WAIT_ACK | Core1/Shared | MQTT reconnect waehrend OFFLINE_ACTIVE | valider ACK -> ONLINE_ACKED | sicher |

## 4) Uebergangskarte inkl. Trigger, Guards, Failure-Path

| ID | Von -> Nach | Trigger | Guard | Action | Failure-/Fallback-Pfad |
|---|---|---|---|---|---|
| FW-NET-STATE-101 | 001 -> 002 | Provisioning benoetigt | Config fehlt/ungueltig | AP/Portal starten | Portal-Start fail -> Safe-Mode gehalten |
| FW-NET-STATE-102 | 002 -> 003 | Provisioning abgeschlossen | Config vorhanden | WiFi connect attempt | WiFi fail -> 002 |
| FW-NET-STATE-103 | 003 -> 004 | WiFi link up | `WL_CONNECTED` | NTP Sync anstossen | NTP fail -> degradiert, aber 004 bleibt |
| FW-NET-STATE-104 | 004 -> 005 | MQTT connect start | MQTT init ok | Async start via ESP-IDF | Start fail -> Provisioning-Fallback |
| FW-NET-STATE-105 | 005 -> 006 | `MQTT_EVENT_CONNECTED` | event valid | atomics reset, subscriptions, post-connect heartbeat | Subscription drift bleibt als Rest-Risiko |
| FW-NET-STATE-106 | 006 -> 008 | Heartbeat-ACK valid | parse ok | `confirmRegistration()`, ACK-ts reset | ACK parse fail -> Gate bleibt zu |
| FW-NET-STATE-107 | 006 -> 007 | Registration timeout | >10s ohne ACK | Gate force-open | Betrieb ohne explizites ACK (degradiert) |
| FW-NET-STATE-108 | 008/007 -> 009 | MQTT disconnect, server/status=offline, ACK-timeout | kein Guard (disconnect autoritativ) | P4 Grace starten, ggf. Safe-State sofort bei 0 rules | bei Flaps thrashing-Risiko (durch Grace gedaempft) |
| FW-NET-STATE-109 | 009 -> 008 | Reconnect vor 30s | MQTT up + noch kein OfflineActive | Timer abbrechen, ONLINE | sofortiger Reconnect-Flap -> erneut 009 |
| FW-NET-STATE-110 | 009 -> 010 | Grace timer abgelaufen | `millis - disconnect_ts >= 30s` | OFFLINE_ACTIVE aktivieren, Rule-Zustaende init | Rule-Init-Probleme -> Safe-Fallback |
| FW-NET-STATE-111 | 010 -> 011 | MQTT reconnect | mode==OFFLINE_ACTIVE | RECONNECTING setzen | ohne ACK verbleibt OFFLINE lokal aktiv |
| FW-NET-STATE-112 | 010/011 -> 008 | Server-ACK (Heartbeat ACK oder `server/status=online`) | ACK parse ok | `deactivateOfflineMode()`, reset + persist rule state | NVS write fail kann Drift erzeugen |
| FW-NET-STATE-113 | * -> 002 | langes Disconnect oder persistenter MQTT-Fail | 30s debounce oder 5min CB OPEN | Reconfig-Portal oeffnen | Portal init fail -> degradierter Betrieb |

## 5) Deterministische Guards und Timer

| Guard/Timer | Wert | Wirkung |
|---|---|---|
| WiFi Connect Timeout (Versuch) | 20000 ms | `WIFI_TIMEOUT_MS` in `wifi_manager.cpp` (pro Connect-Versuch) |
| Server ACK Timeout | 120000 ms | triggert Disconnect/P4 auch bei scheinbar bestehendem MQTT-Link |
| Offline Grace | 30000 ms | verhindert sofortige Rule-Aktivierung bei kurzen Flaps |
| Registration Timeout | 10000 ms | oeffnet Publish-Gate ohne ACK (verfuegbarkeitsorientiert, nicht streng deterministisch) |
| Portal Debounce | 30000 ms | erst bei stabiler Trennung in Reconfig-Pfad |
| MQTT persistent failure | 300000 ms | Fallback auf Reconfig-Portal bei dauerhafter Instabilitaet |

## 6) Betriebsmodi und Safety-Auswirkung

| Modus | Effektive Steuerung | Safety-Verhalten |
|---|---|---|
| PROVISIONING_ACTIVE | keine regulaere Sensor/Aktor-Operation | sicherer Degraded-Mode, Reconnect parallel moeglich |
| ONLINE_UNREGISTERED | Telemetrie nur nach Gate-Regeln | funktional, aber ACK-Sicherheit noch nicht bestaetigt |
| ONLINE_ACKED | normaler Server-zentrierter Betrieb | Standardmodus |
| OFFLINE_GRACE | noch keine lokalen Regeln aktiv | kurze Aussetzer ohne Thrashing |
| OFFLINE_ACTIVE | lokale Rules alle 5s, server_override pro Aktor | fail-safe/fail-degraded je Guard |
| RECONNECTING_WAIT_ACK | Rules bleiben aktiv bis ACK | verhindert zu fruehes ONLINE |

## 7) Kernregeln fuer P1.6

1. `FW-NET-STATE-RULE-001`: Reconnect allein beendet OFFLINE nicht; nur valider Server-ACK darf ONLINE herstellen.
2. `FW-NET-STATE-RULE-002`: Bei Disconnect ohne Offline-Rules sofort Safe-State fuer alle Aktoren.
3. `FW-NET-STATE-RULE-003`: ACK-Timeout ist gleichwertiger Disconnect-Trigger, auch ohne physisches Link-Down.
4. `FW-NET-STATE-RULE-004`: State-Rueckfuehrung OFFLINE->ONLINE muss Rule-Reset plus Persistenzstatus beruecksichtigen (Write-Fail als Degraded markieren).

## 8) Offene Stellen fuer harte Deterministik

| ID | Punkt | Prioritaet | Evidenz |
|---|---|---|---|
| FW-NET-STATE-901 | Registration-Gate kann ohne ACK oeffnen (Timeout) | hoch | sicher |
| FW-NET-STATE-902 | `server/status=online` wirkt als ACK-Ersatz; Semantik muss vertraglich eindeutig bleiben | hoch | teilweise |
| FW-NET-STATE-903 | Persistenzfehler beim Offline-Reset kann Runtime-vs-NVS Drift erzeugen | kritisch | sicher |
| FW-NET-STATE-904 | Legacy-No-Task Pfad hat anderes Timing als RTOS-Normalpfad | mittel | sicher |

## 9) Kurzfazit Block A

Die Firmware hat eine klar ableitbare, robuste Connectivity-State-Machine mit starker P4-Absicherung. Nicht-deterministische Restpunkte liegen weniger im Uebergangsmechanismus selbst, sondern in Gate-Fallback (ohne ACK) und Persistenz-/Contract-Luecken bei Fehlerpfaden.

## 10) Direkte Antwort auf Leitfrage 1

Frage: **Wie laufen WiFi-Provisioning, Connect, Reconnect und Offline-Verhalten als belastbare State-Machine?**

Antwort:
1. Provisioning ist ein eigener Degraded-Betriebszweig (`FW-NET-STATE-001/002`) mit Rueckkehr in den regulären Connect-Pfad nach gueltiger Konfiguration.
2. Der Online-Aufbau folgt deterministisch `WIFI_CONNECTING -> WIFI_CONNECTED -> MQTT_CONNECTING -> MQTT_CONNECTED_GATE_CLOSED`.
3. ACK-basierte Freigabe ist der Primärpfad zu `ONLINE_ACKED`; ein 10s Gate-Timeout erlaubt jedoch einen degradierten Pfad `ONLINE_UNREGISTERED`.
4. Jeder relevante Stoerfall (MQTT disconnect, `server/status=offline`, ACK-timeout) fuehrt in `OFFLINE_GRACE`, danach nach 30s in `OFFLINE_ACTIVE`.
5. Reconnect ohne ACK bleibt in `RECONNECTING_WAIT_ACK`; erst ACK beendet Offline-Regeln und erlaubt den Rueckweg in `ONLINE_ACKED`.
