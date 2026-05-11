# BELEG: AUT-353 Folge-Issues — Linear-Erstellung 2026-05-12

**Run-ID:** 2026-05-12-mqtt-publish-arch
**Datum:** 2026-05-12
**Analyst:** automation-experte (Life-Repo-Agent)
**Typ:** Folge-Issue-Erstellung nach abgeschlossenen Analysen S1–S5

---

## 1. Ausgangslage

Alle 5 Analyse-Sub-Issues zu AUT-353 sind abgeschlossen:

| Issue | Titel (Kurzform) | Analyse-Status |
|-------|-----------------|---------------|
| AUT-354 (S2) | Direktpfad-Inventar + 8 vs. 15 | Abgeschlossen |
| AUT-355 (S1) | Queue-Parameter-Kalibrierung | Abgeschlossen |
| AUT-356 (S3) | Recovery-Pfad / CB-HALF_OPEN | Abgeschlossen |
| AUT-357 (S4) | Server queue_pressure-Reaktion | Abgeschlossen |
| AUT-358 (S5) | Post-Split-Payload / Server-Merge | Abgeschlossen |

Konsolidierungsbericht: `KONSOLIDIERT-AUT353-Zwei-Pfad-Inkonsistenz-TM-2026-05-12.md`

---

## 2. Search-vor-Create (Folge-Issues)

### Geprüfte Suchbegriffe

| Suchbegriff | Ergebnis |
|-------------|----------|
| "drain budget circuit breaker allowRequest" | Kein existierendes Issue |
| "dead code drain throttle errno" | Kein existierendes Issue |
| "Mqtt_Protocoll ENABLE_METRICS_SPLIT feature_flags" | Kein existierendes Issue |
| "15 slots publish queue veraltet planungs" | Kein existierendes Issue |
| "MQTT_TOPICS queue_pressure QoS" | Kein existierendes Issue; AUT-345 (LOG_LEVEL) abgegrenzt |

### Abgrenzungscheck bestehende Issues

| Issue | Abgrenzung |
|-------|-----------|
| AUT-346 | CB-OPEN blockiert Heartbeat — AUT-359 ist Sub-Issue (Drain-Aspekt), kein Duplikat |
| AUT-344 | Burst-Queue — AUT-362 ist Doku-Bereinigung der offenen 8-vs-15-Frage, kein Duplikat |
| AUT-345 | LOG_LEVEL queue_pressure — AUT-363 ist QoS-Doku-Mismatch, anderer Scope |
| AUT-121 | Metrics-Split-Implementierung — AUT-361 ist Doku-Bereinigung, kein Duplikat |
| AUT-326 | Outbox-Exhaustion P0 — keine Überschneidung |

---

## 3. Erstellte Folge-Issues

| Issue-ID | Titel (Kurzform) | Kategorie | Priorität | Parent | Schicht |
|----------|-----------------|-----------|-----------|--------|---------|
| **AUT-359** | FW: processPublishQueue() umgeht CB — Drain-Admission-Asymmetrie | inconsistency | High | AUT-346 | firmware-dev |
| **AUT-360** | FW: Drain-Throttle dead code — PUBLISH_DRAIN_BUDGET 1 vs 1 wirkungslos | error | Medium | AUT-353 | firmware-dev |
| **AUT-361** | Doku: Mqtt_Protocoll.md ENABLE_METRICS_SPLIT vs. feature_flags.h | inconsistency | Low | AUT-353 | firmware-dev |
| **AUT-362** | Doku: Veraltete 15-Slots-Aussage in Planungs-MDs / paket-01 | inconsistency | Low | AUT-353 | (direkt TM) |
| **AUT-363** | Doku: MQTT_TOPICS.md queue_pressure QoS 1 vs. tatsächlich QoS 0 | inconsistency | Low | AUT-353 | firmware-dev |

---

## 4. Finding-Belege (Quellen aus Analyse-Run)

### AUT-359 — CB-Drain-Asymmetrie

**Quelle:** S3-recovery-pfad-2026-05-12.md §5 (Zusatzbefund)

Zitat: "`processPublishQueue()` ruft `esp_mqtt_client_publish` direkt auf — ohne `circuit_breaker_.allowRequest()`. Asymmetrie zwischen Drain und Admission unter CB."

Kanonische Stelle: `mqtt_client.cpp` ca. Zeile 1242 (`processPublishQueue`, Drain-Schleife)

### AUT-360 — Dead-Code Drain-Throttle

**Quelle:** S3-recovery-pfad-2026-05-12.md §1 (IST-Code)

Zitat: "PKG-18-'Reduktion' von 3→1 bei Write-Timeout ist gegenüber dem aktuellen Default wirkungslos (1 vs 1). Das DEBUG-Log `Drain throttled: budget=…` mit `drain_budget < PUBLISH_DRAIN_BUDGET_PER_TICK` wird **nie** ausgelöst."

Kanonische Stelle: `mqtt_client.cpp` — `processPublishQueue()`, Drain-Budget-Zuweisung; `PUBLISH_DRAIN_BUDGET_PER_TICK = 1` (Kommentar AUT-54)

### AUT-361 — ENABLE_METRICS_SPLIT Doku-Mismatch

**Quelle:** S5-post-split-kalibrierung-2026-05-12.md §6 (Abgleich Doku vs. Code)

Zitat: "`El Trabajante/docs/Mqtt_Protocoll.md` besagt u.a., `ENABLE_METRICS_SPLIT` sei auf `esp32_dev` standardmäßig inaktiv — Abweichung: In `src/config/feature_flags.h` ist das Makro **global gesetzt**."

Kanonische Stelle: `feature_flags.h` Zeile 25

### AUT-362 — Veraltete 15-Slots-Aussage

**Quelle:** BELEG-AUT354-S2-core0-directpath-queue-2026-05-12.md §1

Zitat: "Noch '15' in älteren Planungs-MDs unter `.claude/auftraege/Auto_One_Architektur/esp32/` und `architektur-autoone/paket-01-esp32-modul-inventar.md` [...] eine Queue, Tiefe **8**; Log-HWM=8 = vollständig gefüllte Queue, nicht '15'."

Kanonische Stelle: `publish_queue.h` — `PUBLISH_QUEUE_SIZE = 8`

### AUT-363 — queue_pressure QoS-Mismatch

**Quelle:** S4-server-queue-pressure-2026-05-12.md §5

Zitat: "Firmware publiziert mit `mqttClient.publish(topic, payload, 0)` (QoS **0**). Die Referenzdoku `MQTT_TOPICS.md` hatte historisch QoS 1."

Kanonische Stelle: `communication_task.cpp` — `handleQueuePressureHysteresis()`, Publish-Aufruf

---

## 5. Konsolidierungs-Regel (verifiziert)

Alle 5 Folge-Issues erklären bestehende Code-Stellen als kanonisch:
- AUT-359: `circuit_breaker_.allowRequest()` in `publish()` als Referenz
- AUT-360: `PUBLISH_DRAIN_BUDGET_PER_TICK = 1` in `mqtt_client.cpp` als kanonisch
- AUT-361: `feature_flags.h` als SSOT
- AUT-362: `publish_queue.h` `PUBLISH_QUEUE_SIZE = 8` als SSOT
- AUT-363: `communication_task.cpp` QoS-0-Aufruf als kanonisch

**Kein neuer Mechanismus erfunden.** Konsolidierungsregel (AUT-210) eingehalten.

---

## 6. Nicht-Scope (Abgrenzung zum TM-Block in KONSOLIDIERT-Dokument)

| TM-Block-Punkt | Issue | Begründung kein neues Issue |
|----------------|-------|--------------------------|
| D1–D4 Architektur-Entscheidungen | — | Bereits im TM-Block von AUT-353; kein eigenes Issue nötig |
| K1–K3 Kalibrierungs-Entscheidungen | — | Parameter beibehalten; kein Code-Change |
| F4 Feldtelemetrie 24h-Messung | — | Optional nach AUT-121-Stabilisierung; kein Issue noch |
| AUT-326 P0 | AUT-326 aktiv | Nicht dupliziert |

---

*Ende Beleg AUT-353 Folge-Issues — automation-experte 2026-05-12*
