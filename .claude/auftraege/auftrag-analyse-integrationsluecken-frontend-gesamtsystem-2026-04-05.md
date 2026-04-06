# Auftrag: End-to-End-Analyse Integrationsluecken — El Frontend

**Datum:** 2026-04-05  
**Typ:** Analyse (IST-Luecken inventarisieren, priorisieren, messbar machen; kein Fix-Zwang)  
**Zielgruppe:** Frontend-Agent / Entwickler mit Vollzugriff auf dieses Repository

---

## 1. Ziel und Gesamtkontext

Das Frontend ist die **Operator-Sicht** auf dieselbe Contract-Kette wie Firmware und Server: Intents entstehen oft durch REST-Aktionen, verfolgen sich ueber **WebSocket-Events** und muessen **terminal** enden — mit verstaendlichen Gruenden bei Contract-Verletzungen. Integrations-Spezifikationen sehen u. a. vor: **Correlation-first** (kein Ersatz-Matching ueber `request_id` fuer fachliche Finalisierung), ein **einheitliches maschinenlesbares Lexikon** fuer Texte/Codes ueber alle Schichten (Soll), sowie **Degraded** und **Reconciliation** als first-class Betriebsinformation.

Dieser Auftrag analysiert **nur Frontend-Code und Tests**, aber stets im Kontext der **Server-Payloads** und **Firmware-Semantik** (ohne deren Repo zu aendern).

---

## 2. Fachlicher Rahmen (eingearbeitet)

**Intent-State:** Stores (z. B. Aktor) fuehren `created | pending | terminal` mit `correlationId` und idempotenter Terminalitaet. Die Analyse prueft, ob **alle** relevanten UI-Pfade dieselbe Logik nutzen oder ob parallele/alte Pfade existieren.

**Contract-Mapping:** `contractEventMapper` und verwandte Module validieren Event-Typen, melden `contract_mismatch` / `contract_unknown_event`, und definieren Regeln wie „config_response ohne correlation_id → nicht finalisierbar“. Zu pruefen: Vollstaendigkeit gegenueber **aktuellen** Server-Events und Legacy-Aliasen.

**Operator-Hilfe:** `eventTransformer` und aehnliche Schichten liefern Texte fuer Fehler. Spez-Wunsch: zentrales Lexikon (YAML/JSON). IST: Semantik verteilt auf Mapper/Store. Luecke = **Inkonsistente** Texte oder fehlende Codes.

**Degraded vs. Sensor-Kontext:** Risiko, dass „degraded“ in der UI mit **Datenqualitaet** oder einzelnen Sensorwarnungen vermischt wird statt **Device-Betriebsmodus** (Admission, Heartbeat-Felder) klar zu zeigen.

**Reconciliation:** Server sendet `_reconciliation`-Strukturen; die Analyse soll pruefen, ob das Frontend **sichtbar**, **filterbar** und **terminal** genug darstellt — oder ob Sessions fuer den Operator unsichtbar bleiben.

---

## 3. Analyse-Bereiche (Pflicht)

### Bereich A — Event-Eingang und Typ-Inventar

**Fragen:**  
- Vollstaendige Liste der WS-Event-Typen, die Intent-/Config-/System-Lebenszyklen beruehren.  
- Wo werden unbekannte Typen abgefangen vs. still ignoriert?

**Deliverable:** Tabelle „Event-Typ → Handler → Store-Touch → Terminalitaet ja/nein“.

---

### Bereich B — Correlation und Matching-Regeln

**Fragen:**  
- `extractCorrelationId` / `findIntentByCorrelation`: welche Payload-Formen werden unterstuetzt (top-level vs. verschachtelt)?  
- Gibt es Pfade, die noch **`request_id`** fuer fachliches Matching nutzen (Spez: verboten)?  
- Verhalten bei **synthetischer** Server-Korrelation (`missing-corr:…`): versteht die UI das als Contract-Issue oder als normalen Intent?

**Deliverable:** IST-Matrix + Luecken gegenueber Correlation-first-Spez.

---

### Bereich C — Intent-Lifecycle (Aktor, Config, Sequenzen)

**Fragen:**  
- `actuator.store`, `esp` Store-Registrierung: konsistente Initialisierung mit API-Antwort (`correlation_id`, `request_id`).  
- Config- und Sonderflows: gleiche Terminal-Garantien wie Aktor?

**Deliverable:** Liste der UI-Einstiegspunkte (Views/Actions) mit „Intent tracking vollstaendig ja/nein“.

---

### Bereich D — Contract-Mismatch und Operator-Klarheit

**Fragen:**  
- Wann zeigt die UI **explizit** Contract-Verletzung vs. generischen Fehler?  
- Sind `mismatch_reason`-Texte **aktionsorientiert** (was der Operator tun kann)?

**Deliverable:** 5 Beispiel-Payloads (fiktiv, aber realistisch) → erwartete UI-Reaktion → IST im Code.

---

### Bereich E — Degraded und Device-Betriebsmodus

**Fragen:**  
- Wo kommen Heartbeat-/Systemdaten an, die `degraded`, `degraded_reason`, Drift-Zaehler tragen?  
- Werden diese von **HardwareView / SystemMonitor** konsistent angezeigt?  
- Kollision mit Sensor-„degraded“ oder aehnlichen Begriffen?

**Deliverable:** UI-Landkarte „Degraded-Signalquelle → Komponente → Darstellung“ + Luecken.

---

### Bereich F — Reconciliation-Session (Operator-Sicht)

**Fragen:**  
- Wird `_reconciliation` aus Intent-Outcome oder anderen Events **sichtbar** gemacht?  
- Kann der Operator **Running vs. Completed vs. Failed** unterscheiden, ohne Netzwerk-Logs zu lesen?  
- Fehlt eine dedizierte Session-Timeline oder Badge?

**Deliverable:** IST vs. Soll-Gap in max. 10 Bulletpoints.

---

### Bereich G — Zentrales Lexikon (Spez vs. IST)

**Fragen:**  
- Gibt es eine **einzige** Datei (JSON/YAML), die alle Operator-Texte und Code-Mappings fuer Contract-Codes abbildet?  
- Wenn nein: welche **Duplikate** und **Drift-Risiken** zwischen Mapper, Transformer und Store-Meldungen?

**Deliverable:** Empfehlung „Lexikon einfuehren ja/nein“ mit Aufwandsschaetzung **nur qualitativ** (S/M/L).

---

### Bereich H — Tests und Regressionsschutz

**Fragen:**  
- `contractEventMapper.test`, `eventTransformer.test`, `intent-contract-matrix.test`: welche Szenarien aus A–G fehlen?  
- Braucht es Snapshot-Tests fuer WS-Payload-Shapes bei Server-Updates?

**Deliverable:** Top-5 fehlende Testfaelle (Namen + Kurzbeschreibung).

---

## 4. Methodik

1. Von **WS-Subscription / zentraler Event-Dispatch** aus alle Stores und Views verfolgen, die ESP/Intent/System betreffen.  
2. Pro Bereich kurze IST-Zusammenfassung + Luecken mit P0/P1/P2.  
3. **Querschnitt:** Ein durchgespielter Operator-Flow „Config aendern → pending → Erfolg/Fehler“ und „Reconnect waehrend pending“ — dokumentieren, wo die UI **lueckenhaft** wird.

---

## 5. Abnahmekriterien

- Bereiche A–H vollstaendig.  
- Explizite Stellungnahme: **Erfuellt das Frontend Correlation-first** in allen Hauptflows, oder wo nicht?  
- Degraded- und Reconciliation-Abschnitte duerfen nicht leer bleiben; wenn keine UI existiert, als **P0/P1-Luecke** kennzeichnen.  
- Mindestens **drei** konkrete Luecken mit Datei-/Komponentennamen.

---

## 6. Explizit ausgeschlossen

- Server- oder Firmware-Code aendern.  
- Grosses Redesign der HardwareView ausserhalb der Analyse.  
- Neue Design-System-Tokens oder internationale Lokalisierung.

---

## 7. Erwartetes Ergebnisformat

Markdown-Bericht:

1. Executive Summary (Operator-Perspektive)  
2. Bereiche A–H  
3. Cross-Layer-Kurzliste: „Server sendet … / UI zeigt … / Luecke …“  
4. Optional: Empfohlene Frontend-Folgeauftraege (jeweils eine Zeile)
