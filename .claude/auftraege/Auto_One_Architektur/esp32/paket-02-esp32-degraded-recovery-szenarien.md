# Paket 02 (optional): ESP32 Degraded-/Recovery-Szenarien

> **Stand:** 2026-04-05  
> **Status:** Optionales Vertiefungsartefakt zu P1.2  
> **State-Referenz:** `paket-02-esp32-runtime-lifecycle-state-model.md`  
> **Trigger-Referenz:** `paket-02-esp32-trigger-matrix.md`

## 1) Ziel

Dieses Zusatzdokument konkretisiert Degraded- und Recovery-Pfade aus P1.2 fuer spaetere Verifikation (P1.5/P1.6).

---

## 2) Szenario-Katalog

| Szenario-ID | Ausloeser | Initialer Zustand | Erwartete Firmware-Reaktion | Recovery-Bedingung | Residual-Risiko |
|---|---|---|---|---|---|
| DEG-001 | WiFi disconnect | FW-STATE-009 | `wifiManager.handleDisconnection()` + reconnect attempts | WiFi reconnect success | lange Funkstoerung -> Portal-Fallback |
| DEG-002 | MQTT disconnect event | FW-STATE-007/FW-STATE-009 | `g_mqtt_connected=false`, `offlineModeManager.onDisconnect()`, notify Safety | reconnect + ACK | Flap-Folgen, Drop in queues |
| DEG-003 | ACK timeout (120s) | FW-STATE-009 | `checkServerAckTimeout()` triggert P4 disconnect, optional immediate safe-state | ACK erneuert, timeout-flag reset | false positives bei Timing-Randfaellen |
| DEG-004 | Server LWT offline | FW-STATE-009 | `server/status=offline` -> P4 disconnect + safe/rule branch | server status online + ACK | parse-error ignoriert Event |
| DEG-005 | Keine offline rules vorhanden | FW-STATE-012 | sofort `setAllActuatorsToSafeState()` | reconnect normal | harte Verfuegbarkeitsreduktion |
| DEG-006 | Offline grace abgelaufen | FW-STATE-012 | `activateOfflineMode()` -> local rules | reconnect + ACK | rule-data veraltet/inkonsistent |
| DEG-007 | Reconnect ohne ACK | FW-STATE-013 | Wechsel nach `RECONNECTING`, Regeln bleiben aktiv | ACK eingetroffen | aktives Regelwerk trotz Broker-Connect |
| DEG-008 | Config queue full | FW-STATE-010 | queue timeout/drop | neuer config push | Core0 sendet `config_response` QUEUE_FULL + Intent-Outcome; Server kann resyncen |
| DEG-009 | Config parse fail | FW-STATE-010 | drop in `processConfigUpdateQueue()` | erneuter valider push | fehlender negativer ACK |
| DEG-010 | Publish queue full | FW-STATE-009/FW-STATE-013 | publish drop + CB failure count | queue drain wieder frei | Status-/Telemetrieverlust |
| DEG-011 | Offline-rule NVS CRC/size fail | FW-STATE-001/FW-STATE-012 | Regeln auf 0, wartet auf config push | valider config push | offline fallback nur safe-state |
| DEG-012 | Emergency stop | FW-STATE-009/FW-STATE-013/FW-STATE-014 | sofortiger Notstopp, P4 reset via `onEmergencyStop()` | clear emergency + safety verify | queue-restkommandos nachlaufend |
| DEG-013 | Legacy no-task mode | FW-STATE-003/FW-STATE-008 | single-thread fallback loop | reboot mit vollem setup | reduzierte Core-Isolation |
| DEG-014 | MQTT CB OPEN fuer 5min | FW-STATE-009 | provisioning portal fallback | manuelle config/reconnect | aggressives Umschalten bei instabilem Netz |

---

## 3) Recovery-Klassen

1. **Sofort-Recovery (sekunden)**
   - reconnect waehrend Grace (`DEG-002`, `DEG-003`).
2. **ACK-gebundene Recovery**
   - Reconnect alleine reicht nicht (`DEG-007`), ACK ist harte Rueckfuehrbedingung.
3. **Operator-gestuetzte Recovery**
   - Provisioning-Portal bei persistenter Stoerung (`DEG-001`, `DEG-014`).
4. **Config-getriebene Recovery**
   - NVS/parse/queue Defekte heilen erst mit neuem gueltigem Config-Push (`DEG-008`, `DEG-009`, `DEG-011`).

---

## 4) Testbare Recovery-Akzeptanzpunkte

- `OFFLINE_ACTIVE` darf nicht vor 30s Grace aktiviert werden.
- ACK muss `OFFLINE_ACTIVE`/`RECONNECTING` deterministisch nach ONLINE zurueckfuehren.
- Bei `offline_rule_count == 0` muss auf Disconnect sofort Safe-State passieren.
- Config-Queue-Full ist fuer den Server ueber `config_response` + Intent-Outcome beobachtbar; Parse-Fail-Pfad bleibt Luecke.
- Emergency darf nicht von Queue-Backlog blockiert werden.
