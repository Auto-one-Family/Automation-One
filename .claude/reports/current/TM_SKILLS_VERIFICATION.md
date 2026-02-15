# TM SKILLS.md Verification Report

> **Datum:** 2026-02-09
> **Anlass:** Robin meldete falsche Frontend-Loki-Behauptung in TM SKILLS.md

---

## 1. Grafana-Panels-Auftrag: OBSOLET

Der TM-Auftrag `server-dev-grafana-panels.md` beschreibt Reparatur von Panels 2-4.
**Alle 3 Panels sind bereits im Zielzustand:**

| Panel | TM nahm an (VORHER) | Realitaet (IST) |
|-------|---------------------|-----------------|
| 2. MQTT | `up{job="mqtt-broker"}` | `god_kaiser_mqtt_connected` (Prometheus) |
| 3. Database | `up{job="postgres"}` | `sum(count_over_time({compose_service="postgres"}[1m]))` (Loki) |
| 4. Frontend | `up{job="el-frontend"}` | `sum(count_over_time({compose_service="el-frontend"}[1m]))` (Loki) |

**Aktion:** Command nach `commands/completed/` verschoben.

---

## 2. TM SKILLS.md Zeile 181: FALSCH (GEFIXT)

**VORHER (falsch):**
> `WICHTIG: Label ist service_name (NICHT service!), Werte sind Container-Namen wie automationone-server`

**Realitaet (promtail/config.yml):**
- `service` = Compose-Service-Name (el-servador, mqtt-broker, el-frontend)
- `compose_service` = identisch mit service
- `compose_project` = Compose-Projekt (auto-one)
- `container` = Container-Name (automationone-server, etc.)
- `service_name` existiert NICHT in dieser Promtail-Config

**NACHHER (korrigiert):**
> Labels sind `service` oder `compose_service` (Compose-Service-Name). Das Label `service_name` existiert NICHT. Frontend hat KEINE direkte Loki-Integration (0 Queries).

---

## 3. Frontend-Loki: 0 Integration (GEFIXT)

**TM-Annahme:** "60+ Frontend-Queries nutzen service_name"
**Realitaet:** Grep auf El Frontend/src/ nach loki/Loki/LOKI: **0 Treffer**

Die Fehler-Kette:
1. TM SKILLS.md Z.181 behauptet `service_name` sei DAS Label
2. TM schloss daraus, Frontend nutze dieses Label in Queries
3. "60+ Queries" wurde als Fakt weitergegeben
4. Tatsaechlich: Frontend hat NULL Loki-Verbindung

**LOG_ACCESS_REFERENCE.md** war bereits korrekt (v1.2, fixiert am 2026-02-08).

---

## 4. Test-Zahlen: FALSCH (GEFIXT)

| Was | TM SKILLS.md (alt) | Realitaet | Korrigiert |
|-----|--------------------|-----------|----|
| Backend Tests | 756 | 105 Files | JA |
| Frontend Tests | 250 | 10 | JA |
| Wokwi Szenarien | 138 | 163 | JA |

---

## 5. Alle Fixes in TM SKILLS.md

| Zeile (ca.) | Was geaendert | Von | Nach |
|------------|---------------|-----|------|
| 42 | Test-Counts | 756/250/138 | 105/10/163 |
| 179 | Loki Error-Rate Query | `service_name` | `service` |
| 180 | Loki Volume Query | `service_name` | `service` |
| 181 | Label-Warnung | "service_name (NICHT service!)" | "service oder compose_service. service_name existiert NICHT" |
| 196-203 | Label-Referenztabelle | service_name + Container-Namen | service/compose_service/compose_project/container |
| 270, 575, 625 | Wokwi-Count | 138 | 163 |

---

## 6. Zusammenfassung fuer TM

**Die Root Cause war Zeile 181:** Eine falsche Label-Behauptung (`service_name` statt `service`) fuehrte zu einer Kaskade von Fehlschlüssen:
- Falsche Loki-Query-Beispiele in Skill 2
- Annahme "60+ Frontend-Queries" (Frontend hat 0)
- Falscher Grafana-Reparatur-Auftrag (war bereits gefixt)

**Gefixt:**
- TM SKILLS.md: Labels, Test-Zahlen, Wokwi-Count korrigiert
- Grafana-Auftrag: Nach completed/ verschoben
- LOG_ACCESS_REFERENCE.md: War bereits korrekt (v1.2)
