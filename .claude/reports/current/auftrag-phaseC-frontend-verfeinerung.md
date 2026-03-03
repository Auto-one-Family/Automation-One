# Auftrag: PHASE C — Frontend-Verfeinerung (V4.1 + V6.1 + V1.1)

> **Erstellt:** 2026-03-03
> **Erstellt von:** Automation-Experte (Life-Repo), basierend auf Roadmap + Phase A Analyse
> **Ziel-Repo:** `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
> **Vorgaenger:** Phase B (Scheduler-Verdrahtung abgeschlossen)
> **Aufwand:** ~6-7h gesamt
> **Agent:** frontend-dev (V4.1, V6.1) + server-dev (V1.1 Backend) + frontend-dev (V1.1 Frontend)
> **Prioritaet:** MITTEL — Verbesserungen fuer HW-Test 2, aber nicht blockierend
> **Parallelisierbar:** Alle 3 Bloecke sind voneinander unabhaengig

---

## Uebersicht Phase C

| Block | Was | Aufwand | Agent | Typ |
|-------|-----|---------|-------|-----|
| V4.1 | Timed Snooze statt Permanent-Mute | ~2h | frontend-dev | Rein Frontend |
| V6.1 | QAB-Actions erweitern (Diagnose, Report) | ~1h | frontend-dev | Rein Frontend |
| V1.1 | Email-Status-Tracking (EmailLog) | ~3-4h | server-dev + frontend-dev | Backend + Frontend |

---

## V4.1 — Timed Snooze statt Permanent-Mute

### Was fehlt

`QuickAlertPanel.vue` hat einen Mute-Button der `alerts_enabled=false` setzt — das ist ein PERMANENTER Mute ohne Ablaufdatum. Das Backend hat bereits `suppression_until` (ISO-Datetime) mit automatischem Re-Enable via `AlertSuppressionScheduler` (prueft alle 5 Min). Die Luecke ist rein im Frontend: Statt permanent Mute soll ein Dropdown mit Zeitpresets angeboten werden.

### Ist-Zustand (aus Phase A Analyse V7.1)

**Backend (EXISTIERT, funktional):**
- `alert_suppression_service.py`: `suppression_until` wird korrekt ausgewertet
- `alert_suppression_scheduler.py`: Prueft alle 5 Min ob Suppression abgelaufen → re-enabled automatisch
- `sensor.alert_config` JSON: Enthaelt `alerts_enabled`, `suppression_until`, `severity_override`
- API: `PATCH /v1/sensors/{id}/alert-config` akzeptiert `suppression_until` als ISO-Datetime

**Frontend (LUECKE):**
- `QuickAlertPanel.vue`: Mute-Button setzt nur `alerts_enabled: false` ohne `suppression_until`
- Kein Snooze-Dropdown, kein Timer-Display

### Implementierung

#### Schritt 1: QuickAlertPanel.vue — Mute-Dropdown (~1.5h)

**Datei:** `El Frontend/src/components/quick-action/QuickAlertPanel.vue`

**Aenderung:** Den bestehenden Mute-Button durch ein Dropdown mit Presets ersetzen.

**Pruefen ZUERST:**
- [ ] Wo genau ist der Mute-Button? (Suche nach `alerts_enabled`, `mute`, `suppress` im Template)
- [ ] Welche API-Funktion wird aufgerufen? (Suche nach `updateAlertConfig` oder aehnlich)
- [ ] Gibt es bereits ein Dropdown-/Select-Primitive? → `El Frontend/src/shared/design/primitives/BaseSelect.vue` [verify-plan: Datei heisst BaseSelect.vue, nicht Select.vue]
- [ ] Welches Icon-Set wird genutzt? → lucide-vue-next (bestaetigt, z.B. BellOff, AlertTriangle bereits importiert)

**Neues Dropdown:**

```vue
<!-- Statt einzelnem Mute-Button: -->
<SnoozeDropdown
  :sensor-id="alert.sensor_id"
  :current-suppression="alert.suppression_until"
  @snooze="handleSnooze"
/>
```

**Snooze-Presets:**

| Label | Berechnung | API-Payload |
|-------|-----------|-------------|
| 1 Stunde | `Date.now() + 3_600_000` | `{ suppression_until: "2026-03-03T15:00:00Z" }` |
| 4 Stunden | `Date.now() + 14_400_000` | `{ suppression_until: "2026-03-03T18:00:00Z" }` |
| 24 Stunden | `Date.now() + 86_400_000` | `{ suppression_until: "2026-03-04T14:00:00Z" }` |
| 1 Woche | `Date.now() + 604_800_000` | `{ suppression_until: "2026-03-10T14:00:00Z" }` |
| Permanent | — | `{ alerts_enabled: false }` (wie bisher) |

**Handler-Logik:**

[verify-plan: WICHTIG — Der bestehende handleMute() (Zeile 151-174) nutzt `sensorsApi.updateAlertConfig()` und sendet AUCH `suppression_reason` + `suppression_note`. Der Snooze-Handler muss dasselbe Pattern folgen. Ausserdem: `sensorId` kommt aus `notification.metadata.sensor_config_id`, NICHT direkt aus dem Alert-Objekt.]

```typescript
async function handleSnooze(notification: NotificationDTO, preset: string) {
  const meta = notification.metadata || {}
  const sensorId = meta.sensor_config_id as string | undefined
  if (!sensorId) {
    error('Sensor-ID nicht verfuegbar')
    return
  }

  if (preset === 'permanent') {
    await sensorsApi.updateAlertConfig(sensorId, {
      alerts_enabled: false,
      suppression_reason: 'custom',
      suppression_note: 'Permanent stummgeschaltet via Quick Alert Panel',
    })
  } else {
    const durations: Record<string, number> = {
      '1h': 3_600_000,
      '4h': 14_400_000,
      '24h': 86_400_000,
      '1w': 604_800_000,
    }
    const until = new Date(Date.now() + durations[preset]).toISOString()
    await sensorsApi.updateAlertConfig(sensorId, {
      alerts_enabled: false,
      suppression_until: until,
      suppression_reason: 'custom',
      suppression_note: `Snooze ${preset} via Quick Alert Panel`,
    })
  }
}
```

**PRUEFEN:**
- [ ] API-Payload: Muss `alerts_enabled: false` UND `suppression_until` zusammen gesetzt werden? Oder reicht `suppression_until` allein? → Backend-Logik in `alert_suppression_service.py` pruefen
- [ ] Re-Enable: Wenn `suppression_until` ablaeuft, setzt der Scheduler `alerts_enabled: true` automatisch? → Aus Phase A Analyse: JA

#### Schritt 2: Snooze-Timer-Anzeige (~30min)

**Datei:** `El Frontend/src/components/quick-action/QuickAlertPanel.vue`

Wenn ein Sensor eine aktive `suppression_until` hat, soll die verbleibende Zeit angezeigt werden.

```vue
<template>
  <!-- Pro Alert-Eintrag: -->
  <div v-if="alert.suppression_until" class="snooze-timer">
    <ClockIcon :size="14" />
    <span>{{ formatTimeRemaining(alert.suppression_until) }}</span>
  </div>
</template>

<script setup>
function formatTimeRemaining(until: string): string {
  const remaining = new Date(until).getTime() - Date.now()
  if (remaining <= 0) return 'Laeuft ab...'

  const hours = Math.floor(remaining / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)

  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
</script>
```

**PRUEFEN:**
- [x] Hat der Alert-Eintrag im Store/DTO Zugriff auf `suppression_until`? → **NEIN!** `NotificationDTO` hat KEIN `suppression_until` Feld. Die `sensor_config_id` kommt aus `notification.metadata`.
- [ ] **LOESUNG:** `alert_config` des Sensors ueber `sensorsApi` laden (z.B. in einer Map sensor_config_id → suppression_until) oder den espStore nutzen, der Device-/Sensor-Daten haelt
- [ ] Timer-Update: `setInterval` mit 60s Update fuer Live-Countdown (mit `onUnmounted` Cleanup!)

[verify-plan: Die Template-Referenz `alert.suppression_until` muss angepasst werden. Die Notification hat keinen direkten Zugriff auf das Sensor alert_config. Option: Beim Laden der Alerts eine Map `sensorConfigId → alertConfig` bauen via sensorsApi, oder ein neues Composable `useSensorAlertConfigs()` erstellen.]

### Verifikation V4.1

| # | Test | Erwartung |
|---|------|-----------|
| 1 | Mute-Button → Dropdown sichtbar | 5 Optionen (1h, 4h, 24h, 1w, Permanent) |
| 2 | "1 Stunde" waehlen | `suppression_until` in ~1h, Timer sichtbar |
| 3 | Timer laeuft ab | Alert wird automatisch re-enabled (Scheduler, max 5 Min Delay) |
| 4 | "Permanent" waehlen | `alerts_enabled: false`, kein Timer |
| 5 | Timer-Anzeige | Verbleibende Zeit wird korrekt formatiert |

---

## V6.1 — QAB-Actions erweitern (Diagnose, Report)

### Was fehlt

Der Quick Action Ball (QAB/FAB) hat dynamische Actions per Route. Es fehlen: "Diagnose starten" (global), "Letzter Report" (global), route-spezifische Plugin-Actions.

### Ist-Zustand (aus Roadmap)

**Global Actions (existierend):**
- `global-alerts` — Alert-Panel oeffnen
- `global-navigation` — Navigation-Panel
- `global-emergency` — Emergency Stop
- `global-search` — Quick-Search (Ctrl+K)

**Context Actions (existierend, per Route):**
- `/hardware` — Live-Monitor, Widget hinzufuegen
- `/monitor` — Dashboards
- `/system-monitor` — Log-Suche, Health-Check
- etc.

### Implementierung

#### Schritt 1: useQuickActions.ts analysieren (~10min)

**Datei:** `El Frontend/src/composables/useQuickActions.ts`

**Pruefen:**
- [x] Wie werden Global Actions registriert? → `buildGlobalActions()` Funktion, Ergebnis via `quickActionStore.setGlobalActions()` gesetzt
- [x] Wie werden Context Actions registriert? → `buildContextActions(view, router, store)` mit Switch auf `ViewContext` Typ, via `quickActionStore.setContextActions()` gesetzt. Watch auf `route.path` triggert Rebuild.
- [x] Action-Interface: `{ id, label, icon, category, handler, badge?, badgeVariant?, shortcutHint? }` — **WICHTIG:** `category: 'global' | 'context'` ist PFLICHT, `icon` muss `markRaw(Component)` sein (KEIN String!)
- [x] Alles in einer Datei `useQuickActions.ts` — kein Registry-Pattern

#### Schritt 2: Neue Global Actions hinzufuegen (~20min)

**Datei:** `El Frontend/src/composables/useQuickActions.ts`

**2 neue Global Actions in `buildGlobalActions()`:**

[verify-plan: Icons muessen als `markRaw(Component)` importiert werden, NICHT als Strings. Ausserdem ist `category: 'global'` Pflichtfeld. Die Stores muessen AUSSERHALB der buildGlobalActions-Funktion aufgerufen werden (innerhalb von useQuickActions composable setup), da Pinia-Stores nur im Setup-Kontext initialisiert werden sollten.]

```typescript
// Neue Imports oben in useQuickActions.ts hinzufuegen:
import { Stethoscope } from 'lucide-vue-next'
import { useDiagnosticsStore } from '@/shared/stores/diagnostics.store'

// In buildGlobalActions() Array hinzufuegen:
{
  id: 'global-diagnose',
  label: 'Diagnose starten',
  icon: markRaw(Stethoscope),
  category: 'global',
  handler: async () => {
    const diagnosticsStore = useDiagnosticsStore()
    await diagnosticsStore.runDiagnostic()
  },
},
{
  id: 'global-last-report',
  label: 'Letzter Report',
  icon: markRaw(FileText),  // FileText ist bereits importiert
  category: 'global',
  handler: () => {
    nav(router, '/system-monitor?tab=reports')
  },
},
```

**PRUEFEN:**
- [x] `useDiagnosticsStore()` Import: `El Frontend/src/shared/stores/diagnostics.store.ts` — existiert
- [x] Hat der Store eine `runDiagnostic()` Action? → JA, gibt `DiagnosticReport | null` zurueck
- [x] Toast-System: `useToast()` Composable existiert in `El Frontend/src/composables/useToast.ts` — wird bereits in QuickAlertPanel verwendet
- [x] Icon-Import: `markRaw(Component)` Pattern (NICHT String) — siehe bestehende Actions in `buildGlobalActions()`
- [x] `?tab=reports` — funktioniert in SystemMonitorView (bestaetigt: Tab-ID 'reports' ist in erlaubter Liste)

#### Schritt 3: Neue Context Actions per Route (~20min)

**Datei:** `El Frontend/src/composables/useQuickActions.ts`

[verify-plan: KRITISCH — Der Switch in buildContextActions() arbeitet auf ViewContext-Typ (z.B. 'system-monitor'), NICHT auf Route-Pfad (z.B. '/system-monitor'). Ausserdem: ViewContext hat KEIN 'plugins'! Muss zuerst hinzugefuegt werden.]

**VORBEDINGUNG fuer /plugins Context Actions:**
1. `ViewContext` Typ in `quickAction.store.ts` erweitern: `| 'plugins'` hinzufuegen
2. `resolveViewContext()` in `useQuickActions.ts` erweitern: `if (path.startsWith('/plugins')) return 'plugins'`

**Route `system-monitor` (bestehenden Case ERWEITERN):**

```typescript
// In buildContextActions(), case 'system-monitor' — Action HINZUFUEGEN zu bestehendem Array:
case 'system-monitor':
  return [
    // BESTEHENDE Actions (Log-Suche, Health-Check) BEIBEHALTEN:
    {
      id: 'sys-log-search',
      label: 'Log-Suche',
      icon: markRaw(Search),
      category: 'context',
      handler: () => nav(router, '/system-monitor?tab=logs'),
    },
    {
      id: 'sys-health-check',
      label: 'Health-Check',
      icon: markRaw(Cpu),
      category: 'context',
      handler: () => nav(router, '/system-monitor?tab=health'),
    },
    // NEU:
    {
      id: 'ctx-full-diagnostic',
      label: 'Volle Diagnose',
      icon: markRaw(Stethoscope),
      category: 'context',
      handler: async () => {
        const diagnosticsStore = useDiagnosticsStore()
        await diagnosticsStore.runDiagnostic()
      },
    },
  ]
```

**Route `plugins` (NEUER Case):**

```typescript
// Neuen Import oben hinzufuegen:
import { HeartPulse } from 'lucide-vue-next'
import { usePluginsStore } from '@/shared/stores/plugins.store'

// Neuer Case in buildContextActions():
case 'plugins':
  return [
    {
      id: 'ctx-healthcheck',
      label: 'HealthCheck ausfuehren',
      icon: markRaw(HeartPulse),
      category: 'context',
      handler: async () => {
        const pluginsStore = usePluginsStore()
        await pluginsStore.executePlugin('health_check')
      },
    },
  ]
```

**PRUEFEN:**
- [x] `usePluginsStore()` Import: `El Frontend/src/shared/stores/plugins.store.ts` — existiert
- [x] Hat der Store eine `executePlugin(id)` Action? → JA, Signatur: `executePlugin(pluginId: string, configOverrides?: Record<string, unknown>)`
- [x] Existieren bereits Context Actions fuer `system-monitor`? → JA: Log-Suche + Health-Check — BEIBEHALTEN!
- [x] Existieren bereits Context Actions fuer `plugins`? → NEIN, ViewContext kennt 'plugins' noch nicht

#### Schritt 4: Feedback-Integration (~10min)

Nach Action-Ausfuehrung soll der User Feedback bekommen. Optionen:
1. Toast-Notification ("Diagnose abgeschlossen: HEALTHY")
2. Automatisch zum Tab navigieren
3. Badge am QAB-Button aktualisieren

**Empfehlung:** Toast + Tab-Navigation bei Klick auf Toast.

### Verifikation V6.1

| # | Test | Erwartung |
|---|------|-----------|
| 1 | QAB oeffnen → Global Actions | "Diagnose starten" und "Letzter Report" sichtbar |
| 2 | "Diagnose starten" klicken | Diagnose laeuft, Toast mit Ergebnis |
| 3 | "Letzter Report" klicken | Navigation zu `/system-monitor?tab=reports` |
| 4 | Route `/system-monitor` → Context Actions | "Volle Diagnose" sichtbar |
| 5 | Route `/plugins` → Context Actions | "HealthCheck ausfuehren" sichtbar |
| 6 | Bestehende Actions | Alle 4 Global + bestehende Context Actions weiterhin funktional |

---

## V1.1 — Email-Status-Tracking (EmailLog)

### Was fehlt

`EmailService.send_email()` sendet Emails, aber es gibt kein Tracking ob die Email erfolgreich war, fehlgeschlagen ist, oder welcher Provider (Resend/SMTP) verwendet wurde. Ein `EmailLog` DB-Model + API + Frontend-Integration wird benoetigt.

### Ist-Zustand (aus Roadmap V1)

**Backend (EXISTIERT):**
- `EmailService` (Resend + SMTP Dual-Provider): `El Servador/god_kaiser_server/src/services/email_service.py` [verify-plan: Pfade korrigiert — Server-Code liegt unter El Servador/god_kaiser_server/]
- `NotificationRouter._route_email()`: ISA-18.2 Severity-basiert
- `DigestService`: Warning-Batching, 60min
- Jinja2-Templates: 3x in `El Servador/god_kaiser_server/templates/email/` (alert_critical.html, alert_digest.html, test.html)
- Test-Email API: `POST /v1/notifications/test-email`

**FEHLT:**
- `EmailLog` DB-Model + Migration
- API-Endpoints fuer Email-Log
- Frontend Email-Status-Anzeige

### Implementierung — Backend (~2h)

#### Schritt 1: EmailLog DB-Model (~20min)

**Neue Datei:** `El Servador/god_kaiser_server/src/db/models/email_log.py`

[verify-plan: KRITISCH — Original-Code nutzte Column()-Style (SQLAlchemy 1.x) und falschen Base-Import. Codebase nutzt Mapped[]+mapped_column() (SQLAlchemy 2.x). Komplett korrigiert nach Pattern von notification.py:]

```python
"""Email sending log for tracking delivery status."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..base import Base, TimestampMixin


class EmailLog(Base, TimestampMixin):
    __tablename__ = "email_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    notification_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notifications.id", ondelete="SET NULL"), nullable=True
    )
    to_address: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    template: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, doc="z.B. alert_critical, alert_digest, test"
    )
    provider: Mapped[str] = mapped_column(
        String(50), nullable=False, doc="resend oder smtp"
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default=text("'pending'"),
        doc="pending, sent, failed, permanently_failed"
    )
    sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
```

**PRUEFEN:**
- [x] `Base` Import: `from ..base import Base, TimestampMixin` (relative Imports, NICHT absolute!)
- [x] `notifications.id` FK: Tabelle "notifications" hat `id` als UUID — bestaetigt
- [ ] Model in `__init__.py` registrieren: JA! In `El Servador/god_kaiser_server/src/db/models/__init__.py` eintragen: `from . import email_log` + `from .email_log import EmailLog`
- [ ] TimestampMixin gibt automatisch `created_at` + `updated_at` — kein manuelles `created_at` noetig

#### Schritt 2: Alembic Migration (~10min)

```bash
alembic revision --autogenerate -m "add_email_log_table"
```

**Pruefen:** Migration enthaelt `create_table('email_log', ...)` mit allen Columns + FK.

#### Schritt 3: EmailService erweitern (~30min)

**Datei:** `El Servador/god_kaiser_server/src/services/email_service.py`

[verify-plan: KRITISCHE KORREKTUREN — 3 Probleme im Original-Plan gefunden:]

**Problem 1: EmailService hat KEINE DB-Session.**
`EmailService.__init__()` nimmt nur `get_settings()`. Kein `self.session`. Die Klasse ist bewusst session-frei designed ("never raises, returns False on failure").

**Problem 2: send_email() Signatur stimmt nicht.**
- Plan: `send_email(to, subject, html, notification_id=None, template=None)`
- IST: `send_email(to, subject, html_body=None, text_body=None, template_name=None, template_context=None)`
- Kein `notification_id` Parameter.

**Problem 3: "All methods are non-blocking and return bool (never raise)"** — DB-Writes in send_email() wuerden dieses Design-Prinzip brechen.

**KORRIGIERTE Strategie (2 Optionen):**

**Option A (empfohlen): Separater EmailLogRepository + Logging im Aufrufer**

Neues Repository: `El Servador/god_kaiser_server/src/db/repositories/email_log_repo.py`

```python
class EmailLogRepository:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def log_send(
        self,
        to_address: str,
        subject: str,
        provider: str,
        status: str,
        notification_id: uuid.UUID | None = None,
        template: str | None = None,
        error_message: str | None = None,
    ) -> EmailLog:
        log = EmailLog(
            to_address=to_address,
            subject=subject,
            provider=provider,
            status=status,
            notification_id=notification_id,
            template=template,
            error_message=error_message,
            sent_at=datetime.now(timezone.utc) if status == "sent" else None,
        )
        self._session.add(log)
        await self._session.flush()
        return log
```

Logging in den AUFRUFERN (NotificationRouter, DigestService, Test-Email-Handler):

```python
# In notification_router.py oder aehnlich:
success = await email_service.send_email(to=..., subject=..., ...)
await email_log_repo.log_send(
    to_address=to,
    subject=subject,
    provider=email_service.active_provider,
    status="sent" if success else "failed",
    notification_id=notification.id,
    template="alert_critical",
)
```

**Option B: send_email() Return-Wert erweitern**

`send_email()` gibt ein `EmailSendResult` zurueck statt `bool`:
```python
@dataclass
class EmailSendResult:
    success: bool
    provider: str
    error: str | None = None
```

**ACHTUNG:**
- [x] `EmailService` hat KEINE DB-Session — bestaetigt. **NICHT** Session hinzufuegen!
- [x] `send_email()` Signatur hat KEIN `notification_id` — `notification_id` gehoert in den Aufrufer
- [ ] `email_service.active_provider` Property existiert (gibt "Resend" / "SMTP" / "None" zurueck)
- [ ] Alle Aufrufer identifizieren: NotificationRouter, DigestService, Test-Email Handler in `notifications.py`

#### Schritt 4: API-Router (~30min)

**Aenderung in:** `El Servador/god_kaiser_server/src/api/v1/notifications.py` (bestehender Router erweitern, KEIN neuer Router) [verify-plan: Pfad korrigiert]

**Oder** neue Datei `El Servador/god_kaiser_server/src/api/v1/email_log.py` — Entscheidung: Passt es semantisch besser zu Notifications oder ist es eigenstaendig genug?

**Empfehlung:** In bestehenden `notifications.py` Router einfuegen (Email-Log ist eng mit Notifications verknuepft). Router hat bereits 12 Endpunkte (GET/PATCH/POST), 2 weitere passen noch rein.

```python
@router.get("/email-log")
async def get_email_log(
    status: Optional[str] = None,      # Filter: sent, failed
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    # Auth: Admin required
):
    """Get email sending log with filters and pagination."""
    query = select(EmailLog).order_by(EmailLog.created_at.desc())

    if status:
        query = query.where(EmailLog.status == status)
    if date_from:
        query = query.where(EmailLog.created_at >= date_from)
    if date_to:
        query = query.where(EmailLog.created_at <= date_to)

    query = query.offset(offset).limit(limit)
    result = await session.execute(query)
    return result.scalars().all()


@router.get("/email-log/stats")
async def get_email_stats():
    """Get email sending statistics."""
    # Total sent, failed, by provider, last 24h/7d/30d
    pass
```

### Implementierung — Frontend (~1.5h)

#### Schritt 5: API-Client erweitern (~15min)

**Datei:** `El Frontend/src/api/notifications.ts`

```typescript
// Neue Funktionen hinzufuegen:
export interface EmailLogEntry {
  id: string
  notification_id: string | null
  to_address: string
  subject: string
  template: string | null
  provider: 'resend' | 'smtp'
  status: 'pending' | 'sent' | 'failed' | 'permanently_failed'
  sent_at: string | null
  error_message: string | null
  retry_count: number
  created_at: string
}

export async function getEmailLog(params?: {
  status?: string
  limit?: number
  offset?: number
}): Promise<EmailLogEntry[]> {
  const response = await api.get('/v1/notifications/email-log', { params })
  return response.data
}
```

#### Schritt 6: Email-Status in NotificationDrawer (~45min)

**Datei:** `El Frontend/src/components/notifications/NotificationDrawer.vue`

**Oder:** In `QuickAlertPanel.vue` — je nachdem wo Notifications angezeigt werden.

**Aenderung:** Pro Notification die einen Email-Versand ausgeloest hat, ein Status-Icon anzeigen.

```vue
<!-- Pro Notification-Eintrag: -->
<div v-if="notification.email_status" class="email-status">
  <MailCheck v-if="notification.email_status === 'sent'" class="text-green-500" :size="14" />
  <MailX v-else-if="notification.email_status === 'failed'" class="text-red-500" :size="14" />
  <Mail v-else class="text-gray-400" :size="14" />
  <span class="text-xs text-gray-500">{{ notification.email_provider }}</span>
</div>
```

**PRUEFEN:**
- [x] Notification-DTO: Hat es ein `email_status` Feld? → **NEIN!** `NotificationDTO` hat kein `email_status`, `email_provider` oder aehnliches Feld. Felder: id, user_id, channel, severity, category, title, body, metadata, source, is_read, is_archived, digest_sent, parent_notification_id, fingerprint, created_at, updated_at, read_at, status, acknowledged_at
- [ ] **LOESUNG:** Backend muss `NotificationResponse` Schema erweitern: optionales `email_log` Feld (via LEFT JOIN mit EmailLog Tabelle bei Notification-Abfrage). Pydantic Schema: `email_log: Optional[EmailLogBrief]` mit `EmailLogBrief(status, provider, sent_at, error_message)`
- [ ] N+1-Alternative vermeiden: Kein separater API-Call pro Notification

#### Schritt 7: Email-Log Uebersicht (optional, ~30min)

**Option A:** Neuer Tab in SystemMonitorView ("Emails")
**Option B:** Section in NotificationDrawer Footer
**Option C:** Eigenstaendige View (CommunicationView) → Roadmap sagt NEIN fuer HW-Test

**Empfehlung:** Option B — kleiner Footer-Bereich in NotificationDrawer mit "Letzte 5 Emails" + Link zu vollstaendiger Liste.

### Verifikation V1.1

| # | Test | Erwartung |
|---|------|-----------|
| 1 | Email senden (Test-Email) | EmailLog-Eintrag mit `status: "sent"`, `provider: "resend"` |
| 2 | Email-Fehler (falsches Ziel) | EmailLog-Eintrag mit `status: "failed"`, `error_message` |
| 3 | `GET /api/v1/notifications/email-log` | Liste aller Email-Logs |
| 4 | Frontend: Email-Status-Icon | Gruenes Haekchen bei erfolgreich, rotes X bei fehlgeschlagen |
| 5 | Digest-Email | EmailLog mit `template: "alert_digest"` |

---

## Parallelisierung Phase C

```
V4.1 (2h, frontend-dev) ─────────────────────┐
V6.1 (1h, frontend-dev) ─────┐               ├─→ Alle 3 fertig → V8 Pre-Flight
V1.1 Backend (2h, server-dev) ┤               │
V1.1 Frontend (1.5h, frontend-dev) ──────────┘
```

V4.1 und V6.1 sind rein Frontend und koennen parallel bearbeitet werden.
V1.1 Backend muss vor V1.1 Frontend fertig sein (API muss existieren).

---

## Abhaengigkeiten

| Block | Braucht vorher | Blockiert |
|-------|---------------|-----------|
| V4.1 | Nichts (Backend existiert) | V4.2 Phase D (Suppress-Liste) |
| V6.1 | Nichts (Stores existieren) | Nichts |
| V1.1 Backend | Nichts (EmailService existiert) | V1.1 Frontend |
| V1.1 Frontend | V1.1 Backend | V1.2 Phase D (Email-Retry) |

---

## /verify-plan Ergebnis (2026-03-03)

**Plan:** Phase C Frontend-Verfeinerung — V4.1 Timed Snooze, V6.1 QAB Actions, V1.1 Email-Log
**Geprueft:** ~20 Pfade, 2 Agents, 4 Stores, 5 API-Endpunkte, 3 Composables

### Bestaetigt

- Alle Frontend-Dateien existieren: QuickAlertPanel.vue, useQuickActions.ts, diagnostics.store.ts, plugins.store.ts, NotificationDrawer.vue, notifications.ts
- Alle Backend-Dateien existieren: email_service.py, alert_suppression_service.py, alert_suppression_scheduler.py, notifications.py Router
- `AlertConfigUpdate` Interface hat `suppression_until` Feld — Backend akzeptiert es
- `suppression_until` wird vom Scheduler alle 5 Min geprueft → automatisches Re-Enable funktioniert
- `useDiagnosticsStore.runDiagnostic()` existiert und gibt `DiagnosticReport | null` zurueck
- `usePluginsStore.executePlugin()` existiert mit Signatur `(pluginId: string, configOverrides?)`
- `useToast()` Composable existiert und wird bereits in QuickAlertPanel genutzt
- `?tab=reports` wird in SystemMonitorView unterstuetzt
- Route `/plugins` existiert im Router
- Notification Tabelle `id` ist UUID — FK fuer EmailLog korrekt
- `models/__init__.py` Import-Pattern ist etabliert

### Korrekturen (11 Stellen im Plan korrigiert)

| # | Kategorie | Was korrigiert |
|---|-----------|----------------|
| K1 | Pfad | `Select.vue` → `BaseSelect.vue` |
| K2 | ViewContext | `'plugins'` fehlt im ViewContext-Typ — muss hinzugefuegt werden |
| K3 | Switch-Cases | Leading Slash entfernt (`'/plugins'` → `'plugins'`) |
| K4 | Icons | String-Referenzen → `markRaw(Component)` Pattern |
| K5 | Action-Interface | `category` Pflichtfeld hinzugefuegt |
| K6 | Base-Import | `from src.db.session import Base` → `from ..base import Base, TimestampMixin` |
| K7 | Model-Style | Column() (SQLAlchemy 1.x) → Mapped[]+mapped_column() (SQLAlchemy 2.x) |
| K8 | EmailService | Hat KEINE DB-Session — Logging in Aufrufer statt in Service |
| K9 | send_email() | Signatur korrigiert, kein `notification_id` Parameter |
| K10 | Backend-Pfade | Relative `src/...` → vollstaendige `El Servador/god_kaiser_server/src/...` |
| K11 | NotificationDTO | Hat kein `email_status` — Backend-Schema-Erweiterung noetig |

### Fehlende Vorbedingungen

- [ ] V6.1: `ViewContext` Typ um `'plugins'` erweitern (quickAction.store.ts)
- [ ] V6.1: `resolveViewContext()` um `path.startsWith('/plugins')` erweitern (useQuickActions.ts)
- [ ] V1.1: `EmailLogRepository` erstellen (Pattern wie notification_repo.py)
- [ ] V1.1: `EmailLog` in `models/__init__.py` registrieren
- [ ] V1.1: `NotificationResponse` Schema um optionales `email_log` Feld erweitern
- [ ] V1.1: Alle `send_email()` Aufrufer identifizieren fuer Log-Integration

### Ergaenzungen

- V4.1: Der bestehende `handleMute()` setzt auch `suppression_reason` + `suppression_note` — der Snooze-Handler muss dasselbe Pattern folgen
- V4.1: `sensor_config_id` kommt aus `notification.metadata`, NICHT direkt aus dem Alert-Objekt
- V4.1: Snooze-Timer braucht separaten Sensor-Config-Zugriff (NotificationDTO hat kein `suppression_until`)
- V6.1: Bestehende Context Actions fuer `system-monitor` (Log-Suche + Health-Check) muessen BEIBEHALTEN werden beim Erweitern
- V1.1: `EmailService.active_provider` Property existiert bereits (gibt "Resend"/"SMTP"/"None" zurueck) — nutzbar fuer Logging
- V1.1: `TimestampMixin` gibt automatisch `created_at` + `updated_at` — kein manuelles Feld noetig
- V1.1: V1.1 Backend Aufwand ist hoeher als geschaetzt (~2h → ~3h) wegen Repository + Schema-Erweiterung + Aufrufer-Integration

### Zusammenfassung fuer TM

Der Plan ist grundsaetzlich solide und die 3 Bloecke sind korrekt als unabhaengig identifiziert. **V4.1** hat nur kleinere Korrekturen (Sensor-Config-Zugriff fuer Timer), **V6.1** braucht ViewContext-Erweiterung als Vorbedingung. **V1.1 ist der kritischste Block**: Der Plan ging davon aus, dass EmailService direkt DB-Zugriff hat und Column-Style nutzt — beides falsch. Die korrigierte Strategie (EmailLogRepository + Logging in Aufrufern) ist architektonisch sauberer, braucht aber ~1h mehr Aufwand. Geschaetzer Gesamtaufwand steigt von ~6-7h auf ~7-8h.
