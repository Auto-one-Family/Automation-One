# Analyseauftrag — Konzept: `auto-debugger` (Orchestrierung), Frontend-Flow-API, Alert-Center E2E

**Datum:** 2026-04-09  
**Typ:** Reiner Analyseauftrag (Ergebnis = Markdown-Konzeptbericht + ggf. Architektur-Skizzen im Ziel-Repo; **keine** Produktiv-Implementierung in diesem Dokument)  
**Ziel-Repository:** AutomationOne-Codebasis (lokal z. B. unter `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\`)  
**Priorität:** Hoch (Grundlage für schrittweise Einführung des Agents `auto-debugger` und einer sicheren Flow-Ausführungs-API)

> **Ablage im Ziel-Repo (empfohlen):** Diese Datei **unverändert** nach  
> `Auto-one\.claude\auftraege\analyseauftrag-auto-debugger-orchestration-frontend-flow-api-alertcenter-2026-04-09.md`  
> kopieren. Alle Begriffe und Regeln stehen **in diesem Dokument** — der ausführende Agent benötigt **kein** Life-Repo.

---

## Auftrag: Perfektes Gesamtkonzept erarbeiten

**Ziel:** Ein **implementierungsreifes Gesamtkonzept** ausarbeiten, das **auf den aktuellen AutomationOne-Stack** zugeschnitten ist:

| Schicht | Stack (Ist-Annahme) |
|---------|---------------------|
| **El Trabajante** | ESP32, C++/Arduino |
| **El Servador** | Python FastAPI, PostgreSQL, MQTT |
| **El Frontend** | Vue 3, TypeScript, Pinia, WebSocket |

**Fokusbereich (verbindlich):** **Alert-Center und zugehörige Fehler-/Korrelationsketten** — **End-to-End** von der Operator-Oberfläche über Server, Persistenz (DB), MQTT/Background-Services bis zur Firmware. Dazu gehört die **Vorbereitung einer API/Schnittstelle**, mit der ein Agent **definierte Frontend-Flows gezielt ausführen** kann (nicht beliebiges „UI herumklicken“ ohne Vertrag).

**Leitprinzipien (verbindlich):**

1. **Bestehendes System vervollständigen und konsolidieren** — keine Greenfield-Neuarchitektur; Verbesserungen müssen sich in die vorhandene Struktur (Agenten, Skills, Aufträge, Tests) einfügen.
2. **Keine Breaking Changes** an öffentlichen REST-Kontrakten, MQTT-Topic-Schema, DB-Schema oder bestehenden Client-Erwartungen — außer mit **explizitem Migrationsplan**, Feature-Flag und Freigabe (im Konzept als „nur mit Gate X“ kennzeichnen).
3. **Priorität bei der Fehlerbearbeitung:** zuerst **Error-Logs**, **Correlation-IDs** (technisch: Request-/Trace-/Anwendungskorrelation je nach vorhandenem Vertrag) und **nachweisbare Inkonsistenzen** zwischen Schichten; dann UX-Polish.
4. **Schrittweise Vorgehensweise:** jede Phase hat **klare Ein-/Ausgaben**, **Tests** und **Konsolidierung** bevor die nächste Phase startet.
5. **Firmware ist sicherheits- und betriebskritisch:** Konzept muss unterscheiden, was auf **Wokwi** (Regression, Nicht-Hardware-Pfade) und was **zwingend am echten ESP** validiert wird (Alert-Pfade, NVS, Reconnect, Safety-relevante Pfade).
6. **Git-Workflow:** Arbeit erfolgt auf einem **von `main` abgeleiteten stabilen Branch**; kleine, review-fähige Änderungen mit nachvollziehbarer Testmatrix.

**Nicht-Ziele (verbindlich):**

- Keine Speicherung von Secrets, Tokens oder personenbezogenen Daten im Konzeptbericht (nur Platzhalter und Integrationspunkte beschreiben).
- Kein Ersatz für menschliche Freigabe bei produktivkritischen Deployments — das Konzept beschreibt **wo** Gates sitzen, implementiert sie nicht blind.
- Keine generische „KI löst alles“-Architektur ohne messbare Schnittstellen und Tests.

---

## Eingebetteter Systemkontext (Pflichtlektüre = dieser Abschnitt)

Der ausführende Agent **liest nur dieses Dokument und den Code/Dokumentation im Ziel-Repo**. Die folgenden Regeln ersetzen externe Wissensdateien.

### Operator-Modell (Frontend-Finalität)

Befehle und UI-gestützte Aktionen folgen grob dem Modell:

**`accepted → pending → terminal`** mit terminalen Ergebnissen mindestens: `success` | `failed` | `timeout` | `partial`.

Das Konzept muss prüfen und dokumentieren, wie **Alert-Center**, **Bestätigungen**, **Stummschalten** und verwandte Flows dieses Modell **heute** erfüllen oder wo **Schein-Erfolge** (z. B. nur Toast ohne konsistente Server-/Log-Kette) entstehen.

### Observability und Korrelation (Querschnitt)

Als Zielbild für **übergreifende Analyse** (Ist im Ziel-Repo zu verifizieren):

- **HTTP/API:** stabile `request_id` / `X-Request-ID` wo vorhanden; Propagation in Logs.
- **Anwendungskorrelation:** `correlation_id` (oder äquivalent) in den relevanten Pfaden (API → Services → MQTT-Publish/Subscribe → WS).
- **Gerätekontext:** stabile Geräte-IDs (`device_id`, `esp_id`, o. ä.) konsistent in Firmware-Payloads, DB und UI.
- **Monitoring:** strukturierte Logs; **hochkardinale IDs nicht als Loki-Labels** missbrauchen (Filter über Logfelder/JSON), stabile Labels für `service`, `env`, `severity`.

Das Konzept für `auto-debugger` muss **explizit** beschreiben, welche Felder der Agent **als Erste** beim Clustering von Incidents nutzt und wie **Lücken** ohne Breaking Change geschlossen werden können (additive Felder, Backward-kompatible Payloads).

### Bestehende Agenten-/Skill-Struktur (Ziel-Repo)

Das Konzept muss **am realen Layout** im Auto-One Repo ansetzen (z. B. `.claude/agents/`, `.claude/skills/`, `CLAUDE.md`, Auftragsordner). Es ist **keine** feste Namensliste aus dem Life-Repo zu übernehmen — stattdessen: **Ist-Inventar** im Ziel-Repo erstellen und daraus **Zuordnung** ableiten:

- Welche **spezialisierten Agenten** existieren (Backend, Frontend, Firmware, DevOps, …)?
- Welche **Skills** existieren bereits, die wiederverwendet werden können?
- Wo fehlt eine **klare Trennung** zwischen „Orchestrierung“ und „Umsetzung“?

---

## Kernteil A: Agent `auto-debugger` — Rolle und Einbettung

Der Analysebericht soll ein **Orchestrierungsmodell** definieren:

### A.1 Rolle

- **Ein Agent (`auto-debugger`)** führt den **Gesamtworkflow** — er **delegiert nicht blind**, sondern hält **einen konsolidierten Incident-Überblick** (ein „Lagebild“-Artefakt pro Lauf oder pro Ticket).
- Er **formuliert am Ende** für **jeden betroffenen Bereich** (Frontend | Server/DB | Firmware) **eigenständige, kopierbare Prompts/Aufträge** an die **jeweils passenden Spezial-Agenten** — so dass diese **ohne den Orchestrator-Kontext** arbeiten können, sofern die Aufträge **selbsttragend** sind (vgl. interne Auftragsregeln im Ziel-Repo).

### A.2 Pflicht-Arbeitsmodus (Schleife)

Das Konzept muss die folgende **Pflichtsequenz** als Standardprozedur beschreiben (mit konkreten Artefakten und Abbruchbedingungen):

1. **IST-Stand / Kontext** — Wenn nicht bereits bekannt: Systemzustand (Version/Branch, laufende Services, relevante Feature-Flags) **minimal aber ausreichend** erfassen.
2. **Log- und Fehler-Triage** — Priorisiert: Application-Error-Logs, strukturierte Fehlerobjekte, **Correlation-IDs**, wiederkehrende Muster; **Clustering** zusammenhängender Ereignisse über Schichten hinweg.
3. **Hypothesen & Scope** — Was ist Symptom vs. Ursache; welche Schichten sind betroffen; **was wird explizit nicht** geändert.
4. **Delegation** — Aufgaben in **kleine Pakete** an Spezial-Skills / Spezial-Agenten (siehe Teil B) mit **messbaren Akzeptanzkriterien**.
5. **Konsolidierung** — Widersprüche zwischen Teilresultaten auflösen; **eine** konsistente Ursachen-/Maßnahmenliste.
6. **`/verify-plan`-Gate (siehe unten)** — Queranalyse gegen **echten Code**; Aufträge **schärfen** (Pfade, IST/SOLL, Risiken).
7. **Umsetzungsreihenfolge** — Nur nach Gate: **schrittweise** Fixes auf dem **sicheren Branch**, jeweils mit Tests.

### A.3 Artefakte (Pflicht im Konzept)

Der Bericht soll **Dateinamen und Mindestinhalt** für folgende Artefakte festlegen (Beispielnamen dürfen angepasst werden, müssen aber **konsequent** definiert werden):

| Artefakt | Zweck |
|----------|--------|
| `INCIDENT-LAGEBILD.md` (oder JSON) | Eine Seite: Symptom, betroffene IDs, Zeitraum, betroffene Schichten, offene Fragen |
| `CORRELATION-MAP` | Tabelle/Graph: welche Logzeilen/API-Calls/MQTT-Messages gehören zusammen |
| `TASK-PACKAGES` | Nummerierte Pakete mit Owner (Frontend/Server/Firmware), Risiko, Testplan |
| `SPECIALIST-PROMPTS` | Final: 1 Prompt/Auftrag pro Bereich, **ready to paste** |
| `VERIFY-PLAN-REPORT` | Dokumentierte Korrekturen am Plan **vor** Codeänderung |

---

## Kernteil B: Skill-Set für fokussierte Teilarbeit bei Gesamtüberblick

Das Konzept soll **Skills** (oder äquivalente modulare Anweisungen) vorschlagen, die **einzeln fokussiert** arbeiten, während `auto-debugger` die **Konsolidierung** behält.

**Mindestens** diese **logischen** Skill-Module müssen im Konzept definiert werden (Namen im Ziel-Repo an bestehende Konvention anpassen):

| Modul | Fokus | Typische Eingabe | Typische Ausgabe |
|-------|--------|------------------|------------------|
| **Triage / IST-Stand** | Branch, Services, Health-Endpoints, „was läuft wo“ | Start eines Laufs | Kurz-IST, Blocker-Liste |
| **Log-Korrelation** | Clustering über FE/BE/MQTT/Loki | Rohlogs, Zeitraum | `CORRELATION-MAP`, P0-Themen |
| **Frontend-Flow-Ausführung** | Deterministische UI-Pfade (siehe Teil C) | Flow-ID + Parameter | Schritt-Trace, Screenshots optional, Assertions |
| **Server & DB** | API-Handler, Transaktionen, Invarianten Alert/DB | correlation_id / request_id | Ursachenhypothese + konkrete Code-Stellen |
| **MQTT & Hintergrundjobs** | Handler, Outbox, Race Conditions | Topics, Payloads | Lücken im Vertrag |
| **Firmware** | Alert-Generierung, NVS, Reconnect, Safety-Pfade | Device-Kontext | **Pflicht:** Trennung Wokwi vs. echter ESP |
| **Test & Verifikation** | pytest, Vitest/Playwright, Wokwi-Szenarien, Hardware-Checkliste | TASK-PACKAGES | Go/No-Go pro Paket |
| **Konsolidierung & Prompt-Bau** | Zusammenführung, Widerspruchsauflösung | alle Teiloutputs | `SPECIALIST-PROMPTS` + Reihenfolge |

**Anforderung:** Skills dürfen **nicht** stillschweigend den Gesamtkontext verlieren — das Konzept beschreibt, wie `auto-debugger` **vor** jeder Delegation das `INCIDENT-LAGEBILD` aktualisiert und **nach** jedem Skill-Lauf **einmergt**.

---

## Kernteil C: „API für einen Agenten“ — Frontend-Flows deterministisch ausführen

Der Analysebericht soll **Varianten** untersuchen und **eine empfohlene Hauptvariante** für AutomationOne begründen (mit Fallback, falls Rahmenbedingungen im Code dagegensprechen).

**Funktionale Anforderung:** Ein Agent (oder ein Test-Runner) kann **benannte Flows** ausführen, z. B.:

- Alert-Center öffnen, Filter setzen, Details einer Meldung öffnen, Aktion „bestätigen“ / „stummschalten“ (je nach Ist-Implementierung).
- Einen Flow **wiederholbar** und **ohne manuelle Interaktion** fahren.
- Pro Schritt: **Assertion** (DOM-Zustand, Netzwerk-Request, API-Antwort, WS-Event) — mindestens dort, wo heute Finalität bricht.

**Zu analysierende Optionen (alle bewerten):**

1. **Playwright (oder äquivalent) im Repo** — Flows als Code; CI-tauglich; Agent triggert `pnpm test:e2e --grep …` oder eigene CLI.
2. **Interne Dev/Test-API** (nur in Dev/CI aktiviert) — z. B. FastAPI-Routen unter `/internal/test/...` die **nur** mit starkem Auth/Flag erreichbar sind und **keine** Produktions-Endpunkte duplizieren; Frontend wird über **stabile Test-IDs** oder **Router-Hooks** gesteuert.
3. **Browser-Extension / CDP** — nur wenn 1+2 unzureichend; Sicherheits- und Wartbarkeitsrisiken benennen.

**Sicherheits-Pflicht im Konzept:**

- Kein „offenes Fernsteuern“ der Produktions-UI ohne **Authentifizierung**, **Netzwerk-Isolation** und **Feature-Flag**.
- Klare Trennung: **Operator-UI** vs. **Debug-Oberfläche**.

**Lieferung im Analysebericht:**

- **Flow-Katalog-Schema** (YAML oder JSON): `flow_id`, `steps[]`, `assertions[]`, `required_env`, `data_fixtures`.
- **Empfohlene technische Implementierung** (1 Seite Architekturdiagramm reicht: Agent → Runner → Browser/Backend).
- **Mapping** zu Alert-Center-Komponenten/Routes (Ist-Pfade aus dem Code).

---
## Kernteil D: Alert-Center E2E — Ist-Audit und Lückenliste

Der Bericht soll **codegestützt** (nicht aus Erinnerung) folgende **Audit-Bereiche** abdecken:

### D.1 Frontend

- Routen, Stores, Komponenten des Alert-Centers; wie werden Listen, Details, Bulk-Aktionen, Realtime-Updates (WS) gehandhabt?
- Übereinstimmung mit dem **Finalitätsmodell**; wo bricht die Kette?
- Fehlerzustände: leere Zustände, Retry, Degradation bei WS-Ausfall.

### D.2 Server & DB

- REST-Endpunkte, Services, Transaktionen: Erstellung, Statusübergänge, Idempotenz wo nötig.
- DB-Tabellen/Felder: welche Felder tragen **Korrelation** / **Audit** / **Lifecycle**?
- Konsistenzregeln: was passiert bei **teilweisem** Fehlschlag (Outbox, Retries)?

### D.3 MQTT / Hintergrundverarbeitung

- Welche Topics/Payloads gehören zum Alert-Lebenszyklus?
- Wo werden Events **dedupliziert**, **aggregiert** oder **verzögert**?

### D.4 Firmware

- Wo entstehen Alerts bzw. Rohereignisse, die später Alerts werden?
- Welche Pfade sind **nur am echten Gerät** valide (Timing, NVS, Watchdog, GPIO, Sensorbus)?
- Welche Pfade sind für **Wokwi** ausreichend (Boot, MQTT-Connect, simulierte Sensoren)?

**Output:** **Priorisierte Lückenliste** (P0–P2) mit **„Was ist schon gut“** — um Blind-Rewrites zu vermeiden.

---

## Kernteil E: Teststrategie — Wokwi vs. echter ESP (verbindliche Regeln im Konzept)

Das Konzept muss **explizite Regeln** enthalten:

| Testart | Erlaubte Aussage | Pflicht für |
|---------|-------------------|-------------|
| Wokwi-Szenarien | Regression, Protokoll-Logik, viele UI/API-Kombinationen | Server, Frontend, MQTT-Contract (ohne echte Sensorik) |
| Echter ESP | Timing, NVS, Hardware-IO, Safety, „echte“ Alert-Ketten unter Last/Reconnect | **Firmware-kritische Fixes** |

**Regel:** Jeder Firmware-Fix im Alert-Pfad erhält eine **Hardware-Checkliste** (Schritte, erwartete Logs, Abbruchkriterien). Wokwi allein **reicht nicht** als Abnahme für Firmware, es sei denn, der Bericht belegt **explizit**, dass der Pfad **keine** hardwareabhängige Semantik hat (selten bei IoT-Alerts).

---

## Kernteil F: `/verify-plan` — verbindliches Gate vor Implementierung

**Definition für dieses Programm:** `/verify-plan` ist **kein** optionaler Kommentar, sondern eine **Pflichtphase** zwischen „fertige Auftragsentwürfe“ und „Code ändern“.

**Pflichtaktivitäten im Gate:**

1. **Queranalyse** der geplanten Änderungen gegen **tatsächliche** Dateien, Zeilen, APIs (keine Annahmen aus älteren Aufträgen).
2. **Widerspruchsauflösung** zwischen Frontend-, Server- und Firmware-Teilplänen.
3. **Breaking-Change-Scan:** öffentliche Routen, MQTT-Topics, DB-Migrationen, WS-Events.
4. **Testabdeckung:** für jedes Paket — welcher Test **beweist** den Fix?
5. **Output:** `VERIFY-PLAN-REPORT` mit **konkret verbesserten** Auftrags-/Prompt-Texten (gleicher Stil wie präzise Auto-One-Aufträge: IST/SOLL, Akzeptanzkriterien, explizite Nicht-Ziele).

**Erst nach** diesem Gate beginnt die **schrittweise** Umsetzung auf dem **sicheren Branch**.

---

## Lieferobjekt (Pflicht)

Ein **Markdown-Konzeptbericht** im Ziel-Repo, empfohlener Pfad:

`docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md`

### Pflichtabschnitte des Konzeptberichts

1. **Executive Summary** (max. eine Druckseite): Zielbild, Hauptempfehlung Flow-API, Top-5 Risiken, Top-5 Quick Wins **ohne** Breaking Changes.
2. **Ist-Inventar** Auto-One: Agenten, Skills, relevante CLAUDE.md-Verweise, bestehende E2E-/Wokwi-Infrastruktur.
3. **Zielarchitektur `auto-debugger`:** Diagramm (Orchestrator → Skills → Spezial-Agenten) + Artefaktfluss.
4. **Frontend-Flow-API:** gewählte Variante, Begründung, Sicherheitsmodell, Beispiel-Flow-Definition (1 vollständiges Beispiel für Alert-Center).
5. **Alert-Center E2E:** Ist-Audit-Zusammenfassung + Lückenliste P0–P2 + „Was ist schon gut“.
6. **Korrelation & Logging:** welche IDs heute wo existieren; welche **additiven** Verbesserungen schließen Lücken (ohne Breaking Change).
7. **Test- und Abnahmestrategie:** Matrix Wokwi vs. ESP; CI-Einbindung; was der Agent **nie** allein „abnahmefähig“ erklären darf.
8. **`/verify-plan`-Prozedur:** Checkliste, Verantwortlichkeit (wer führt Gate aus), Artefaktformat.
9. **Roadmap in Phasen:** Phase 0 (nur Analyse/Inventar), Phase 1 (Flow-Runner + 1 Referenz-Flow), Phase 2 (Korrelation/Lücken P0), … — jeweils mit **Exit-Kriterien**.
10. **Anhang:** Vorlage für `SPECIALIST-PROMPTS` und `TASK-PACKAGES` (Copy-Paste-freundlich).

---

## Arbeitsanweisungen für den ausführenden Agenten im Ziel-Repo

1. **Code und Docs im Ziel-Repo** als einzige Wahrheitsquelle — keine Annahmen aus Chat oder externen Pfaden.
2. **Zitate aus dem Code** sparsam aber präzise (Dateipfade, Symbole), damit Follow-up-Aufträge **ohne Rätselraten** sind.
3. Wo das Ziel-Repo **Lücken** hat (fehlende Tests, fehlende IDs), **explizit** benennen und **kleinste** verbessernde Maßnahme vorschlagen — nicht groß umbauen.
4. **Robin-relevant:** Wenn ein **physischer ESP** als Testressource vorgesehen ist, im Konzept **Setup-Schritte** beschreiben (wie erkannt wird, welches Gerät „das Testgerät“ ist — z. B. feste `esp_id`, Umgebungsvariable, UI-Kennzeichnung), ohne auf konkrete Geheimnisse einzugehen.

---

## Akzeptanzkriterien (Messbar)

Der Analyseauftrag gilt als **erfüllt**, wenn der Konzeptbericht:

- [ ] **Eine empfohlene** Frontend-Flow-Ausführungsarchitektur enthält und **Alternativen** ausschließt oder als Fallback markiert.
- [ ] **`auto-debugger`** klar als **Orchestrator** definiert ist mit **Skill-Zerlegung** und **Konsolidierungsschritt**.
- [ ] **Alert-Center E2E** über alle vier Schichten (FE, Server/DB, MQTT, Firmware) abgedeckt ist.
- [ ] **Correlation / Error-Logs** als **P0-Triage** verankert sind.
- [ ] **Kein Breaking Change** ohne explizites Gate beschrieben ist; additive Strategie bevorzugt wird.
- [ ] **Wokwi vs. echter ESP** **verbindlich** getrennt ist.
- [ ] **`/verify-plan`** als **Pflichtgate** vor Implementierung dokumentiert ist inkl. Output-Format.
- [ ] **Phasen-Roadmap** mit **Exit-Kriterien** und **Testnachweis** pro Phase vorliegt.
- [ ] **Vorlagen** für Spezialisten-Prompts und Task-Pakete enthalten sind.

---

## Hinweis zur Umsetzung danach (nur Kontext, nicht Teil dieses Analyseauftrags)

Nach Freigabe des Konzepts: Umsetzungsaufträge **klein und getrennt** pro Phase im Ziel-Repo anlegen; Arbeit auf dem **von `main` abgeleiteten sicheren Branch**; nach jedem Paket **Tests** (automatisiert + wo gefordert **Hardware**). Der Agent `auto-debugger` und zugehörige Skills werden **schrittweise** eingeführt — das vorliegende Dokument liefert nur das **Konzept**, nicht die Implementierung.
