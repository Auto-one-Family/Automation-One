# Analyse- und Fixauftrag: Cross-Layer Reset-Abnahme v2 (ESP, Server, Datenbank)

**Stand:** 2026-04-04  
**Typ:** Vollstaendiger Analyse- und Umsetzungsauftrag  
**Fokus:** Reset-Finalitaet (Power Loss) mit belastbarer Cross-Layer-Abnahme  
**Ziel:** Verbleibende Luecken nach den P0-Fixes schließen und die Architektur von "funktioniert" auf "abnahmefaehig unter Stoerung" heben.

---

## 1) Ergebnis aus dem neuen Monitorlauf

Der neue Lauf zeigt eine klare Verbesserung und erlaubt eine saubere Neubewertung:

[Korrektur] Nachweisquelle fuer den "neuen Lauf" im Plan mitfuehren (sonst nicht reproduzierbar):
- Server: `logs/server/god_kaiser.log`
- ESP/Wokwi: `logs/wokwi/reports/` (Simulation) bzw. `logs/current/esp32_serial.log` (Hardware-Session)

1. ACK-Contract wirkt jetzt korrekt und erfolgreich: Registration wird erst nach gueltigem ACK geoeffnet.
2. Vorheriger P0-Fehler "Registration pending, aber Aktorkommando wirkt" ist in diesem Lauf nicht sichtbar.
3. Externe Aktorkommandos werden erst nach erfolgreicher Registration verarbeitet.
4. Kernablauf ist stabil: Boot -> Connect -> Registration -> Config Push -> Actuator Commands.

**Zwischenfazit:**  
P0-Fixes sind funktional wirksam. Die naechste Arbeit ist keine grobe Blocker-Reparatur mehr, sondern gezielte P1/P2-Haertung mit Abnahmetiefe.

---

## 2) Harte Invarianten (ab jetzt verbindlich nachweisen)

1. **ACK-Contract-Invariante**  
   Registration-/Gate-Freigabe nur nach vollstaendig gueltigem ACK.

2. **Admission-Invariante**  
   Bei `registration_pending` keine externe Aktorwirkung.

3. **Reset-Startup-Invariante**  
   Bei partieller lokaler Konfiguration expliziter Runtime-Zwischenzustand statt impliziter "normal"-Annahme.

4. **Finalitaets-Invariante**  
   Kritische Intents bleiben auch bei Retry/Burst/Power-Cycle final nachvollziehbar.

5. **Recovery-Lane-Invariante**  
   Unter Last haben Recovery-/kritische Pfade reproduzierbar Vorrang.

6. **Telemetrie-Invariante**  
   Metriken muessen Power-Cycles segmentierbar und maschinell auswertbar sein.

---

## 3) Was im Log bereits belegt ist (positiv)

### A) ACK/Registration-Kette ist konsistent
- Es erscheint ein Heartbeat-ACK.
- Danach `REGISTRATION CONFIRMED BY SERVER`.
- Danach `Gate opened - publishes now allowed`.

**Bedeutung:**  
Der vorherige Contract-Mismatch-Loop ist in diesem Lauf nicht mehr aktiv.

**Serial-Beleg (Hardware-Lauf):**
```text
[    489876] [INFO    ] [BOOT    ] MQTT message received: .../system/heartbeat/ack
[    489878] [INFO    ] [MQTT    ] REGISTRATION CONFIRMED BY SERVER
[    489909] [INFO    ] [MQTT    ] Gate opened - publishes now allowed
[    489926] [INFO    ] [SAFETY-P4] state RECONNECTING/OFFLINE_ACTIVE→ADOPTING (server ACK, epoch=1)
[    492448] [INFO    ] [SAFETY-P4] state ADOPTING→ONLINE (adoption settled, no reconnect reset)
```

### B) Admission-Reihenfolge ist plausibel
- Aktorkommandos treten erst spaeter auf.
- Aktorausfuehrung folgt erst nach Registration + Config-Setup.

**Bedeutung:**  
Der zentrale Autoritaetsbruch ist im beobachteten Pfad geschlossen.

**Serial-Beleg (Hardware-Lauf):**
```text
[    510336] [INFO    ] [BOOT    ] MQTT message received: .../actuator/25/command
[    510341] [INFO    ] [PUMP    ] PumpActuator GPIO 25 ON
[    510355] [INFO    ] [BOOT    ] MQTT message received: .../actuator/14/command
[    510368] [INFO    ] [PUMP    ] PumpActuator GPIO 14 ON
```

---

## 4) Verbleibende Luecken (entscheidend)

## L1 - Startup mit fehlender Aktorkonfiguration ist noch implizit

### Beobachtung
- Beim Start werden `0 actuator(s)` gefunden.
- Offline-Rules-Blob ist initial inkonsistent (`blob size mismatch`).
- Spaeter wird per Config-Push auf einen gueltigen Zustand geheilt.

**Serial-Beleg (Hardware-Lauf):**
```text
[     20052] [INFO    ] [CONFIG  ] ConfigManager: Found 0 actuator(s) in NVS
[     20075] [ERROR   ] [SAFETY-P4] [CONFIG] NVS blob size mismatch: expected=113 actual=0 - waiting for config push
[     25294] [INFO    ] [SAFETY-P4] [CONFIG] Saved 2 offline rules to NVS (blob v3, 113 bytes)
```

### Risiko
- Runtime ist in einem echten Zwischenzustand, aber ohne expliziten State-Contract.
- Folgefehler sind schwer reproduzierbar, weil "degraded/config pending" nicht hart modelliert ist.

### Auftrag
- Expliziten Runtime-Status fuer `CONFIG_PENDING_AFTER_RESET` einführen (oder aequivalent).
- Definieren:
  - erlaubte Aktionen,
  - blockierte Aktionen,
  - Exit-Bedingungen in `NORMAL_OPERATION`.

---

## L2 - Outcome-Robustheit unter Publish-Stoerung noch nicht final bewiesen

### Beobachtung
- In frueheren Laeufen traten wiederholt `SafePublish failed after retry` und `Intent outcome publish failed` auf.
- Dieser Lauf ist sauberer, ersetzt aber keinen Fault-Nachweis.

**Serial-Beleg (Hardware-Lauf):**
```text
[    420626] [WARNING ] [MQTT    ] SafePublish failed after retry
[    420628] [WARNING ] [MQTT    ] SafePublish failed after retry
[    457373] [WARNING ] [MQTT    ] SafePublish failed after retry
[    457399] [WARNING ] [MQTT    ] SafePublish failed after retry
```

### Risiko
- Lokale Wirkung kann eintreten, ohne dass finale Outcome-Kette persistiert reproduzierbar ankommt.

### Auftrag
- Kritische Outcome-Kette robust machen:
  - persist-before-publish oder outbox-aehnlicher Pfad,
  - idempotente finale Aufnahme serverseitig,
  - klarer Retry-/Drop-Vertrag pro Kritikalitaetsklasse.

---

## L3 - Queue-Lanes/Fairness noch nicht systemweit bewiesen

### Beobachtung
- Der Lauf zeigt keinen harten Lastfall.
- Es gibt keinen Beweis, dass Recovery unter Dauerlast nicht verhungert.

**Serial-Hinweis (kein Lastnachweis):**
```text
Reconnect und Offline-Umschaltung sind sichtbar, aber es gibt keinen gezielten Queue-Flood,
keine lane-spezifischen Metriken und keinen deterministischen Fairness-Nachweis.
```

### Risiko
- Unter realem Burst kann Finalitaet indirekt brechen, obwohl Einzelpfade korrekt sind.

### Auftrag
- Einheitliches 3-Lane-Modell cross-pipeline:
  - `critical_recovery`, `critical`, `normal`
- Admission-Codes + garantierte Drain-Quote.

---

## L4 - Telemetrie fuer 24h-Abnahme noch nicht komplett

### Beobachtung
- Counter sind vorhanden, aber Segmentierung ueber Reboots/Power-Cycles ist nicht durchgaengig als Abnahmevertrag verankert.

**Serial-Beleg (Hardware-Lauf):**
```text
[    447335] [INFO    ] [SAFETY-P4] counters: schema=1 offline_enter=1 adopting_enter=0 ...
[    489927] [INFO    ] [SAFETY-P4] counters: schema=1 offline_enter=1 adopting_enter=1 ...
```

Es fehlen im Stream weiterhin explizite Segmentfelder wie `boot_sequence_id` und `reset_reason`.

### Risiko
- KPI-Auswertung bleibt uneindeutig bei langen Tests.

### Auftrag
- `boot_sequence_id`, `reset_reason`, `segment_start_ts` verpflichtend in relevanten Heartbeats.
- Aggregationsregel fuer 24h-Abnahme definieren.
- [Korrektur] Contract-Haertung schrittweise einfuehren:
  1) Felder zuerst optional in `system/heartbeat`,  
  2) danach `contract_version` anheben und serverseitig fail-closed validieren.  
  Sonst brechen bestehende Sender/Fixtures.
- [Korrektur] Pflicht-Update-Pfade fuer diesen Punkt:  
  `El Trabajante/src/services/communication/mqtt_client.cpp`,  
  `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`,  
  `.claude/reference/api/MQTT_TOPICS.md`.

---

## 5) Zusatzfund aus aktuellem Log

## Z1 - Broadcast-Emergency Parse-Fehler

### Beobachtung
- `Failed to parse broadcast emergency JSON`.

**Serial-Beleg (Hardware-Lauf):**
```text
[     23651] [INFO    ] [BOOT    ] MQTT message received: kaiser/broadcast/emergency
[     23652] [ERROR   ] [BOOT    ] Failed to parse broadcast emergency JSON
[    484386] [INFO    ] [BOOT    ] MQTT message received: kaiser/broadcast/emergency
[    484387] [ERROR   ] [BOOT    ] Failed to parse broadcast emergency JSON
```

### Bedeutung
- Potenzieller Robustheitsfehler im Notfallpfad.
- Kann im Worst Case Safety-Signale verlieren oder falsch interpretieren.

### Auftrag
- Emergency-Parser haerten:
  - strikte Validierung,
  - Default-Fail-Safe-Entscheidung,
  - eindeutige Error-Codes fuer malformed payloads.

---

## 6) Cross-Layer Analyseauftrag (ESP / Server / DB)

## A) ESP

1. Runtime-Statusmodell um `CONFIG_PENDING_AFTER_RESET` erweitern.
2. Admission-Matrix finalisieren:
   - pro Nachrichtentyp: erlaubt/verboten bei pending registration + pending config.
3. Outcome-Failover fuer kritische Intents pruefen/haerten.
4. Emergency-Parse-Failover sauber fail-safe machen.

**Pflichtnachweis ESP:**  
Kein unklarer Zwischenbetrieb mehr; jeder Guard hat Code, Counter, Test.

---

## B) Server

1. ACK-Contract in allen Heartbeat-/Recovery-Pfaden einheitlich erzwingen.
2. Session-/Epoch-Verwaltung bei Reconnect und Neustart auf Konsistenz testen.
3. Outcome-Ingest auf idempotente final write-once Semantik unter Störung pruefen.
4. ACK-Contract-Monitoring bereitstellen:
   - `%valid_ack`,
   - `%contract_reject`,
   - Ursachenverteilung.

**Pflichtnachweis Server:**  
Kein driftender ACK-Pfad und kein inkonsistenter Sessionkontext.

---

## C) Datenbank/Persistenz

1. End-to-End-Kette verifizieren:
   - command received
   - command executed
   - final outcome persisted
2. Fault-Injection fuer Duplicate/Reorder/Retry.
3. Outbox-/Inbox-Luecken fuer kritische Outcomes schließen.

**Pflichtnachweis DB:**  
Keine "ausgefuehrt aber final unbekannt"-Faelle bei kritischen Intents.

---

## 7) Verbindliche Testmatrix (Abnahme)

1. **T1 ACK-Contract fail-closed**
   - ACK ohne Pflichtfelder -> keine Registration, kein externer Aktoreffekt.

2. **T2 ACK-Contract success**
   - Gueltiger ACK -> Gate auf, kontrollierte Freigabe.

3. **T3 Registration pending Admission**
   - Externes Aktorkommando waehrend pending -> reject + kein Schalteffekt.

4. **T4 Reset mit config pending**
   - Expliziter Runtime-Zwischenstatus, definierte Exit-Bedingung.

5. **T5 Outcome Fault-Injection**
   - Publish-Fehler/Burst/Retry -> finale Persistenz bleibt konsistent.

6. **T6 24h Soak mit realen Power-Cycles**
   - Segmentierte Metriken, keine Finalitaetsluecke, keine Guard-Bypasses.
   - [Korrektur] Muss auf echter Hardware erfolgen (`seeed_xiao_esp32c3`); Wokwi ist nur Vorstufe und nicht abnahmegueltig fuer Power-Cycle/NVS-Finalitaet.

---

## 8) Priorisierte Umsetzungsreihenfolge

1. **P1-3 zuerst:** Runtime-Status `CONFIG_PENDING_AFTER_RESET` + Guardregeln.
2. **P1-1 danach:** Outcome-Robustheit (persist/retry/idempotent) end-to-end.
3. **P1-2 danach:** Recovery-Lanes/Fairness unter Last.
4. **P2 zuletzt:** Metriksegmentierung + 24h-Abnahme.
5. **Querschnitt:** Emergency-Parser-Haertung parallel einziehen.

---

## 9) Harte Abnahmekriterien

- [ ] ACK-Contract-Pfad ist unter Fehler und Erfolg reproduzierbar korrekt.
- [ ] Kein externer Aktoreffekt ohne Registration-Freigabe.
- [ ] Config-pending nach Reset ist explizit modelliert und testbar.
- [ ] Kritische Outcomes bleiben unter Stoerung final nachvollziehbar.
- [ ] Recovery-Lanes funktionieren unter Last mit garantierter Prioritaet.
- [ ] Emergency-Parse-Fehler fuehrt nicht zu unkontrolliertem Verhalten.
- [ ] 24h-Power-Cycle-Test liefert konsistente segmentierte KPIs.

Wenn ein Punkt nicht nachweisbar ist, gilt die Phase als nicht abgenommen.

