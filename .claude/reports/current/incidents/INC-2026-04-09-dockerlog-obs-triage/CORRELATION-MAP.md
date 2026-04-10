# CORRELATION-MAP — INC-2026-04-09-dockerlog-obs-triage

**Zweck:** Trennung **korrelierbarer Produktketten** von **Observability-/Such-Artefakten** — keine flache „ERROR“-Suche über alle Container ohne Klasse.

---

## 1. Kette (A) — Gerät / MQTT / Server

**Wenn** Logzeile zu `kaiser/.../esp/<esp_id>/system/error` oder Firmware-**3016** mit EMERGENCY-Kontext gehört (ungültiger/malformed Payload: **`ERROR_MQTT_PAYLOAD_INVALID` = 3016** im Repo — nicht **6016**; siehe `IST-docker-log-triage` §2.1):

1. **`esp_id`** + enges **Zeitfenster**  
2. **Topic** (vollständiger Pfad, nicht nur Substring)  
3. **Numerischer Code** (`error_code` in Payload bzw. 3016 in Firmware-Kommunikation)  
4. Optional: **`intent_outcome`** / Broadcast-Emergency-Metadaten (Firmware `main.cpp`)

**Nicht joinen mit:** Alloy-`compose_service`-Labels allein, Grafana-Startup-Warnungen, cAdvisor-Metrik-Text — außer es geht um **dieselbe** Host-Uhrzeit und ein **bewiesener** Nebenkanal (selten).

---

## 2. Kette (B) — Observability-Stack / Deploy

**Typische Signatur:**

- **Grafana:** Meldungen zu Provisioning-Verzeichnissen / Plugins — Korrelation zu **Grafana-Container** und Config unter `docker/grafana/`.
- **Alloy:** Fehler zu **unbekannter Container-ID** — Korrelation zu **Docker-Events** (Recreate, prune), nicht zu `esp_id`.
- **cAdvisor:** Host/OS-Hinweise — Korrelation zu **Host** und Compose-Mounts (`machine-id`).

**Erwartung:** Diese Ketten erklären sich oft durch **Redeploy** oder **konfigurierte Pfade**, nicht durch Sensorik.

---

## 3. Kette (C) — Schein-Korrelation (Query-Artefakte)

- Loki: `|~ "error"` oder `|= "error"` ohne Feld-Filter — trifft **Nicht-Fehler**.  
- Postgres: `LOG: execute` mit Statement-Text — Wort „error“ in **Daten** oder Spaltennamen.

**Regel:** Erst Klasse zuordnen, dann joinen (Skill-Clustering: Notification/HTTP → `esp_id` → MQTT-CID → …).

---

## 4. Status dieser Auswertung

Keine **eine** zusammenhängende Cross-Layer-Panik-Kette aus einer einzelnen flachen „ERROR“-Suche abgeleitet — stattdessen **Trennung A/B/C** und Verweis auf `docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md`.
