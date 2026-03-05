# Auftrag: E-Mail-Postfach — Analyse und Implementierung

**Ziel-Repo:** Auto-one (El Frontend + El Servador)  
**Kontext:** Roadmap E-Mail-Postfach, Phase A+B. V1.1 + V1.2 Email-System abgeschlossen.  
**Priorität:** Hoch  
**Datum:** 2026-03-05  
**Typ:** Analyse (Teil 1) + Implementierung (Teil 2)

---

## 1. Kontext und Ziel

### 1.1 Was ist das E-Mail-Postfach?

Das E-Mail-Postfach ist **kein herkömmlicher E-Mail-Client**. Es ist ein dedizierter Tab/View in AutomationOne, der ausschließlich **systemrelevante E-Mails** abbildet:

- **Ausgehend:** Alerts (Critical, Digest), Test-Emails, später: Systemdiagnosen, Sensorwerte, Zonen-Übersichten, Admin-Reports
- **Eingehend (Zukunft):** Projektbeschreibungen, Dokumente, die per Plugin-System ins System übertragen werden

**Abgrenzung:** Kein Spam, keine Newsletter, keine CC/BCC, keine generische E-Mail-Logik. Nur was AutomationOne selbst erzeugt oder empfängt.

### 1.2 UX-Pattern (Recherche-Grundlage)

Nach Analyse von ThingsBoard, Grafana, Courier und ISA-18.2:

- **Inbox-Pattern:** Persistente, browsable Liste — für Statusänderungen, Alerts, Reports mit bleibendem Wert
- **Progressive Disclosure:** StatusBar (Übersicht) → NotificationDrawer (Schnellzugriff, Top-N) → **Postfach-Tab** (vollständige Übersicht) → Detail/Preview
- **Keine Doppelung:** Drawer = schneller Zugriff (z. B. letzte 5 Emails), Postfach = vollständige Liste mit Filter, Sortierung, Pagination
- **ISA-18.2:** Alarm Summary Display, <6 Alerts/h/Operator, reduzierte Informationsflut

### 1.3 Bestehende Bausteine (nutzen, nicht duplizieren)

| Komponente | Ort | Inhalt |
|------------|-----|--------|
| EmailLog DB-Model | `El Servador/god_kaiser_server/src/db/models/email_log.py` | Tabelle `email_log` mit status, retry_count, notification_id, to_address, subject, template, provider, error_message, sent_at, created_at |
| Email-Log API | `GET /api/v1/notifications/email-log` | Query: `status`, `date_from`, `date_to`, `page`, `page_size` (nicht limit/offset) |
| Email-Log Stats API | `GET /api/v1/notifications/email-log/stats` | Aggregationen (sent/failed/pending/permanently_failed) — keine Query-Parameter |
| notifications.ts | `El Frontend/src/api/notifications.ts` | `notificationsApi.getEmailLog()`, `notificationsApi.getEmailLogStats()`, `EmailLogEntry` Interface |
| NotificationDrawer | `El Frontend/src/components/notifications/NotificationDrawer.vue` | Footer „Letzte 5 Emails“, nutzt `notificationsApi.getEmailLog({ page_size: 5 })` direkt in Komponente |
| NotificationItem | `El Frontend/src/components/notifications/NotificationItem.vue` | Notification-Status; Email-Status-Labels via `getEmailStatusLabel()` |
| labels.ts | `El Frontend/src/utils/labels.ts` | `EMAIL_STATUS_LABELS`, `getEmailStatusLabel()` |
| Design-System | `El Frontend/src/styles/tokens.css` | Glassmorphism, Status-Farben (--color-success, --color-error, --color-warning, --color-info) |

**Fehlt:** Ein eigener View/Tab, der das Postfach als zentrale, organisierte Übersicht mit Filter, Sortierung, Pagination und Detail/Preview abbildet.

---

## 2. Exakte Struktur des E-Mail-Postfachs

### 2.1 Funktionsumfang (SOLL)

| Funktion | Beschreibung | Priorität |
|----------|--------------|-----------|
| Liste | Tabelle oder Karten-Liste aller EmailLog-Einträge, sortiert nach created_at absteigend | P0 |
| Filter | Status (sent, failed, pending, permanently_failed), Datum (von/bis), Template | P0 |
| Pagination | page/page_size, z. B. 25 pro Seite | P0 |
| Detail/Preview | Klick auf Zeile öffnet Detail (Subject, To, Status, Retry, Error, Timestamp) | P0 |
| Stats-Anzeige | Kurzübersicht (z. B. Sent/Failed dieser Woche) — optional aus getEmailLogStats | P1 |
| Verknüpfung zu Notification | Falls notification_id gesetzt: Link zur zugehörigen Notification | P1 |

### 2.2 Was NICHT ins Postfach gehört

- Keine E-Mail-Compose-Funktion (Versand erfolgt über System: Alerts, Test-Button in Preferences)
- Keine Spam-Filter, keine Ordner (Inbox/Sent/Archiv)
- Keine CC/BCC, keine Anhänge-Verwaltung
- Keine generische E-Mail-Client-Logik

### 2.3 Aufgabenteilung: Drawer vs. Postfach

| Aspekt | NotificationDrawer | E-Mail-Postfach (Tab) |
|--------|-------------------|------------------------|
| Zweck | Schneller Zugriff, Top-N (z. B. 5) | Vollständige Übersicht |
| Filter | Keine | Status, Datum, Template |
| Pagination | Keine | Ja (page/page_size) |
| Detail | Kurz (Subject, Status) | Voll (Subject, To, Status, Retry, Error, Timestamp) |
| Ort | SlideOver (rechts), Bell-Icon | Eigener Tab, Route |

---

## 3. Teil 1: Analyseauftrag

Der Auftragnehmer führt im **Ziel-Repo** (Auto-one) eine feste Analyse durch und dokumentiert die Ergebnisse. **Keine Implementierung vor Abschluss der Analyse.**

### A1 — Navigation und Routes

- [ ] **Router-Konfiguration:** `El Frontend/src/router/index.ts` (kein routes.ts)
- [ ] **Sidebar:** `El Frontend/src/shared/design/layout/Sidebar.vue` — Admin-Sektion (Zeile 104–147): System, Benutzer, Kalibrierung, Plugins
- [ ] **Bestehende Admin-Routen:** `system-monitor` (requiresAdmin), `users` (UserManagementView), `settings`, `calibration`, `plugins` — alle in router/index.ts
- [ ] **Empfehlung:** Route `/email` oder `/postfach`, Sidebar-Eintrag unter Administration (nach Plugins), `meta: { requiresAdmin: true }` (email-log API ist Admin-only)

**Ausgabe:** Exakte Dateipfade, Zeilennummern, vorgeschlagene Route und Sidebar-Position.

### A2 — API und Store

- [ ] **notifications.ts:** `notificationsApi.getEmailLog(filters?: EmailLogListFilters)` → `EmailLogListResponse`; `notificationsApi.getEmailLogStats()` → `EmailLogStatsDTO`. Filters: `status?`, `date_from?`, `date_to?`, `page?`, `page_size?`
- [ ] **EmailLogEntry Interface:** id, notification_id (string | null), to_address, subject, template (string | null), provider, status, sent_at, error_message, retry_count, created_at
- [ ] **notification-inbox.store.ts:** Nutzt NICHT getEmailLog — nur `notificationsApi.list()` für Notifications. EmailLog ist separat.
- [ ] **NotificationDrawer:** Ruft `notificationsApi.getEmailLog({ page_size: 5 })` direkt in Komponente (Zeile 92), lokaler State `emailLog`, `loadEmailLog()` bei Drawer-Open

**Ausgabe:** Exakte Signatur, Parameter, Verwendung im Drawer.

### A3 — Design-System und bestehende Listen

- [ ] **tokens.css:** `--color-success`, `--color-error`, `--color-warning`, `--color-info`; `--glass-bg`, `--glass-border` für Glassmorphism
- [ ] **Bestehende Listen/Tabellen:** UserManagementView (Tabelle ohne Pagination), NotificationDrawer (gruppierte Liste). SystemMonitorView: Tabs mit Filter. Referenz: NotificationDrawer-Struktur + Filter-Pattern aus LogicView/SystemMonitorView
- [ ] **SlideOver/Panel:** `El Frontend/src/shared/design/primitives/SlideOver.vue` (width: sm/md/lg) — für Detail-Panel. NotificationDrawer nutzt bereits SlideOver.

**Ausgabe:** Referenz-Komponenten, Design-Tokens, empfohlene Primitive.

### A4 — Konflikte und Abhängigkeiten

- [ ] **NotificationDrawer Footer:** Zeigt „Letzte 5 Emails“ (Zeile 239) — aktuell KEIN Link „Alle anzeigen“. B4: Link hinzufügen mit `router.push('/email')` oder `/postfach`
- [ ] **Rollen:** Sidebar-Einträge unter `authStore.isAdmin` (Sidebar.vue). email-log API: AdminUser. Postfach: `requiresAdmin: true` empfohlen
- [ ] **Quick Action Ball:** `El Frontend/src/components/quick-action/QuickActionBall.vue` — nutzt notification-inbox. Optional: Aktion „Postfach öffnen“ hinzufügen

**Ausgabe:** Konfliktstellen, Empfehlungen für Link Drawer→Postfach, Rollen-Check.

### Analyse-Report erstellen

- [ ] **Datei anlegen:** `.claude/reports/current/EMAIL-POSTFACH-ANALYSE-REPORT.md` (Projekt-Standard für Reports)
- [ ] **Inhalt:** Alle Ausgaben A1–A4 in strukturierter Form, inkl. **konkrete Zeilennummern und Dateipfade**
- [ ] **Empfehlungen:** Exakte Einbaustellen (Route, Sidebar, View-Pfad, Komponenten-Struktur)

**Erst nach Ablage dieses Reports mit Teil 2 (Implementierung) starten.**

---

## 4. Teil 2: Implementierungsauftrag (nach Analyse)

Alle Änderungen beziehen sich auf die in Teil 1 dokumentierten Pfade. Wenn die Analyse andere Pfade ergibt, gelten diese.

### B1 — Neuer View und Route

- [ ] **Neue View-Datei:** `El Frontend/src/views/EmailPostfachView.vue` (analog zu UserManagementView, SystemMonitorView)
- [ ] **Route registrieren:** In `router/index.ts` unter Admin-Kinder: `{ path: 'email', name: 'email-postfach', component: lazyView(() => import('@/views/EmailPostfachView.vue')), meta: { requiresAdmin: true, title: 'E-Mail-Postfach' } }`
- [ ] **Sidebar-Eintrag:** In `Sidebar.vue` Admin-Sektion (nach Plugins): RouterLink zu `/email`, Icon Mail (lucide-vue-next), Label „Postfach“
- [ ] **Rollen-Check:** `meta: { requiresAdmin: true }` — Router-Guard prüft bereits `requiresAdmin` (Zeile 324–326)

### B2 — Postfach-Komponenten

- [ ] **Postfach-Liste:** Tabelle oder Karten-Liste (Pattern wie NotificationDrawer `drawer__email-entry`, erweitert)
  - Spalten/Felder: Datum, Subject, To, Status, Template, Retry (X/3), Aktionen (Detail)
  - Status-Labels via `getEmailStatusLabel()` aus `@/utils/labels`
  - CSS: `--color-error` für failed/permanently_failed, `drawer__email-dot--${status}`-Pattern wiederverwenden
- [ ] **Filter-Bar:** BaseSelect für Status (Alle, sent, failed, pending, permanently_failed), BaseInput Datum Von/Bis (optional), Template (optional)
  - Filter an `notificationsApi.getEmailLog({ status, date_from, date_to, page, page_size })` übergeben
- [ ] **Pagination:** `page_size=25`, `page` für Seitennavigation, Buttons „Weiter“/„Zurück“ oder Seitenzahlen
- [ ] **Detail-Panel:** SlideOver.vue (width="md") oder Inline-Expand mit Subject, To, Status, Retry, Error, Timestamp; bei notification_id: RouterLink zu `/system-monitor?tab=events` oder Notification-Detail

### B3 — API-Anbindung

- [ ] **Composable (empfohlen):** Neuer `useEmailPostfach.ts` in `El Frontend/src/composables/` — notification-inbox.store ist für Notifications, nicht EmailLog
  - `loadEmails(params)` → `notificationsApi.getEmailLog(params)`
  - `loadStats()` → `notificationsApi.getEmailLogStats()` (optional, P1)
- [ ] **Loading/Error-State:** BaseSpinner, ErrorState-Pattern aus `shared/design/patterns/ErrorState.vue`

### B4 — Drawer-Verknüpfung

- [ ] **„Alle anzeigen“-Link:** Im NotificationDrawer-Footer unter/neben „Letzte 5 Emails“ (Zeile 234–271) RouterLink oder Button mit `router.push('/email')` — nur sichtbar wenn `authStore.isAdmin`
- [ ] **Keine Doppelung:** Drawer zeigt weiterhin Top-5 via `page_size: 5`; Postfach zeigt vollständige Liste mit Filter/Pagination

### B5 — Design und Verifikation

- [ ] **tokens.css:** Konsistente Nutzung von Status-Farben, Glassmorphism
- [ ] **Verifikation:** Navigation funktioniert, Filter funktionieren, Pagination funktioniert, Detail öffnet, Status-Labels korrekt, Drawer-Link funktioniert

---

## 5. Technische Referenz (für Implementierung)

### 5.1 EmailLogEntry (Frontend)

```typescript
// El Frontend/src/api/notifications.ts
interface EmailLogEntry {
  id: string;
  notification_id: string | null;
  to_address: string;
  subject: string;
  template: string | null;
  provider: string;  // 'resend' | 'smtp'
  status: 'sent' | 'failed' | 'pending' | 'permanently_failed';
  sent_at: string | null;  // ISO datetime
  error_message: string | null;
  retry_count: number;
  created_at: string | null;  // ISO datetime
}
```

### 5.2 getEmailLog API

```
GET /api/v1/notifications/email-log
Query: status?, date_from?, date_to?, page?, page_size?
Response: { success: boolean, data: EmailLogEntry[], pagination: PaginationMeta }
```

### 5.3 getEmailLogStats API

```
GET /api/v1/notifications/email-log/stats
Query: (keine — Backend liefert Gesamtstatistik)
Response: { success, total, sent, failed, by_status, by_provider }
```

### 5.4 Status-Labels (labels.ts)

- sent → „Zugestellt“
- failed → „Fehlgeschlagen“
- pending → „Ausstehend“
- permanently_failed → „Dauerhaft fehlgeschlagen“

---

## 6. Frontend-Regeln (Projekt-Standard)

- **Composition API:** `<script setup lang="ts">`, `defineProps<Props>()`, `defineEmits<Emits>()`
- **Design-Primitives:** BaseButton, BaseCard, BaseSelect, BaseInput, BaseSpinner, SlideOver aus `@/shared/design/primitives/`
- **Icons:** ausschließlich `lucide-vue-next` (z. B. Mail, ChevronDown)
- **Imports:** `@/` Alias, keine relativen `../../` Pfade
- **Styling:** Tailwind + Design Tokens aus `tokens.css` (var(--color-*), var(--space-*))
- **API:** Alle Aufrufe über `notificationsApi` aus `@/api/notifications`

---

## 7. Ablage und Verweise

- **Roadmap:** `arbeitsbereiche/automation-one/roadmap-email-postfach-und-reports-integration.md`
- **Recherche:** `wissen/iot-automation/iot-email-postfach-systemoptimiert-recherche-2026.md`
- **Unified Alert Center UX:** `wissen/iot-automation/unified-alert-center-ux-best-practices.md`
- **Phase 4A Notification Stack:** `hardware-tests/auftrag-phase4a-notification-stack.md`
- **V1 Email-System:** `.claude/reports/current/auftrag-v1-email-system-analyse-umsetzung.md`, `.claude/reports/current/auftrag-frontend-v1-2-email-retry-analyse-und-umsetzung.md`

---

## 8. Geschätzter Aufwand

| Phase | Aufwand |
|-------|---------|
| Teil 1 (Analyse) | ~1–2 h |
| Teil 2 (Implementierung) | ~4–6 h |
| **Gesamt** | ~5–8 h |
