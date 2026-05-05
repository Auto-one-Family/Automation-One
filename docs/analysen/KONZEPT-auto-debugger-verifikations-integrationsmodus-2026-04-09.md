# Konzept: auto-debugger — Modus „Verifikation & Integration“ (`integration_verify`)

**Datum:** 2026-04-09  
**Status:** Konzept / Spezifikationsvorschlag (kein automatischer Code-Umfang)  
**Bezug:** Auftrag `.claude/auftraege/auto-debugger/inbox/auftrag-konzept-verifikations-integrationsmodus-auto-debugger-2026-04-09.md`  
**Outbox (Pflichtpfad für Schlussberichte):** `.claude/auftraege/auto-debugger/outbox/` — Namenskonvention `BERICHT-<run_id>-<YYYY-MM-DD>.md`

---

## 1. Zweck und Abgrenzung

### 1.1 Problemstellung

Für **aufwändige, gemischte Branch-Änderungen** und **endnutzerrelevante Features** reicht der klassische Incident-/Artefakt-Fokus des auto-debugger allein nicht aus: Es braucht einen strikt regelbasierten Ablauf, der **Diff-Wahrheit**, **Pattern-First**, **kleine Pakete** und ein **verify-plan-Gate vor jeder Implementierungsdelegation** verbindet. Ziel ist es, typische KI-Fehler (Rewrite-Drift, parallele Patterns, große unkontrollierte Diffs, halluzinierte APIs) zu unterbinden.

### 1.2 Abgrenzung zum bestehenden auto-debugger

| Aspekt | Bestehend (`incident`, `artefact_improvement`, `both`) | Modus `integration_verify` |
|--------|--------------------------------------------------------|----------------------------|
| Primärinput | Logs, Incidents, Ziel-Markdown | **Ein** Feature/Problem + Branch-/Diff-Referenz |
| Erste Pflicht | Lagebild / additive Doc-Evidence | **Hypothese** + optional **Revalidierung** früherer Berichte |
| Outcome-Artefakte | `incidents/…` oder `auto-debugger-runs/…` | **Zusätzlich** verpflichtender **Outbox-Schlussbericht** |
| ESP/Hardware | nach Incident-Bedarf | nur bei **benannter** Nutzeraktion / **benanntem** Systempfad |

### 1.3 Arbeitsname

**Kanonischer `run_mode`-Wert:** `integration_verify`  
**Synonyme (nur dokumentarisch):** `branch_reconcile`, `feature_verify` — in Steuerdateien soll **nur** `integration_verify` verwendet werden, um Parser und Skills nicht zu fragmentieren.

---

## 2. Verbindliche Prinzipien (Annahmen aus dem Auftrag)

1. **Pattern-First:** Idee aus dem Branch extrahieren, **IST-Pattern** im Repo finden, dann anbinden oder sauber umstellen — kein Import fremder Struktur.
2. **Ein Problem pro Lauf:** Mehrere unabhängige Ziele sind **verboten**; Abbruch oder Aufteilung in neue Steuerläufe.
3. **Evidence statt Raten:** Git nur gemäß eingebetteter Policy; Code gezielt lesen; Docker-/Laufzeit-Logs **nur für eine** klar benannte Frage.
4. **Priorität früherer Verifikation:** Existiert ein früherer Run mit `VERIFY-PLAN-REPORT.md` / Outbox-Bericht → **zuerst** dessen Aktualität und Vollständigkeit gegen **`base_branch`** prüfen, **danach** nur noch Rest-Diffs.
5. **Governance:** Pakete klein, sequentiell, mit messbarer Verifikation pro Paket; Skills (`.claude/skills/`) und Cursor-Rules (`.cursor/rules/`) werden **eingebunden**, nicht umgangen.

---

## 3. Phasen A–G (normativ)

### Phase A — Scope & Hypothese (genau ein Problem)

| | Inhalt |
|---|--------|
| **Eingabe** | `feature_branch` (oder explizite Diff-Referenz), `base_branch`, optional `prior_reports` / `prior_run_id`, Freitext-Kontext in der Steuerdatei |
| **Ausgabe** | **Eine** Hypothese im Steuerformat: „Diese Änderung soll **X** für den Endnutzer verbessern, indem …“ (messbar, eine Hauptwirkung) |
| **Artefakt** | Abschnitt in der Steuerdatei unter `## Hypothese` **oder** YAML-Feld `integration.hypothesis` (siehe Abschnitt 5) |
| **Abbruch** | Mehr als ein unabhängiges Ziel erkennbar → **STOP** mit Hinweis: Steuerdatei splitten oder Ziel streichen |

### Phase B — Evidence: IST ohne Raten

| | Inhalt |
|---|--------|
| **Git** | Nur erlaubte Operationen (Status, `diff`, `log`, Branch-Anzeige — **kein** `push`/`force`, siehe Agent-Profil) |
| **Code** | Gezieltes Lesen der vom Diff betroffenen Pfade; **Pflicht:** Suche nach **closest implementation** (Composable, Service, Handler, Store, Router — je nach Schicht) |
| **Laufzeit** | Optional: Docker-/Container-Logs **nur** wenn eine **einzige** Frage formuliert ist (z. B. „Wird Topic T nach Publish im Server-Log bestätigt?“) |
| **Artefakt** | Kurze **IST-Notiz** (3–15 Zeilen) im Run-Ordner: `IST-NOTIZ.md` **oder** Abschnitt in `TASK-PACKAGES.md` „IST (verifiziert)“ |
| **Abbruch** | Scope zu groß für einen Lauf → Paketierung in Phase D vorschlagen **oder** BLOCKER „Scope verkleinern“ |

### Phase C — Branch-Ideen klassifizieren

Pro erkanntem Change (logische Hunk- oder Modul-Gruppe):

| Klasse | Bedeutung |
|--------|-----------|
| **Übernehmbar** | Passt zu kanonischem Pattern und Verträgen (REST/MQTT/WS/DB/Safety) |
| **Idee gut / Struktur schlecht** | Semantik behalten, **Re-Implement** im Haus-Pattern |
| **Verworfen** | Verletzt Contracts/Safety oder dupliziert ohne Mehrwert |
| **BLOCKER** | Produkt-/Architektur-Entscheidung nötig |

**Artefakt:** Tabelle in `TASK-PACKAGES.md` oder dediziert `KLASSIFIKATION.md` im Run-Ordner (empfohlen: in `TASK-PACKAGES.md` integrieren, eine Quelle).

### Phase D — Plan (sortierte Pakete)

| | Inhalt |
|---|--------|
| **Ausgabe** | Vollständige, **sortierte** Paketliste: **niedrigstes Risiko / höchster Hebel zuerst** (nicht chronologisch nach Branch-Commit-Reihenfolge) |
| **Pro Paket** | Kurzbeschreibung, betroffene Pfade, Risiko (L/M/H), **Testidee** (konkreter Befehl oder Szenario), **Rollback-Idee** (ein Satz), empfohlene Dev-Rolle |
| **Schnitt** | Pro Paket: **ein** Spezialisten-Agent kann sinnvoll liefern; Schnittstellen zwischen Paketen explizit |

**Artefakt:** `.claude/reports/current/auto-debugger-runs/<run_id>/TASK-PACKAGES.md` (gleiches Format wie bestehend; bei Bedarf `run_id` aus Steuerdatei)

### Phase E — verify-plan Gate (Pflicht vor jeder Implementierungsdelegation)

Siehe **Abschnitt 6** (Spezifikation). Kurz: **Kein** Start von Dev-Implementierung ohne abgeschlossenes Gate und ohne **Mutation** der Paketbeschreibung / Auftragstext gemäß Verify-Ergebnis.

### Phase F — Implementierung & Verifikation (nur nach Gate)

| | Inhalt |
|---|--------|
| **Ablauf** | Paket für Paket: umsetzen → Verify-Befehl → Evidence-Zeile dokumentieren |
| **ESP** | Nur wenn im Paket ein **messbarer** Nachweis für Sensorpfad/Aktor-Finalität o. Ä. definiert ist; Schrittfolge im Paket stehen |
| **Branch** | Unverändert: Commits nur auf **`auto-debugger/work`** (bestehende Policy) |

### Phase G — Outbox-Schlussbericht (Pflicht)

**Pfad:** `.claude/auftraege/auto-debugger/outbox/BERICHT-<run_id>-<YYYY-MM-DD>.md`

**Pflichtfelder:**

1. Betrachtete **Branch-Changes** (Module/Dateigruppen, kompakt)  
2. **Klassifikation** aus Phase C (pro Gruppe)  
3. **Kanonisches Pattern** (was gilt als Referenz) und **Begründung**  
4. Gewählter **Ansatz** (Übernahme / Re-Implement / verworfen / ausstehend)  
5. **Paketliste** (was umgesetzt, was nur geplant) und **Verifikation** (Befehle, Ergebnis)  
6. **Offene Punkte** / BLOCKER für den Menschen  

---

## 4. Artefakt-Ordner und Beziehung zu bestehenden Pfaden

- **Run-Artefakte** (Pakete, Verify, Fehler-Register): weiterhin  
  `.claude/reports/current/auto-debugger-runs/<run_id>/`  
  mit mindestens: `TASK-PACKAGES.md`, `VERIFY-PLAN-REPORT.md`, bei Code `FEHLER-REGISTER.md`, `SPECIALIST-PROMPTS.md` — analog zum bestehenden Skill.
- **Outbox:** **nur** der **Schlussbericht** Phase G (management-taugliche Zusammenfassung), nicht der Ersatz für technische Verify-Reports.

---

## 5. Delta zur STEUER-VORLAGE (YAML + Beispiele)

### 5.1 Erweiterung `run_mode`

**Vorschlag:** Wertemenge erweitern um:

```yaml
# run_mode: incident | artefact_improvement | both | integration_verify
run_mode: integration_verify
```

### 5.2 Neuer Block `integration` (empfohlen)

Alle integrations-spezifischen Felder **gebündelt**, damit die Vorlage lesbar bleibt:

```yaml
integration:
  # Pflicht: ein klarer Fokus
  hypothesis: |
    Endnutzer kann nach der Änderung X tun, weil …
  feature_branch: feature/alert-drawer-polish   # Branch, dessen Diff gegen base_branch betrachtet wird
  base_branch: master                             # Abgleich für "ist alter Bericht noch gültig?"
  prior_run_id: ""                                # optional: z. B. obs-2026-04-09 — Reports unter auto-debugger-runs/<id>/
  prior_report_paths: []                          # optional: repo-relative Pfade zu früheren VERIFY-PLAN-REPORT / Outbox-BERICHT
  runtime_question: ""                            # optional: genau EINE Frage für Docker/Logs; leer = keine Laufzeit in diesem Lauf
  esp_hypothesis: ""                              # optional: nur wenn ESP; benennt Nutzeraktion ODER Systempfad
run_id: integration-verify-drawer-2026-04-09      # Slug für auto-debugger-runs/<run_id>/
target_docs: []                                   # darf leer sein, wenn scope die Doc-Pflicht begründet
```

### 5.3 Beispiel `scope` / `forbidden` / `done_criteria` für diesen Modus

**`scope` (Beispiel):**

```yaml
scope: |
  Genau ein Problem: Finalität der Alert-Aktion im Drawer nach API-Fehler.
  Diff-Analyse feature_branch vs base_branch; keine neuen REST-Endpunkte.
  IST-Notiz und Klassifikation aller betroffenen Frontend-Stellen.
```

**`forbidden` (Beispiel):**

```yaml
forbidden: |
  Keine Breaking Changes an MQTT/REST/WS; kein zweites Notification-System;
  kein Commit auf master; kein force-push; kein SensorConfigPanel ausserhalb HardwareView;
  kein generischer ESP-Smoke ohne esp_hypothesis.
```

**`done_criteria` (Beispiel):**

```yaml
done_criteria: |
  TASK-PACKAGES vollständig; jedes Code-PKG mit verify-plan Gate und angepasstem Auftragstext;
  VERIFY-PLAN-REPORT.md pro Verify-Runde im Run-Ordner;
  Outbox BERICHT-<run_id>-<YYYY-MM-DD>.md mit allen Pflichtfeldern;
  Alle BLOCKER explizit oder geschlossen.
```

### 5.4 Kompatibilität mit `incident` / `both`

**Empfehlung:** `integration_verify` **nicht** mit `incident` in einem Lauf mischen. Falls ein Incident **und** ein Integrations-Review nötig sind: **zwei Steuerdateien** oder `both` nur mit klar getrennten `incident_id` und `run_id` und Reihenfolge `order` — explizit im Folge-Auftrag zur Skill-Scharfstellung definieren.

---

## 6. verify-plan — Spezifikation für diesen Modus

### 6.1 Wer führt verify-plan aus?

- **Kein neuer Agent erforderlich.** Der **Orchestrator auto-debugger** (oder der ausführende Haupt-Assistent unter Einhaltung des Agent-Profils) **wendet den Skill** `.claude/skills/verify-plan/SKILL.md` an — identisch zum bestehenden Gate.
- **Qualität:** verify-plan bleibt **Read-only gegenüber Produktcode** (bis auf erlaubte Korrektur **in der Plan-/Paketdatei**, wenn der Plan als Datei vorliegt — siehe Skill Modus A).

### 6.2 Was ist der „Auftragstext“, den verify-plan lesen muss?

**Minimum pro Paket:**

- Die **PKG-Sektion** in `TASK-PACKAGES.md` (Akzeptanzkriterien, Pfade, Testbefehl), **plus**  
- Die **IST-Notiz** (Phase B) und **Klassifikationszeile** (Phase C) für dieses PKG.

**Pflicht:** verify-plan dokumentiert Korrekturen **in derselben Quelle**, die der Implementierer nutzt:

- **Primär:** Inline in `TASK-PACKAGES.md` am PKG (präzisere AK, Pfade, „nicht tun“, Risiko).  
- **Sekundär:** Zusammenfassung in `VERIFY-PLAN-REPORT.md` im Run-Ordner.  
- **Chat:** verbindlicher Block **„OUTPUT FÜR ORCHESTRATOR (auto-debugger)“** gemäß verify-plan-Skill.

### 6.3 Ablauf pro Paket (verbindlich)

1. Paket N aus `TASK-PACKAGES.md` finalisieren (nach Pattern-Scan).  
2. **verify-plan** auf PKG N anwenden.  
3. **TASK-PACKAGES.md** mutieren (Delta aus Orchestrator-Block).  
4. **SPECIALIST-PROMPTS.md** für die empfohlene Rolle anpassen.  
5. Erst danach Dev-Agent starten.  
6. Nach Implementierung: Verify-Befehl + Fehler-Register-Regel wie heute.

### 6.4 Beispiel: fiktives Mini-Paket **PKG-99** (nur Illustration)

**Auszug `TASK-PACKAGES.md` (vor Verify):**

```markdown
### PKG-99 — Toast nach fehlgeschlagenem Alert-Dismiss (Frontend)

- Ziel: Bei 409 auf `PATCH /api/v1/notifications/{id}/read` soll der Toast **Fehler** zeigen, Drawer bleibt konsistent.
- Pfade: `El Frontend/src/components/alerts/AlertDrawer.vue` (fiktiv)
- Pattern: gleiches Fehler-Handling wie in `El Frontend/src/api/notifications.ts` (fiktiv)
- Verify: `cd "El Frontend" && npx vue-tsc --noEmit`
```

**verify-plan** prüft: Existieren die Pfade? Stimmt die Route mit `.claude/reference/api/REST_ENDPOINTS.md`? Gibt es bereits ein Composable für API-Fehler?

**Nach Verify mutiert (Beispiel-Delta):**

```markdown
### PKG-99 — Toast nach fehlgeschlagenem Alert-Dismiss (Frontend)

- Ziel: unverändert
- Pfade: **korrigiert** → `El Frontend/src/components/notifications/NotificationDrawer.vue` (IST aus Grep)
- API: **korrigiert** → `PATCH /api/v1/inbox/notifications/{id}` laut REST_ENDPOINTS.md; keine erfundene Route
- Pattern: **closest** → `useToast` + bestehende `handleApiError` in `El Frontend/src/composables/useApiError.ts` (fiktiv)
- Nicht tun: kein paralleles `error_event`-Only-Handling ohne Inbox-State-Update
- Verify: `cd "El Frontend" && npx vue-tsc --noEmit && npx vitest run src/composables/useApiError.spec.ts` (fiktiv)
```

**OUTPUT FÜR ORCHESTRATOR (Auszug):**

```markdown
## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

### PKG → Delta
| PKG | Delta |
|-----|--------|
| PKG-99 | Pfade und REST-Route an Repo angepasst; zusätzlicher Vitest-Pfad; „nicht tun“ ergänzt |

### PKG → empfohlene Dev-Rolle
| PKG | Rolle |
|-----|--------|
| PKG-99 | frontend-dev |

### Cross-PKG-Abhängigkeiten
- keine

### BLOCKER
- keine
```

---

## 7. Orchestrierung: Agent-Zuordnung (laut `.claude/CLAUDE.md`)

Zuordnung **Pakettyp → Dev-Agent** (Implementierung nach Gate):

| Paketinhalt schwerpunktmäßig | Agent | Skill vor Implementierung (Orientierung) |
|------------------------------|-------|------------------------------------------|
| FastAPI, DB, Domain-Services | `server-dev` | `server-development` |
| Vue, Pinia, Dashboard-UI | `frontend-dev` | `frontend-development` |
| Firmware, GPIO, NVS | `esp32-dev` | `esp32-development` |
| Topic/Publisher/Subscriber-Konsistenz ESP↔Server | `mqtt-dev` | `mqtt-development` |

**Analyse / Evidence (ohne Produkt-Write):**

| Bedarf | Agent / Skill |
|--------|----------------|
| Server-Logs, 5xxx | `server-debug` / Skill `server-debug` |
| MQTT-Traffic | `mqtt-debug` / `mqtt-debug` |
| Frontend-Build/WS | `frontend-debug` / `frontend-debug` |
| ESP-Serial | `esp32-debug` / `esp32-debug` |
| DB-Zustand | `db-inspector` / `db-inspector` |
| Cross-Report-Widersprüche | `meta-analyst` |

**Kontextweitergabe (minimal):**

1. Liste der **repo-relativen Pfade**  
2. **IST-Notiz** (Phase B)  
3. **verify-plan-geprüfter** PKG-Block + Verweis auf `VERIFY-PLAN-REPORT.md`  
4. **Git-Pflicht** (`auto-debugger/work`) aus Agent §0a

---

## 8. Einbindung von Skills und Repo-Regeln

- Vor jedem Entwurf: passende **development**-Skills laden (nicht nur Debug-Skills).  
- **Cursor Rules** (`.cursor/rules/frontend.mdc`, `backend.mdc`, `firmware.mdc`) gelten **unverändert**; der Modus fügt **keine** parallelen „leichteren“ Regeln hinzu.  
- **Referenzpfade** (`.claude/reference/api/`, `errors/`, `patterns/`) sind bei Schnittstellen-Änderungen **Pflichtlektüre** — kann im PKG als „Referenz lesen“ explizit gemacht werden.

---

## 9. Minimaler Migrationsplan (aktivierbar, ohne vollständige Code-Implementierung)

Die folgenden Schritte sind **Folge-Aufträge** mit eigenen Akzeptanzkriterien; hier nur die Reihenfolge:

| # | Artefakt | Änderung |
|---|-----------|----------|
| 1 | `.claude/skills/auto-debugger/SKILL.md` | Abschnitt „Modus `integration_verify`“: Phasen A–G, Outbox-Pflicht, Pflichtfelder; `run_mode`-Wert dokumentieren |
| 2 | `.claude/auftraege/auto-debugger/STEUER-VORLAGE.md` | YAML-Beispielblock `integration_verify` + Tabelle neuer Felder |
| 3 | `.claude/agents/auto-debugger.md` | Beschreibung/Beispiel für `integration_verify`; Verweis auf dieses Konzeptdokument |
| 4 | `.claude/CLAUDE.md` | Eine Zeile in der Agent-/Skill-Tabelle oder Compact Instructions: neuer `run_mode` optional |
| 5 | `.claude/auftraege/auto-debugger/outbox/README.md` | Bereits angelegt; bei Bedarf Pflichtfelder aus Abschnitt 3 verlinken |

**Kein Muss in diesem Konzept:** Produktcode, CI, neue Slash-Commands.

---

## 10. Folge-Aufträge mit eigenem Akzeptanzkriterium (explizit kein stillschweigender Code)

- **FA-1:** Skill + Agent + Vorlage wie in Abschnitt 9 — `vue-tsc`/pytest nicht nötig, konsistente Querverweise.  
- **FA-2 (optional):** Validierungsskript oder CI-Check, das fehlende Pflichtfelder in Outbox-Berichten erkennt — nur wenn gewünscht.

---

## 11. Checkliste: Modus in einer STEUER-Datei aktivieren (Robin)

1. `git checkout auto-debugger/work`  
2. `STEUER-VORLAGE.md` nach `inbox/STEUER-<kurz>-<YYYY-MM-DD>.md` kopieren  
3. Im Frontmatter setzen: `run_mode: integration_verify`  
4. `run_id` vergeben (Slug für `.claude/reports/current/auto-debugger-runs/<run_id>/`)  
5. Block `integration:` ausfüllen: `hypothesis`, `feature_branch`, `base_branch`, optional `prior_*` und `runtime_question` / `esp_hypothesis`  
6. `scope`, `forbidden`, `done_criteria` an den **einen** Fokus anpassen  
7. Optional: `no_chat_questions: true`, `allow_user_escalation: false` (Norm wie heute)  
8. Im Chat: `@.claude/auftraege/auto-debugger/inbox/STEUER-….md` — **auto-debugger** starten  
9. Nach Abschluss prüfen: `VERIFY-PLAN-REPORT.md` im Run-Ordner; Outbox `BERICHT-<run_id>-<YYYY-MM-DD>.md` vollständig  

---

*Ende des Konzeptdokuments.*
