# Kaiser Edge-Relay — IST / SOLL / Sync-Modell (TM-Erstanalyse)

> **Version:** 1.0 | **Erstellt:** 2026-04-24 | **Modus:** Code-verankert (Auto-one-Repo)  
> **Owner (Auftrag):** Robin Herbig | **Ausführung:** Technical Manager (Meta-Orchestrierung, keine Produkt-Implementierung in diesem Schritt)  
> **Nicht-Ziel:** Fertiger Edge-Kaiser-Build; vielmehr Lagebild + Entscheidungs- und Planungsunterlage.  
> **Linear-Projekt:** [Kaiser Edge-Relay — Vorplanung & Implementierungsplan (2026-Q2)](https://linear.app/autoone/project/kaiser-edge-relay-vorplanung-and-implementierungsplan-2026-q2-3308e7b8cd67) (Epic A–F, u. a. AUT-135 … AUT-163)

---

## 1. Executive Summary

Im Repo ist die **Kaiser-Dimension in MQTT, DB und Teilen der Applikation bereits vorgeseint**: `kaiser_id` erscheint in Topic-Patterns, `ESPDevice.kaiser_id`, `KaiserRegistry` (Tabelle `kaiser_registry`) und `KaiserService` (Hierarchie, God-Knoten). **Ein getrennter `KaiserHandler` im MQTT-Layer existiert nicht**; stattdessen registriert `main.py` Wildcards `kaiser/+/esp/...` und routet in die bestehenden ESP-orientierten Handler. Ein **eigenständiger “Edge-Kaiser”-Laufzeitprozess** (Pi) mit God-Sync, lokalem Store und ggf. eigenem Broker ist **nicht implementiert** — das SOLL dieses Dokuments füllt die Lücke architektonisch auf.

---

## 2. IST — Code und Artefakte (Evidenz)

### 2.1 MQTT-Topic-Schema

- **Kanonsiches Muster (Doku + Code):** `kaiser/{kaiser_id}/esp/{esp_id}/...`  
- **Beleg Builder/Parsing:** `El Servador/god_kaiser_server/src/mqtt/topics.py` — u. a. `parse_sensor_data_topic` mit Pattern `kaiser/([a-zA-Z0-9_]+)/esp/...` (jede alphanumerische `kaiser_id` wird geparst).  
- **Subscriber-Registrierung (WP6 Multi-Kaiser):** `El Servador/god_kaiser_server/src/main.py` ab ca. Zeile 257 — Handler für `kaiser/+/esp/+/sensor/+/data`, Heartbeat, `config_response`, LWT, `intent_outcome`, u. a.; **kein** separates Modul `kaiser_handler.py` unter `mqtt/handlers/` (vgl. `handlers/__init__.py`).  
- **Referenz-Doku:** `.claude/reference/api/MQTT_TOPICS.md` — Quick-Lookup listet derzeit faktisch `kaiser_id = "god"` als produktiven Standard; erweiterte Multi-Kaiser-Nutzung ist schema-seitig aber vorbereitet (Wildcard).  
- **Hinweis Architektur-Diagramm:** `.claude/auftraege/Auto_One_Architektur/Diagramme/server-architektur.svg` erwähnt u. a. „Kaiser“ und „MQTT-Handler: 13 (12 aktiv + 1 Stub)“; der **Ist-Zustand in `main.py` ist reicher an registrierten Patterns** (Mock-Handler, `broadcast`, Metriken). Die „Stub“-Bezeichnung ist eher **Kaiser-Steuerkanael God↔Edge-Kaiser** (noch fehlend), nicht unbedingt ein fehlendes Python-File namens `KaiserHandler`.

### 2.2 Datenbank: `kaiser_registry` und Beziehungen

- **Modelle:** `El Servador/god_kaiser_server/src/db/models/kaiser.py`  
  - `KaiserRegistry` → `__tablename__ = "kaiser_registry"` (Felder: `kaiser_id`, `zone_ids` JSON, `status`, `capabilities`, …).  
  - `ESPOwnership` mit FK auf `kaiser_registry.id`.  
- **Repository / Service:** `db/repositories/kaiser_repo.py`, `services/kaiser_service.py` — u. a. `ensure_god_kaiser()`, `get_hierarchy(kaiser_id)`, Zone-Sync für `kaiser_id == "god"`.  
- **Bewertung:** Kein reiner “Stub-Table-Only” — Tabelle und Services sind **angelegt**; Lücken betreffen **echte Edge-Knoten** (registrieren, heartbeats, Sync).

### 2.3 ESP → Kaiser-Zuordnung

- **ESP:** `ESPDevice.kaiser_id` in `db/models/esp.py` (Dokustring: zugeordneter Kaiser).  
- **API/Schemas:** `schemas/esp.py` enthält u. a. `AssignKaiserRequest` / `AssignKaiserResponse` (Grep-Referenz; Detail-Analyse: Linear **AUT-146**).

### 2.4 Frontend

- `HierarchyTab.vue` → `GET /v1/kaiser/god/hierarchy` (Kaiser-Root sichtbar).  
- `types/index.ts`, `api/esp.ts`, `stores/esp.ts`, `MqttTrafficTab.vue` — `kaiser_id`-Felder bzw. Default `god` (Detail: **AUT-145**).

### 2.5 Firmware (ESP32)

- `TopicBuilder` / `setKaiserId` — CHANGELOG & `Hierarchie.md`: ESP kommuniziert unter `kaiser/{kaiser_id}/esp/{esp_id}/...`; Umschalten des `kaiser_id` erfordert u. a. Reconnect (siehe CHANGELOG “subscriptions not automatically updated”).

### 2.6 Strategie-Diagramm (Auto-one)

- `docs/...` / `.claude/auftraege/.../kaiser-relay-skalierung.svg` — Skalierungsbild **God → Kaiser → ESP** (Pull-Hierarchie, Stand 2026-04-07), konsistent mit Produkvision in `Hierarchie.md`.

---

## 3. SOLL — Zielarchitektur God ↔ Kaiser ↔ ESP

| Ebene | Autorität | Persistenz / Rolle | Datenrichtung (vereinfacht) |
|--------|-----------|-------------------|-----------------------------|
| **God (El Servador + PG)** | Voll (SSOT) | Zentrale DB, Logic Engine, Dashboard | Pusht vollständige Config-Snapshots / Policies an Kaiser; konsumiert aggregierte Telemetrie |
| **Kaiser (Edge, Pi-Familie)** | Teil (Edge-Cache, Operatorik) | Lokaler Store (Konzept: siehe offene Entscheidung), optional lokaler Broker / Bridge | Pull von God; Push/Pull zu ESPs; bei God-Ausfall: **definierte Degradation** (nur zuvor abgesicherte Regeln / Fail-Safe) |
| **ESP** | Gerät | NVS, Laufzeit | Wie heute Heartbeat, Config, Sensoren, Aktoren — **MQTT-Pfad** unter dem dem Gerät zugewiesenen `kaiser_id` |

**Kern:** Verhalten **wie heute (ESP “gegen” Server)**, mit Zwischenstation Kaiser: `ESP ↔ Kaiser` spiegelt semantisch `ESP ↔ God`, zuzüglich **lokaler Rule-/Policy-Cache** und begrenzter Autonomie.

---

## 4. Deploy-Varianten — Entscheidungsmatrix (Brücke / Broker)

| Option | Beschreibung | Vorteile | Risiken / Kosten |
|--------|--------------|----------|------------------|
| **A — Zentraler Broker only** | ESP und Kaiser hängen am gleichen (God-nahen) Mosquitto; Kaiser ist rein logischer / REST-Client | Einfachste Netz-Topologie; kein Bridge-Code | WAN-Abhängigkeit; Offline-Standort schwieriger |
| **B — Lokaler Broker am Kaiser + Bridge zu God** | Standort autark bis zum Edge; Bridge sync’t nur relevante Topics/Namespaces | Besseres Offline-Profil | Bridge muss Doppel-Ingest, ACL und Ordering verhindern (P0) |
| **C — Hybride ACL** | ESP nur am lokalen Broker; Kaiser-Bridge Richtung God mit fester Uplink-Policy | Kontrolle pro Standort | Betrieb/Monitoring komplexer |

**Empfehlung (Vorab):** Option **B** für das im Auftrag beschriebene “Standort offline bedienbar” Ziel; **A** reicht als Übergang/Testzelle. **Endgültige Wahl = Blocker** für Implementierungs-Scope (laut TM-Pflicht: erst nach Analyse-Abnahme).

---

## 5. Sync-Modell (Reconnect God ↔ Kaiser)

### 5.1 Single Source of Truth (SSOT)

- **Auf God:** vollständige Device-/Zone-/Config-/Policy-/Regel-Revisionen, Audit, Safety-Definitionen, die “hart” zentral bleiben sollen.  
- **Auf Kaiser:** nur **lizensierte** Ausschnitte: letzter gültiger God-Snapshot-Stand + explizit erlaubte Offline-Regeln + lokalen Operator-Änderungsqueue bis zur Re-Synchronisation.

### 5.2 Konfliktgraph (Reihenfolge bei Reconnect)

1. **Transport auth** (TLS/MQTT/REST) lebt — identifiziere `kaiser_id` + Session.  
2. **Schema-/Protocol-Version** (Server API, `config_pending`-Semantik, ggf. Kaisermigrationsstand) abgleichen.  
3. **Voll- oder Teilsnapshot** abrufen: Config, Rules, Zonen-Zuordnung, **Safety-Policy-Hashes**.  
4. **Konfliktlage:** merge oder überschreiben gemäß Policy (eingehend: Operator-Edits lokal *vs.* neuer God-Stand) — muss in Epic **B** (AUT-136) ausformuliert werden.  
5. **Downstream-ESP:** Config-Lane, `config_response`, ggf. Handover-Epoch (Vergleich zu AUT-69/Session-Workstreams).  
6. **Ingest-Seite:** Sicherstellen, dass derselbe Messpunkt **nicht doppelt** in God-DB/Logic eingeht (dedupe, `source_relay`, Zeitfenster) — Epic **C** (AUT-137).

**Idempotenz:** jede God→Kaiser-Synchronisation mit monotonen **Revisions-IDs** (pro Ressource oder global) — konkrete Feldnamen aus bestehenden Config-/Intent-Payloads in Plan-Issue **B2 (AUT-148)** verifizieren (grep, keine freien Namen).

### 5.3 Doppel-Ingest (P0)

Risiko: **ESP → Kaiser → God** derselbe Wert doppelt (lokal gespiegelt + Uplink). Gegenmaßnahmen: eindeutige `origin` / `ingest_path` / Dedupe-Key; optional **Kaiser fügt** nur Uplink, God droppt spiegelnden Rücklauf. Ausarbeitung: **C1 (AUT-151)**.

### 5.4 Lifecycle (Löschen/Archiv)

God-definierte Lösch-/Deprovision-Intents müssen **Edge-Cache** und **ESP-Zuweisung** idempotent leeren; siehe Muster `intent_outcome` / `lifecycle` in MQTT-Doku (Referenz, nicht vollständig in diesem Lagebild wiederholt).

---

## 6. Pi-GPIO: „Kaiser als Sensor-Host“ (Soll-Schnitt)

- **Edge-Device-Klasse** (Arbeitsname) `kaiser_device` — anders als `esp32`, aber **dieselbe Domain-Schichten** (Typ-Registry, Validierung, Safety-Grenzen) über Server-Patterns, **nicht** C++-Firmware copy-paste.  
- **Ende-zu-Ende** (Config-Modell, Ingest, UI, Tests) in Epic **E (AUT-139)**, Issues **E1–E4 (AUT-158–AUT-161)**.

---

## 7. Risiko-Register

| ID | Prio | Risiko | Mitigation (Plan-Ebene) |
|----|------|--------|-------------------------|
| R1 | P0 | Doppel-Ingest / doppelte Logic-Auslösung | C1, B2, dedupe-Contract |
| R2 | P0 | Safety: unauthorisierter Aktor-Öffnungsbefehl am Edge bei God down | C4, E3, Policy-Matrix |
| R3 | P0 | Split-Brain: zwei Wahrheiten (God + Kaiser) | B3, Revisions, Konfliktpolicy |
| R4 | P1 | AuthZ/TLS/Rotation unklar (Edge-Credentials) | B1 |
| R5 | P1 | Handover- / Session-Mischung (correlation, epoch) | B4, C3, Verweis AUT-69 |
| R6 | P2 | Pi Zero Ressourcen / MQTT-Backpressure | D3, Queue-Druck-Patterns (Referenz `queue_pressure`) |
| R7 | P2 | Drift in Doku/ Diagramm vs. tatsächliche Handler-Zahl | A3, Diagramm-Pflege |

---

## 8. Offene Entscheidungen (mit Empfehlung)

| Thema | Empfehlung (TM) | Wenn unentschieden |
|--------|-----------------|--------------------|
| Broker-Topologie (A/B/C) | B für Offline-Ziel; A für MVP-Testzelle | **Blocker** für Implementierungs-Backlog (Transport-Issues) |
| Lokaler Store am Kaiser | SQLite + klarer Migrations-Runner (Kaiser-eigenes Schema) | **Blocker** für Regel-Cache-Persistenz |
| Umgang mit lokalem vs. God-Rule-Set | Strikte Revisions: lokale Edits in Queue bis Ack | P0 Safety-Risiko (R3) |
| Ingest-Identität `kaiser_device` | Eigener Namespace oder Namespace-Erweiterung + Join-Tabelle, **keine** doppelte `esp_devices`-Zeile pro Messung | **Blocker** E2 |

---

## 9. Nächste Schritte (verbindlich laut TM-Workflow)

1. Agenten-Ausführung der Issues **A1–A5, B1–B4, …** (siehe Linear).  
2. Ergänzung/Verfeinerung: **IMPLEMENTIERUNGSPLAN-kaiser-edge-relay-master-2026-04-24.md** (Konsolidat).  
3. **F1 (AUT-162):** `verify-plan` auf Master-Plan (Gates **B-KAISER-VERIFY-01..04**).  
4. **F2 (AUT-163):** nach GO — Implementierungs-Issues splitten; **kein** Implementierungs-Issue vor F1.

---

## 10. Quellenverzeichnis (Repo, Auswahl)

- `El Servador/god_kaiser_server/src/main.py` (MQTT-Handler-Registrierung)  
- `El Servador/god_kaiser_server/src/mqtt/topics.py`  
- `El Servador/god_kaiser_server/src/db/models/kaiser.py`  
- `El Servador/god_kaiser_server/src/services/kaiser_service.py`  
- `.claude/reference/api/MQTT_TOPICS.md`  
- `Hierarchie.md` (Repository-Root)  
- `.claude/auftraege/Auto_One_Architektur/Diagramme/kaiser-relay-skalierung.svg`  

---

*Ende des Pflichtdokuments (Version 1.0). Anpassungen ausschließlich über Linear-Issues + verify-plan, keine stillen Scope-Sprünge.*
