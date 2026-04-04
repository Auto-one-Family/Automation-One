# Auftrag P2.5: Server Safety und Failure-Handling (selbsttragend)

**Ziel-System:** Auto-one Backend "El Servador"  
**Typ:** Reine Analyse (kein Code-Aendern)  
**Prioritaet:** CRITICAL  
**Datum:** 2026-04-03  
**Geschaetzter Aufwand:** ~6-9h  
**Abhaengigkeit:** P2.1 bis P2.4 abgeschlossen

---

## Verbindlicher Arbeits- und Ablagekontext

Der Agent hat keinen Zugriff auf das Life-Repo. Folge nur diesem Auftragstext.

- Arbeitswurzel: `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
- Ausgabeordner:
  `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\arbeitsbereiche\automation-one\architektur-autoone\Server`

---

## Systemwissen fuer diesen Auftrag

Safety im Server bedeutet:

1. Gefaehrliche oder inkonsistente Aktionen verhindern.
2. Bei Teilausfall in kontrollierten Degraded Mode wechseln.
3. Nach Stabilisierung kontrolliert in Normalbetrieb zurueckkehren.

Failure-Handling muss fachlich und technisch zusammenpassen:

- Detection (Wie erkannt?),
- Classification (Was fuer ein Fehler?),
- Containment (Wie begrenzt?),
- Recovery (Wie heilen?),
- Observability (Wie sichtbar?).

---

## Ziel

Erstelle einen vollstaendigen Safety- und Failure-Katalog fuer den Server mit klaren Triggern, Reaktionen, Betriebsgrenzen und Recovery-Regeln.

---

## Pflichtvorgehen (detailliert)

### Block A - Safety-Inventar

1. Erfasse alle Schutzmechanismen:
   - Circuit Breaker,
   - Rate Limits,
   - Queue-Limits/Backpressure,
   - Idempotenz-Gates,
   - Retry-Policies,
   - Guard-Checks vor Dispatch.
2. Dokumentiere Trigger und Wirkung je Mechanismus.

### Block B - Failure-Klassen

Mindestens diese Klassen abdecken:

- `MQTT_UNAVAILABLE`
- `DB_UNAVAILABLE`
- `SERVICE_DEPENDENCY_DOWN`
- `QUEUE_OVERFLOW`
- `WORKER_STALL`
- `HIGH_LATENCY`
- `PARTIAL_PARTITION`

Pro Klasse dokumentieren:

1. Detection Signal.
2. Sofortreaktion.
3. Erlaubte und verbotene Aktionen im Degraded Mode.
4. Recovery-Kriterien.
5. Risiko bei Fehlklassifikation.

### Block C - Degraded-Mode-Design

1. Definiere explizit:
   - Eintrittsbedingungen,
   - Betriebsgrenzen,
   - Exit-Bedingungen.
2. Pruefe ob im Degraded Mode noch sichere Aktorpfade moeglich sind.
3. Dokumentiere "Fail-Open" vs "Fail-Closed" Entscheidungen mit Begruendung.

### Block D - Observability-Verankerung

1. Leite fuer jeden kritischen Failure-Path benoetigte:
   - Logs,
   - Metriken,
   - Alerts,
   - Korrelations-IDs ab.
2. Dokumentiere, wie Incident-Diagnose ohne Code-Lesen moeglich ist.

---

## Verbindliche Ausgabe

Erstelle exakt diese Datei:

`C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\arbeitsbereiche\automation-one\architektur-autoone\Server\paket-05-server-safety-und-failure-handling.md`

Pflichtstruktur:

1. Safety-Grundmodell
2. Schutzmechanismus-Katalog
3. Failure-Matrix (Detection -> Containment -> Recovery)
4. Degraded-Mode-Regelwerk
5. Observability-Anforderungen
6. Safety-Luecken und Top-Risiken
7. Hand-off in P2.6/P2.7 und Paket 5 Gesamtintegration

---

## Akzeptanzkriterien

- [ ] Jede kritische Failure-Klasse hat Detection-, Containment- und Recovery-Definition
- [ ] Degraded-Mode hat klare Entry/Exit-Regeln
- [ ] Safety-Entscheidungen sind als Fail-Open/Fail-Closed nachvollziehbar
- [ ] Observability ist pro Failure-Path explizit abgeleitet
- [ ] Ergebnis ist ohne externe Kontextdatei voll verstaendlich
