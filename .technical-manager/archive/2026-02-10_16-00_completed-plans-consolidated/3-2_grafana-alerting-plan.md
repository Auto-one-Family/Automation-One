# Auftrag 3.2: Grafana Alerting – Verify-First Implementierungsplan
Datum: 2026-02-09
Typ: Verify → Plan (ein Durchgang)
Priorität: 2 von 4 (nach 3.1 mosquitto_exporter)

## Context

Erstanalyse abgeschlossen (Report: `grafana-alerting-analysis.md`). Der Report enthält 5 Alert-Rules mit fertigen YAML-Definitionen. TM-Review hat jedoch **kritische Probleme** identifiziert:

### Probleme im Erstanalyse-Report

1. **YAML-Format unverifiziert:** Die ~150 Zeilen Provisioning-YAML wurden aus Doku-Beispielen zusammengebaut. Grafana Unified Alerting Provisioning ist versionssensitiv (11.5.2). Format-Fehler werden von Grafana STILL ignoriert – kein Error im UI, nur ein Log-Eintrag.

2. **Rule 1 (Server Down) ist strukturell fehlerhaft:** Nutzt `condition: A` direkt auf `up{job="el-servador"}`. Aber `up{}` liefert IMMER Daten (0 oder 1). Mit `condition: A` ohne Threshold-Expression feuert die Rule PERMANENT, weil "A returns data" immer true ist. Rule 1 braucht dieselbe `__expr__` Threshold-Struktur wie Rules 2-5.

3. **Rule 5 (ESP Offline) – Compound Expression unklar:** `god_kaiser_esp_offline > 0 and god_kaiser_esp_total > 0` als PromQL im Alert-Data-Block. Das `and` ist Vector-Matching. Unklar wie der `__expr__` Threshold-Evaluator mit leerem Vector umgeht (wenn esp_total == 0). Muss verifiziert werden.

4. **Keine Validierungsstrategie:** Der Report sagt "Dateien erstellen → Restart → fertig". Kein Verification-Loop, kein Rollback-Plan.

5. **`:ro` Volume blockiert Iteration:** Provisioning-Volume ist read-only. Gut für IaC, schlecht für Ersteinrichtung. Keine Möglichkeit, Rules im UI zu testen.

### Was aus dem Report KORREKT und zu übernehmen ist

- 5 Alert-Rules: Server Down, MQTT Disconnected, DB Down, High Memory, ESP Offline – die RICHTIGEN für das System
- Phase 1: UI-only Alerting (kein Webhook, kein externer Service)
- Kein Alertmanager-Container nötig (Grafana Built-in)
- `noDataState: Alerting` für Critical-Rules korrekt
- File-Provisioning unter `docker/grafana/provisioning/alerting/` korrekt
- Datasource-UIDs: `prometheus` und `loki` (aus datasources.yml)

### Strategie: "Verify-First"

Statt blind YAML zu deployen, nutze einen format-gesicherten Ansatz:

1. Volume temporär auf `:rw` setzen
2. EINE Rule manuell in Grafana UI erstellen (Server Down)
3. Diese Rule via Grafana API exportieren → gibt das EXAKTE Format das Grafana 11.5.2 erwartet
4. Dieses verifizierte Format als Template für alle 5 Rules verwenden
5. Alles als YAML speichern, Container neustarten, prüfen dass alle laden
6. Volume zurück auf `:ro`

## Aufgabe

Drei Phasen in einem Durchgang:

### Phase A: Grundlagen verifizieren

1. Prüfe `docker/grafana/provisioning/datasources/datasources.yml` – exakte UIDs von Prometheus und Loki
2. Prüfe ob `docker/grafana/provisioning/alerting/` existiert oder erstellt werden muss
3. Prüfe Grafana Environment-Variables in docker-compose.yml – ist `GF_UNIFIED_ALERTING_ENABLED` gesetzt oder Default?
4. Prüfe ob das Provisioning-Volume tatsächlich `:ro` ist
5. Prüfe ob Prometheus aktuell `god_kaiser_mqtt_connected`, `pg_up`, `god_kaiser_memory_percent`, `god_kaiser_esp_offline`, `god_kaiser_esp_total` als aktive Metriken hat (curl auf Prometheus API: `http://localhost:9090/api/v1/query?query=up{job="el-servador"}` etc.)
6. Wenn mosquitto_exporter bereits implementiert ist: Prüfe ob `up{job="mqtt-broker"}` verfügbar ist

### Phase B: Verify-First – Format sichern

**Schritt 1:** Volume temporär auf `:rw` setzen
- In docker-compose.yml: `./docker/grafana/provisioning:/etc/grafana/provisioning:rw` (statt `:ro`)
- Grafana-Container neustarten

**Schritt 2:** EINE Alert-Rule manuell in Grafana UI erstellen
- Gehe zu Grafana > Alerting > Alert Rules > New Alert Rule
- Erstelle: "Server Down Test" mit Query `up{job="el-servador"}`, Threshold `< 1`, For: 1m
- Speichere die Rule

**Schritt 3:** Rule via API exportieren
- `curl http://localhost:3000/api/v1/provisioning/alert-rules -u admin:PASSWORD`
- Das gibt das EXAKTE YAML/JSON-Format das Grafana 11.5.2 intern nutzt
- Dieses Format dokumentieren – es ist das VERIFIED TEMPLATE

**Schritt 4:** Test-Rule wieder löschen (via UI oder API)

**Schritt 5:** Volume zurück auf `:ro`

### Phase C: Implementierungsplan erstellen

Basierend auf dem verifizierten Template-Format:

1. **alert-rules.yml erstellen** mit allen 5 Rules im verifizierten Format:
   - Rule 1: Server Down (`up{job="el-servador"}` < 1, for: 1m, severity: critical)
   - Rule 2: MQTT Disconnected (`god_kaiser_mqtt_connected` < 1, for: 1m, severity: critical)
   - Rule 3: Database Down (`pg_up` < 1, for: 1m, severity: critical)
   - Rule 4: High Memory (`god_kaiser_memory_percent` > 85, for: 5m, severity: warning)
   - Rule 5: ESP Offline (`god_kaiser_esp_offline` > 0, for: 3m, severity: warning – mit Guard gegen leeres System)
   - Optional Rule 6: MQTT Broker Down (`up{job="mqtt-broker"}` < 1, for: 1m, severity: critical) – NUR wenn mosquitto_exporter bereits implementiert ist

2. **Für Rule 5 klären:** Wie realisiert man den `esp_total > 0` Guard robust?
   - Option A: Als compound PromQL (`god_kaiser_esp_offline > 0 and god_kaiser_esp_total > 0`)
   - Option B: Als zwei separate Data-Queries mit Math-Expression
   - Option C: Als separate Rule die nur feuert wenn `esp_total > 0`
   - Welche Option funktioniert im verifizierten Grafana-Format? Teste es.

3. **Entscheidung contact-points.yml / notification-policy.yml:**
   - Phase 1 = nur alert-rules.yml. Braucht Grafana einen Default-Contact-Point oder läuft es ohne?
   - Testen: Was passiert wenn alert-rules.yml existiert aber KEIN contact-point definiert ist? Zeigt Grafana die Alerts trotzdem im UI?

4. **Deployment-Reihenfolge:**
   - alerting/ Ordner erstellen
   - alert-rules.yml deployen
   - Container neustarten
   - Jeden Alert einzeln verifizieren (Grafana UI > Alerting > Alert Rules)
   - State prüfen: Alle Rules sollten "Normal" sein (kein Firing, kein Error)

5. **Verifikations-Commands** für Robin:
   - Grafana API Check: Alle Rules geladen?
   - Grafana Logs Check: Keine Provisioning-Errors?
   - Simulations-Test: Wie kann man einen Alert testweise auslösen? (z.B. Server kurz stoppen)

6. **Rollback-Plan:** Was tun wenn Provisioning fehlschlägt?

## Agents (der Reihe nach)

/system-control
Vollanalyse + Verify-First-Durchlauf. Du hast Zugriff auf Grafana (Port 3000), Prometheus (Port 9090), docker-compose.yml, alle Provisioning-Dateien. Führe Phase A + B komplett durch. Dokumentiere das verifizierte Format. Erstelle den Implementierungsplan in Phase C.

/server-debug
Prüfe die Prometheus-Metriken die als Alert-Basis dienen. Curl gegen Prometheus API für jede der 5 (6) Metriken. Bestätige aktuelle Werte und dass sie plausibel sind. Prüfe insbesondere ob `god_kaiser_esp_offline` und `god_kaiser_esp_total` bei leerem System beide 0 sind (Guard-Logik).

## Erfolgskriterium

Report enthält:
- Verifizierte Datasource-UIDs
- Das EXAKTE Grafana 11.5.2 Provisioning-Format (aus dem API-Export, nicht aus Doku)
- Finale alert-rules.yml im verifizierten Format
- Bestätigung: Braucht Phase 1 contact-points.yml/notification-policy.yml oder nicht?
- Lösung für Rule 5 ESP-Offline Guard (verifiziert, nicht theoretisch)
- Deployment-Reihenfolge mit Verifikations-Commands
- Rollback-Plan
- Prometheus-Metrik-Snapshot (aktuelle Werte aller Alert-relevanten Metriken)

## Report zurück an
.technical-manager/inbox/agent-reports/grafana-alerting-impl-plan.md
