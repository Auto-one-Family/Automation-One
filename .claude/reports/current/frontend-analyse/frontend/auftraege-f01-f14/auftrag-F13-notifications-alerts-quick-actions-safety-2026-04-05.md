# Auftrag F13: Notifications, Alerts, Quick Actions und Safety-Kette

> **Typ:** Analyseauftrag  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend / F13  
> **Prioritaet:** P0

## Relevantes Wissen (kompakt und verbindlich)
- Notification-System ist fuer Operator-Aufmerksamkeit und Priorisierung zentral.
- Quick Actions duerfen nur dann als sicher gelten, wenn End-to-End-Wirksamkeit nachweisbar ist.
- Event-Fatigue ist in Realtime-Systemen ein echtes Sicherheitsrisiko.
- Safety-Aktionen brauchen terminale Rueckmeldung, nicht nur Trigger-Toast.

## IST-Befund
- Inbox/Drawer/Badge-Lifecycle ist robust umgesetzt.
- Priorisierung (`critical > warning > info`) und Alert-Lifecycle sind vorhanden.
- Kritischer Bruch: `global-emergency` Trigger ist ohne nachgewiesenen wirksamen Listener.
- Toast-Coalescing und echte Lastentlastung fehlen bzw. sind unzureichend.

## SOLL-Zustand
- Safety-Quick-Action ist nachweisbar wirksam bis terminalem Ergebnis.
- Notification-Last wird priorisiert, dedupliziert und fuer Operatoren fokussiert aufbereitet.
- Batch-Actions sind performant und konsistent rueckgemeldet.

## Analyseauftrag
1. Safety-Quick-Action-Kette vollstaendig nachzeichnen und Bruchstellen belegen.
2. Event-Fatigue-Risiken pro Kanal erfassen (toast, inbox, badge, panel).
3. Coalescing-/Sampling-/Bulk-Strategie mit Prioritaetsregeln definieren.
4. Finalitaetsanzeige fuer kritische Quick Actions spezifizieren.

## Scope
- **In Scope:** notification stores/components, quick-action flows, alert lifecycle.
- **Out of Scope:** firmwareseitige Safety-Implementation.

## Nachweise
- End-to-End-Tabelle `event -> store -> ui -> user action -> terminal state`.
- Risiko-Matrix mit Prioritaet P0/P1/P2.

## Akzeptanzkriterien
- Notstopp-Quick-Action hat nachweisbare Wirkkette oder klaren Fehlerendzustand.
- Event-Fatigue wird messbar reduziert (Deduplizierung/Coalescing).
- Bulk-Actions liefern konsistente Ergebnisrueckmeldung.

## Tests/Nachweise
- E2E: `notification_new` bis ack/resolve.
- E2E: emergency quick action mit success/failure/timeout-Fall.
