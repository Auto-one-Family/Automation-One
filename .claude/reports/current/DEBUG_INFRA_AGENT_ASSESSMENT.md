# Debug-Infrastruktur – Agenten-Tauglichkeit

**Stand:** 2026-02-13  
**Kontext:** Einschätzung, ob die aktuelle Infra für Debug-Agenten optimal ist.

---

## Kurzantwort

**Teilweise optimal.** Die Richtung (Loki, ein Einstieg, Cross-Layer) stimmt und ist in ROADMAP/DEBUG_CONSOLIDATION_PLAN gut geplant. In der Praxis gibt es noch **Lücken und Inkonsistenzen**, die Agenten unnötig machen (falsche Labels, veraltete Annahmen). Nach den heutigen Korrekturen ist die Basis stimmig; für „optimal“ fehlen vor allem Umsetzung des Konsolidierungsplans und ein paar klare Vorgaben.

---

## Was bereits agentenfreundlich ist

| Aspekt | Status | Nutzen für Agenten |
|--------|--------|---------------------|
| **Ein Einstieg** | OK | `debug-status.ps1` liefert JSON (overall, services, issues) – ein Befehl statt vieler Checks. |
| **Loki zentral** | OK | Alle Container-Logs unter einem API-Zugang, filterbar nach `compose_service`/`container`. |
| **Konsistente Labels** | OK (nach Doku-Update) | LOG_LOCATIONS, SYSTEM_OPERATIONS_REFERENCE, Promtail nutzen `compose_service`; Doku einheitlich. |
| **Strukturierte Server-Logs** | OK | JSON in `logs/server/`, gleiche Daten in Loki (el-servador). |
| **Monitoring-Stack** | OK | Loki, Promtail, Grafana, Prometheus im Profil; Alert Rules (ROADMAP §2.1). |

---

## Was heute korrigiert wurde

1. **debug-status.ps1**
   - Loki-Query nutzte `container_name=~"automationone-.+"` – in Promtail heißt das Label **`container`**. Würde bei echten Loki-Abfragen leer/fehleranfällig sein.
   - Angepasst auf: `container=~"automationone-.+"` für „letzter Log“ und `compose_service="mqtt-broker"` für MQTT.
   - Es wurde ein nicht existierender Service **mqtt-logger** geprüft und `overall=degraded` daran geknüpft → würde bei laufendem Monitoring fast immer „degraded“ liefern. Ersetzt durch Prüfung von MQTT-Broker-Logs in Loki (`mqtt_broker_logs`), ohne Phantom-Container.

2. **Dokumentation (bereits vorher)**  
   Loki überall auf `compose_service` vereinheitlicht; MQTT ohne Bind-Mount dokumentiert; einheitliche Referenz ROADMAP §1.1.

---

## Verbleibende Lücken (nicht optimal)

| Lücke | Auswirkung | Empfehlung |
|-------|------------|------------|
| **Agenten nutzen weiter Dateien zuerst** | server-debug, mqtt-debug, frontend-debug etc. sind auf `logs/…` und `docker exec` ausgerichtet, nicht auf „Loki zuerst“. | DEBUG_CONSOLIDATION_PLAN umsetzen (Backend/Frontend Inspector mit Loki-first, MCP DB, Playwright) oder bestehende Skills um einen klaren Abschnitt „Loki-Alternative“ mit `compose_service`-Queries ergänzen. |
| **Kein zentraler Loki-Query-Skill** | Jeder Agent müsste Queries selbst bauen. | Entweder `loki-queries`-Skill (wie im Plan) anlegen oder in LOG_LOCATIONS.md §12 eine „Agenten-Checkliste“ mit Copy-Paste-Queries pro Layer. |
| **PATTERNS.yaml fehlt** | Fehlermuster-Referenz für Korrelation/Klassifikation nicht nutzbar. | ROADMAP Phase 2.3 angehen; bis dahin in Skills auf ERROR_CODES.md + manuelle Korrelation verweisen. |
| **MCP DB / Playwright** | db-inspector und frontend-debug nutzen `docker exec psql` bzw. haben keinen Browser-Zugriff. | MCP database-server und Playwright MCP konfigurieren und in Agenten/Skills als primäre Option dokumentieren (wie im Konsolidierungsplan). |
| **Log-Pfade doppelt** | Bind-Mount (`logs/server/`) und Loki parallel; Agenten bekommen keine klare Priorität. | In Skills explizit: „Primär: Loki (compose_service=…). Fallback bei Loki down: logs/server/ bzw. docker compose logs.“ |

---

## Empfohlene Reihenfolge für „optimal“

1. **Sofort (erledigt)**  
   - debug-status.ps1: Loki-Labels und mqtt-logger-Logik korrigiert.

2. **Kurzfristig**  
   - In server-debug / mqtt-debug / frontend-debug (Skills oder Agenten) einen Abschnitt „Loki (primär)“ mit je 2–3 Queries (`compose_service=el-servador`, `mqtt-broker`, `el-frontend`) und Verweis auf LOG_LOCATIONS.md §12.  
   - So können Agenten auch ohne auto-ops schon Loki-first nutzen.

3. **Mittelfristig (Konsolidierungsplan)**  
   - Backend/Frontend Inspector mit Loki-first, MCP DB, Playwright;  
   - gemeinsamer `loki-queries`-Skill;  
   - PATTERNS.yaml anlegen und referenzieren.

4. **Optional**  
   - Grafana Alert Webhook (ROADMAP §2.1) und „Korrelations-View“ (ROADMAP §1.3), damit Agenten/Berichte auf Alerts und Zeitfenster zugreifen können.

---

## Fazit

Die Infra ist **gut vorbereitet** (Loki, Labels, ein Einstieg, Doku vereinheitlicht) und nach den Script-/Doku-Anpassungen **konsistent**. Für Agenten ist sie **noch nicht optimal**, weil die bestehenden Debug-Agenten und -Skills weiter datei- und docker-lastig sind und zentrale Bausteine (Loki-first in Skills, MCP, PATTERNS.yaml) fehlen. Mit der Umsetzung des DEBUG_CONSOLIDATION_PLAN und den kurzfristigen Skill-Ergänzungen wird die Infra für Debug-Agenten deutlich optimaler.
