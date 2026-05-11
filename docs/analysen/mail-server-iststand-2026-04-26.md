# AUT-192 — Mail-Server IST-Stand + email_service.py Audit

**Stand:** 2026-04-26  
**Linear:** [AUT-192](https://linear.app/autoone/issue/AUT-192)  
**Projekt:** Claude API Integration in AutomationOne (Phase 1–3)  
**Etappe:** 2 von 4 — blockiert AUT-194 (DailyAnalysisJob)

---

## 1. Mail-Server-Daemon

**Kein dedizierter Mail-Daemon-Container vorhanden.**

`docker-compose.yml` enthält keinen Service vom Typ Postfix, Dovecot, Mailcow oder MailHog. Die einzige `email`-Erwähnung ist `PGADMIN_DEFAULT_EMAIL` (Z. 444) — kein Mail-Transport-Agent.

Mail-Zustellung erfolgt ausschließlich über die Anwendungsebene:
- **Primär:** Resend API (externer SaaS, HTTP-basiert, SDK `resend`)
- **Fallback:** SMTP via `smtplib.SMTP` (Python-Stdlib, kein Docker-Container)

`NotificationSettings.smtp_port` Default 587 zeigt gegen externen SMTP-Host. Kein Container-Volume, kein Maildir, keine Queue auf Docker-Ebene.

**Schlussfolgerung:** AutomationOne betreibt keinen eigenen Mail-Daemon. Mail-Transport liegt vollständig beim externen Anbieter (Resend SaaS oder konfigurierbarer SMTP-Relay).

---

## 2. email_service.py Audit

**Pfad:** `El Servador/god_kaiser_server/src/services/email_service.py`  
**Status:** VOLLSTÄNDIG IMPLEMENTIERT — wartet auf `.env`-Aktivierung  
**Implementierungsgrad:** ~100% (kein Stub-Code, keine TODOs)

### Public Methods

| Methode | Signatur | Zweck |
|---------|----------|-------|
| `is_available` | `@property -> bool` | Prüft ob `email_enabled AND (resend OR smtp)` aktiv |
| `provider_name` | `@property -> str` | Gibt `"Resend"`, `"SMTP"` oder `"None"` zurück |
| `send_email` | `async (to, subject, html_body, text_body, template_name, template_context) -> bool` | Zentraler Versand-Dispatcher, nie-werfend |
| `send_test_email` | `async (to) -> bool` | Versendet `test.html`-Template |
| `send_critical_alert` | `async (to, title, body, severity, source, category, metadata) -> bool` | Versendet `alert_critical.html` |
| `send_digest` | `async (to, notifications, digest_period) -> bool` | Versendet `alert_digest.html` mit Batchliste |

**Interne Methoden:** `_init_providers()`, `_init_templates()`, `_render_template()`, `_send_via_resend()`, `_send_via_smtp()`

**Singleton:** `get_email_service()` (Z. 376)

**Dual-Provider-Logik:** Resend first → SMTP fallback → return False (kein Exception-Propagation).  
Resend SDK ist synchron, wird per `asyncio.to_thread()` ausgelagert (Z. 201).  
SMTP ebenfalls via `asyncio.to_thread()` (Z. 250). `timeout=10s` bei SMTP-Connect (Z. 227).

**Template-Verzeichnis:** `El Servador/god_kaiser_server/templates/email/`  
Vorhandene Templates: `alert_critical.html`, `alert_digest.html`, `test.html`

**Zusätzlich vorhanden:**
- `El Servador/god_kaiser_server/src/services/email_retry_service.py` — Retry-Logik für fehlgeschlagene Mails (5min Delay, max 3 Versuche, dann `permanently_failed`)
- `El Servador/god_kaiser_server/src/db/models/email_log.py` — ORM-Model
- `El Servador/god_kaiser_server/src/db/repositories/email_log_repo.py` — Repository

---

## 3. SMTP-Kanal-Aktivierbarkeit

**Status:** Aktiv nutzbar sobald `.env` korrekt befüllt ist.

`NotificationActionExecutor` delegiert `channel="email"` an `NotificationRouter.route()` (Pfad: `notification_executor.py` Z. 107-113), der `EmailService.is_available` prüft (`notification_router.py` Z. 182).

**`EMAIL_ENABLED` Toggle:** `NotificationSettings` (`config.py` Z. 274), Default `False`.  
Ohne `True` gibt `send_email()` sofort `False` zurück (`email_service.py` Z. 145).

### Fehlende .env-Variablen

Für **Resend** (empfohlener Primärpfad):
```env
EMAIL_ENABLED=true
EMAIL_FROM=notifications@phyta.org
RESEND_API_KEY=re_xxxxxxxxxxxx
```

Für **SMTP-Fallback** (zusätzlich oder alternativ):
```env
SMTP_ENABLED=true
SMTP_HOST=<relay-host>
SMTP_PORT=587
SMTP_USERNAME=<user>
SMTP_PASSWORD=<pass>
SMTP_USE_TLS=true
```

**Was vor Produktivbetrieb noch fehlt:**
1. `resend`-Package muss in `pyproject.toml` deklariert sein (Code prüft `ImportError` zur Laufzeit, Z. 49)
2. `jinja2`-Package ebenfalls (Z. 71, gleiche Laufzeit-Prüfung)
3. `EMAIL_FROM` muss verifizierte Sender-Domain bei Resend sein
4. **Keine EMAIL_*-Variablen** in `.env.example` dokumentiert — aktiver Wissens-Gap

---

## 4. email_log-Schema

**Datei:** `El Servador/god_kaiser_server/src/db/models/email_log.py`

| Spalte | Typ | Constraints | Bedeutung |
|--------|-----|-------------|-----------|
| `id` | `UUID` | PK, default `uuid4` | Eindeutige Log-ID |
| `notification_id` | `UUID` | FK `notifications.id ON DELETE SET NULL`, nullable, indexed | Verlinkung zur Notification |
| `to_address` | `String(255)` | NOT NULL | Empfänger-Adresse |
| `subject` | `String(500)` | NOT NULL | E-Mail-Betreff |
| `template` | `String(100)` | nullable | Template-Name: `alert_critical`, `alert_digest`, `test` |
| `provider` | `String(50)` | NOT NULL | `resend` oder `smtp` |
| `status` | `String(50)` | NOT NULL, default `'pending'` | `pending`, `sent`, `failed`, `permanently_failed` |
| `sent_at` | `DateTime(timezone=True)` | nullable | Zeitpunkt erfolgreicher Zustellung |
| `error_message` | `Text` | nullable | Fehlerdetails bei `failed` |
| `retry_count` | `Integer` | default `0` | Anzahl bisheriger Retry-Versuche |
| `created_at` | `DateTime(timezone=True)` | NOT NULL (TimestampMixin) | Erstellungszeit |
| `updated_at` | `DateTime(timezone=True)` | NOT NULL (TimestampMixin) | Letzte Änderung |

**Indizes** (Alembic-Migration `add_email_log_table.py`):
- `ix_email_log_notification_id`
- `ix_email_log_status_created` (status, created_at DESC)
- `ix_email_log_created_at` (created_at DESC)

**Test-Einträge:** NICHT GEFUNDEN — kein Seed-Script.  
**Retention-Policy:** NICHT IMPLEMENTIERT — Tabelle wächst unbegrenzt (Loki hat 7d via `loki-config.yml:28`, DB-Tabelle hat keinen Cleanup-Job).

---

## 5. Debug-Stand

### Tests

**Unit-Tests** (`tests/unit/test_email_service.py`): 8 Tests, alle implementiert:
- T1: Resend success
- T2: Resend fail → SMTP fallback
- T3: Both fail → False (kein Exception)
- T4–T6: `send_critical_alert`, `send_digest`, `send_test_email` Template-Name
- T7: Singleton-Verhalten
- T8: Jinja2-Template-Loading

**Unit-Tests** (`tests/unit/test_email_retry_service.py`): 7 Tests — alle implementiert inkl. `permanently_failed` nach 3 Versuchen, Digest-Skip, Singleton.

**Integrations-Tests** (`tests/integration/test_email_log_repo.py`): 4 Tests — `get_pending_retries`, `min_age_minutes`, Limit, Ordering.

**Bekannte Bugs:** NICHT GEFUNDEN. Kein FIXME/TODO zu Mail-Spezifischem.

**Lücken:** Kein Integrations-Test für tatsächliche SMTP/Resend-Verbindung. Kein E2E-Test für `test-email`-Endpoint.

---

## 6. Stabilitäts-Gap-Tabelle

| Kriterium | IST | GAP |
|-----------|-----|-----|
| **idle-stable (48h ohne Crash)** | `EMAIL_ENABLED=false` (Default) — Service läuft nie wirklich. Kein 48h-Lauf verifiziert. | Muss nach Aktivierung durchlaufen werden |
| **Reconnect (SMTP-Verbindungsabbruch)** | `smtplib.SMTP` wird per `with`-Statement pro Send geöffnet/geschlossen (Z. 227). Kein Connection-Pool. Bei Timeout: `except Exception` → `False`. Retry erfolgt durch `EmailRetryService` auf DB-Ebene (5min Delay). | Kein Reconnect in `_send_via_smtp()` selbst — nur DB-Ebenen-Retry |
| **TLS (STARTTLS / TLS 1.2+)** | `cfg.smtp_use_tls` Default `True`. `server.starttls()` aufgerufen wenn Flag gesetzt (Z. 229). Kein `ssl_context` mit explizitem `TLSv1.2`-Minimum — Python System-Default. Für Resend: HTTPS-API, TLS erzwungen. | Kein expliziter TLS-Versions-Pin für SMTP |
| **DKIM/SPF** | Kein eigener Mailserver → keine DKIM-Schlüssel im Repo. Resend: DKIM/SPF über DNS-Einträge konfigurierbar. SMTP-Relay: abhängig vom Host. | Muss bei Sender-Domain-Setup in DNS konfiguriert werden (extern) |
| **Bounce-Handling in email_log** | `email_log` hat kein `bounce_type`-Feld. `status="failed"` nur bei Send-Fehler, nicht bei asynchronem Bounce nach Zustellung. | Kein Resend-Webhook-Handler für `email.bounced` vorhanden |
| **Queue-Persistenz (kein Verlust bei Restart)** | `email_log` mit `status="failed"` übersteht Neustart in PostgreSQL. `EmailRetryService` holt beim nächsten Lauf alle offenen Einträge. | Mails in `asyncio.to_thread()` beim Restart können als `pending` stehenbleiben (kein Status-Update) |
| **Loki-Integration der Mail-Logs** | `email_service.py` nutzt `get_logger(__name__)` → Logs in `god_kaiser.log` und stdout → Alloy. Mail-Delivery-Metriken gehen in Prometheus (`increment_email_sent`, `increment_email_error`, `observe_email_latency`). | Kein dediziertes Loki-Label `component=email`. Kein separater Mail-Loki-Stream. |
| **test-email-Endpoint funktional** | `POST /v1/notifications/test-email` existiert (`notifications.py` Z. 581). Wirft `EmailProviderUnavailableException` wenn `EMAIL_ENABLED=false`. | Funktional sobald `.env` gesetzt — derzeit durch Default-Off geblockt |

---

## 7. Identitäts-Optionen

**Aktueller Default:** `noreply@god-kaiser.local` (`config.py` Z. 282) — nicht-routbare lokale Domain, nicht produktionstauglich.

| Option | Beschreibung | Aufwand |
|--------|-------------|---------|
| **A — Resend mit `*@phyta.org`** | DNS-Einträge für `phyta.org` (SPF, DKIM via Resend-Dashboard). `EMAIL_FROM=notifications@phyta.org`, `RESEND_API_KEY=<key>`. Freies Tier: 3.000 Mails/Monat. | Niedrig (DNS + .env) |
| **B — Gmail-Relay** | `SMTP_HOST=smtp.gmail.com:587`. Erfordert Gmail App-Passwort (2FA-Pflicht). Sender-Domain wäre `@gmail.com`. | Niedrig (nur .env) — Sender nicht `@phyta.org` |
| **C — Bestehendes `@phyta.org`-Mailserver** | Falls `phyta.org` bereits MX-Server betreibt → SMTP-Relay direkt nutzen. Erlaubt `robin@phyta.org` als `EMAIL_FROM`. | Variabel (abhängig vom Host) |

**Empfehlung:** Option A (Resend) für DailyAnalysisJob — keine eigene Infrastruktur, DKIM/SPF out-of-box, stabile API.

---

## 8. Empfohlener Stabilisierungs-Pfad

### Critical (Blocker vor erstem Mail-Versand)

| Gap | Maßnahme | Datei |
|-----|----------|-------|
| Keine .env.example-Einträge | `EMAIL_ENABLED`, `EMAIL_FROM`, `RESEND_API_KEY`, `SMTP_*` in `.env.example` dokumentieren | `.env.example` |
| `email_from` Default nicht produktionstauglich | Default auf Platzhalter setzen ODER Startup-Validation mit Warning wenn Default aktiv | `src/core/config.py:281-285` |
| `resend` + `jinja2` nicht in pyproject.toml | Dependencies deklarieren — sonst `ImportError` erst zur Laufzeit | `El Servador/god_kaiser_server/pyproject.toml` |

### High (vor 48h-Stabilisierungstest)

| Gap | Maßnahme | Datei |
|-----|----------|-------|
| `pending`-Status bei Server-Restart verloren | Startup-Recovery: beim App-Start alle `email_log` mit `status="pending"` → `status="failed"` setzen | `src/main.py` Lifespan-Handler |
| Bounce-Handling fehlt | Resend bietet Webhook für `email.bounced`. `POST /v1/webhooks/resend` → `email_log.status="bounced"` | `src/api/v1/webhooks.py` |
| Keine Retention-Policy | Cleanup-Job: `DELETE FROM email_log WHERE created_at < now() - interval '90 days'` | `src/services/maintenance/jobs/cleanup.py` |

### Medium

| Gap | Maßnahme |
|-----|----------|
| TLS ohne explizites Minimum | `ssl.create_default_context()` in `_send_via_smtp()` — erzwingt TLS 1.2+ |
| Keine strukturierten Loki-Labels | Logger-Context `component=email_service` in `_send_via_resend` und `_send_via_smtp` |
| Digest-Retry-Gap | Digest-Retries werden in `EmailRetryService._retry_single()` Z. 158 übersprungen — `template_context` JSONB-Spalte in `email_log` würde Retry ermöglichen |

### Low

| Gap | Maßnahme |
|-----|----------|
| Kein E2E-Test für test-email-Endpoint | Integrations-Test mit echtem Mock-SMTP (z.B. `aiosmtpd`) |
| `.env.example` ohne Mail-Sektion | Sektion `# Email Notifications (Phase 4A.1)` mit allen Feldern und Kommentaren |

---

## Zusammenfassung

Der Mail-Stack ist **vollständig implementiert** (EmailService, EmailRetryService, DigestService, NotificationRouter-Integration, email_log-Tabelle, Alembic-Migration, 19 Tests).

Er ist durch `EMAIL_ENABLED=False` (Default in `config.py` Z. 275) **absichtlich deaktiviert**.

Die drei kritischen Blocker vor Aktivierung:
1. `.env.example`-Dokumentation fehlt
2. `resend`/`jinja2` nicht in `pyproject.toml` deklariert
3. `email_from` Default `noreply@god-kaiser.local` nicht produktionstauglich

**Empfohlener Aktivierungs-Pfad:** Resend als Primärprovider mit `notifications@phyta.org` (DNS-Konfiguration bei Resend vorausgesetzt). Go-Signal für AUT-194 Mail-Versand: nach Critical-Fixes + 48h-Stabilisierungstest.

---

## Relevante Dateipfade

```
El Servador/god_kaiser_server/src/services/email_service.py
El Servador/god_kaiser_server/src/services/email_retry_service.py
El Servador/god_kaiser_server/src/services/notification_router.py
El Servador/god_kaiser_server/src/services/logic/actions/notification_executor.py
El Servador/god_kaiser_server/src/db/models/email_log.py
El Servador/god_kaiser_server/src/db/repositories/email_log_repo.py
El Servador/god_kaiser_server/src/core/config.py  (Z. 254-302, NotificationSettings)
El Servador/god_kaiser_server/src/api/v1/notifications.py  (Z. 577-634, test-email)
El Servador/god_kaiser_server/alembic/versions/add_email_log_table.py
El Servador/god_kaiser_server/templates/email/  (3 Templates)
.env.example  (EMAIL_*-Variablen fehlen)
```
