# Implementierungsplan: Server-Vertragshaertung und finale Outcome-Semantik

**Datum:** 2026-04-03  
**Ausgangsurteil:** No-Go fuer vertraglich finale Semantik  
**Ziel:** Go fuer robuste, durchgaengige, beweisbare Intent-/Outcome-Finalitaet

---

## 1) Zielbild (Definition of Done auf Systemebene)

Der Server gilt als **Go-faehig**, wenn alle folgenden Aussagen gleichzeitig wahr sind:

1. Jeder kritische Command/Config-Intent endet in genau einem terminalen Zustand.
2. `intent_outcome` ist technisch und fachlich durchgaengig verdrahtet (Ingest, Persistenz, WS/API, Audit).
3. Es gibt keine stillen Verluste in kritischen Inbound-Pfaden bei DB-Stoerung.
4. Emergency wirkt atomar: sofortige Aktorwirkung plus harte Safety-Sperrung im selben Transaktionspfad.
5. Runtime-Mode ist explizit modelliert und verhindert false-normal.
6. Frontend trennt sichtbar den Ist-Contract (`accepted|rejected|applied|failed|expired`) und eine davon abgeleitete UI-Sicht (`accepted`, `confirmed`, `final`) mit explizitem Mapping und Kompatibilitaetsphase.
7. Abnahmetests fuer Parallelitaet, Reorder, Timeout, Reconnect und Failure sind bestanden.

---

## 2) Implementierungsstrategie

Umsetzung in drei Stufen:

- **P0 (Blocker schliessen):** harte Semantik- und Safety-Luecken
- **P1 (Belastbarkeit):** Korrelation, Betriebsmodi, Sichtbarkeit, Konsistenzhaertung
- **P2 (Governance/Skalierung):** Versionierung, Testhygiene, Betriebsreife

Freigabeprinzip:

- Kein Start von P1 ohne abgeschlossene P0-Gates.
- Kein Start von P2 ohne stabile P1-Metriken ueber 24h.
- Go erst nach erfolgreichem End-to-End-Abnahmelauf.

---

## 3) P0 - Kritische Blocker (No-Go -> Basis-Go)

## P0.1 Persistierte terminale Command-/Outcome-Statemachine

### Ziel
Von fragmentierter Ereignisspur zu einer eindeutigen, persistierten Single Source of Truth.

### Umsetzung
1. Neue Persistenzentitaeten einfuehren:
   - `command_intent` (intent-level)
   - `command_outcome` (outcome-level, genau ein terminales Ergebnis)
2. Zustandsmodell verbindlich in zwei Ebenen:
   - **Orchestrierungszustand (intern):** `accepted`, `sent`, `ack_pending`
   - **Outcome-Contract (extern, kanonisch in P0/P1):** `accepted`, `rejected`, `applied`, `failed`, `expired`
   - **UI-/Produktionsprojektion (optional):** `confirmed`, `timed_out`, `rolled_back` nur als abgeleitete Sicht mit explizitem Alias-/Mapping-Layer bis zur Vollmigration.
3. Korrelation verpflichtend:
   - `intent_id` (fachlicher Primarschluessel)
   - `correlation_id` (transportnah)
4. Timeout-Worker:
   - pending Intents ueber SLA in `timed_out` ueberfuehren
5. Late-ACK-Regel:
   - nur innerhalb kontrolliertem Reconcile-Fenster akzeptieren
6. Out-of-order-Regel:
   - versions-/generation-basiert veraltete ACKs ignorieren

### Abnahme
- Kein Intent ohne terminalen Zustand.
- Kein doppelter terminaler Zustand pro Intent.
- 1000 parallele Commands ohne Fehlzuordnung.

---

## P0.2 `intent_outcome` End-to-End aktivieren

### Ziel
Outcome-Semantik von "fragmentarisch" auf "kanonisch und systemweit sichtbar" bringen.

### Umsetzung
1. Subscriber-Routing fuer `intent_outcome` verbindlich aktivieren.
   - Ist-Zustand: `kaiser/+/esp/+/system/intent_outcome` ist aktuell nicht als Handler registriert; Aktivierung bleibt daher P0-relevant.
2. Einheitliches Outcome-Schema serverweit:
   - `intent_id`, `correlation_id`, `flow`, `outcome`, `code`, `reason`, `retryable`, `ts`
3. Persistenz:
   - Outcome-Events idempotent speichern (Upsert/Conflict-Policy)
4. WebSocket/API:
   - Outcome als first-class Realtime/Event-Kanal ausgeben
5. Audit:
   - Kritische Outcome-Uebergaenge verpflichtend auditieren

### Abnahme
- Jeder kritische Intent erzeugt mindestens ein Outcome-Ereignis.
- Terminales Outcome in DB, WS und API konsistent sichtbar.

---

## P0.3 Durable Inbound bei DB-Ausfall

### Ziel
Kritische Ingest-Nachrichten gehen bei DB-Circuit-Breaker nicht mehr verloren.

### Umsetzung
1. Inbound-Inbox (durable spool) einfuehren:
   - write-ahead fuer kritische MQTT-Events (sensor/error/config_response/intent_outcome)
2. Verarbeitungspipeline:
   - `ingest -> inbox append -> processing -> commit -> ack/remove`
3. Replay-Worker:
   - nach DB-Recovery geordnet replayen
4. Idempotenz:
   - dedup ueber event hash + source key + timestamp window
5. Backpressure-Grenzen:
   - harte Kapazitaet + Alarmierung + priorisierte Drain-Strategie

### Abnahme
- Bei DB-down keine stillen Drops in kritischen Klassen.
- Nach Recovery replayt Inbox vollstaendig und idempotent.

---

## P0.4 Emergency atomar mit SafetyService koppeln

### Ziel
Emergency darf nie nur "publish only" sein, sondern muss synchron Safety-Sperren setzen.

### Umsetzung
1. Emergency-Endpoint:
   - vor/parallel zum OFF-Dispatch `SafetyService.emergency_stop_all/esp` setzen
2. Clear-Flow:
   - `clear_emergency` nur nach expliziter Freigabelogik und dokumentierter Policy
3. Atomare Sequenz:
   - `set_emergency_flag -> publish off -> audit -> ws`
4. Failure-Policy:
   - wenn Publish fehlschlaegt, Safety-Flag bleibt aktiv
5. Beweisfaehigkeit:
   - eindeutiger Incident-/Correlation-Faden ueber gesamte Emergency-Kette

### Abnahme
- Nach Emergency werden normale Commands garantiert geblockt.
- Clear hebt Sperre nur entlang definierter Recovery-Regeln auf.

---

## P0.5 Contract-Kanonisierung (API/MQTT/WS) als Pflicht-Basis

### Ziel
Drift zwischen Runtime-Code und Vertrags-/Referenzdokumentation eliminieren, damit Folgepakete ohne Mehrdeutigkeit umsetzbar sind.

### Umsetzung
1. REST-Endpunkt-Kanonisierung (verifiziert gegen Runtime):
   - kanonisch: `/api/v1/actuators/emergency_stop`, `/api/v1/actuators/clear_emergency`
   - Referenzstellen mit `emergency-stop`/`clear-emergency` auf Runtime-Pfade anpassen oder explizit als deprecated Alias markieren.
2. Outcome-Vertrag kanonisch festlegen:
   - Ist-Contract bis zur Migration: `accepted|rejected|applied|failed|expired`
   - Ziel-UI-Projektion (`confirmed/final`) nur mit explizitem Mapping-Layer und Sunset-Plan einfuehren.
3. `intent_outcome` Ingest verdrahten:
   - Topic `kaiser/+/esp/+/system/intent_outcome` ist aktuell noch nicht als Handler registriert und muss in den produktiven Handler-Graph aufgenommen werden.
4. WS-Event-Konsolidierung:
   - kanonisch: `notification_new`, `notification_updated`, `notification_unread_count`
   - Legacy `notification` als deprecated dokumentieren (keine neue Feature-Nutzung).
5. API-Flaechen explizit trennen:
   - `/api/v1/zone/*` = Device-Assignment
   - `/api/v1/zones/*` = Zone-Entity-CRUD/Lifecycle
   - Sensor-Data Querys (`/api/v1/sensors/data`, `/api/v1/sensors/data/by-source/{source}`) als unterschiedliche Use-Cases dokumentieren.

### Abnahme
- REST-Referenz entspricht den implementierten Routen ohne Namensdrift.
- Outcome-State-Liste ist systemweit eindeutig (inkl. Mapping-Regeln waehrend Migration).
- `intent_outcome` Topic ist registriert, verarbeitet und testbar.
- WS-Event-Vertrag ist konsistent und ohne Legacy-Mehrdeutigkeit fuer neue Features.
- Zone-/Zones- und Sensor-Data-Schnittgrenzen sind in API/Teamdoku explizit.

---

## 4) P1 - Belastbarkeit und Betriebskonsistenz

## P1.1 E2E-Korrelation in History/Audit/WS vereinheitlichen

### Umsetzung
- `correlation_id` und `intent_id` als Pflichtfelder in History-/Outcome-/Audit-Records.
- Heuristische Zuordnung nur als Fallback mit explizitem `match_confidence`.
- Reporting fuer "unmatched" und "fallback-matched" faelle.

### Abnahme
- 0 unerklaerte Zuordnungen im Standardlastprofil.

---

## P1.2 Runtime-Mode-State-Maschine als first-class Modell

### Umsetzung
- Kanonische States technisch einfuehren:
  - `COLD_START`, `WARMING_UP`, `NORMAL_OPERATION`, `DEGRADED_OPERATION`, `RECOVERY_SYNC`, `SHUTDOWN_DRAIN`
- Transitions mit Guards und Transition-Events instrumentieren.
- Readiness-Freigabe an erweiterte Guards koppeln:
  - inkl. Logic-Liveness, Recovery-Status, zentrale Worker-Gesundheit.

### Abnahme
- Keine false-normal Promotion nach Reconnect.
- Jede Transition ist in Logs/Metriken nachvollziehbar.

---

## P1.3 Health/Readiness haerten

### Umsetzung
- Platzhalterwerte durch echte Runtime-Messwerte ersetzen.
- Readiness erweitert um:
  - LogicEngine aktiv
  - zentrale Worker aktiv
  - kein blockierender Recovery-Restzustand
- Health-Ausgabe mit "degraded reason codes".

### Abnahme
- Health/Ready korreliert reproduzierbar mit realer Betriebsfaehigkeit.

---

## P1.4 Frontend auf terminale Outcome-Semantik migrieren

### Umsetzung
- Store-Modell:
  - **Contract-nah:** `accepted|rejected|applied|failed|expired`
  - **UI-abgeleitet:** `accepted`, `confirmed`, `final`
  - Mapping-Regel verpflichtend:
    - `applied -> confirmed`
    - `failed|expired|rejected -> final`
  - Bis Vollmigration bleiben Contract-Werte in API/WS/Audit kanonisch, UI-Zielwerte sind reine Projektion.
- Realtime-Degraded-Indikator bei WS-Problemen.
- Konfliktregel bei widerspruechlichen Events (status gewinnt final).

### Abnahme
- UI zeigt keine falschen "erfolgreich"-Zustaende ohne finale Bestaetigung.

---

## 5) P2 - Governance, Drift-Kontrolle, Betriebsreife

## P2.1 Schema-Versionierung

### Umsetzung
- `schema_version` fuer kritische MQTT-Payloads verpflichtend.
- Version-Registry mit Kompatibilitaetsmatrix.
- Legacy-Alias-Support mit Sunset-Fenster.

### Abnahme
- Contract-Drift wird bei Build/Test erkannt, nicht erst im Betrieb.

---

## P2.2 Testhygiene und Testtiefe

### Umsetzung
- Warnungsfreie Testausfuehrung als Gate (insb. AsyncMock/await hygiene).
- Ausbau auf Pflichtmatrix:
  - out-of-order ACK
  - duplicate ACK
  - missing CID
  - parallel commands same target
  - reconnect waehrend command/rule
  - DB down/open CB + replay
  - MQTT partition/restore

### Abnahme
- Pflichtmatrix gruen in CI und lokal reproduzierbar.

---

## P2.3 Betriebsmetriken und SLOs

### Umsetzung
- SLOs definieren und monitoren:
  - terminal outcome completion rate
  - unmatched correlation rate
  - replay lag
  - false-normal incidents
  - critical drop count
- Eskalationsstufen und Runbooks verknuepfen.

### Abnahme
- SLOs stabil ueber 7 Tage in realistischem Lastprofil.

---

## 6) Technische Arbeitspakete (Backlog-ready)

## WP-01 Datenmodell & Migrationen
- Neue Tabellen/Felder fuer intent/outcome/Korrelation.
- Indizes fuer `(intent_id)`, `(correlation_id)`, `(state, created_at)`.
- Migrationspfad inkl. Rueckwaertskompatibilitaet.

## WP-02 Service-Layer Refactor
- Zentraler OutcomeResolver.
- Einheitliche Terminalisierung.
- Timeout/Reconcile-Worker.

## WP-03 Messaging-Layer
- `intent_outcome` subscriber/publisher hardening.
- Inbound-Inbox-Adapter fuer DB-down.
- Failure-aware retry/backpressure.

## WP-04 Emergency/Safety Kopplung
- Emergency atomar und policy-gesteuert.
- Safety-Flags + Audit + WS konsistent.

## WP-05 Runtime-State Engine
- State-Objekt + Transition-Guards.
- Health/Ready Integration.

## WP-06 Frontend Contract Update
- Neue terminale States im Store.
- UI-Degraded-Signale.

## WP-07 Testpaket & Chaos-Drills
- Unit/Integration/Failure/Soak.
- deterministische Reproduktionsszenarien.

## WP-08 Observability & Runbooks
- Metriken/Alerts/Dashboards.
- Incident-Routinen fuer P0/P1-Fehler.

## WP-09 Contract- und Referenz-Haertung
- REST-/MQTT-/WS-Referenzen gegen Runtime-Code synchronisieren.
- Deprecated-Markierungen + Sunset-Fenster fuer Legacy-Namen.
- Verbindliche Contract-Checks in Review/CI-Gates aufnehmen.

---

## 7) Reihenfolge und Abhaengigkeiten

1. **WP-01** (Basis)  
2. **WP-02 + WP-03** (parallel moeglich nach Datenmodell)  
3. **WP-04** (nach Service-Grundlage)  
4. **WP-09** (frueh in P0/P1, damit alle Folgearbeiten gegen denselben Contract laufen)  
5. **WP-05** (parallel zu WP-04, aber vor finaler Ready-Logik)  
6. **WP-06** (nach OutcomeResolver stabil)  
7. **WP-07** (laufend, aber harte Gates nach P0/P1-Ende)  
8. **WP-08** (ab P1 startbar, P2 finalisieren)

---

## 8) Test- und Abnahmeplan (Gate-basiert)

## Gate G0 (Ende P0)
- Terminale Statemachine aktiv.
- `intent_outcome` voll verdrahtet.
- DB-down kritische Inbounds nicht still verloren.
- Emergency blockiert Commands hart und reproduzierbar.
- Contract-Kanonisierung abgeschlossen (REST/MQTT/WS ohne Drift in kritischen Flows).

## Gate G1 (Ende P1)
- Runtime-State-Maschine produktiv aktiv.
- Readiness ohne false-normal.
- E2E-Korrelation robust unter Parallelitaet.
- Frontend zeigt terminale Zustandssemantik.

## Gate G2 (Ende P2 / Go)
- Versionierte Contracts aktiv.
- Pflicht-Testmatrix + Chaos-Drills bestanden.
- SLOs stabil.
- Operative Runbooks vorhanden und verprobt.

---

## 9) Rollout-Plan (inkrementell)

1. **Shadow Mode**
   - neue Outcome- und Runtime-States mitloggen, aber noch nicht als harte Steuerung verwenden
2. **Soft Enforce**
   - neue Regeln warnen/blocken selektiv fuer Teilfluesse
3. **Hard Enforce**
   - terminale Statemachine und Ready-Gates verbindlich
4. **Legacy Sunset**
   - Alias-/Fallback-Pfade schrittweise abschalten (nach Telemetrie-Freigabe)

---

## 10) Rollback-Plan

- Feature-Flags pro Kernfunktion:
  - outcome resolver
  - inbound inbox
  - emergency atomic coupling
  - runtime state gating
- Rollback immer stufenweise auf vorherigen stabilen Gate-Stand.
- Datenmigrationen nur mit sicherem Downgrade-/Compatibility-Pfad deployen.

---

## 11) Risiko-Register (Top)

1. **Komplexitaetsanstieg im Command-Flow**  
   Gegenmassnahme: klarer Resolver, harte Invarianten, exhaustive Tests.
2. **Performance-Kosten durch Inbox/Replay**  
   Gegenmassnahme: Priorisierung, Batching, KPI-gesteuerte Limits.
3. **Migration drift zwischen alten/neuen States**  
   Gegenmassnahme: Shadow-Phase + doppelte Buchfuehrung bis Stabilitaet.
4. **Frontend-Inkonsistenz waehrend Transition**  
   Gegenmassnahme: API-Versionierung und UI feature toggles.

---

## 12) Konkrete Abnahmekriterien je P-Stufe

## P0 Abnahme
- [ ] 0 offene P0 Findings
- [ ] 0 stille kritische Drops bei DB-down-Test
- [ ] 0 doppelte terminale States pro Intent
- [ ] Emergency-Blockade wirksam in allen Command-Einstiegen
- [ ] REST-Namensdrift in kritischen Endpunkten bereinigt (oder sauber als deprecated Alias dokumentiert)
- [ ] `intent_outcome` Handler-Registrierung + Verarbeitung verifiziert
- [ ] WS-Notification-Contract fuer neue Features nur auf kanonischen Events

## P1 Abnahme
- [ ] false-normal rate = 0 im Reconnect-Testfenster
- [ ] unmatched correlation < 0.1% (Ziel 0)
- [ ] Frontend-Finalstatus konsistent zu Persistenz in Stichprobenlauf

## P2 Abnahme
- [ ] `schema_version` aktiv auf kritischen Contracts
- [ ] Pflichtmatrix + Chaos-Tests gruen
- [ ] 7 Tage stabile SLO-Werte

---

## 13) Ergebnisformat fuer die Umsetzungsteams

Jedes Team liefert pro Arbeitspaket:

1. Implementierte Aenderungen (kompakt)
2. Nachweis der Invarianten
3. Testbelege (happy + failure)
4. Restrisiken + naechster Schritt

Ohne belastbaren Nachweis gilt das Paket als nicht abgenommen.

