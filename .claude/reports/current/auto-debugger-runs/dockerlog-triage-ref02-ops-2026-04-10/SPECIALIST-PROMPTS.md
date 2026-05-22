# SPECIALIST-PROMPTS — REF-02 (Nachfolge bei Evidenz für PKG-01)

**Hinweis:** PKG-01 (`docker/grafana/provisioning/plugins/.gitkeep`) ist im Lauf REF-02 **nicht** umgesetzt. Den folgenden Block nur verwenden, wenn Ops eine **wiederkehrende** Grafana-Meldung zu fehlendem `plugins/`-Provisioning dokumentiert und `verify-plan` erneut grün ist.

---

## Rolle: DevOps / Repo-Pflege — PKG-01 (optional, nach Freigabe)

### Scope

- Anlegen von `docker/grafana/provisioning/plugins/.gitkeep` (leerer Ordner im Repo), **ohne** `docker-compose.yml` zu ändern.
- Verifikation: `docker compose --profile monitoring config` Exit 0.

### IST/SOLL

- **IST:** Kein Ordner `plugins/` unter `docker/grafana/provisioning/`.
- **SOLL:** Ordner existiert; Grafana kann optionalen Provisioning-Pfad stilllegen (Ops-Noise reduzieren) — nur bei nachgewiesener Notwendigkeit.

### Git (Pflicht)

- Arbeitsbranch: **`auto-debugger/work`**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)

- Vor Änderungen: bestehende Struktur unter `docker/grafana/provisioning/` (`alerting/`, `dashboards/`, `datasources/`) als Muster; nur fehlenden Unterordner ergänzen — keine zweite Provisioning-Wurzel.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

- Kein Produkt-Code; keine MQTT-/REST-Änderungen. Observability bleibt **Klasse B** — keine Vermischung mit Firmware-RCA (siehe `DOCKER_REFERENCE.md` §5.6, IST-Docker-Log-Triage §3–4).

### Verify-Befehl (Pflicht)

- `cd` zum Projektroot, dann: `docker compose --profile monitoring config` — Exit-Code 0.

### Fehler-Register (Pflicht bei Code)

- Pro Fehler: Evidenz → Hypothese → Minimalfix → gleicher Verify-Befehl erneut. Bei nur `.gitkeep`: Einträge nur falls Compose rot wird (unwahrscheinlich).

---

*Ende REF-02 Prompts.*
