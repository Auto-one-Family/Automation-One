# Role-Based UI & Widget-Platzierung (Enduser-Shell) — Projektplan

**Linear-Projekt:** [Role-Based UI & Widget-Platzierung (Enduser-Shell)](https://linear.app/autoone/project/role-based-ui-and-widget-platzierung-enduser-shell-9d732ddc4418)
**Projekt-ID:** `0db52e66-a5d2-488a-b2d6-88db268e0660`
**Team:** AutoOne (`bb5f728a-91bd-4596-b173-876ebbc9bc16`)
**Lead:** Robin
**Priority:** High
**Erstellt:** 2026-05-06
**Verfeinert:** 2026-05-06 nach Logic-Engine-Sondierung
**Status:** Backlog
**Issues:** AUT-260 bis AUT-267 (8 Epics)

---

## Hintergrund (Robins Brief, 2026-05-06)

> "Das Frontend ist absolut nicht nutzerfreundlich. Es ist eher fuer den Admin oder den geneigten Entwickler geeignet als einen Enduser. Idee: verschiedene Nutzerprofile, der User bekommt eine angepasste Oberflaeche. Zum Beispiel: nur den Monitor mit den zwei Ebenen und die vom Admin erstellten Widgets. Ausserdem Logic, Plugins, ausgewaehlte Tabs aus System, seine User-Informationen, Email-Account (vom User). Komponententab wird auch wichtig. Wir muessen parallel den ganzen Editor und die Nutzung der Widgets genaustens optimieren. Sie sollen kuenftig ueber Editor erstellt werden, dann als SubzoneCards gerendert (wie Sensoren ungefaehr, nur angepasst) und der User sie dann ueber den FAB auf dem Monitor verteilen kann."
>
> "Vergiss bitte die Logic Engine nicht, die Rules muessen auch gebildet werden. Die werden auch schon als Cards gerendert — wenn wir das Design ausnutzen und optimieren, haben wir auch schon was wir brauchen."

---

## IST-Befund (Frontend- und Logic-Engine-Sondierung 2026-05-06)

| Bereich | Status |
|---|---|
| User-Modell + Rollen | `admin` / `operator` / `viewer` (`src/types/index.ts`, `src/api/auth.ts`) |
| Permission-System | Nur `isAdmin` / `isOperator` Boolean-Checks. **Keine** Komponenten-Level-Guards. |
| Widget-Editor | Vorhanden: `CustomDashboardView.vue` (56 KB), `WidgetConfigPanel.vue`, `dashboard.store.ts` (63 KB), Server-Sync `src/api/dashboards.ts`, ~12 Widget-Typen. |
| Rule-Editor | Node-RED-inspirierter Vue Flow Canvas: `LogicView.vue` + `RuleFlowEditor.vue` + `RuleNodePalette.vue` + `RuleConfigPanel.vue`. State in `logic.store.ts` (REST + WS, Lifecycle-Tracking). Backend `CrossESPLogic` Modell + `LogicRuleCreate` Pydantic. |
| **RuleCard** | **Bereits vorhanden** in `src/components/rules/RuleCard.vue` — Header (Status-Dot, [KRIT]-Badge, Lifecycle-Badge), Body (Flow-Badges Sensor → Operator → Action), Footer (Last Triggered, Executions/24h), Hover-Aktionen. **Vorbild fuer Generic EntityCard.** |
| Monitor / HardwareView | 2-Level-Navigation (L1 Zone-Accordion, L2 ESP-Detail/Orbital). **Korrektur** zu CLAUDE.md: 2 Level, nicht 3. SubzoneArea bestehend. **Kein FAB.** |
| System-Tab | 8 Sub-Tabs (`events`, `logs`, `database`, `mqtt`, `health`, `diagnostics`, `reports`, `hierarchy`) async-geladen. Heute fuer alle Rollen identisch. |
| Komponenten-Tab | `SensorsView.vue` (50 KB) Wissensdatenbank, kein Konfig. Subtabs Sensors/Actuators. |
| Layout-Persistierung | Nur einzelne `localStorage`-Keys. Kein zentrales User-Preferences-System. |
| Email | `EmailPostfachView.vue` Route `/email` existiert (heute Stub). |

**Schluesselerkenntnis aus Sondierung:** RuleCard-Pattern ist heute schon vollwertig (Glass-Box, Header/Body/Footer, Status-Dot, Lifecycle-Badges, Hover-Aktionen). Wenn wir das zur generischen `EntityCard` machen, koennen Widgets, Sensoren und Actuators alle dasselbe Look&Feel und dieselbe Interaktion bekommen — minimaler Refactor-Aufwand, maximaler Designgewinn.

---

## SOLL-Zustand

### Drei Nutzerprofile

| Rolle | Sichtbar | Unsichtbar / reduziert |
|---|---|---|
| **Admin** | Alles wie heute, plus Profil-Switcher (Impersonate-View) | — |
| **Operator** (Gaertner-Mitarbeiter, LPAP-Operator) | Monitor (L1+L2) mit FAB, Editor (Widget+Rule Vue Flow Canvas, eingeschraenkt), Logic (read+create via Wizard), Plugins, System-Tabs `events`/`health`/`logs`, Komponenten-Tab, eigene User-Info, eigener Email-Account | Database, MQTT, Diagnostics, Hierarchy, User-Management, Setup |
| **Enduser** (Club-Vorstand, Mandant) | Monitor mit FAB + freigegebenen Widgets/Rules, Logic (read-only + Wizard fuer einfache Rules), Plugins (read-only), `events`+`health`, Komponenten-Tab (read), User-Info, eigener Email-Account | Editor-Vollzugriff (Vue Flow Canvas), Konfig-/Diagnostik-/Admin-Tabs |
| **Viewer** | Monitor (read-only), `events`-Tab, User-Info | Alle Konfig-, Editor-, Layout-Funktionen |

### Universal-Card-Pipeline (verfeinert nach Logic-Sondierung)

```
Admin/Operator    Editor (Widget + Rule)   EntityCard-Renderer    Enduser-Monitor      User-Layout
     │              │                           │                       │                  │
     ├─ Widget ──┤                            │                       │                  │
     ├─ Rule ───┤                              │                       │                  │
     │              ├─ konfiguriert ────────►  ┤                       │                  │
     │              │ "freigegeben"             ├─ EntityCard          │                  │
     │              │                           │  (rule | widget)     │                  │
     │              │                           │  Header/Body/Footer  │                  │
     │              │                           │  Lifecycle-Badge     ┤                  │
     │              │                           │                       ├─ FAB klicken →  ┤
     │              │                           │                       │                  ├─ Widget oder Rule waehlen
     │              │                           │                       │                  ├─ auf Subzone droppen
     │              │                           │                       │ Card rendert    ┤
     │              │                           │                       │ an User-Position
                                                                                            │
                                                                                       Persistiert in
                                                                                       user_widget_layouts
                                                                                       (entity_type='widget'|'rule')
```

**Drei zentrale Hebel:**
1. **EntityCard-Pattern** generalisiert RuleCard → Widgets, Sensoren, Actuators nutzen dasselbe Design.
2. **FAB platziert beides** (Widgets UND Rules) im selben Picker-Modal, persistiert in einer Tabelle (`user_widget_layouts` mit `entity_type`-Diskriminator).
3. **Rule-Wizard** als Alternative zum Vue Flow Canvas: 5-Schritt-Form fuer simple Use-Cases, Vue Flow bleibt fuer Power-User.

---

## Definition of Done (Projekt-Ebene)

1. Endnutzer kann sich einloggen, sieht **nur** seine Oberflaeche, platziert Widgets UND Rules selbst — ohne Admin-Eingriff.
2. Layout persistiert geraeteuebergreifend.
3. Admin kann pro User Capability-Overrides setzen (Tab-Ebene fuer System, Widget-Typ-Ebene fuer Editor, Rule-Komplexitaet-Ebene fuer Logic).
4. Bestehende Custom-Dashboards bleiben fuer Admin nutzbar oder werden migriert.
5. Mobile-First: 375 px Mindestbreite (Phyta-IoT-Produktkommunikations-Regel).
6. Tests: Playwright E2E pro Rolle gruen, Backend-Permission-Tests pro Endpoint.
7. Doku: 5 Operator-Anleitungen + Migrations-Hinweis.
8. Pilot-Phase 1 (intern Robin/Franz/Christoph/Simon) abgeschlossen, Feedback dokumentiert.

---

## Epic-Struktur (Linear-Issues, alle angelegt 2026-05-06)

### Epic A — Permission-Foundation: Capability-System Backend + Frontend
**Linear:** [AUT-260](https://linear.app/autoone/issue/AUT-260) · **Estimate:** 5 SP · **Priority:** Urgent · **Status:** Backlog

- Backend (`server-dev` + `db-inspector`):
  - Tabelle `role_capabilities` (role × feature_key × granted)
  - Tabelle `user_capability_overrides` (user_id × feature_key × granted)
  - `/auth/me` liefert `capabilities: string[]`
  - Decorator `require_capability("feature_key")` fuer FastAPI
  - Alembic-Migration mit Default-Matrix (4 Rollen × ~30 Capabilities)
- Frontend (`frontend-dev`):
  - `useCapability(featureKey)` Composable
  - `<RequireCap key="...">` Komponente
  - Auth-Store erweitern: `capabilities: string[]`, `hasCapability(key)`

**~30 Feature-Keys:** monitor.*, editor.widget.*, editor.rule.*, logic.rule.*, system.tab.* (8), components.view, plugins.*, email.*, users.*

**Verify-Gate B-CAP-01..05.** **Blockiert: B, C, D, E, F, G, H.**

---

### Epic B — Enduser-Shell: Reduzierte Navigation + Profil-Switcher + Onboarding
**Linear:** [AUT-261](https://linear.app/autoone/issue/AUT-261) · **Estimate:** 5 SP · **Priority:** High

- AppShell-Refactor: NavItems lazy mit `requiredCapability`-Prop, NavSection-Gruppierung "Cockpit/Konfiguration/Verwaltung"
- Profil-Switcher fuer Admin (Impersonate-Mode, clientseitig nur)
- Onboarding-Tour fuer Enduser First-Login (4 Schritte, persistiert in `user_preferences.onboarding_completed_at`)
- Standard-Landing pro Rolle, Mobile-Drawer < 1024 px

**Verify-Gate B-SHELL-01..05.** **Blocked by:** AUT-260.

---

### Epic C — Editor-Refactor: Widget- UND Rule-Editor (Templates, Live-Preview, Validation, Capability)
**Linear:** [AUT-262](https://linear.app/autoone/issue/AUT-262) · **Estimate:** 13 SP · **Priority:** High

- **Widget-Editor:** SlideOver auf 600 px, Tree-Picker Datenquellen, Tabs "Datenquelle/Darstellung/Verhalten/Vorschau", Live-Preview, Validation, Capability-Filter
- **Rule-Editor:** LogicView-Toolbar UX-Aufraeumen, zwei Modi (Advanced = Vue Flow Canvas wie heute fuer Admin/Operator; Simple = Wizard fuer Operator/Enduser → Epic G), Live-Preview "Wuerde JETZT triggern", Pydantic-Validation-Errors als Inline-Markierung
- **Templates:** Tabellen `widget_templates` UND `rule_templates`, "Aus Vorlage erstellen"-Button, 5 Default-Templates pro Typ als Seed
- Capability `editor.widget.template.create` (Admin) + `editor.widget.template.use` (Operator/Enduser)

**Verify-Gate B-EDIT-01..08** (4 Widget + 4 Rule). **Blocked by:** AUT-260. **Bezug:** AUT-220.

---

### Epic D — Generic EntityCard-Pattern: Rules + Widgets + Sensors + Actuators einheitlich
**Linear:** [AUT-263](https://linear.app/autoone/issue/AUT-263) · **Estimate:** 8 SP · **Priority:** High

- Generische `EntityCard.vue` mit Props (entityType, status, isCritical, lifecycleBadge, metadata, actions) und Slots (header-extra, body, footer-extra)
- RuleCard auf EntityCard umstellen (Visual-Regression-Test < 1 % Pixel-Diff)
- Neue WidgetCard.vue als EntityCard-Wrapper, 3 Render-Modi: `subzone-card` (Standard), `dashboard-grid` (Editor), `detail-modal` (Vollansicht)
- SensorCard und ActuatorCard optional in Phase 2 migrieren
- SCSS-Konsolidierung: `.rule-card__*` → `.entity-card__*` mit Variant-Modifier

**Verify-Gate B-CARD-01..06.** **Blocked by:** AUT-260. **Vorbereitet:** Epic E, Epic G.

---

### Epic E — Monitor-FAB + Universal-Platzierung + Layout-Persistenz (Widgets UND Rule-Status-Cards)
**Linear:** [AUT-264](https://linear.app/autoone/issue/AUT-264) · **Estimate:** 8 SP · **Priority:** High

- Backend:
  - Tabelle `user_widget_layouts` (user_id, zone_id, subzone_id, **entity_type** ('widget'|'rule'), entity_id, position_order, display_size, custom_config)
  - REST-API GET/POST/PATCH/DELETE
  - WS-Event `user_layout.updated` fuer Multi-Device-Sync
- Frontend:
  - `MonitorFAB.vue` (fixed bottom-right, Mobile-aware)
  - `EntityPickerModal.vue` mit Tabs "Widgets / Regeln / Vorlagen", Karten-Liste rendert mit EntityCard
  - Platzierungs-Modus: Subzonen pulsieren, Tap auf Subzone → API-Call
  - Layout-Modus mit Drag-Handle + Resize-Handle
  - `userLayout.store.ts` mit Optimistic Update + WS-Sync

**Verify-Gate B-FAB-01..07.** **Blocked by:** AUT-260, AUT-263.

---

### Epic F — System-Tab-Capability-Filter + Email-Account-Anbindung pro User
**Linear:** [AUT-265](https://linear.app/autoone/issue/AUT-265) · **Estimate:** 5 SP · **Priority:** Medium

- **System-Tab-Filter:** Pro Tab `<RequireCap key="system.tab.<id>">`-Wrapper. Default: Admin=8, Operator=3, Enduser=2, Viewer=1. Auto-Switch bei entferntem aktivem Tab.
- **Email-Account:** Tabelle `user_email_accounts` (provider, imap_host/port/user, credentials_encrypted via AES-256-GCM, sync_status). REST-API GET/POST/DELETE/test/emails. Settings-Sektion "Email-Konto verbinden", `EmailPostfachView` Refactor mit IMAP-cached-Listing (60 s Cache).
- **MVP:** Nur Lesen, kein Senden.

**Verify-Gate B-SYS-01..06.** **Blocked by:** AUT-260.

---

### Epic G — Rule-Wizard fuer Operator/Enduser: Vereinfachte Regelerstellung ohne Vue Flow Canvas
**Linear:** [AUT-266](https://linear.app/autoone/issue/AUT-266) · **Estimate:** 8 SP · **Priority:** High

- `SimpleRuleWizard.vue` mit 5-Schritt-Stepper:
  1. "Was soll passieren?" (Action-First Button-Grid)
  2. "Auf welcher Subzone?"
  3. "Wann soll es ausgeloest werden?" (Sensor / Uhrzeit / Manuell)
  4. "Wie genau?" (Aktion-Detail, Cooldown, Critical-Toggle)
  5. "Vorschau und speichern" (Live-EntityCard + Klartext-Zusammenfassung + Live-Status "Wuerde JETZT triggern")
- Backend: `created_via: 'wizard'|'flow'`-Audit-Feld am Endpoint
- Vue Flow Canvas bleibt UNVERAENDERT fuer Admin/Operator
- Mobile-Vollbild-Modal, Schritt-Indikator, "Zurueck/Weiter" fix unten
- Bewusste Limitierungen: 1 Trigger + 1 Action, kein Multi-Sensor/OR, kein Cross-ESP — fuer komplexe Rules: Hinweis "Erweiterten Editor nutzen"

**Verify-Gate B-WIZ-01..06.** **Blocked by:** AUT-260, AUT-262, AUT-263.

---

### Epic H — Migration + Tests + Rollout: bestehende Dashboards, E2E pro Rolle, Pilot-Phasen
**Linear:** [AUT-267](https://linear.app/autoone/issue/AUT-267) · **Estimate:** 5 SP · **Priority:** Medium

- Adapter in `dashboard.store.ts` (alte Dashboards bleiben kompatibel)
- Migrations-Skript `scripts/migrate_isadmin_to_capabilities.py` (manuelle Reviews)
- Feature-Flag `USE_CAPABILITY_SYSTEM` als Notfall-Fallback
- Test-Abdeckung:
  - Backend: 100 % Coverage Capability-Decorators
  - Frontend: Vitest fuer alle neuen Composables/Komponenten
  - Playwright E2E pro Rolle (Admin/Operator/Enduser/Viewer) auf Desktop + Mobile
- 5 Doku-Dateien: role-based-ui-anleitung / enduser-onboarding / role-capability-matrix / rule-wizard-anleitung / email-account-setup
- **Rollout-Phasen:**
  - Phase 1 (1 Wo): intern (Robin/Franz/Christoph/Simon)
  - Phase 2 (2 Wo): LPAP-Pilot (Christoph + 1 Mitarbeiter + 1 Mandant)
  - Phase 3 (2 Wo): CSC-Vorstand (Franz als Enduser)
  - Phase 4 (open-ended): Phyta-Gaertner-Pilot
- Rollback-Plan via Feature-Flag

**Verify-Gate B-MIG-01..06.** **Blocked by:** alle vorherigen Epics.

---

## Abhaengigkeitsgraph

```
   AUT-260 Epic A (Permission-Foundation)
       │
       ├──► AUT-261 Epic B (Enduser-Shell)
       ├──► AUT-262 Epic C (Editor-Refactor) ──┐
       ├──► AUT-263 Epic D (EntityCard) ◄──────┘
       │       │
       │       └──► AUT-264 Epic E (FAB + Layout) ──┐
       │       │                                    │
       │       └──► AUT-266 Epic G (Rule-Wizard) ──┐│
       │                                           ││
       ├──► AUT-265 Epic F (System + Email) ─────┐ ││
       │                                         │ ││
       └──► AUT-267 Epic H (Migration + Rollout) ◄┘
```

**Empfohlene Wellen:**
- **W1:** AUT-260 (Foundation, blockiert alles)
- **W2:** AUT-261 + AUT-262 + AUT-263 parallel (frontend-dev Doppel-Sprint, server-dev fuer Templates)
- **W3:** AUT-264 (FAB) + AUT-266 (Rule-Wizard) parallel — beide nutzen EntityCard
- **W4:** AUT-265 (System + Email)
- **W5:** AUT-267 (Migration + Rollout)

**Gesamt-Aufwand:** 5 + 5 + 13 + 8 + 8 + 5 + 8 + 5 = **57 SP**

---

## Verifikations-Anker (Frontend- und Logic-Sondierung 2026-05-06)

### Widget-System
| Datei | Zweck |
|---|---|
| `src/views/CustomDashboardView.vue` | Editor (56 KB) |
| `src/components/dashboard-widgets/WidgetConfigPanel.vue` | Widget-Config SlideOver |
| `src/types/widgetRegistry.ts` | Widget-Typ-Registry |
| `src/shared/stores/dashboard.store.ts` | Widget-Persistierung (63 KB) |
| `src/api/dashboards.ts` | Server-Sync |

### Logic-Engine (NEU sondiert)
| Datei | Zweck |
|---|---|
| `src/views/LogicView.vue` | Header + Vue Flow + Config + History |
| `src/components/rules/RuleFlowEditor.vue` | Vue Flow Canvas, Custom Nodes |
| `src/components/rules/RuleNodePalette.vue` | Drag-Nodes (Sensor, Time, Logic, Actuator, ...) |
| `src/components/rules/RuleConfigPanel.vue` | Node-Level Editing |
| `src/components/rules/RuleCard.vue` | **Vorbild fuer EntityCard** (465 Zeilen, Header/Body/Footer/Lifecycle) |
| `src/shared/stores/logic.store.ts` | REST + WS, Lifecycle-Tracking |
| `El Servador/god_kaiser_server/src/db/models/logic.py` | CrossESPLogic + LogicExecutionHistory |
| `El Servador/god_kaiser_server/src/schemas/logic.py:269-385` | LogicRuleCreate/Update Pydantic |

### Layout / Navigation
| Datei | Zweck |
|---|---|
| `src/router/index.ts` | Route-Definitionen |
| `src/shared/design/layout/AppShell.vue` | Layout-Wrapper |
| `src/views/HardwareView.vue` | L1 Zone-Accordion |
| `src/views/DeviceDetailView.vue` | L2 ESP-Detail/Orbital |
| `src/components/zones/SubzoneArea.vue` | SubzoneCard-Pattern |

### Auth + System
| Datei | Zweck |
|---|---|
| `src/api/auth.ts`, `src/shared/stores/auth.store.ts` | Auth + Rollen |
| `src/types/index.ts` | User-Interface |
| `src/components/system-monitor/types.ts` | TabId-Union (8 Tabs) |
| `src/views/EmailPostfachView.vue` | Email-View (Route `/email`) |
| `src/views/SensorsView.vue` | Komponenten-Tab (50 KB) |

---

## Nicht-Ziele (Explizit out-of-scope)

- Multi-Tenant-Mandantentrennung (Folge-Projekt)
- SSO (OIDC/SAML) (Folge-Projekt)
- Custom-Theme/Branding pro Mandant
- Mobile-Native-App
- Email-Senden (nur Lesen im MVP)
- Wizard-zu-Flow-Konvertierung (spaetere Iteration)
