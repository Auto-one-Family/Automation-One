# Auftrag: Kalibrierung Session-Persistenzroute robust machen (2-Punkt, spaeter erweiterbar)

Datum: 2026-04-06
Prioritaet: P0/P1
Betroffene Schichten: El Servador (Backend), El Frontend (Wizard), optional El Trabajante nur indirekt (Messwertlieferung)
Typ: Analyse + Implementierungsauftrag (self-contained, direkt umsetzbar)

---

## 1) Kontext und fokussierter Bereich

Dieser Auftrag extrahiert bewusst genau einen zusammenhaengenden Problemblock:

**Messwertaufnahme -> Referenzzuordnung -> Persistenz in DB ueber Session-Route -> Finalize/Apply -> Option zum Loeschen/Ueberschreiben**

Warum genau dieser Block:
- Er ist Ende-zu-Ende fachlich geschlossen.
- Er behebt den direkten Datenfehler in der Kalibrierung.
- Er schafft die Grundlage fuer spaetere N-Punkt-Erweiterung, ohne jetzt Scope aufzublaehen.
- Er deckt die vom Operator benoetigte Kontrolle ab: speichern, ueberschreiben, loeschen.

Nicht Teil dieses Auftrags:
- Allgemeine MQTT-Heartbeat-Truncation.
- Grosse Architektur-Umbauten ausserhalb Kalibrier-Session-Flow.
- Vollstaendige N-Punkt-UI/Algorithmen (nur Vorarbeit fuer spaeter).

---

## 2) Problem- und Risikoanalyse (IST)

### 2.1 Funktionaler Kernfehler
- Im MQTT-Response-Pfad wird ein Kalibrierpunkt mit `reference=0.0` persistiert.
- Ergebnis: fachlich falsche Punkte in der DB, falsche slope/offset-Berechnung moeglich.
- Wirkung: Kalibrierung kann "erfolgreich" aussehen, ist aber inhaltlich falsch.

### 2.2 Flow-Split im Frontend
- Wizard nutzt nicht durchgaengig den Session-Flow.
- Live-Messung wird getriggert, aber der Rueckweg in den Wizard-State ist unvollstaendig.
- Ergebnis: Messwert im UI nicht stabil verfuegbar, Nutzer kann keinen validen Punkt committen.

### 2.3 Fehlende Operator-Kontrolle
- Es fehlt ein klarer, robuster Weg fuer:
  - gezieltes Ueberschreiben einer bestehenden Kalibrierung,
  - explizites Loeschen einer Kalibrierung,
  - auditierbare Entscheidung "behalten vs. ersetzen".

### 2.4 Integritaets- und Sicherheitsrisiken
- Ohne harte Server-Validierung koennen ungueltige Punkte persistiert werden.
- Ohne klare Zustandsmaschine drohen Rennen (double finalize, apply ohne valide Punkte, stale session).
- Ohne Berechtigungs- und Guard-Regeln koennen destructive Aktionen unbeabsichtigt passieren.

---

## 3) Zielbild (SOLL)

Kalibrierung ist ein sauberer Session-Vertrag mit klaren Zustaenden und eindeutigen Operator-Aktionen:

1. **Messung empfangen, aber nicht direkt als Punkt persistieren**
   - MQTT liefert Rohwert.
   - Server broadcastet `calibration_measurement_received` (nur Messung, kein Punkt-Commit).
2. **Punkt wird nur ueber Route persistiert**
   - Frontend sendet bewusst `reference_value` + `raw_value` an `POST /calibration/sessions/{id}/points`.
3. **Finalize und Apply sind getrennt, aber robust**
   - `finalize`: Berechnung und Plausibilitaetscheck.
   - `apply`: bewusste Aktivierung in produktiver Sensor-Konfiguration.
4. **Loeschen und Ueberschreiben sind explizit erlaubt**
   - sicher, auditierbar, mit klaren Guards gegen Versehen.
5. **2-Punkt jetzt, N-Punkt spaeter**
   - Datenmodell und API werden so gebaut, dass spaetere Erweiterung ohne Bruch moeglich ist.

---

## 4) Verbindlicher Verhaltensvertrag (Backend + Frontend)

## 4.1 Statusmaschine (Session)

Erlaubte Status:
- `PENDING`
- `COLLECTING`
- `FINALIZING`
- `APPLIED`
- `REJECTED`
- `EXPIRED`
- `FAILED`

Zulaessige Uebergaenge:
- `PENDING -> COLLECTING` (erste gueltige Messung empfangen oder erster Punkt angelegt)
- `COLLECTING -> FINALIZING` (finalize request)
- `FINALIZING -> APPLIED` (apply request)
- `PENDING|COLLECTING|FINALIZING -> REJECTED` (expliziter user reject/cancel)
- `PENDING|COLLECTING|FINALIZING -> EXPIRED` (TTL abgelaufen)
- `PENDING|COLLECTING|FINALIZING -> FAILED` (fachliche/technische Fehler)

Unzulaessig:
- `APPLIED` zurueck auf aktive Bearbeitungszustaende.
- `apply` ohne erfolgreiches `finalize`.

## 4.2 Messungs-Eventvertrag

`calibration_measurement_received` Event enthaelt mindestens:
- `session_id`
- `sensor_id` oder eindeutige sensor_config referenz
- `raw_value`
- `measured_at`
- `correlation_id`
- optional `quality`

Wichtig:
- Dieses Event persistiert **keinen** Kalibrierpunkt.
- Persistenz erfolgt ausschliesslich ueber Points-Route.

## 4.3 Persistenzvertrag fuer Punkte

Route: `POST /api/v1/calibration/sessions/{session_id}/points`

Request-Felder (Pflicht):
- `raw_value` (float)
- `reference_value` (float, darf nicht blind 0.0 sein; siehe Validierung)
- `point_role` (`dry` oder `wet` fuer 2-Punkt-Flow)

Server-Validierung:
- Session muss aktiv und mutierbar sein.
- `raw_value` finite, nicht NaN/Inf.
- `reference_value` finite, nicht NaN/Inf.
- `point_role` in erlaubter Menge.
- kein doppelter `point_role` in derselben Session ohne `overwrite=true`.

Antwort:
- persistierter Punkt inkl. `id`, `session_id`, `point_role`, `raw_value`, `reference_value`, `created_at`.

## 4.4 Ueberschreiben (overwrite) und Loeschen (delete)

### Ueberschreiben

Route:
- `PUT /api/v1/calibration/sessions/{session_id}/points/{point_id}`
  oder
- `POST /api/v1/calibration/sessions/{session_id}/points` mit `overwrite=true` + `point_role`

Regel:
- Ueberschreiben nur in mutierbaren Session-Status.
- Altdaten werden nicht still geloescht, sondern als Audit-Eintrag markiert.

### Loeschen

Routen:
- `DELETE /api/v1/calibration/sessions/{session_id}/points/{point_id}` (punktweise)
- `DELETE /api/v1/calibration/sessions/{session_id}` (Session verwerfen)
- optional separat: `DELETE /api/v1/sensors/{sensor_id}/calibration` (aktive Kalibrierung entfernen, mit Confirm-Guard)

Regel:
- Destructive Aktionen benoetigen klare Rollenpruefung.
- Bei erfolgreichem Delete immer terminales Event/Response mit nachvollziehbarem Zustand.

---

## 5) Implementierungspakete (konkret)

## Paket A - Backend: MQTT-Handler entkoppeln von Punktpersistenz

Ziel:
- Kein `add_point(reference=0.0)` aus Response-Handler.

Tasks:
1. In `calibration_response_handler` Punktpersistenz aus MQTT-Pfad entfernen.
2. Handler sendet nur `calibration_measurement_received` mit Rohwert.
3. Kommentar- und Naming-Konsistenz herstellen (threadsafe/broadcast-Verstaendlichkeit).

Akzeptanz:
- Kein Codepfad persistiert Punkte ohne echte Referenzzuordnung.

## Paket B - Backend: Points-Route haerten

Ziel:
- Persistenz nur ueber API mit starker Validierung.

Tasks:
1. `add_point` API validiert Felder und Session-Zustand.
2. Duplikatrolle (`dry/wet`) blockieren oder nur explizit ueberschreiben.
3. Fehlercodes klar trennen: `validation_error`, `state_error`, `not_found`, `forbidden`.

Akzeptanz:
- Ungueltige Punkte werden sauber abgewiesen, keine stillen Writes.

## Paket C - Backend: Finalize/Apply + Expiry-Guards

Ziel:
- Robuste Abschlusslogik ohne haengende Sessions.

Tasks:
1. `finalize` prueft Mindestpunkte (2 fuer aktuellen Scope) und Plausibilitaet.
2. `apply` nur nach erfolgreichem finalize.
3. Expiry-Mechanismus (TTL) fuer stale Sessions einfuehren.
4. `get_active_session`-Logik auf Finalizing-Blockade pruefen und klar definieren.

Akzeptanz:
- Keine Session bleibt unkontrolliert haengen.
- Neuer Start folgt klaren Regeln (entweder blockiert oder bewusst superseded).

## Paket D - Frontend: Wizard auf Session-Flow umstellen

Ziel:
- Ein deterministischer Flow statt Legacy-Route.

Tasks:
1. `submitCalibration()` auf Session-API umbauen:
   - startSession -> addPoint(dry/wet) -> finalizeSession -> applySession
2. Live-Messung:
   - WS-Listener fuer `calibration_measurement_received`
   - `lastRawValue` setzen und im Wizard fuer Punkt-Commit nutzen
3. `setLastRawValue` sauber in Composable-API exposen.
4. UI fuer overwrite/delete Aktionen integrieren (mit Confirm).

Akzeptanz:
- Nutzer kann Messwert sehen, Punkt absenden, finalisieren, anwenden.
- Keine Legacy-`/sensors/calibrate` Nutzung im Wizard.

## Paket E - Testnetz (Pflicht, kein Optional)

Backend Unit:
- `test_calibration_service.py`
  - start/add/finalize/apply/reject
  - Fehlerfaelle (insufficient points, terminal session, invalid values)
- `test_calibration_session_repo.py`
  - active-session Regeln

Backend Integration:
- `test_calibration_response_handler.py`
  - MQTT-Messung erzeugt Event, aber keinen DB-Punkt mit `reference=0.0`
- Session-E2E:
  - start -> add dry/wet -> finalize -> apply -> persisted calibration vorhanden

Frontend Unit/E2E:
- Wizard verarbeitet WS-Event und aktualisiert `lastRawValue`
- submit nutzt Session-Routen
- overwrite/delete Userflow inkl. Confirm

Akzeptanz:
- Regression H1 ist durch Test dauerhaft abgefangen.

---

## 6) Sicherheits- und Robustheitsanforderungen

1. AuthZ:
- Nur berechtigte Rollen duerfen start/finalize/apply/delete.

2. Idempotenz:
- doppelte finalize/apply Requests liefern definierte Antwort statt inkonsistentem Zustand.

3. Input-Haertung:
- Float-Validierung inkl. NaN/Inf-Schutz.
- String-Enum-Validierung fuer Status/point_role.

4. Concurrency:
- Session mutationen transaktional.
- Race zwischen zwei gleichzeitigen point writes wird deterministic behandelt.

5. Audit:
- overwrite/delete/create/apply als nachvollziehbare Ereignisse loggen.

---

## 7) API-Design fuer "jetzt 2-Punkt, spaeter N-Punkt"

Jetzt (verbindlich):
- genau zwei fachliche Rollen: `dry`, `wet`.
- finalize benoetigt beide Rollen.

Vorbereitung fuer spaeter:
- Datenmodell bereits als generische Punktliste speichern (`points[]` mit `point_role`/`label`).
- keine hart codierten Tabellenannahmen, die N-Punkt verhindern.
- Fehlermeldungen und API-Doku so formulieren, dass spaetere Erweiterung ohne Contract-Bruch moeglich ist.

---

## 8) Konkrete Akzeptanzkriterien (Definition of Done)

1. Kein `reference=0.0`-Auto-Persist mehr aus MQTT-Handler.
2. Wizard nutzt ausschliesslich Session-Flow (start/add/finalize/apply).
3. Live-Messwert kommt per WS im Wizard an und ist fuer Punktpersistenz nutzbar.
4. Ueberschreiben und Loeschen sind via Route moeglich, mit Guards und Audit.
5. Session-Zustandsmaschine ist durchgaengig implementiert und getestet.
6. Expiry-Regel verhindert stale Session-Leaks.
7. Tests fuer Service, Repository, Handler und Wizard sind gruen.
8. Kein Breaking Change fuer existierende aktive Kalibrierdaten.

---

## 9) Reihenfolge fuer Umsetzung (empfohlen)

1. Paket A (kritischer Datenfehler stoppen)
2. Paket B (saubere Persistenzroute erzwingen)
3. Paket D (Wizard auf neuen Vertrag)
4. Paket C (haerten: expiry/finalize/apply guards)
5. Paket E (Testnetz schliessen und Regression absichern)

---

## 10) Kurzentscheidung fuer den Implementierer

Wenn eine Abwaegung noetig ist, gilt:
- **Datenintegritaet vor Komfort**
- **Explizite Nutzerentscheidung vor impliziter Auto-Persistenz**
- **Terminale Finalitaet vor "gruener ACK-Optik"**

Damit ist der Kalibrierungsflow robust, sicher und fuer Operatoren nachvollziehbar, ohne den Scope auf N-Punkt vorzeitig aufzublasen.

