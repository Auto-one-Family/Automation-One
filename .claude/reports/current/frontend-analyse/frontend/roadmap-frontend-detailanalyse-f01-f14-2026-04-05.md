# Roadmap Frontend Detailanalyse F01-F14

> **Typ:** Roadmap / Arbeitsprogramm  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend  
> **Status:** Entwurf v1.1 (auftragsfaehig, mit Umbau-Leitplanken)  
> **Ziel:** Diese Roadmap ist so aufgebaut, dass daraus im zweiten Schritt direkt einzelne Analyse- und Umsetzungsauftraege geschnitten werden koennen.

---

## 1) Zielbild und Arbeitslogik

Wir arbeiten in zwei Ebenen:

1. **Ebene A - Architektur- und Vertragsklarheit herstellen**  
   Eindeutige Antworten auf: Wer besitzt welchen State, welche Events sind kanonisch, wann ist ein Prozess nur "angenommen" vs. "final wirksam".

2. **Ebene B - Operative Sicherheit und Qualitaetsnetz schliessen**  
   P0/P1-Risiken in Safety, Realtime, Editor-Persistenz, Ops-Guardrails und E2E/Contract-Tests systematisch abbauen.

### Nicht-Ziel (wichtig)

- **Kein Greenfield-Neubau.**  
  Diese Roadmap optimiert und haertet das bestehende Frontend. Es werden keine Parallel-UI und keine zweite Architektur neben dem Bestand aufgebaut.

### Umbau-Leitplanken aus der April-Recherche (fuer alle F-Bereiche verbindlich)

1. **Finalitaet statt Dispatch-Illusion**  
   UI unterscheidet immer: `accepted` / `pending` / `terminal (success|failed|timeout|partial)`.
2. **Contract first**  
   REST- und WS-Contracts werden aus einer kanonischen Quelle abgeleitet; keine konkurrierenden Eventlisten.
3. **Progressive Disclosure**  
   Kernaktionen zuerst sichtbar, Expertenoptionen stufenweise; keine Ueberladung der primaeren Oberflaeche.
4. **Signalhierarchie fuer Datenstroeme**  
   Lagebild -> Diagnose -> Forensik. Realtime und Historie werden bewusst getrennt orchestriert.
5. **Serious-Game-Layer**  
   "Computerspieloptik" nur als Motivations- und Feedbackschicht; Alarm-/Safety-Semantik bleibt strikt sachlich.

---

## 2) Priorisierung (Programmsteuerung)

### P0 (sofort starten)

1. F13 - Safety Quick Action (`global-emergency`) ist wirkungslos.  
2. F09 - Logic-Persistenzluecke (`priority`/`cooldown_seconds`) im Save-Flow.  
3. F08 - Editor-Persistenzluecke bei `setZoneScope` (silent desync Risiko).  
4. F14 - Kritische Testluecken (`/editor`, Admin-Ops, Notifications E2E + Mock-Parity).
5. Programmweit - **Finalitaetsvokabular und Event-SSOT festlegen**, bevor P1-Auftraege parallel laufen.

### P1 (direkt nach P0)

5. F05/F04/F03 - Event- und Contract-SSOT, Refresh-Rennen, Ownership-Klarheit.  
6. F07/F06 - Operator-Finalitaet und Live-vs-Snapshot-Drift in Hardware/Monitor.  
7. F11/F12 - Admin-Guardrails, Auth-Recovery, Audit-Transparenz.

### P2 (konsolidieren)

8. F02 - Design-Token-Hardening und Farbdriftabbau.  
9. Legacy-Cleanup und UX-Feinschliff (Redirects, partielle Error-Zustaende, Fatigue-Optimierung).

---

## 3) Bereichsroadmap F01-F14 (Probleme + Vertiefungsbereiche)

### Querleitfragen (fuer jeden F-Bereich verpflichtend)

- **Ownership:** Wer ist State-Owner, wer darf schreiben, wer darf nur lesen/anzeigen?
- **Kommunikation:** Welche Pfade laufen ueber REST, welche ueber WS, welche hybrid?
- **Finalitaet:** Wann ist ein Vorgang nur angenommen, wann terminal bestaetigt?
- **Degradation:** Wie verhaelt sich die UI bei WS-Ausfall, API-Fehlern, Timeouts, Partial Success?
- **Einfachheit:** Welche Klicks/Schalter koennen entfallen, ohne Fachfunktion zu verlieren?

## F01 - Routing, Guards, Navigationsautoritaet

**Hauptprobleme**
- Viele Legacy-Redirects erzeugen operativen Ballast und Diagnoseunschärfe.
- Kein 404-View (Catch-all geht immer auf `/hardware`), Fehlpfade sind fuer Nutzer schwer erkennbar.
- Admin-Redirect auf `/hardware` ist funktional, aber erklaert keinen Zugriffsgrund.

**Genauer anschauen**
- Vollstaendige Redirect-Nutzung (welche Legacy-Routen werden real noch genutzt?).
- Guard-Verhalten bei Fehlern in `checkAuthStatus()`.
- Deep-Link-Konsistenz fuer Hardware/Monitor/Editor inkl. Query-Bridges.

**Ergebnisartefakte fuer Step 2**
- Redirect-Telemetrieplan + Decommission-Liste.
- Guard-Entscheidungsmatrix (inkl. Error/Recovery-Pfad).
- Vorschlag fuer 404-/AccessDenied-UX.

---

## F02 - Design-System, Tokens, Stilkonsistenz

**Hauptprobleme**
- Signifikante Farbdrift (direkte Hex-Werte + Fallback-Hex in kritischen Bereichen).
- Doppelquellen-Risiko (`tokens.css`, Tailwind-Config, JS-Farbpaletten).
- Safety/Operator-Flaechen teils nicht strikt semantisch tokenisiert.

**Genauer anschauen**
- P0/P1-Hotspots: `EmergencyStopButton`, `UnifiedEventList`, `ConfirmDialog`, `MonitorView`, `SystemMonitorView`.
- Fokus/Touch-Target/A11y-Standards in kritischen Dialogen.
- JS-Farbquellen (`chartColors`, `zoneColors`) gegen CSS-Tokens.

**Ergebnisartefakte fuer Step 2**
- Token-Migrationsmatrix (Datei -> Soll-Token -> Risiko -> Aufwand).
- "One Source of Truth" Vorgabe fuer Farben.
- A11y-Checkliste fuer kritische Komponenten.

---

## F03 - Pinia State Ownership und Kopplungen

**Hauptprobleme**
- `esp.store` als Mega-Orchestrator mit hoher Kopplung und vielen Seiteneffekten.
- Cross-Store-Writes (z. B. `zone -> esp`, `alert-center -> inbox`) erschweren Ownership.
- Mehrere Wahrheiten bei Aktor-/Notification-Lifecycle moeglich.

**Genauer anschauen**
- "Ein Writer pro Kernentity" als Zielarchitektur (Device, Sensor, Actuator, Notification).
- Wo `fetchAll()` als Sicherheitsnetz statt sauberer Delta-Verarbeitung genutzt wird.
- Persistenzgrenzen (lokal vs. serverseitig) je Store.

**Ergebnisartefakte fuer Step 2**
- Ownership-Refactoring-Backlog pro Entity.
- Inter-Store-Vertragsdoku (erlaubte Schreibpfade, verbotene Seitenschreibpfade).
- Konsistenzstrategie fuer Realtime + REST.

---

## F04 - REST-API-Vertragsklarheit

**Hauptprobleme**
- `parseApiError.ts` ungenutzt -> strukturierte Fehlerdaten werden nicht ausgenutzt.
- 403-UX inkonsistent (keine zentrale Policy).
- "Dispatch erfolgreich" vs. "terminal erfolgreich" nicht ueberall klar sichtbar.
- Refresh-Koordination nur teilweise global synchronisiert.

**Genauer anschauen**
- Zentralen Fehlervertrag (`request_id`, `numeric_code`, user-facing message).
- Einheitliche 401/403/5xx Verhaltensebene.
- Finalitaetskommunikation fuer async Brueckenfluesse (Zone/Subzone/Actuator/Config).

**Ergebnisartefakte fuer Step 2**
- API-Error-Policy-Dokument.
- Finalitaets-UX-Standard (Accepted/Pending/Terminal).
- Refresh-Orchestrierung (REST + WS + Startup).

---

## F05 - WebSocket, Realtime, Contract-Drift

**Hauptprobleme**
- Zwei Event-Wahrheiten (`MessageType` vs `contractEventMapper`).
- Startup-Race (Subscription aktiv bevor Handler komplett registriert).
- Rate-Limit nur observability, keine echte Laststeuerung.
- Queue-Pfade vorhanden, aber effektiv ungenutzt.

**Genauer anschauen**
- Event-SSOT-Modell (Basis + Monitor-Erweiterung aus gemeinsamer Quelle).
- Startup-Sequenz (init handler -> connect/subscribe).
- Backpressure-/Coalescing-Konzept fuer Bursts.

**Ergebnisartefakte fuer Step 2**
- WS-Contract-Blueprint.
- Reconnect- und Burst-Hardening-Auftrag.
- Type- und Runtime-Parity-Testdesign.

---

## F06 - Hardware, Konfigurationspanels, DnD

**Hauptprobleme**
- Optimistische Zone-UI vor finalem ESP-ACK kann als "fertig" missverstanden werden.
- Mock-vs-Real-Persistenz asymmetrisch (insb. Aktor-Konfig).
- Doppelte Rueckmeldungen/Toast-Noise in Assignment-Flows.

**Genauer anschauen**
- Einheitliches Finalitaetsmodell fuer Zone-/Subzone-/Config-Aktionen.
- Mock-Policy: klare Kennzeichnung "simuliert, nicht persistent".
- DnD-Reihenfolge- und Audit-Semantik bei schnellen Folgeevents.

**Ergebnisartefakte fuer Step 2**
- Endzustandsmodell pro Hardware-Aktion.
- UX-Standard fuer Pending/Timeout/Partial Success.
- DnD-Robustheitsauftrag inkl. Eventreihenfolge.

---

## F07 - Monitor, Live-Ansichten, Historie

**Hauptprobleme**
- L2-Aktorpfad ist snapshot-lastig, waehrend Sensorpfad live ueberlagert ist.
- Kein expliziter Monitor-Connectivity-Indikator fuer WS-Degradierung.
- Teilweise inkonsistente Refetch-Strategie bei Scope-/Context-Events.

**Genauer anschauen**
- Live-Ueberlagerung auch fuer Aktoren oder explizite Snapshot-Kennzeichnung.
- Degraded/Disconnected UX mit klarer Nutzerinformation.
- L1/L2/L3 Konsistenz bei schnellem Zonenwechsel und Fehlerlagen.

**Ergebnisartefakte fuer Step 2**
- Live-vs-History-Contract je Widget/Card.
- Monitor-Degradation-UX-Spezifikation.
- Recovery-Strategie mit klaren Triggern.

---

## F08 - Custom Dashboard Editor, Widgets, GridStack

**Hauptprobleme**
- `setZoneScope` ohne komplette Persistenzkette (hohes Desync-Risiko).
- Debounce-Fenster kann letzte Aenderungen verlieren (Crash/Tab close).
- Dedup nach Name kann fachlich unterschiedliche Layouts zusammenziehen.
- Fehlerfeedback bei Aktor-Widget nicht immer lokal klar.

**Genauer anschauen**
- Persistenzpfade fuer alle Editor-Aktionen (keine direkten Side-Mutationen).
- Safe flush bei unmount/navigation.
- Deduplogik (Name+Scope+Zone statt Name-only).

**Ergebnisartefakte fuer Step 2**
- Editor-Persistenzvertrag.
- Widget-Fehlerfeedback-Standard.
- Layout-Identity-Regeln.

---

## F09 - Logic UI, Regelmodell, Ausfuehrungsfeedback

**Hauptprobleme**
- Kritisch: Template-`priority`/`cooldown_seconds` werden im Save nicht persistiert.
- ACK vs wirksam nicht klar getrennt im Operator-Feedback.
- Konflikt-/Arbitrationszustande nicht explizit sichtbar.
- Validation-Feedback bleibt oft zu grob (Toast statt feld-/knotenbezogen).

**Genauer anschauen**
- Vollstaendiges Regelmodell Frontend <-> API.
- Wirksamkeitsfeedback je Regelinstanz (Pending -> Final).
- Ausfuehrungs-/Konfliktgrund als sichtbarer Endzustand.

**Ergebnisartefakte fuer Step 2**
- Logic-Contract-Fix-Auftrag (P0).
- Feedback- und Validation-UX-Auftrag.
- Typparitaet `logic_execution`.

---

## F10 - Inventar, Wissensbasis, Kalibrierung

**Hauptprobleme**
- Kalibrierung: Sensorauswahl ohne strikten Typfilter.
- Auth-Mode (API-Key vs JWT) kann fuer Operator unklar wirken.
- Kein Draft-Persistenzpfad bei Abbruch in Kalibrierung.
- `SubzoneContextEditor` scheint nicht voll integriert.

**Genauer anschauen**
- Typvalidierte Auswahlkette (Sensortyp -> erlaubte GPIOs).
- Explizite Vorpruefung und Anzeige aktiver Auth-Strategie.
- Kalibrierungs-Drafts in `sessionStorage`.

**Ergebnisartefakte fuer Step 2**
- Kalibrierungs-Hardening-Auftrag.
- Inventar-Kontext-Integrationsauftrag.
- UX- und Fehlermeldungsstandard fuer Kalibrierung.

---

## F11 - Systembetrieb, Ops, Plugins

**Hauptprobleme**
- Plugin-Execution ohne sauberen Laufzeit-/Zwischenstatus.
- LoadTest ohne harte Betriebsbremse (Guardrail).
- Config-Writes ohne klaren Wirkungskontext.
- Legacy-Redirect-Ballast in Ops-Einstiegen.

**Genauer anschauen**
- Execution-Lifecycle fuer Plugins (Execution-ID, Statusstream, Endzustand).
- Sicherheitsdialoge/Environment-Guard fuer Lasttests.
- Risiko-Hinweise und Impact-Vorschau fuer kritische Config-Keys.

**Ergebnisartefakte fuer Step 2**
- Ops-Safety-UX-Paket.
- Plugin-Lifecycle-Tracking-Auftrag.
- Redirect-Cleanup-Programm fuer Ops.

---

## F12 - Auth, User-Management, Settings

**Hauptprobleme**
- Guard-Startup-Fehler ohne klaren Recovery-Pfad.
- `remember_me` ohne sichtbare Persistenzstrategie.
- Fehlende Audit-Transparenz (Request-ID nicht nutzbar im Userflow).
- Settings derzeit eher Session-Aktionen statt echte Preferences.

**Genauer anschauen**
- Deterministischer Recovery-Flow bei Auth-Status-Problemen.
- Sessionstrategie (sessionStorage/localStorage/TTL-Kommunikation).
- User-Action-Traceability.

**Ergebnisartefakte fuer Step 2**
- Auth-Recovery-Auftrag.
- Session-Strategie-Auftrag.
- User-Audit-UX-Auftrag.

---

## F13 - Notifications, Alerts, Quick Actions

**Hauptprobleme**
- Kritisch: `global-emergency` ohne wirksamen Listener.
- Event-Fatigue durch fehlendes Toast-Coalescing.
- Batch-Ack seriell, langsam, potenziell inkonsistent.
- WS-Rate-Limit ohne echte Entlastung.

**Genauer anschauen**
- Vollstaendige Safety-Kette fuer Quick-Action-Notstopp.
- Alert-Priorisierung + Deduplogik + Sampling bei Burst.
- Bulk-Acknowledge-Endpunkt und UI-Rueckmeldung.

**Ergebnisartefakte fuer Step 2**
- Safety-QuickAction-Fix (P0).
- Notification-Fatigue-Reduktionspaket.
- Bulk-Alert-Workflow-Auftrag.

---

## F14 - Tests, Tooling, Qualitaetsnetz

**Hauptprobleme**
- P0-Testluecken in `/editor`, Admin-Ops, Notifications.
- Mock-vs-Real Contract-Drift (REST + WS).
- Guard-/Refresh-/403-Pfade nicht systematisch als Regression abgesichert.

**Genauer anschauen**
- E2E-Reisen fuer die produktkritischen Fluesse.
- Parity-Tests: API-Routen, WS-Eventlisten, Payload-Contracts.
- Priorisierte Testsequenz entlang P0/P1-Risiken.

**Ergebnisartefakte fuer Step 2**
- Testprogramm T1-T10 operationalisieren.
- CI-Gates fuer Contract-Parity.
- Coverage-Heatmap gegen F01-F13 fortlaufend fuehren.

---

## 4) Programmphasen (auftragsfaehig)

### Programm-Metriken (ab Phase 1 mitfuehren)

1. **P0-Defektzahl offen/geschlossen** (pro Woche)
2. **Contract-Drift-Anzahl** (REST/WS/Types) gegen SSOT
3. **Task-Friction** (Klicks bis Zielaktion in 5 Kernreisen)
4. **Degradation-Sichtbarkeit** (Anteil kritischer Views mit explizitem Connectivity-/State-Banner)
5. **Testnetz-Reife** (P0/P1-Flows mit automatisiertem Nachweis)

## Phase 1 - P0 Stabilisierung (Sofort)

**Ziel:** Kritische Fehlstellen mit Sicherheits- oder Datenverlustwirkung schliessen.

- F13-P0: Emergency Quick Action funktionsfaehig machen.
- F09-P0: Logic-Metadaten (`priority`, `cooldown_seconds`) persistieren.
- F08-P0: Editor-Scope persistenzsicher machen.
- F14-P0: E2E + Contract-Parity fuer kritische Fluesse.

**Exit-Kriterien**
- Kein bekannter P0-Bug offen.
- P0-Fluesse durch mindestens einen automatisierten Test abgesichert.
- Finalitaetsvokabular (`accepted/pending/terminal`) in P0-Flows sichtbar.

## Phase 2 - Vertrags- und Finalitaetsklarheit (P1)

**Ziel:** Eindeutige Systemkommunikation und Operator-Vertrauen.

- F05/F04: Event-SSOT, Error-SSOT, Refresh-Synchronisierung.
- F06/F07/F09: Accepted/Pending/Terminal konsistent.
- F11/F12: Admin-/Auth-Guardrails und Recovery-Transparenz.

**Exit-Kriterien**
- Finalitaetsmodell in Kernfluesse integriert.
- Keine ungeklaerten P1-Contract-Drifts.
- Event-SSOT und Error-SSOT dokumentiert und in Tests verankert.

## Phase 3 - Konsolidierung und Qualitaetsnetz-Ausbau (P2)

**Ziel:** Wartbarkeit, Konsistenz und langfristige Betriebssicherheit.

- F02 Design-Drift abbauen.
- Legacy-Redirect-Cleanup gestaffelt.
- F14 Testnetz fuer Langfriststabilitaet erweitern.

**Exit-Kriterien**
- Sichtbar reduzierte Drift-Hotspots.
- Testabdeckung auf kritischen Nutzerreisen vollstaendig.
- UX-Klicklast in den 5 Kernreisen messbar reduziert.

---

## 5) Auftrags-Template fuer Step 2 (direkt nutzbar)

Jeder Einzelauftrag soll dieses Format nutzen:

1. **Auftragstitel** (`Fxx-<kurzbereich>-<ziel>`)
2. **IST-Befund** (1-3 konkrete Probleme mit Pfaden)
3. **SOLL-Zustand** (fachlich + technisch)
4. **Scope In / Scope Out**
5. **Umsetzungspakete** (max. 3-5 Pakete)
6. **Akzeptanzkriterien** (messbar)
7. **Tests/Nachweise** (Unit/E2E/Manual)
8. **Risiken/Backout**
9. **Telemetry/Observability** (welche Messpunkte belegen Erfolg oder Drift)
10. **UX-Einfachheitsregel** (welche Schalter/Klicks entfallen oder werden zusammengefuehrt)

---

## 6) Wissensfundament fuer "beste UI" auf deinem System

Die folgenden Startauftraege basieren auf einem klaren UI-Verstaendnis fuer AutomationOne:

1. **Operator-Cockpit statt Consumer-App**  
   Die UI ist eine Entscheidungsoberflaeche fuer Realtime-Betrieb mit Sicherheitswirkung.
2. **Finalitaet sichtbar machen**  
   `accepted` ist nicht `success`; pro kritischer Aktion muss der terminale Zustand sichtbar sein.
3. **Degradation fuehren statt verstecken**  
   WS-/API-Ausfall, Timeouts und Partial Success brauchen explizite Operator-Hinweise.
4. **Signalhierarchie gegen Overload**  
   Lagebild -> Diagnose -> Forensik, damit Lastspitzen nicht zu Bedienfehlern fuehren.
5. **Progressive Disclosure + Token-Disziplin**  
   Kernaktionen sofort, Expertenebenen bei Bedarf; Safety-Semantik bleibt strikt und einheitlich.

Diese Prinzipien sind nicht "Design-Meinung", sondern reduzieren bei deinem IoT-Stack direkt das Risiko von Fehlinterpretation, Fehlbedienung und Drift zwischen UI-Wahrnehmung und Anlagenrealitaet.

---

## 7) Erste Analyseauftraege (A01-A04, direkt startbar)

### A01 - F13/P0: Safety-Quick-Action End-to-End Wirksamkeit

**Auftragstitel**  
`A01-F13-P0-safety-quick-action-wirksamkeit`

**Warum zuerst**  
Der Notstopp-Shortcut ist sicherheitskritisch. Wenn Trigger ohne wirksame Kette bleibt, erzeugt die UI Scheinsicherheit.

**IST-Befund (Startannahme)**  
- `global-emergency` dispatcht ein Frontend-Event ohne nachweisbaren aktiven Listener.
- Operator sieht ggf. Trigger-Feedback, aber keine terminale Wirksamkeit.

**Analysefragen (Pflicht)**
- Welche exakte Triggerkette existiert von Quick Action bis serverseitigem/geraeteseitigem Endzustand?
- Wo wird `accepted`, wo `pending`, wo `terminal` im UI dargestellt?
- Welche Degradation-Pfade gibt es bei WS-Down, API-Error, Timeout?

**Vorgehen**
1. Triggerquelle + alle Listener + Store/Composable-Pfade erfassen.
2. Event -> Store -> API/WS -> UI-Rueckmeldung als Sequenzdiagramm dokumentieren.
3. Happy Path und mindestens zwei Stoerfallpfade nachweisen.
4. Gap-Liste mit P0/P1-Risiko und klarer Reparaturoption erstellen.

**Abgabe / Nachweise**
- Pfad-/Symbolbelege fuer jeden Schritt der Kette.
- Tabelle `Phase | Signal | Quelle | Sichtbarkeit | Risiko`.
- Messbare Akzeptanz fuer spaeteren Fix-Auftrag (z. B. "Notstopp zeigt innerhalb X s terminales Ergebnis oder Timeout-Status").

---

### A02 - F09/P0: Logic-Metadaten und Wirksamkeitsfeedback

**Auftragstitel**  
`A02-F09-P0-logic-metadata-und-finalitaet`

**Warum zuerst**  
Wenn `priority`/`cooldown_seconds` verloren gehen, driftet UI-Semantik gegen Backend-Arbitration.

**IST-Befund (Startannahme)**  
- Template-Metadaten werden im Editorfluss nicht vollstaendig bis zur API-Payload getragen.
- ACK-Feedback und echte Wirksamkeit sind operatorisch nicht sauber getrennt.

**Analysefragen (Pflicht)**
- Wo gehen `priority` und `cooldown_seconds` in der Pipeline verloren?
- Welche Modelle (`types`, store, view) widersprechen sich?
- Wie muss ein belastbares Pending->Terminal-Feedback je Regelinstanz aussehen?

**Vorgehen**
1. Datenfluss Rule-Template -> Editor-State -> Save-Payload -> Store-Replay kartieren.
2. Typ-/Contract-Paritaet zwischen UI-Typen und WS-Execution-Events pruefen.
3. Konflikt-/Arbitrationsfaelle als explizite Endzustaende modellieren.
4. Ergebnis als P0-Fixauftrag + P1-UX-Auftrag schneiden.

**Abgabe / Nachweise**
- Feldmatrix `Rule-Feld | Quelle | in Payload | persistiert | sichtbar`.
- Belege fuer mind. einen Konflikt-/Fehlerfall mit aktueller UI-Reaktion.
- Konkrete Abnahmekriterien fuer nachfolgenden Implementierungsauftrag.

---

### A03 - F08/P0: Editor-Scope-Persistenz und Safe-Flush

**Auftragstitel**  
`A03-F08-P0-editor-scope-persistenz-safe-flush`

**Warum zuerst**  
Silent Desync im Dashboard-Editor fuehrt zu Vertrauensverlust: Operator glaubt an gespeicherte Scopes, bekommt aber stale/abweichende Layouts.

**IST-Befund (Startannahme)**  
- `setZoneScope` mutiert moeglichweise ohne komplette Persistenzkette.
- Debounce-Fenster kann letzte Aenderungen verlieren.

**Analysefragen (Pflicht)**
- Welche Editor-Aktionen laufen ueber `saveLayout()` und welche nicht?
- Wann entsteht Divergenz zwischen local state, server state und Viewer-Replay?
- Wie kann "flush before unmount/navigation" robust abgesichert werden?

**Vorgehen**
1. Vollstaendige Persistenzpfade fuer Scope/Layout/Widget-Konfig erfassen.
2. Triggerpunkte fuer Datenverlust (Crash, Tab close, Routewechsel) isolieren.
3. Dedup-/Identity-Regeln gegen fachliche Kollisionen pruefen.
4. Konkreten Hardening-Auftrag in 2-3 Umsetzungspakete schneiden.

**Abgabe / Nachweise**
- Persistenzmatrix `Aktion | local | API | debounce | replay-sicher`.
- Mindestens ein reproduzierbarer Stoerfall mit Auswirkung.
- Messpunktvorschlaege fuer Drift-Erkennung.

---

### A04 - F14/P0: Qualitaetsnetz fuer Editor/Admin/Notifications + Contract-Parity

**Auftragstitel**  
`A04-F14-P0-testnetz-kritische-reisen-und-parity`

**Warum zuerst**  
Ohne Regressionstestnetz kommen P0-Fehler nach jedem Refactor zurueck.

**IST-Befund (Startannahme)**  
- Kritische E2E-Reisen in `/editor`, Admin-Ops und Notifications fehlen oder sind duenner als in Hardware/Auth.
- Mock-Contracts driften gegen reale REST-/WS-Vertraege.

**Analysefragen (Pflicht)**
- Welche 5-7 Kernreisen muessen als erstes automatisiert werden?
- Wo sind die groessten Mock-vs-Real-Drifts (REST + WS)?
- Welche CI-Gates verhindern kuenftig erneute Drift?

**Vorgehen**
1. P0-Reisen als Testkatalog mit Input/Erwartung/Endzustand festlegen.
2. Endpoint- und Event-Paritaetsmatrix (API, Types, Mocks) aufbauen.
3. Priorisierte Umsetzung T1..Tn mit Aufwand und Risiko definieren.
4. Gate-Design fuer CI vorschlagen (Fail bei Drift).

**Abgabe / Nachweise**
- Priorisierte Testliste mit Aufwand (S/M/L).
- Paritaetsreport mit konkreten Abweichungen.
- Vorschlag fuer minimale Gate-Schwelle, die P0-Flows blockiert bei Drift.

---

## 8) Kandidaten fuer Runde 2 (nach A01-A04)

1. `F05-P1-ws-event-ssot-und-startup-race-fix`
2. `F04-P1-error-contract-und-403-standardisierung`
3. `F07-P1-monitor-aktor-live-overlay-oder-snapshot-kennzeichnung`
4. `F11-P1-loadtest-guardrails-und-plugin-lifecycle-status`
5. `F12-P1-auth-recovery-und-session-strategie`
6. `F02-P2-design-token-hardening-hotspots`

---

## 9) Hinweise fuer die zweite Analyse-Runde

- In Runde 2 pro Auftrag explizit **Codebeweise** sammeln (Datei + Symbol + beobachtete Wirkung).
- Pro Auftrag mindestens einen **Happy Path** und einen **Stoerfallpfad** dokumentieren.
- Jeden Auftrag mit **konkretem Testnachweis** abschliessen, sonst gilt er nicht als abgeschlossen.
- Bei UI-Auftraegen immer mitpruefen: **Progressive Disclosure, Finalitaetsfeedback, Degradation-Sichtbarkeit**.
- Safety-/Alarmfarben bleiben reserviert fuer echte Abweichung; "Game-Layer" niemals als Konkurrenz zur Sicherheitssemantik einsetzen.

---

*Ende Roadmap v1.2.*
