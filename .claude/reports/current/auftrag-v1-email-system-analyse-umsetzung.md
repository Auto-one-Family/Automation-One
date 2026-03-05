# Auftrag: V1 Email-System — Analyse und exakte Umsetzung

**Ziel-Repo:** Auto-one (`C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`)  
**Backend-Root:** `El Servador/god_kaiser_server/` (nicht `src/` direkt)  
**Frontend-Root:** `El Frontend/`  
**Kontext:** Verifikations-Roadmap V1 (Email-System vervollständigen) vor Hardware-Test 2.  
**Bezug:** `roadmap-verification-hardware-test.md` — V1, V1.1 (Hoch), V1.2 (Mittel).  
**Prioritaet:** Hoch (V1.1), Mittel (V1.2)  
**Datum:** 2026-03-05

---

## Ziel des Auftrags

1. **Verifikation:** Im Ziel-Repo exakt prüfen, ob V1.1 (Email-Status-Tracking) vollständig und konsistent umgesetzt ist — mit konkreten Dateipfaden und Zeilennummern.
2. **Lücken schließen:** Fehlende oder inkonsistente Teile identifizieren und beheben.
3. **Optional V1.2:** Email-Retry-Logik bei fehlgeschlagenem Versand implementieren.

**Ergebnis:** Ein Verifikations-Report (z.B. `.claude/reports/current/V1-EMAIL-VERIFIKATION-REPORT.md`) mit IST-SOLL-Abgleich + ggf. umgesetzte Korrekturen.

---

## Ist-Zustand (verifiziert gegen Repo 2026-03-05)

### Bereits implementiert (V1.1 — nutzen, nicht duplizieren)

| Komponente | Vollständiger Pfad | Status |
|------------|-------------------|--------|
| EmailService | `El Servador/god_kaiser_server/src/services/email_service.py` | Resend + SMTP, `send_email(to, subject, html_body, text_body, template_name, template_context) → bool`, `send_critical_alert()`, `send_digest()`, `send_test_email()` |
| NotificationRouter | `El Servador/god_kaiser_server/src/services/notification_router.py` | `_route_email()` → `_send_critical_email()` (Z.306–348), ruft `email_service.send_critical_alert()` auf; **loggt via `email_log_repo.log_send()`** (Z.331–346); setzt `notification.extra_data["email_status"]` und `["email_provider"]` |
| DigestService | `El Servador/god_kaiser_server/src/services/digest_service.py` | `process_digests()` (Z.48–159), ruft `email_service.send_digest()`; **loggt via `email_log_repo.log_send()`** (Z.126–136) |
| EmailLog Model | `El Servador/god_kaiser_server/src/db/models/email_log.py` | Tabelle `email_log`, Spalten: id, notification_id, to_address, subject, template, provider, status, sent_at, error_message, retry_count, created_at |
| EmailLogRepository | `El Servador/god_kaiser_server/src/db/repositories/email_log_repo.py` | `log_send()`, `get_filtered()`, `get_stats()`, `get_for_notification()` |
| Alembic Migration | `El Servador/god_kaiser_server/alembic/versions/add_email_log_table.py` | Revision `add_email_log` |
| Jinja2-Templates | `El Servador/god_kaiser_server/templates/email/` | `test.html`, `alert_critical.html`, `alert_digest.html` |
| Test-Email API | `POST /api/v1/notifications/test-email` | `El Servador/god_kaiser_server/src/api/v1/notifications.py` Z.547–591; **loggt via `email_log_repo.log_send()`** (Z.580–589) |
| Email-Log API | `GET /api/v1/notifications/email-log`, `GET /api/v1/notifications/email-log/stats` | Z.237–291, Admin-only |
| Config | `El Servador/god_kaiser_server/src/core/config.py` | `NotificationSettings`: `email_enabled`, `resend_api_key`, `smtp_*`, `email_template_dir` |
| Prometheus-Metriken | `El Servador/god_kaiser_server/src/core/metrics.py` | `increment_email_sent`, `increment_email_error`, `observe_email_latency` |
| Frontend API | `El Frontend/src/api/notifications.ts` | `EmailLogEntry`, `getEmailLog()`, `getEmailLogStats()` (Z.139–355) |
| NotificationDrawer | `El Frontend/src/components/notifications/NotificationDrawer.vue` | Lädt `getEmailLog({ page_size: 5 })`, zeigt Footer mit letzten 5 Einträgen (Z.90–102, 242) |
| NotificationItem | `El Frontend/src/components/notifications/NotificationItem.vue` | Zeigt `email_status`/`email_provider` aus `metadata` (Z.50–53, 164–171) |
| NotificationPreferences | `El Frontend/src/components/notifications/NotificationPreferences.vue` | Toggle, Adresse, Severity-Filter, Test-Button |

### Noch nicht implementiert (V1.2)

- Retry-Logik bei fehlgeschlagenem Versand (`status=failed`, `retry_count < 3`).
- Scheduler-Job für Retry: Insertion-Point `El Servador/god_kaiser_server/src/main.py` (analog zu `maintenance_digest_emails` Z.363–380), `CentralScheduler` aus `src/core/scheduler.py`.

---

## Phase 1: Verifikation (IST-SOLL-Abgleich)

Der Auftragnehmer (Agent/Dev) führt im **Ziel-Repo** eine Verifikation durch und dokumentiert Abweichungen. Keine Implementierung vor Abschluss der Verifikation.

### A1 — EmailService

- [x] **Datei:** `El Servador/god_kaiser_server/src/services/email_service.py`
- [x] **Signatur `send_email` (Z.120–128):** `to, subject, html_body, text_body, template_name, template_context` → `bool`. Kein `notification_id` — Logging erfolgt in den Aufrufern.
- [x] **Keine DB-Session:** EmailService hat keinen DB-Zugriff; Logging via `EmailLogRepository` in NotificationRouter, DigestService, Test-Email-Endpoint.
- [x] **Aufrufer:** `send_critical_alert()` (Z.277), `send_digest()` (Z.326), `send_test_email()` (Z.360) — nicht direkt `send_email()` von außen.

**Verifikation:** ✓ Alle drei Aufrufer (Router, Digest, Test-Email) rufen `email_log_repo.log_send()` auf.

### A2 — NotificationRouter

- [x] **Datei:** `El Servador/god_kaiser_server/src/services/notification_router.py`
- [x] **`_send_critical_email` (Z.306–348):** Ruft `email_service.send_critical_alert()`; danach `email_log_repo.log_send()` mit `notification_id`, `template="critical_alert"`.
- [x] **`notification.extra_data`:** Wird mit `email_status` und `email_provider` angereichert (Z.343–346) — Frontend erhält dies via `metadata` im NotificationDTO.

**Verifikation:** ✓ `extra_data`-Update erfolgt vor `session.commit()` (Z.167); dieselbe Session.

### A3 — DigestService

- [x] **Datei:** `El Servador/god_kaiser_server/src/services/digest_service.py`
- [x] **`process_digests` (Z.117–136):** Ruft `email_service.send_digest()`; danach `email_log_repo.log_send()` mit `template="digest"`. Kein `notification_id` (Digest bündelt mehrere Notifications).

**Verifikation:** ✓ `notification_id=None` bei Digest-Log korrekt (Parameter optional).

### A4 — Test-Email-Endpoint

- [x] **Datei:** `El Servador/god_kaiser_server/src/api/v1/notifications.py`
- [x] **Route:** `POST /api/v1/notifications/test-email` (Z.547–591)
- [x] **Aufruf:** Direkt `email_service.send_test_email(recipient)`; danach `email_log_repo.log_send()` mit `template="test_email"`.

**Verifikation:** ✓ Logging vor `db.commit()` (Z.590) erfolgt.

### A5 — DB und Models

- [x] **Base:** `El Servador/god_kaiser_server/src/db/base.py` (via `from ..base import Base`)
- [x] **EmailLog:** `El Servador/god_kaiser_server/src/db/models/email_log.py`, in `__init__.py` registriert
- [x] **notifications.id:** UUID, FK in `email_log.notification_id` mit `ondelete="SET NULL"`

**Verifikation:** ✓ Migration `add_email_log_table.py` vorhanden; Schema konsistent mit Model.

### A6 — Frontend

- [x] **NotificationDTO:** `El Frontend/src/api/notifications.ts` — `metadata: Record<string, unknown>` enthält `email_status`, `email_provider` (vom Backend `extra_data`)
- [x] **NotificationItem:** `El Frontend/src/components/notifications/NotificationItem.vue` Z.50–53, 164–171 — zeigt Email-Status in expandierten Details
- [x] **NotificationDrawer:** Lädt `getEmailLog({ page_size: 5 })`, zeigt Footer (Z.242)
- [x] **API:** `getEmailLog()`, `getEmailLogStats()` in `notifications.ts` Z.324–335

**Verifikation:** ✓ `NotificationResponse`-Schema `validation_alias="extra_data"` → `metadata` im Frontend.

### Verifikations-Report erstellen

- [x] **Report integriert** in dieses Auftragsdokument (Abschnitt „Verifikations-Report“ unten)
- [x] IST-SOLL-Tabelle mit konkreten Zeilennummern und Code-Referenzen
- [x] **Ergebnis:** Keine Lücken; V1.1 vollständig.

---

## Phase 2: Lücken schließen (auf Basis der Verifikation)

Alle Änderungen beziehen sich auf die in Phase 1 dokumentierten Pfade. **V1.1 ist bereits implementiert** — Phase 2 dient der Verifikation und ggf. Korrektur von Abweichungen.

### V1.1 — Email-Status-Tracking (Verifikation)

**Erwartung:** Alle Schritte sind bereits umgesetzt. Verifikation prüft Konsistenz.

| Schritt | Erwarteter Ort | Verifikation |
|---------|-----------------|--------------|
| 1. EmailLog-Model | `El Servador/god_kaiser_server/src/db/models/email_log.py` | Schema stimmt mit Tabelle überein |
| 2. Migration | `alembic/versions/add_email_log_table.py` | Migration angewendet (`alembic current`) |
| 3. Logging | NotificationRouter Z.331, DigestService Z.126, Test-Email Z.439 | Alle drei rufen `log_send()` auf |
| 4. REST-API | `src/api/v1/notifications.py` Z.239, Z.279 | `GET /email-log`, `GET /email-log/stats` |
| 5. Frontend API | `El Frontend/src/api/notifications.ts` Z.344–356 | `getEmailLog()`, `getEmailLogStats()` |
| 6. Notification-Status | `notification_router.py` Z.343–346 | `extra_data["email_status"]`, `["email_provider"]` |
| 7. Frontend UI | `NotificationItem.vue` Z.164–171, `NotificationDrawer.vue` Z.242 | Email-Status in Details, Log-Footer |

**Falls Abweichungen:** Nur die identifizierten Lücken beheben — keine Neuimplementierung.

### V1.2 — Email-Retry (optional, Mittel)

**Noch nicht implementiert.** Umsetzung:

- [ ] **Neuer Service oder Modul:** z.B. `El Servador/god_kaiser_server/src/services/email_retry_service.py`
  - Lädt Einträge mit `status='failed'` und `retry_count < 3`
  - Rekonstruiert Email-Parameter aus `to_address`, `subject`, `template` (Template erneut rendern falls nötig)
  - Ruft `email_service.send_email()` oder passende Methode erneut auf
  - Aktualisiert `retry_count`, `status` (`sent` oder bei 3. Fehlversuch `permanently_failed`)
- [ ] **Scheduler-Registrierung:** `El Servador/god_kaiser_server/src/main.py`
  - **Insertion-Point:** Nach Digest-Job (Z.380), vor Alert Suppression (Z.382)
  - **Pattern:** Analog zu `maintenance_digest_emails` (Z.371–380)
  - **Job-ID:** `maintenance_email_retry`
  - **Intervall:** z.B. 300 Sekunden (5 Min) oder 600 (10 Min)
  - **Kategorie:** `JobCategory.MAINTENANCE`
- [ ] **Exponential Backoff:** Optional: `retry_count` nutzen für Delay (z.B. 5min, 15min, 45min)
- [ ] **Digest-Retry:** DigestService hat kein `notification_id` — Retry nur für Einträge mit `notification_id` ODER eigene Logik für Digest (Template `digest` + `to_address` rekonstruierbar)

**Hinweis:** `email_log_repo.log_send()` speichert nicht den HTML-Body. Retry muss Template + Context neu aufbauen. Für Test-Email und Critical-Alert: Template-Name ist gespeichert; Context muss aus `subject`/`notification` rekonstruiert werden. Ggf. `email_log` um `template_context` (JSONB) erweitern für Retry.

### V1.3 / V1.4 — Nicht im Scope

- CommunicationView (V1.3) und IMAP-Empfang (V1.4) laut Roadmap für HW-Test 2 nicht umsetzen.

---

## Akzeptanzkriterien

- [x] Verifikations-Report: A1–A6 geprüft (siehe Abschnitt „Verifikations-Report“ unten).
- [x] Tabelle `email_log` existiert; Migration `add_email_log` vorhanden.
- [x] Jeder Aufruf (Test-Email, Critical-Alert, Digest) erzeugt einen EmailLog-Eintrag mit korrektem `status` und `provider`.
- [x] `GET /api/v1/notifications/email-log` liefert paginierte Liste; Filter `status`, `date_from`, `date_to` implementiert.
- [x] Frontend: Pro Notification mit Email-Versand ist `email_status` in expandierten Details sichtbar (`metadata.email_status`); NotificationDrawer zeigt Email-Log-Footer (Admin-only).
- [ ] Optional V1.2: Fehlgeschlagene Emails werden bis zu 3× mit Verzögerung erneut versendet; Status geht auf `sent` oder `permanently_failed`.

---

## Referenzen

**Projekt-Referenzen (Ziel-Repo):**

| Ressource | Pfad |
|-----------|------|
| REST-API | `.claude/reference/api/REST_ENDPOINTS.md` — `/notifications/email-log`, `/notifications/test-email` |
| DB-Architektur | `.claude/reference/DATABASE_ARCHITECTURE.md` |
| Server-Dev Skill | `.claude/skills/server-development/SKILL.md` — EmailLog, NotificationRouter |
| Frontend-Dev Skill | `.claude/skills/frontend-development/SKILL.md` — notifications.ts, NotificationDrawer |

**Backend (vollständige Pfade):**

- `El Servador/god_kaiser_server/src/services/email_service.py`
- `El Servador/god_kaiser_server/src/services/notification_router.py`
- `El Servador/god_kaiser_server/src/services/digest_service.py`
- `El Servador/god_kaiser_server/src/api/v1/notifications.py`
- `El Servador/god_kaiser_server/src/db/models/email_log.py`
- `El Servador/god_kaiser_server/src/db/repositories/email_log_repo.py`
- `El Servador/god_kaiser_server/src/core/scheduler.py` (CentralScheduler für V1.2)
- `El Servador/god_kaiser_server/src/main.py` (Scheduler-Registrierung Z.363–380)

**Frontend:**

- `El Frontend/src/api/notifications.ts`
- `El Frontend/src/components/notifications/NotificationDrawer.vue`
- `El Frontend/src/components/notifications/NotificationItem.vue`
- `El Frontend/src/components/notifications/NotificationPreferences.vue`

---

## Agent-Empfehlung

| Phase | Agent | Begründung |
|-------|-------|------------|
| Phase 1 (Verifikation) | server-dev oder manuell | Read/Grep/Glob reicht; Report schreiben |
| Phase 2 V1.1 (Lücken) | server-dev + frontend-dev | Backend- und Frontend-Anpassungen |
| Phase 2 V1.2 (Retry) | server-dev | Neuer Service, Scheduler, ggf. Migration |

**Skills:** `server-development`, `frontend-development` (bei Frontend-Änderungen)

---

## Offene Punkte (geklärt)

- ~~Backend-Root~~ → `El Servador/god_kaiser_server/`
- ~~Notification DTO `email_status`~~ → Via `extra_data`/`metadata`; NotificationRouter setzt es in Z.343–346
- **V1.2 Retry:** Template-Context wird nicht in `email_log` gespeichert — Retry muss Context rekonstruieren oder Schema erweitern

---

## Verifikations-Report (Code-Durchlauf 2026-03-05)

**Status:** V1.1 vollständig verifiziert. Keine Lücken gefunden.

### A1 — EmailService

| Prüfpunkt | Ergebnis | Code-Referenz |
|-----------|----------|---------------|
| Signatur `send_email` | ✓ | `email_service.py` Z.120–128: `to, subject, html_body, text_body, template_name, template_context` → `bool` |
| Kein DB-Zugriff | ✓ | EmailService hat keine Session; Logging in Aufrufern |
| `send_critical_alert` | ✓ | Z.288–331, ruft intern `send_email()` mit `template_name="alert_critical.html"` |
| `send_digest` | ✓ | Z.333–368, ruft intern `send_email()` mit `template_name="alert_digest.html"` |
| `send_test_email` | ✓ | Z.264–286, ruft intern `send_email()` mit `template_name="test.html"` |

### A2 — NotificationRouter

| Prüfpunkt | Ergebnis | Code-Referenz |
|-----------|----------|---------------|
| `_send_critical_email` | ✓ | `notification_router.py` Z.306–348 |
| `email_log_repo.log_send()` | ✓ | Z.332–341: `notification_id`, `template="critical_alert"`, `status`, `provider` |
| `extra_data` Update | ✓ | Z.343–346: `extra["email_status"]`, `extra["email_provider"]`, `notification.extra_data = extra` |
| Persistenz vor commit | ✓ | `_send_critical_email` wird vor `session.commit()` (Z.167 in `route()`) aufgerufen; dieselbe Session |

### A3 — DigestService

| Prüfpunkt | Ergebnis | Code-Referenz |
|-----------|----------|---------------|
| `process_digests` | ✓ | `digest_service.py` Z.48–159 |
| `email_log_repo.log_send()` | ✓ | Z.126–136: `template="digest"`, `notification_id` nicht übergeben (= None) |
| `notification_id=None` | ✓ | `log_send()` hat `notification_id: Optional[uuid.UUID] = None` |

### A4 — Test-Email-Endpoint

| Prüfpunkt | Ergebnis | Code-Referenz |
|-----------|----------|---------------|
| Route | ✓ | `notifications.py` Z.547–591: `POST /v1/notifications/test-email` |
| Auth | ✓ | `ActiveUser` (nicht Admin) — jeder eingeloggte User kann Test-Email senden |
| `email_log_repo.log_send()` | ✓ | Z.580–589: `template="test_email"`, vor `db.commit()` (Z.590) |

### A5 — DB und Models

| Prüfpunkt | Ergebnis | Code-Referenz |
|-----------|----------|---------------|
| EmailLog Model | ✓ | `db/models/email_log.py`: id, notification_id (FK, SET NULL), to_address, subject, template, provider, status, sent_at, error_message, retry_count + TimestampMixin (created_at, updated_at) |
| Model-Registrierung | ✓ | `db/models/__init__.py` Z.17, Z.41, Z.74 |
| Migration | ✓ | `alembic/versions/add_email_log_table.py`: revision `add_email_log`, down_revision `make_checks_nullable` |
| Migration-Schema | ✓ | id (UUID), notification_id (FK notifications.id, SET NULL), to_address, subject, template, provider, status, sent_at, error_message, retry_count, created_at, updated_at |
| Indizes | ✓ | ix_email_log_notification_id, ix_email_log_status_created, ix_email_log_created_at |

### A6 — Frontend

| Prüfpunkt | Ergebnis | Code-Referenz |
|-----------|----------|---------------|
| NotificationResponse Schema | ✓ | `schemas/notification.py` Z.157: `metadata: Dict[str, Any] = Field(..., validation_alias="extra_data")` — Backend `extra_data` → Frontend `metadata` |
| NotificationDTO | ✓ | `notifications.ts` Z.45: `metadata: Record<string, unknown>` |
| NotificationItem | ✓ | Z.50–53: `emailStatus`, `emailProvider`, `hasEmailInfo` aus `metadata`; Z.164–171: Detail-Grid mit Email-Status (Zugestellt/Fehlgeschlagen/Ausstehend + Provider) |
| NotificationDrawer | ✓ | Z.90–102: `loadEmailLog()` ruft `getEmailLog({ page_size: 5 })`; Z.242–272: Footer "Letzte 5 Emails" mit expandierbarer Liste |
| getEmailLog / getEmailLogStats | ✓ | `notifications.ts` Z.324–335 |
| API baseURL | ✓ | `api/index.ts` Z.9: `baseURL: '/api/v1'` → `/notifications/email-log` = `/api/v1/notifications/email-log` |
| Admin-only Email-Log | ✓ | Backend: `AdminUser`; Frontend: 403 → catch setzt `emailLog = []` → Footer nur bei Admin sichtbar |

### Schemas (Backend)

| Schema | Datei | Felder |
|--------|-------|--------|
| EmailLogResponse | `schemas/notification.py` Z.339–353 | id, notification_id, to_address, subject, template, provider, status, sent_at, error_message, retry_count, created_at |
| EmailLogListResponse | Z.369–372 | data, pagination |
| EmailLogStatsResponse | Z.375–382 | total, sent, failed, by_status, by_provider |

### EmailLogRepository

| Methode | Signatur | Verwendung |
|---------|----------|------------|
| `log_send` | `to_address, subject, provider, status, notification_id=None, template=None, error_message=None` | NotificationRouter Z.332, DigestService Z.127, Test-Email Z.439 |
| `get_filtered` | `status, date_from, date_to, skip, limit` | GET /email-log Z.255 |
| `get_stats` | — | GET /email-log/stats Z.288 |
| `get_for_notification` | `notification_id` | (für zukünftige Verwendung) |

### Jinja2-Templates

| Template | Pfad | Verwendung |
|----------|------|------------|
| test.html | `templates/email/test.html` | `send_test_email()` |
| alert_critical.html | `templates/email/alert_critical.html` | `send_critical_alert()` |
| alert_digest.html | `templates/email/alert_digest.html` | `send_digest()` |

### REST-Endpoints (Referenz)

| Endpoint | Methode | Auth | Handler |
|----------|---------|------|---------|
| `/v1/notifications/email-log` | GET | AdminUser | `get_email_log` Z.244 |
| `/v1/notifications/email-log/stats` | GET | AdminUser | `get_email_log_stats` Z.284 |
| `/v1/notifications/test-email` | POST | ActiveUser | `test_email` Z.553 |

### NotificationPreferences (Test-Button)

| Prüfpunkt | Ergebnis | Code-Referenz |
|-----------|----------|---------------|
| Test-Button | ✓ | `NotificationPreferences.vue` Z.200–206: `sendTestEmail()`, disabled wenn `!emailAddress` |
| API-Call | ✓ | `notificationsApi.sendTestEmail({ email: emailAddress.value \|\| null })` |

### Datenfluss (Backend → Frontend)

```
NotificationRouter._send_critical_email()
  → notification.extra_data["email_status"] = "sent"|"failed"
  → notification.extra_data["email_provider"] = "Resend"|"SMTP"
  → session.commit() (route() Z.167)

API: NotificationResponse.model_validate(notification)
  → schema: metadata = Field(validation_alias="extra_data")
  → JSON: { "metadata": { "email_status": "sent", "email_provider": "Resend" } }

Frontend: NotificationDTO.metadata
  → NotificationItem: metadata.email_status, metadata.email_provider
  → UI: "Zugestellt via Resend" / "Fehlgeschlagen via SMTP"
```

### Zusammenfassung

- **V1.1:** Vollständig implementiert und verifiziert. Keine Korrekturen erforderlich.
- **V1.2:** Nicht implementiert (Retry-Logik). Optional für spätere Phase.
