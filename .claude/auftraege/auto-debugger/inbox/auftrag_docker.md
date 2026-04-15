---
run_mode: both
incident_id: INC-2026-04-09-dockerlog-obs-triage
run_id: dockerlog-obs-triage-2026-04-09
order: incident_first
target_docs:
  - docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
scope: |
  Ziel: Aus der Docker-Log-Auswertung (Stand 2026-04-09) einen konsistenten IST-/Triage-Strang bauen,
  der drei Ebenen trennt: (A) echte MQTT-Geraete-Signale auf …/system/error inkl. Code 6016
  (EMERGENCY_PARSE_ERROR / EmptyInput) und zugehoerige intent_outcome/kritische Drops;
  (B) operationalen Observability-Stack-Laerm (Grafana Plugin-Provisioning-Verzeichnis fehlt;
  Alloy: Tailer auf tote/entfernte Container-IDs); (C) Schein-Fehler (Loki-Query-Text mit "error",
  JSON-Labels, Alert-Text in DB-INSERTs). Keine Vermischung dieser Klassen in einer flachen "ERROR"-Suche.

  Inhaltlich: Neues oder erweitertes Markdown unter docs/analysen/ (Hauptlieferobjekt: erste Datei in
  target_docs) mit: Kurzmethodik (strenge Muster vs. Breitensuche), Tabelle Signal vs. Nicht-Signal,
  Prioritaeten (P0 Produkt 6016-Pfad klaeren; P1 Alloy/Grafana bereinigen dokumentieren;
  P2 cAdvisor-Windows-Hinweise als erwartbar markieren), und explizite Verweise auf Repo-Stellen
  (MQTT-Handler, Alert/Correlation-Konzept), soweit im Checkout auffindbar — ohne Secrets.

  Modus both: zuerst Incident-Artefakte unter .claude/reports/current/incidents/INC-2026-04-09-dockerlog-obs-triage/
  (Timeline, Evidenzzeilen, betroffene Topics/ESP-IDs aus dem Bericht), dann Artefaktverbesserung
  (docs/analysen + ggf. TASK-PACKAGES-Vorschlag nur wenn Code/Compose-Aenderungen noetig und im Scope).

  Branch auto-debugger/work: Code/Compose nur wenn klar abgegrenzt und ohne Breaking REST/MQTT/WS/DB;
  sonst Doku-only mit konkretem Follow-up-Vorschlag fuer DevOps/Firmware.
forbidden: |
  Keine Secrets; keine Breaking Changes an REST/MQTT/WebSocket/DB ohne separates Gate.
  Code-Aenderungen nur auf Branch auto-debugger/work (von master bzw. repo-Default verifizieren);
  kein git push, kein force-push, kein force-merge durch Agenten.
  Bash nur fuer eingeschraenktes Git: Branch pruefen, checkout auto-debugger/work, status, read-only log/diff.
  Keine Pfade oder Repo-Namen ausserhalb der Auto-one-Wurzel; keine Verweise auf Strategie-Repositorys.

  Git-Pflicht fuer Spezialisten: Vor Arbeit Branch auto-debugger/work verifizieren; keine Commits auf
  master/Release ohne menschliches Gate; bei falscher Branch nur checkout auto-debugger/work wenn sauber.
  TASK-PACKAGES: pro Code-Paket Akzeptanzkriterium "Aenderungen auf auto-debugger/work".

  Shell: Auf Robins Arbeitsplatz PowerShell — Befehle mit Semikolon verketten, nicht && .
done_criteria: |
  Incident-Ordner mit README oder index.md: Symptom, Zeitfenster, betroffene Container/Topics,
  Evidenz (paraphrasiert, keine Secrets), Trennung A/B/C aus scope erfuellt.

  docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md existiert und enthaelt:
  messbare Abschnitte zu Methodik, Prioritaeten, und klare Aussage ob Alloy/Grafana nur Doku oder
  konkrete Compose-Mount-Anpassung empfohlen wird (mit Begruendung).

  IST-observability-correlation-contracts-2026-04-09.md: entweder unveraendert mit Verweis warum,
  oder um Querverweise/Correlation zu MQTT system/error und Deploy-Lifecycle ergaenzt (additiv).

  Keine gruenen Behauptungen zu Playwright/vue-tsc ohne nachweisbare lokale Voraussetzungen.
  Bei aktiven Code-Paketen: FEHLER-REGISTER.md im Run-Ordner falls Skill/Vorgabe greift;
  nach nennenswerter PKG-Aenderung VERIFY-PLAN-Report aktualisieren oder verify-plan erneut fahren,
  wenn im Lauf explizit Code geaendert wurde.
---

# Steuerlauf — Docker-Log-Triage vs. Observability-Rauschen

## Auftrag an auto-debugger

1. **Incident zuerst:** Lege unter `.claude/reports/current/incidents/INC-2026-04-09-dockerlog-obs-triage/` eine schlanke Incident-Dokumentation an: Ausgangslage (AutoOps 9/9; keine strengen ERROR-Treffer Server/Frontend/Postgres in der Stichprobe); dann die **drei** Befundklassen **A/B/C** mit den konkreten Beispielen aus dem Bericht (MQTT 6016 + Topics; Grafana plugins-Verzeichnis; Alloy No such container / dead container; optional cAdvisor-DMI-Hinweis als erwartbar).

2. **IST-Dokument:** Erstelle `docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md` als **Single Source of Truth** fuer diese Auswertung: Tabellenform oder strukturierte Abschnitte fuer Signal vs. Rauschen, **Prioritaeten**, und **naechste Schritte** (Firmware/Broadcast-Emergency vs. Compose/Alloy-Neustart vs. Grafana-Provisioning-Ordner).

3. **Querverbindung:** Pruefe `docs/analysen/IST-observability-correlation-contracts-2026-04-09.md` und ergaenze **additiv** nur, falls sinnvoll, Verweise auf Correlation/Trennung von Geraete-MQTT-Fehlern vs. Collector/Deploy-Rauschen — keine Wiederholung des gesamten Berichts.

4. **Code/Compose:** Nur wenn aus dem IST eindeutig und klein: Vorschlag in TASK-PACKAGES oder separates Mini-Paket (Branch `auto-debugger/work`), z. B. fehlendes Grafana-Plugin-Provisioning als leerer Ordner + Mount-Doku — **nicht** ohne Abgleich mit bestehender `docker-compose`/Observability-Struktur im Repo.

5. **Abnahme:** Siehe `done_criteria` im Frontmatter; Robin kann am Ende kurz bestaetigen, dass A/B/C in der Doku wiederfindbar sind.

---

## Agent-Prompt (Copy-Paste)
