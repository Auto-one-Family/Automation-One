# Auftrag an den Agent (Auto-one Repo): V1.2 Email-Retry vollständig implementieren

**An:** Agent im Auto-one-Repository (server-dev / Backend)  
**Von:** Robin (Weiterleitung aus Life-Repo)  
**Kontext:** Verifikations-Roadmap V1 — Email-System. V1.1 (Email-Status-Tracking, EmailLog, API, Frontend) ist verifiziert und abgeschlossen. Es fehlt ausschließlich **V1.2: automatische Wiederholung fehlgeschlagener E-Mails**.  
**Priorität:** Mittel (vor Hardware-Test 2 sinnvoll, nicht kritisch)  
**Datum:** 2026-03-05

---

## Ziel

Fehlgeschlagene E-Mail-Versände (`email_log.status = 'failed'`, `retry_count < 3`) sollen automatisch in festen Abständen erneut versucht werden. Nach maximal drei Versuchen wird der Eintrag auf `permanently_failed` gesetzt. So gehen Critical-Alerts und wichtige Benachrichtigungen bei temporären SMTP-/Resend-Ausfällen nicht verloren, ohne dass Nutzer manuell eingreifen müssen.

**Fachlicher Hintergrund (ohne externe Referenzen):** In Systemen mit Alerting und IoT-Backend ist E-Mail ein asynchroner Kanal: Provider (Resend, SMTP) können kurzzeitig nicht erreichbar sein. Ein Retry mit Verzögerung (Backoff) entlastet den Provider und erhöht die Zustellwahrscheinlichkeit. Drei Versuche sind üblich; danach gilt der Versand als dauerhaft fehlgeschlagen und kann z.B. im Admin-Bereich sichtbar bleiben oder in Monitoring fließen.

---

## Ist-Zustand im Repo (aus Verifikation)

- **EmailLog:** Tabelle `email_log` mit u.a. `status`, `retry_count`, `notification_id`, `to_address`, `subject`, `template`, `provider`, `error_message`. Kein gespeicherter HTML-Body, kein `template_context`.
- **EmailService:** `send_email()`, `send_critical_alert()`, `send_digest()`, `send_test_email()` — alle geben Erfolg/Fehler zurück. Kein eigener Retry.
- **EmailLogRepository:** `log_send()`, `get_filtered()`, `get_stats()`, `get_for_notification()`. Es gibt **keine** Methode „lade alle zur Wiederholung vorgesehenen Einträge“.
- **Scheduler:** `CentralScheduler` in `El Servador/god_kaiser_server/src/core/scheduler.py`; Jobs werden in `El Servador/god_kaiser_server/src/main.py` registriert. Digest-Job z.B. um Z.363–380 (`maintenance_digest_emails`); Kategorie `JobCategory.MAINTENANCE`, Intervall z.B. 300 s.
- **Aufrufer von log_send:** NotificationRouter (Critical-Alert, mit `notification_id`), DigestService (Digest, ohne `notification_id`), Test-Email-Endpoint (Test, ohne `notification_id`).

Einschränkung: Ohne gespeicherten Body oder Template-Context kann ein Retry den Inhalt nur neu erzeugen, wenn genug Daten in der DB liegen (z.B. Notification zu `notification_id` für Critical-Alerts).

---

## Anforderungen (vollständig)

1. **Retry nur für Einträge mit `status = 'failed'` und `retry_count < 3`.**
2. **Nach jedem erneuten Versuch:** `retry_count` um 1 erhöhen; bei Erfolg `status = 'sent'`, `sent_at` setzen; bei erneutem Fehler `status = 'failed'` (oder nach dem dritten Fehlversuch `status = 'permanently_failed'`).
3. **Zeitlicher Abstand:** Mindestens 5 Minuten zwischen zwei Versuchen für denselben Eintrag (einfach: Job läuft z.B. alle 5 Minuten und bearbeitet alle zur Retry-Liste gehörenden Einträge; optional: „nächster Retry erst nach X Minuten“ pro Eintrag, siehe unten).
4. **Kein doppelter Versand:** Pro `email_log`-Zeile nur maximal drei Versandversuche insgesamt (inkl. Erstversuch). Nach dem dritten Fehlversuch: `permanently_failed`, kein weiterer Retry.
5. **Konsistenz mit bestehendem Code:** Nutzung von `EmailService` und `EmailLogRepository`; gleiche Session/Transaktion für „Versand + Log-Update“ wo sinnvoll; Scheduler-Pattern wie bei `maintenance_digest_emails`.

---

## Technische Vorgaben

### 1) Welche E-Mails werden erneut versucht?

- **Critical-Alert (template z.B. `critical_alert`):** Immer retrybar, weil `notification_id` gesetzt ist. Notification aus DB laden, daraus Titel/Body/Context für `send_critical_alert()` oder das vorhandene Template rekonstruieren, erneut aufrufen.
- **Digest (template z.B. `digest`):** Bündelt mehrere Notifications; es gibt keine einzelne Notification. Ohne gespeicherten Context (z.B. Zeitraum, Liste der Alert-IDs) ist ein exakter Neuaufbau aufwendig. **Entscheidung:** Entweder Digest-Retry weglassen (nur Critical + ggf. Test) oder erst nach Schema-Erweiterung (siehe Punkt 2).
- **Test-Email (template z.B. `test_email`):** Kontext minimal („Test“). Retry ist möglich, indem `send_test_email(to_address)` erneut aufgerufen wird; `to_address` steht in `email_log`.

**Empfehlung für die erste Umsetzung:** Retry nur für Einträge, die ein `notification_id` haben (Critical-Alerts), und für Einträge mit `template = 'test_email'` (oder dem konkreten Wert, den der Test-Endpoint in `log_send` übergibt). Digest vorerst nicht retryen; optional später, wenn `template_context` (JSONB) in `email_log` ergänzt wird.

### 2) Schema-Erweiterung (optional)

Falls Digest-Retry gewünscht ist, kann `email_log` um eine optionale Spalte `template_context` (JSONB) erweitert werden. Alle Aufrufer von `log_send()` müssten dann beim ersten Versand einen serialisierbaren Context (z.B. Dict mit Zeitraum, Alert-IDs, Betreff-Bausteinen) übergeben; der Retry-Service liest `template` + `template_context` und ruft die passende EmailService-Methode mit diesem Context auf. **Dieser Auftrag verlangt die Erweiterung nicht zwingend;** Du kannst Dich auf Critical + Test-Email-Retry beschränken und im Code-Kommentar vermerken, dass Digest-Retry bei Bedarf über `template_context` nachgerüstet werden kann.

### 3) Exponential Backoff (optional, empfohlen)

Statt „alle 5 Minuten alle failed-Einträge erneut versuchen“, kann pro Eintrag ein „nächster Retry-Zeitpunkt“ genutzt werden:
- 1. Retry: 5 Minuten nach `created_at` (oder nach `sent_at` des letzten Versuchs, falls Ihr das speichert).
- 2. Retry: z.B. 15 Minuten nach dem ersten Retry.
- 3. Retry: z.B. 45 Minuten nach dem zweiten Retry.

Dafür müsste entweder `email_log` um `last_retry_at` (oder `next_retry_at`) ergänzt werden, oder Du leitest „nächster Retry“ aus `created_at` und `retry_count` ab (z.B. created_at + (5 + 15 + 45) * 60 Sekunden je nach retry_count). Wenn Du keine Migration machen willst: Einfacher Job alle 5 Minuten, der alle `failed` mit `retry_count < 3` bearbeitet; dann kann derselbe Eintrag mehrfach in kurzer Folge versucht werden, was in der Praxis oft tolerabel ist.

### 4) Keine doppelten E-Mails an Nutzer

Vor dem erneuten Aufruf von EmailService prüfen: Nur Einträge mit `status = 'failed'` und `retry_count < 3` laden; nach dem Versuch sofort `retry_count` erhöhen und `status` (und ggf. `sent_at`, `error_message`) aktualisieren. So wird jede Zeile maximal dreimal versendet (einmal initial, bis zu zwei Retries) bzw. bei „max 3 Versuche gesamt“: einmal initial + bis zu zwei Retries. Definition: „3 Versuche“ = initial + 2 Retries, danach `permanently_failed`.

---

## Konkrete Implementierungsschritte

### Schritt 1: EmailLogRepository erweitern

**Datei:** `El Servador/god_kaiser_server/src/db/repositories/email_log_repo.py`

- Neue Methode, z.B. `get_pending_retries(limit: int = 50) -> list[EmailLog]`:
  - Filter: `status == 'failed'`, `retry_count < 3`.
  - Optional: Nur Einträge, deren `created_at` (oder ein zukünftiges Feld `next_retry_at`) mindestens 5 Minuten zurückliegt.
  - Sortierung: `created_at` aufsteigend (älteste zuerst).
  - Limit, um einen einzelnen Job-Lauf zu begrenzen.
- Keine Änderung an `log_send()` nötig, solange Du kein `template_context` einführst.

### Schritt 2: EmailRetryService anlegen

**Neue Datei:** `El Servador/god_kaiser_server/src/services/email_retry_service.py`

- Abhängigkeiten: EmailService, EmailLogRepository, DB-Session (oder Session-Factory pro Aufruf). Gleiches Muster wie DigestService (Session von außen oder Request-Scope).
- Eine öffentliche Methode, z.B. `process_retries() -> int` (Anzahl behandelter Einträge):
  1. `pending = email_log_repo.get_pending_retries(limit=50)`.
  2. Für jeden Eintrag:
     - **Falls `notification_id` gesetzt:** Notification aus DB laden (Repository/Service für Notifications nutzen). Aus Notification + Template-Namen (aus `email_log.template`) die Parameter für `email_service.send_critical_alert()` o.ä. bauen und `send_critical_alert()` aufrufen. Ergebnis: success (bool).
     - **Falls `template` == Test-Email-Template und `to_address` gesetzt:** `email_service.send_test_email(to_address)` aufrufen.
     - **Falls Digest (oder anderer Typ ohne Rekonstruktion):** Eintrag überspringen oder (wenn Du `template_context` eingebaut hast) Context aus JSONB lesen und entsprechende Send-Methode aufrufen.
  3. Nach dem Versuch:
     - `retry_count += 1`.
     - Bei Erfolg: `status = 'sent'`, `sent_at = now()`, `error_message = None`.
     - Bei Fehler und `retry_count >= 3`: `status = 'permanently_failed'`, `error_message` mit aktuellem Fehler setzen.
     - Bei Fehler und `retry_count < 3`: `status` weiter `'failed'`, `error_message` aktualisieren.
  4. Änderungen an der `email_log`-Zeile committen (in derselben Transaktion wie der Versand, oder getrennt – je nachdem wie Ihr Sessions handhabt; wichtig: keine doppelten Sends).
- Fehlerbehandlung: Ein Fehler bei einem Eintrag (z.B. Notification gelöscht) soll den Rest der Liste nicht abbrechen; pro Eintrag try/except, Log schreiben, nächster Eintrag.
- Keine neuen Prometheus-Metriken zwingend; optional: Counter „email_retry_attempted_total“, „email_retry_success_total“, „email_retry_permanently_failed_total“.

### Schritt 3: Scheduler-Job registrieren

**Datei:** `El Servador/god_kaiser_server/src/main.py`

- **Einfügepunkt:** Nach dem bestehenden Digest-Job (z.B. nach Zeile 380, vor Alert Suppression), damit die Reihenfolge klar ist.
- **Muster:** Wie `maintenance_digest_emails` – z.B. `scheduler.add_interval_job(...)` mit 300 Sekunden (5 Minuten), Job-ID z.B. `maintenance_email_retry`, Kategorie `JobCategory.MAINTENANCE`.
- **Job-Funktion:** Ruft `EmailRetryService(dependencies).process_retries()` auf. Dependency-Injection so wie bei Digest (Session aus App-State oder Request-Scope); wenn Ihr keinen Request-Kontext habt, eine eigene Session pro Lauf erstellen und schließen.
- Sicherstellen, dass der Job nur einmal pro Prozess läuft (kein paralleler Doppelstart); das ist bei Euch vermutlich durch das bestehende Scheduler-Pattern schon gegeben.

### Schritt 4: Dependency-Injection / main.py

- EmailRetryService muss mit EmailService, EmailLogRepository und ggf. Notification-Repository/Service instanziiert werden. Prüfen, wo EmailService und EmailLogRepository aktuell erzeugt oder injiziert werden (z.B. in `main.py` oder einem Service-Container); dieselbe Stelle für EmailRetryService nutzen und dem Scheduler die gleiche Instanz (oder Factory) übergeben.

### Schritt 5: Tests (empfohlen)

- Unit-Test für `get_pending_retries`: Einige `email_log`-Zeilen mit `status='failed'`, `retry_count` 0, 1, 2 anlegen; abfragen; prüfen, dass nur die mit `retry_count < 3` und ggf. alter `created_at` zurückkommen.
- Unit-Test für EmailRetryService: Mit gemocktem EmailService und DB (z.B. in-memory oder Test-DB): Ein Eintrag `failed`, `retry_count=0`, `notification_id` gesetzt; Notification anlegen; `process_retries()` aufrufen; prüfen, dass `retry_count=1`, `status=sent` oder `failed` und ggf. `sent_at` gesetzt sind.
- Optional: Integrationstest, der einen fehlgeschlagenen Eintrag anlegt und den Scheduler-Job einmal ausführt (oder `process_retries()` direkt aufruft) und das DB-Ergebnis prüft.

---

## Akzeptanzkriterien

- [ ] `EmailLogRepository.get_pending_retries(limit=50)` existiert und liefert nur Einträge mit `status='failed'` und `retry_count < 3`.
- [ ] `EmailRetryService.process_retries()` verarbeitet Critical-Alerts (mit `notification_id`) und Test-Emails (anhand `template`/`to_address`); nach Versand werden `retry_count` und `status` (sowie ggf. `sent_at`, `error_message`) korrekt aktualisiert.
- [ ] Nach dem dritten Fehlversuch wird `status = 'permanently_failed'` gesetzt und kein weiterer Retry mehr durchgeführt.
- [ ] In `main.py` ist ein periodischer Job (z.B. alle 5 Minuten) für `maintenance_email_retry` registriert und ruft den Retry-Service auf.
- [ ] Keine Änderung an bestehenden Aufrufen von `log_send()` oder am Verhalten von EmailService/NotificationRouter/DigestService/Test-Email-Endpoint, außer Du führst optional `template_context` ein.
- [ ] Optional: Mindestens ein Unit-Test für Repository und einen für EmailRetryService; kein Regression bei bestehenden Tests.

---

## Dateien-Übersicht

| Aktion | Pfad |
|--------|------|
| Neu | `El Servador/god_kaiser_server/src/services/email_retry_service.py` |
| Erweitern | `El Servador/god_kaiser_server/src/db/repositories/email_log_repo.py` (get_pending_retries) |
| Erweitern | `El Servador/god_kaiser_server/src/main.py` (Job-Registrierung, DI für EmailRetryService) |
| Optional | Migration für `email_log.next_retry_at` oder `template_context` (nur wenn Du Backoff oder Digest-Retry umsetzt) |
| Optional | Unit-/Integrationstests unter `tests/` für Repo und Service |

---

## Kurzfassung für den Agent

Du implementierst die **automatische Wiederholung fehlgeschlagener E-Mails (V1.2)**:

1. Im **EmailLogRepository** eine Methode `get_pending_retries(limit)` hinzufügen, die Einträge mit `status='failed'` und `retry_count < 3` zurückgibt.
2. Einen **EmailRetryService** anlegen, der diese Einträge lädt, für Critical-Alerts die Notification lädt und `send_critical_alert()` erneut aufruft, für Test-Emails `send_test_email(to_address)` aufruft, und danach `retry_count` sowie `status` (sent / failed / permanently_failed) in `email_log` aktualisiert.
3. In **main.py** einen Scheduler-Job (z.B. alle 5 Minuten, nach dem Digest-Job) registrieren, der `EmailRetryService.process_retries()` aufruft.
4. Dependency-Injection für den neuen Service so einbinden, dass er EmailService und EmailLogRepository sowie ggf. den Notification-Zugriff erhält.

Digest-Retry und optionales Exponential Backoff (oder `template_context`/`next_retry_at`) sind explizit optional; der Auftrag ist mit Critical + Test-Email-Retry erfüllt.
