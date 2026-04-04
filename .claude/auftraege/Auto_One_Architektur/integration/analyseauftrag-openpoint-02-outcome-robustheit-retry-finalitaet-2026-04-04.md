# Analyseauftrag Open Point 02: Outcome-Robustheit unter Retry, Disconnect und Burst

**Typ:** Eigenstaendiger Analyseauftrag  
**Prioritaet:** P1  
**Ziel:** Sicherstellen, dass kritische Outcomes auch bei Publish-Fehlern final nachvollziehbar bleiben.

## 1) Problemkern

Lokale Aktorwirkung kann eintreten, waehrend Telemetrie-/Outcome-Publishes fehlschlagen.  
Wenn kein robuster Recoverypfad existiert, entsteht eine Luecke:

- Wirkung im Feld vorhanden,
- finaler Systemnachweis fehlt oder kommt verspätet/mehrfach.

## 2) Zielzustand

Fuer jeden kritischen Intent gilt immer:

1. command aufgenommen,
2. ausfuehrung festgestellt,
3. finaler outcome eindeutig persistiert,
4. duplicate/reorder verursachen keine finale Regression.

## 3) Pflichtanalyse

1. Klassifiziere Outcome-Pfade:
   - synchron publish,
   - retry publish,
   - persist-before-publish.
2. Definiere kritische Outcome-Klassen (nicht verlierbar).
3. Pruefe idempotente write-once Semantik fuer finale Zustaende.
4. Pruefe Verhalten bei:
   - duplicate messages,
   - out-of-order delivery,
   - reconnect waehrend in-flight.

## 4) Fixanforderungen

1. Kritische Outcomes ueber persistenten Zwischenpuffer (outbox-aehnlich) absichern.
2. Retry-Policy mit reason-codes und Limits.
3. Final-state write-once im Persistenzziel erzwingen.
4. Metriken:
   - `outcome_retry_count`,
   - `outcome_recovered_count`,
   - `outcome_drop_count_critical` (muss 0 sein).

## 5) Abnahmekriterien

- [ ] Kein kritischer Outcome geht unter Publish-Stoerung verloren.
- [ ] Finale Zustaende sind idempotent und regressionsfrei.
- [ ] E2E-Kette pro kritischem Intent ist nachweisbar.
- [ ] Fault-Injection (retry/disconnect/reorder) bleibt konsistent.

