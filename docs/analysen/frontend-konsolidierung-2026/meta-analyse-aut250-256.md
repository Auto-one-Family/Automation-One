# Meta-Analyse AUT-250..256 — Frontend-Konsolidierung 2026

**Erstellt:** 2026-05-06  
**Analyst:** meta-analyst  
**Branch:** auto-debugger/work  
**Scope:** `El Frontend/src/` — reine Frontend-Issues

---

## Analyse-Zusammenfassung

| Issue | Titel | Status Code-Anker | Kritische Erkenntnis |
|-------|-------|-------------------|----------------------|
| AUT-250 | Status-Vokabular vereinheitlichen | Fast vollständig vorhanden | `StatusBadge.vue` + `DateDisplay.vue` existieren bereits unter `@/components/base/` |
| AUT-251 | Zone vs. Subzone UI | Teile vorhanden | `SubzoneAssignmentSection.vue` existiert, muss umgebaut nicht neu erstellt werden |
| AUT-252 | Wissensdatenbank-Vernetzung | BLOCKED by AUT-221 | Nicht analysiert |
| AUT-253 | FAB auf 3 Optionen reduzieren | Vollständig vorhanden | Emergency Stop ist in `globalActions` in `useQuickActions.ts` (id: `global-emergency`) |
| AUT-254 | TopBar bereinigen | Größtenteils bereits gelöst | Mock/Real-Toggle bereits via `import.meta.env.MODE === 'development'` gesteuert |
| AUT-255 | Alert-Suppression visualisieren | Basis-Typen vorhanden | `DeviceAlertConfigUpdate.propagate_to_children` + `AlertConfigResponse` in api/esp.ts |
| AUT-256 | Aktor-Detail Linked Rules | `LinkedRulesSection.vue` vorhanden | `ExecutionHistoryItem` in `types/logic.ts`, store-Getter `getLastExecutionForActuator` |

---

## AUT-250 — Status-Vokabular vereinheitlichen

### Existierende Dateien (keine Neuerstellung nötig)

| Datei | Pfad | Zustand |
|-------|------|---------|
| `StatusBadge.vue` | `El Frontend/src/components/base/StatusBadge.vue` | Vollständig implementiert |
| `DateDisplay.vue` | `El Frontend/src/components/base/DateDisplay.vue` | Vollständig implementiert |
| `qualityToStatus()` | `El Frontend/src/utils/formatters.ts` Zeile 777 | Vorhanden |
| `qualityToStatusLevel()` | `El Frontend/src/utils/formatters.ts` Zeile 797 | Vorhanden |
| `severityToStatus()` | `El Frontend/src/utils/formatters.ts` Zeile 802 | Vorhanden |
| `sensorStatusToLevel()` | `El Frontend/src/utils/formatters.ts` Zeile 809 | Vorhanden |
| `espStatusToLevel()` | `El Frontend/src/utils/formatters.ts` Zeile 817 | Vorhanden |
| `zoneHealthToLevel()` | `El Frontend/src/utils/formatters.ts` Zeile 825 | Vorhanden |
| `StatusLevel` type | `El Frontend/src/utils/formatters.ts` Zeile 794 | Vorhanden: `'ok' | 'warning' | 'alarm' | 'offline'` |

### CSS-Token-Status in `tokens.css`

`--color-status-ok`, `--color-status-warn`, `--color-status-alarm`, `--color-status-offl` existieren alle (Zeilen 269-272 in tokens.css). Das 4-Level-System ist vollständig.

**Fehlende Aliasse:** `--color-status-alarm` verweist auf `#ef4444` direkt (kein var-Alias wie ok/warn/offl). Dies ist ein kosmetischer Inkonsistenz-Fix.

### Migrationsstand (wer nutzt StatusBadge bereits)

Bereits migriert: `SensorCard.vue`, `DeviceMiniCard.vue`, `NotificationItem.vue`, `DeviceSummaryCard.vue`, `AlertStatusBar.vue`, `ActuatorCard.vue`, `QuickAlertPanel.vue`, `ZoneTileCard.vue`.

**Noch nicht migriert (laut Issue-Beschreibung):** ZoneHeader, NotificationDrawer, AlertPanel, RuleListItem, MonitorView. Diese Dateien müssen geprüft und auf `StatusBadge` umgestellt werden.

### Developer-Handoff AUT-250

**Agent:** `frontend-dev`  
**Scope:** Migration verbleibender Komponenten auf kanonisches 4-Level-System

**Bereits vorhanden — kein Neu-Erstellen:**
- `El Frontend/src/components/base/StatusBadge.vue` — Props: `level: StatusLevel`, `compact?`, `showIcon?`, `labelOverride?`
- `El Frontend/src/components/base/DateDisplay.vue` — Props: `date`, `format?: 'relative' | 'absolute'`
- Alle Formatter-Funktionen in `El Frontend/src/utils/formatters.ts` (Zeilen 777-831)
- Alle CSS-Tokens in `El Frontend/src/styles/tokens.css` (Zeilen 264-272)

**Fehlender Token (Zeile 270 tokens.css):** `--color-status-alarm` fehlt als canonical alias. Nur `--color-status-alarm: #ef4444` direkt. Hinzufügen:
```css
--color-status-alarm: var(--color-error); /* fehlt in AUT-250-Block */
```

**Migrations-Tasks:**
1. Grep nach `text-success`, `text-warning`, `text-error` in den Ziel-Komponenten — ersetzen durch `<StatusBadge :level="...">`
2. `formatters.ts` export-Check: `StatusLevel` und `qualityToStatusLevel` werden aus `@/utils/formatters` importiert (nicht aus separater Datei)

**Akzeptanzkriterien:**
- `npm run build` exit 0
- Alle Ziel-Komponenten importieren `StatusBadge` aus `@/components/base/StatusBadge.vue`
- Keine hardcodierten Farb-Strings (`#34d399`, `text-green-*`) für Status-Zustände in migrierten Komponenten

**Risiko:** `--color-status-alarm` fehlt als var-Alias — StatusBadge nutzt direkt `var(--color-status-alarm)` und das funktioniert, aber der canonical alias-Block in tokens.css (Zeilen 269-272) ist inkonsistent.

---

## AUT-251 — Zone vs. Subzone UI

### Existierende Dateien

| Datei | Pfad | Relevanz |
|-------|------|----------|
| `SubzoneAssignmentSection.vue` | `El Frontend/src/components/devices/SubzoneAssignmentSection.vue` | Vollständige Subzone-Picker-Komponente (v-model pattern) |
| `SensorConfigPanel.vue` | `El Frontend/src/components/esp/SensorConfigPanel.vue` | Importiert SubzoneAssignmentSection (Zeile 29) |
| `ActuatorConfigPanel.vue` | `El Frontend/src/components/esp/ActuatorConfigPanel.vue` | Importiert SubzoneAssignmentSection (Zeile 28) |
| `ESPSettingsSheet.vue` | `El Frontend/src/components/esp/ESPSettingsSheet.vue` | Enthält "Geräte nach Subzone"-Grouping (devicesBySubzone computed, Zeile 229) |
| `AccordionSection.vue` | `El Frontend/src/shared/design/primitives/AccordionSection.vue` | Pattern für Accordion-Entfernung: `defaultOpen`, `storageKey`, `modelValue` |

### Fehlende Dateien (neu erstellen)

- `El Frontend/src/components/devices/SettingsBreadcrumb.vue` — neu

### Developer-Handoff AUT-251

**Agent:** `frontend-dev`  
**Scope:** Zone/Subzone-UI-Bereinigung in Settings-Panels

**Task 1 — SensorConfigPanel.vue + ActuatorConfigPanel.vue: Akkordeon-Umbau**

In `SensorConfigPanel.vue` (und analog `ActuatorConfigPanel.vue`) existiert eine `AccordionSection` mit Titel "Zone-Zuordnung" (oder ähnlich). Diese soll:
- Das interaktive Subzone-Assignment (`<SubzoneAssignmentSection>`) behalten
- Eine neue read-only Zeile "Zone: [zone_name]" **über** der Subzone-Zuweisung hinzufügen (keine Bearbeitungsmöglichkeit, da Zone auf Geräteebene)
- Das accordion-Wrapper um die Zone-Anzeige entfernen (Zone ist immer sichtbar, read-only)

Pattern für read-only Zone-Display (analog zu ESPSettingsSheet.vue Zeile 172, `zoneDisplay` computed):
```typescript
const zoneDisplay = computed(() => espStore.getDevice(props.espId)?.zone_name ?? '—')
```

**Task 2 — ESPSettingsSheet.vue: Label-Umbenennung**

In `ESPSettingsSheet.vue` im Template suchen nach dem Abschnitt der "Geräte nach Subzone" Darstellung (computed: `devicesBySubzone`, Zeile 229). Den Header-Text umbenennen von "Sensoren & Aktoren" oder Ähnlichem zu "Geräte nach Subzone" — laut `subzoneName` Auflösung (Zeile 243 `resolveSubzoneName`) ist der Code bereits korrekt, nur das Label im Template prüfen.

**Task 3 — SettingsBreadcrumb.vue neu erstellen**

```
El Frontend/src/components/devices/SettingsBreadcrumb.vue
```
Props: `zone?: string`, `subzone?: string`, `esp?: string`, `gpio?: number`  
Pattern: Analog zu TopBar.vue `header__breadcrumb` (Zeile 112ff) — inline Breadcrumb mit `›`-Separator.  
Tokens: `--color-text-muted` für Separatoren, `--color-text-primary` für aktuelles Element.

**Akzeptanzkriterien:**
- In SensorConfigPanel/ActuatorConfigPanel: Zone read-only sichtbar, Subzone weiterhin editierbar
- ESPSettingsSheet: Abschnittsbezeichnung korrekt
- `SettingsBreadcrumb.vue` rendert Zone/Subzone/ESP/GPIO-Kette, fehlende Werte werden ausgelassen

**Risiko:** `SubzoneAssignmentSection` hat `disabled`-Prop (Zeile 24) — beim Entfernen des Zone-Akkordeons aufpassen, die richtige `zoneId` als Prop zu übergeben (wird für Subzone-Kontext gebraucht).

---

## AUT-253 — FAB von 9 auf 3 Optionen reduzieren

### Existierende Dateien

| Datei | Pfad | Relevanz |
|-------|------|----------|
| `QuickActionBall.vue` | `El Frontend/src/components/quick-action/QuickActionBall.vue` | FAB-Container, sub-panel routing |
| `QuickActionMenu.vue` | `El Frontend/src/components/quick-action/QuickActionMenu.vue` | Rendert contextActions + globalActions + Widget-Strip |
| `useQuickActions.ts` | `El Frontend/src/composables/useQuickActions.ts` | Definiert `buildContextActions()` + `buildGlobalActions()` |
| `quickAction.store.ts` | `El Frontend/src/shared/stores/quickAction.store.ts` | `QuickAction` Typ, `contextActions`, `globalActions` |

### Emergency Stop Fundstelle

`useQuickActions.ts` Zeile 197-202: `global-emergency` Action mit `id: 'global-emergency'`, `label: 'Emergency Stop'`, `icon: ShieldAlert`. Dies ist die zu entfernende Action aus `buildGlobalActions()`.

### Developer-Handoff AUT-253

**Agent:** `frontend-dev`  
**Scope:** `useQuickActions.ts` — globalActions auf 3 reduzieren

**Task:** In `buildGlobalActions()` in `El Frontend/src/composables/useQuickActions.ts`:

1. `global-emergency` Action **entfernen** (Emergency Stop verbleibt ausschließlich in der TopBar via `EmergencyStopButton.vue`)
2. `global-alerts` (Bell → Alert-Panel) **behalten**
3. `global-navigation` (Navigation-Panel) **behalten**
4. Quick-Search Action **neu hinzufügen** (id: `global-search`, label: 'Quick-Suche', icon: `Search`, handler öffnet CommandPalette via `uiStore.openCommandPalette()` oder analog)
5. Aktor-Schalten Action **neu hinzufügen** — Stub: `id: 'global-actuator-toggle'`, label: 'Aktor schalten', icon: `Power`, handler navigiert zu `/hardware` (vollständige Implementierung folgt)
6. Schnell-Notiz Action **neu hinzufügen** — Stub: `id: 'global-quick-note'`, label: 'Schnell-Notiz', icon: `FileText`, handler: `console.warn('TODO: Schnell-Notiz stub')` (AUT-253 explizit als Stub)

**Pattern:** `markRaw()` um Icon-Komponenten wrappen (bestehend in `useQuickActions.ts` Zeilen 10-27 — alle Icons dort importieren).

**Verfügbare Icons für neue Actions:**
- `Search` — bereits importiert in `useQuickActions.ts` Zeile 17
- `Power` — nicht importiert, aus `lucide-vue-next` hinzufügen
- `FileText` — bereits importiert (Zeile 19)

**Akzeptanzkriterien:**
- QuickActionBall zeigt exakt 3 globalActions: Quick-Search, Aktor-Schalten, Schnell-Notiz
- Emergency Stop ist nicht mehr in der FAB-Liste
- `EmergencyStopButton.vue` in `TopBar.vue` (Zeile 211) bleibt unberührt
- `npm run build` exit 0

**Risiko:** Context-Actions (view-abhängig) sind separat von globalActions — diese bleiben unverändert. Nur `buildGlobalActions()` anpassen.

---

## AUT-254 — TopBar bereinigen

### Befund: Größtenteils bereits implementiert

**Mock/Real-Toggle bereits dev-only:**

`El Frontend/src/components/layout/HeaderDeviceStatus.vue` Zeile 18-20:
```typescript
const showDevTypeToggle = computed(
  () => import.meta.env.MODE === 'development' || hasMockDevices.value
)
```

Der Toggle ist bereits korrekt gesteuert: nur in dev-Mode ODER wenn Mock-Devices vorhanden. Das entspricht genau der Issue-Anforderung.

**Counter-Situation:**

`HeaderDeviceStatus.vue` zeigt: `onlineCount`, `offlineCount`, `alarmCount` — genau die 3 gewünschten Metriken (Online/Offline/Alarme). Die Counter-Doppelung (Alarm-Count erscheint sowohl in `HeaderDeviceStatus` als auch in `AlertStatusBar`) muss geprüft werden.

`TopBar.vue` Zeile 204-208: `AlertStatusBar` und `NotificationBadge` sind zusätzliche Elemente. Die Frage ist, ob `alarmCount` in `HeaderDeviceStatus` (via `alertStore.alertStats?.active_count`) und `AlertStatusBar` dieselbe Zahl doppelt zeigen.

### Developer-Handoff AUT-254

**Agent:** `frontend-dev`  
**Scope:** `El Frontend/src/components/layout/HeaderDeviceStatus.vue`, `El Frontend/src/shared/design/layout/TopBar.vue`

**Task 1 — Mock/Real-Prüfung (wahrscheinlich bereits erledigt):**
`showDevTypeToggle` in `HeaderDeviceStatus.vue` prüfen: `import.meta.env.MODE === 'development' || hasMockDevices.value`. Falls bereits korrekt, keine Änderung nötig. Nur verifizieren via `npm run build` in prod-Mode (MODE === 'production').

**Task 2 — Counter-Doppelung analysieren:**
In `TopBar.vue` prüfen ob `alarmCount` aus `HeaderDeviceStatus` (Zeile 15, via `alertStore.alertStats?.active_count`) und `AlertStatusBar` (Zeile 205) dieselbe Zahl zeigen. Falls ja: Eine der beiden Darstellungen entfernen. Empfehlung: `AlertStatusBar` behalten (reichere Info), `hds__chip--alarm` in `HeaderDeviceStatus.vue` entfernen.

**Task 3 — StatusPill-Doppelung in TopBar:**
`TopBar.vue` rendert `StatusPill` für `warning` und `safeMode` sowohl im Desktop-Center (Zeile 136ff) als auch im Mobile-Dropdown (Zeile 258ff) — das ist korrekt (responsive, kein Bug).

**Akzeptanzkriterien:**
- Mock/Real-Toggle im Prod-Build nicht sichtbar wenn keine Mock-Devices
- Alarm-Count nur einmal sichtbar in der TopBar
- `npm run build` exit 0

---

## AUT-255 — Alert-Suppression-Kaskade visualisieren

### Existierende Typen und APIs

| Symbol | Datei | Zeile |
|--------|-------|-------|
| `DeviceAlertConfigUpdate.propagate_to_children` | `El Frontend/src/api/esp.ts` | 944 |
| `AlertConfigUpdate.alerts_enabled` | `El Frontend/src/api/sensors.ts` | 402 |
| `AlertConfigResponse.alert_config` | `El Frontend/src/api/sensors.ts` | 415-421 |
| `DeviceAlertConfigSection.vue` | `El Frontend/src/components/devices/DeviceAlertConfigSection.vue` | Vollständig: propagate_to_children UI, Zeile 36-39 |
| `AlertConfigSection.vue` | `El Frontend/src/components/devices/AlertConfigSection.vue` | Vollständig: alerts_enabled + suppression für Sensor/Aktor |
| `espApi.getAlertConfig()` | `El Frontend/src/api/esp.ts` | ~Zeile 920 |

### Fehlende Dateien (neu erstellen)

- `El Frontend/src/composables/useAlertSuppression.ts` — neu

### Developer-Handoff AUT-255

**Agent:** `frontend-dev`  
**Scope:** Suppression-Kaskade visualisieren (Device → Sensor/Aktor-Tile)

**Task 1 — `useAlertSuppression.ts` neu erstellen**

```
El Frontend/src/composables/useAlertSuppression.ts
```

Composable-Pattern aus `El Frontend/src/composables/useESPStatus.ts` (lazy getter per Device) übernehmen.

Aufgabe: Prüft ob ein Sensor/Aktor durch Eltern-Suppression unterdrückt ist.

```typescript
// Rückgabe-Interface (Vorschlag):
interface AlertSuppressionState {
  isSuppressed: boolean          // eigene alerts_enabled === false
  isInheritedSuppression: boolean // von Device propagate_to_children
  suppressionReason: string | null
  suppressionSource: 'device' | 'self' | null
}
```

Datenquelle: `espApi.getAlertConfig(espId)` für Device-Level, `sensorsApi.getAlertConfig(sensorId)` für Sensor-Level. Beide Responses haben `alert_config: Record<string, unknown>` — `alerts_enabled` und `propagate_to_children` daraus lesen.

**Task 2 — DeviceMiniCard.vue: Suppression-Pill**

`El Frontend/src/components/dashboard/DeviceMiniCard.vue` — bereits auf dem Branch modifiziert (git status). Suppression-Pill hinzufügen: wenn Device `alerts_enabled === false`, kleines Pill mit BellOff-Icon und `--color-text-muted` Farbe.

Pattern: `BaseBadge.vue` mit `variant: 'gray'`, `dot: false` — oder inline span mit `var(--color-status-offl)`.

**Task 3 — AlertConfigSection.vue: Inherited-Suppression-Banner**

In `AlertConfigSection.vue` (Sensor/Aktor-Level) oberhalb des Master-Toggle-Rows: Banner anzeigen wenn `isInheritedSuppression === true`. Text: "Benachrichtigungen durch Gerät unterdrückt (propagate_to_children)".

Styling-Pattern: Analog zu `alert-config__suppression` in `AlertConfigSection.vue` (Zeile 379-387) — `rgba(251, 191, 36, 0.05)` Background + warning border.

**Akzeptanzkriterien:**
- `useAlertSuppression` gibt korrekte `isInheritedSuppression` zurück wenn Device `propagate_to_children === true`
- DeviceMiniCard zeigt BellOff-Pill wenn Device suppressed
- SensorConfigPanel zeigt inherited-Banner wenn via Device suppressed
- `npm run build` exit 0

**Risiko:** `alert_config: Record<string, unknown>` ist schwach typisiert. Composable sollte defensive Zugriffe nutzen: `(config.alerts_enabled as boolean | undefined) !== false`.

---

## AUT-256 — Aktor-Detail Linked Rules prominent

### Existierende Dateien

| Datei | Pfad | Zustand |
|-------|------|---------|
| `LinkedRulesSection.vue` | `El Frontend/src/components/devices/LinkedRulesSection.vue` | Vollständig: zeigt Rules, navigiert zu Rule, Cross-ESP Badge |
| `AccordionSection.vue` | `El Frontend/src/shared/design/primitives/AccordionSection.vue` | `defaultOpen?: boolean` Prop (Zeile 29) |
| `ExecutionHistoryItem` | `El Frontend/src/types/logic.ts` Zeile 195 | Vollständiger Typ mit `triggered_at`, `success`, `rule_name`, etc. |
| `getLastExecutionForActuator()` | `El Frontend/src/shared/stores/logic.store.ts` Zeile 574 | Gibt `ExecutionHistoryItem | null` zurück |
| `getRulesForActuator()` | `El Frontend/src/shared/stores/logic.store.ts` Zeile 558 | Gibt `LogicRule[]` zurück |

### Developer-Handoff AUT-256

**Agent:** `frontend-dev`  
**Scope:** `ActuatorConfigPanel.vue`, `LinkedRulesSection.vue`

**Task 1 — LinkedRulesSection als erstes Akkordeon (expanded default)**

In `ActuatorConfigPanel.vue`: Die `<AccordionSection>` die `<LinkedRulesSection>` enthält, auf `defaultOpen: true` setzen:
```vue
<AccordionSection title="Verknüpfte Regeln" :default-open="true" ...>
  <LinkedRulesSection :esp-id="props.espId" :gpio="props.gpio" device-type="actuator" />
</AccordionSection>
```
Falls `LinkedRulesSection` noch nicht in einem Akkordeon ist: AccordionSection-Wrapper hinzufügen (Pattern: `SensorConfigPanel.vue` Akkordeon-Struktur, Zeile ~120ff).

**Task 2 — Manuelle-Schaltung-Banner in LinkedRulesSection.vue**

Prüfen ob der Aktor via manuellem Command (nicht via Regel) zuletzt geschaltet wurde. Datenquelle: `logicStore.getLastExecutionForActuator(espId, gpio)` — wenn `null`, wurde manuell geschaltet. Banner anzeigen: "Letzter Befehl: Manuell (keine Regel aktiv)".

**Task 3 — Konflikt-Warnung Pill bei 2+ aktiven Regeln**

`logicStore.getRulesForActuator(espId, gpio)` gibt alle Rules zurück. Wenn `.filter(r => r.enabled).length >= 2`: Pill mit `StatusBadge` Level `'warning'` und Text "Regelkonflikt möglich" anzeigen.

Import: `StatusBadge` aus `@/components/base/StatusBadge.vue` (bereits genutzt in anderen Teilen der Codebase).

**Task 4 — Last-Action-Timeline (ExecutionHistory)**

In `LinkedRulesSection.vue`: Neue Section unter der Rules-Liste. Nutzt `logicStore.executionHistory` (gefiltert via `logicStore.getLastExecutionForActuator(espId, gpio)`).

Zeigt maximal 5 Einträge: `triggered_at` via `<DateDisplay :date="item.triggered_at" />`, `rule_name`, `success`-Icon (CheckCircle2 / XCircle — bereits in `StatusBadge.vue` importiert), `execution_time_ms`.

**ExecutionHistoryItem-Felder die genutzt werden können:**
- `triggered_at: string` — Zeitstempel
- `rule_name: string` — Name der Regel
- `success: boolean` — Ergebnis
- `execution_time_ms: number` — Laufzeit
- `lifecycle_state?: RuleLifecycleState` — für detailliertere Anzeige

**Akzeptanzkriterien:**
- "Verknüpfte Regeln" ist das erste Akkordeon in ActuatorConfigPanel, default expanded
- Konflikt-Pill erscheint bei >= 2 enabled Rules
- Timeline zeigt letzte 5 Executions mit DateDisplay und StatusBadge
- `logicStore.loadExecutionHistory()` wird in `onMounted` aufgerufen wenn `executionHistory.length === 0`
- `npm run build` exit 0

**Risiko:** `getLastExecutionForActuator()` filtert `executionHistory.value` (max 50 Einträge, Zeile 685). Falls History leer: `loadExecutionHistory()` triggern. Pattern: Analog zu `LinkedRulesSection.vue` Zeile 37-40 (`if (logicStore.rules.length === 0) logicStore.fetchRules()`).

---

## Implementierungsreihenfolge (Abhängigkeitsgraph)

```
AUT-254 (TopBar — fast done, verify)
  └── unabhängig

AUT-250 (tokens.css fix + Migration)
  └── Voraussetzung für AUT-255 (StatusBadge in Suppression-Pill)
  └── Voraussetzung für AUT-256 (StatusBadge Konflikt-Pill)

AUT-253 (FAB reduzieren)
  └── unabhängig, schnellster Win

AUT-251 (Zone/Subzone UI)
  └── unabhängig von 250/255/256

AUT-255 (Suppression-Kaskade)
  └── benötigt AUT-250 (StatusBadge verfügbar — bereits vorhanden)
  └── benötigt: useAlertSuppression.ts neu

AUT-256 (Linked Rules prominent)
  └── benötigt AUT-250 (StatusBadge für Konflikt-Pill — bereits vorhanden)
  └── alle Store-Getter bereits vorhanden
```

**Empfohlene Reihenfolge:**
1. AUT-254 (Verifikation/kleiner Fix — 30 min)
2. AUT-253 (FAB — klare Scope, 1-2h)
3. AUT-250 (token-fix + Migration — 2-3h)
4. AUT-251 (UI-Umbau — 2-3h, parallel zu 250 möglich)
5. AUT-255 (Composable + UI — 3-4h, nach 250)
6. AUT-256 (LinkedRules prominent — 3-4h, nach 250)

---

## Pattern-Referenzen für frontend-dev

| Pattern | Datei | Zeile | Nutzen für |
|---------|-------|-------|------------|
| AccordionSection `defaultOpen` | `El Frontend/src/shared/design/primitives/AccordionSection.vue` | 29, 45 | AUT-256 Task 1 |
| BaseBadge `variant` + `dot` | `El Frontend/src/shared/design/primitives/BaseBadge.vue` | 14-47 | AUT-255 Suppression-Pill |
| StatusBadge `level` + `compact` | `El Frontend/src/components/base/StatusBadge.vue` | 7-16 | AUT-255, AUT-256 |
| DateDisplay `format` | `El Frontend/src/components/base/DateDisplay.vue` | 5-10 | AUT-256 Timeline |
| `qualityToStatusLevel()` | `El Frontend/src/utils/formatters.ts` | 797 | AUT-250 Migration |
| `sensorStatusToLevel()` | `El Frontend/src/utils/formatters.ts` | 809 | AUT-250 Migration |
| Composable mit lazy-load | `El Frontend/src/composables/useESPStatus.ts` | — | AUT-255 useAlertSuppression |
| `onMounted` fetch-Guard | `El Frontend/src/components/devices/LinkedRulesSection.vue` | 37-40 | AUT-256 History-Load |
| `import.meta.env.MODE` | `El Frontend/src/components/layout/HeaderDeviceStatus.vue` | 19 | AUT-254 |
| propagate_to_children Toggle-UI | `El Frontend/src/components/devices/DeviceAlertConfigSection.vue` | 36-39, 148-169 | AUT-255 |
| Warning-Banner Styling | `El Frontend/src/components/devices/AlertConfigSection.vue` | 379-387 (CSS) | AUT-255 Banner |

---

## Nicht analysiert

**AUT-252** — Wissensdatenbank-Vernetzung: BLOCKED by AUT-221. Gemäß Auftrag nicht analysiert.
