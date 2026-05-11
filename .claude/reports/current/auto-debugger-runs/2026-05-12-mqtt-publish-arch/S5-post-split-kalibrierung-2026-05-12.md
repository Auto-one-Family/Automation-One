# S5 Post-Split Kalibrierung — Core-Heartbeat vs. `PUBLISH_PAYLOAD_MAX_LEN`

**Linear:** [AUT-358](https://linear.app/autoone/issue/AUT-358/s5-aut-353-fwserver-post-heartbeat-split-kalibrierungsverifikation)  
**Datum:** 2026-05-12  
**Scope:** Cross-Layer (Firmware `El Trabajante` + Server `El Servador`)

---

## 1. Kurzfazit

| Kriterium | Bewertung |
|-----------|-----------|
| Core-Heartbeat vs. **1536 B** (`PUBLISH_PAYLOAD_MAX_LEN`) | **Sicher** bei typischen Feldlängen; **Stress** mit sehr langen `zone_id`/`zone_name`/Reason-Strings kann weiterhin **>1536 B** werden (selten). |
| Metrics-Topic `…/system/heartbeat_metrics` vs. **1536 B** | **Sicher** im Repräsentativ- und Stress-Beispiel (siehe §3). |
| Degradation **free_heap &lt; 46000 → gpio_status weglassen** | **Entfernt / nicht mehr anwendbar** — `gpio_status` ist seit **PKG-17** nicht mehr im Heartbeat; kein entsprechender Trigger im aktuellen `mqtt_client.cpp`. |
| Server-Merge **AUT-121** | **Vorhanden** — TTL-Cache + idempotenter Merge vor Heartbeat-Processing (`_merge_metrics_into_payload`). |

---

## 2. Firmware — Konstante & Guards

| Was | Wert / Ort |
|-----|------------|
| `PUBLISH_PAYLOAD_MAX_LEN` | **1536** — `El Trabajante/src/tasks/publish_queue.h` |
| Core-Heartbeat-Bau | `MQTTClient::publishHeartbeat()` — `El Trabajante/src/services/communication/mqtt_client.cpp` (ca. Zeilen 1481–1615) |
| Oversize-Guard (Core + Metrics) | `payload.length() >= PUBLISH_PAYLOAD_MAX_LEN` → `noteHeartbeatOversizeSkip()` + Log `[AUT-134]` — **nur** wenn **nicht** `MQTT_USE_PUBSUBCLIENT` |
| Split-Flag | `#define ENABLE_METRICS_SPLIT` in `El Trabajante/src/config/feature_flags.h` (**aktuell eingeschaltet**) |
| `gpio_status` | **Nicht mehr im Payload** (Kommentar PKG-17 in `mqtt_client.cpp`); ersetzt durch REST/GPIO-Status-Pfade laut Architektur |

---

## 3. Payload-Größen (repräsentativ & Stress, UTF-8, `json.dumps(..., separators=(',',':'))`)

Messung: Python-Referenz-Objekte, die die **Felder und Typen** der Firmware-JSON spiegeln (kein Live-Serial).

### 3.1 Tabelle „vor / nach Split“

| Payload-Komponente | Größe **vor** Split (Monolith, alle Zähler im Core-HB) | Größe **nach** Split (Core nur + separates Metrics-JSON) | Delta (Richtung kleiner Core) |
|--------------------|------------------------------------------------------|------------------------------------------------------------|--------------------------------|
| **Core** (`system/heartbeat`) | **1452 B** (typisch-mittel) | **818 B** (typisch-mittel) | **−634 B** |
| **Metrics** (`system/heartbeat_metrics`) | — (im Monolith enthalten) | **675 B** (gleiche Zähler wie oben ausgelagert) | — |
| **Summe Transport** (2 Topics) | 1452 B (1× Publish) | 818 + 675 = **1493 B** (2× Publish, QoS 0) | Mehr **MQTT-Overhead**, weniger **pro Nachricht** |

**Stress** (künstlich lange Strings in `zone_id`, `zone_name`, `persistence_degraded_reason`, `handover_contract_last_reject`, große Zähler):

| Variante | Größe |
|----------|------:|
| Core nach Split (Stress) | **1025 B** |
| Monolith inkl. Metrics-Felder (Stress) | **1767 B** → **über** 1536 B |

**Interpretation:** Der Split reduziert den **kritischen** Core-Pfad deutlich; der **Monolith** lag im typischen Beispiel schon bei **~1452 B** (nur **~84 B** unter Limit). Unter Stress bricht der Monolith zuverlässig über 1536 B — der Core nach Split bleibt im gleichen Stress-Beispiel unter Limit.

### 3.2 Headroom (Core, Limit 1536 B)

| Szenario | Core-Größe | Headroom | % unter Limit |
|----------|-----------:|---------:|--------------:|
| Typisch-mittel (nach Split) | 818 B | 718 B | ~47 % |
| Stress-Strings (nach Split) | 1025 B | 511 B | ~33 % |

**Bewertung:** **sicher** für den üblichen Betrieb; **nicht** „unbegrenzt“ — sehr lange konfigurierbare Strings könnten den Core wieder Richtung Grenze treiben (ohne `gpio_status`-Ballast).

---

## 4. Degradation-Trigger (`free_heap` / `gpio_status`)

- **Repo-Suche:** Kein Vorkommen von `46000`, kein „skipping gpio_status“ in `El Trabajante/src` (Stand Analyse 2026-05-12).
- **Folge:** Die in AUT-358 genannte Policy bezieht sich auf **ältere** Firmware (vgl. AUT-58 / INC-Dokumentation). **Aktuell:** kein Heap-gesteuertes Weglassen von `gpio_status`, weil das Feld **entfernt** wurde.

**Antwort auf Issue-Frage „Trigger noch notwendig?“:** **Entfernbar bzw. bereits obsolet** — es gibt nichts mehr zu entschärfen; stattdessen greifen **AUT-134** Oversize-Skip + Telemetrie `publish_queue_oversize_skip_count` (über Metrics-Topic, wenn Split aktiv).

---

## 5. Server — `ENABLE_METRICS_SPLIT` / Merge

| Anforderung | Ist |
|-------------|-----|
| Separater Subscribe auf `…/heartbeat_metrics` | Registriert in `El Servador/god_kaiser_server/src/main.py` → `heartbeat_metrics_handler.handle_heartbeat_metrics` |
| Ingest ohne DB | `heartbeat_metrics_handler.py` — `TTLCache`, max 120 s |
| Merge in nächsten Core-Heartbeat | `heartbeat_handler.py` — `_merge_metrics_into_payload()` vor DB-Pfad; **überschreibt** keine bereits im Core-HB gesetzten Keys; ergänzt fehlende Metrik-Felder + `metrics_delta_ts` / `metrics_freshness_seconds` |
| `metrics_schema_version` | Im **Metrics**-Topic gesetzt (Firmware); Merge kopiert in kombinierte Sicht, sofern nicht schon im Core |
| Tests | `tests/mqtt/test_heartbeat_metrics_handler.py`, `tests/mqtt/test_heartbeat_handler.py` (Merge gemockt) |

**Bewertung Merge-Pfad:** **vorhanden** und **idempotent** im Sinne „Heartbeat authoritative, Metrics füllen Lücken“.

---

## 6. Abgleich Doku vs. Code (Hinweis)

`El Trabajante/docs/Mqtt_Protocoll.md` besagt u. a., `ENABLE_METRICS_SPLIT` sei auf `esp32_dev` standardmäßig inaktiv — **Abweichung:** In `src/config/feature_flags.h` ist das Makro **global gesetzt**. Empfehlung: Doku oder Flag-Default im Rahmen eines separaten Doc-Tickets angleichen (nicht Teil dieses Belegs).

---

## 7. Evidenz-Referenzen (Dateien)

- Firmware: `mqtt_client.cpp` (`publishHeartbeat`, `publishHeartbeatMetrics`), `publish_queue.h`, `feature_flags.h`
- Server: `heartbeat_handler.py` (`_merge_metrics_into_payload`), `heartbeat_metrics_handler.py`, `main.py` (Registrierung)

---

*Ende Beleg AUT-358 / S5.*
