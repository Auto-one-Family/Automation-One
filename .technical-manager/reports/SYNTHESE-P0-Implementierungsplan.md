# Synthese: Konsolidierter P0-Implementierungsplan Bodenfeuchte-Kalibrierung

**Datum:** 2026-04-06
**Basis:** A1 (ESP32), A2 (Server+DB), A3 (Frontend) Finalanalysen
**Status:** Freigabe-Ready fuer TM-Entscheidung

---

## Executive Summary

Alle drei Analysen bestaetigen: Der Bodenfeuchte-Flow **funktioniert**, aber der Kalibriervertrag ist **nicht durchgaengig**. Die drei Hauptprobleme ueber alle Schichten:

1. **Kein Frischwert-Pfad:** Wizard liest historische Daten statt On-Demand-Messwerte
2. **Kein Session-Modell:** Kalibrierung ist stateless, kein Tracking von Start bis Terminal
3. **Keine Finalitaets-Sichtbarkeit:** ACK wird als Erfolg angezeigt, terminale Outcomes fehlen

P0-Scope: 22 Arbeitspakete (8 ESP32 + 10 Server + 8 Frontend), davon **12 kritisch** fuer den Minimalpfad.

---

## 1. Cross-Layer Gap-Uebersicht (P0 nur)

| ID | Schicht | Gap | Impact | Abhaengigkeiten |
|----|---------|-----|--------|-----------------|
| **G-E1** | ESP32 | Command-Queue nur 10 Plaetze | Blockierung bei On-Demand unter Last | Keiner |
| **G-E2** | ESP32 | Publish-Outbox stille Drops | Messpunktwerte gehen verloren ohne Feedback | Keiner |
| **G-E3** | ESP32 | Kein Timeout-Guard fuer On-Demand | Safety-Task Blockierung moeglich | Keiner |
| **G-S1** | Server | Keine Session-Persistierung | Multi-Point nicht trackbar | Braucht DB-Migration |
| **G-S2** | Server | Keine Terminal-Outcomes fuer Calibration | Wizard kann nicht auf "persisted" warten | Braucht Intent/Outcome-Erweiterung |
| **G-S3** | Server | Type-Normalisierung nur in MQTT, nicht REST | soil_moisture != moisture im REST-Pfad | Keiner |
| **G-S4** | Server | Measurement-Trigger ohne ACK | Frontend weiss nicht ob Messung erfolgreich | Braucht MQTT-Response-Handling |
| **G-F1** | Frontend | Keine Live-Messpunkte (queryData ist historisch) | Falsche Kalibrierung moeglich | Braucht G-S4 |
| **G-F2** | Frontend | Kein Intent-Outcome-Lifecycle | User denkt accepted = persisted | Braucht G-S2 |
| **G-F3** | Frontend | Zwei Kalibrierpfade (Wizard + Inline) | UX-Verwirrung, Auth-Inkonsistenz | Keiner |

---

## 2. Kritischer Pfad (Minimalpfad fuer messpunktbasierte Kalibrierung)

```
Phase 1 (parallel, keine Abhaengigkeiten):
  ESP32: E-P1 Queue-Erweiterung + E-P2 Outbox-Retry
  Server: S-P1 Type-Normalisierung
                |
Phase 2 (parallel nach Phase 1):
  ESP32: E-P3 Timeout-Guard + E-P4 Intent-Metadata in Response
  Server: S-P2 Session-Tabelle + S-P3 Session-Endpoints + S-P4 Service-Layer
                |
Phase 3 (nach Phase 2):
  Server: S-P5 Intent/Outcome fuer Calibration
  Server: S-P7 Measurement-ACK (wartet auf Sensor-Data)
  Frontend: F-P1 State-Refactor + F-P2 trigger-measure Integration
                |
Phase 4 (nach Phase 3):
  Frontend: F-P3 GPIO-Type-Validation
  Frontend: F-P4 Intent-Outcome Lifecycle UI
  Frontend: F-P7 Inline-Calibration entfernen
                |
Phase 5 (Gate: alles gruen):
  Frontend: F-P8 E2E Tests
  Server: S-P10 Integration Tests
  ESP32: E-P8 Systemtest
```

---

## 3. Konsolidierte Pakettabelle (alle Schichten)

### ESP32 (El Trabajante) — 8 Pakete

| Paket | Prio | Beschreibung | Aufwand | Abhaengigkeit |
|-------|------|-------------|---------|---------------|
| E-P1 | P0 | Command-Queue 10→20, Overflow-Telemetrie | 0.5T | - |
| E-P2 | P0 | Publish-Outbox Retry fuer Sensor-Data (3x) | 1T | - |
| E-P3 | P0 | On-Demand Timeout-Guard (max 5s) | 0.5T | - |
| E-P4 | P1 | Intent-Metadata in Sensor-Response zurueckgeben | 1T | E-P1 |
| E-P5 | P1 | Registration-Fallback (Buffer bei Gate-Close) | 1T | - |
| E-P6 | P1 | ADC-Sanity-Check (Min/Max Range) | 0.5T | - |
| E-P7 | P1 | Publish-Queue-Groesse erhoehen (20→50) | 0.5T | E-P2 |
| E-P8 | P0 | Integration-Systemtest Kalibrierflow | 2T | E-P1..P3 |

### Server (El Servador) — 10 Pakete

| Paket | Prio | Beschreibung | Aufwand | Abhaengigkeit |
|-------|------|-------------|---------|---------------|
| S-P1 | P0 | Type-Normalisierung in REST (normalize_sensor_type) | 1T | - |
| S-P2 | P0 | calibration_sessions DB-Tabelle (Alembic) | 1T | - |
| S-P3 | P0 | REST-Endpoints Session-Lifecycle (start/points/finalize/apply/reject) | 2T | S-P2 |
| S-P4 | P0 | CalibrationService Business-Logic | 2T | S-P2, S-P3 |
| S-P5 | P0 | Intent/Outcome fuer Calibration-Flow | 1T | S-P4 |
| S-P6 | P1 | Backward-Compat Migration calibration_data v1→v2 | 1T | S-P4 |
| S-P7 | P0 | Measurement-ACK (trigger wartet auf sensor_data) | 1.5T | - |
| S-P8 | P1 | Calibration-Data Validation (Punkt-Qualitaet) | 1T | S-P4 |
| S-P9 | P2 | Session-Expiry Job (auto-expire nach 24h) | 0.5T | S-P2 |
| S-P10 | P0 | Integration-Tests Calibration E2E | 2T | S-P1..P5 |

### Frontend (El Frontend) — 8 Pakete

| Paket | Prio | Beschreibung | Aufwand | Abhaengigkeit |
|-------|------|-------------|---------|---------------|
| F-P1 | P0 | State-Refactor: useCalibrationWizard Composable | 3T | - |
| F-P2 | P0 | trigger-measure API Integration (statt queryData) | 3T | S-P7 |
| F-P3 | P1 | GPIO-Type Validation (Frontend + Backend) | 2T | F-P1 |
| F-P4 | P0 | Intent-Outcome Lifecycle UI (finalizing-Phase) | 4T | S-P5, F-P1 |
| F-P5 | P1 | Draft-Persistierung + Resume-Dialog | 3T | F-P1 |
| F-P6 | P1 | Leave-Guard + Abort-Handling | 2T | F-P1 |
| F-P7 | P0 | Inline-Calibration aus SensorConfigPanel entfernen | 2T | F-P4 |
| F-P8 | P0 | E2E Tests + Dokumentation | 3T | F-P1..P7 |

---

## 4. Sprint-Plan (3 Wochen, parallel wo moeglich)

### Woche 1: Foundation (ESP32 + Server parallel)

| Tag | ESP32 | Server | Frontend |
|-----|-------|--------|----------|
| Mo | E-P1 Queue-Erweiterung | S-P1 Type-Norm | - |
| Di | E-P2 Outbox-Retry | S-P2 Session-Tabelle | F-P1 State-Refactor (Start) |
| Mi | E-P3 Timeout-Guard | S-P3 Session-Endpoints | F-P1 (Fortsetzung) |
| Do | E-P8 Firmware-Tests | S-P4 Service-Layer (Start) | F-P1 (Abschluss) |
| Fr | Firmware-Verifikation | S-P4 (Abschluss) | F-P1 Tests |

**Gate Woche 1:**
- `pio run -e seeed` gruen
- `pytest --tb=short -q` gruen (Server)
- ESP32 Command-Queue 20, Retry aktiv, Timeout-Guard aktiv

### Woche 2: Contract + Integration

| Tag | ESP32 | Server | Frontend |
|-----|-------|--------|----------|
| Mo | E-P4 Intent-Metadata | S-P5 Intent/Outcome | F-P2 trigger-measure (Start) |
| Di | E-P4 (Abschluss) | S-P7 Measurement-ACK | F-P2 (Fortsetzung) |
| Mi | - | S-P7 (Abschluss) | F-P2 (Abschluss) + F-P3 GPIO-Valid. |
| Do | - | S-P10 Integration Tests (Start) | F-P4 Intent-Outcome UI (Start) |
| Fr | - | S-P10 (Abschluss) | F-P4 (Fortsetzung) |

**Gate Woche 2:**
- Server Session-Flow End-to-End testbar
- Frontend zeigt Live-Messpunkte via trigger-measure
- Intent/Outcome fuer Calibration in DB persistiert

### Woche 3: Konsolidierung + Test

| Tag | ESP32 | Server | Frontend |
|-----|-------|--------|----------|
| Mo | - | S-P6 Migration v1→v2 | F-P4 (Abschluss) |
| Di | - | S-P8 Punkt-Validierung | F-P5 Draft + F-P6 Leave-Guard |
| Mi | - | - | F-P7 Inline entfernen |
| Do | E-P8 Cross-Layer Test | S-P10 Regressionstest | F-P8 E2E Tests |
| Fr | **GATE: Alles gruen** | **GATE: Alles gruen** | **GATE: Alles gruen** |

---

## 5. Verifikationsmatrix (nach Roadmap-Vorgabe)

| Bereich | Befehl | Wann |
|---------|--------|------|
| ESP32 Firmware | `cd "El Trabajante" && pio run -e seeed` | Nach E-P1..P3, E-P8 |
| Server Backend | `cd "El Servador/god_kaiser_server" && pytest --tb=short -q` | Nach jedem S-Paket |
| Server Lint | `cd "El Servador/god_kaiser_server" && ruff check .` | Nach jedem S-Paket |
| Frontend Build | `cd "El Frontend" && npm run build` | Nach jedem F-Paket |
| Frontend Typecheck | `cd "El Frontend" && npx vue-tsc --noEmit` | Nach jedem F-Paket |

---

## 6. Testplan (konsolidiert)

### Unit Tests (pro Paket)

| Schicht | Testdatei | Cases | Paket |
|---------|-----------|-------|-------|
| Server | test_normalize_sensor_type.py | 8 | S-P1 |
| Server | test_calibration_session_model.py | 12 | S-P2 |
| Server | test_calibration_endpoints.py | 10+ | S-P3 |
| Server | test_calibration_service.py | 20 | S-P4 |
| Server | test_intent_outcome_calibration.py | 10 | S-P5 |
| Frontend | useCalibrationWizard.spec.ts | 15 | F-P1 |
| Frontend | CalibrationStep.spec.ts | 8 | F-P2 |
| Frontend | calibrationOutcome.spec.ts | 10 | F-P4 |

### Integration Tests

| Szenario | Schichten | Paket |
|----------|-----------|-------|
| Session Start → Points → Finalize → Apply | Server+DB | S-P10 |
| trigger-measure → MQTT → sensor_data → ACK | Server+ESP32 | S-P7 |
| Wizard Happy Path (Select→Done) | Frontend+Server | F-P8 |
| Wizard Timeout (Submit→30s→Failure) | Frontend+Server | F-P8 |
| Wizard Resume (Reload→Dialog→Continue) | Frontend | F-P8 |

### Cross-Layer E2E

| Test | Beschreibung | Gate |
|------|-------------|------|
| Kalibrierung komplett | Server triggert Messung → ESP liefert → Server persistiert → Frontend zeigt "persisted" | Woche 3 Fr |
| Fehlerpfad | ESP offline → Server timeout → Frontend zeigt Fehler + Recovery-CTA | Woche 3 Fr |

---

## 7. Rollout-Strategie

### Feature-Flag
- `FEATURE_CALIBRATION_V2 = true/false`
- Server: Neue Session-Endpoints nur wenn Flag aktiv
- Frontend: Wizard V2 mit Finalitaet nur wenn Flag aktiv
- Fallback: Alter Wizard bleibt erreichbar bei `false`

### Abbruchstrategie
- Jede Phase hat ein Gate (siehe Sprint-Plan)
- Gate-Fail = Stopp + Root-Cause-Analyse
- Rollback: Feature-Flag auf `false`, keine DB-Migration rueckgaengig (backward-compat!)

---

## 8. Risiko-Register (konsolidiert)

| Risiko | Schicht | Wahrscheinlichkeit | Impact | Gegenmassnahme |
|--------|---------|-------------------|--------|----------------|
| Queue-Erweiterung erhoht RAM-Bedarf ESP32 | ESP32 | Mittel | Mittel | Heap-Monitoring, max 20 statt unbegrenzt |
| DB-Migration bricht Altdaten | Server | Niedrig | Hoch | Staging-Test, Backup vor Migration |
| Frontend-Refactor bricht bestehende Flows | Frontend | Mittel | Mittel | Parallelbetrieb via Feature-Flag |
| Measurement-ACK Timeout zu kurz | Cross | Mittel | Mittel | Konfigurierbarer Timeout (Default 10s) |
| Intent/Outcome Events kommen nie an (WS-Drop) | Cross | Niedrig | Hoch | Polling-Fallback + expliziter Timeout |

---

## 9. Naechster konkreter Schritt

**Empfehlung:** Starte mit **Phase 1** (Woche 1, Mo):

1. **ESP32:** E-P1 (Queue 10→20) — sofort machbar, kein Risiko
2. **Server:** S-P1 (Type-Normalisierung) — sofort machbar, behebt Alias-Drift
3. **Frontend:** F-P1 (State-Refactor) — kann parallel beginnen ab Di

Diese drei Pakete sind **unabhaengig voneinander** und koennen parallel gestartet werden.

---

## 10. Quellen

- [A1 ESP32 Analyse](computer:///sessions/happy-beautiful-feynman/mnt/Auto-one/.technical-manager/reports/A1-ESP32-Bodenfeuchte-Analyse.md)
- [A2 Server+DB Analyse](computer:///sessions/happy-beautiful-feynman/mnt/Auto-one/.technical-manager/reports/A2-Server-DB-Kalibriervertrag-Analyse.md)
- [A3 Frontend Analyse](computer:///sessions/happy-beautiful-feynman/mnt/Auto-one/.technical-manager/reports/A3-Frontend-Wizard-UX-Analyse.md)
