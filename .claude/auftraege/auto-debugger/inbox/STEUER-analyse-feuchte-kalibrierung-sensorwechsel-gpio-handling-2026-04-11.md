---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: both
incident_id: ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11
run_id: feuchte-kalib-sensorwechsel-2026-04-11
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/BERICHT-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md
scope: |
  ANALYSEAUFTRAG — Live-System: **Bodenfeuchte-Kalibrierungsflow** funktional ins bestehende Produkt bringen;
  **Randprobleme** (Sensor-Loeschung, GPIO-Reuse, Config-Push zum ESP, UI „PIN belegt“) als **eigenstaendige Pakete**
  exakt erfassen. Kein reines Theorie-Papier: **Evidence** aus Docker-Logs, MQTT-Logger, Postgres,
  Server-Endpoints, Frontend-Flow (wo zutreffend), und **Vergleich zweier realer Geraete-Historien**.

  ## Kontext (normativ, Robin — fuer IST-Abgleich)

  **Referenz „gesund“ (Kalibrierung + Stabilitaet):**
  - **`ESP_6B27C8`**: Frischeres Setup; Bodenfeuchte auf konfiguriertem PIN; **in den letzten ~5 Minuten**
    laut Beobachtung **stabil ~20–25 %** bei **trockenem** Substrat (Live gegenpruefen: MQTT, DB, UI).
  - **Erwartung:** Roh-ADC und verarbeiteter %-Wert **ohne** pathologische Oszillation bei ruhendem Substrat.

  **Problemfall „Altlast + Wechsel“:**
  - **`ESP_EA5484`**: Aelteres Geraet, **aktuell noch im Betrieb**. Historisch **pH-Sensor** auf einem GPIO
    konfiguriert; Sensor **geloescht** und durch **Bodenfeuchte** ersetzt. Bodenfeuchte **kalibriert**;
    pH zuvor vermutlich **getestet**. **Symptom:** nach Konfiguration/Kalibrierung **extrem schwankende** Werte.
  - **Kontrast:** Derselbe oder vergleichbarer Sensor auf **frischem ESP**, **neuer unkonfigurierter PIN**,
    **ohne** Kalibrierung — Verhalten **deutlich stabiler** (Robin-Beobachtung; im Lauf verifizieren).

  ## Problemcluster (fuer Paketierung — nicht vermischen)

  **CLUSTER A — Handling / Lebenszyklus GPIO & Config (Randprobleme, aber P0 fuer korrektes Bedienen):**
  1. Beim **Loeschen** eines Sensors: DB-/API-Seite und **ESP-seitige** Konsistenz (NVS, laufende Sensor-Instanz,
     Config-Lane). **Hypothese:** Config-Zeilen verschwinden, aber **MQTT-Config/Command-Kette** zum ESP ist
     unvollstaendig oder nicht serialisiert → Geraet „weiss“ noch von altem Typ oder blockiert.
  2. **Neukonfiguration** desselben GPIO mit anderem `sensor_type`: UI meldet **PIN belegt** oder Flow bricht ab,
     obwohl Server/DB den Platz frei geben sollten — **Frontend-State**, **Validierung**, **Race** mit
     WebSocket/REST, oder **Stale** in Pinia/API.
  3. **Abgrenzung:** Was ist reines **UI-Problem**, was **Backend-Transaktion**, was **Firmware** (Config-ACK,
     Intent-Outcome, `config_response` Correlation)?

  **CLUSTER B — Kalibrierungsflow & Messstabilitaet (Kernfokus):**
  1. **Session-Lifecycle:** Start → Messpunkte → Finalize → Apply → `sensor_configs.calibration_data`
     (`derived`, `moisture_2point`, `invert`, …) und **Processor** (`resolve_calibration_for_processor`).
  2. **Schwankung 50–100 %** bzw. Oszillation bei **kalibriertem** Zustand vs. **stabile** Defaults auf
     frischem PIN: moegliche Ursachen **Invert**, **falsche dry/wet-Reihenfolge**, **Mutex** zwischen
     kontinuierlichem Sample und Wizard-Messung, **Doppel-Verarbeitung**, **stale points**, **JSON-null vs. SQL-NULL**,
     oder **ESP-Rohwert-Drift** durch parallelen Kanal (siehe Baseline-Bericht: zweiter `moisture`-GPIO).
  3. **Vergleichspflicht:** Gleiche Sensor-Hardware wo moeglich **nicht** mischen ohne `esp_id`-Trennung;
     **ESP_6B27C8** als **Soll-Kurve** (Zeitreihe letzte Minuten); **ESP_EA5484** als **Ist-Stoerfall**.

  ## Arbeitsschritte (Orchestrator / auto-debugger)

  1. **Incident-Artefakte** unter `.claude/reports/current/incidents/ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11/`
     befuellen: `INCIDENT-LAGEBILD.md`, `TASK-PACKAGES.md` (mindestens **zwei** Paketfamilien: **PKG-HW-***
     Handling, **PKG-CAL-*** Kalibrierung), `SPECIALIST-PROMPTS.md`, `FEHLER-REGISTER.md` (pro gefundener
     Diskrepanz ein Eintrag), optional `CORRELATION-MAP.md` wenn MQTT↔REST↔WS verknuepft werden muss.
  2. **Pattern-Scan** (Skill): naechste bestehende Implementierung fuer Sensor-Remove, GPIO-Freigabe, Calibration
     Apply — **kein** Greenfield in den Paketen ohne Verweis.
  3. **verify-plan**-Gate vor jeder **Implementierungs**-Delegation: real existierende Pfade/Tests ausgeben;
     Output-Block **„OUTPUT FUER ORCHESTRATOR“** in Chat + `VERIFY-PLAN-REPORT.md`.
  4. **Zieldokument** (siehe `target_docs`): **vollstaendiger Analysebericht** mit:
     - Executive Summary (2 Absaetze)
     - Tabellarische **IST-SOLL** je Cluster
     - **Paketuebersicht** (ID, Titel, Abhaengigkeiten, Akzeptanzkriterien, Verify-Befehle)
     - **Evidence-Register** (Timestamp, Quelle, Ausschnitt — ohne Secrets)
     - **Empfohlene Reihenfolge** (PKG-HW vor/nach PKG-CAL — begruenden)
     - Explizite **Nicht-Ziele** (kein Scope-Creep)

  ## Live-Pruefpunkte (Pflicht wo technisch moeglich)

  - **Postgres:** `sensor_configs`, `calibration_sessions`, `sensor_data` fuer **`ESP_6B27C8`** und
    **`ESP_EA5484`** (getrennte Abschnitte); GPIO- und `sensor_type`-Historie wo Migration/Soft-Delete.
  - **MQTT-Logger / Server-Log:** Topics `sensor/{gpio}/data`, `…/processed`, `config`, `config_response`,
    ggf. `intent_outcome` — **Korrelation** mit UI-Aktionen (Zeitfenster).
  - **Prometheus/cAdvisor:** nur **Stuetzargument** (Stack gesund); **kein** Ersatz fuer fachliche Sensor-Evidenz.
  - **Frontend:** reproduzierbarer Pfad „Sensor loeschen → neu anlegen“ und „Kalibrierung starten → abschliessen“
    (Screens/Stores — Evidence Screenshots optional, Pfadnamen verpflichtend).

forbidden: |
  Keine Secrets/Tokens/Keys in Berichten oder Artefakten.
  Keine Commits auf `master` aus diesem Steuerlauf; Produkt-Fixes nur nach verify-plan auf Branch
  `auto-debugger/work` (Git-Pflicht laut Agent).
  Keine Vermischung von Problemclustern A und B in **einem** Implementierungs-Paket ohne explizite Schnittstelle.
  Keine Pfade auf externe Life-Repos oder private `wissen/`-Spiegel — nur Auto-one-Checkout.
  Fiktive Log-Zitate: verboten — nur repo-/laufzeitverifizierte Evidence.

done_criteria: |
  - `docs/analysen/BERICHT-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md` existiert und ist
    vollstaendig (siehe scope: Zieldokument-Struktur).
  - Unter `.claude/reports/current/incidents/ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11/` liegen mindestens:
    `TASK-PACKAGES.md` mit **getrennten** Paketen **PKG-HW-*** und **PKG-CAL-*** (weitere PKG-IDs bei Bedarf),
    `FEHLER-REGISTER.md` mit mindestens einem Eintrag pro **bestaetigter** Root-Cause-Hypothese oder BLOCKER.
  - **ESP_6B27C8** und **ESP_EA5484** sind im Bericht **jeweils** mit Evidence zu Stabilitaet bzw. Schwankung
    belegt (oder BLOCKER mit Grund).
  - verify-plan-Durchlauf dokumentiert (`VERIFY-PLAN-REPORT.md`), bevor Implementierungs-PKGs freigegeben werden.
  - Fokus **Kalibrierungsflow** klar von **GPIO/Delete-Handling** getrennt dokumentiert; Querverweise explizit.
---

# Steuerlauf — Analyse: Feuchte-Kalibrierung vs. Sensorwechsel / GPIO-Handling

**Agent:** `auto-debugger`  
**Modus:** `both` (`incident_first`)  
**Incident-ID:** `ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11`  
**Run-ID:** `feuchte-kalib-sensorwechsel-2026-04-11`

## Ziel (ein Satz)

Am **laufenden Stack** die Ursachen fuer **instabile kalibrierte Feuchte** (v. a. **ESP_EA5484** nach pH→Feuchte-Wechsel) und fuer **defektes Handling beim Sensorwechsel auf demselben GPIO** so weit isolieren, dass **voneinander unabhaengige** Umsetzungs-Pakete (**PKG-CAL-*** vs. **PKG-HW-***) mit klaren Verify-Kriterien entstehen — dokumentiert im **Analysebericht** unter `target_docs`.

## Referenz-Geraete

| Rolle | `device_id` | Kurzbeschreibung |
|-------|-------------|------------------|
| **Soll / stabil** | `ESP_6B27C8` | Trocken-Substrat, **~20–25 %** in letzter Beobachtung; Live im Lauf bestaetigen. |
| **Ist / stoerhaft** | `ESP_EA5484` | Altlast pH→Feuchte, kalibriert, **starke Schwankung**; mit Logs/DB belegen. |

## Paket-Namenskonvention (Vorgabe fuer TASK-PACKAGES)

- **`PKG-HW-01` …** — Loeschen, GPIO-Freigabe, MQTT-Config zum ESP, UI „PIN belegt“, API-Transaktionen, NVS/ACK.
- **`PKG-CAL-01` …** — Session, Finalize, Apply, `calibration_data`, Processor, Invert, kontinuierlich vs. Wizard,
  Schwankungs-Root-Cause geglue **PKG-HW** (nur wenn Evidence).

## Aktivierung (Claude Code / Cursor)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md
```

## Abhaengigkeiten / Vorarbeit

- Optionaler Kontext: `docs/analysen/BERICHT-feuchte-baseline-neues-esp-gpio33-live-verifikation-2026-04-11.md`
  (Zweitkanal-GPIO, Config-Drift-Hinweise) — **nicht** wiederholen, nur **referenzieren** bei Ueberschneidung.

---

## Kopie-Ziel (Repo)

`Auto-one\.claude\auftraege\auto-debugger\inbox\STEUER-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md`
