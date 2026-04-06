# Auftrag: End-to-End-Analyse Integrationsluecken — El Servador (Server)

**Datum:** 2026-04-05  
**Typ:** Analyse (IST-Luecken inventarisieren, priorisieren, messbar machen; kein Fix-Zwang)  
**Zielgruppe:** Backend-/MQTT-Agent / Entwickler mit Vollzugriff auf dieses Repository

---

## 1. Ziel und Gesamtkontext

Der Server ist **Integrations-Gate** zwischen MQTT-Geraeten und API/WebSocket/DB. Integrations-Spezifikationen fordern: **kanonische** Normalisierung eingehender Events, **Terminal-Autoritaet** (kein Ueberschreiben finaler Wahrheit durch stale Duplikate), **Correlation-first** Matching, **sichtbare** Contract-Verletzungen (Metriken + Datenmodell), und **Reconciliation** als nachvollziehbare Session.

Dieser Auftrag analysiert **nur Server-Code und zugehoerige Tests**, aber immer mit Blick darauf, **was Firmware sendet** (Feldlage, fehlende Korrelation, intent_outcome) und **was Frontend konsumiert** (WS-Shape, Terminalitaet, Operator-Sicht).

---

## 2. Fachlicher Rahmen (eingearbeitet)

**Kanonisierung:** Module wie `device_response_contract`, `intent_outcome_contract`, `system_event_contract` wandeln Roh-Payloads in **stabile** interne Darstellung um, inkl. Alias-Mapping und `CONTRACT_UNKNOWN_CODE` bei Verletzungen.

**Correlation:** Spez-Idee: fachlicher Match nur ueber **`data.correlation_id`**. IST im Server: haeufig **`payload.get("correlation_id")`** plus **synthetische** Platzhalter (`missing-corr:…`) bei fehlender Korrelation, mit Zaehlung als Contract-Issue. Die Analyse soll klarstellen, ob das eine **bewusste Migrationsbruecke** ist oder die strikte Spez bereits verletzt — und welche **Nebenwirkungen** (Dedup, UI-Finalisierung, KPIs) entstehen.

**Terminal authority:** `upsert_terminal_event_authority` und verwandte Pfade sollen **Stale-Duplikate** blockieren. Zu pruefen: konsistente Anwendung ueber Config-, Aktor- und Intent-Outcome-Pfade sowie korrekte Metriken (`contract_terminalization_blocked`).

**Reconciliation:** `subscriber.replay_pending_events` ergaenzt Payloads mit `_reconciliation` (Session, Phase, Position, Zeit). Zu pruefen: ob **Ende-Zustaende** serverseitig eindeutig sind und ob Luecken bestehen zwischen „MQTT connected“ und „Session completed“.

---

## 3. Analyse-Bereiche (Pflicht)

### Bereich A — MQTT-Ingress und Routing

**Fragen:**  
- Vollstaendiger Pfad von Topic-Eingang bis Handler: wo geht Payload verloren, wo wird still geschluckt?  
- Welche Handler nutzen **keine** Canonicalization-Schicht?

**Deliverable:** Tabelle „Topic-Pattern → Handler → canonical ja/nein → Violation-Metrik ja/nein“.

---

### Bereich B — Device-Response-Contract (Config / Aktor)

**Fragen:**  
- `canonicalize_config_response` / `canonicalize_actuator_response`: welche Alias-Felder existieren, wo ist `terminality`/`retry_policy` unvollstaendig?  
- Wie wird fehlende `correlation_id` behandelt — inkl. Auswirkung auf **DB-Schluessel**, WS-Events und Frontend-`findIntentByCorrelation`.

**Deliverable:** IST-Beschreibung der Korrelationsstrategie + Abstand zur Spez „kein synthetischer Schlüssel“.

---

### Bereich C — Intent-Outcome-Pipeline

**Fragen:**  
- `intent_outcome_handler`: vollstaendige Abbildung auf internes Modell, Dedup, `_reconciliation`-Durchreichung.  
- Konsistenz mit `FINAL_OUTCOMES` und Filterung unbekannter Codes.

**Deliverable:** Liste der Edge-Cases (fehlende Felder, doppelte finals, out-of-order).

---

### Bereich D — System-Events und Sonderpfade

**Fragen:**  
- `system_event_contract` und Verknuepfung mit `CONFIG_PENDING_AFTER_RESET` und verwandten Zustaenden.  
- `lwt_handler`, `diagnostics_handler`: Contract-Verzweigungen, Broadcast-Shape, Fehler bei fehlenden Pflichtfeldern.

**Deliverable:** „Operator-sichtbare“ vs. „nur Log/Metrik“-Pfad-Matrix.

---

### Bereich E — Persistenz und Terminal-Autoritaet

**Fragen:**  
- `command_contract` Models + `command_contract_repo`: Generation/Seq-Logik, Indizes, Race bei parallelen MQTT-Nachrichten.  
- `upsert_terminal_event_authority`: welche Event-Klassen sind abgedeckt, welche nicht? Wann wird `was_stale` ausgeloest und wie propagiert das nach aussen?

**Deliverable:** Risiko-Liste fuer Inkonsistenz zwischen DB-Wahrheit und letztem MQTT-Event.

---

### Bereich F — Reconciliation / Replay

**Fragen:**  
- `replay_pending_events`: Session-Lifecycle, Idempotenz, Fehlerbehandlung, Metriken `reconciliation_sessions_total`.  
- Abgleich: kann ein Client aus **Events allein** unterscheiden „running“ vs. „completed“ vs. „failed“? Wo fehlt ein Signal?

**Deliverable:** Textuelles Sequenzdiagramm Server-intern + Lueckenmarkierung gegenueber Firmware-Signalen.

---

### Bereich G — API, WebSocket, Serialisierung

**Fragen:**  
- `serialize_config_response_event`, `serialize_intent_outcome_row` und verwandte Serializer: garantieren sie **stabile** Feldnamen fuer das Frontend?  
- Gibt es Legacy-Fallbacks, die **doppelte** Wahrheiten erzeugen (`raw` vs. kanonisch)?

**Deliverable:** Liste der Legacy-Pfade mit Empfehlung „behalten / deprecate“ (nur Analyse, keine Aenderungspflicht).

---

### Bereich H — Metriken, Observability, Tests

**Fragen:**  
- `metrics.py`: welche Contract-/Reconciliation-Metriken existieren, welche Szenarien aus A–G sind **nicht** metrisch sichtbar?  
- Tests: `test_contract_ingress_matrix_t1_t6`, `test_mqtt_subscriber_replay`, Websocket-Correlation-Tests — decken sie die **aktuellen** IST-Pfade ab? Fehlt Coverage fuer „fehlende correlation_id“ und synthetische IDs?

**Deliverable:** Coverage-Luecken + Vorschlag fuer **zwei** zusaetzliche Test-Szenarien (nur Beschreibung).

---

## 4. Methodik

1. Von **MQTT subscriber** aus nach unten und seitwaerts zu Handlern und Repositories arbeiten.  
2. Pro Bereich: **IST in 5–10 Zeilen**, dann **Luecken** mit P0/P1/P2.  
3. Querpruefung: ein fiktiver Ablauf „Config-Push mit correlation X, dann Parse-Fail auf Geraet, dann spaeteres Outcome“ — wird der Server **ohne** Luecken konsistent?

---

## 5. Abnahmekriterien

- Bereiche A–H vollstaendig; keine leeren Abschnitte ohne Begruendung.  
- Explizite Antwort auf die Kernfrage: **Ist `data.correlation_id` als Kanon umsetzbar**, oder muss die Spez dem IST (top-level + Synthese) folgen?  
- Mindestens **drei** konkrete P0/P1-Luecken mit Datei- und Funktionsnamen.  
- Reconciliation-Abschnitt enthaelt **klare** Done-/Not-Done-Kriterien aus Server-Sicht.

---

## 6. Explizit ausgeschlossen

- Firmware oder Frontend aendern.  
- Broker- oder Infra-Umstellung.  
- Produktions-Deployments.

---

## 7. Erwartetes Ergebnisformat

Ein Markdown-Bericht:

1. Executive Summary  
2. Bereiche A–H  
3. Cross-Layer-Schnittstellenliste (max. 10 Zeilen): „Firmware sendet X / Server erwartet Y / Luecke Z“  
4. Empfohlene Server-Folgeauftraege (kurz, optional)
