# Auftrag: Frontend-Feinschliff & Vollintegration

> **Erstellt:** 2026-03-03
> **Erstellt von:** Automation-Experte (Life-Repo)
> **Ziel-Repo:** `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
> **Kontext:** Alle Komponenten sind implementiert (Backend 95%, Frontend 95%, Monitoring 100%). Es fehlt nur noch der Feinschliff: Frontend-Organisation, redundante Eintraege bereinigen, fehlende Integrationen verdrahten, Benutzerfuehrung verbessern. KEIN neuer Code noetig — nur Umorganisation, Verdrahtung und Polishing.
> **Typ:** Analyse + gezielte Fixes (Code-Aenderungen im auto-one Repo)
> **Prioritaet:** HOCH — Letzter Schritt vor Hardware-Test 2
> **Geschaetzter Aufwand:** ~12-18h (7 Bloecke, parallelisierbar)

---

## Ausgangslage

**Was STEHT (alles funktional):**

| Bereich | Komponenten | Status |
|---------|-------------|--------|
| Notification-System | NotificationRouter, Email-Service, Inbox-Store, Badge, Drawer, Preferences | FERTIG |
| Alert-Management | ISA-18.2 Lifecycle, Ack/Resolve, Suppression, QuickAlertPanel, AlertStatusBar | FERTIG |
| Plugin-System | 4 Plugins, REST-API, DB, Frontend PluginsView, Logic Engine Integration | FERTIG |
| Diagnostics | 10 Checks, Report-Generator, DB-Persistenz, DiagnoseTab, ReportsTab | FERTIG |
| Monitoring-Stack | Grafana, Prometheus, Loki, Alloy, 47/47 Alerts, 15 Metriken | FERTIG |
| Quick Action Ball | FAB, 4 Sub-Panels (Alerts, Navigation, Widget, Dashboard), dynamische Actions | FERTIG |
| Dashboard-Editor | GridStack, 10 Widget-Typen, Config-Panel, Persistenz | FERTIG |
| Logic-Rules-Editor | Flow-Editor, RuleCards, Execution-History, Undo/Redo, Plugin-Actions | FERTIG |
| Monitor L1-L3 | Zonen, Subzone-Accordions, SensorCards, SlideOvers, Dashboards | FERTIG |
| Safety | Circuit Breaker 3x, MQTT Reconnect, Offline-Buffer, DB Retry, WS Reconnect | FERTIG |

**Was FEHLT (nur Organisation und Verdrahtung):**

| Problem | Beschreibung |
|---------|-------------|
| Sidebar-Redundanz | "System" und "Wartung" fuehren zum gleichen View |
| ~~Email nicht sichtbar~~ | **[BEREITS IMPLEMENTIERT]** EmailLog Model, Repository, REST-API (`/email-log`, `/email-log/stats`), Frontend `EmailLogEntry` Interface, `NotificationItem.vue` zeigt `emailStatus` (sent/failed/pending). Logging via `notification_router.py` → `email_log_repo.log_send()`. Einzig fehlend: `email_service.py` selbst loggt NICHT direkt — nur via NotificationRouter. |
| Backup-UI fehlt | Backend (DatabaseBackupService, REST-API, Scheduler, pg_dump) **EXISTIERT BEREITS**. Nur **Frontend Backup-UI fehlt** (kein Tab/View). Backup-Pfad ist hardcoded (`backups/database`), nicht konfigurierbar via ENV. |
| Diagnostics versteckt | Zu viele Klicks zum Report, kein 1-Klick-Zugang |
| Grafana-Links kaputt | `GrafanaPanelEmbed.vue` hat BEREITS Health-Check mit "Grafana nicht erreichbar" Fallback. Links sind dynamisch via `useGrafana.ts`. Problem ist eher: **fehlender prominenter Hinweis** wenn Monitoring-Stack nicht laeuft, kein "Links kaputt". |
| ~~Fehlende QAB-Actions~~ | **[TEILWEISE IMPLEMENTIERT]** `ctx-full-diagnostic` (Diagnose starten) und `global-last-report` (Letzter Report) existieren in `useQuickActions.ts`. Nur **"Backup erstellen" fehlt** als QAB-Action. |
| ~~Scheduler-Luecken~~ | **[BEREITS VERDRAHTET]** `daily_diagnostic` Job existiert in `main.py` (Z.635-681, gesteuert via `diagnostic_schedule_enabled`). Plugin-Schedules werden aus DB geladen (Z.684-760). Beides funktional. |

---

## Block 1: Sidebar & Navigation bereinigen (~1.5h)

### Ziel
Jeder Sidebar-Eintrag fuehrt zu einem EIGENEN, sinnvollen Ziel. Keine Duplikate, keine Verwirrung.

### Analyse-Schritte

#### 1.1 — Sidebar-Inventar erstellen

**Datei:** `El Frontend/src/shared/design/layout/Sidebar.vue` ~~`El Frontend/src/components/Sidebar.vue`~~

**Pruefen und dokumentieren:**
- [ ] Jeden Sidebar-Eintrag auflisten: Label, Route, Icon, Sichtbarkeit (alle/admin)
- [ ] Welche Eintraege fuehren zum GLEICHEN View? (bekannt: "System" → `/system-monitor`, "Wartung" → `/system-monitor?tab=health`)
- [ ] Welche Views haben KEINEN Sidebar-Eintrag? (z.B. MaintenanceView unter `/maintenance`?)
- [ ] Sidebar-Sektionen: Wie sind sie gruppiert? (Navigation / Administration / Footer)

**Erwartetes Ergebnis-Format:**

```
IST (verify-plan korrigiert):
  Navigation:
    Dashboard    → /hardware        → LayoutDashboard   ✅
    Regeln       → /logic           → Workflow           [Korrektur: nicht GitBranch]
    Komponenten  → /sensors         → Activity           [Korrektur: nicht Cpu]
  Administration (Admin-only):
    System       → /system-monitor  → Monitor            ← PROBLEM: Gleicher View wie Wartung ✅
    Benutzer     → /users           → Users              ✅
    Wartung      → /system-monitor?tab=health → Wrench   ← PROBLEM: Gleicher View wie System ✅
    Kalibrierung → /calibration     → SlidersHorizontal  [Korrektur: nicht Sliders]
    Plugins      → /plugins         → Puzzle             ✅
  Footer:
    Einstellungen → /settings       → UserCog            [Korrektur: nicht Settings]
```

**[verify-plan] Hinweis:** `MaintenanceView.vue` EXISTIERT unter `/maintenance` (Route registriert, `requiresAdmin: true`). Es hat aber KEINEN Sidebar-Eintrag. Die Sidebar-Route "Wartung" zeigt auf `/system-monitor?tab=health`, NICHT auf `/maintenance`.

#### 1.2 — Sidebar-Bereinigung umsetzen

**Entscheidung treffen (eine der Optionen):**

| Option | Aenderung | Aufwand |
|--------|-----------|---------|
| **A (Empfohlen)** | "Wartung" entfernen. "System" bleibt mit allen 7+ Tabs | ~5min |
| B | "System" → "System & Wartung" umbenennen, "Wartung" entfernen | ~5min |
| C | "Wartung" → `/maintenance` verlinken (separater MaintenanceView) | ~10min |
| D | "System" → "Monitoring", "Wartung" → "Betrieb" (klare Trennung, verschiedene Views) | ~2h |

**Empfehlung:** Option A — minimal-invasiv, sofort klar.

**PRUEFEN ob MaintenanceView.vue (`/maintenance`) in der Sidebar fehlt:**
- [ ] `El Frontend/src/views/MaintenanceView.vue` existiert?
- [ ] Route `/maintenance` im Router registriert?
- [ ] Wenn ja: Will Robin diesen View ueberhaupt als eigenen Sidebar-Eintrag? Oder soll der Inhalt in SystemMonitorView als Tab integriert werden?

#### 1.3 — Alle internen Links pruefen

**Dateien:** Alle `.vue` Komponenten

**Suchen nach:**
- [ ] `router.push` / `router-link` / `href` mit `/system-monitor` — Sind Query-Parameter korrekt? (`?tab=health`, `?tab=reports`, `?tab=diagnostics`)
- [ ] Links zu `/maintenance` — Gibt es solche? Funktionieren sie?
- [ ] Links die `localhost:3000` (Grafana) enthalten — Siehe Block 5

**Report:** Tabelle aller internen Links mit Ziel + Status (funktional/kaputt/redundant)

---

## Block 2: Email-Integration sichtbar machen (~3-4h)

> **[verify-plan] WARNUNG: ~90% dieses Blocks ist BEREITS IMPLEMENTIERT.**
> Existiert: EmailLog Model + Migration, EmailLogRepository, REST-API (`/email-log`, `/email-log/stats`),
> Frontend `EmailLogEntry` Interface + API-Functions, `NotificationItem.vue` mit `emailStatus` computed.
> Logging läuft via `notification_router.py` → `email_log_repo.log_send()`.
>
> **Was TATSÄCHLICH noch fehlt:**
> 1. `email_service.py` loggt NICHT selbst (nur indirekt via NotificationRouter) — Test-Emails und Direct-Sends werden nicht geloggt
> 2. `NotificationDrawer.vue` Footer "Letzte 5 Emails" — nicht implementiert
> 3. Option B "Email-Tab" im SystemMonitorView — nicht implementiert
>
> **Geschätzter REALER Aufwand: ~1h** (statt 3-4h)

### Ziel
Der User sieht im Frontend jederzeit: Welche Emails wurden gesendet? Waren sie erfolgreich? Welcher Provider?

### Analyse-Schritte

#### 2.1 — EmailService IST-Zustand komplett erfassen

**Dateien:** [verify-plan: Pfade korrigiert — alle relativ zu `El Servador/god_kaiser_server/`]
- [x] `El Servador/god_kaiser_server/src/services/email_service.py` — `send_email(to, subject, html_body, text_body, template_name, template_context)` → `bool`. **Kein `notification_id`-Parameter, kein eigenes Logging.**
- [x] `El Servador/god_kaiser_server/src/services/notification_router.py` — `email_log_repo.log_send()` existiert (Z.322). Logging passiert HIER, nicht in email_service.
- [x] `El Servador/god_kaiser_server/src/services/digest_service.py` — existiert ✅
- [x] `El Servador/god_kaiser_server/templates/email/` — 3 Templates: `test.html`, `alert_critical.html`, `alert_digest.html` ✅
- [x] `El Servador/god_kaiser_server/src/core/config.py` — Email-Config existiert ✅
- [x] `El Servador/god_kaiser_server/src/core/metrics.py` — existiert ✅

**Erwartetes Ergebnis:** Vollstaendiges Fluss-Diagramm (Text):
```
Sensor-Threshold CRITICAL
  → NotificationRouter.route()
    → _route_email() [severity check, quiet hours, preferences]
      → EmailService.send_email(to, subject, html, template="alert_critical")
        → Resend API (primary) ODER SMTP (fallback)
          → return True/False
            → ??? (KEIN Tracking, KEIN Log)
```

#### ~~2.2 — EmailLog DB-Model erstellen~~ **[BEREITS IMPLEMENTIERT]**

> **[verify-plan]** `El Servador/god_kaiser_server/src/db/models/email_log.py` existiert bereits.
> Schema ist identisch zum Plan. Erbt von `TimestampMixin`. Import in `__init__.py` vorhanden.
> Alembic Migration `add_email_log_table.py` existiert.
> Repository `email_log_repo.py` existiert ebenfalls.
> **→ Diesen Schritt KOMPLETT ÜBERSPRINGEN.**

#### 2.3 — EmailService um Logging erweitern **[TEILWEISE IMPLEMENTIERT]**

> **[verify-plan]** Email-Logging existiert BEREITS in `notification_router.py` (Z.322: `email_log_repo.log_send()`).
> Aber: `email_service.py` selbst hat KEIN Logging. Das bedeutet:
> - Emails via NotificationRouter → werden geloggt ✅
> - Test-Emails via REST-Endpoint → werden geloggt (Z.581-582 in notifications.py) ✅
> - Direkte `email_service.send_email()` Aufrufe → werden NICHT geloggt ⚠️
>
> **Entscheidung nötig:** Reicht das bestehende Logging via NotificationRouter, oder soll `email_service.py` zusätzlich eigenes Logging bekommen?

**Datei:** `El Servador/god_kaiser_server/src/services/email_service.py`

**Nur falls eigenes Logging gewünscht:**
- [ ] `send_email()` bekommt optionalen Parameter `notification_id: UUID = None`
- [ ] DB-Session als Parameter oder via DI hinzufügen
- [ ] Logging nach bestehendem Pattern in `notification_router.py`

#### ~~2.4 — Alle Aufrufer von send_email() anpassen~~ **[NUR RELEVANT falls 2.3 umgesetzt wird]**

> **[verify-plan]** `notification_router.py` loggt bereits via `email_log_repo`. Test-Email Endpoint in `notifications.py` (Z.581) loggt ebenfalls. Nur nötig falls `email_service.py` eigene Logging-Logik bekommt.

#### ~~2.5 — REST-API fuer Email-Log~~ **[BEREITS IMPLEMENTIERT]**

> **[verify-plan]** Beide Endpoints existieren in `El Servador/god_kaiser_server/src/api/v1/notifications.py`:
> - `GET /v1/notifications/email-log` (Z.239) ✅
> - `GET /v1/notifications/email-log/stats` (Z.279) ✅
> **→ Diesen Schritt KOMPLETT ÜBERSPRINGEN.**

#### 2.6 — Frontend: Email-Status anzeigen

**Option A (Empfohlen — minimal):** Pro Notification im `NotificationDrawer.vue` ein Email-Status-Icon anzeigen.

**Pruefen:**
- [x] ~~`NotificationResponse` DTO: Kann das Backend ein `email_status` Feld anhaengen?~~ **[verify-plan: `email_status` wird via `metadata` Feld transportiert]**
- [x] ~~Separater API-Call~~ **[verify-plan: Nicht nötig — `email_status` kommt im Notification-Objekt mit]**

**Implementierung:**
- [x] ~~`El Frontend/src/api/notifications.ts` — `EmailLogEntry` Interface + `getEmailLog()` Funktion~~ **[EXISTIERT: Z.139 `EmailLogEntry`, Z.345 `getEmailLog()`, Z.355 `getEmailLogStats()`]**
- [x] ~~`El Frontend/src/components/notifications/NotificationItem.vue` — Email-Status-Icon~~ **[EXISTIERT: Z.51 `emailStatus` computed, Z.166 Status-Anzeige, Z.417-433 CSS-Klassen sent/failed/pending]**
- [ ] `El Frontend/src/components/notifications/NotificationDrawer.vue` — Footer-Bereich: "Letzte 5 Emails" mit Status **[FEHLT NOCH — einzige offene Aufgabe in Block 2.6]**

**Option B (spaeter):** Dedizierter "Email-Tab" im SystemMonitorView oder eigener CommunicationView.

---

## Block 3: Backup-~~System aufbauen~~ Frontend-UI erstellen (~1.5-2h)

> **[verify-plan] WARNUNG: Backend ist KOMPLETT IMPLEMENTIERT.**
> Existiert:
> - `El Servador/god_kaiser_server/src/services/database_backup_service.py` (Phase A V5.1) — alle Methoden
> - `El Servador/god_kaiser_server/src/api/v1/backups.py` — REST-API (create, list, download, delete, restore)
> - `El Servador/god_kaiser_server/src/core/config.py` → `DatabaseBackupSettings` (DB_BACKUP_ENABLED, HOUR, MINUTE, MAX_AGE_DAYS, MAX_COUNT)
> - `El Servador/Dockerfile` → `postgresql-client` installiert (Z.45-48)
> - `main.py` → `database_backup` CronJob registriert (Z.383-411)
> - Router in `__init__.py` eingebunden (Z.66)
>
> **Was TATSÄCHLICH fehlt:**
> 1. Frontend Backup-UI (kein Tab, kein View, kein Store)
> 2. Backup-Pfad nicht konfigurierbar via ENV (hardcoded `backups/database`)
> 3. QAB-Action "Backup erstellen" fehlt in `useQuickActions.ts`
>
> **Geschätzter REALER Aufwand: ~1.5-2h** (statt 4-5h, nur Frontend + Config)

### Ziel
~~PostgreSQL-Backup funktioniert, Pfad ist konfigurierbar,~~ User hat im Frontend eine klare Uebersicht mit "Jetzt Backup" Button.

### Analyse-Schritte

#### ~~3.1 — Docker-Topologie fuer pg_dump analysieren~~ **[BEREITS ERLEDIGT]**

> **[verify-plan]** Alles vorhanden:
> - [x] PostgreSQL: Service `postgres`, Container `automationone-postgres`, Port 5432 ✅
> - [x] `pg_dump` installiert im Dockerfile Runtime-Stage ✅
> - [x] Credentials via `DATABASE_URL` ENV ✅
> **→ Diesen Schritt KOMPLETT ÜBERSPRINGEN.**

#### ~~3.2 — DatabaseBackupService implementieren~~ **[BEREITS IMPLEMENTIERT]**

> **[verify-plan]** `El Servador/god_kaiser_server/src/services/database_backup_service.py` existiert.
> Format: `.sql.gz` (nicht `.dump` wie im Plan). Alle Methoden vorhanden:
> `create_backup()`, `list_backups()`, `delete_backup()`, `cleanup_old_backups()`, `restore_backup()`.
> **→ Diesen Schritt KOMPLETT ÜBERSPRINGEN.**
>
> **Einzige offene Aufgabe:** Backup-Pfad via ENV konfigurierbar machen (aktuell hardcoded `backups/database`).

---

## /verify-plan Ergebnis

**Plan:** Frontend-Feinschliff & Vollintegration (7 Blöcke, ~12-18h geschätzt)
**Geprüft:** 16 Pfade, 0 Agents, 4 Services, 4 Endpoints, 7 Tabs, 10 Icons, 1 Dockerfile

### Bestätigt
- Block 1: Sidebar-Redundanz "System" vs "Wartung" existiert (beide → SystemMonitorView) ✅
- Block 1: Route `/maintenance` existiert, hat aber keinen Sidebar-Eintrag ✅
- Block 1: Alle im Plan genannten Routen existieren im Router ✅
- Grafana-Integration: `useGrafana.ts` + `GrafanaPanelEmbed.vue` mit Health-Check + Error-State ✅
- SystemMonitorView: 7 Tabs (events, logs, database, mqtt, health, diagnostics, reports) ✅
- Email-Templates: alle 3 vorhanden (test, alert_critical, alert_digest) ✅

### Korrekturen nötig

**Pfad: Sidebar.vue**
- Plan sagt: `El Frontend/src/components/Sidebar.vue`
- System sagt: `El Frontend/src/shared/design/layout/Sidebar.vue`
- **→ Korrigiert in Plan-Datei**

**Icons: 4 von 10 falsch**
- Plan sagt: Regeln → `GitBranch`, Komponenten → `Cpu`, Kalibrierung → `Sliders`, Einstellungen → `Settings`
- System sagt: Regeln → `Workflow`, Komponenten → `Activity`, Kalibrierung → `SlidersHorizontal`, Einstellungen → `UserCog`
- **→ Korrigiert in Plan-Datei**

**Block 2: ~90% bereits implementiert**
- Plan sagt: "Neue Datei `email_log.py`", REST-API erstellen, Frontend Interfaces erstellen
- System sagt: EmailLog Model + Migration + Repository + REST-API + Frontend `EmailLogEntry` + `emailStatus` in NotificationItem — alles existiert
- **→ Korrigiert in Plan-Datei. Realer Aufwand: ~1h statt 3-4h**

**Block 3: Backend komplett implementiert**
- Plan sagt: "DatabaseBackupService implementieren", Docker pg_dump installieren, REST-API bauen
- System sagt: `database_backup_service.py` (Phase A V5.1), `backups.py` API, `postgresql-client` im Dockerfile, CronJob in `main.py` — alles existiert
- **→ Korrigiert in Plan-Datei. Realer Aufwand: ~1.5-2h statt 4-5h (nur Frontend-UI)**

**Block 3: Backup-Format**
- Plan sagt: `pg_dump --format=custom` → `.dump`
- System sagt: `.sql.gz` (gzip-komprimiertes SQL)

**Scheduler-Lücken: Existieren NICHT**
- Plan sagt: "Daily Diagnostic nicht verdrahtet, Plugin-Schedules nicht geladen"
- System sagt: `daily_diagnostic` CronJob existiert (main.py Z.635-681), Plugin-Schedules werden aus DB geladen (Z.684-760)
- **→ Korrigiert in Ausgangslage-Tabelle**

**QAB-Actions: Teilweise implementiert**
- Plan sagt: "Diagnose starten", "Backup erstellen", "Letzter Report" fehlen
- System sagt: `ctx-full-diagnostic` und `global-last-report` existieren. Nur "Backup erstellen" fehlt.
- **→ Korrigiert in Ausgangslage-Tabelle**

### Fehlende Vorbedingungen
- [ ] Docker-Stack muss laufen für Frontend-Entwicklung (`make dev`)
- [ ] Monitoring-Stack optional für Grafana-Tests (`make monitor-up`)

### Tatsächlich offene Aufgaben (bereinigt)

| # | Aufgabe | Aufwand | Block |
|---|---------|---------|-------|
| 1 | Sidebar bereinigen (Redundanz "System"/"Wartung") | ~30min | 1 |
| 2 | Sidebar-Links prüfen + tote Links fixen | ~30min | 1 |
| 3 | NotificationDrawer Footer "Letzte 5 Emails" | ~1h | 2 |
| 4 | Optional: email_service.py eigenes Logging | ~30min | 2 |
| 5 | Backup Frontend-UI (Tab oder View + Store + API-Client) | ~1.5-2h | 3 |
| 6 | Backup-Pfad konfigurierbar via ENV | ~15min | 3 |
| 7 | QAB-Action "Backup erstellen" | ~15min | 3 |
| 8 | Diagnostics 1-Klick-Zugang verbessern | ~30min | 4* |
| 9 | Grafana-Hinweis wenn Monitoring-Stack nicht läuft | ~30min | 5* |
| **Gesamt** | | **~5-6h** | |

*Blöcke 4-7 wurden nicht geprüft da sie im Plan-Dokument nicht enthalten waren (Plan endet bei Block 3.2).

### Zusammenfassung für TM

**Der Plan ist massiv überdimensioniert.** Blöcke 2 und 3 beschreiben Implementierungen die zu ~90% bereits existieren (Phase A V5.1 und Phase C V1.1). Der geschätzte Aufwand von 12-18h reduziert sich auf **~5-6h realen Aufwand**. Die Ausgangslage-Tabelle enthielt 3 von 7 falsche Problemdiagnosen (Email-Logging, Backup-Backend, Scheduler — alles bereits implementiert). Die Blöcke 4-7 fehlen im Plan-Dokument und konnten nicht geprüft werden. TM sollte den Plan auf die tatsächlich offenen Aufgaben zusammenkürzen.