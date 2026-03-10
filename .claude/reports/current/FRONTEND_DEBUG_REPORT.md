# Frontend Debug Report

**Erstellt:** 2026-03-10
**Modus:** B (Spezifisch: "T16-V2 Verifikation — Block A V-SS-03 und Block D V-AK-02 bis V-AK-04")
**Quellen:** Source-Code-Analyse (7 Dateien direkt, 2 via grep)

---

## 1. Zusammenfassung

Alle vier Verifikationspunkte konnten vollstaendig beantwortet werden.
V-SS-03: `ActuatorCard.vue` hat vollstaendige Offline- und Stale-Unterstuetzung, die mit `SensorCard.vue` paritaetisch ist — **eine Luecke**: der Toggle-Button wird nur bei `emergency_stopped` deaktiviert, NICHT bei `isEspOffline`. V-AK-02 bis V-AK-04: Alle drei Komponenten existieren und sind vollstaendig implementiert. Kein kritischer Fehler. Eine mittlere Luecke bei V-SS-03 (Toggle bei Offline nicht deaktiviert).

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `El Frontend/src/components/devices/ActuatorCard.vue` | OK | Vollstaendig gelesen (445 Zeilen) |
| `El Frontend/src/components/devices/SensorCard.vue` | OK | Vollstaendig gelesen (504 Zeilen) |
| `El Frontend/src/components/notifications/NotificationDrawer.vue` | OK | Vollstaendig gelesen (708 Zeilen) |
| `El Frontend/src/shared/stores/notification.store.ts` | OK | Gelesen: Toast-Handler (transient) |
| `El Frontend/src/shared/stores/notification-inbox.store.ts` | OK | Vollstaendig gelesen (436 Zeilen) |
| `El Frontend/src/shared/stores/alert-center.store.ts` | OK | Vollstaendig gelesen (251 Zeilen) |
| `El Frontend/src/components/notifications/AlertStatusBar.vue` | OK | Vollstaendig gelesen (170 Zeilen) |
| `El Frontend/src/components/notifications/NotificationPreferences.vue` | OK | Vollstaendig gelesen (569 Zeilen) |
| `El Frontend/src/components/devices/AlertConfigSection.vue` | OK | Vollstaendig gelesen (497 Zeilen) |
| `El Frontend/src/components/esp/ActuatorConfigPanel.vue` | OK | Einbindung geprueft (Zeile 24, 610-621) |
| `El Frontend/src/components/esp/SensorConfigPanel.vue` | OK | Einbindung geprueft (Zeile 26, 848-852) |
| `El Frontend/src/utils/formatters.ts` | OK | `ZONE_STALE_THRESHOLD_MS` = 60_000ms |

---

## 3. Befunde

### 3.1 V-SS-03: ActuatorCard Stale-Darstellung

**Schwere:** Mittel (Toggle-Disable-Luecke)

#### Offline-Indikator: VORHANDEN

- **CSS-Klasse:** `actuator-card--offline` setzt `opacity: 0.5` auf die gesamte Card (Zeile 225-227)
- **Badge:** `<WifiOff :size="12" /> ESP offline` als Inline-Badge in `.actuator-card__badge--offline` (Zeile 158-160)
- **Bedingung:** `isEspOffline = props.actuator.esp_state && props.actuator.esp_state !== 'OPERATIONAL'` (Zeile 55-57)

#### Stale-Erkennung: VORHANDEN

- **CSS-Klasse:** `actuator-card--stale` setzt `opacity: 0.7` + `border-left: 3px solid var(--color-warning)` (Zeile 229-232)
- **Bedingung:** `isStale = Date.now() - new Date(lastSeen).getTime() > ZONE_STALE_THRESHOLD_MS` (Zeile 60-64)
- **Schwellwert:** `ZONE_STALE_THRESHOLD_MS = 60_000ms` (aus `formatters.ts:491`)
- **Basis:** `props.actuator.last_seen` (heartbeat-Timestamp)

#### Toggle-Button deaktiviert bei Offline: LUECKE

- **Aktuell:** `<button :disabled="actuator.emergency_stopped" ...>` — nur `emergency_stopped` deaktiviert (Zeile 166-172)
- **Fehlend:** `|| isEspOffline` oder `|| isStale` in der `:disabled`-Bedingung
- **Konsequenz:** User kann Toggle-Befehle senden, obwaehrend der ESP offline ist. Der Server wird den Befehl ablehnen (oder in die Queue stellen), aber das UI kommuniziert das nicht.
- **Vergleich SensorCard:** SensorCard hat keinen Toggle-Button — der Vergleich ist dort nicht anwendbar. SensorCard hat dafuer den Stale-Badge mit `formatRelativeTime(sensor.last_read)` (Zeile 212-214), was ActuatorCard nicht hat (kein Timestamp im Stale-Fall sichtbar).

#### Paritaets-Vergleich ActuatorCard vs. SensorCard

| Feature | ActuatorCard | SensorCard |
|---------|--------------|------------|
| Offline CSS-Klasse | `actuator-card--offline` (opacity 0.5) | `sensor-card--esp-offline` (opacity 0.5) |
| Offline Badge | WifiOff + "ESP offline" | WifiOff + "ESP offline" |
| Stale CSS-Klasse | `actuator-card--stale` (opacity 0.7, left-border) | `sensor-card--stale` (opacity 0.7, left-border) |
| Stale Badge mit Timestamp | FEHLT | Vorhanden: `Clock + formatRelativeTime(last_read)` |
| Toggle bei Offline disabled | FEHLT | nicht relevant (kein Toggle) |
| Stale-Schwellwert | `ZONE_STALE_THRESHOLD_MS` (60s) | `getDataFreshness(last_read)` (120s per `formatters`) |

**Auffaelligkeit:** ActuatorCard und SensorCard verwenden unterschiedliche Schwellwerte fuer "stale": ActuatorCard prueft `last_seen` gegen 60s (heartbeat-basiert), SensorCard prueft `last_read` gegen 120s (datenbasiert). Das ist konzeptionell korrekt (unterschiedliche Quellen), aber die Threshold-Konstante `ZONE_STALE_THRESHOLD_MS` ist `formatters.ts:491` definiert — ActuatorCard nutzt sie, SensorCard nutzt intern `getDataFreshness()`.

---

### 3.2 V-AK-02: NotificationDrawer Frontend-Analyse

**Schwere:** Keine Luecken — vollstaendig implementiert.

**Datei:** `/c/Users/robin/Documents/PlatformIO/Projects/Auto-one/El Frontend/src/components/notifications/NotificationDrawer.vue`

#### Filter: VORHANDEN

Drei unabhaengige Filter-Ebenen:

1. **Severity-Filter (Tabs):** Alle | Kritisch | Warnungen | System (Zeile 38-43) — setzt `inboxStore.activeFilter`
2. **Status-Filter (Tabs):** Alle | Aktiv (n) | Gesehen (n) | Erledigt (n) (Zeile 55-67) — `activeStatusFilter` ref, zeigt Live-Counts aus `alertStore.alertStats`
3. **Source-Filter (Chips):** Alle | Sensor | Infrastruktur | Aktor | Regel | System (Zeile 46-53) — setzt `inboxStore.sourceFilter`

#### Buttons: VORHANDEN

- **Mark-All-Read:** `handleMarkAllRead()` → `inboxStore.markAllAsRead()`, deaktiviert wenn `unreadCount === 0` (Zeile 91-93, 163-171)
- **Acknowledge:** Pro-Item via `handleAcknowledge(id)` → `alertStore.acknowledgeAlert(id)` (Zeile 94-96)
- **Resolve:** Pro-Item via `handleResolve(id)` → `alertStore.resolveAlert(id)` (Zeile 98-100)
- **Settings:** Oeffnet `NotificationPreferences` via `inboxStore.openPreferences()` (Zeile 176-179)

#### Bulk-Actions: TEILWEISE

- "Alle gelesen" (`markAllAsRead`) ist vorhanden (Bulk)
- "Acknowledge All" oder "Resolve All" fehlen — nur pro-Item via `NotificationItem`-Emits

#### Pagination/Lazy-Loading: VORHANDEN

- Erstes Load: `inboxStore.loadInitial()` bei Drawer-Oeffnen (Zeile 122-131), laedt 50 Items (PAGE_SIZE = 50 in store)
- "Mehr laden"-Button: sichtbar wenn `inboxStore.hasMore`, ruft `inboxStore.loadMore()` auf (Zeile 252-260)
- Loading-State: `isLoading && notifications.length === 0` zeigt Ladetext (Zeile 214-217)

#### Gruppierung: VORHANDEN

Notifications werden in "Heute / Gestern / Aelter"-Gruppen aufgeteilt (Zeile 101-129 in inbox.store, Zeile 234-261 in drawer template). Gruppe-Label ist sticky (CSS `position: sticky; top: 0`).

#### Email-Log (Admin): VORHANDEN

Admin-Sektion fuer letzte 5 Emails mit Status-Dots, faltbar per Accordion, Link zu `/email` (Zeile 264-312).

#### WebSocket-Integration: VORHANDEN (im Store)

`notification-inbox.store.ts` hat drei WS-Handler:
- `handleWSNotificationNew` (Zeile 277): fuegt neue Notification oben ein, triggert Browser-Push bei critical
- `handleWSNotificationUpdated` (Zeile 332): aktualisiert Status/is_read
- `handleWSUnreadCount` (Zeile 367): autoritativer Badge-Count vom Server

Diese werden aus `esp.store.ts` WS-Dispatcher delegiert.

---

### 3.3 V-AK-03: NotificationPreferences Frontend

**Schwere:** Keine Luecken.

**Datei:** `/c/Users/robin/Documents/PlatformIO/Projects/Auto-one/El Frontend/src/components/notifications/NotificationPreferences.vue`

#### Oeffnung/Einbindung

Wird als zweites `SlideOver` (`width="md"`) innerhalb von `NotificationDrawer.vue` am Ende des Templates eingebunden (Drawer.vue Zeile 317: `<NotificationPreferences />`). Oeffnet sich gestapelt ueber dem Drawer wenn `inboxStore.isPreferencesOpen === true`.

#### Felder: VOLLSTAENDIG

| Feld | Typ | Default |
|------|-----|---------|
| WebSocket-Toggle (`websocketEnabled`) | Toggle-Button | `true` |
| Email-Toggle (`emailEnabled`) | Toggle-Button | `false` |
| Email-Adresse (`emailAddress`) | Text-Input (type=email) | leer |
| Email-Schweregrade (`emailSeverities`) | Checkboxes: Kritisch / Warnung / Info | ['critical', 'warning'] |
| Ruhezeiten-Toggle (`quietHoursEnabled`) | Toggle-Button | `false` |
| Ruhezeiten Von (`quietHoursStart`) | Time-Input | '22:00' |
| Ruhezeiten Bis (`quietHoursEnd`) | Time-Input | '07:00' |
| Digest-Intervall (`digestIntervalMinutes`) | Number-Input (0..1440) | 60 |
| Browser-Notifications (`browserNotifications`) | Toggle-Button | `false` |

#### Erweiterte Einstellungen

Ruhezeiten, Digest-Intervall und Browser-Notifications sind in einem `AccordionSection` ("Erweiterte Einstellungen") zusammengefasst, dessen State per `storage-key="ao-notification-prefs-advanced"` in localStorage persistiert wird.

#### Persistierung

- Laden: `notificationsApi.getPreferences()` beim Oeffnen des Panels (watch auf `isPreferencesOpen`)
- Speichern: `notificationsApi.updatePreferences(update)` → PATCH zum Server
- Test-Email: `notificationsApi.sendTestEmail({ email })` — deaktiviert wenn kein emailAddress

#### Browser-Push-Permission

Bei Aktivieren von `browserNotifications` wird automatisch `Notification.requestPermission()` angefordert (Zeile 104-109).

---

### 3.4 V-AK-04: Per-Sensor AlertConfigSection

**Schwere:** Keine Luecken.

**Datei:** `/c/Users/robin/Documents/PlatformIO/Projects/Auto-one/El Frontend/src/components/devices/AlertConfigSection.vue`

#### Einbindung in SensorConfigPanel: VORHANDEN

- Import: `import AlertConfigSection from '@/components/devices/AlertConfigSection.vue'` (SensorConfigPanel.vue Zeile 26)
- Template: Zeile 848-852 (aus grep), in einem `AccordionSection "Alert-Konfiguration"`
- Aufruf: `entity-type="sensor"`, `:fetch-fn="sensorsApi.getAlertConfig"`, `:update-fn="sensorsApi.updateAlertConfig"`

#### Einbindung in ActuatorConfigPanel: VORHANDEN

- Import: `import AlertConfigSection from '@/components/devices/AlertConfigSection.vue'` (ActuatorConfigPanel.vue Zeile 24)
- Template: Zeile 610-621, in einem `AccordionSection "Alert-Konfiguration"`
- Guard: `v-if="actuatorDbId"` — Section ist nur sichtbar wenn der Aktor eine DB-ID hat (nicht fuer Mock-Devices ohne persistierte Config)
- Aufruf: `entity-type="actuator"`, `:fetch-fn="actuatorsApi.getAlertConfig"`, `:update-fn="actuatorsApi.updateAlertConfig"`

#### Konfigurierbare Felder

| Feld | Beschreibung |
|------|-------------|
| Master-Toggle (`alertsEnabled`) | Benachrichtigungen fuer diesen Sensor/Aktor ein/aus |
| Suppression-Grund | Dropdown: Wartung / Absichtlich offline / Kalibrierung / Benutzerdefiniert |
| Suppression-Notiz | Freitext (optional) |
| Auto-Reaktivierung (`suppressionUntil`) | datetime-local Input |
| Custom Warn-Schwellen (Min/Max) | 4x Number-Inputs (warning_min/max, critical_min/max) |
| Severity-Override | Dropdown: Automatisch / Kritisch / Warnung / Info |

#### Persistierung

- Laden: `props.fetchFn(props.entityId)` in `onMounted` — ruft `GET /sensors/{id}/alert-config` bzw. `GET /actuators/{id}/alert-config` auf
- Speichern: `props.updateFn(props.entityId, update)` — ruft `PATCH /sensors/{id}/alert-config` bzw. `PATCH /actuators/{id}/alert-config` auf
- Fehler beim Laden wird still ignoriert (`alertConfig = {}`) — das ist korrekt, da Config moeglicherweise noch nicht existiert

#### Visuelle Suppression-Anzeige

Wenn `alertsEnabled = false`: Suppression-Bereich wird mit `background: rgba(251, 191, 36, 0.05)` + `border: 1px solid rgba(251, 191, 36, 0.15)` (gelber Warn-Rahmen) angezeigt. Bell/BellOff-Icon wechselt farblich (`text-success` / `text-warning`). Kein Badge/Icon ausserhalb des Panels sichtbar (keine Anzeige in ActuatorCard oder SensorCard selbst).

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| `grep -n disabled ActuatorCard.vue` | Bestaetigt: nur `emergency_stopped` im `:disabled`, kein `isEspOffline` |
| `grep ZONE_STALE_THRESHOLD_MS formatters.ts` | 60_000ms (Zeile 491) |
| SensorConfigPanel AlertConfig grep | Zeile 26 Import + Zeile 848-852 Template |
| ActuatorConfigPanel AlertConfig grep | Zeile 24 Import + Zeile 610-621 Template |

---

## 5. Blind-Spot-Fragen (an User)

Die folgenden Punkte koennen nur im Browser verifiziert werden:

1. **Toggle-Disable bei Offline:** Ist der Toggle-Button in der ActuatorCard sichtbar deaktiviert oder ausgegraut wenn der ESP offline ist? (Erwartung: NEIN, der Button ist anklickbar — das ist die identifizierte Luecke)
2. **Acknowledge/Resolve in NotificationItem:** Die `handleAcknowledge`/`handleResolve`-Buttons sind in `NotificationItem.vue` implementiert (nicht direkt gelesen). Werden sie im Drawer als Buttons oder Icons gerendert?
3. **AlertConfigSection in ActuatorConfigPanel:** Die Section ist per `v-if="actuatorDbId"` geschuetzt. Bei Mock-Devices ohne DB-ID ist sie unsichtbar — ist das im Hardware-Tab beobachtbar?

---

## 6. Bewertung & Empfehlung

### Root Cause (identifizierte Luecke)

**V-SS-03 Toggle-Disable:**
In `ActuatorCard.vue` Zeile 168 fehlt `|| isEspOffline` in der `:disabled`-Bedingung.
Aktuell: `:disabled="actuator.emergency_stopped"`
Korrekt waere: `:disabled="actuator.emergency_stopped || isEspOffline"`

Zusaetzlich fehlt in der ActuatorCard (vs. SensorCard) ein Stale-Badge mit `formatRelativeTime` — SensorCard Zeile 212-214 zeigt den relativen Zeitstempel an, ActuatorCard hat nur die CSS-Opacity-Klasse ohne Zeitangabe.

### Naechste Schritte

1. **(Fix — Mittel)** `ActuatorCard.vue` Zeile 168: `:disabled="actuator.emergency_stopped || isEspOffline"` hinzufuegen
2. **(Optional — Niedrig)** Stale-Badge in ActuatorCard analog zu SensorCard hinzufuegen (Zeitstempel sichtbar)
3. **(Info)** Alle anderen geprueften Punkte (V-AK-02 bis V-AK-04) sind vollstaendig implementiert

### Lastintensive Ops

Soll ich `vue-tsc --noEmit` fuer einen vollstaendigen Type-Check laufen lassen? (`docker compose exec el-frontend npx vue-tsc --noEmit`, dauert ca. 1-3 Minuten)
