# SPECIALIST-PROMPTS — INC-2026-04-09-dockerlog-obs-triage

**Hinweis:** Dieser Lauf ist **Doku-Orchestrierung** ohne Produkt-Implementierung. Es gibt **keinen** aktiven Dev-Handoff.

---

## Wenn PKG-01 oder PKG-02 aus `TASK-PACKAGES.md` aktiviert werden

### Git (Pflicht)

- Arbeitsbranch: **`auto-debugger/work`**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)

- Compose: bestehende `docker-compose.yml`-Struktur und `docker/grafana/provisioning/`-Layout erweitern — keine zweite parallele Grafana-Konfiguration ohne Abgleich.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

- Nicht zutreffend für reine Compose/Ordner-Anlage — bei Berührung von Server-Logging: `error_handler` vs. NotificationRouter nicht vermischen (siehe IST-Observability-Dokument).

### Verify-Befehl (Pflicht)

- Nach Umsetzung von PKG-01: `docker compose --profile monitoring config` (Projektwurzel); optional kurzer Grafana-Health-Check wie in `docker-compose.yml` healthcheck dokumentiert.

### Fehler-Register (Pflicht bei Code)

- `FEHLER-REGISTER.md` im gleichen Incident- oder Run-Ordner führen, sobald Build/Compose-Fehler auftreten.
