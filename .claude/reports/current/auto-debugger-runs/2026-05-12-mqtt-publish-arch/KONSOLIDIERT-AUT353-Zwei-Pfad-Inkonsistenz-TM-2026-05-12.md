# AUT-353 (Parent): Zwei-Pfad-Inkonsistenz nach Heartbeat-Split — Konsolidierter Analysebericht + TM-Entscheidungsblock

**Run:** `2026-05-12-mqtt-publish-arch`  
**Datum:** 2026-05-12  
**Typ:** Konsolidierung (S0–S5, BELEG-MQTT-PUB-ARCH, BELEG-AUT354)  
**Linear:** [AUT-353](https://linear.app/autoone/issue/AUT-353) (Parent), Sub-Issues AUT-354..358  

---

## 1. Zweck und Leseweg

Dieses Dokument fasst die abgeschlossenen Analysen zu **AUT-353** zusammen: warum nach dem **Heartbeat-Metrics-Split** (AUT-121 / `ENABLE_METRICS_SPLIT`) eine **Zwei-Pfad-Architektur** am ESP32 zu **scheinbaren Inkonsistenzen** zwischen „Queue“, „Direktpfad“, **IDF-Outbox** und **TCP-Transport** führt, und welche **kalibrierenden** bzw. **operativen** Schlüsse der Technical Manager verbindlich treffen kann.

**Quellen im Repo (gleicher Run):**

| Artefakt | Inhalt |
|----------|--------|
| `BELEG-MQTT-PUB-ARCH-2026-05-12.md` | Search/Verify-vor-Create, Issue-Matrix, grobes Zwei-Pfad-Diagramm |
| `BELEG-AUT354-S2-core0-directpath-queue-2026-05-12.md` / `S2-direktpfad-inventar-2026-05-12.md` | Queue 8 vs. 15, Direktpfad-Inventar, Tick-Reihenfolge, Bottleneck-Ebenen |
| `S1-queue-kalibrierung-2026-05-12.md` | AUT-355 — Parameter-Empfehlung nach Split |
| `S3-recovery-pfad-2026-05-12.md` | AUT-356 — Drain, CB, Heartbeat vs. `safePublish` |
| `S4-server-queue-pressure-2026-05-12.md` | AUT-357 — Server-Reaktion auf `queue_pressure` |
| `S5-post-split-kalibrierung-2026-05-12.md` | AUT-358 — Payload-Limits, Server-Merge |

---

## 2. Executive Summary

1. **Es gibt nicht „eine“ Publish-Warteschlange**, sondern mindestens **drei eng verwandte, aber verschiedene Begrenzungen:** die **App-Queue** `g_publish_queue` (8 Slots), die **ESP-IDF-MQTT-Outbox** (alle akzeptierten `esp_mqtt_client_publish`), und den **TCP/LWIP-Sendefähigkeitszustand** (z. B. `errno=11` EAGAIN). Lastspitzen und Forensik müssen **die Ebene benennen**, sonst wirken Metriken „widersprüchlich“.

2. **Der Heartbeat-Split** verschiebt JSON-Metriken in ein zweites Topic (`…/system/heartbeat/metrics`). Das **erhöht die Zahl der Core-0-Direkt-Publishes** im Heartbeat-Takt (bis zu **zwei** Direktnachrichten statt einer), **nicht** die Enqueue-Last auf `g_publish_queue` durch den Split allein. Die **gemeinsame Outbox/TCP-Pipeline** wird dadurch **additiv** stärker beansprucht — das ist die sachliche Verbindung zwischen **AUT-121** und **AUT-353**.

3. **Die Diskrepanz „8 vs. 15 Slots“** ist **geklärt:** kanonisch **`PUBLISH_QUEUE_SIZE = 8`** (`publish_queue.h`). „15“ ist **historisch** (Heap/CommTask-Risiko, AUT-344). **Planungs-MDs** (`architektur-autoone/paket-01-*`, `.claude/auftraege/Auto_One_Architektur/esp32/paket-03*`, `paket-06*`) und Belege **AUT-362** (2026-05-12) an **8** angeglichen; alte Session-Snippets unter `.claude/reports/current/auftrag-*` können historische Logzeilen zitieren.

4. **Server-seitig** reagiert `queue_pressure` aktuell **nur observability** (Logs + Prometheus). Das ist für **PKG-01a** **architektonisch stimmig**; **aktive Laststeuerung vom Server zum ESP** wäre ein **eigenes Produktfeature**, nicht „fehlender Fix“.

5. **Sub-Analysen AUT-354–358** sind inhaltlich **Erledigt** (Analyse/Beleg). **Implementierungs-Arbeit** bleibt in den **bestehenden** Tickets (**AUT-326** P0, **AUT-344**, **AUT-346**, **AUT-121** Abschluss/Merge). **Doku „15“-Slots:** **AUT-362** bereinigt kanonische Planungs-MDs; verbleibend optional (`Mqtt_Protocoll.md` vs. `feature_flags.h`, historische Reports).

---

## 3. Problemstellung: Was meint „Zwei-Pfad-Inkonsistenz“?

### 3.1 Die zwei logischen Pfade (App-Sicht)

| Pfad | Wann? | Wohin? |
|------|--------|--------|
| **Enqueue → Drain** | Aufruf von `MQTTClient::publish()` auf **Core 1** oder im **MQTT-Data-Callback** (`g_in_mqtt_event_callback`) | `tryQueuePublish` → **`g_publish_queue`** (max. 8) → `processPublishQueue()` → `esp_mqtt_client_publish` |
| **Core-0-Direktpfad** | `publish()` auf **Core 0** und **nicht** im obigen Callback | **ohne** Slot in `g_publish_queue` → sofort `esp_mqtt_client_publish` |

Zusätzlich: **`publishSessionAnnounce()`** umgeht den Router und publiziert **direkt** im Connect-Kontext.

**Inkonsistenz im Betrieb:** Metriken wie `publish_queue_fill`, `high_watermark`, `shed_count` beschreiben **nur** die App-Queue. **Heartbeat**, **Heartbeat-Metriken**, **Actuator-Status-Bursts**, **`queue_pressure`**, **Intent-Outcome-Replay** (Teile) laufen jedoch **direkt** auf Core 0 — sie **können** die Outbox/TCP **ohne** sichtbare Queue-Füllung belasten. Umgekehrt kann die Queue **voll** sein, während der Transport noch „atmet“, oder umgekehrt der Transport **EAGAIN** melden, **ohne** dass zuerst die App-Queue das Limit erklärt.

### 3.2 Drei Bottleneck-Ebenen (immer getrennt denken)

1. **`g_publish_queue` (8):** Backpressure, Shedding, Drops, `queue_pressure`-Hysterese — **Core-1-/Callback-Traffic**.
2. **IDF-MQTT-Outbox:** `msg_id == -2` / „outbox full“ — **alle** akzeptierten Publishes (Direkt + Drain).
3. **TCP non-blocking send:** `errno=11` (EAGAIN), Write-Timeouts — **Bursts** aus Direktpfad + Drain + QoS-1-Druck.

**Folge für AUT-344 / Stress-Forensik:** Die Frage „welche Queue ist der Bottleneck?“ hat die Antwort: **häufig Transport oder Outbox** unter Burst; die **8er-Queue** ist das **vorgelagerte** Ventil für einen Teil des Traffics, aber **nicht** die alleinige Erklärung für `errno=11`.

### 3.3 Was der Heartbeat-Split konkret ändert

- **Kern-Heartbeat** (`…/system/heartbeat`) und **Metriken** (`…/system/heartbeat/metrics`) werden in `MQTTClient::loop()` (Comm-Task, Core 0) gebaut; beide nutzen **`publish()` → Direktpfad**.
- Zusätzliche Metrik-Publish-Rate: **bei Änderung** der Snapshot-Zähler **sofort**, sonst spätestens alle **`METRICS_MAX_SKIP_COUNT` (5)** Heartbeat-Takte — bei 60 s HB typisch bis ~**5 min** ohne Zähleränderung.
- **Wichtig:** Der Split **verkleinert** typischerweise den **Core-Payload** (weniger „Monolith“-JSON pro Nachricht), verschiebt aber **einen Teil** der Bytes auf ein **zweites MQTT-Publish** → **mehr MQTT-Overhead**, **weniger** pro Nachricht — siehe quantitative Tabelle in **S5**.

### 3.4 Kommunikations-Tick-Reihenfolge (IST, verifiziert)

In `communication_task.cpp` (operational, 50 ms):

1. `wifiManager.loop()`
2. `mqttClient.loop()` — u. a. **Heartbeat (+ ggf. Metrics)** → **Direkt**
3. `checkRegistrationTimeout()`
4. `processPublishQueue()` — zuerst **Intent-Outcome-Outbox** (bis 2 Versuche/Tick), dann **max. 1** Drain (`PUBLISH_DRAIN_BUDGET_PER_TICK = 1`)
5. `handleActuatorStatusPublish()` — **N** Direkt-Publishes (alle Aktoren, alle 30 s)
6. `handleQueuePressureHysteresis()` — **Direkt**, nur auf Flanken

*(Ältere Diagramme, die den Drain vor den Heartbeat setzen, sind gegenüber dem IST-Code zu korrigieren.)*

---

## 4. Sub-Issues: Ergebnisse in einem Überblick

### AUT-354 (S2) — Direktpfad-Inventar + 8 vs. 15

- **Eine** Queue, **`PUBLISH_QUEUE_SIZE = 8`**. „15“ = historisch; **Telemetrie/Doku** auf **8** alignen.
- Vollständige Tabelle der **Core-0-Direktpfade** (Topic, ungefähre Größe, Frequenz, QoS, `critical`-Flag) liegt in **S2/BELEG-AUT354**.
- **Heap pro Queue:** grob **15–18 kB** für 8 × `PublishRequest` (siehe Größen-Audit in S2).

### AUT-355 (S1) — Queue-Parameter nach Split

| Parameter | Empfehlung | Kurzbegründung |
|-----------|------------|----------------|
| `PUBLISH_QUEUE_SIZE` | **8** | Heap/CommTask-Stabilität (vgl. AUT-344) |
| `PUBLISH_QUEUE_SHED_WATERMARK` | **6** (75 %) | Reserven bis „voll“; passt zu `queue_pressure`-Hysterese (`RECOVERED` bei fill < 4) |
| `PUBLISH_DRAIN_BUDGET_PER_TICK` | **1** | AUT-54: höhere Drain-Rate verschärft TCP/Outbox-Konkurrenz im selben 50-ms-Fenster |

**Korrektur:** Linear/Issue-Texte, die noch **Drain = 3** und `publish_queue.cpp` als Budget-Ort nennen, sind **veraltet** — IST: **1**, in **`mqtt_client.cpp`**.

### AUT-356 (S3) — Recovery, Circuit Breaker, Heartbeat

- Theoretische **reine Drain-Zeit** bei voller Queue: **8 × 50 ms = 400 ms** (operational) bzw. **8 × 100 ms** in eingeschränkten States — **Praxis** durch Retries/Outbox/Requeues länger.
- **MQTT CircuitBreaker:** `5` Fehler → OPEN, **`recovery_timeout_ms = 30 s`**, **`halfopen_timeout_ms = 10 s`**. **30 s < Keepalive 60 s** — OPEN→HALF_OPEN passiert **vor** einem vollen Keepalive-Intervall, sofern die Zustandsmaschine nicht oszilliert.
- **Heartbeat** nutzt **`publish()`**, **kein** `safePublish()` → **keine** CB-Sonderfreigabe: bei **OPEN** wird der **JSON-Heartbeat blockiert** (Broker-PING/IDF-Keepalive ist davon **logisch getrennt** — Ops-Relevanz für AUT-346).
- **Zusatzbefund:** `processPublishQueue()` ruft **`esp_mqtt_client_publish` ohne** `circuit_breaker_.allowRequest()` auf → **Asymmetrie** „Drain vs. Admission“ unter CB (für AUT-346 dokumentieren/entscheiden).

### AUT-357 (S4) — Server und `queue_pressure`

- Handler: `queue_pressure_handler.py` — **parse → Prometheus-Counter → strukturiertes Log**; **`entered_pressure` → WARNING**.
- **Kein** DB-Write, **kein** WS, **keine** aktive Backpressure — **reine Observability**.

### AUT-358 (S5) — Post-Split-Payload und Server-Merge

- **1536 B** (`PUBLISH_PAYLOAD_MAX_LEN`): Core nach Split im **typischen und Stress-Beispiel** mit Kopf unter Limit; **Monolith** konnte unter Stress **über** 1536 B steigen — Split **reduziert Risiko** auf dem Kernpfad.
- **`gpio_status` / free_heap 46000:** im aktuellen Code **obsolet** (PKG-17 — Feld entfernt).
- **Server:** Subscribe auf `heartbeat_metrics`, **TTLCache**, **`_merge_metrics_into_payload`** im Heartbeat-Handler — Merge-Pfad **vorhanden** und **idempotent** im Sinne „Core autoritativ, Metriken füllen Lücken“.

---

## 5. Einordnung zu Nachbar-Issues (kein Doppel-Scope)

| Issue | Rolle |
|-------|--------|
| **AUT-326** (P0, In Progress) | **Outbox-Exhaustion / Crash** — orthogonal zu AUT-353-Analyse; **nicht** duplizieren |
| **AUT-344** | Aktor-Burst / COMM-Queue — **S2** beantwortet 8-vs-15 und Bottleneck-Framing; **S1** liefert Kalibrierungs-Empfehlung |
| **AUT-346** | CB-OPEN vs. Heartbeat — **S3** liefert Zahlen und CB-/Heartbeat-Verhalten + Drain-Asymmetrie |
| **AUT-121 / AUT-133** | Split + Utilization — **S5** verifiziert Payload/Merge; **S1** nach S2 abgeschlossen |

---

## 6. TM-Entscheidungs-Block (verbindliche Leitplanken)

### 6.1 Architektur- und Modell-Entscheidungen

| ID | Entscheidung | Status | Begründung |
|----|--------------|--------|------------|
| **D1** | **Drei-Ebenen-Modell** (App-Queue / IDF-Outbox / TCP) ist die **kanonische** Fehler- und Metrik-Erklärung für Publish-Druck. | **Fest** | Vermeidet „Queue sagt X, Transport sagt Y“-Scheinwidersprüche |
| **D2** | **`g_publish_queue`-Kapazität = 8** ist **Single Source of Truth** für Dimensionierung und Server-Felder wie `queue_capacity`. | **Fest** | Repo + Header-Kommentar; „15“ nur noch als **historischer** Verweis |
| **D3** | **Heartbeat-Split** wird als **bewusster zusätzlicher Direktpfad-Last** verstanden; er **ersetzt nicht** Outbox-/TCP-Analyse. | **Fest** | S1/S2/S5 |
| **D4** | **Server-Reaktion auf `queue_pressure`** bleibt **Observability-only** (Logs + Prometheus), **keine** aktive Server-Backpressure ohne **explizites** neues Feature-Ticket. | **Fest** | Server-zentrisch = Automationslogik, nicht Firmware-Puffer-Steuerung; S4 |

### 6.2 Kalibrierungs-Entscheidungen (Firmware-Parameter)

| ID | Parameter | Entscheidung | Bedingung / Review |
|----|-----------|--------------|---------------------|
| **K1** | `PUBLISH_QUEUE_SIZE` | **8 beibehalten** | Keine Erhöhung ohne Heap- und CommTask-Canary-Messung |
| **K2** | `PUBLISH_QUEUE_SHED_WATERMARK` | **6 beibehalten** | Änderung nur zusammen mit Neukalibrierung der `queue_pressure`-Hysterese |
| **K3** | `PUBLISH_DRAIN_BUDGET_PER_TICK` | **1 beibehalten** | **Kein** Anheben auf 2–3 ohne **gemessene** TCP/Outbox-Baseline nach AUT-121-Produktivierung |

### 6.3 Follow-up / Umsetzungs-Entscheidungen (kein AUT-353-Code)

| ID | Thema | Entscheidung | Owner / Issue |
|----|-------|--------------|----------------|
| **F1** | **CB-Asymmetrie** Drain vs. `allowRequest()` | **Explizit in AUT-346** (oder Sub-Issue) aufnehmen: gewünschte Policy „Drain respektiert CB ja/nein“ | esp32-dev |
| **F2** | **AUT-326** Outbox/Crash | **Unverändert P0**; Analysen AUT-353 **nicht** mischen | esp32-dev |
| **F3** | **Veraltete Doku** („15“, Drain-Budget-Ort, `Mqtt_Protocoll.md` vs. `feature_flags.h`) | **Bereinigung** als separates **docs/chore**-Paket (optional `/updatedocs`) | mqtt-dev / esp32-dev |
| **F4** | **Feldtelemetrie** `shed_count` / `drop_count` / Outbox | **Optional** 24 h Normal + Stress **nach** AUT-121-Stabilisierung | Ops / TM |

### 6.4 Abschlusskriterien Parent AUT-353

- [x] **S2** — Direktpfad-Inventar + 8-vs-15 **abgeschlossen**  
- [x] **S3** — Recovery/CB/Heartbeat **abgeschlossen**  
- [x] **S4** — Server `queue_pressure` **abgeschlossen**  
- [x] **S5** — Post-Split-Payload/Merge **abgeschlossen**  
- [x] **S1** — Kalibrierungsempfehlung **abgeschlossen** (nach S2)  

**TM-Empfehlung Linear:** AUT-353 und AUT-354–358 auf **„Analyse Done“** / **Cancelled as analysis** setzen oder Label **`analyse-complete`**; **Implementierung** weiter über **AUT-326**, **AUT-344**, **AUT-346**, **AUT-121/133**.

---

## 7. Glossar (kurz)

| Begriff | Bedeutung |
|---------|-----------|
| **Direktpfad** | Core-0-`publish()` ohne `g_publish_queue`-Slot |
| **Drain** | `processPublishQueue` entnimmt aus `g_publish_queue` und ruft IDF-Publish auf |
| **Outbox** | Interne Warteschlange des ESP-IDF-MQTT-Clients für ausgehende Publishes |
| **Shedding** | Verwerfen/**Nicht-Einreihen** von Nicht-Kritischem ab `PUBLISH_QUEUE_SHED_WATERMARK` |

---

*Ende Konsolidierung AUT-353 — Technical Manager Block in §6 ist die operative Übergabe an Linear und Dev-Dispatch.*
