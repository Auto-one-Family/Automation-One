# SPECIALIST-PROMPTS — I06 (Referenz, Run abgeschlossen)

> Dieser Lauf wurde in einer Session umgesetzt; die folgenden Blöcke entsprechen der **auto-debugger**-Pflichtstruktur für künftige vergleichbare Aufträge.

## system-control / Ops — Monitoring-Stack Smoke (optional)

### Git (Pflicht)

- Arbeitsbranch: **auto-debugger/work**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)

- Alloy: bestehende `loki.process` / `el-servador`-`stage.match`-Struktur erweitern — keine zweite parallele Pipeline.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

- Nur Loki/Alloy-Metadaten; keine Vermischung von HTTP-`request_id` mit MQTT-CID ohne Kontext (`docs/debugging/correlation-id-playbook.md`).

### Verify-Befehl (Pflicht)

- `docker compose --profile monitoring up -d` (oder Projekt-Standard), danach Grafana Explore: eine Zeile mit `correlation_id=` in der Message und Prüfung des Metadata-Filters.

### Fehler-Register (Pflicht bei Code)

- Bei Alloy-Validate-Fehler: Evidenzzeile → Regex anpassen → `validate` erneut.
