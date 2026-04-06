# Auftrag: End-to-End-Analyse Integrationsluecken — El Trabajante (ESP32)

**Datum:** 2026-04-05  
**Typ:** Analyse (IST-Luecken inventarisieren, priorisieren, messbar machen; kein Fix-Zwang)  
**Zielgruppe:** Firmware-Agent / Entwickler mit Vollzugriff auf dieses Repository

---

## 1. Ziel und Gesamtkontext

AutomationOne besteht aus drei Schichten: Firmware (dieser Auftrag), Server (FastAPI/MQTT-Ingress) und Frontend (Vue). Die Integrations-Spezifikationen verlangen eine **durchgaengige Contract-Kette**: derselbe fachliche Schluessel (`correlation_id`), **terminale Sichtbarkeit** fuer Negativpfade (Parse, Queue-Volllauf, Persistenz, Publish-Backpressure) und **klare Betriebszustaende** (z. B. nach Reset, Degraded, Recovery).

Dieser Auftrag soll **nur die Firmware-Seite** systematisch durchleuchten, aber immer im Kopf behalten, **was Server und Frontend erwarten** (Topics, JSON-Felder, Terminalitaet, Session-Marker). Ergebnis ist ein **Lueckenbericht nach Bereichen**, nicht ein Refactoring-Plan — Fixes sind optional und nur, wenn sie aus der Analyse folgen.

---

## 2. Fachlicher Rahmen (ohne externe Dokumente)

**Correlation:** Fachlich soll ein Intent ueber seinen Lebenszyklus mit **derselben** `correlation_id` verfolgbar sein. In der Praxis existieren Spez-Ideen, die Korrelation strikt unter einem Envelope-Feld `data` verankern; die Firmware nutzt hauefig **top-level** `correlation_id` im JSON. Die Analyse soll **IST** exakt benennen (welche Topics, welche verschachtelte Form) und markieren, ob das mit Server-Kanonisierung kollidiert oder nur eine Abbildungsfrage ist.

**Terminalitaet:** Jeder kritische Fehlerpfad soll idealerweise in **`…/system/intent_outcome`** (oder dem kanonischen Config-/System-Antwortpfad) mit **finalem** Status und **ursachenscharfem** Code enden — nicht nur Serial-Log.

**Betriebsmodi:** `CONFIG_PENDING_AFTER_RESET` und `runtime_degraded` steuern Admission; die Analyse muss pruefen, ob **alle** relevanten Worker/Queues dieselbe Semantik teilen und ob Abweichungen Observability-Luecken erzeugen.

---

## 3. Analyse-Bereiche (Pflicht)

### Bereich A — Boot, Reset und CONFIG_PENDING

**Fragen:**  
- Wo wird `STATE_CONFIG_PENDING_AFTER_RESET` gesetzt und zurueckgenommen?  
- Welche **Exit-Bedingungen** (`CONFIG_PENDING_EXIT_READY`, Retain-Verhalten auf ACK) sind dokumentiert im Code und wo weichen Logs/Health-Strings ab?  
- Gibt es Pfade (Power-Cycle, partieller NVS-Stand, parallele Config-Events), die den State **haengen** lassen oder falsch verlassen, **ohne** dass Server/Operator es aus MQTT ableiten kann?

**Deliverable:** Zustandsdiagramm (textlich) + Liste der **Risiko-Szenarien** mit Repro-Hinweis.

---

### Bereich B — Admission, Safety und Queue-Gates

**Fragen:**  
- `command_admission` und abhaengige Module: Ist die Allowlist fuer Recovery/Config/Systembefehle **vollstaendig** und konsistent mit `actuator_command_queue`, `sensor_command_queue`, `communication_task`, `config_update_queue`?  
- Was passiert bei **Abweisung** (Codes wie `CONFIG_PENDING_BLOCKED`, `DEGRADED_MODE_BLOCKED`): Gibt es immer eine **MQTT-sichtbare** Antwort oder nur lokale Returns?

**Deliverable:** Matrix „Befehlstyp → Gate → Ergebnis (Outcome/Log/nichts)“.

---

### Bereich C — Config-Pipeline, Korrelation und Pending-Store

**Fragen:**  
- `config_update_queue`: Wie werden Slots im Pending-Ring belegt, ueberschrieben, expired?  
- Fehlt `correlation_id`: welche **Contract-Verletzung** wird wie signalisiert (Log, `config_response`, `intent_outcome`)?  
- Gibt es **stilles** Verwerfen oder Ueberschreiben aeltester Eintraege **ohne** terminales Outcome fuer den ersetzten Intent?

**Deliverable:** Sequenz „Config MQTT empfangen → NVS → ACK/Outcome“ mit markierten Luecken.

---

### Bereich D — Parallelpfade: Zone, Subzone, Nicht-Zentral-Worker

**Fragen:**  
- Alle Pfade, die JSON parsen **ausserhalb** des zentralen Config-Queue-Workers: Parse-Fail, leere Payload, Schema-Drift — jeweils mit oder ohne **Zone-/Config-ACK** und mit oder ohne `intent_outcome`?  
- Gibt es Guards (z. B. Config-Lane), die bei Drop **nur** loggen?

**Deliverable:** Liste der Dateien/Funktionen mit „Parse ja/nein → Outcome ja/nein“.

---

### Bereich E — Publish-Pfad, Outbox, kritisch vs. nicht-kritisch

**Fragen:**  
- `publish_queue` + `mqtt_client`: Welche Drops/Fehler enden in `intent_outcome`, welche nur in Zaehlern/Logs?  
- Unter welchen Bedingungen fehlt Metadaten fuer Outcome-Mapping (z. B. kein Queue-Item)?

**Deliverable:** Invarianten-Liste (was **muss** der Server immer sehen koennen) vs. reale Abweichungen.

---

### Bereich F — Persistenz, Drift, Degraded

**Fragen:**  
- Welche NVS-/Commit-Fehler setzen `PERSISTENCE_DRIFT` bzw. Heartbeat-`degraded`?  
- Welche Fehler nutzen andere Codes (`COMMIT_FAILED`, …) **ohne** einheitlichen Degraded-Vertrag?  
- Race/NVS-Namespace-Themen: sind sie **observability-seitig** von aussen unterscheidbar?

**Deliverable:** Tabelle „Fehlerklasse → Signal (Outcome/Heartbeat/Log)“.

---

### Bereich G — Intent-Outcome-Contract (Emission)

**Fragen:**  
- Vollstaendigkeit der Felder (`contract_version`, `semantic_mode`, `critical`, …) pro kritischem Pfad.  
- Werden **Reconciliation-** oder **Session-**Hinweise in der Firmware emittiert, die der Server in `_reconciliation` spiegelt — oder fehlt die Gegenstelle?

**Deliverable:** Abgleich „Server erwartet / Firmware sendet“ (nur Firmware-Teil detailliert).

---

### Bereich H — Tests und Reproduzierbarkeit

**Fragen:**  
- Welche existierenden Tests decken Admission, Pending, Outcomes ab (`test_config_pending_policies` etc.)?  
- Welche Luecken aus A–G sind **nicht** durch einen Test absicherbar ohne neuen Harness?

**Deliverable:** Test-Coverage-Matrix (grob) + Top-5 fehlende Szenarien.

---

## 4. Methodik

1. **Code-Lesung** entlang MQTT-Eingang (`main` / Router) → Queues → Worker → `mqtt_client` / `topic_builder`.  
2. **Pro Bereich** eine kurze IST-Zusammenfassung (max. 10 Zeilen) + Lueckenliste.  
3. **Priorisierung:** P0 = Sicherheit/ Datenverlust-Risiko / irreversible stille Fehler; P1 = Contract-Drift ohne Totalausfall; P2 = Observability-Comfort.  
4. Keine Aenderungen am Code, **ausser** du findest einen **Show-Stopper-Bug** — dann separat mit Minimal-Fix und Verweis auf Bereich kennzeichnen.

---

## 5. Abnahmekriterien

- Alle Bereiche A–H sind bearbeitet; fehlende Information ist explizit als „nicht im Code auffindbar“ markiert.  
- Mindestens **eine** reproduzierbare Story pro P0-Luecke (oder begruendetes „nicht reproduzierbar ohne Hardware“).  
- **Keine** pauschalen Aussagen („alles gut“) ohne Stichprobe der Parallelpfade aus Bereich D.  
- Am Ende: **eine** priorisierte Gesamtliste (max. 15 Punkte) mit Verweis auf Bereich und Datei/Funktion.

---

## 6. Explizit ausgeschlossen

- Server- oder Frontend-Code aendern.  
- Neues globales Lexikon-JSON erstellen (gehoert zu Cross-Layer-Auftraegen).  
- Performance-Tuning ohne Contract-Bezug.

---

## 7. Erwartetes Ergebnisformat

Ein einziges Markdown-Ergebnis (im Repo unter passendem Ordner fuer Analyseberichte oder als Kommentar an Robin), Struktur:

1. Executive Summary (15 Zeilen)  
2. Bereiche A–H mit IST / Luecken / Prioritaet  
3. Gesamt-P0/P1-Liste  
4. Optional: Empfohlene Folgeauftraege (Firmware-only), jeweils eine Zeile
