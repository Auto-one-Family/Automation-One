# Auftrag F02: Design-System, Tokens, Stilkonsistenz

## Ziel
Pruefe, ob visuelle Semantik konsistent ueber Tokens gesteuert wird oder ob hardcoded Style-Drift Risiken erzeugt.

## IST-Wissen aus dem Frontend
- Token-Basis liegt in `styles/tokens.css` und Design-Ordnern.
- In mehreren Views/Komponenten kommen Hex-Farben vor.
- Besonders Ops-/Rule-Bereiche zeigen potenzielle Farbdrifts.

## Scope
- `El Frontend/src/shared/design/**`
- `El Frontend/src/styles/**`
- `El Frontend/src/style.css`
- `El Frontend/tailwind.config.ts`
- Betroffene `.vue` mit Hardcoded-Farben

## Analyseaufgaben
1. Dokumentiere Token-Hierarchie (semantisch vs. technisch) und Ableitungslogik.
2. Quantifiziere Hardcoded-Farbdrift (`#rrggbb`) nach Bereich und UI-Kritikalitaet.
3. Kartiere Pattern-Layer: Primitive -> Compound -> View.
4. Bewerte Fokus-/Kontrast-/Disabled-Zustaende in kritischen Oberflaechen.

## Pflichtnachweise
- Mapping: UI-Status -> verwendeter Token/Farbwert.
- Liste aller Hotspots mit Datei, Komponente, Risiko.

## Akzeptanzkriterien
- Jede Driftstelle ist priorisiert (P0/P1/P2).
- Sichtbar, welche Drifts sofortes Risiko (Fehlinterpretation, A11y) erzeugen.

## Report
`.claude/reports/current/frontend-analyse/report-frontend-F02-design-tokens-konsistenz-2026-04-05.md`
