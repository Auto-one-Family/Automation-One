# Analyseauftrag: Epic 1 — Vertrag und Korrelation (vollständige Ist-Verdrahtung)

**Datum:** 2026-04-05  
**Typ:** Reine **Analyse** und **Ist-Dokumentation**. **Keine** Code-Änderungen, **keine** Refactors, **keine** neuen Features.  
**Code-Wurzel:** `El Servador/god_kaiser_server/` (relativ zum Auto-One-Repo-Root).

---

## 1. Ziel

Ein **einziges konsolidiertes Ergebnisdokument** liefern, das für den Scope **Epic 1** alle **Komponenten**, **Datenfelder**, **Aufrufketten** und **Nebenkanäle** so abbildet, wie sie **heute im Code** verdrahtet sind. Daraus soll später die Umsetzung (Fixes, Contract-Härtung) planbar sein — dieser Auftrag **endet** bei der vollständigen Ist-Landkarte.

**Epic-1-Scope (aus der konsolidierten Server-Roadmap):**

| Roadmap-ID | Thema |
|------------|--------|
| **K1** | `MQTTCommandBridge.resolve_ack` — Korrelation vs. FIFO-Fallback (Zone/Subzone). |
| **I1** | Logic-**Priorität**: API-Schema/OpenAPI-Text vs. Laufzeit (`ConflictManager`, Repository-Sortierung). |
| **M1** (nur Teil **Korrelation / Terminalität / Persistenz**) | Tabellen und Services rund um **Command-Intent**, **Command-Outcome**, **terminal authority** — was existiert, welche Felder, welche Übergänge sind im Code wirklich modelliert. |
| **C2** | **Finalität**: HTTP-Response vs. asynchrones MQTT-ACK (Actuator-Command, Zone/Subzone). |
| **H2 / K2** | **REST Actuator-Command**: welche IDs kommen zurück, welche nicht; `acknowledged`; Bezug zu WS-Events. |
| **K3** | **Emergency**: welche `correlation_id`-/`incident`-Felder wo gesetzt werden; MQTT-Payload GPIO-Strom vs. Broadcast. |

**Abgrenzung — explizit nicht Teil dieses Auftrags:**

- Firmware (El Trabajante) außerhalb dieses Repos.  
- Frontend (Vue) außerhalb dieses Repos — höchstens **Verweis**, welche **Server-API/WS-Felder** der Client erwarten könnte, ohne Frontend-Code zu lesen.  
- Health/Readiness (Epic 2), MQTT `sensor/batch` (Epic 3), allgemeine Referenz-Sync-PRs (Epic 5).  
- **Implementierung** von Korrekturen: erst **nach** Abnahme dieses Analyseberichts.

---

## 2. Ergebnisdatei (Pflicht)

**Ablage (im Auto-One Repo, wählbar eine Variante):**

- `El Servador/god_kaiser_server/docs/analyse/` **oder**  
- `.claude/reports/current/server-analyse/`

**Dateiname:**

`report-server-epic1-ist-vertrag-korrelation-verdrahtung-2026-04-05.md`

Der Bericht muss **ohne** Zugriff auf andere Repos oder externe Notizen verständlich sein (alle relevanten Begriffe und Regeln im Text).

---

## 3. Methodik

1. **Code als alleinige Wahrheit:** Jede Aussage im Bericht mit mindestens einem **Codeanker** `Pfad:Zeile` oder `Pfad:Funktion` (bei großen Dateien: Funktionsname + Zeilenrange).  
2. **Keine Vermutungen:** Wo Semantik unklar ist, Abschnitt „**Unklar / widersprüchlich**“ mit konkreten Stellen.  
3. **Trace-first:** Pro Hauptpfad eine nummerierte Kette: Einstieg → Service → MQTT/DB → WS/HTTP.  
4. **Tabellen:** Felder in Payloads, DB-Spalten (nur was für Korrelation/Finalität relevant ist), Response-Schemas.

---

## 4. Arbeitspakete (Pflichtlieferungen im Bericht)

### AP-A — Actuator-Command: REST → MQTT → Response → DB → WebSocket

**Erfassen:**

- Endpoint(s) in `api/v1/actuators.py` für normalen Command und alle Varianten (inkl. relevante Query/Body-Felder).  
- `ActuatorService.send_command`: Erzeugung und Weitergabe von **`correlation_id`**; No-Op-Delta; Publish-Pfad.  
- `mqtt/publisher.py`: welche Felder landen im **MQTT-Payload** (vollständige Schlüsselliste aus Code).  
- Response-Schema (`schemas/actuator.py` o. ä.): **`ActuatorCommandResponse`** — jedes Feld mit Quelle im Handler; insbesondere **`acknowledged`**, **`command_sent`**, **`safety_warnings`**, fehlende **`correlation_id`**.  
- Eingehend: `mqtt/handlers/actuator_response_handler.py` — Matching zu History/Contract; Fallback-Keys wenn `correlation_id` fehlt; **`canonicalize_actuator_response`**.  
- Ausgehend WS: Event-Typ und Payload-Schlüssel für `actuator_command`, `actuator_command_failed`, `actuator_response`.  

**Deliverable:** Ein **Sequenzdiagramm (Text oder Mermaid)** „REST POST … → … → MQTT → … → WS“ plus Tabelle **Feld | gesetzt wo | sichtbar wo**.

---

### AP-B — Emergency-Stop: REST → Safety → MQTT → Audit/WS

**Erfassen:**

- `POST …/emergency_stop` (und ESP-spezifische Variante falls vorhanden): Reihenfolge `SafetyService` → pro-GPIO-Publish → Broadcast → Audit.  
- Ob **`correlation_id`** in **MQTT** für GPIO-Commands gesetzt wird oder nur **`incident_correlation_id`** in Logs/Metadata — mit Zeilenbeleg.  
- Verbindung zu **`actuator_response`** / History-Einträgen nach Emergency.  

**Deliverable:** Gleiche Struktur wie AP-A; eigener Abschnitt „**Emergency vs. normaler Command**“ mit Diff-Tabelle.

---

### AP-C — Zone- und Subzone-Zuweisung mit ACK-Warten (`MQTTCommandBridge`)

**Erfassen:**

- `services/mqtt_command_bridge.py`: **`send_and_wait_ack`**, interne Datenstrukturen (Maps, Keys), **Timeout**.  
- **`resolve_ack`**: exakte Strategie **1)** `correlation_id` aus ACK-Payload **2)** FIFO pro `(esp_id, command_type)` — Zeilenrange und Bedingungen, wann Fallback greift.  
- Aufrufer: `ZoneService` / `SubzoneService` / Router — wer übergibt welche `correlation_id` beim Senden?  
- Handler: `zone_ack_handler.py`, `subzone_ack_handler.py` — welche Felder aus MQTT gehen in `resolve_ack`?  

**Deliverable:** **Zustandsdiagramm** oder Tabelle „**pending Future** → **resolve** → **API entblockt**“; explizite Antwort auf die Frage: **Unter welchen Bedingungen kann ein ACK dem falschen HTTP-Request zugeordnet werden?** (nur beschreiben, nicht fixen).

---

### AP-D — Intent-Outcome und Lifecycle (MQTT → Persistenz → WS → API)

**Erfassen:**

- Registrierung in `main.py`: Topic-Pattern → Handler.  
- `intent_outcome_handler.py`: Pflichtfelder, synthetische `correlation_id`, Dedup/stale, Schreibziele (`CommandContractRepository`, Audit).  
- `intent_outcome_lifecycle_handler.py`: gleiches.  
- `services/intent_outcome_contract.py` (oder gleichwertig): **`CANONICAL_OUTCOMES`**, **`FINAL_OUTCOMES`**, Flow-Normalisierung.  
- DB-Modelle `command_intents` / `command_outcomes` (Dateinamen unter `db/models/`, relevante Spalten für `intent_id`, `correlation_id`, `generation`, `seq`, Terminalität).  
- `CommandContractRepository`: öffentliche Methoden, die Intent/Outcome/LWT/Config/Actuator-Response verbinden — **kurze API-Liste** mit einem Satz Semantik je Methode (aus Docstrings/Code).  
- REST **read-only** `intent-outcomes` Router: welche Filter, welche Felder in der Response.  
- WS: `intent_outcome`, `intent_outcome_lifecycle` — Producer und minimale Payload-Skizze aus Code.  

**Deliverable:** Diagramm „**Topic → Handler → Tabellen → WS/API**“; Tabelle **outcome-Wert | als final behandelt? | wo entschieden**.

---

### AP-E — Config-Antwort und „terminal authority“ (Querschnitt zu M1)

**Erfassen:**

- `config_handler.py`: `canonicalize_config_response`, `upsert_terminal_event_authority`, stale early-return.  
- `lwt_handler.py`: Rolle bei terminal authority (Kurz).  
- Beziehung zu Intent-Outcome (nur wo im Code gekoppelt).  

**Deliverable:** Abschnitt „**Config/LWT vs. Intent-Outcome**“ — eine Seite, keine Romanlänge.

---

### AP-F — Logic-Priorität: Schema vs. Laufzeit (I1)

**Erfassen:**

- `schemas/logic.py` (oder Pydantic-Modelle für Rule Create/Update): **exakter** Feld-`description`-Text zu **`priority`**.  
- `db/repositories/logic_repo.py`: **`order_by`** für geladene Regeln — Spalte, **ASC/DESC**, Kommentar im Code.  
- `services/logic/safety/conflict_manager.py`: Regel, welche Priorität gewinnt (Zitat oder Paraphrase mit Zeilenbeleg).  
- `logic_engine.py`: Nutzung von `rule_priority` / Konfliktauflösung an einer Stelle belegen.  

**Deliverable:** Tabelle **Quelle | Aussage „höhere Priorität = …“** — wenn Widerspruch: Zeile „**Widerspruch bestätigt**“ mit allen drei Ankern.

---

### AP-G — Finalität und Client-sichtbare Zustände (C2, Kreuzcheck)

**Erfassen:**

- Für **Actuator**, **Zone**, **Subzone**: Was bedeutet HTTP **2xx** jeweils (nur Server-seitig erledigt vs. wartet auf MQTT)?  
- Welche **kanonischen** Nachweise für „Gerät hat bestätigt“ existieren (MQTT-Topic + Handler + DB-Tabelle/Spalte)?  
- Liste aller Stellen, an denen **`acknowledged`** oder äquivalente Flags gesetzt werden.  

**Deliverable:** **Matrix** „Pfad | HTTP bedeutet | Finalität beweisbar über … | asynchroner Kanal“.

---

## 5. Abnahmekriterien (hart)

Der Bericht `report-server-epic1-ist-vertrag-korrelation-verdrahtung-2026-04-05.md` ist **abgenommen**, wenn:

1. **Alle** Arbeitspakete **AP-A** bis **AP-G** eigene Unterkapitel haben und **vollständig** sind (kein „TODO“).  
2. Jede **behauptete** Verdrahtung mindestens **einen** Codeanker hat; fehlende Verdrahtung explizit „**nicht implementiert**“ heißt.  
3. **K1** und **FIFO** sind in **AP-C** mit **konkreter** Zeilenreferenz auf `resolve_ack` beantwortet.  
4. **I1** ist in **AP-F** mit **mindestens zwei** widersprüchlichen Quellen **oder** eindeutig als „kein Widerspruch“ mit Beleg abgeschlossen.  
5. **M1-Teil:** Tabelle existierender **Persistenz** für Intents/Outcomes + Satz „**ob** eine explizite Zustandsmaschine `accepted|sent|ack_pending|…` im Code vorkommt“ — **Ja/Nein** mit Fundstelle oder „**Nein**, nur fragmentarisch über …“.  
6. **C2 / H2 / K2 / K3** sind in **AP-A**, **AP-B**, **AP-G** abgedeckt, ohne Widerspruch zwischen den Abschnitten.  
7. Am Ende: **Inventarliste** aller **berührten Dateien** (sortiert, vollständiger Pfad ab `god_kaiser_server/src/`).

---

## 6. Empfohlener Agent / Rolle

- **Lesend / analytisch:** Backend-spezialisierter Agent (z. B. `server-debug` oder gleichwertig).  
- **Kein** automatisches Formatieren des Produktivcodes; nur der **Markdown-Bericht** ist Ausgabe.

---

## 7. Kurzfassung für den Ausführenden (Copy-Paste)

> Lies den Code unter `El Servador/god_kaiser_server/` und erstelle **nur** den Markdown-Bericht `report-server-epic1-ist-vertrag-korrelation-verdrahtung-2026-04-05.md` gemäß Analyseauftrag vom 2026-04-05. Scope: Epic 1 (Korrelation, Finalität, MQTTCommandBridge, Intent/Outcome-Persistenz, Logic-Priorität Schema vs Runtime). **Keine Code-Änderungen.** Jede Aussage mit Codeanker. Abnahme nach Abschnitt 5 des Auftrags.

---

*Ende Analyseauftrag Epic 1.*
