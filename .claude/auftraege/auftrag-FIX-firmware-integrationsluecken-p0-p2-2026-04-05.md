# Auftrag: Firmware-Fixes Integrationslücken El Trabajante (P0–P2)

**Datum:** 2026-04-05  
**Typ:** Implementierung + Tests (Firmware nur)  
**Repo:** Auto-One — Projekt `El Trabajante` (PlatformIO, ESP-IDF/Arduino)  
**Zielgruppe:** Firmware-Agent / Entwickler mit Vollzugriff auf dieses Repository  

**Nicht im Scope:** El Servador (FastAPI/MQTT-Handler), El Frontend, Änderungen am Mosquitto. Server muss später neue JSON-Codes/Felder abbilden — dafür im Auftrag die **neuen Codes und Semantik** so beschreiben, dass ein separater Backend-Auftrag sie 1:1 übernehmen kann.

**Numerische Firmware-Codes (Projektregel):** Sobald dieser Auftrag **neue** ESP-Fehlercodes im Bereich **1000–4999** einführt oder bestehende Konstanten inhaltlich ändert: `El Trabajante/src/models/error_codes.h` und parallel `.claude/reference/errors/ERROR_CODES.md` (Kurzbeschreibung, Semantik, sinnvolle Zuordnung zu MQTT-String-Codes wie Outcome-`reason`/ACK). Rein stringbasierte MQTT-Felder ohne neue Zahl sind zulässig, solange keine neue numerische Konstante nötig ist.

---

## 1. Ziel

Die Firmware soll für die in der End-to-End-Analyse benannten Lücken **terminale MQTT-Sichtbarkeit** und **vertraglich konsistente** Signale liefern:

- Kein **stilles** Verwerfen von Server-Intents bei NVS-Pending-Ring-Überlauf, bei **belegter Config-Lane** für Zone/Subzone, oder bei **voller kritischer Outcome-Outbox**.
- **Parse-Fehler** auf parallelen Pfaden (Zone, Subzone, System-Command) dürfen nicht mit „nur Serial-Log“ enden.
- **„Degraded“**-Begriffe: Admission (`runtime_degraded` / `DEGRADED_MODE_BLOCKED`), Heartbeat (`degraded` wegen Persistence-Drift) und **Netzwerk/Circuit-Breaker**-Zustände aus Logs sollen für einen **nach außen erkennbaren** Contract entweder **vereinheitlicht** oder **explizit getrennt benannt** werden (Heartbeat-/Health-Felder).
- **intent_outcome**-Topic: keine dauerhafte **Zweiteilung** roher Transition-JSON vs. kanonisches `buildOutcomePayload`, ohne dokumentierte Entscheidung (Vereinheitlichung **oder** separates Subtopic).

---

## 2. IST-Kontext (fachlich, zum Abgleich im Code)

- **CONFIG_PENDING_AFTER_RESET:** wird nach Boot gesetzt, wenn partielle Runtime-Basis vorliegt; Exit über `evaluateRuntimeReadiness` / `evaluatePendingExit` und Heartbeat-ACK-Pfade. Heartbeats liefern indirekt Status; ein **dediziertes** „still pending“-Telemetry ist optional (P2).
- **Config-Pipeline:** MQTT Config → Router → RAM-Queue → Core-1 `processConfigUpdateQueue` → NVS `cfg_pending` (**Ring mit 3 Slots**). Fehlende `correlation_id` wird bereits contract-konform abgewiesen.
- **Zone/Subzone:** werden in `routeIncomingMessage` auf **Core 0** bearbeitet; bei **ConfigLaneGuard** „busy“ kann aktuell **gar keine** MQTT-Antwort** erfolgen.
- **Outcomes:** `publishIntentOutcome` + `buildOutcomePayload` liefern kanonische Felder (`contract_version`, `flow`, `semantic_mode`, …). `publishConfigPendingTransitionEvent` nutzt **anderes** JSON auf **demselben** Topic wie kanonische Outcomes.
- **Kritischer Pfad:** `enqueueCriticalOutcome` bei voller NVS-Outbox kann kritische Outcomes **verwerfen** — Server sieht nichts.
- **Publish:** Core-1 `queuePublish` → Core-0; bei ESP-MQTT **Outbox voll** (`msg_id == -2`) fehlt oft ein terminales Signal für kritische Nachrichten.
- **Metadaten:** `extractIntentMetadataFromPayload` arbeitet überwiegend **top-level**; fehlende Felder → Fallback-IDs — Korrelation zum Server schwächer.

---

## 3. Umsetzungsreihenfolge (innerhalb dieses Auftrags)

1. **P0** — Stille Verluste: Ring-Eviction, Config-Lane busy, kritische Outbox voll.  
2. **P1** — Parse-/Publish-Kanten + Degraded-Semantik (Admission vs. Netzwerk vs. Persistence).  
3. **P2** — CONFIG_PENDING-Telemetry, Drift-Korrelation, Schema-Entscheidung intent_outcome, Tests.

Jede Teillieferung soll **bauen** (`pio run -e seeed_xiao_esp32c3` o. gewünschtes Ziel-Env) und vorhandene Tests **grün** halten; neue Tests wo unten gefordert.

---

## 4. Arbeitspakete

### 4.1 P0 — NVS-Pending-Ring (`cfg_pending`)

**Dateien (erwartet):** `El Trabajante/src/tasks/config_update_queue.cpp` / `.h` — Funktionen um `persistPendingIntent` und Ring-Logik.

**IST:** Wenn der Ring voll ist, wird der älteste Eintrag überschrieben **ohne** terminales `intent_outcome` / `config_response` für den **verdrängten** Intent.

**SOLL:** Unmittelbar **vor** dem Überschreiben des ältesten Slots: mit den **noch verfügbaren Metadaten** des zu verdrängenden Intents ein **terminales** Signal sendieren:

- `publishIntentOutcome` mit `failed` (oder projektüblicher terminaler Status), **ursachenscharfer Code** (Vorschlag String/Enum: `PENDING_RING_EVICTION` oder `CONFIG_PENDING_SUPERSEDED` — final an bestehende Outcome-Code-Konvention anpassen), `retryable` nach fachlicher Policy (typisch: `true` wenn Server erneut senden soll).
- Wenn MQTT nicht verfügbar: denselben Inhalt über den **kritischen Outbox-Pfad** enqueuen (siehe 4.3 — Outbox darf diesen Eintrag nicht wieder still verlieren).

**Akzeptanz:** Vier schnell hintereinander akzeptierte Config-Intents (ohne dass Core-1 leert) → genau **ein** Eviction-Outcome für den **ältesten** Intent; dessen `correlation_id` stimmt mit dem ersetzten Slot überein.

---

### 4.2 P0 — Config-Lane busy (Zone / Subzone)

**Dateien (erwartet):** `El Trabajante/src/main.cpp` — `routeIncomingMessage`, `ConfigLaneGuard`-Zweige für Zone- und Subzone-Pfade.

**IST:** Bei belegter Lane: `return` ohne ACK/Outcome.

**SOLL:** Synchron sichtbare Antwort:

- **`zone/ack`** bzw. **`subzone/ack`** mit eindeutlichem Fehlercode (Vorschlag: `CONFIG_LANE_BUSY` im bestehenden ACK-JSON-Schema), **und/oder**
- `intent_outcome` mit `flow` passend zum Eingangspfad und **Fallback-Korrelation** (`correlation_id` aus Payload oder dokumentierte `fw_*` / `corr_*` Fallback-Regel aus `intent_contract`).

**Akzeptanz:** Während die zentrale Config-Lane belegt ist, ein Zone-Assign senden → innerhalb eines kurzen Timeouts MQTT-Seite zeigt **kein** Schweigen; Server kann Intent als blockiert/retrybar werten.

---

### 4.3 P0 — Kritische Outcome-Outbox voll

**Dateien (erwartet):** `El Trabajante/src/tasks/intent_contract.cpp` / `.h` — `enqueueCriticalOutcome` und Outbox-Implementierung.

**IST:** Bei voller Outbox: kritischer Outcome-Drop nur Log.

**SOLL:** Mindestens **eine** der folgenden Strategien (Kombination erlaubt), dokumentiert im Code-Kommentar:

- **A)** Verdrängung **ältester nicht-kritischer** Outbox-Einträge zugunsten kritischer.  
- **B)** Separater kleiner NVS- oder RAM-Puffer nur für P0-Codes.  
- **C)** Heartbeat-/Telemetrie-Zähler `critical_outcome_drop_count` (oder gleichwertig), der bei Drop inkrementiert wird und im nächsten Heartbeat sichtbar ist — **nur** wenn A/B nicht sofort umsetzbar; dann im Commit-Beschreibungstext die technische Schuld benennen.

**Akzeptanz:** Simuliert oder durch künstliche Verkleinerung/Stress: wenn ein kritischer Outcome nicht enqueued werden kann, gibt es **keinen** Zustand mehr, in dem weder Outcome noch Heartbeat-Zähler den Vorfall zeigt.

---

### 4.4 P1 — Parse-Fehler Zone / Subzone / System

**Dateien:** `El Trabajante/src/main.cpp` (Zone assign, Subzone assign/safe, System-Command).

**SOLL:**

- Zone: JSON parse fail → **`zone/ack`** mit Fehlerstatus + nachvollziehbare Fehlermeldung; optional `intent_outcome` wenn im Projekt für Zone-Pfade vorgesehen.
- Subzone: kein `sendSubzoneAck("", "error", …)` mit **leerer** `subzone_id` ohne klaren Parse-Grund; konsistente Fehlerobjekte.
- System-Command parse fail → Antwort auf dem **System-Response-Topic** im **gleichen JSON-Stil** wie erfolgreiche Systembefehle (Feld für Fehlercode/Message).

**Akzeptanz:** Mit absichtlich invalidem JSON auf jedem der drei Eingänge erscheint **MQTT**, nie nur UART-Log.

---

### 4.5 P1 — Publish-Backpressure und Metadaten

**Dateien:** `El Trabajante/src/services/communication/mqtt_client.cpp`, `El Trabajante/src/tasks/publish_queue.cpp` / `.h`.

**SOLL:**

- Bei `esp_mqtt_client_publish` / `msg_id == -2` (Outbox voll): **kritische** Publishes entweder **re-queue** mit Begrenzung/Outcome oder terminales `intent_outcome` mit Code z. B. `PUBLISH_OUTBOX_FULL` (Name an Konvention anpassen). Nicht-kritische Publishes dürfen weiter ohne Outcome enden, aber ein **Zähler** in Telemetrie ist wünschenswert.

**Dateien:** `El Trabajante/src/tasks/intent_contract.cpp` — `extractIntentMetadataFromPayload*`.

**SOLL:** Entweder **verschachteltes `data`** (falls Server künftig so sendet) spiegeln **oder** im MQTT-Contract-Kommentar und in `docs/` festhalten: **nur top-level** `correlation_id` wird unterstützt — dann keine halbe Implementierung.

---

### 4.6 P1/P2 — Degraded-Semantik (Admission vs. Netzwerk vs. Persistence)

**Dateien:** `El Trabajante/src/main.cpp` (`isRuntimeDegradedState` o. Ä.), `El Trabajante/src/services/communication/mqtt_client.cpp` (Circuit Breaker), `El Trabajante/src/tasks/command_admission.cpp` / `.h`, `El Trabajante/src/services/safety/offline_mode_manager.cpp` / `.h`, ggf. `El Trabajante/src/error_handling/health_monitor.cpp` / `.h`.

**SOLL:**

- Heartbeat oder Health-Payload: Felder so benennen/trennen, dass **Persistence-Drift** (`setPersistenceDrift`) **nicht** denselben Kurznamen wie Admission-`runtime_degraded` trägt, wenn beide gleichzeitig relevant sein können (z. B. `persistence_degraded` vs. `admission_blocked_reason` — finale Namen konsistent mit bestehendem Heartbeat-JSON).
- WiFi/MQTT-Circuit-Breaker: wenn sie **Aktoren praktisch blockieren**, aber nicht `DEGRADED_MODE_BLOCKED` auslösen, entweder (a) Admission an CB koppeln **oder** (b) dediziertes Heartbeat-Feld `network_degraded` setzen — **eine** klare Regel, im Code kommentiert.

**Akzeptanz:** Aus einem MQTT-Heartbeat lässt sich ablesen: blockiert wegen **State-Machine**, wegen **NVS**, oder wegen **Netzwerk-CB** — nicht drei Mal „degraded“ ohne Unterscheidung.

---

### 4.7 P2 — CONFIG_PENDING-Observability und intent_outcome-Schema

**Dateien:** `El Trabajante/src/main.cpp` (Transition-Publisher), `El Trabajante/src/tasks/intent_contract.*`, `El Trabajante/src/utils/topic_builder.*`, `El Trabajante/docs/runtime-readiness-policy.md`.

**SOLL (wählbar, eine Variante festlegen und umsetzen):**

- **Variante A:** `publishConfigPendingTransitionEvent` (und ähnliche Roh-JSON-Events) auf **kanonisches** `buildOutcomePayload` mappen (`flow` z. B. `config_pending`, gleiche Pflichtfelder wie andere Outcomes).  
- **Variante B:** separates **Subtopic** nur für Lifecycle-Transitions; `buildIntentOutcomeTopic()` bleibt strikt kanonisch.

**P2 optional:** Wenn Gerät lange in CONFIG_PENDING ohne Exit: Heartbeat-Flag oder periodisches kleines Event (Zähler/Reason) — nur wenn ohne großen Overhead machbar.

**Drift-Outcomes:** wo `intent_id` synthetisch ist, **`boot_sequence_id`** oder dokumentierte synthetische `correlation_id`-Regel mitschicken, damit der Server Sessions zuordnen kann.

**Akzeptanz:** Pro Topic existiert **genau ein** konsumenten-taugliches Schema ODER Subtopic ist im `topic_builder` und in Doku beschrieben.

---

### 4.8 P2 — Tests

**Dateien:** unter `El Trabajante/test/` (bestehende Infra nutzen, z. B. `El Trabajante/test/test_infra/test_config_pending_policies.cpp` als Stilreferenz).

**Neu (mindestens planen und wo möglich implementieren):**

- NVS-Pending-Ring: 4. Intent → Eviction-Outcome-Metadaten.  
- Config-Lane busy: Mock/Stub für Guard → ACK/Outcome.  
- Outbox voll: simulierter `enqueueCriticalOutcome`-Fail-Pfad → Zähler oder erfolgreiche Alternative A/B.  
- Zone invalid JSON → ACK error.

Wo Hardware nötig ist: kurze **Repro-Schritte** in `docs/` oder im Test-README.

---

## 5. Was nicht geändert wird

- Keine Refactors „nebenbei“ in Sensor-/Aktor-Managern außerhalb der direkt genannten Pfade.  
- Keine Änderung der QoS-Policy der Subscriptions außer wenn für diesen Auftrag zwingend nötig (Standard: belassen).  
- Kein Server- oder Frontend-Code in diesem Auftrag.

---

## 6. Abnahme gesamt

- `pio run -e seeed_xiao_esp32c3` für das Zielboard erfolgreich (Hinweis: ohne `default_envs` in `platformio.ini` baut `pio run` ohne `-e` alle Environments; Abnahme daher Env explizit setzen).  
- Bestehende Tests grün; neue Tests für mindestens **einen** P0-Pfad (Eviction **oder** Lane busy **oder** Outbox) vorhanden oder durch dokumentierte Hardware-Repro ersetzt (nur wenn Unit-Test technisch blockiert — dann Begründung im PR).  
- Kurze **Changelog-Notiz** (Commit-Body oder `docs/`): neue **MQTT-String-Codes**/Outcome-Felder, neue Heartbeat-Felder, Subtopic-Entscheidung falls Variante B — inhaltlich konsistent mit Abschnitt 7 für den Server-Folgeauftrag.  
- **Error-Code-Registry:** Jede neue oder geänderte **numerische** Konstante in `error_codes.h` ist in derselben Lieferung in `ERROR_CODES.md` nachvollziehbar dokumentiert (kein Merge ohne beides, wenn Zahlen-Codes betroffen sind).

---

## 7. Hinweis für Folgeauftrag Server

Nach Merge: separater Auftrag El Servador — MQTT-Handler für Codes `PENDING_RING_EVICTION` (finaler Name), `CONFIG_LANE_BUSY`, `PUBLISH_OUTBOX_FULL`; Heartbeat-Felder `critical_outcome_drop_count`, getrennte Degraded-Felder; Parser für einheitliches `intent_outcome` oder zweites Subtopic gemäß Firmware-Doku. **Numerische** ESP-Zuordnung (falls in Payloads oder Logs mitgeführt): `.claude/reference/errors/ERROR_CODES.md` bzw. `error_codes.h` als Quelle.
