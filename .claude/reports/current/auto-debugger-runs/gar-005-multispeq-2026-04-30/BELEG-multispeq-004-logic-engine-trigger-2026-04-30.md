# BELEG — MultispeQ-004: Logic Engine Cannabis-Trigger

**run_id:** gar-005-multispeq-2026-04-30
**finding_id:** multispeq-004
**datum:** 2026-04-30
**kategorie:** tracing-gap (keine Trigger-Regeln fuer Photosynthese-Stresserkennung Cannabis)
**layer:** Server
**linear:** AUT-214

## Befund

Die Logic-Engine (cross_esp_logic-Tabelle) hat keine Regeln fuer MultispeQ-Parameter.
Zus.: Condition-Typ fuer metadata-JSON-Felder (phase, qa_flag) fehlt.

## Cannabis-Fachlicher Kontext (Beleg)

Kim 2025 (DOI 10.3389/fpls.2025.1687794): PPFD < 600 µmol in Bluetephase = messbar reduzierte CBD-Biosynthese (+36,9% Total CBD bei 600 vs. 200 µmol).
Baker 2008 (DOI 10.1146/annurev.arplant.59.032607.092759): Phi2 < 0,50 = messbare PSII-Stressreaktion.
Schwellwerte sind Pilothypothesen -- empirische Validierung Saison 2026.

## Kanonische Stelle

cross_esp_logic-Tabelle + logic_engine.py -- neue Regeln eintragen, bestehende Logik NICHT ersetzen.
Bestehender Logic-Engine-Trigger nach sensor_handler INSERT: Memory "WS-Broadcast, Threshold-Eval, VPD-Hook, Logic-Engine-Trigger" -- dieser Hook muss analog nach multispeq_ingress_handler INSERT aufgerufen werden.
