# ANALYSE- UND PLANUNGSAUFTRAG: Kaiser (Edge-Relay) — vollstaendige Vorplanung + Linear-Projekt

**Owner:** Robin Herbig  
**Ausfuehrer:** Technical Manager (Meta-Orchestrierung, **keine** direkte Produkt-Implementierung in diesem Auftrag)  
**Deadline:** 2026-05-15  
**Typ:** ANALYSE + KONZEPT + LINEAR-PROJEKT-ENGINEERING (Umsetzung erst nach freigegebenem Master-Implementierungsplan + verify-plan)  
**Status:** Final fuer TM-Start

---

## 0. Direktive an den Technical Manager (verbindlich)

Du fuehrst **keine** Kaiser-Implementierung aus. Dein Auftrag endet mit:

1. einer **Erstanalyse** des **bestehenden** AutomationOne-Systems im Hinblick auf die Kaiser-Rolle (IST, Luecken, bereits vorbereitete Stellen),
2. einem **vollstaendigen Linear-Projekt** (Projekt + hierarchische Issues) das **jede Schicht** und **jeden Architektur-Aspekt** abdeckt,
3. einer **klaren Agenten-Verteilung** (welcher Spezial-Agent bearbeitet welches Issue — mit Prompt-Contract wie in `.claude/reference/TM_WORKFLOW.md`),
4. einem **konsolidierten Implementierungsplan** als Ergebnis der Issue-Kette: **Analyse-Issues → Planbausteine pro Schicht → TM-Konsolidierung → verify-plan auf Master-Plan → erst dann** Implementierungs-Issues freigeben.

Pflichtsequenz:

`Analyse → Implementierungsplan → verify-plan auf Implementierungsplan → Implementierung`

Ohne abgeschlossene Analyse keine Implementierungs-Issues. Ohne verify-plan auf dem **konsolidierten** Master-Plan keine Code-Umsetzung.

**Anti-Drift:** Vor jedem Planbaustein pruefen: Gibt es ein bestehendes Pattern im Ziel-Layer? Kaiser darf **kein Parallel-Universum** erzeugen — nur Erweiterung der vorhandenen Topic-Contracts, Services, Config-Pipeline, State-Maschinen und UI-Patterns.

---

## 1. Fachliches Zielbild (Praezisierung)

### 1.1 Rolle Kaiser

Der **Kaiser** ist der **Edge-Controller** zwischen **God-Kaiser-Server (El Servador)** und den **ESP32-Geraeten**. Er ist **„nackt“** im Sinne von: **keine eigenstaendige Wahrheit** neben God — die **autoritative Gesamtkonfiguration** kommt **nur vollstaendig von God**. Lokal speichert der Kaiser **Teile** der Logik, **Konflikt-/Kommunikations-Kontext**, **Offline-Rule-Sets fuer zugeordnete ESPs** und **Betriebszustand**, damit der Standort **ohne dauerhafte God-Verbindung** weiter bedienbar bleibt (Messung, lokale Anschauung, lokale Konfigurations- und Rule-Anpassungen im erlaubten Rahmen).

**Kernmetapher:** Das System verhaelt sich **wie heute** (ESP gegenueber Server), nur dass der ESP **gegenueber dem Kaiser** arbeitet und der Kaiser **gegenueber God** — mit **zusaetzlicher** Kaiser-Faehigkeit: **Logik und Offline-Rules fuer die ESPs** lokal verwalten und an ESPs ausspielen.

### 1.2 God ↔ Kaiser ↔ ESP

| Ebene | Autoritaet | Speichert / fuehrt | Richtung |
|-------|------------|-------------------|----------|
| **God** | Voll (SSOT) | PostgreSQL, Logic Engine global, Dashboard | Vollstaendige Config-Snapshots / Policy an Kaiser; Ingest aggregierter Telemetrie |
| **Kaiser** | Teil (Edge-Cache + lokale Operatorik) | Lokaler Store, optional lokaler MQTT-Broker, Rule-Cache, Offline-Rules pro ESP | Pull von God bei Verbindung; zu ESPs im Feld; bei God-Ausfall: definierte Degradation |
| **ESP** | Geraet | NVS, Sensor/Aktor-Laufzeit | Wie heute, aber MQTT-Pfad unter `kaiser/{kaiser_id}/esp/{esp_id}/...` wenn Kaiser zugeordnet |

ESPs koennen einem Kaiser zugeordnet werden: **ueber den Kaiser** steuerbar und messbar **ohne** dass der Hauptserver dauernd erreichbar sein muss — innerhalb der lokal synchronisierten Policy und des letzten gueltigen God-Snapshots.

### 1.3 Raspberry Pi Zero — eigene Sensor/Aktoren an GPIO

Der Kaiser soll **zusaetzlich** zur Relay-Rolle **eigene** Sensoren und Aktoren an **GPIO des Pi** konfigurieren koennen — funktional vergleichbar der ESP-Umgebung (Pin-Mapping, Typ, Kalibrierung, Grenzen), technisch aber als **eigenes Domain-Objekt** (z. B. Device-Klasse `kaiser_host` / `edge_sensor_host`) das **dieselben** Server-Patterns nutzt (SensorType-Registry, Config-Builder, Validierung), **kein** Ad-hoc-Skript.

Das ist **Pflicht** als eigenes Issue-Buendel (Epic E) inkl. Topics, DB, API, Frontend (Pattern-Reuse, keine falschen Views).

### 1.4 DB- und State-Sync bei Verbindungsaufbau (P0-Thema)

Bei **Kaiser ↔ God** Reconnect: **idempotent**, **versionsgefuehrt**, **konfliktfest** definieren:

- SSOT auf God vs lokal erlaubte Divergenz (Offline-Edits)
- Schema-/Config-/Rule-Revisions, ESP-Zuordnungen
- **Kein Doppel-Ingest** derselben Messung auf God (ESP → Kaiser → God)
- Lifecycle (Loeschen/Archiv) ueber Sync-Grenzen

---

## 2. IST-Anker (im Code verifizieren, nicht nur aus Doku)

Folgende Planungsannahmen sind laut Architektur-Doku **vorbereitet** — du musst sie im Repo **belegen** (Datei + Zeile/Stub):

- MQTT-Topic-Schema enthaelt `kaiser_id` und `esp_id`: `kaiser/{kaiser_id}/esp/{esp_id}/...`
- Tabelle / Modell `kaiser_registry` (Stub)
- MQTT `KaiserHandler` (Stub) in der Handler-Landschaft
- Skalierungsziel: Kaiser als Pi mit lokalem MQTT und Pull-Config von God

**Pattern-Pflicht aus bestehendem System:** SafetyService fuer Aktoren auf God-Seite; Heartbeat/Session/Handover; Config-Push / `config_response` / Pending-State — Kaiser-Konzept muss **einpassen** oder eine **explizite** Compatibility-Schicht definieren (kein stiller Doppelweg).

---

## 3. Lieferobjekte (TM)

### 3.1 Analyse

`docs/analysen/ANALYSE-kaiser-edge-relay-ist-soll-sync-2026-04-24.md`

Mindestens: IST, SOLL, Sync-Modell, Risiko-Register, offene Entscheidungen mit Blocker-Markierung.

### 3.2 Linear-Projekt

- Name-Vorschlag: `Kaiser Edge-Relay — Vorplanung & Implementierungsplan (2026-Q2)`
- **>= 20** Issues, **6 Epics** (Analyse/Contracts; God↔Kaiser Sync; Kaiser↔ESP; Pi-Laufzeit; Pi-GPIO Hosting; verify-plan)
- Jedes Issue: Pflichtkopf (Owner, Ausfuehrer-Agent, Deadline, Done-Kriterium, Blocker) gemaess `.claude/reference/TM_WORKFLOW.md`

### 3.3 Master-Plan

`docs/analysen/IMPLEMENTIERUNGSPLAN-kaiser-edge-relay-master-2026-04-24.md` nach Agenten-Planbausteinen, TM-Konsolidierung und **verify-plan**.

---

## 4. Epics und Issue-Cluster (Vorschlag — du verfeinerst)

**Epic A — Erstanalyse & Contracts:** Topic-Audit; `kaiser_registry`; KaiserHandler; ESP-Zuordnung; Frontend-Hierarchy.  
**Epic B — God ↔ Kaiser:** TLS/Auth; Sync-Protokoll Snapshot/Delta/Revision; Konfliktgraph; Observability/Correlation.  
**Epic C — Kaiser ↔ ESP:** Routing ohne Doppel-Payload; Offline-Rules wie NVS-Semantik; Handover God-direct vs Kaiser; Fail-Safe bei God-Ausfall.  
**Epic D — Pi Laufzeit:** Service-Architektur; lokale Persistenz; Pi Zero Backpressure.  
**Epic E — Pi GPIO Sensoren/Aktoren:** Domain-Modell; Ingest-Topics; Safety/Approval bei God offline; Frontend-Konfiguration mit bestehenden UI-Disziplinen.  
**Epic F — verify-plan & Freigabe:** Gate auf Master-Plan; danach Implementierungs-Issues splitten.

---

## 5. Agenten-Prompt-Contract (Pflicht je Issue)

Ziel (1 Satz); In/Out Scope; Evidenzpfad; Artefakt; Abbruchregel; verify-plan Gate (einheitlich z. B. `B-KAISER-..-01..04`).

---

## 6. Nicht-Ziele

Kein Produktions-Rollout; kein LogicEngine-Refactor ohne Kaiser-Bezug; keine breaking Topic-Aenderungen ohne Migrations-Issue.

---

## 7. Akzeptanzkriterien

- [ ] Analyse-MD mit Code-Evidenz
- [ ] Linear-Projekt mit Epics/Issues/Relations wie oben
- [ ] Pi-GPIO als eigenes Buendel
- [ ] Sync/Reconnect als P0-Buendel
- [ ] Master-Plan nach verify-plan
- [ ] Keine Implementierungs-Issues vor Gate-Freigabe
