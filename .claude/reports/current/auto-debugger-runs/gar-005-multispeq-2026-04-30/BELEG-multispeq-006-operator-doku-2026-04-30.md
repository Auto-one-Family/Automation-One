# BELEG — MultispeQ-006: Operator-Doku

**run_id:** gar-005-multispeq-2026-04-30
**finding_id:** multispeq-006
**datum:** 2026-04-30
**kategorie:** unstructured (fehlende Bedienerdokumentation fuer neues Messprotokoll)
**layer:** Doku
**linear:** AUT-216

## Befund

Kein Operator-Handbuch fuer MultispeQ-Messung und Phyta-Upload vorhanden. Ohne SOP-Dokumentation:
- Mess-Confounder (Tageszeit, Far-Red, Dunkel-Adaption) werden nicht systematisch kontrolliert
- Audit-Trail-Pflichtfelder (calibration_date, plant_id, phase, qa_flag) werden nicht konsistent ausgefuellt
- Trigger-Fehlalarme durch falsche qa_flag-Befuellung

## Fachlicher Beleg (Mess-Methodik)

gar-002 §3 (Mess-Methodik): "Mid-Photoperiode mind. 4h nach Lichtstart, nicht in den letzten 90 min vor Lampe-AUS."
gar-002 §4 (Confounder): Far-Red 730 nm in Cannabis-Grow-LEDs interferiert mit MultispeQ-Saturation-Pulse.
gar-003 §F2 (Trigger-Voraussetzungen): "qa_flag muss 'clean' sein fuer scharfe Phi2-Trigger."

## Kanonische Stelle

docs/operator/ (neuer Ordner falls nicht vorhanden) oder bestehendes Onboarding-Verzeichnis.
