---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter — von Claude/Code auslesbar)
run_mode: artefact_improvement   # incident | artefact_improvement | both
incident_id: ""                 # bei incident/both: z. B. INC-2026-04-09-001
run_id: ""                      # optional: Slug fuer .claude/reports/current/auto-debugger-runs/<run_id>/
order: incident_first           # bei both: incident_first | artefact_first
target_docs:
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
scope: |
  Beschreibung, was bearbeitet wird (z. B. nur additive Abschnitte, Korrelation, Verweise auf Codepfade).
forbidden: |
  Harte Grenzen: keine Secrets; keine Breaking Changes an REST/MQTT/WS/DB ohne separates Gate;
  keine direkten Commits auf master im Rahmen dieses Laufs (nur Branch auto-debugger/work); …
done_criteria: |
  Messbar: z. B. alle P0-Luecken aus Steuerdatei geschlossen oder als BLOCKER dokumentiert.
linear_local_only: false          # true = kein Linear-Pflichtspiegel (nur mit Begruendung in scope)
linear_epic_issue_id: ""          # optional: Epic/Parent-Identifier (z. B. AUT-100)
linear_parent_issue_id: ""      # optional: direktes Parent-Issue
linear_run_issue_id: ""         # optional: bestehendes Run-Issue statt neuem Parent
linear_target_labels: ""       # optional: kommagetrennte Label-Namen fuer neue Issues
linear_dedup_search_query: ""   # optional: Suchstring vor Issue-Erstellung (Dedup)
---

# Steuerdatei — auto-debugger

> Datei nach `inbox/STEUER-<kurz-id>-<YYYY-MM-DD>.md` kopieren und Felder ausfuellen.  
> **Norm:** Jeder strukturierte Lauf beginnt mit dieser Datei; freies Chatten ohne sie nur zur Klaerung.  
> **Git:** Arbeitsbranch für auto-debugger ist **`auto-debugger/work`** — vor dem Lauf `git checkout auto-debugger/work`.

## Felder (Kurzuebersicht)

| Feld | Pflicht | Beschreibung |
|------|---------|--------------|
| `run_mode` | ja | `incident` \| `artefact_improvement` \| `both` |
| `incident_id` | bei incident/both | Ordner `.claude/reports/current/incidents/<id>/` |
| `run_id` | nein | Ausgabeordner fuer Pakete/Verify im Artefakt-Modus |
| `target_docs` | ja* | Repo-relative Pfade zu Markdown-Zielen; *bei incident leer nur mit Begruendung in `scope` |
| `scope` | ja | Inhaltliche Grenzen |
| `forbidden` | ja | Verbotenes |
| `done_criteria` | ja | Abnahme |
| `order` | bei both | `incident_first` (Default) oder `artefact_first` |
| `linear_local_only` | nein | `true`: lokale Artefakte ohne Linear-Pflicht (Begruendung in `scope`) |
| `linear_epic_issue_id` | nein | Epic oder grosses Parent-Issue (Identifier) |
| `linear_parent_issue_id` | nein | Direktes Parent-Issue fuer Sub-Issues |
| `linear_run_issue_id` | nein | Bereits angelegtes Run-Issue wiederverwenden |
| `linear_target_labels` | nein | Liste zusaetzlicher Linear-Label-Namen |
| `linear_dedup_search_query` | nein | String fuer Dedup-Suche vor Neuanlage |

**Linear / Evidence:** Siehe `.claude/reference/linear-auto-debugger.md`, Konfiguration `.claude/config/linear-auto-debugger.yaml`, Skript `scripts/linear/auto_debugger_sync.py`. Optional im Run-Ordner: `LINEAR-ISSUES.md` (PKG → Linear-ID) — **dieselben** IDs in verify-plan-OUTPUT referenzieren.

## Gate: db-inspector (Schema / Migration / DB-Invarianten)

**Wann zuerst `db-inspector`:** Verdacht auf fehlende Migration, `alembic_version` ≠ Repo-`heads`, fehlender UNIQUE (`sensor_data`), FK-/Soft-Delete-Inkonsistenzen, oder „Handler sagt OK, Zeile fehlt“ **bevor** tiefe Log-Triage.

**Wann danach:** Sobald MQTT-Topic, `request_id` oder Zeitfenster aus `server-debug` / `mqtt-debug` bekannt ist — `db-inspector` sticht mit **dieselben** Schlüsseln (`device_id`/`esp_uuid`, `gpio`, `sensor_type`, Timestamp) in `sensor_data` / `actuator_states`.

**Checkliste (in VERIFY-Plan oder Incident-Notiz abhaken):**

1. `alembic heads` (Repo) + `SELECT version_num FROM alembic_version LIMIT 5;` (DB).  
2. Stichprobe: Constraint `uq_sensor_data_esp_gpio_type_timestamp` vorhanden (`pg_constraint` oder `\d sensor_data`).  
3. Bei Subzonen: `subzone_configs.esp_id` als **`esp_devices.device_id`** gelesen, nicht mit UUID verwechseln.  
4. Soft-Delete: Queries explizit `deleted_at IS NULL` vs. archival view dokumentieren (`esp_devices`, `zones`).  
5. Schichten-Verweis: mind. ein Fix-Ort aus `.claude/reference/db-inspector/MQTT_DB_KORRELATION.md` oder Vertrag.  
6. SQL INV-06 aus `VERTRAG.md`: verwaiste `subzone_configs` (kein passendes `device_id`) — `LIMIT 50`.  
7. SQL INV-07 aus `VERTRAG.md`: Zonen mit `deleted_at` / Status — `LIMIT 50`.

**Referenz:** `.claude/reference/db-inspector/VERTRAG.md`, Report-TOC: `REPORT_TEMPLATE.md`.

### Beispiel-STEUER-Snippet (nur db-inspector-Gate + Eingaben)

Minimaler Ausschnitt für eine Steuerdatei unter `inbox/` — Rest der STEUER-Vorlage wie oben:

```yaml
# … Frontmatter scope ergänzen z. B.:
scope: |
  Nach Migration-Drift und sensor_data-Dedup suchen. device_id=ESP_DEMO123, Fenster UTC letzte 24h.
forbidden: |
  Kein alembic upgrade/downgrade; kein DELETE/UPDATE; keine .env-Inhalte.
done_criteria: |
  DB_INSPECTOR_REPORT.md mit Abschnitten 2 (Alembic), 2.1 (Model-Matrix-Verweis), 4 (Invarianten INV-01–07 Stichprobe), 5 (Schichten-Map mit sensor_handler + sensor_repo).
```

**Checkliste (copy-paste in Incident-Notiz):** wie Abschnitt „Gate: db-inspector“ oben — Punkte 1–5 abhaken; bei Punkt 3 explizit `subzone_configs.esp_id` als `device_id`-String behandeln.

## Inhaltliche Notizen (optional)

<!-- Freitext: Symptom, Links zu Logs (ohne Secrets), betroffene esp_id, … -->
