# Auftrag F03: Pinia, State-Ownership, Inter-Store-Kommunikation

## Ziel
Lege offen, welcher Store welche Wahrheit besitzt, wie Updates durch das System laufen und wo implizite Kopplung Risiko erzeugt.

## IST-Wissen aus dem Frontend
- `shared/stores` traegt Domainen/UI-Store-Logik.
- `stores/esp.ts` ist zentrale WS- und Device-Orchestrierung.
- Merge-vs-Replace ist nicht ueberall einheitlich dokumentiert.

## Scope
- `El Frontend/src/shared/stores/*.store.ts`
- `El Frontend/src/shared/stores/index.ts`
- `El Frontend/src/stores/esp.ts`
- `El Frontend/src/stores/esp-websocket-subscription.ts`

## Analyseaufgaben
1. Erstelle Ownership-Matrix: SSoT, Derived, Transient je Store.
2. Zerlege Inter-Store-Aufrufketten inkl. Seiteneffekte.
3. Pruefe lokale Persistenz (localStorage/session) und Driftpotenziale.
4. Dokumentiere Mutationssemantik je Kernentity (Device/Sensor/Actuator/Notification).

## Pflichtnachweise
- Ablauf: REST-Response -> Mutation -> Reaktivitaet in View.
- Ablauf: WS-Event -> `esp.ts` -> Zielstore -> UI-Effekt.

## Akzeptanzkriterien
- Fuer jeden produktiven Store sind Input, Output, Seiteneffekt und Risiko benannt.
- Implizite Kopplungen sind als P-Risiko klassifiziert.

## Report
`.claude/reports/current/frontend-analyse/report-frontend-F03-pinia-state-ownership-2026-04-05.md`
