# BELEG: MQTT Publish-Architektur Zwei-Pfad-Problem — Analyse-Run 2026-05-12

**Run-ID:** 2026-05-12-mqtt-publish-arch
**Datum:** 2026-05-12
**Analyst:** automation-experte (Life-Repo-Agent)
**Typ:** auto-debugger Analyse-Run
**Parent-Issue:** AUT-353

---

## 1. Search-vor-Create-Protokoll

### Suchbegriffe und Ergebnisse

| Suchbegriff | Ergebnis |
|---|---|
| "MQTT publish queue" (team:AutoOne) | 0 direkte Treffer — alle Issues zu groß für Inline-Anzeige |
| "heartbeat split" (team:AutoOne) | AUT-121, AUT-133, AUT-68, AUT-293, AUT-134, AUT-58, AUT-283 |
| "PKG backpressure" (state:In Progress) | AUT-326 (P0, In Progress) |
| "heartbeat metrics firmware" | AUT-121, AUT-133, AUT-68, AUT-293, AUT-134 |
| Direkte Einzel-Checks | AUT-54, AUT-55, AUT-60, AUT-67, AUT-326, AUT-344, AUT-346, AUT-121 |

### Gefundene Issues (Stand 2026-05-12)

| Issue | Titel | Status | Relevanz |
|---|---|---|---|
| AUT-54 | [EA-01] MQTT Transport/Session-Stabilität | Done | Abgeschlossen, Vorgeschichte |
| AUT-55 | [EA-02] MQTT Outbox-Kapazität & Backpressure | Done | Abgeschlossen, Vorgeschichte |
| AUT-67 | [EA-14] Transport-Counter: write_timeouts | Done | Abgeschlossen |
| AUT-68 | [EA-15] Heartbeat-Slimming Phase 1 | Done | Abgeschlossen, Parent von AUT-121 |
| AUT-121 | [EA-15.3] Heartbeat Metrics Split (Delta/Event) | In Review | DIREKT RELEVANT — Implementierung läuft |
| AUT-133 | [EA-15.4] Heartbeat Metrics Utilization | In Review | DIREKT RELEVANT |
| AUT-326 | [P0] MQTT Outbox Exhaustion → Guru Meditation | In Progress | P0-AKTIV — PKG-01/02 vorhanden |
| AUT-344 | Aktor-Burst COMM-Queue-Erschöpfung | Backlog | DIREKT RELEVANT — TM-Block offen |
| AUT-346 | CB-OPEN blockiert Heartbeat/Keepalive | Backlog | DIREKT RELEVANT — TM-Block offen |

---

## 2. Verify-vor-Create-Protokoll

### AUT-326 (P0, In Progress) — Verify-Ergebnis

- Status: In Progress (started 2026-05-10)
- Fix-Plan vorhanden: PKG-01 (sdkconfig OUTBOX_EXPIRED_TIMEOUT 30s→10s) + PKG-02 (intent_contract.cpp nicht-terminale Outcomes auf QoS 0)
- Verify-Gates B-OUTBOX-01..05 definiert
- **Schlussfolgerung:** Nicht duplizieren. AUT-353/S1-S5 sind Analyse-Issues; AUT-326 ist Implementation. Orthogonal.

### AUT-344 (Backlog, High) — Verify-Ergebnis

- TM-Entscheidungs-Block mit 4 offenen Fragen
- Kernfrage: Queue-Diskrepanz (8 vs 15 Slots) — **geklärt** (AUT-362): kanonisch **8** (`PUBLISH_QUEUE_SIZE` in `publish_queue.h`); „15“ nur historisch (Header-Kommentar AUT-344) + veraltete Planungs-MDs.
- Related: AUT-326, AUT-303, AUT-302
- **Schlussfolgerung:** AUT-354 (S2) ist Analyse-Ergänzung zu AUT-344. Kein Duplikat — S2 klärt die Queue-Diskrepanz-Frage aus AUT-344 TM-Block.

### AUT-346 (Backlog, High) — Verify-Ergebnis

- TM-Entscheidungs-Block mit 4 offenen Fragen (CB-Scope, HALF_OPEN-Timing, Heartbeat-Ausnahme, Reconnect-Pfad)
- Status: Backlog (kein Sub-Issue, kein Startdatum)
- **Schlussfolgerung:** AUT-356 (S3) ist Analyse-Issue für den Recovery-Pfad. Kein Duplikat — S3 quantifiziert die Zeitfenster und klärt CB-Details, die AUT-346 benötigt.

### AUT-121 (In Review) — Verify-Ergebnis

- Implementierung läuft (In Review seit 2026-04-28)
- Deckt publish_queue_fill/hwm/shed_count/drop_count Umbau ab
- **Schlussfolgerung:** AUT-358 (S5) ist Post-Split-Kalibrierung NACH AUT-121-Abschluss. Explizit abhängig gemacht.

### Kein Duplikat-Risiko für S4 (Server PKG-01a Reaktion)

- Kein bestehendes Issue zu server-seitiger queue_pressure-Reaktion gefunden
- AUT-55 (Done) behandelt App-Level Backpressure auf Firmware-Seite, nicht Server-seitige Reaktion
- **Schlussfolgerung:** AUT-357 (S4) ist genuiner Gap.

---

## 3. Analyse-Basis: Firmware-Architektur (aus Stress-Test-Analyse)

### Zwei-Pfad-Architektur (verifiziert)

```
Core 1 (Safety/Sensor-Task)          Core 0 (Communication-Task)
     |                                      |
     | xQueueSend → g_publish_queue         | direkt esp_mqtt_client_publish
     |   Size=8, Watermark=6                |   publishHeartbeat()
     |   DrainBudget=3/Tick                 |   handleActuatorStatusPublish()
     v                                      |   handleQueuePressureHysteresis()
     processPublishQueue()                  |
     (max 3 pro 50ms-Tick = 60/s)          |
                                            v
                                     ESP-IDF MQTT OUTBOX
                                     (beide Ströme landen hier)
```

### Shedding-Mechanismus

- Ab fill ≥ 6 (PUBLISH_QUEUE_SHED_WATERMARK): nicht-kritische Publishes werden NICHT eingereiht
- Ab Queue voll (xQueueSend fail): Drops + circuit_breaker.recordFailure()
- critical-Publishes: max 20ms warten, dann Ring-Umsortierung via reserveSlotForCriticalPublish

### 50ms-Tick-Reihenfolge

1. wifiManager.loop()
2. mqttClient.loop() → publishHeartbeat() → DIREKT (kein Queue-Slot)
3. mqttClient.checkRegistrationTimeout()
4. processPublishQueue() → Drain Core 1 → max 3/Tick
5. processDeferredPostReconnectActuatorStatusSync()
6. handleActuatorStatusPublish() → DIREKT (kein Queue-Slot)
7. handleQueuePressureHysteresis() → DIREKT (kein Queue-Slot, PKG-01a)
8. vTaskDelay(50ms)

---

## 4. Erstellt Issues

| Issue-ID | Titel | Kategorie | Status |
|---|---|---|---|
| AUT-353 | Parent: Zwei-Pfad-Problem nach Heartbeat-Split | inconsistency, tracing-gap, auftragstyp:analyse | Backlog |
| AUT-354 (S2) | Core-0-Direktpfad-Inventar + Größen-Audit | tracing-gap, auftragstyp:analyse | Backlog |
| AUT-355 (S1) | Queue-Parameter-Kalibrierung nach Metrics-Split | inconsistency, auftragstyp:analyse | Backlog |
| AUT-356 (S3) | Write-Timeout-Recovery-Pfad + CB-HALF_OPEN | tracing-gap, auftragstyp:analyse | Backlog |
| AUT-357 (S4) | Server PKG-01a queue_pressure-Reaktion | tracing-gap, auftragstyp:analyse | Backlog |
| AUT-358 (S5) | Post-Split Kalibrierungsverifikation | inconsistency, auftragstyp:analyse | Backlog |

### Ausführungsreihenfolge

1. S2 (AUT-354) + S3 (AUT-356) + S4 (AUT-357) — parallel startbar
2. S1 (AUT-355) — NACH S2 (braucht Direktpfad-Inventar + Queue-Diskrepanz-Klärung)
3. S5 (AUT-358) — NACH AUT-121-Abschluss (In Review)

---

## 5. Nicht-Scope (Abgrenzung)

- AUT-326 (P0): OUTBOX Exhaustion + Crash — eigenständiges P0-Issue, in Progress. NICHT dupliziert.
- AUT-344: Aktor-Burst COMM-Queue — S2 klärt Queue-Diskrepanz-Frage für AUT-344, aber S2 ist kein Fix.
- AUT-346: CB-OPEN Heartbeat-Block — S3 liefert Analyse-Basis für AUT-346 Sub-Issues, aber S3 ist kein Fix.
- Neue Funktionen: KEINE. Alle Issues sind Analyse/Kalibrierung bestehender Mechanismen.
- AUT-121/133 (In Review): keine Duplizierung — S5 ist explizit Post-Implementation-Verifikation.

---

## 6. Hub-Referenzen

- C1 (MQTT): `wissen/iot-automation/queue-overflow-ack-nack-und-determinismus-firmware-2026-04-17.md`
- C1 (MQTT): `wissen/iot-automation/state-architecture-analysis-tm-operatives-briefing-inc-ea5484-2026-04-17.md`
- Projekt-Context: INC-2026-04-11-ea5484-mqtt-transport-keepalive (Vorgeschichte)
- AUT-121 (Heartbeat Metrics Split) als kanonische Stelle für Split-Architektur
