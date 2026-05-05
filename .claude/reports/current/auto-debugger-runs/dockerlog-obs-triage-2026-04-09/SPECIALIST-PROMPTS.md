# SPECIALIST-PROMPTS — Run `dockerlog-obs-triage-2026-04-09`

**Hinweis:** Es gibt **nur PKG-01** (menschliche DevOps-Aktion, kein Produktcode). Die folgenden Pflichtblöcke sind angepasst: **Git** und **Pattern-Reuse** betreffen **keine** Dateiänderung in PKG-01.

---

## Operator / DevOps — PKG-01 (menschlich)

### Scope

- Projektroot: `Auto-one`.
- IST: `docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md` (Klassen A/B/C, §4.1 Grafana plugins).
- Compose-Referenz: `docker-compose.yml` Service `grafana` — Volume `./docker/grafana/provisioning` → `/etc/grafana/provisioning:ro` (kein Unterordner `plugins/` im Checkout — IST-konform **Doku-first**).

### IST / SOLL

- **SOLL:** Nach Deploy Ops prüfen: Compose gültig, Monitoring-Stack sichtbar, bei Alloy-Tailer-Problemen kontrollierter Neustart **Klasse B**, nicht als ESP/MQTT-RCA fehlinterpretieren.
- **Kein SOLL:** In PKG-01 keine Repo-Dateien ändern, keinen leeren `plugins/`-Ordner anlegen — das wäre ein **anderes** Paket mit `verify-plan`.

### Git (Pflicht)

- **PKG-01:** Kein `git commit` — reine Laufzeit-/Compose-Checks auf der Maschine.
- **Falls** später ein optionales Repo-Paket (leerer `docker/grafana/provisioning/plugins/` + `.gitkeep`) umgesetzt wird: Arbeitsbranch **`auto-debugger/work`**; vor Änderungen `git checkout auto-debugger/work` und `git branch --show-current` verifizieren; kein Commit auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)

- **PKG-01:** Kein Code — stattdessen **bestehende** Observability-Struktur im Repo nur **lesend** nutzen (`docker-compose.yml`, `docker/grafana/provisioning/`, `docker/alloy/config.alloy`).
- Keine parallele „zweite“ Provisioning-Welt ohne Abgleich mit dem Mount in Compose.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

- **PKG-01:** Keine Änderung an NotificationRouter / `error_event` / Inbox — nur **Klassentrennung** beim Lesen von Container-Logs (B vs. A laut IST).
- Persistierte Alerts vs. transiente WS-Fehler nicht vermischen (Querverweis `IST-observability-correlation-contracts`).

### Verify-Befehl (Pflicht)

Nach den Schritten aus **TASK-PACKAGES.md PKG-01** (mindestens):

```text
docker compose config
docker compose --profile monitoring ps
```

Optional bei Diagnose: `docker compose --profile monitoring logs --tail 80 grafana` / `alloy` — nur zur Einordnung, nicht als alleiniger App-RCA.

### Fehler-Register (Pflicht bei Code)

- **PKG-01:** Nicht anwendbar — kein Code-Paket. Bei **späterem** Code-Paket: `FEHLER-REGISTER.md` im Run-Ordner; Mikrozirkular wie in `.claude/agents/auto-debugger.md` §8.
