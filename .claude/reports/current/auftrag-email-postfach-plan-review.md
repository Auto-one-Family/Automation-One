# E-Mail-Postfach — Plan-Review & Integration

**Datum:** 2026-03-05  
**Basis:** `e-mail-postfach_integration_8d1438a4.plan.md`  
**Ziel:** Bestehendes Notifications-System prüfen, Duplikation vermeiden, Flow optimieren

---

## 1. Bestehendes System — Verifikation

### 1.1 NotificationDrawer (aktueller Stand)

| Element | Befund |
|--------|--------|
| **Inhalt** | Benachrichtigungen (notification-inbox) + Alert-Status + Filter (Alle/Kritisch/Warnungen/System) + Status-Tabs (Aktiv/Gesehen/Erledigt) |
| **Email Footer** | "Letzte 5 Emails" — expandierbar, lädt `getEmailLog({ page_size: 5 })` direkt |
| **API-Call** | Bei Drawer-Open: `loadEmailLog()` — kein auth-Check vor dem Call |
| **Backend** | `GET /notifications/email-log` → `AdminUser` — Non-Admin erhält 403 |
| **Fehlerfall** | catch setzt `emailLog = []` → `hasEmailLog` = false → Footer unsichtbar für Non-Admin |

**Fazit:** Drawer zeigt Email-Log nur Admins (403 → leer). Kein `authStore`-Import vorhanden.

### 1.2 API & Types

| Komponente | Status |
|------------|--------|
| `notificationsApi.getEmailLog()` | ✅ Vorhanden |
| `notificationsApi.getEmailLogStats()` | ✅ Vorhanden |
| `EmailLogEntry` | ✅ Vollständig (inkl. `permanently_failed`) |
| `EmailLogListFilters` | ⚠️ `template` fehlt (Plan Phase 1) |
| `getEmailStatusLabel()` | ✅ labels.ts |
| `drawer__email-dot--*` | ✅ NotificationDrawer CSS |

### 1.3 Keine redundanten Routen

- `/email` existiert **nicht** — Plan ergänzt korrekt
- System Monitor hat 8 Tabs — 9. Tab "Postfach" würde überladen
- **Dedizierte Route `/email`** ist sinnvoll: fokussierte Admin-Ansicht, klare Trennung

---

## 2. Integration — Drawer ↔ Postfach

### 2.1 Klare Rollenverteilung (keine Duplikation)

| Ort | Inhalt | Zweck |
|-----|--------|-------|
| **NotificationDrawer** | Top 5 Emails, kompakt | Schnellüberblick im Kontext "Benachrichtigungen" |
| **EmailPostfachView** | Vollständige Liste + Filter + Detail | Admin-Detailansicht, Suche, Analyse |

**Flow:** User öffnet Drawer → sieht "Letzte 5 Emails" → klickt "Alle anzeigen" → `/email` (Postfach)

### 2.2 "Alle anzeigen" — Präzisierung

**Plan sagt:** Link im Footer, `v-if="authStore.isAdmin"`

**Ergänzungen:**

1. **authStore importieren** — NotificationDrawer nutzt aktuell kein `useAuthStore` → muss ergänzt werden.

2. **API-Call optimieren** — `loadEmailLog()` nur bei Admin aufrufen, um 403 zu vermeiden:
   ```ts
   watch(() => inboxStore.isDrawerOpen, (isOpen) => {
     if (isOpen) {
       inboxStore.loadInitial()
       activeStatusFilter.value = 'all'
       if (authStore.isAdmin) loadEmailLog()  // ← nur Admin
     }
   })
   ```

3. **Link-Platzierung** — In der Toggle-Zeile rechts: `Letzte 5 Emails` | `Alle anzeigen` (als RouterLink). Nur sichtbar wenn `authStore.isAdmin`.

4. **Drawer schließen** — Beim Klick auf "Alle anzeigen": `inboxStore.isDrawerOpen = false` vor `router.push('/email')`. Sonst bleiben Drawer + Postfach gleichzeitig offen → überladen.

---

## 3. Plan-Korrekturen & Ergänzungen

### 3.1 Phase 1 — Backend Template-Filter

**Plan:** `template: Optional[str] = None` in repo + API

**Empfehlung:** `ilike(f"%{template}%")` für Teilstring-Suche (User tippt "alarm" → findet "sensor_alarm", "logic_alarm"). Exakter Match zu restriktiv.

### 3.2 Phase 5 — Drawer-Verknüpfung (erweitert)

| Änderung | Datei | Detail |
|----------|-------|--------|
| Import | NotificationDrawer.vue | `useAuthStore` hinzufügen |
| Watch | NotificationDrawer.vue | `loadEmailLog()` nur wenn `authStore.isAdmin` |
| Link | NotificationDrawer.vue | `RouterLink to="/email"` mit `v-if="authStore.isAdmin"` |
| Click | NotificationDrawer.vue | `@click="inboxStore.isDrawerOpen = false"` oder `beforeRouteLeave`-ähnlich — besser: `@click` auf RouterLink mit `inboxStore.isDrawerOpen = false` |

**Implementierung:** RouterLink mit `@click="inboxStore.isDrawerOpen = false"` — Drawer schließt vor Navigation.

### 3.3 Route-Reihenfolge

Plan: Route nach `plugins`. Router-Struktur: `plugins` bei Zeile 229–233, danach `sensors` (nicht Admin).  
**Korrekt:** `/email` als Admin-Route zwischen `plugins` und `sensors` einfügen (oder nach `plugins` im Admin-Block).

### 3.4 Sidebar-Label

Plan: "Postfach" — **korrekt**, kurz und eindeutig. Icon: Mail.

---

## 4. Notification-Link (P1) — Events-Tab

**Plan:** Bei `notification_id`: RouterLink zu `/system-monitor?tab=events`

**Hinweis:** Events-Tab zeigt Audit/System-Events. Die `notification_id` verweist auf eine Notification (Inbox), nicht zwingend auf ein sichtbares Audit-Event. Der Link führt trotzdem sinnvoll in den Ereignis-Kontext — User kann dort nach Zeitraum/Quelle filtern. P1 = optional, ausreichend.

**Alternative (falls später):** Deep-Link zu einer einzelnen Notification — würde Backend-Erweiterung erfordern (z.B. `?notification=uuid`). Aktuell nicht nötig.

---

## 5. Composable vs. Store

**Plan:** `useEmailPostfach` Composable, kein Pinia-Store

**Begründung:** Email-Log ist Admin-only, begrenzter Scope, nur in einer View. Store wäre Overhead. ✅ Korrekt.

---

## 6. Design-Konsistenz

| Element | Quelle | Wiederverwendung |
|---------|--------|------------------|
| Status-Dots | `drawer__email-dot--sent/failed/pending/permanently_failed` | Gleiche Klassen in Postfach-Tabelle |
| Labels | `getEmailStatusLabel()` | Bereits in Drawer + NotificationItem |
| Zeit | `formatRelativeTime()` | Bereits überall |
| SlideOver | Detail-Panel | `width="md"` wie in anderen Panels |

---

## 7. Checkliste — Implementierung

### Phase 1: Backend
- [ ] `email_log_repo.get_filtered(template=...)` mit `ilike`
- [ ] `notifications.py` Query-Parameter `template`
- [ ] `notifications.ts` `EmailLogListFilters.template`

### Phase 2: Frontend Basis
- [ ] `EmailPostfachView.vue` erstellen
- [ ] Route `/email` nach `plugins`
- [ ] Sidebar: Postfach nach Plugins (Mail-Icon)

### Phase 3: Postfach-Komponenten
- [ ] Filter-Bar (Status, Datum, Template)
- [ ] Tabelle (Datum, Subject, To, Status, Template, Retry)
- [ ] Pagination (Pagination.vue, page_size=25)
- [ ] Detail-SlideOver (Zeilen-Klick)

### Phase 4: Composable
- [ ] `useEmailPostfach.ts` — loadEmails, loadStats, openDetail, closeDetail

### Phase 5: Drawer-Integration
- [ ] `useAuthStore` in NotificationDrawer importieren
- [ ] `loadEmailLog()` nur bei `authStore.isAdmin`
- [ ] "Alle anzeigen" RouterLink mit `v-if="authStore.isAdmin"`
- [ ] Drawer schließen beim Klick: `@click="inboxStore.isDrawerOpen = false"`

### Phase 6: Verifikation
- [ ] `vue-tsc --noEmit`
- [ ] `npm run build`

---

## 8. Zusammenfassung

- **Keine sinnlosen Routen:** `/email` ist sinnvoll, keine Duplikation mit System Monitor
- **Notification-Flow:** Drawer → "Alle anzeigen" → Postfach — klar, nicht überladen
- **Keine Duplikation:** Drawer = Preview (5), Postfach = Vollansicht mit Filter
- **Plan ist gut vorbereitet** — Hauptergänzungen: authStore im Drawer, loadEmailLog nur für Admin, Drawer beim Navigieren schließen
