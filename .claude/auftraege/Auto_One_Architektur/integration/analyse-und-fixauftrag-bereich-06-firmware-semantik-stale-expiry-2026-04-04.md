# Analyse- und Fixauftrag Bereich 06: Firmware-Semantikbereinigung fuer Stale-/Expiry-Ursachen

**Stand:** 2026-04-04  
**Prioritaet:** P1  
**Ziel:** Sammelcodes fuer stale/expired auf ursachenscharfe, operativ nutzbare Codefamilien aufteilen.

---

## 1) Problemmechanik (fachlich erklaert)

Stale und Expiry sind keine identischen Fehler:

- **Stale durch Scope-Wechsel:** Der Kontext hat sich geaendert, der Intent ist fachlich ueberholt.
- **Expiry durch TTL:** Der Intent ist zeitlich zu alt.
- **Invalidierung durch Safety-Epoch:** Der Sicherheitskontext wurde absichtlich gewechselt.

Wenn diese Ursachen in einem Sammelcode landen, gehen drei Dinge verloren:

1. korrekte Retry-Entscheidung,
2. korrekte Ursachenstatistik,
3. korrekte Operator-Anweisung.

---

## 2) Sollbild

Es existieren disjunkte Ursachecodes mit klarer Retry-Semantik:

- `STALE_SCOPE` -> Retry meist sinnvoll nach Kontextaktualisierung.
- `EXPIRED_TTL` -> Retry nur mit neuem Intent.
- `INVALIDATED_EPOCH` -> Retry nur nach Safety-Freigabe.
- optional weitere disjunkte Klassen fuer Queue-Replay-Expiry.

Jeder Code ist terminalitaets- und handlungsbezogen eindeutig.

---

## 3) Pflichtanalyse

1. Inventar aller Pfade, die aktuell stale/expired ausloesen.
2. Ursachenmapping je Pfad:
   - Kontextwechsel,
   - Zeitablauf,
   - Safety-Epoch-Wechsel,
   - Replay-Ueberalterung.
3. Analyse der heutigen Fehlklassifikation:
   - zu grobe Sammelcodes,
   - falsche Retry-Automatik,
   - unklare Operatorhinweise.
4. Pruefung auf Seiteneffekte:
   - beeinflusst Codeaufspaltung bestehende Deduplizierung?
   - beeinflusst sie Session-Kennzahlen?

---

## 4) Fixauftrag

## F1 - Codefamilie trennen

- Ersetze Sammelcodes durch disjunkte Ursachecodes.
- Dokumentiere je Code:
  - Bedeutung,
  - Terminalitaet,
  - Retry-Regel,
  - Operator-Aktion.

## F2 - Emissionsregeln verhaerten

- Jeder stale/expiry-Pfad emittiert exakt den dazugehoerigen Ursachecode.
- Keine nachtraegliche unscharfe Zusammenfuehrung in spaeteren Schichten.

## F3 - Server/UI-Mitnahme

- Stelle sicher, dass alle neuen Codes in Normalisierung, Metrik und UI enthalten sind.
- Unknown-Fallback fuer diese Codefamilie ist unzulaessig.

## F4 - Kennzahlen aktualisieren

- Fuehre getrennte Zaehler je Ursachecode ein.
- Ermoegliche Trendanalyse pro Ursacheklasse.

---

## 5) Testmatrix

1. **T1 Scope-Wechsel**  
   Intent endet mit `STALE_SCOPE`.

2. **T2 TTL-Ueberschreitung**  
   Intent endet mit `EXPIRED_TTL`.

3. **T3 Safety-Epoch-Wechsel**  
   Intent endet mit `INVALIDATED_EPOCH`.

4. **T4 Replay-Ueberalterung**  
   Outcome ist ursachenscharf, nicht Sammelcode.

5. **T5 End-to-End Darstellung**  
   UI zeigt pro Ursache unterschiedliche Handlungsempfehlung.

---

## 6) Abnahmekriterien

- [ ] Kein Sammelcode fuer stale/expired in terminalen Outcomes.
- [ ] Jede Ursacheklasse hat eigene Kennzahlen.
- [ ] Retry-Regeln unterscheiden sich korrekt nach Ursache.
- [ ] Server und UI interpretieren die neuen Codes konsistent.
- [ ] Operatoren erhalten ursachenscharfe, umsetzbare Hinweise.

Wenn stale-/expiry-Faelle weiterhin nicht trennscharf klassifiziert sind, gilt der Auftrag als nicht bestanden.

