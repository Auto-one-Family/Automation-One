# Auftrag F05: WebSocket, Realtime-Verarbeitung, Contract-Drift

## Ziel
Beweise end-to-end, wie WS-Events im Frontend verarbeitet werden und wo Eventvertrag und Typsystem auseinanderlaufen.

## IST-Wissen aus dem Frontend
- ESP-Store nutzt kanonische Eventliste in `esp-websocket-subscription.ts`.
- System-Monitor arbeitet mit erweiterter Eventliste in `contractEventMapper.ts`.
- Event-Drift gegen `MessageType` ist bereits sichtbar.

## Scope
- `El Frontend/src/services/websocket.ts`
- `El Frontend/src/composables/useWebSocket.ts`
- `El Frontend/src/stores/esp.ts`
- `El Frontend/src/stores/esp-websocket-subscription.ts`
- `El Frontend/src/types/index.ts`
- `El Frontend/src/utils/contractEventMapper.ts`

## Analyseaufgaben
1. Erstelle Event-Matrix: Producer, Consumer, Handler, Mutationstyp, UI-Auswirkung.
2. Dokumentiere Reconnect-/Subscription-Lebenszyklus inkl. Filter und Re-Init.
3. Pruefe Race-Risiken bei Burst-Events und beim Store-Init.
4. Identifiziere Contract-Drift zwischen Runtime-Strings und Typsystem.

## Pflichtnachweise
- Ablauf: WS Push -> Handler -> Store -> gerenderte Aenderung.
- Ablauf: WS-Ausfall -> Fallback/Status -> Recovery-Verhalten.

## Akzeptanzkriterien
- Jedes produktive Event hat klare Ownership.
- Jede Driftstelle hat konkrete Auswirkung und Folgeauftrag.

## Report
`.claude/reports/current/frontend-analyse/report-frontend-F05-websocket-realtime-contract-2026-04-05.md`
