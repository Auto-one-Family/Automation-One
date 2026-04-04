# Analyse- und Fixauftrag Bereich 03: Strikter Typvertrag fuer WS/API-Events

**Stand:** 2026-04-04  
**Prioritaet:** P0  
**Ziel:** Laufzeitpayloads und Typsystem sind deckungsgleich, sodass Vertragsdrift frueh und explizit erkannt wird.

---

## 1) Problemmechanik (fachlich erklaert)

Wenn ein Backend-Event mehr Statusvarianten liefern kann als das Frontend typisiert, entstehen zwei Klassen von Fehlern:

- **Stille Degradierung:** Werte fallen durch implizite Fallbacks und verlieren Semantik.
- **Spat sichtbare Laufzeitfehler:** Fehler erscheinen erst im Betrieb, nicht im Build.

In Echtzeitsteuerungen fuehrt das zu falschen UI-Entscheidungen und erschwerter Incident-Analyse.

---

## 2) Sollbild

Es gibt einen vertraglich synchronisierten Eventtyp je WS/API-Nachricht:

1. Status-Enum vollstaendig und identisch,
2. Pflicht- und Optionalfelder explizit,
3. Versionierbarkeit (Schema-Version),
4. klare Fehlerreaktion bei inkompatibler Payload.

Typen sind nicht Dokumentation, sondern Ausfuehrungsvertrag.

---

## 3) Pflichtanalyse

1. Vollinventur aller produktiven WS-/API-Events mit Beispielpayloads.
2. Vergleich der tatsaechlichen Payloadvarianten mit den deklarierten Frontend-Typen.
3. Markierung von Driftkategorien:
   - fehlende Enum-Werte,
   - falsche Nullability,
   - Feldnamenvarianten ohne Mappingregel,
   - fehlende Versionsangabe.
4. Erhebung vorhandener Fallbackstellen (`default`, `any`, untyped parsing).

---

## 4) Fixauftrag

## F1 - Vertragsschema konsolidieren

- Leite aus der Runtime-Realitaet ein verbindliches Eventschema ab.
- Definiere fuer jedes Event:
  - Name,
  - Version,
  - Status-Enum,
  - Feldstruktur.

## F2 - Frontend-Parser verhaerten

- Ersetze stilles Durchreichen durch strict parsing.
- Inkompatible Payload wird als `CONTRACT_SCHEMA_MISMATCH` markiert.
- Gueltige Payload wird typgesichert weitergegeben.

## F3 - Statuskompatibilitaet

- Erweitere alle Eventstatus auf die reale Vertragsmenge.
- Entferne implizite Fallbackpfade fuer unbekannte Status.

## F4 - Vertrags-Regressionstests

- Snapshot-/Schema-Tests fuer repraesentative Payloads.
- Testfall fuer jede Statusvariante plus Mismatch-Fall.

---

## 5) Testmatrix

1. **T1 Enum-Vollabdeckung**  
   Jede Statusvariante wird korrekt geparst.

2. **T2 Pflichtfeld-Missing**  
   Parser lehnt unvollstaendige Payload deterministisch ab.

3. **T3 Unerwarteter Zusatzstatus**  
   Mismatch wird sichtbar, nicht still akzeptiert.

4. **T4 Versionswechsel**  
   Neue Version wird nur mit expliziter Kompatibilitaetsregel verarbeitet.

5. **T5 End-to-End UI**  
   Typisierte Events fuehren zu erwartbarer Darstellung ohne Runtime-Casts.

---

## 6) Abnahmekriterien

- [ ] Kein produktives Kern-Event nutzt implizites `any`.
- [ ] Alle serverseitig realen Statuswerte sind typseitig abgedeckt.
- [ ] Schema-Mismatches sind sichtbar und telemetrisch zaehlbar.
- [ ] Keine stille Status-Degradierung in der UI.
- [ ] Regressionstests blockieren erneute Vertragsdrift.

Wenn eine gueltige Laufzeitvariante nicht typisiert ist, gilt der Auftrag als nicht bestanden.

