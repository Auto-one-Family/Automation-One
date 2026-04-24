# CORRELATION-MAP — INC-2026-04-24-aut134-config-resync-oversize

> **Pflichtreihenfolge angewendet:**  
> 1) Notification-Felder -> 2) HTTP `request_id` -> 3) `esp_id` + Zeitfenster -> 4) MQTT (synthetische CID wenn nötig) -> 5) Titel/Dedup zuletzt

---

## 1) Notification-Felder (`correlation_id`, `fingerprint`, `parent_notification_id`)

| Quelle | Feld | Wert | Bewertung |
|---|---|---|---|
| User-Event (Pflichtevidenz) | `correlation_id` | `f9f74534-5c3a-4735-876f-4c3132cec644` | Primärer Schlüssel vorhanden |
| User-Event (Pflichtevidenz) | `intent_id` | `f9f74534-5c3a-4735-876f-4c3132cec644` | Mit CID konsistent |
| Workspace-Evidence | `fingerprint` | nicht belegt | OFFEN |
| Workspace-Evidence | `parent_notification_id` | nicht belegt | OFFEN |

Hinweis: Keine belastbare DB-notification-Spur für diese CID im aktuellen Workspace-Snapshot gefunden.

---

## 2) HTTP `X-Request-ID` / `request_id`

| Quelle | Feld | Wert | Bewertung |
|---|---|---|---|
| User-Event (Pflichtevidenz) | `request_id` | nicht separat geliefert | OFFEN |
| Server-Code (`esp_service.send_config`) | Mapping | `correlation_id=request_id=intent_id` | Contract bestätigt |
| Incident-Doku AUT-134 | HTTP-ID | nicht explizit angegeben | OFFEN |

Konsequenz: Für diese Untersuchung wird die CID als führender Kettenschlüssel genutzt; HTTP-Korrelation bleibt als Datenlücke markiert.

---

## 3) `esp_id` + Zeitfenster

| Cluster | `esp_id` | Zeitfenster | Evidence |
|---|---|---|---|
| K-01 Config-Oversize (AUT-134-Doku) | `ESP_6B27C8` | dokumentierte Burstfenster (07:39/08:55/09:19 UTC) | `docs/analysen/configaustausch-architekturanalyse-2026-04-23.md` |
| K-02 Heartbeat-Oversize (COM3) | `ESP_6B27C8`, `ESP_698EB4` | mehrere Livefenster im laufenden Monitor | `terminals/47.txt` |
| K-03 User-Event-Outcome | nicht explizit im Payload genannt | Ereignis mit CID `f9f74534-...` | vom Auftraggeber gelieferter JSON-Event |

---

## 4) MQTT-Layer (inkl. synthetische CID nur falls nötig)

| Kette | Topic / Signal | Schlüssel | Evidence |
|---|---|---|---|
| M-01 Config-Ingress Reject | `.../config` -> `intent_outcome` (`flow=config`, `outcome=rejected`) | echte CID `f9f74534-...` | User-Event |
| M-02 Config-Burst + Oversize | Config-Response-Fehler `[CONFIG] Payload too large: 4370 bytes, max=4096` | keine direkte CID im Dokuauszug | `docs/analysen/configaustausch-architekturanalyse-2026-04-23.md` |
| M-03 Heartbeat Publish Oversize | `kaiser/god/esp/<ESP>/system/heartbeat` reject (`payload_len=1225/1227/1228/1229`) | **synthetische CID** `SYN-HB-OVERSIZE-<esp>-<ts>` | `terminals/47.txt` |
| M-04 Docker-Server Kontrollspur | `intent_outcome flow=config outcome=accepted/persisted` + `Skipping stale config_response ... terminal authority guard` | reale intent_ids (ohne f9f-CID) | `docker logs automationone-server --since 24h --tail 400` |
| M-05 Docker-Alloy Ingestion | `final error sending batch ... dropping data` / `entry too far behind` | n/a | `docker logs automationone-alloy --since 24h --tail 400` |

Synthetische CID-Regel (nur für cid-lose Serialzeilen):
- `SYN-HB-OVERSIZE-ESP_6B27C8-3325818`
- `SYN-HB-OVERSIZE-ESP_698EB4-5318`
- `SYN-HB-OVERSIZE-ESP_698EB4-665605`
- `SYN-HB-OVERSIZE-ESP_698EB4-2646094`

---

## 5) Titel / Dedup-Schlüssel (zuletzt)

| Dedup-Key (abgeleitet) | Nutzen | Risiko |
|---|---|---|
| `config_payload_too_large_4096` | Gruppiert C1/C2 Config-Rejects | kann verschiedene CIDs zusammenziehen |
| `heartbeat_publish_oversize_1024` | Gruppiert C3 Publish-Rejects | trennt nicht automatisch nach Ursache (Zone/metrics/etc.) |

Dedup wurde bewusst erst nach Feld-Korrelation angewendet.

---

## Cross-Layer-Karte (kompakt)

1. CID `f9f74534-...` -> `intent_outcome rejected / VALIDATION_FAIL / payload too large 4164>4096`.
2. Parallel/nah: AUT-134-Doku zeigt wiederholte Config-Responses inkl. 4370>4096.
3. In Live-Serialfenstern treten zusätzliche Heartbeat-Oversize-Rejects 1225..1229>1024 auf.
4. Docker-Server-Logs zeigen parallel die Config-/Intent-Verarbeitung auf derselben Device-Familie, jedoch ohne den exakten User-CID-Schlüssel im gezogenen Tail-Fenster.
5. Diese Ketten teilen das Muster "Payload-Budget verletzt", aber auf **zwei unterschiedlichen Limits** (4096 vs 1024) und dürfen nicht blind als identischer Defekt behandelt werden.

---

## Abgrenzung ISA-18.2 vs WS-`error_event` (Pflicht)

- Persistierte Notification-Kette (Router/Inbox/Ack/Resolve) ist nicht gleich realtime `error_event`.
- Für AUT-134 wurde primär Contract-/Payload-Korrelation aufgebaut; Notification-Fingerprint/Parent-Daten bleiben aktuell offene Arbeitslücke.
