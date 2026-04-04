# Analyse- und Fixauftrag: Cross-Layer Abnahmephase nach P0 (ESP, Server, Datenbank)

**Stand:** 2026-04-04  
**Typ:** Vollstaendiger Analyse- und Haertungsauftrag  
**Kontext:** P0-Blocker wurden implementiert (Admission-Guard + ACK-Contract-Haertung)  
**Ziel:** Von "technisch plausibel" zu "abnahmefaehig belegt" fuer Reset-Finalitaet.

---

## 1) Ausgangslage (nach aktuellem Implementierungsstand)

### Bereits erreicht
1. Externe Aktorkommandos werden bei `registration_pending` geblockt (Intake + Queue-Drain als Defense-in-Depth).
2. Heartbeat-ACK besitzt verpflichtenden Vertragskern (`handover_epoch`, Typ-/Vertragsmetadaten, Sessionbezug).
3. Integrationstest fuer Heartbeat-Handler ist gruen.
4. Lint-Status der geaenderten Kernpfade ist sauber.

### Noch nicht abnahmefaehig
Die Architektur ist noch nicht vollständig verifiziert, solange folgende Nachweise fehlen:

1. Vollstaendige Reset/Burst-Testserie T1-T6 mit echten Power-Cycles.
2. End-to-End-Nachweis "befohlen -> ausgefuehrt -> final bestaetigt" unter Fault-Injection.
3. Belastbarer Nachweis fuer Outcome-Retry/Outbox-Verhalten und Recovery-Lane-Stabilitaet.

---

## 2) Harte Zieldefinition dieser Phase

Diese Phase gilt nur dann als bestanden, wenn gleichzeitig gilt:

1. Kein wirksamer externer Aktoreffekt bei ausstehender Registration.
2. Kein wirksamer Sessionuebergang ohne gueltigen ACK-Contract.
3. Finale Outcomes bleiben unter Retry, Reorder, Disconnect und Power-Cycle korrekt.
4. Kritische Pfade werden unter Last bevorzugt bedient und verlieren keine Finalitaet.
5. Runtime-Zwischenzustaende bei partieller Konfigurationslage sind explizit modelliert statt implizit.

---

## 3) Offene Kernluecken (P1/P2)

## P1-1 Outcome-Finalitaet unter Kommunikationsstoerung

### Problem
Lokale Wirkung kann eintreten, waehrend Outcome-Publish wiederholt fehlschlaegt.  
Damit droht Nachweisluecke zwischen Ausfuehrung und finaler Persistenz.

### Erwartete Haertung
1. Kritische Outcomes in einer robusten Versandstrategie fuehren (persist-before-publish oder outbox-aehnlich).
2. Idempotente Finalisierung serverseitig weiterhin write-once halten.
3. Retry-Ergebnisse mit klaren reason codes und Telemetrie markieren.

### Abnahmekriterium
- Fuer jeden kritischen Intent ist auch unter Stoerung ein finaler Zustand eindeutig nachvollziehbar.

---

## P1-2 Recovery-Lanes und Admission-Fairness

### Problem
Punktuelle Priorisierung reicht nicht als systemweite Garantie unter Last.

### Erwartete Haertung
1. Einheitliches Lane-Modell fuer Ingress/Processing:
   - `critical_recovery`
   - `critical`
   - `normal`
2. Admission-Policy je Lane mit klaren Reject-/Retry-Codes.
3. Garantierte Drain-Quote je Zyklus, damit Recovery nie verhungert.

### Abnahmekriterium
- Unter Last werden kritische Recovery-Intents reproduzierbar vor normaler Last finalisiert.

---

## P1-3 Runtime-Stufe fuer partiell geladene Konfiguration

### Problem
Reset kann in einen Zustand mit unvollstaendiger Aktor-/Regelbasis starten (z. B. Config pending).

### Erwartete Haertung
1. Explizite Runtime-Stufe fuer "lokal lauffaehig, aber Konfigurationsbasis noch nicht vollstaendig".
2. Klare Verhaltensgrenzen in dieser Stufe:
   - was darf wirken,
   - was wird blockiert,
   - welche Events heben den Zustand auf.

### Abnahmekriterium
- Kein stiller Uebergang in "normal", solange Konfigurationsmindestbasis fehlt.

---

## P2-1 Metrik-Kontinuitaet ueber Power-Cycles

### Problem
Counter und Zeitreihen sind ohne Segmentmarker ueber Reboots/Resets schwer robust vergleichbar.

### Erwartete Haertung
1. Boot-/Reset-Segmentmarker im Metrikstream.
2. Klare Semantik, wie Counters ueber Segmente interpretiert werden.
3. 24h-Auswertung mit stabiler maschineller Zuordnung.

### Abnahmekriterium
- Langlaufanalyse liefert konsistente KPI-Reihen trotz Power-Cycles.

---

## 4) Analyseauftrag nach Schicht

## A) ESP-Firmware

1. Admission-Matrix finalisieren:
   - jede Eingangsart gegen `registration_pending`, `session_state`, `safety_state`.
2. Outcome-Fehlerpfade klassifizieren:
   - transient, retryable, persistent fault.
3. Queue-Lane-Verhalten unter Last instrumentieren.
4. Runtime-Status fuer Config-Pending explizit machen.

**Pflichtnachweis ESP:**  
Kein externer Aktorpfad umgeht Registration-/Session-Guards; kritische Outcomes sind verlustresistent.

---

## B) Server-Runtime

1. ACK-Contract-Emission in allen Heartbeat-/Recovery-Antwortpfaden vereinheitlichen.
2. Session-/Epoch-Kontext je Device auf Konsistenz pruefen (Reconnect-Faelle, Neustartfaelle).
3. Ingest-/Persistenzpfad fuer Outcomes gegen Duplicate/Reorder/Retry validieren.
4. Monitoring fuer invalide ACKs und Device-Rejects korrelieren.

**Pflichtnachweis Server:**  
Alle ACKs sind vertragskonform; keine semantische Drift zwischen Handlern.

---

## C) Datenbank/Persistenz

1. Finale Intent-Semantik (write-once) unter Last und Reorder erneut beweisen.
2. Persistenzkette fuer kritische Outcomes durchgaengig nachvollziehbar machen.
3. E2E-Korrelation sicherstellen:
   - command accepted
   - execution observed
   - final outcome persisted

**Pflichtnachweis DB:**  
Kein kritischer Intent bleibt im "wirkte lokal, aber final unbekannt"-Zustand.

---

## 5) Verbindliche Testmatrix (T1-T6)

1. **T1 Reset + ACK-Contract-Fehler**
   - Erwartung: fail-closed, keine Registration, keine externe Aktorwirkung.

2. **T2 Reset + gueltiger ACK-Contract**
   - Erwartung: deterministische Registration und session-korrekte Uebergabe.

3. **T3 Registration pending + externes Aktorkommando**
   - Erwartung: konsequenter Reject inkl. Outcome-Code, keine physische Wirkung.

4. **T4 Reset + Config-Pending-Start**
   - Erwartung: expliziter Zwischenstatus, keine stille Normalbetriebssimulation.

5. **T5 Burst + Outcome-Publish-Failures**
   - Erwartung: finale Persistenz bleibt nachholbar und idempotent.

6. **T6 24h Soak mit realen Power-Cycles**
   - Erwartung: stabile Recovery-Lanes, konsistente Metriksegmentierung, keine Finalitaetsluecke.

---

## 6) Nachweisformat (Pflicht)

1. **Pro Testfall**
   - Trigger
   - erwartetes Verhalten
   - beobachtetes Verhalten
   - Pass/Fail mit Ursache.

2. **Pro kritischem Intent**
   - command id
   - admission result
   - execution evidence
   - final persisted outcome.

3. **Pro Schicht**
   - offene Risiken
   - harte Schutzregel
   - naechster Umsetzungsschritt.

---

## 7) Naechste Umsetzung (empfohlene Reihenfolge)

1. P1-1 Outcome-Robustheit (kritische Outbox/Retry/Nachweis).
2. P1-2 Recovery-Lanes/Fairness quota.
3. P1-3 Runtime-Status fuer Config-Pending.
4. P2-1 Metrik-Kontinuitaet ueber Power-Cycles.
5. Abschliessend: T1-T6 vollstaendig ausfuehren und dokumentieren.

---

## 8) Harte Abnahme dieser Phase

- [ ] T1-T6 sind vollstaendig und reproduzierbar gruen.
- [ ] Kein externer Aktoreffekt bei `registration_pending`.
- [ ] ACK-Contract ist in allen relevanten Serverpfaden konsistent.
- [ ] Kritische Outcomes sind unter Stoerung final nachvollziehbar.
- [ ] Recovery-Lanes priorisieren unter Last nachweisbar.
- [ ] Config-Pending ist als expliziter Runtime-Status modelliert.
- [ ] Power-Cycle-Metriken sind segmentiert und maschinell auswertbar.

Wenn ein Punkt fehlt, ist die Cross-Layer-Reset-Finalitaet noch nicht abnahmefaehig.

