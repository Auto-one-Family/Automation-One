# Analyse- und Fixauftrag Bereich 01: Kanonisches Outcome-/Error-Lexikon

**Stand:** 2026-04-04  
**Prioritaet:** P0  
**Ziel:** Eine einzige, verbindliche Semantik fuer Outcome- und Fehlercodes ueber Firmware, Server und Frontend.

---

## 1) Problemmechanik (fachlich erklaert)

In einem asynchronen IoT-System wird dieselbe Stoerung mehrfach repraesentiert: zuerst auf Device-Ebene, danach bei Ingestion, danach in der UI.  
Wenn diese drei Ebenen denselben Code unterschiedlich deuten oder einzelne Codes nicht kennen, entsteht semantischer Drift.

Konsequenzen:

- Ein praeziser technischer Fehler wird in der Bedienoberflaeche als generischer Fehler sichtbar.
- Zwei unterschiedliche Ursachen werden in dieselbe Kategorie gepresst.
- Operatoren erhalten falsche oder unvollstaendige Handlungsempfehlungen.
- Kennzahlen verlieren Aussagekraft, weil unterschiedlich klassifizierte Fehler zusammengemischt werden.

Das Kernproblem ist daher nicht nur "fehlende Labels", sondern fehlende **vertragliche Eindeutigkeit**.

---

## 2) Sollbild

Es gibt genau ein verbindliches Lexikon mit folgenden Feldern je Code:

1. `code` (stabiler Schluessel),
2. `domain` (admission, validation, commit, publish, replay, stale, safety, persistence),
3. `severity` (info, warning, error, critical),
4. `terminality` (non_terminal, terminal_success, terminal_failure),
5. `retry_policy` (allowed, conditional, forbidden),
6. `operator_action` (konkrete naechste Handlung),
7. `ui_text_short` und `ui_text_detailed`.

Alle Schichten konsumieren dasselbe Lexikon.  
Unbekannte Codes sind nicht still erlaubt, sondern explizit als Vertragsverletzung sichtbar.

---

## 3) Pflichtanalyse

1. Vollstaendige Erhebung aller derzeit auftretenden Codes aus:
   - Device-Outcomes,
   - Ingestion- und Handler-Fehlern,
   - UI-Event-Mappings.
2. Gap-Analyse je Code:
   - bekannt in Schicht A/B/C?
   - gleiche Bedeutung in A/B/C?
   - gleiche Terminalitaet in A/B/C?
3. Konfliktanalyse:
   - ein Code mit zwei Bedeutungen,
   - zwei Codes mit identischer Bedeutung,
   - Sammelcodes ohne Ursachenklarheit.
4. Risikoeinstufung pro Luecke:
   - operativ (Fehlentscheidung),
   - observability-seitig (falsche KPI),
   - recovery-seitig (falscher Retry).

---

## 4) Fixauftrag (umsetzbar, klar abgegrenzt)

## F1 - Lexikon als Single Source

- Definiere ein maschinenlesbares Lexikon (z. B. JSON/YAML).
- Verhindere freie Textcodes in Laufzeitpfaden.
- Jeder Code muss domain, severity und terminality besitzen.

## F2 - Server-Normalisierung

- Eingehende Codes werden strikt gegen das Lexikon validiert.
- Alias- oder Legacy-Codes werden deterministisch auf kanonische Codes gemappt.
- Unbekannte Codes erzeugen `CONTRACT_UNKNOWN_CODE` mit Rohcode-Payload.

## F3 - Frontend-Mapping

- UI-Label, Ursachenbeschreibung und Handlungsempfehlung werden aus dem Lexikon abgeleitet.
- Keine "default unknown" Verschleierung fuer bekannte Codes.
- Unknown-Codes werden sichtbar als Integrationsproblem gekennzeichnet.

## F4 - Governance

- Build-/CI-Check: Neue Codes nur mit Lexikon-Erweiterung.
- Change-Regel: Kein Entfernen existierender Codes ohne Migrationspfad.

---

## 5) Testmatrix

1. **T1 Vollabdeckung**  
   Jeder bekannte Code wird in allen Schichten korrekt dargestellt.

2. **T2 Unknown-Code-Verhalten**  
   Ein absichtlich ungueltiger Code wird als Vertragsverletzung erkannt und nicht still gemappt.

3. **T3 Terminalitaetskonsistenz**  
   Ein terminaler Fehler bleibt in allen Schichten terminal.

4. **T4 Retry-Policy-Konsistenz**  
   Codes mit `retry_forbidden` erzeugen keine automatische Wiederholung.

5. **T5 Regressionstest Legacy-Alias**  
   Legacy-Code wird korrekt auf kanonischen Code normalisiert.

---

## 6) Abnahmekriterien

- [ ] Es existiert genau ein kanonisches Lexikon mit den Pflichtfeldern.
- [ ] 100 Prozent der produktiv relevanten Codes sind abgedeckt.
- [ ] Unknown-Codes sind explizit sichtbar und messbar.
- [ ] Frontend-Anzeigen sind fuer bekannte Codes ursachenscharf und handlungsorientiert.
- [ ] KPI-Auswertung differenziert nach domain/severity ohne semantische Vermischung.

Wenn ein bekannter Code in einer Schicht als generisch erscheint, gilt der Auftrag als nicht bestanden.

