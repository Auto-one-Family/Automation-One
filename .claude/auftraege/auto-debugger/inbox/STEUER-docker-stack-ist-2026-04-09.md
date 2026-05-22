---
# Steuerdatei — Docker-Stack IST-Stichprobe → auto-debugger Incident-Baseline
run_mode: incident
incident_id: INC-2026-04-09-docker-ist
run_id: ""
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs: []
scope: |
  Ausgangslage aus Docker-Stichprobe (2026-04-09, lokaler Stack): Container-Status und Log-Tail prüfen,
  gebündeltes INCIDENT-LAGEBILD unter .claude/reports/current/incidents/INC-2026-04-09-docker-ist/ schreiben.
  CORRELATION-MAP: nur falls aus Logs/Metriken eine konkrete Kette erkennbar ist; bei grünem Betrieb
  dokumentieren „keine abweichende Korrelationskette in Stichprobe“ mit Verweis auf betroffene esp_id
  (MOCK_BEAA9D, ESP_EA5484) und Datenpfad MQTT→Server→DB.
  TASK-PACKAGES / SPECIALIST-PROMPTS nur anlegen, wenn messbarer Handlungsbedarf (Fehler, Warnungen mit Impact,
  wiederholte Restarts); sonst ein PKG „Beobachtung / keine Maßnahme“ mit klarem Verify-Hinweis (z. B. erneute
  docker logs + Health-Endpoints) und kein Dev-Handoff ohne Begründung.
  target_docs bewusst leer: reiner Incident-Modus ohne Markdown-Zieldokumente.
forbidden: |
  Keine Secrets in Artefakten; keine Breaking Changes an REST/MQTT/WS/DB ohne separates Gate und Verify-Plan;
  keine Commits auf master (nur Branch auto-debugger/work bei Folge-Implementierung);
  Postgres-Statement-Logs nicht vollständig ins Repo kopieren (nur Kurz-Evidenz: Zeitfenster, Statement-Typ, ggf. eine Zeile).
done_criteria: |
  INCIDENT-LAGEBILD.md existiert und enthält: Zeitpunkt der Stichprobe, Liste geprüfter Container-Namen mit Status,
  Kurzfassung Server-/MQTT-/Frontend-Logs (kein ERROR/FATAL in Stichprobe oder explizit mit Zeile zitiert),
  genannte esp_id bei produktivem Traffic.
  CORRELATION-MAP.md vorhanden (auch wenn Inhalt „keine Anomalie“).
  TASK-PACKAGES.md und SPECIALIST-PROMPTS.md: entweder konkrete PKGs mit Verify-Befehlen oder explizit „keine PKGs —
  Stack grün“ plus optional VERIFY-PLAN-REPORT.md nur bei PKGs mit Code-Bezug.
---

# Steuerdatei — Docker-Stack IST (auto-debugger)

**Git:** Branch `auto-debugger/work` (beim Start des Laufs verifizieren).

## Evidenz aus manueller Stichprobe (Orchestrator-Vorarbeit)

| Prüfung | Ergebnis |
|--------|----------|
| `docker ps` | u. a. `automationone-server`, `automationone-frontend`, `automationone-postgres`, `automationone-mqtt` — Status **healthy** bzw. **Up** |
| `automationone-server` (Tail) | MQTT-Traffic MOCK_BEAA9D + ESP_EA5484, Sensor/Actuator/Heartbeat, `GET /api/v1/health/*` **200** |
| `automationone-mqtt` (Tail) | wiederkehrende **healthcheck**-Clients auf 1883, keine Fehlermeldungen in Stichprobe |
| `automationone-frontend` (Tail) | Vite **ready** (5173) |
| `automationone-postgres` (Tail) | normale `LOG: execute` / Verbindungen, kein **FATAL** in Stichprobe |

**Hinweis:** PowerShell kann bei `docker logs` stderr-Zeilen als NativeCommandError markieren; Inhalt trotzdem auswerten.

## Freitext (optional ergänzen)

<!-- z. B. nach erneutem Lauf: konkrete Log-Zeilen, Request-IDs, Alert-IDs -->
