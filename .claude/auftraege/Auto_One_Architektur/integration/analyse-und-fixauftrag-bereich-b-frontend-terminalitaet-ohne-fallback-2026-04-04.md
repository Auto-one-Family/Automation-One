# Analyse- und Fixauftrag Bereich B: Frontend-Terminalitaet ohne Latest-Pending-Fallback

**Stand:** 2026-04-04  
**Prioritaet:** P0  
**Typ:** Frontend Schwerpunkt (Intent-State-Maschine + Operator-Sicht)

---

## Hauptauftragsdokument (verbindliche Referenz)

- `/.claude/reports/current/auftragsserie-config-korrelation-restgaps-2026-04-04.md`
- Serienindex: `/.claude/auftraege/Auto_One_Architektur/integration/auftragsserie-config-korrelation-restgaps-2026-04-04.md`
- Basisvertrag aus Bereich A ist Pflichtvoraussetzung.

---

## Spezifischer Bereich dieses Auftrags

Dieser Auftrag eliminiert **heuristische Terminalisierung** im Frontend-Config-Pfad.  
Kernproblem: Ohne harte Korrelation kann "latest pending" bei parallelen Config-Intents falsch finalisieren.

Ziel: Kein Config-Intent wird terminal, solange kein eindeutiger Korrelationstreffer vorliegt.

---

## Scope (muss erledigt werden)

1. Entfernen des terminalen Best-Guess-Mappings fuer Config.
2. Eindeutige Finalisierung nur per `data.correlation_id`.
3. Bei fehlendem/inkonsistentem Treffer:
   - Contract-Signal emittieren
   - Pending nicht blind finalisieren
4. UI-/Operator-Sicht fuer "contract drift" klar von Domain-Failure trennen.

---

## Relevante Module

- `El Frontend/src/shared/stores/actuator.store.ts`
- `El Frontend/src/stores/esp.ts`
- `El Frontend/src/utils/contractEventMapper.ts`
- `El Frontend/src/types/websocket-events.ts`
- `El Frontend/src/components/system-monitor/EventDetailsPanel.vue`
- `El Frontend/src/components/system-monitor/UnifiedEventList.vue`

---

## Konsistenz- und Pattern-Regeln (verbindlich)

- Store-first: Semantik in Store/Mapper, nicht in Komponenten verdrahten.
- Contract-first: Terminalitaet nur aus terminalen Contract-Events.
- Keine stillen UI-Heilungen: Unknown/Mismatch muss sichtbar sein.
- Typstrikt arbeiten: Config-Eventtypen mit klaren Pflichtfeldern modellieren.
- Monitoring-freundlich: Contract-Fehler mit klarer Operator-Action ausgeben.

---

## Umsetzungsauftrag (konkret)

1. Intent-Handling in `actuator.store.ts` fuer Config:
   - Fallback `findLatestNonTerminalIntent(...)` aus Terminalpfad entfernen.
   - Fehlende Korrelation -> non-terminal Contract-Mismatch-Flow.
2. Event-Mapping in `contractEventMapper.ts` schaerfen:
   - Config-Terminalevent ohne `correlation_id` = `contract_mismatch`.
   - Unpassende Korrelation darf fremdes Intent nicht finalisieren.
3. Typen anpassen:
   - `correlation_id` Pflicht fuer Config-Terminalevents,
   - `request_id` optionaler Trace.
4. Operator-Darstellung:
   - In `EventDetailsPanel` und Eventliste klarer Zustand "nicht finalisierbar wegen Contract-Verletzung".

---

## Deliverables (pflichtig)

- Delta-Liste "entfernte heuristische Finalisierungswege"
- Typvertrag-Update fuer Config-Events
- UI-Nachweis fuer Contract-Mismatch-Zustand
- Kurze Wartbarkeitsnotiz: warum weniger Heuristik langfristig stabiler ist

---

## Testmatrix (Mindestumfang)

- T1: Zwei parallele Config-Intents auf gleicher ESP, out-of-order terminal.
- T2: Terminalevent ohne `correlation_id` erzeugt Contract-Mismatch und kein false terminal.
- T3: Terminalevent mit falscher `correlation_id` finalisiert kein fremdes Intent.
- T4: Happy Path (korrekte Korrelation) bleibt unveraendert stabil.

---

## Abnahmekriterien

- [ ] Kein Config-Intent wird ohne eindeutige Korrelation terminal gesetzt.
- [ ] Parallele Config-Intents bleiben sauber getrennt.
- [ ] Contract-Drift ist fuer Operatoren explizit sichtbar.
- [ ] Frontend bleibt pattern-konform (Store/Mapper zentriert, keine Component-Heuristik).

Wenn ein fehlkorreliertes Terminalevent weiterhin ein beliebiges offenes Config-Intent schliessen kann, gilt Bereich B als nicht bestanden.
