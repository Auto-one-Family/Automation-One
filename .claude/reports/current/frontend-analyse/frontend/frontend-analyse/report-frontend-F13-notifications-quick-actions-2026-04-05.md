# Report F13: Notifications, Alerts, Quick Actions

Datum: 2026-04-05  
Scope: `El Frontend/src/components/notifications/**`, `El Frontend/src/components/quick-action/**`, `El Frontend/src/shared/stores/notification.store.ts`, `El Frontend/src/shared/stores/notification-inbox.store.ts`, `El Frontend/src/shared/stores/alert-center.store.ts`, `El Frontend/src/shared/stores/quickAction.store.ts`

## 1) Executive Result

- Die End-to-End-Kette ist fuer Inbox/Drawer robust umgesetzt: WS-Event -> Dispatcher im `esp.store` -> `notification-inbox.store` -> Badge/Drawer/Item-Actions -> REST-Lifecycle (`acknowledge`/`resolve`) -> Store-Update.
- Kritische Alerts sind visuell klar von Info getrennt (Severity-Dot, Badge-Farben, Critical-Pulse, Status-Badges `Aktiv/Gesehen/Erledigt`).
- Quick Actions greifen wirksam in operative Fluesse ein (Alert-Panel, Navigation, Widget/Dashboard, Diagnose, Backup) und liefern in der Regel sofort sichtbares Feedback.
- Es gibt einen kritischen Bruch im Safety-Quick-Action: `global-emergency` dispatcht nur `emergency-stop-trigger`, aber es existiert kein Listener im Frontend; damit ist der Quick-Action-Notstopp aktuell wirkungslos.
- Event-Fatigue-Risiko ist real: keine Toast-Deduplizierung, nur ID-basierte Inbox-Deduplizierung, Batch-Acknowledge seriell, WS-Rate-Limit nur als Logging-Warnung ohne echte Drosselung.

---

## 2) End-to-End-Kette Event -> Store -> UI -> Useraktion -> Folgezustand

| Eingangs-Event | Store-Pfad | UI-Element | Useraktion | Folgezustand |
|---|---|---|---|---|
| `notification_new` | `esp.store.handleNotificationNew` -> `notificationInbox.handleWSNotificationNew` | `NotificationBadge`, `NotificationDrawer`, `QuickAlertPanel` | Drawer oeffnen, Item expandieren, Ack/Resolve | `notifications[]` ergaenzt, `unreadCount++`, `highestSeverity` ggf. angehoben |
| `notification_updated` | `esp.store.handleNotificationUpdated` -> `notificationInbox.handleWSNotificationUpdated` | Drawer-Liste/Item-Status | keine Pflichtaktion (passiv) | Item-Status (`is_read`, `status`, `acknowledged_at`, `resolved_at`) aktualisiert |
| `notification_unread_count` | `esp.store.handleNotificationUnreadCount` -> `notificationInbox.handleWSUnreadCount` | Bell-Badge, FAB-Alertindikator | Bell/FAB klicken | Authoritative Badge-Sync (`unreadCount`, `highestSeverity`) |
| `notification` (legacy toast) | `esp.store.handleNotification` -> `notificationStore.handleNotification` | ToastContainer | nur Sichtung | Transienter Toast (high -> `warning` + persistent) |
| `error_event` | `esp.store.handleErrorEvent` -> `notificationStore.handleErrorEvent` | ToastContainer + optional "Details" Action | Klick "Details" | CustomEvent `show-error-details` -> `ErrorDetailsModal` in `App.vue` |
| `system_event` | `esp.store.handleSystemEvent` -> `notificationStore.handleSystemEvent` | ToastContainer | nur Sichtung | Info-Toast |

Nachweis der UI-Verankerung:
- Globale Drawer-Mount in `App.vue`, dadurch von allen Routen erreichbar.
- Bell/Statusbar in `TopBar.vue`, FAB global in `AppShell.vue`.
- Alerts auch als sekundarer Einstieg in `HealthSummaryBar` und `AlarmListWidget`.

---

## 3) Priorisierung, Unread, Ack/Read, Persistenz

## 3.1 Priorisierung

- Severity-Prioritaet ist konsistent als `critical > warning > info` (Store-Sortierung in Inbox/QuickAlert).
- Badge-Farb-Logik priorisiert unresolved Alerts aus `alert-center` vor reinen Inbox-Unreads.
- Drawer trennt zusaetzlich nach Status (`Aktiv`, `Gesehen`, `Erledigt`) und Quelle (`Sensor`, `Infrastruktur`, `Aktor`, `Regel`, `System`).

## 3.2 Read/Ack/Resolve

- `markAsRead`/`markAllAsRead`: REST-Aufruf + optimistische lokale Markierung; finaler Count via `notification_unread_count`.
- `acknowledgeAlert`/`resolveAlert`: REST-Aufruf, lokale Listen-Updates, danach Stats-Refresh.
- Lifecycle ist damit fuer Operator sichtbar und manipulierbar.

## 3.3 Persistenz

- Persistente Datenbasis: Notification-API (`loadInitial`, `loadMore`, Alert-Stats, Active-Alerts).
- Realtime dient als Delta-Transport, nicht als alleinige Quelle.
- Browser-Notifications nur fuer `critical`, permission-gesteuert.

---

## 4) Pflichtnachweis A: Notification-Event -> UI -> Reaktion -> Zustand

Beispiel `notification_new` (Alert):

1. WS liefert `notification_new`.
2. Dispatcher im `esp.store` delegiert an Inbox-Store.
3. Inbox unshiftet Item, erhoeht `unreadCount`, aktualisiert `highestSeverity`.
4. `NotificationBadge` und FAB (`quickAction.alertSummary`) werden reaktiv aktualisiert.
5. User oeffnet Drawer/FAB-Panel und klickt `Bestaetigen` oder `Erledigen`.
6. `alert-center.store` ruft REST auf, aktualisiert Listen und Stats; Folgezustand wird direkt sichtbar.

Beispiel `error_event`:

1. WS liefert `error_event`.
2. `notification.store` erzeugt persistenten Error-Toast, optional mit Action `Details`.
3. User klickt `Details`.
4. `show-error-details` Event oeffnet `ErrorDetailsModal` in `App.vue`.
5. Operator sieht Troubleshooting-Daten (Fehlercode, Severity, Context).

---

## 5) Pflichtnachweis B: Quick-Action-Trigger -> Zielpfad -> Rueckmeldung

| Trigger | Zielpfad | Sichtbares Feedback |
|---|---|---|
| FAB -> `Alert-Panel` | `quickAction.activePanel='alerts'` -> `QuickAlertPanel` | Top-5 Alerts, Statusfilter, Ack/Resolve, "Alle Alerts anzeigen" |
| `QuickAlertPanel` -> `Alle Alerts anzeigen` | schliesst FAB, oeffnet Drawer | Drawer sichtbar mit vollstaendiger Inbox |
| `QuickAlertPanel` -> `Stummschalten` | `sensorsApi.updateAlertConfig` + `acknowledge` | Toast Erfolg/Fehler + optional Snooze-Timer |
| `QuickNavPanel` -> Route | `router.push(path)` | Routenwechsel + FAB schliesst |
| `QuickWidgetPanel` (monitor) | emit `widget-selected` | Add-Widget-Dialog oeffnet in Monitor-Flow |
| `global-backup-create` | `backupsApi.createBackup()` | indirekt ueber API/Toast-Handling |

Kritischer Gegenbeleg:
- `global-emergency` sendet nur `window.dispatchEvent('emergency-stop-trigger')`; ein passender Listener existiert im Frontend nicht. Der Trigger hat aktuell keinen operativen Effekt.

---

## 6) Spam-, Duplikat- und Event-Fatigue-Risiken

## R1 (hoch): Safety-Quick-Action ohne Wirkung

- Befund: Event wird dispatcht, aber nirgendwo konsumiert.
- Risiko: Operator erwartet Notstopp ueber Quick Action, aber es passiert nichts.
- Impact: Safety-Kette im Shortcut-Pfad gebrochen.

## R2 (mittel): Toast-Flood bei Eventspitzen

- Befund: `notification.store` zeigt fuer `notification`/`error_event` direkt Toasts; keine lokale Deduplizierung/Coalescing.
- Risiko: Eventflut ueberdeckt relevante Meldungen.
- Impact: Attention-Drain, erhoehte Fehlbedienung.

## R3 (mittel): WS-"Rate-Limit" nur observability, keine Steuerung

- Befund: `checkRateLimit()` loggt Warnung bei >10 msg/s, drosselt aber nicht.
- Risiko: Unter Burst bleibt volle Last auf UI-Pfad.
- Impact: Jank/Verzoegerungen in Alerts- und Eventdarstellung.

## R4 (mittel): Batch-Acknowledge seriell (N API-Calls)

- Befund: "Alle bestaetigen" in `QuickAlertPanel` fuehrt sequenziell je Alert REST-Call aus.
- Risiko: bei vielen Alerts langsam, teilweiser Erfolg moeglich.
- Impact: inkonsistente Operator-Wahrnehmung ("Alle" geklickt, aber noch aktive Alerts sichtbar).

## R5 (niedrig-mittel): Inbox-Deduplizierung nur per `id`

- Befund: Duplikat-Schutz nutzt nur `notification.id`.
- Risiko: semantische Duplikate mit neuer ID bleiben sichtbar.
- Impact: erhoehte Event-Fatigue trotz technisch korrekter Events.

---

## 7) Akzeptanzkriterien-Bewertung

- "Kritische Alerts klar von Info getrennt": **erfuellt** (Severity-Farben, Pulse, Status-Badges, AlertStatusBar/FAB).
- "Event-Fatigue-Risiken mit Gegenmassnahmen beschrieben": **erfuellt**, zentrale Risiken R1-R5 identifiziert; priorisierte Maßnahmen unten.

---

## 8) Empfohlene Gegenmassnahmen (priorisiert)

## P0 (sofort): Emergency Quick Action funktional anbinden

- Option A: in `EmergencyStopButton` Listener fuer `emergency-stop-trigger` registrieren und bestaetigten Notstopp-Dialog oeffnen.
- Option B: `global-emergency` nicht per Event, sondern ueber dedizierte Store-Action + bestaetigenden UI-Flow.

## P1: Alert/Toast-Deduplizierung und Coalescing

- Zeitfensterbasiertes Gruppieren identischer Toasts (`title+source+esp_id`) mit Counter.
- Optionales Quieting fuer `info` bei hohem Volumen.

## P1: Batch-Ack auf Server-Bulk-Endpoint umstellen

- Ein Call fuer mehrere IDs inkl. Rueckgabe partieller Fehler.
- UI: klares Ergebnis "x/y bestaetigt".

## P2: Operator-fokussierte Fatigue-Controls

- Priorisierte Inbox-Defaultansicht (`critical+warning` zuerst), Info optional einklappbar.
- Pro Quelle adaptive Sampling/Collapse bei Burst.

## P2: Touch-UX in QuickNav verbessern

- Favoriten-Buttons nicht hover-only verstecken; auf Touch dauerhaft sichtbar (wie bereits in `QuickDashboardPanel`).

