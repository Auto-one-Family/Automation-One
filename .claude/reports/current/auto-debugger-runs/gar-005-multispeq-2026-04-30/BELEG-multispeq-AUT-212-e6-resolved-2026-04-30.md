# BELEG — MultispeQ AUT-212 E6 Entscheidung Robin (2026-04-30)

**run_id:** gar-005-multispeq-2026-04-30
**finding_id:** multispeq-AUT-212-e6-resolved
**datum:** 2026-04-30
**linear:** AUT-212

## Entscheidung E6 — Library-Modul-Pfad

**Robin-Entscheidung (2026-04-30):** Top-Level — `src/integrations/<vendor>/` als verbindliche Konvention.

Begruendung Robin: "Mach es so dass kuenftig weitere Geraete hinzugefuegt werden koennten."

## Verbindlicher Pfad

```
src/integrations/multispeq/   (MultispeQ-Library, jetzt)
src/integrations/apogee/      (Apogee-Library, spaeter)
src/integrations/bluelab/     (Bluelab-Library, spaeter)
src/integrations/photone/     (Photone-Library, spaeter)
```

Das BLE-Adapter-Plugin (Stufe 2) bleibt unter dem Plugin-System — kein `integrations/`-Eintrag.
Es ist Konsument der Libraries unter `src/integrations/<vendor>/`, nicht Teil des Vendor-Namespace.

## Architektur-Argument

Top-Level-Konvention erlaubt Geschwister-Libraries (Apogee, Bluelab, Photone) ohne Refactor —
alle kuenftigen Drittgeraete-Libraries folgen demselben Muster. Ein neues Geraet = ein neuer
`src/integrations/<vendor>/`-Ordner + eine neue Library-Klasse. Kein Umbau bestehender
Integrations-Ordner noetig.

Haette man `src/sensors/integrations/multispeq/` gewaehlt, waere der Pfad im `sensors`-Namespace
versteckt — nicht passend fuer Geraete wie Bluelab-pH-Pen oder Apogee-Quantumsensor, die
konzeptuell ausserhalb der Standard-Sensor-Logik liegen.

## Auswirkung auf AUT-212

- Library-Pfad im Issue-Text von "offen (E6)" auf `src/integrations/multispeq/` gesetzt.
- Konvention `src/integrations/<vendor>/` als verbindlich verankert.
- Geschwister-Pattern dokumentiert.

## Kanonische Stelle

`src/integrations/multispeq/parser.py` — das ist der einzige Ablageort fuer MultispeQ-Parsing-Logik.
Kein Duplikat in `src/sensors/`, kein Duplikat in Ingress-Handler.
