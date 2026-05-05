# TASK-PACKAGES — INC-2026-04-09-dockerlog-obs-triage

**Status:** Kein aktives **Implementierungs**-Paket in diesem Orchestrator-Lauf (Doku-first). Alle Produktänderungen bleiben auf Branch **`auto-debugger/work`** mit separatem `/verify-plan`-Gate — hier nicht ausgelöst.

---

## PKG-00 — Beobachtung / keine Maßnahme (abgeschlossen)

**Inhalt:** Incident-Artefakte + IST-Dokument als SSoT; keine Compose-/Code-Änderung.

**Akzeptanz:**

- Ordner `incidents/INC-2026-04-09-dockerlog-obs-triage/` vollständig.
- `docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md` existiert.
- A/B/C in Doku wiederfindbar.

**Verify (manuell):** Leseprüfung der genannten Dateien; kein pytest/vue-tsc-Zwang für dieses PKG.

---

## PKG-01 — Optional / Follow-up (nicht gestartet)

**Thema:** Falls Grafana wiederholt über ein fehlendes **Plugins**-Provisioning-Verzeichnis klagt: leeren Ordner `docker/grafana/provisioning/plugins/` (z. B. mit `.gitkeep`) **oder** Grafana-Config anpassen, sodass kein leerer Pfad erwartet wird.

**Abhängigkeit:** Konkrete Grafana-Logzeile aus Robins Umgebung; Abgleich mit `docker-compose.yml` Volume `./docker/grafana/provisioning:/etc/grafana/provisioning:ro`.

**Vor Implementierung:** Skill **`verify-plan`** (Pfade, Grafana-Version, kein Breaking Change).

**Akzeptanz (wenn umgesetzt):** `docker compose --profile monitoring config` Exit 0; Grafana-Container-Log ohne wiederholte Fehler zur Provisioning-Struktur (oder dokumentierte Akzeptanz der Warnung).

---

## PKG-02 — Optional / Follow-up (nicht gestartet)

**Thema:** Alloy „No such container“ nach Stack-Updates — Betriebs-Runbook (Reihenfolge `down`/`up`, ggf. Alloy-Neustart), kein Firmware-Fix.

**Verify:** Reproduktion dokumentieren; `docker compose ps` + kurzer Alloy-Log-Tail nach sauberem Deploy.
