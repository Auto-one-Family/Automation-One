# TM-Workflow (Technical Manager Integration)

> **Version:** 2.0 (2026-04-15)
> **Aenderungen:** Linear-Integration, verify-plan Gate, Fast-Track, Issue-Template, Eskalationsmatrix, meta-analyst Decision-Tree, /do Skill, Anti-KI-Regeln

---

## Rolle des Technical Managers

Der TM ist der **Entscheidungs-Orchestrator** fuer AutomationOne. Er implementiert **keinen Produktcode**, sondern:

1. **Analysiert** den echten Stand im Repo (Code-First Evidence)
2. **Priorisiert** Probleme nach Operator-Impact und Risiko
3. **Zerlegt** Arbeit in logische Pakete (Linear-Issues)
4. **Formuliert** praezise, ueberpruefbare Auftraege fuer die 14 Agenten + 1 Orchestrator
5. **Validiert** via verify-plan bevor Implementierung beginnt
6. **Entscheidet** Workflow-Pfad (Fast-Track, F1/F2, auto-debugger)

**TM-Workspace:** `.technical-manager/` (Router: `TECHNICAL_MANAGER.md`, Reports, Inbox, Archive)
**Kommunikation:** Linear-Issues sind der Kanal; Copy/Paste fuer Reports wo noetig.

---

## Entscheidungsbaum: Welcher Workflow-Pfad?

```
Neuer Auftrag / Problem
    │
    ├─ Genau EINE Schicht betroffen?
    │   ├─ Ursache + Fix-Ort eindeutig im Code sichtbar?
    │   │   ├─ Kein Risiko fuer MQTT/DB/Safety?
    │   │   │   └─ JA zu allen → FAST-TRACK (Abschnitt 1)
    │   │   └─ NEIN → F1 Test-Flow (Abschnitt 2)
    │   └─ Ursache unklar → F1 Test-Flow (Abschnitt 2)
    │
    ├─ Mehrere Schichten betroffen?
    │   └─ F1 Test-Flow → F2 Dev-Flow (Abschnitte 2+3)
    │
    └─ Kritischer Multi-Layer-Incident (Safety/Datenintegritaet)?
        └─ auto-debugger-Pfad (Abschnitt 4)
```

---

## 1. Fast-Track (Einzel-Schicht, offensichtlich, klein)

**Voraussetzungen (ALLE muessen zutreffen):**
- Genau **eine** Schicht betroffen
- Ursache und Fix-Ort **eindeutig** im Code sichtbar
- Kein Risiko fuer MQTT-Kontrakte, DB-Migrationen, Safety-State

**Ablauf:**
1. TM erstellt Linear-Issue direkt an passenden Dev-Agenten
2. Issue enthaelt: Kontextblock mit Repo-Evidenz, Akzeptanzkriterien, Testhinweise
3. Kurzer verify-plan auf den betroffenen Diff-Umfang
4. Dev-Agent implementiert (ggf. via `/do` Skill fuer praezise Ausfuehrung)
5. Build-Verifikation gemaess Verifikationskriterien-Tabelle
6. Kontext-Analyse + /updatedocs (Pflicht — siehe Abschnitt 13) in CLAUDE.md

**Dokumentation im Issue:** "Fast-Track gemaess TM-Regel — Begruendung: [einzeilige Erklaerung]"

---

## 2. Test-Flow F1 (Analyse & Debugging)

```
1. User fuehrt `scripts/debug/start_session.sh` aus
   → logs/current/STATUS.md wird generiert

2. system-control (Briefing-Modus) liest STATUS.md + Referenzen
   → SESSION_BRIEFING.md (fuer TM)

3. TM analysiert Briefing, entscheidet Agent-Reihenfolge
   → Formuliert system-control (Ops-Modus) Befehle

4. system-control (Ops-Modus) generiert Logs, fuehrt Operationen aus
   → SYSTEM_CONTROL_REPORT.md (MUSS VOR Debug-Agents)

5. Debug-Agents EINZELN (parallel moeglich bei unabhaengigen Schichten):
   - esp32-debug  → ESP32_*_REPORT.md
   - server-debug → SERVER_*_REPORT.md
   - mqtt-debug   → MQTT_*_REPORT.md
   - frontend-debug → FRONTEND_*_REPORT.md

6. /collect-reports konsolidiert alle Reports
   → CONSOLIDATED_REPORT.md

7. TM analysiert, waehlt meta-analyst Modus (siehe Abschnitt 6)

8. meta-analyst liefert:
   - Code-First: META_DEV_HANDOFF.md (Dev-Pakete)
   - Report-Legacy: META_ANALYSIS.md (Korrelation)

9. TM entscheidet: weitere Analyse (→ Schritt 3) oder F2 Dev-Flow
```

### Agent-Aktivierungsreihenfolge

| Schritt | Agent/Skill | Funktion | Output |
|---------|-------------|----------|--------|
| 1 | `system-control` (Briefing) | Session-Briefing | SESSION_BRIEFING.md |
| 2 | `system-control` (Ops) | Logs generieren, Operationen | SYSTEM_CONTROL_REPORT.md |
| 3 | Debug-Agents (einzeln) | Schicht-spezifische Log-Analyse | *_REPORT.md |
| 4 | `/collect-reports` | Konsolidierung | CONSOLIDATED_REPORT.md |
| 5 | `meta-analyst` | Cross-System Analyse/Handoff | META_*.md |

---

## 3. Dev-Flow F2 (Implementierung)

```
1. TM hat durch F1 alle Probleme identifiziert und priorisiert
2. TM erstellt Linear-Issues im Pflichtformat (siehe Abschnitt 5)
3. verify-plan prueft Issues gegen Code (siehe Abschnitt 7)
4. TM korrigiert Issues basierend auf verify-plan Ergebnis
5. Dev-Agents implementieren (einzeln, in dokumentierter Reihenfolge):
   - mqtt-dev ZUERST bei MQTT-Kontrakt-Aenderungen
   - server-dev bei Handler/Service/API-Aenderungen
   - esp32-dev bei Firmware-Aenderungen
   - frontend-dev bei UI-Aenderungen (haengt von server-dev REST/WS ab)
6. /do Skill fuer praezise Plan-Ausfuehrung wo noetig
7. Build-Verifikation gemaess Verifikationskriterien-Tabelle
8. Kontext-Analyse + /updatedocs (Pflicht — siehe Abschnitt 13)
9. Zurueck zu F1 Test-Flow zur Verifikation
```

### Agent-Abhaengigkeiten (Reihenfolge bei Cross-Layer)

| Aenderungstyp | Reihenfolge | Begruendung |
|---------------|-------------|-------------|
| MQTT-Kontrakt | mqtt-dev → server-dev → esp32-dev → frontend-dev | Kontrakt definiert die Schnittstelle |
| REST-API | server-dev → frontend-dev | Frontend konsumiert API |
| DB-Migration | server-dev (Migration) → server-dev (Handler) → frontend-dev | Schema muss stehen |
| Sensor-Typ neu | esp32-dev → mqtt-dev → server-dev → frontend-dev | Firmware erzeugt Daten |
| Reines Frontend | frontend-dev allein | Keine Backend-Abhaengigkeit |
| Reines Backend | server-dev allein | Keine Frontend-Abhaengigkeit |

**Regel:** Bei Unsicherheit immer am **bestehenden Repo-Pattern** festlegen, nicht raten.

---

## 4. auto-debugger-Pfad (Kritische Incidents)

**Nur wenn der Overhead gerechtfertigt ist:**
- Multi-Layer-Incident mit Safety/Datenintegritaets-Risiko
- Pflichtsequenz: Lagebild → Korrelation → TASK-PACKAGES → verify-plan Gate → Mutation → SPECIALIST-PROMPTS → Dev-Agenten auf Branch `auto-debugger/work`

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-{id}.md`
**Details:** `.claude/skills/auto-debugger/SKILL.md` und `.claude/agents/auto-debugger.md`

**Fuer den Alltag gilt:** Zuerst minimale reproduzierbare Teilprobleme isolieren und Fast-Track oder F1/F2 pro Schicht nutzen. auto-debugger nur wenn echte Querkorrelation zwischen Schichten noetig ist.

---

## 5. Linear: Issue-Pflichtformat

Jedes Issue (oder Issue-Vorlage vom TM) muss enthalten:

### Pflichtfelder

1. **Titel:** `[typ]: [Schicht] Kurzaktion — Objekt`
   - Beispiel: `fix: [Frontend] OrbitalView — Card-Grid minmax zu klein`
   - Typ: fix/feat/refactor/test/docs (Conventional Commits)

2. **Agent-Zuweisung:** Im Beschreibungstext genau EIN Primaer-Agent aus `.claude/agents/*.md`
   - Sekundaer-Agenten nur als "Konsultation / Review" mit Grund

3. **Kontextblock:**
   ```
   ## Problem
   [Symptom + Auswirkung fuer Operator]

   ## Scope
   [Betroffene Views/Komponenten mit REPO-PFADEN]

   ## Technische Ursache
   [Belegt oder Hypothese — KENNZEICHNUNG Pflicht]
   [Repo-Evidenz: Pfad + Suchbegriff oder Zeilenkontext]

   ## Loesungsansatz
   [Konkret, umsetzbar, Pattern-Referenz auf bestehenden Code]
   ```

4. **Abhaengigkeiten:** "Blockiert durch AUT-XX" / "Blockiert AUT-YY"; bei MQTT/API immer beide Enden

5. **verify-plan Hinweis:** "Nach Erstellung: verify-plan gegen folgende Dateien: [Liste]"

6. **Akzeptanzkriterien:** 3-7 messbare, checkbare Punkte (inkl. Build-Verifikation)

7. **Pattern-Referenz:** Verweis auf konkrete Vorlage-Dateien im Repo ("wie SensorCard.vue Pattern")

### Zusaetzlich bei Analyse-Issues
- IST/SOLL-Dokumentationsziele (messbar: "Datei X existiert mit Inhalt Y")

### Zusaetzlich bei Implementierungs-Issues
- Testfaelle (inkl. Breakpoints, Mock/Echt)
- Risiko (Low/Medium/High + Begruendung)
- Schaetzung (S/M/L)

### Parent-Child-Struktur
- Ein Parent-Issue "Epic" mit Kindern pro Agent und logischer Reihenfolge
- Linear uebernimmt die Lesbarkeit, TM liefert die inhaltliche Kette

---

## 6. meta-analyst Decision-Tree (Pflichtlogik)

TM dokumentiert immer welcher Modus galt und warum:

| Bedingung | Modus | Beschreibung |
|-----------|-------|-------------|
| Reports widersprechen sich oder sind aelter als letzter Code-Stand | **Code-First** (Modus A) | Repo lesen, Reports nur als Hinweis |
| Frische, konsistente Debug-Reports vorhanden, kein Repo-Zugriff | **Report-Legacy** (Modus C) | Korrelation zwischen Reports, Code-Stichproben zur Bestaetigung |
| Einfacher Single-File-Bug in einer Schicht klar sichtbar | **Fast-Track** | Kein voller Meta-Zyklus, direkt Issue + Dev-Agent |
| Fokussierter Auftrag auf bekanntes Subsystem | **Fokussiert** (Modus B) | Gezielter Scope, weniger als vollstaendiger Querschnitt |

---

## 7. verify-plan: Integration in den TM-Workflow

verify-plan ist **Qualitaetsgate zwischen Plan und Umsetzung**, nicht Ersatz fuer TM-Analyse.

### Wann
- Nach Issue-Erstellung, **bevor** Dev-Agents breit anfangen
- Bei Fast-Track: kurzer verify-plan auf betroffene Datei(en)
- Bei auto-debugger: Pflicht nach TASK-PACKAGES (Schritt 8)

### Was verify-plan prueft
- Existieren referenzierte Pfade/Symbole im Repo?
- Sind Test-Befehle korrekt (Working-Directory, Dateiname)?
- Gibt es Breaking-Changes die nicht dokumentiert sind?
- Stimmt die Agent-Zuweisung zum Issue-Scope?

### Was verify-plan liefert
- Liste konkreter Korrekturen an Issue-Texten
- Pfad-Korrekturen (z.B. "El Servador" statt "server")
- Fehlende Abhaengigkeiten
- "Stop"-Punkte wenn Evidence fehlt
- VERIFY-PLAN-REPORT.md (bei auto-debugger Pfad)

### TM-Reaktion nach verify-plan
- Issues nachziehen (Pfade, Tests, Kriterien korrigieren)
- **Code gewinnt** — wenn verify-plan widerspricht: Issues anpassen, nicht Realitaet schoenreden
- **Bei Backend→Frontend-Flow (F5):** Multi-Agent verify-plan *nach* Gate 2 (Frontend Wiring von agents durchgefuehrt): Consistent Check für MQTT Topics / WebSocket Events / API-Endpunkte — müssen auf **beiden Seiten** existieren und Match.

---

## 8. Eskalationsmatrix

| Situation | Erste Aktion |
|-----------|-------------|
| Debug-Agent findet Problem in anderer Schicht (z.B. esp32-debug → Server-Bug) | Issue an zustaendigen Dev-Agent erstellen + Querverweis; Original-Issue auf "blocked" bis geklaert |
| Dev-Agent steckt fest | Issue splitten; Evidence nachfordern; ggf. Analyse-Issue mit Code-First meta-analyst |
| Docker / system-control faellt aus | Ops-Pfad pruefen; KEINE parallelen Firmware-Aenderungen bis Umgebung reproduzierbar; system-control erneut mit eingeschraenktem Scope |
| mqtt-dev aendert Kontrakt | Reihenfolge gemaess Agent-Abhaengigkeiten (Abschnitt 3); Server-Handler zuerst ODER strikt nach bestehendem Repo-Pattern — am IST-Code festlegen |
| verify-plan findet fehlende Dateien/Pfade | Issues korrigieren, NICHT implementieren ohne korrekte Evidenz; ggf. Analyse-Issue vorschalten |
| Mehrere Issues blockieren sich gegenseitig | Dependency-Graph in Linear pruefen; kleinstes unabhaengiges Paket zuerst |

---

## 9. Anti-KI-Fehler (fuer TM und Agenten-Prompts)

Jedes Issue muss diese Regeln **operationalisieren**:

| Fehlerbild | Verbot / Pflicht |
|------------|------------------|
| Halluzinierte Artefakte | Keine Datei-/Topic-/Endpoint-Namen ohne Repo-Beleg (Pfad + Suchbegriff) |
| Generisches Tutorial-Wissen | Keine "best practice" die dem Repo widerspricht; extern nur wenn es konkrete Repo-Diskrepanz erklaert |
| Scope-Vermischung | Analyse und Implementierung getrennt; Analyse-Issues enden mit IST/SOLL-Dokumentationszielen |
| Implizite Tests | Kein "Tests gruen" ohne benannte Kommandos aus Verifikationskriterien-Tabelle |
| Cross-Layer-ID-Mix | Pro Schicht die kanonische ID aus dem Code benennen (request_id, esp_id, correlation etc.) |
| UI ohne Operator-Kontext | Frontend = Operator-Cockpit; Korrektheit > Aesthetik; Degradation/Finalitaet wo relevant |
| Ueberdimensionierte Pakete | Lieber 3 kleine Issues als 1 Mega-Issue |
| Unklare Abnahme | Jedes Issue: checkbare Definition of Done |

---

## 10. Path-Scoped Rules (Automatisch geladen)

Agenten laden automatisch die Rules ihres Bereichs. TM muss diese kennen:

| Datei | Geltung | Kern-Inhalte |
|-------|---------|-------------|
| `rules/rules.md` | Alle Bereiche | Verbotene Aktionen, Code-Stil, Aenderungsprinzip |
| `rules/firmware-rules.md` | El Trabajante/ | ESP32 C++, PlatformIO, Memory, NVS |
| `rules/api-rules.md` | El Servador/ | REST, MQTT Topics, Error-Codes, WebSocket |
| `rules/frontend-rules.md` | El Frontend/ | Vue 3, TypeScript strict, Styling, Composables |
| `rules/testing-rules.md` | Tests | pytest, Vitest, Playwright Patterns |
| `rules/docker-rules.md` | Docker/Compose | Health-Checks, Service-Konfiguration |

---

## 11. Skill-Referenz fuer TM

| Skill | Wann der TM ihn nutzt/referenziert |
|-------|-------------------------------------|
| `verify-plan` | Gate vor jeder Implementierung — TM muss Ergebnis lesen und Issues korrigieren |
| `/do` | Praezise Plan-Ausfuehrung durch Dev-Agent — TM referenziert in Issue: "Ausfuehrung via /do" |
| `/collect-reports` | Nach Debug-Phase — TM wartet auf CONSOLIDATED_REPORT.md |
| `auto-debugger` | Kritische Incidents — TM schreibt Steuerdatei unter `.claude/auftraege/auto-debugger/inbox/` |
| `/git-commit` | Nach Implementierung — TM referenziert: "Commit nach Verifikation" |
| `agent-manager` | Bei Agent-Qualitaetsproblemen — TM kann IST/SOLL-Pruefung anfordern |
| `/ki-audit` | Bei Verdacht auf KI-Fehler in bestehendem Code — TM kann Audit anfordern |
| `/updatedocs` | **Pflicht nach jeder Implementierung** — aktualisiert alle betroffenen Docs chirurgisch (Abschnitt 13) |

---

## 12. Metriken (minimal, Pflicht ab 2026-04-15)

Pro abgeschlossenem Paket (Epic oder Sprint) kurz festhalten (Linear-Kommentar oder `.technical-manager/reports/`):

- Anzahl F1-/Verifikationszyklen bis "done"
- War der erste zugewiesene Agent korrekt? (ja/nein + Korrektur)
- Dauer Schaetzung vs. Realitaet (grob)

Ziel: spaetere Retrospektive ohne grossen Overhead.

---

## Wichtige Grundregeln

- **Agents werden IMMER einzeln** im Chat-Fenster gestartet (ausser bei dokumentierter Parallel-Dispatch)
- **system-control kommt IMMER vor den Debug-Agents** (er generiert die Logs)
- **Der TM codet nicht** — er beschreibt praezise, die Dev-Agents setzen um
- **Code gewinnt** — wenn ein Report dem Code widerspricht, Code ist Wahrheit
- **Jedes Issue muss ohne muendliche Erklaerung verstaendlich sein** (selbsttragend)
- **Conventional Commits** — fix/feat/chore/refactor/docs/test
- **Build-Verifikation** — kein Commit ohne gruene Verifikation (Tabelle in CLAUDE.md)

---

---

## 13. Post-Implementierung: Kontext-Analyse + /updatedocs (Pflicht)

Nach **jeder** Code-Aenderung durch einen Dev-Agenten — egal ob Fast-Track, F2 oder auto-debugger — ist folgender Abschluss-Schritt Pflicht:

### Schritt 1: Kontext-Analyse

Der ausfuehrende Agent (oder ein frischer Agent-Aufruf) analysiert die gerade durchgefuehrten Aenderungen im Gesamtkontext:

- Welche Dateien wurden geaendert?
- Welcher Aenderungstyp liegt vor? (Neuer Service, API-Endpoint, MQTT-Topic, Port, Error-Code, NVS-Key, WebSocket-Event, Agent/Skill, Docker-Config, Log-Pfad)
- Welche Abhaengigkeiten zu Dokumentationsdateien bestehen?

### Schritt 2: /updatedocs ausfuehren

`/updatedocs` wird mit einer Zusammenfassung der Aenderungen aufgerufen. Der Skill:

1. Matcht den Aenderungstyp gegen seine **Abhaengigkeits-Matrix** (11 Kategorien, von Docker-Service bis NVS-Key)
2. Identifiziert ALLE betroffenen Dokumentationsdateien im Repo
3. Liest jede betroffene Datei KOMPLETT
4. Editiert **chirurgisch** — nur betroffene Zeilen, bestehendes Pattern exakt kopieren
5. Liefert einen Bericht: welche Dateien geaendert, was pro Datei aktualisiert

### Betroffene Dokumente (Beispiele aus der Matrix)

| Aenderungstyp | Typisch betroffene Docs |
|---------------|------------------------|
| API-Endpoint | `reference/api/REST_ENDPOINTS.md`, Frontend/Server Skills |
| MQTT-Topic | `reference/api/MQTT_TOPICS.md`, `El Trabajante/docs/Mqtt_Protocoll.md`, MQTT/ESP32 Skills |
| Error-Code | `reference/errors/ERROR_CODES.md` |
| WebSocket-Event | `reference/api/WEBSOCKET_EVENTS.md`, Frontend Skill |
| Docker-Service/Port | `rules/docker-rules.md`, `SYSTEM_OPERATIONS_REFERENCE.md`, `LOG_LOCATIONS.md` |
| Neuer Agent/Skill | `CLAUDE.md` Agent/Skill-Tabelle, `agents/Readme.md`, `skills/README.md` |
| NVS-Key | `El Trabajante/docs/NVS_KEYS.md`, ESP32 MODULE_REGISTRY |

### Regeln

- /updatedocs aendert **nur Dokumentation**, keinen Code
- /updatedocs schreibt nie Dateien neu, sondern editiert chirurgisch
- Wenn ein Dev-Agent Code aendert aber /updatedocs nicht aufgerufen wird: **Workflow-Verletzung**
- Bei Unsicherheit ob Docs betroffen sind: `grep -r "geaenderter_wert" .claude/ --include="*.md" -l`

### Integration in Issue-Akzeptanzkriterien

Jedes Implementierungs-Issue MUSS als letztes Akzeptanzkriterium enthalten:

```
- [ ] /updatedocs ausgefuehrt — betroffene Docs aktualisiert
```

---

*Referenz: `.technical-manager/TECHNICAL_MANAGER.md` fuer aktuelle Prioritaeten und Entscheidungen.*
