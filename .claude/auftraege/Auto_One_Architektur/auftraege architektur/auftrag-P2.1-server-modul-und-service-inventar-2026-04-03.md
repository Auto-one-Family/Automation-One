# Auftrag P2.1: Server Modul- und Service-Inventar (selbsttragend)

**Ziel-System:** Auto-one Backend "El Servador" (FastAPI + Messaging + Background Services)  
**Typ:** Reine Analyse (kein Code-Aendern)  
**Prioritaet:** CRITICAL  
**Datum:** 2026-04-03  
**Geschaetzter Aufwand:** ~5-8h

---

## Verbindlicher Arbeits- und Ablagekontext

Dieser Auftrag ist absichtlich vollstaendig selbsttragend formuliert, weil der bearbeitende Agent **keinen Zugriff auf das Life-Repo** hat.

Arbeite direkt im Auto-one-Repository:

- Arbeitswurzel: `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
- Verbindlicher Ausgabeordner:
  `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\arbeitsbereiche\automation-one\architektur-autoone\Server`

Falls der Ausgabeordner noch nicht existiert, lege ihn exakt so an.

---

## Systemkontext, den du aktiv verwenden sollst

Nutze diese Architekturannahmen als Startpunkt und validiere sie waehrend der Analyse:

1. Der Server ist die zentrale Steuerinstanz zwischen Firmware (ESP32), Datenbank und Frontend.
2. Es gibt API-Schichten, Domain-Services, MQTT-Handler und Background-Services.
3. Kritische Kernpfade fuer spaetere Pakete sind:
   - Device/Sensor-Ingestion,
   - Command/Actuator-Dispatch,
   - Logic-Engine-Regelausfuehrung,
   - Safety/Failure/Recovery.
4. Jede spaetere Entscheidung braucht klare Ownership:
   - Source of Truth (SSoT),
   - Contract-Owner,
   - State-Owner,
   - Failure-Owner.

Wenn einzelne Punkte abweichen, dokumentiere die Abweichung explizit als "IST != Startannahme".

---

## Ziel

Erstelle ein belastbares, operatives Modul- und Service-Inventar des gesamten Servers, das als Grundlage fuer P2.2 bis P2.7 dient.

Das Inventar muss so klar sein, dass ein neuer Engineer ohne Rueckfragen versteht:

- welche Module existieren,
- was jedes Modul genau tut und nicht tut,
- welche Ein-/Ausgaenge es hat,
- welche Persistenzbeziehung besteht,
- welche Risiken und Kopplungen kritisch sind.

---

## Pflichtvorgehen (detailliert)

### Block A - Modulaufnahme

1. Erfasse alle produktiven Server-Module und gruppiere sie nach Layer:
   - API/Router/Controller,
   - Domain-Services,
   - Messaging (MQTT/Event),
   - Persistence/Repository/DB-Zugriff,
   - Runtime/Worker/Scheduler/Background.
2. Erfasse Test- und Hilfsmodule nur dann, wenn sie produktives Verhalten direkt beeinflussen.

### Block B - Modulsteckbrief je Eintrag

Dokumentiere pro Modul mindestens:

1. Modul-ID (z. B. `SRV-MOD-001`).
2. Rolle/Verantwortung.
3. Explizit Nicht-Verantwortung (Boundary).
4. Inputs (API-Requests, MQTT-Messages, interne Events, Cron/Timer).
5. Outputs (DB Writes, MQTT Publishes, API Responses, interne Events).
6. Persistenzbezug (RAM/DB/Cache/none).
7. Abhaengigkeiten (upstream/downstream).
8. Kritikalitaet (kritisch/hoch/mittel) plus Begruendung.

### Block C - Ownership und Kopplungsanalyse

1. Lege fuer jedes Kernmodul fest:
   - SSoT-Owner,
   - Contract-Owner,
   - State-Owner.
2. Markiere:
   - Single-Point-of-Failure,
   - zyklische Abhaengigkeiten,
   - implizite Contracts ohne dokumentiertes Schema.

### Block D - Hand-off fuer Folgepakete

Erzeuge eine kurze, priorisierte Uebergabeliste:

- Was muss P2.2 als erstes vertiefen?
- Was ist kritisch fuer P2.3 (Command)?
- Welche offenen Fragen sind zwingend fuer P2.4/P2.5/P2.6/P2.7?

---

## Verbindliche Ausgabe

Erstelle exakt diese Datei:

`C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\arbeitsbereiche\automation-one\architektur-autoone\Server\paket-01-server-modul-und-service-inventar.md`

Pflichtstruktur in der Ausgabedatei:

1. Executive Snapshot (max 12 Bullet-Points)
2. Layer-Karte
3. Vollstaendige Modultabelle
4. Ownership-Matrix
5. Kritikalitaets- und Kopplungsanalyse
6. Top-Risiken (Top 10)
7. Hand-off in P2.2-P2.7
8. Offene Fragen + Verifikationsplan

---

## Akzeptanzkriterien

- [ ] Alle produktiven Kernmodule sind erfasst und einer Schicht zugeordnet
- [ ] Jeder Modultabelleneintrag hat Rolle, I/O, Persistenz, Abhaengigkeiten
- [ ] Ownership (SSoT/Contract/State) ist fuer Kernmodule gesetzt
- [ ] Kritische Kopplungen und SPOFs sind explizit bewertet
- [ ] Die Datei ist eigenstaendig lesbar ohne Referenz auf externe Kontextdateien

---

## Nicht-Scope

- Keine Implementierung im Server-Code
- Keine API- oder DB-Aenderungen
- Keine Deployment-Entscheidungen
