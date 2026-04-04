# Bereich 10 - Integrationsrisiken und Umsetzungsfahrplan (IST-Revision 2026-04-04)

> Fokus: Priorisierung, Go/No-Go-Gates und durchgaengige Integrationsumsetzung.

## 1) Was war veraltet?

- Die alte Fassung war risikoorientiert, aber ohne einheitlichen 4-Block-IST-Rahmen.
- Integrationsrisiken waren benannt, jedoch nicht als konsolidierte Gate-Logik je Prioritaetsstufe verdichtet.

## 2) Was ist jetzt der IST-Stand?

- `FA-INT-001`: Kritische Risiken sind benannt, aber ohne verpflichtende technische Release-Gates.
- `FA-INT-002`: Canonical Error-Codes sind definiert, Mapping ueber alle Schichten bleibt migrationskritisch.
- `FA-INT-003`: Reconciliation-Session ist konzeptionell vorhanden, aber ohne harte Done-Matrix.
- `FA-INT-004`: Reihenfolge bleibt serverzentriert; Firmware-Negativpfade sind zeitweise nur teilstandardisiert.
- `FA-INT-005`: Fault-Injection ist geplant, aber nicht als dauerhafter Regression-Block abgesichert.

## 3) Welche Restluecken bleiben?

- **P0:** `FA-INT-001`, `FA-INT-002`, `FA-INT-003`.
- **P1:** `FA-INT-004`, `FA-INT-005`.

## 4) Was wurde in der Datei konkret angepasst?

- Auf einheitliches IST-Revisionsformat umgestellt.
- Integrationsrisiken als Gate-orientierte Prioritaetscluster konsolidiert.
- Abnahmekriterien fuer Go/No-Go und dauerhafte Regressionserzwingung ergaenzt.

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn P0/P1-Risiken jeweils mit technischem Gate-Charakter erfasst sind.
- **Nicht bestanden**, wenn Fahrplanpunkte ohne verbindliche Abschlusskriterien verbleiben.

