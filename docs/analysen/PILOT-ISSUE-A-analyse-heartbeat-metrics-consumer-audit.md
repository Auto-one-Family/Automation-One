# PILOT-ISSUE A (ANALYSE) — Heartbeat-Metrics Consumer Audit

> **Zweck dieses Dokuments:** Pilotierung des `ISSUE-TEMPLATE-ANALYSE.md` an einem realen offenen Thema (AUT-121 Heartbeat Metrics Split). Zeigt, dass das neue Pflichtformat **kuerzer** und **klarer** ist als historische Mega-Issues wie das urspruengliche AUT-68.
> **Dieser Entwurf** ist als Vorlage fuer ein neues Linear-Issue gedacht (noch nicht in Linear angelegt — erst nach Robin-Freigabe).
> **Basis-Template:** `docs/analysen/ISSUE-TEMPLATE-ANALYSE.md`.
> **Analyse-Bericht-Bezug:** `docs/analysen/ANALYSE-tm-issue-orchestrierung-linear-agenten-autoone-2026-04-26.md` §4.1, §4.8, §4.11, §4.12.

---

**Vorgeschlagener Linear-Titel:** `analyse: [Cross-Layer] Heartbeat-Metrics-Topic Konsumenten-Audit (pre AUT-121)`

---

## Intake-Block (V2 §4.8)

```
Intake:
- Problemklasse   = Drift (Transport-Entscheidung ohne Konsumenten-Uebersicht)
- Impactklasse    = P3 (keine Runtime-Regression, aber Architektur-Risiko fuer AUT-121)
- Scopeklasse     = Cross-Layer (Server-Handler + Frontend-ViewModel + Prometheus-Exporter)
- Artefaktlage    = Evidenz teilweise (heartbeat_handler.py, websocket-events.ts, espHealth.ts bekannt)
- Ausfuehrungsmodus = ANALYSE
- Containerwahl   = Einzel-Issue (1 Root-Frage, <= 1 Agentenlauf)

Begruendung: AUT-121 plant Hybrid-Transport (Delta-Flag im Kern-HB + dediziertes Topic).
Vor der Implementierung ist unklar, welche Konsumenten die heutigen Heartbeat-Felder
lesen. Ohne Audit entsteht stiller Drop wie bei AUT-71. ANALYSE-Issue zuerst, IMPL-
Issue (AUT-121) folgt als `blockedBy`.
```

---

## 0. Pflichtkopf
- **Owner:** Robin Herbig
- **Ausfuehrer:** `meta-analyst` (Cross-Layer) mit Konsultation `mqtt-debug` bei Topic-Fragen
- **Deadline:** 2026-04-28
- **Done-Kriterium:** Report-Datei `.claude/reports/current/audits/AUDIT-heartbeat-metrics-consumers-2026-04-28.md` existiert mit Konsumenten-Matrix (Feld → Konsument → Pfad:Zeile) fuer alle 14 aktuellen Heartbeat-Felder, mindestens 3 Evidenz-Quellen pro "kein Konsument"-Befund.
- **Blocker:** Keine.

## 1. Issue-Typ
ANALYSE

## 2. Scope
- **In-Scope:**
  - `El Servador/god_kaiser_server/src/mqtt/heartbeat_handler.py` (Lesen)
  - `El Servador/god_kaiser_server/src/services/espHealth.py` (Lesen)
  - `El Frontend/src/composables/espHealth.ts` (Lesen)
  - `El Frontend/src/types/websocket-events.ts` (Lesen)
  - `El Frontend/src/views/HardwareView/**` + `SystemMonitorView/**` (Grep nach Feldnamen)
  - `deploy/grafana/dashboards/*.json` + `deploy/prometheus/rules/*.yml` (Grep nach Metric-Names)
  - `El Trabajante/src/publishers/heartbeat_publisher.cpp` (Lesen, um Soll-Felder-Liste zu erhalten)
- **Out-of-Scope:**
  - Kein Code-Fix.
  - Keine Topic-Schema-Aenderung (das ist AUT-121).
  - Keine Benchmarks oder Last-Tests.
- **Betroffene Schichten:** Cross-Layer (Server, Frontend, Monitoring, ESP32 nur als Soll-Referenz)
- **Abhaengigkeiten:**
  - `parent`: None
  - `blocks`: AUT-121 (Heartbeat Metrics Split — darf nicht starten ohne Konsumenten-Uebersicht)
  - `blockedBy`: None
  - `relatedTo`: AUT-68 (Phase 1), AUT-71 (FE-Wiring-Luecke als Muster-Praezedenz), AUT-69 (runtime_telemetry-Felder)

## 3. DoR (Definition of Ready)
- [x] Scope klar und Cross-Layer explizit begruendet (Konsumenten sind per Definition ueber alle Schichten verteilt)
- [x] Input-Artefakte benannt und verfuegbar (siehe In-Scope — alle Pfade bestehen im Repo)
- [x] Hypothesen-Liste vorhanden:
  - H1: Mindestens 3 der 14 Kern-Heartbeat-Felder haben aktuell 0 Konsumenten (stiller Drop wie AUT-71).
  - H2: Mindestens 2 Frontend-Views zeigen Heartbeat-Werte nur lokal lazy, ohne State-Store-Integration.
  - H3: Prometheus/Alloy scrapt keine Heartbeat-Metriken in aktueller Dashboard-Matrix (Gap-Befund).
  - H4: `runtime_telemetry`-Felder aus AUT-69 haben heute 0 Frontend-Konsumenten (bestaetigt AUT-71, aber nicht in Report festgehalten).
- [x] Agent-Zuweisung passt: `meta-analyst` (Cross-Layer-Analyse), `mqtt-debug` nur konsultiert bei Topic-Fragen
- [x] Gate-1-Entscheidung: verify-plan **aus** (reine Lese-Analyse, kein Commit von Test-Fixtures); Begruendung im Report-Kopf

## 4. Arbeitskette
1. **Input-Sichtung (Reihenfolge):**
   a. `El Trabajante/src/publishers/heartbeat_publisher.cpp` → Ist-Felder-Liste extrahieren (Soll-Menge)
   b. `heartbeat_handler.py` → empfangene Felder (Ist-Server-Seite)
   c. `espHealth.py` + `espHealth.ts` + `websocket-events.ts` → durchgereichte Felder
   d. Grep nach jedem Feldnamen in `El Frontend/src/**` + `deploy/grafana/**` + `deploy/prometheus/**`
2. **Hypothesen-Pruefung:** Pro Hypothese → Beleg-Tabelle (Datei:Zeile oder Log-Timestamp oder Kommentar-ID). `belegt | widerlegt | offen`.
3. **verify-plan:** uebersprungen (reine Lese-Analyse). Begruendung: kein Commit, keine Pattern-Aenderung, nur Report.
4. **Konsolidierung:** Report-Datei unter `.claude/reports/current/audits/AUDIT-heartbeat-metrics-consumers-2026-04-28.md` mit Abschnitten:
   - Kontext (AUT-121-Vorspann), IST (Feld-Matrix 14×Konsumenten), Hypothesen-Auswertung (H1–H4), SOLL-Skizze (welche Felder in AUT-121 welchen Transport-Pfad brauchen), Folge-Issues-Vorschlag.
5. **Handoff:** Report-Link als Kommentar im Pilot-Issue-A; Folge-Issue-Vorschlaege (z.B. IMPL-Issue fuer Alloy-Scrape-Konfig) als Liste am Report-Ende, **nicht** automatisch in Linear angelegt.

## 5. DoD (Definition of Done)
- [ ] Report-Datei existiert unter angegebenem Pfad und ist lesbar
- [ ] Feld-Matrix vollstaendig (14 Felder × mind. 5 Konsumenten-Spalten: heartbeat_handler, espHealth.py, espHealth.ts, websocket-events.ts, HardwareView, SystemMonitorView, Grafana, Prometheus)
- [ ] Jede der 4 Hypothesen ist mit `belegt | widerlegt | offen` gekennzeichnet und hat mindestens 1 Evidenz-Quelle
- [ ] IST + SOLL vorhanden; SOLL ist Grundlage fuer AUT-121-Scope-Schaerfung
- [ ] Risiko-Status: voraussichtlich `medium` (AUT-121-Implementierung haengt an diesem Audit)
- [ ] Folge-Issues als Vorschlag gelistet (mind. "FE-Wiring", "Alloy-Scrape", "Topic-Retention-Policy")

## 6. /updatedocs (Pflicht wenn code_change=true)
- **Trigger:** `code_change=false` (reine Lese-Analyse)
- **Ausnahme geprueft:** Keine Aenderungen an `reference/api/*`, `rules/*`, `CLAUDE.md`, SKILL-Dateien geplant. Falls im Verlauf Doku-Drift erkannt wird (z.B. MQTT_TOPICS.md listet Heartbeat-Topic unvollstaendig), wird ein separater DOKU-Issue (siehe `ISSUE-TEMPLATE-DOKU-UPDATEDOCS.md`) angelegt, **nicht** hier mit-fixiert (Scope-Guard §4.10).

## 7. Follow-up-Tracking
- **Verantwortlich:** TM
- **Restpunkte:** AUT-121 kann nach Report-Abnahme geschaerft werden; Folge-Issues aus Report-Ende werden vom TM zur Abnahme mit Robin vorgeschlagen (nicht automatisch erzeugt).
- **Check-Termin:** 2026-04-29 (1 Tag nach Deadline; Report-Review gemeinsam mit AUT-121-Scope-Schaerfung)

---

### Anti-Stuck-Selbstcheck (V2 §4.12)
- T1 Loop-Signal: Nicht erwartet, reine Lese-Analyse.
- T2 Scope-Unsicherheit: Bei > 2 Feldern ohne Feldkennung (z.B. namenlose Dict-Keys) stoppen, BLOCKER-Kommentar mit Frage an TM.
- T3 Zeitgrenze: 45 Min ohne Zwischenstatus = Zwischenstand-Kommentar mit Feld-Matrix-WIP (mind. 5 Felder dokumentiert).
- T4 Pfadkonflikt: Wenn einer der In-Scope-Pfade nicht existiert, sofort stoppen und Pfad-Abweichung in Kommentar (nicht spekulativ alternative Pfade raten).

### Pilot-Lernziele (nach Abnahme dieses Pilot-Issues an Robin berichten)
- War das 6-Schritt-Intake-Schema (§4.8) fuer diesen Scope eindeutig oder ambivalent?
- War die Hypothesen-Liste messbar genug, oder haette mehr Praezision geholfen?
- Wie lange hat der Agent wirklich gebraucht (Ziel: < 1 Zyklus, < 4h Arbeitszeit)?
- Wie viele Kommentare wurden inline angehaengt (Ziel: 0 Kaskade — P-07 vermeiden)?
