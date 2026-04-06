# Auftrag F13: Notifications, Alerts, Quick Actions

## Ziel
Analysiere das Reaktionssystem fuer Ereignisse: Priorisierung, Sichtbarkeit, Bedienbarkeit und Risiken durch Eventflut.

## IST-Wissen aus dem Frontend
- Notifications kommen ueber WS-Events und teils REST-Backlog.
- Inbox/Badge/Toast werden von Notification-Stores gesteuert.
- Quick Actions greifen in operative Fluesse ein.

## Scope
- `El Frontend/src/components/notifications/**`
- `El Frontend/src/components/quick-action/**`
- `El Frontend/src/shared/stores/notification.store.ts`
- `El Frontend/src/shared/stores/notification-inbox.store.ts`
- `El Frontend/src/shared/stores/alert-center.store.ts`
- `El Frontend/src/shared/stores/quickAction.store.ts`

## Analyseaufgaben
1. Kartiere End-to-end-Kette Event -> Store -> Badge/Toast/Drawer -> Useraktion.
2. Pruefe Priorisierung, unread-Zaehlung, read/ack-Status und Persistenz.
3. Analysiere Quick-Action-Auswirkungen auf Zielworkflows.
4. Bewerte Spam-/Duplikat-/Deduplizierungsrisiken.

## Pflichtnachweise
- Notification-Event -> UI-Element -> Benutzerreaktion -> Folgezustand.
- Quick-Action-Trigger -> Zielpfad -> sichtbare Rueckmeldung.

## Akzeptanzkriterien
- Kritische Alerts sind klar von Info-Meldungen getrennt.
- Event-Fatigue-Risiken sind mit Gegenmassnahmen beschrieben.

## Report
`.claude/reports/current/frontend-analyse/report-frontend-F13-notifications-quick-actions-2026-04-05.md`
