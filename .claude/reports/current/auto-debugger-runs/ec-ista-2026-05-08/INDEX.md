# EC-Sensor IST-Analyse — Index

**Run-ID:** ec-ista-2026-05-08  
**Datum:** 2026-05-08  
**Typ:** Reine Analyse (kein Code geändert)

## Findings

| Finding | Schwere | Kurzbeschreibung |
|---------|---------|-----------------|
| [BELEG-EC-ISTA](BELEG-EC-ISTA-2026-05-08.md) | KRITISCH | cell_factor wird beim EC-Processing nicht angewendet |
| Patch 1 | KRITISCH | ec_sensor.py erkennt cell_factor nicht → Default-Pfad |
| Patch 2 | HOCH | Kein ATC-Mechanismus (Temperaturkompensation inaktiv) |
| Patch 3 | MITTEL | Kein Sample-Mittelwert im Kalibrier-Wizard |
| Patch 4 | NIEDRIG | Kein Kalibrierstand in der UI |

## Kern-Aussage

1-Punkt-Kalibrierung ist UI-seitig fertig, hat aber keinen Effekt weil `cell_factor` vom `ECSensorProcessor` nicht gelesen wird. Patch 1 in `ec_sensor.py` notwendig, bevor Robin kalibrieren kann.
