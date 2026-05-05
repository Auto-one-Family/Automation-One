---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: INC-2026-04-09-dockerlog-obs-triage
run_id: dockerlog-obs-triage-2026-04-09
order: incident_first
target_docs:
  - docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
scope: |
  Voraussetzung: STEUER-01–03 erledigt — Incident, IST-Hauptdokument, Correlation-Abgleich liegen vor.

  Ziel: Aus dem IST eindeutig und **klein** abgeleitete Follow-ups nur dann in **TASK-PACKAGES** (und bei Bedarf
  SPECIALIST-PROMPTS) gießen, wenn eine **konkrete**, nicht-breaking Aenderung an Compose/Observability-Doku oder
  Repo-Struktur sinnvoll ist — z. B. fehlendes Grafana-Plugin-Provisioning als **leerer Ordner** + **Mount** in
  docker-compose **nur** nach Abgleich mit der bestehenden Observability-/Compose-Struktur im Checkout.

  Wenn der IST klar **Doku-only** empfiehlt (kein Mount/kein Ordner): TASK-PACKAGES mit **einem** Paket
  „Kein Code — empfohlene menschliche DevOps-Aktion“ inkl. Verify-Hinweis (docker compose config, Neustart Alloy/Grafana),
  statt erfundener Code-Aenderungen.

  Bei **aktiven Code-Paketen** (falls doch Repo-Aenderungen): Git-Pflichtblock in SPECIALIST-PROMPTS; pro Code-Paket
  Akzeptanzkriterium „Aenderungen auf Branch auto-debugger/work“. Run-Artefakte unter
  .claude/reports/current/auto-debugger-runs/dockerlog-obs-triage-2026-04-09/ bei PKG-Aktivitaet nutzen.

  VERIFY-PLAN-REPORT: nur aktualisieren oder verify-plan erneut fahren, wenn im Gesamtlauf **explizit** Code geaendert wurde;
  sonst kurz begruenden warum nicht.

  FEHLER-REGISTER.md im Run-Ordner: fuehren falls Skill/Vorgabe bei aktiven Code-PKGs greift.

  Modus „both“-Restabwicklung: keine erneute Incident-Dokumentation duplizieren — nur Pakete/Verify/Follow-up.
forbidden: |
  Keine Secrets; keine Breaking Changes an REST/MQTT/WebSocket/DB ohne separates Gate.
  Code-/Compose-Aenderungen **nur** auf Branch auto-debugger/work (Default/upstream master im Checkout verifizieren);
  kein git push, kein force-push, kein force-merge durch Agenten.
  Keine Compose-Aenderung ohne Abgleich mit vorhandener docker-compose und Observability-Struktur — kein Raten.
  Bash/PowerShell nur eingeschraenkt; Befehle mit Semikolon verketten, nicht && .
  Keine Pfade ausserhalb der Auto-one-Wurzel; keine Strategie-Repositorys.
  Keine gruenen Behauptungen zu Playwright/vue-tsc ohne nachweisbare lokale Voraussetzungen.
done_criteria: |
  Entweder (1) TASK-PACKAGES.md (und bei Bedarf SPECIALIST-PROMPTS.md) unter
  .claude/reports/current/auto-debugger-runs/dockerlog-obs-triage-2026-04-09/ mit klaren, kleinen Paketen —
  jedes Code-Paket mit Branch-AK auto-debugger/work — **oder** (2) explizites „kein PKG — nur menschliches Follow-up“
  mit Verify-Schritten, wenn IST Doku-only bleiben soll.

  Wenn Code geaendert: FEHLER-REGISTER.md im Run-Ordner falls zutreffend; VERIFY-PLAN-Report aktualisiert oder
  begruendeter Verzicht.

  Robin kann zur Abnahme bestaetigen: A/B/C aus STEUER-01/02 in der Doku wiederfindbar; keine Vermischung der Klassen
  in einer flachen ERROR-Suche — im IST bestaetigt.
---

# Steuerlauf 4/4 — TASK-PACKAGES / Verify / optionales Mini-Compose

**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Run-ID:** `dockerlog-obs-triage-2026-04-09`

## Ziel (ein Satz)

Aus dem abgeschlossenen IST **messbare** naechste Schritte — nur so viel Implementierung wie sicher klein und non-breaking ist.

## Eingrenzung

- Kein Parallel-Incident; Faktenbasis = STEUER-01 + IST aus STEUER-02 + STEUER-03.
- Compose/Code nur bei eindeutigem, kleinem Nutzen; sonst DevOps-Follow-up dokumentieren.

## Abnahme (messbar)

Siehe `done_criteria`; Branch-Disziplin fuer jedes Code-Paket.

## Runbook (imperativ)

1. Branch `auto-debugger/work` verifizieren.
2. IST-Dateien und Incident lesen — entscheiden: PKG vs. kein PKG.
3. Bei PKG: Run-Ordner `auto-debugger-runs/dockerlog-obs-triage-2026-04-09/` anlegen; TASK-PACKAGES.md schreiben;
   bei Code: SPECIALIST-PROMPTS mit Git-Pflichtblock; ggf. minimale Aenderungen nur nach Compose-Abgleich.
4. Bei Code-Aenderung: FEHLER-REGISTER.md, VERIFY-PLAN-Report-Policy aus `scope`/`done_criteria` anwenden.
5. STOP — Gesamtabnahme durch Robin.

---

## Agent-Prompt (Copy-Paste)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-04-taskpackages-obs-followup-dockerlog-2026-04-09.md
Bitte Follow-up-Pakete oder explizit kein PKG gemaess Steuerdatei; Branch auto-debugger/work fuer jede Code-Aenderung.
```
