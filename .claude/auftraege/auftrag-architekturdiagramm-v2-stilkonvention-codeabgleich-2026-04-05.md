# Auftrag: AutomationOne-Architekturdiagramm V2 — Stilkonvention beibehalten, schrittweise gegen echten Code abgleichen

**Erstellt:** 2026-04-05  
**Owner (Life-Repo / Strategie):** automation-experte-Kontext  
**Ausfuehrung:** Agent mit vollstaendigem Zugriff auf dieses Repository (Auto-One)

---

## 1. Ziel

Das Architektur-SVG `AutomationOne_Architektur_v2.svg` ist die kanonische **einseitige Systemansicht** (Trust Boundaries, Schichten, Datenfluesse, KPI-Spalte). Es soll **visuell und inhaltlich im V2-Stil weitergefuehrt** werden: keine Neuerfindung des Layouts, sondern **iterative Korrektur und Schaerfung** auf Basis des **realen Codes und der Laufzeitfakten** in diesem Repo.

**Artefakte (im Repo, gleicher Ordner):**

| Datei | Pfad |
|-------|------|
| Diagramm V2 | `.claude/reports/current/AutomationOne_Architektur_v2.svg` |
| Metadaten / Kennzahlen | `.claude/reports/current/AutomationOne_Architektur_v2.metadata.yaml` |
| Referenz V1 (unveraendert lassen) | `.claude/reports/current/AutomationOne_Architektur.svg` |

**Regel:** Aenderungen am Diagramm **immer** zusammen mit Aktualisierung der Metadaten-Datei dokumentieren (siehe Abschnitt 6). V1 nur als historische Referenz; Bearbeitung erfolgt an V2 (oder explizit benannter Folgeversion, z. B. `v2.1` im Untertitel).

---

## 2. Visuelle und inhaltliche Stilkonvention (V2 — verbindlich beibehalten)

Diese Regeln sind **nicht optional**. Abweichungen nur nach ausdruecklicher Anweisung von Robin.

### 2.1 Technik und Canvas

- **Format:** SVG, `viewBox="0 0 1700 1200"`, Schrift `Segoe UI` / Arial / sans-serif.
- **Hintergrund:** Vertikaler Verlauf `#F8FAFC` → `#E2E8F0`, dezenter Schatten-Filter auf grossen Bloecken.
- **Header:** Zentrierter Titel „AutomationOne Architektur“, darunter Unterzeile mit Versionskennung und **Stand-Datum** (ISO), duenne Akzentlinie unter dem Untertitel.

### 2.2 Trust Boundaries

- **Boundary A (Operativer Kern):** Grosse Fläche links, helles `#F8FAFC`, Rand `#CBD5E1`, Label in Grossbuchstaben mit Letter-Spacing.
- **Boundary B (Operations / Tooling):** Rechte Spalte `#FFF7ED`, Rand `#FDBA74`, eigenes Label.
- Trennung zwischen „was laeuft produktiv“ und „was beobachtet/regelt“ beibehalten.

### 2.3 Schichten (von oben nach unten, zentrale Spalte)

Reihenfolge und **Farblogik** beibehalten:

1. **Web Dashboard (Vue 3):** Indigo-Balken `#4F46E5`, helle Inhaltskarten weiss mit `#C7D2FE`. Submodule als kleine Karten mit **Titel** (10pt semibold) und **zwei Zeilen** Subtext (8pt grau).
2. **API + Session (FastAPI):** Hellblau `#EFF6FF`, Kopfband mit blauer Transparenz, eine Zeile kompakte Fakten + **Hinweiszeile**, dass Zaehlungen nur fuer den verifizierten Stand gelten.
3. **Intelligenz-Kern (El Servador):** Violetter Gradient (`coreGrad`), kräftiger Kopfbalken `#7C3AED`, weisse/halbtransparente **Modul-Karten** mit Aufzählungsstrichen (`- `). **Safety Core** bleibt **warm-orange** hervorgehoben (`#FFF7ED` / `#F97316`).
4. **Kanonische Runtime-Zustaende:** Eigenes Sub-Panel unter dem Kern, kompakter State-String mit `->`, darunter **bekannte Risiken** und **Strategie** in kleiner Schrift — klar als „IST + Risiko“ lesbar, nicht als Marketing.
5. **Daten / Persistenz (PostgreSQL):** Warmes Panel `#FFF7ED`, Hinweise auf Luecken (z. B. fehlende durable inbound replay queue) und **Zielbild** (schema_version) explizit trennen.
6. **MQTT (Mosquitto):** Gelbes Band `#FFFBEB`, kompakte eine Zeile zu QoS / Handlern.
7. **Edge ESP32:** Blaues Band, Faktenzeilen + **Log-basierte kritische Findings** (z. B. NVS) nur wenn verifiziert.
8. **Physische Welt:** Gruenes Band, Sensorliste / Aktorliste; Aktorenzeile in **warnendem Braunrot** (`#9A3412`), wenn es die Lesbarkeit von V2 widerspiegelt.

### 2.4 Rechte Spalte (Operations)

Drei Karten untereinander:

- **Observability** (rotrosa): Grafana, Prometheus, Loki, Alerting, CI/CD, Block „Automatisierte Tests“ mit **zusammengefuehrter** Testzahl — nur aktualisieren, wenn aus Repo-Skripten/Zählungen belegt.
- **Security + Governance** (neutral grau): JWT, Rollen, Audit, Secrets, Backup, SLO/SLI, Schema-Versionierung — explizit als **Pflicht-Ergaenzungen / Dokumentationspflicht**, nicht als „schon erledigt“ verkaufen.
- **KPI-Quelle (V2)** (indigo): Werte **aus Metadaten-Datei** spiegeln; Fusstext auf „agentisch verifiziert“ und Empfehlung „Werte aus Metadaten generieren“ beibehalten.

### 2.5 Pfeile und Legende

- **Blau durchgehend:** Client/API-Datenpfad (REST + WS) zwischen Web und API-Schicht.
- **Grau durchgehend:** Standard-Verarbeitungspfad zwischen grossen Schichten.
- **Rot gestrichelt:** Prioritaerer Safety-/Emergency-Pfad (vom Kern Richtung MQTT/Edge — geometrisch wie V2).
- **Gruen gestrichelt:** Sensor-Telemetrie aufwaerts (von Physik zur linken unteren Ecke des MQTT-Bands).
- **Legende unten:** Vier Pfeiltypen + Hinweiszeile, dass V2 **Fakten, Luecken und Zielbild** trennt.
- **Footer:** Dezente Linie + Kurztext zu Konsolidierung / Referenz.

### 2.6 Typografie und Dichte

- Keine neuen „Poster“-Flächen: **kompakte** 8–10pt Texte, maximale Informationsdichte wie V2.
- Neue Boxen nur im **gleichen Raster** (aehnliche Breiten, `rx` fuer Ecken, `filter="url(#shadow)"` auf grossen Gruppen).

---

## 3. Inhaltliche Regeln (was ins Diagramm darf)

1. **Verifizierte Fakten:** Nur eintragen, was durch **Code, Konfiguration oder ausfuehrbare Zählung** in diesem Repo belegt ist (siehe Phase-Checklisten unten).
2. **Bekannte Luecken:** Weiterhin sichtbar halten oder präzisieren (nicht wegstylen), Formulierung an `known_risks` und Architekturpakete anlehnen.
3. **Zielbild / Roadmap:** Kennzeichnen als Zielbild (z. B. schema_version ueberall), nicht als implementiert.
4. **Zaehlungen (Endpoints, Handler, Events, Tabellen, Dateien):** **Zuerst** `AutomationOne_Architektur_v2.metadata.yaml` anpassen, **dann** SVG-Texte synchronisieren — eine Quelle der Wahrheit.
5. **Frontend-Spezifika:** Mit `CLAUDE.md` und Router/Views abgleichen (z. B. CustomDashboardView, Legacy-Routen); keine widersprüchlichen Namen zu produktiven Views.

---

## 4. Schrittweiser Abgleich mit dem echten System (Reihenfolge)

Jede Phase endet mit einem kurzen **Verifikationsprotokoll** (Markdown-Stichpunkte: Methode, Ergebnis, Aenderung ja/nein) im selben Ordner, Dateiname z. B. `AutomationOne_Architektur_v2-verifikation-phase-0N-2026-04-05.md`, oder Anhang am Ende dieses Auftrags — solange nachvollziehbar.

### Phase 0 — Baseline

- SVG und YAML lesen; sicherstellen, dass Pfade im YAML zum Repo passen.
- Keine inhaltliche Aenderung; nur Verstaendnis und ggf. Tippfehler in Metadaten.

### Phase 1 — Backend (El Servador)

- `god_kaiser_server/src/main.py` (Lifespan, Services).
- MQTT: `mqtt/client.py`, `subscriber.py`, `handlers/` — **Handler zaehlen** (Ordner/Registrierung, nicht nur Dateien).
- REST: Router-Registrierung oder OpenAPI-Export — **Endpoint-Anzahl** explizit dokumentieren, wie gezaehlt wurde.
- WebSocket-Events: Emitter/Handler-Definitionen zaehlen, mit Frontend abgleichen.
- Logic: `services/logic/` — nur wenn Diagramm-Texte behaupten, muss Uebereinstimmung da sein.
- PostgreSQL: Migrationen oder Models — Tabellenanzahl mit gleicher Zählregel wie in Phase-Doku.

### Phase 2 — Frontend (Vue 3)

- Views und Routen: MonitorView, HardwareView, Rule Builder, Device Management, Emergency UI — **existieren die so** oder heissen Routen/Komponenten anders?
- Stores (Pinia), WebSocket-Subscription — Anzahl Events mit Backend abgleichen.
- Chart-Bibliothek: Diagramm sagt Chart.js — Code pruefen (kein ECharts).

### Phase 3 — Firmware (El Trabajante / ESP32)

- Pfade wie in Projekt-`CLAUDE.md`: `mqtt_client.cpp`, `main.cpp`, Safety, Queues, Intent-Outcome.
- Behauptungen im Edge-Band (QoS1, Emergency-Epoch, NVS) gegen Code/Logs verifizieren; Formulierungen schaerfen oder als „Risiko“ kennzeichnen.

### Phase 4 — Operations

- `docker-compose` (oder Äquivalent): Dienstanzahl **docker_services** in YAML.
- Observability-Stack: nur nennen, was wirklich im Repo/deployed vorgesehen ist.
- Tests: pytest + Vitest/Playwright + ggf. Wokwi — **Zählmethode** dokumentieren, dann KPI-Kachel aktualisieren.

### Phase 5 — Konsolidierung

- Ein Durchlauf: alle KPIs SVG ↔ YAML.
- Optional: Untertitel-Stand-Datum auf letzten Verifikationstag setzen.
- Wenn Änderungen grösser sind als reine Zahlen: **Minor-Version** im Titel erwägen (z. B. „V2.1“).

---

## 5. Abnahmekriterien (gesamt)

- Jede geaenderte **Zahl** im SVG hat ein **Echo** in der YAML und eine **eine Zeile Begründung** (wo gezaehlt).
- Keine neuen Behauptungen ohne Code-/Config-Beleg; unsichere Punkte bleiben unter Risiko/Zielbild.
- Visueller Stil entspricht Abschnitt 2 (Farben, Schichten, Pfeile, Spalten).
- V1-Referenz-SVG bleibt unangetastet (es sei denn, Robin wuenscht explizit eine Kopie-Aktualisierung).

---

## 6. Arbeitsablauf bei jeder Iteration

1. Code/Config analysieren (Phase aus Abschnitt 4).
2. `AutomationOne_Architektur_v2.metadata.yaml` aktualisieren (`stand`, `verified_metrics`, `known_risks`, `target_hardening_topics` bei Bedarf).
3. `AutomationOne_Architektur_v2.svg` textuell anpassen (Editor: VS Code / Inkscape — achten auf konsistente XML-Struktur).
4. Kurzes Verifikationsprotokoll schreiben.
5. Optional: Robin im Life-Repo informieren (SYNC der Dateien zurück ins Life-Repo nur auf Wunsch; hier ist Auto-One **Source of Truth** fuer die weitere technische Pflege).

---

## 7. Hinweis zur Rollentrennung Life- vs. Auto-One-Repo

Im Life-Repo formuliert der **automation-experte** Auftraege ohne direkten Code-Zugriff auf Auto-One. **Dieser Auftrag** ist fuer die **Ausfuehrung im Auto-One-Repo** gedacht: voller Lesezugriff auf den Code, Änderungen nur an den genannten Artefakten (SVG, YAML, Verifikations-Notizen), keine fachfremden Refactors.

---

## 8. Kurzreferenz: Was V2 bereits richtig trifft (nicht verwässern)

- Drei logische Schichten plus Edge und Physik, mit API/Web als getrennter Zugriffsschicht.
- Intelligenz-Kern mit Sensor Processing, Logic, Safety, Runtime/MQTT-Integration getrennt.
- Runtime-Zustandsautomat und **explizite** technische Schulden.
- Operations und Governance als **ehrliche** Ergänzungspflicht, nicht als „alles grün“.

**Ziel dieses Auftrags:** Diese Staerke beibehalten und **an den Code anbinden**, bis Diagramm und Metadaten bei jedem Release mit geringem Aufwand aktualisierbar sind.
