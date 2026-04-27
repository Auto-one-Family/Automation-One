# AUT-192 / AUT-193 / AUT-194 — Analyse-Sammlung

**Datum:** 2026-04-26  
**Projekt:** Claude API Integration in AutomationOne (Phase 1–3)  
**Etappe:** 2 (Analysen) + Etappe-3-Vorbereitung (Design-Doc)

---

## Enthaltene Berichte

| Datei | Linear-Issue | Thema | Status |
|-------|-------------|-------|--------|
| [mail-server-iststand-2026-04-26.md](../../../docs/analysen/mail-server-iststand-2026-04-26.md) | AUT-192 | Mail-Server IST-Stand + email_service.py Audit | Fertig |
| [error-system-handshakes-correlation-stack-inventur-2026-04-26.md](../../../docs/analysen/error-system-handshakes-correlation-stack-inventur-2026-04-26.md) | AUT-193 | Error-System / Handshakes / Correlation-IDs / Stack-Inventur | Fertig |
| [daily-analysis-job-design-2026-04-26.md](../../../docs/analysen/daily-analysis-job-design-2026-04-26.md) | AUT-194 | DailyAnalysisJob Design-Doc | Fertig — wartet auf Implementierungs-Freigabe |

---

## Kernaussagen (Zusammenfassung für automation-experten)

### AUT-192 — Mail-Server

- **Mail-Stack vollständig implementiert** (`email_service.py`, `email_retry_service.py`, `email_log`, 19 Tests)
- **Deaktiviert durch Default:** `EMAIL_ENABLED=False` in `config.py:275`
- **3 Critical-Blocker vor Aktivierung:**
  1. EMAIL_*-Variablen fehlen in `.env.example`
  2. `resend` + `jinja2` nicht in `pyproject.toml`
  3. `EMAIL_FROM` Default `noreply@god-kaiser.local` nicht produktionstauglich
- **Empfohlener Weg:** Resend als Primärprovider + `notifications@phyta.org` nach DNS-Setup
- **Go-Signal für AUT-194 Mail-Pfad:** Nach Critical-Fixes + 48h-Stabilitätstest

### AUT-193 — Error-System

- **9 False-Error-Patterns** definiert und im System-Prompt-Format formuliert
- **`SystemAnalysisRequest`-Pydantic-Schema** fertig (Sektion 6) — direkt für `ai_service.analyze_daily_snapshot()` nutzbar
- **C6-Regel belegt:** `correlation_id` (MQTT-Format) und `request_id` (UUID) dürfen nicht blind gejoined werden (`request_context.py:7-10`)
- **7 Stack-Blind-Spots** katalogisiert: 3x High (CentralScheduler OBS-01, Frontend-Error-Sink, Server-LWT), 3x Medium, 1x Low
- **Kritischer Kettenverlust:** `asyncio.create_task()` ohne ContextVar-Copy verliert correlation_id bei AI-Enrichment-Tasks

### AUT-194 — DailyAnalysisJob (Design-Doc)

- **7 Implementierungs-Schritte** in korrekter Reihenfolge (Schema → Snapshot-Service → Anti-Storm → Reporter → Job → Mail → Health-Endpoint)
- **8 Akzeptanzkriterien** mit verifizierbaren Prüfmethoden
- **8 Verify-Gates** (DA-SCHEMA-01..DA-FORMAT-01)
- **Feature-Flag `EMAIL_DAILY_REPORT_ENABLED`** muss neu in `NotificationSettings` ergänzt werden
- **Pre-Requisite:** CentralScheduler Health-Endpoint (OBS-01/BS-02) — kann als Sub-Issue AUT-194.1 ausgekoppelt werden

---

## Nächste Schritte (Etappe 3 → Etappe 4)

1. **Etappe 3:** Robin reicht beide Berichte (AUT-192 + AUT-193) an automation-experten weiter
2. **Etappe 4:** automation-experte schärft Akzeptanzkriterien in AUT-194 nach, TM startet Implementierung

**Bereit für Etappe 3:** ✓ Beide Berichte vollständig, Design-Doc verfasst
