# Report F13: Notifications, Alerts, Quick Actions und Safety-Kette

Datum: 2026-04-05  
Scope: `El Frontend/src/components/notifications/**`, `El Frontend/src/components/quick-action/**`, `El Frontend/src/components/safety/EmergencyStopButton.vue`, `El Frontend/src/stores/esp.ts`, `El Frontend/src/shared/stores/notification-inbox.store.ts`, `El Frontend/src/shared/stores/alert-center.store.ts`, `El Frontend/src/shared/stores/quickAction.store.ts`, `El Frontend/src/composables/useToast.ts`

## 1) Ergebnis gegen Auftrag

- Inbox/Drawer/Badge-Lifecycle ist robust und nachvollziehbar umgesetzt.
- Priorisierung `critical > warning > info` ist ueber Inbox, Badge und FAB konsistent.
- **P0-Bruch bestaetigt:** Quick Action `global-emergency` ist nicht end-to-end wirksam; Event `emergency-stop-trigger` wird emittiert, aber nirgendwo konsumiert.
- Event-Fatigue ist kanaluebergreifend real (Toast, Inbox, Badge, Panel), mit nur teilweiser Entlastung.
- Batch-Actions sind funktional vorhanden (Batch-Acknowledge), aber nicht performant/atomar rueckgemeldet.

---

## 2) Safety-Quick-Action-Kette (vollstaendig) und Bruchstellen

## 2.1 Soll-Kette (kritische Aktion)

`User klickt Quick Action -> Safety-Intent wird ausgeloest -> serverseitige Ausfuehrung -> terminales Event success/failure/timeout -> eindeutige Finalitaetsanzeige fuer Operator`

## 2.2 IST-Kette (belegt)

| Schritt | IST-Pfad | Befund |
|---|---|---|
| Trigger | `useQuickActions.ts` -> Action `global-emergency` | dispatcht nur `window.dispatchEvent(new CustomEvent('emergency-stop-trigger'))` |
| Listener | Frontend-Suche nach `emergency-stop-trigger` | **kein Listener vorhanden** |
| Safety-Execution | `espStore.emergencyStopAll()` in `EmergencyStopButton.vue` waere wirksam | wird vom Quick-Action-Trigger nicht erreicht |
| Terminale Rueckmeldung | in `emergencyStopAll()` nur REST-Response + Toast + `fetchAll()` | keine korrelierte, explizite Terminalkette pro Quick-Action-Intent |

**P0-Bruch:** Trigger ohne nachgewiesenen wirksamen Listener.  
**Risiko:** Operator nimmt Notstopp als ausgefuehrt an, obwohl keine Aktion startet.

---

## 3) End-to-End-Tabelle (event -> store -> ui -> user action -> terminal state)

| Event | Store | UI | User Action | Terminal State (IST) |
|---|---|---|---|---|
| `notification_new` | `esp.store` Dispatcher -> `notification-inbox.handleWSNotificationNew` | `NotificationBadge`, `NotificationDrawer`, `QuickAlertPanel` | Drawer/FAB oeffnen, Item bearbeiten | Item ist sichtbar, `unreadCount` und Severity aktualisiert |
| `notification_updated` | `notification-inbox.handleWSNotificationUpdated` | Drawer/QuickPanel Item-Status | passiv oder Ack/Resolve Folgeaktion | Statuswechsel (`active`/`acknowledged`/`resolved`) sichtbar |
| `notification_unread_count` | `notification-inbox.handleWSUnreadCount` | Bell-Badge + FAB-Indikator | Bell/FAB anklicken | Authoritativer Count-Severity-Sync |
| `acknowledgeAlert(id)` | `alert-center.acknowledgeAlert` + Inbox-Update | QuickAlertPanel / NotificationItem | Klick `Bestaetigen` | Rueckkehr als `acknowledged` (REST + Folgeupdate) |
| `resolveAlert(id)` | `alert-center.resolveAlert` + Inbox-Update | QuickAlertPanel / NotificationItem | Klick `Erledigen` | Rueckkehr als `resolved` |
| `global-emergency` (Quick Action) | `quickAction.executeAction` -> `useQuickActions` handler | QuickActionMenu | Klick `Emergency Stop` | **kein terminaler Zustand, da kein Listener/kein Execution-Pfad** |
| TopBar Not-Aus | `EmergencyStopButton` -> `espStore.emergencyStopAll` -> `actuatorsApi.emergencyStop` | TopBar Dialog + Toast | Confirm `STOPP AUSFUEHREN` | REST-Erfolg/Fehler + Toast + `fetchAll()` (ohne korrelierten terminalen Intent-State) |

---

## 4) Event-Fatigue-Risiken je Kanal

| Kanal | IST-Mechanik | Risiko | Prioritaet |
|---|---|---|---|
| Toast | `useToast` dedup nur identische `message+type` in 2s | semantische Duplikate/Storms bleiben sichtbar; hohe Unterbrechung | P1 |
| Inbox | Deduplizierung nur per `notification.id` | gleiche Ursache mit neuer ID erscheint mehrfach | P1 |
| Badge | unresolved count oder unread count als Single-Number | verliert Ursachenkontext bei Burst, erzeugt Dauer-Alarmmodus | P2 |
| QuickAlertPanel | Top-5 Ausschnitt, Batch-Ack seriell (`for await`) | Last kann verlagert statt reduziert werden; "Alle" kann langsam/inkonsistent wirken | P1 |
| Safety-Quick-Action | Trigger ohne Wirkkette | falsches Sicherheitsgefuehl bei kritischer Aktion | **P0** |

---

## 5) Coalescing-/Sampling-/Bulk-Strategie mit Prioritaetsregeln (SOLL)

## 5.1 Prioritaetsregeln (global)

1. `critical` nie verwerfen, nie samplen.
2. `warning` coalescen pro Fingerprint, aber immer sichtbare Gruppenanzeige.
3. `info` darf zeitfensterbasiert gesampelt/zusammengefasst werden.
4. Safety-/Emergency-Ereignisse sind immer "foreground events" mit terminaler Finalitaet.

## 5.2 Coalescing (Inbox + Toast)

- Schluessel: `fingerprint || source+esp_id+category+title`.
- Fenster:
  - `critical`: nur gruppieren (Counter `xN`), keine Unterdrueckung.
  - `warning`: gruppieren in 10s-Fenster.
  - `info`: gruppieren in 30s-Fenster.
- Anzeige:
  - Erstereignis sichtbar, Folgeereignisse erhoehen Counter und `last_seen`.
  - Toast statt N Einzel-Toasts: "`Pumpenalarm Zone A (x7 in 30s)`".

## 5.3 Sampling (nur niedrige Prioritaet)

- Nur fuer `info` und nur wenn Kanalrate > Schwellwert.
- Vorschlag: max. 1 info-toast pro 5s und Quelle, Rest in Sammeltoast.
- Drawer bleibt vollstaendig (Audit/Trace), aber Default-View fokussiert auf `critical+warning`.

## 5.4 Bulk-Strategie (Ack/Resolve)

- API-Bulk-Endpunkte: `acknowledge_bulk(ids[])`, `resolve_bulk(ids[])`.
- UI-Rueckmeldung immer dreiteilig:
  - Gesamt: `x/y erfolgreich`
  - Fehlerliste (Top-N IDs/Grund)
  - Option "Fehlgeschlagene erneut versuchen"
- Damit wird "Alle bestaetigen" konsistent und performant rueckgemeldet.

---

## 6) Finalitaetsanzeige fuer kritische Quick Actions (Spezifikation)

## 6.1 Zustandsmodell (operator visible)

`idle -> pending -> terminal_success | terminal_failed | terminal_timeout | terminal_integration_issue`

## 6.2 Mindestanforderung fuer `Emergency Stop` Quick Action

- Beim Klick wird ein **tracked intent** erzeugt (mit `correlation_id` oder lokalem `intent_id`).
- `pending` sofort sichtbar (nicht nur "Toast gesendet").
- Terminal nur durch eindeutige Abschlussbedingung:
  - success: serverseitig bestaetigt
  - failed: expliziter Fehler
  - timeout: definierte Frist ohne terminales Ereignis
  - integration_issue: Contract-Mismatch oder unaufloesbarer Zustand
- UI:
  - Safety-Panel oder Modal mit Statuschip + Zeit + letztem Grund.
  - Bei `timeout`/`integration_issue` persistent und eskaliert (nicht auto-dismiss).

## 6.3 Verbindliche Ausgabefelder

- `action_id`, `started_at`, `terminal_at`, `result`, `affected_devices`, `affected_actuators`, `reason_code?`, `operator_next_step`.

---

## 7) Risiko-Matrix (P0/P1/P2)

| ID | Thema | Wahrscheinlichkeit | Auswirkung | Prioritaet |
|---|---|---|---|---|
| R1 | `global-emergency` ohne wirksamen Listener | hoch | sehr hoch (Safety-Bedienfehler) | **P0** |
| R2 | fehlende terminale Finalitaetsanzeige fuer kritische Quick Actions | mittel | hoch | **P0** |
| R3 | Toast/InBox Event-Fatigue ohne echtes Coalescing | hoch | mittel-hoch | P1 |
| R4 | Batch-Ack seriell statt Bulk mit Ergebnisvertrag | mittel | mittel | P1 |
| R5 | Badge als aggregiertes Signal ohne Ursachenfokus | hoch | mittel | P2 |

---

## 8) Akzeptanzkriterien-Bewertung

| Kriterium | Status | Nachweis |
|---|---|---|
| Notstopp-Quick-Action hat nachweisbare Wirkkette oder klaren Fehlerendzustand | **nicht erfuellt** | Trigger vorhanden, Listener/Execution fehlt |
| Event-Fatigue messbar reduziert | **teilweise / nicht erfuellt** | nur begrenzte Dedup-Logik im Toast, keine kanalweite Strategie |
| Bulk-Actions liefern konsistente Ergebnisrueckmeldung | **nicht erfuellt** | Batch-Ack seriell ohne atomare Ergebnisaggregation |

---

## 9) Tests/Nachweise (E2E-Spezifikation)

## 9.1 E2E `notification_new` bis ack/resolve

1. `notification_new` injizieren.  
2. Erwartung: Badge/FAB/Drawer synchron aktualisiert.  
3. `acknowledge` aus QuickAlertPanel.  
4. Erwartung: Status `acknowledged`, Stats angepasst.  
5. `resolve` aus Drawer Item.  
6. Erwartung: Status `resolved`, unresolved count sinkt.

## 9.2 E2E emergency quick action (success/failure/timeout)

1. QuickAction `global-emergency` ausloesen.
2. Success-Fall: terminal_success innerhalb Timeoutfenster, Ergebniszahlen sichtbar.
3. Failure-Fall: terminal_failed mit Fehlergrund und persistenter Anzeige.
4. Timeout-Fall: terminal_timeout mit klarer Operator-Naechstaktion.

**IST:** dieser Test scheitert bereits im ersten Schritt (kein wirksamer Listener).

---

## 10) Umsetzungsfahrplan (kurz)

1. **P0 sofort:** `global-emergency` an reale Safety-Execution anbinden (Store-Action statt unverdrahtetes Window-Event).  
2. **P0 direkt danach:** Finalitaets-Statusmodell fuer kritische Quick Actions in UI verankern.  
3. **P1:** kanalweite Coalescing-/Sampling-Logik + Bulk-Ack/Resolve Endpoint/Client.  
4. **P2:** Badge-/Panel-Fokus fuer Operator Attention weiter schaerfen.

