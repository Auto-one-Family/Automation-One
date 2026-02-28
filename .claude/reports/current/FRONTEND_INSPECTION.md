# Frontend Inspection Report — Logic Engine (Phase 2)

**Datum:** 2026-02-28T09:30:00Z
**Systemstatus:** degraded (Logic Engine timer loop crasht kontinuierlich)
**Frontend-URL:** http://localhost:5173
**Login-Status:** Erfolgreich (API verifiziert, admin/Admin123#)
**Port-Korrektur:** Auftrag nannte Port 3000 (= Grafana), Frontend laeuft auf Port 5173

---

## Systemstatus-Zusammenfassung

| Service          | Status           | Port |
|------------------|------------------|------|
| el-frontend      | healthy (19 min) | 5173 |
| el-servador      | healthy (2 min)  | 8000 |
| postgres         | healthy          | 5432 |
| mqtt-broker      | healthy          | 1883 |
| loki             | healthy          | 3100 |
| grafana          | healthy          | 3000 |
| prometheus       | healthy          | 9090 |

**Critical Issue:** `el-servador` Logic Engine crashed ca. alle 25 Sekunden mit `AttributeError: 'list' object has no attribute 'get'` (timer-triggered rules loop).

---

## Browser-Befunde

### DOM-Zustand (Source-Code-Analyse, kein direkter Browser-Zugang moeglich)

Die LogicView (`/logic`) hat zwei Haupt-Zustaende:

1. **Empty State** (kein Rule ausgewaehlt): Zeigt eine animierte Illustration + "Neue Regel erstellen"-CTA + Quick-List der vorhandenen Regeln
2. **Editor State** (Rule ausgewaehlt): 3-Panel-Layout: `RuleNodePalette` | `RuleFlowEditor` (Vue Flow) | `RuleConfigPanel`

### Templates-Check: KRITISCH — Templates werden NICHT angezeigt

**Befund:** Die 6 Templates aus `rule-templates.ts` sind in der `LogicView.vue` weder importiert noch eingebunden.

- `RuleTemplateCard.vue` existiert als Komponente
- `rule-templates.ts` definiert 6 Templates korrekt
- In `LogicView.vue` gibt es **keinen einzigen Import** von `ruleTemplates` oder `RuleTemplateCard`
- Der Empty State zeigt stattdessen nur: animierte Illustration + CTA + Quick-List bestehender Regeln

**Ergebnis: 0 von 6 Templates sichtbar.**

### Rules-Check: KRITISCH — 8 API-Regeln werden NICHT geladen

**Befund:** Die API liefert 8 Regeln, das Frontend zeigt 0.

Root Cause: **API-Response-Wrapper-Mismatch** im Logic Store.

API-Response von `GET /api/v1/logic/rules`:
```json
{
  "success": true,
  "message": null,
  "data": [...8 rules...],
  "pagination": { "total_items": 8, ... }
}
```

Frontend-Code in `logic.store.ts` (Zeile 125):
```typescript
const response = await logicApi.getRules(params)
rules.value = response.items || []  // BUG: response.items ist undefined!
```

Der API-Client in `logic.ts` gibt den rohen Axios-Response-Body zurueck:
```typescript
async getRules(): Promise<LogicRulesResponse> {
  const response = await api.get<LogicRulesResponse>('/logic/rules', { params })
  return response.data  // = { success, message, data, pagination }
}
```

Der Type `LogicRulesResponse` erwartet:
```typescript
export interface LogicRulesResponse {
  items: LogicRule[]  // FALSCH: API hat kein "items"-Feld!
  total: number
  page: number
  page_size: number
}
```

**Korrekte Felder waeren:** `data` (Array), `pagination.total_items`, `pagination.page`, `pagination.page_size`.

---

## Fehler / Bugs / Warnungen

| # | Severity | Schicht | Beschreibung | Datei | Zeile |
|---|----------|---------|--------------|-------|-------|
| 1 | CRITICAL | Frontend Store | `response.items` ist `undefined` → `rules.value = []` | `logic.store.ts` | 125 |
| 2 | CRITICAL | Frontend Types | `LogicRulesResponse` hat falsches Schema (`items` statt `data`) | `types/logic.ts` | 112-117 |
| 3 | CRITICAL | Backend | Logic Engine timer loop crasht alle ~25s: `'list' object has no attribute 'get'` | `logic_engine.py` | 403 |
| 4 | HIGH | Frontend | Templates (`ruleTemplates`) nicht in LogicView eingebunden, werden nie angezeigt | `LogicView.vue` | — |
| 5 | HIGH | Frontend API | `toggleRule` sendet keinen Body — API erwartet `{"enabled": bool}` | `logic.ts` | 112-115 |
| 6 | HIGH | Frontend Store | `testRule` liest `response.conditions_result`, API gibt `condition_results` (plural) | `logic.store.ts` | 191 |
| 7 | MEDIUM | Frontend API | `createRule` Response ist direkt `LogicRule`, kein Wrapper — korrekt, aber inkonsistent |  `logic.ts` | 89-92 |

---

## API-Response-Mismatch-Matrix (vollstaendig)

| Endpoint | Tatsaechliche Antwort | Frontend-Erwartung | Match? |
|----------|----------------------|-------------------|--------|
| `GET /logic/rules` | `{ success, message, data: [...], pagination }` | `{ items: [...], total, page, page_size }` | **NEIN** |
| `GET /logic/rules/{id}` | Direkt `LogicRule` Objekt | Direkt `LogicRule` Objekt | JA |
| `POST /logic/rules` | Direkt `LogicRule` Objekt | Direkt `LogicRule` Objekt | JA |
| `PATCH /logic/rules/{id}` | (nicht getestet, Pattern wie POST) | Direkt `LogicRule` | vermutlich JA |
| `POST /logic/rules/{id}/toggle` | `{ success, message, rule_id, rule_name, enabled, previous_state }` | `{ success, message, rule_id, enabled }` | **TEILWEISE** (fehlende Body-Pflicht) |
| `POST /logic/rules/{id}/test` | `{ success, rule_id, rule_name, would_trigger, condition_results, action_results, dry_run }` | `{ conditions_result: boolean, ... }` | **NEIN** |

### Toggle-Endpoint Bug (Bug #5)

Frontend sendet:
```typescript
const response = await api.post<ToggleResponse>(`/logic/rules/${ruleId}/toggle`)
// Kein Body!
```

API erwartet zwingend `{"enabled": bool}` im Body → gibt 422 Unprocessable Entity.

### Test-Endpoint Bug (Bug #6)

API gibt `condition_results` (Array), Frontend liest `conditions_result` (boolean):
```typescript
// Frontend (logic.store.ts:191):
return response.conditions_result  // undefined!

// API gibt:
// { would_trigger: false, condition_results: [{...}], ... }
```

---

## Cross-Layer-Befunde

| # | Frontend-Symptom | Server/DB-Ursache | Korrelation |
|---|-----------------|-------------------|-------------|
| 1 | Rules nicht sichtbar im UI (logicStore.rules = []) | `response.items` ist undefined wegen falschen Type | Frontend-Only Bug |
| 2 | Toggle-Button funktioniert nicht (422 Error) | API erwartet Body `{"enabled": bool}` | Frontend sendet keinen Body |
| 3 | Test-Funktion gibt falsches Ergebnis | `conditions_result` vs `condition_results` Feld-Name | Frontend-Only Bug |
| 4 | Logic Engine hat keine Wirkung (keine Aktionen ausgefuehrt) | Backend crasht in `_check_conditions_modular` (Zeile 403) | Backend Bug, unabhaengig von Frontend |

---

## Backend Bug Detail: Logic Engine Timer Loop

**Error:** `AttributeError: 'list' object has no attribute 'get'`
**Traceback:**
```
logic_engine.py:250 evaluate_timer_triggered_rules
  → logic_engine.py:380 _check_conditions
    → logic_engine.py:403 _check_conditions_modular
      → cond_type = conditions.get("type", "unknown")  # conditions ist eine Liste!
```

**Root Cause:** `_check_conditions_modular` erwartet ein einzelnes `dict`, bekommt aber eine `list`. Die Funktion wird mit `rule.conditions` (Liste) aufgerufen, muss aber iterieren und jede Bedingung einzeln verarbeiten.

**Frequenz:** Alle ~25 Sekunden (Timer-Interval des Logic Engines).

Dieser Bug ist vermutlich ein Ueberbleibsel aus dem vorherigen Logic-Engine-Fix (Commit 140b165).

---

## Node-Palette (vollstaendig)

Die `RuleNodePalette` ist korrekt implementiert mit 3 Kategorien:

### Bedingungen (9 Items)
- Sensor (DS18B20, Temperatur)
- Feuchtigkeit (SHT31)
- pH-Wert (pH, between-Operator)
- Licht (light)
- CO2
- Bodenfeuchte (moisture)
- EC-Wert
- Fuellstand (level)
- Zeitfenster

### Logik (2 Items)
- UND (AND Gate)
- ODER (OR Gate)

### Aktionen (3 Items)
- Aktor steuern (ON/OFF/PWM/TOGGLE)
- Benachrichtigung (websocket/email/webhook)
- Verzoegerung (Sekunden)

**Gesamt: 14 Palette-Items in 3 Kategorien.** Korrekt, vollstaendig.

---

## RuleConfigPanel — Editierbare Felder

### Sensor-Node
- ESP-Geraet (Dropdown aus vorhandenen Devices)
- Sensor (device-aware, autofill GPIO+Typ wenn ESP bekannt)
- Fallback: manuelle GPIO+Sensor-Typ Eingabe
- Operator (>, >=, <, <=, ==, !=, between)
- Schwellwert / Min+Max (bei between)

### Zeit-Node
- Von (Stunde 0-23)
- Bis (Stunde 0-23)
- Wochentage (Mo-So Toggle-Buttons)

### Logik-Node
- Verknuepfung: UND / ODER (Toggle-Group)

### Aktor-Node
- ESP-Geraet (device-aware)
- Aktor (GPIO auto-fill)
- Befehl (ON/OFF/PWM/TOGGLE)
- PWM-Wert 0-100% (Slider, nur bei PWM)
- Auto-Abschaltung (Sekunden)

### Benachrichtigung-Node
- Kanal (WebSocket/E-Mail/Webhook)
- Ziel (Freitext)
- Nachricht (Textarea, mit {value}/{sensor_type}/{esp_id}/{timestamp} Variablen)

### Verzoegerung-Node
- Wartezeit (Sekunden, 1-86400)

---

## Connection-Validation im Editor

Implementierte Regeln in `logic.store.ts`:
- Selbst-Schleifen: VERBOTEN
- Aktor/Notification → irgendwas: VERBOTEN (terminal Nodes)
- Sensor/Zeit → Aktor/Notification direkt: VERBOTEN (muss durch Logik-Node)
- Alles andere: ERLAUBT

---

## Empfehlungen (priorisiert)

### Prio 1 — SOFORT (Frontend zeigt 0 Regeln)

**Fix 1a: `types/logic.ts` — LogicRulesResponse anpassen**
```typescript
// VORHER (falsch):
export interface LogicRulesResponse {
  items: LogicRule[]
  total: number
  page: number
  page_size: number
}

// NACHHER (korrekt):
export interface LogicRulesResponse {
  success: boolean
  message: string | null
  data: LogicRule[]
  pagination: {
    page: number
    page_size: number
    total_items: number
    total_pages: number
    has_next: boolean
    has_prev: boolean
  }
}
```

**Fix 1b: `logic.store.ts` Zeile 125 — Feld-Zugriff korrigieren**
```typescript
// VORHER (falsch):
rules.value = response.items || []

// NACHHER (korrekt):
rules.value = response.data || []
```

### Prio 2 — HOCH (Toggle funktioniert nicht)

**Fix 2: `logic.ts` — Toggle-Endpoint mit Body versenden**
```typescript
// VORHER (falsch):
async toggleRule(ruleId: string): Promise<ToggleResponse> {
  const response = await api.post<ToggleResponse>(`/logic/rules/${ruleId}/toggle`)
  return response.data
}

// NACHHER (korrekt):
async toggleRule(ruleId: string, enabled: boolean): Promise<ToggleResponse> {
  const response = await api.post<ToggleResponse>(
    `/logic/rules/${ruleId}/toggle`,
    { enabled }
  )
  return response.data
}
```

Store aufrufen mit:
```typescript
// logic.store.ts:165
const rule = rules.value.find((r) => r.id === ruleId)
const newEnabled = rule ? !rule.enabled : true
const response = await logicApi.toggleRule(ruleId, newEnabled)
```

### Prio 3 — HOCH (Test-Funktion gibt falsches Ergebnis)

**Fix 3: `logic.store.ts` Zeile 191 + `logic.ts` Types**

API gibt zurueck:
```json
{ "would_trigger": false, "condition_results": [...], "dry_run": true }
```

Frontend liest:
```typescript
return response.conditions_result  // undefined
```

Fix in `logic.ts` TestResponse Type und store:
```typescript
// logic.ts:
export interface TestResponse {
  success: boolean
  message: string | null
  rule_id: string
  rule_name: string
  would_trigger: boolean
  condition_results: Array<{...}>
  action_results: unknown[]
  dry_run: boolean
}

// logic.store.ts:191:
return response.would_trigger  // War: conditions_result
```

### Prio 4 — MITTEL (Templates nicht sichtbar)

**Fix 4: Templates in LogicView einbinden**

In `LogicView.vue` Imports ergaenzen:
```typescript
import { ruleTemplates } from '@/config/rule-templates'
import RuleTemplateCard from '@/components/rules/RuleTemplateCard.vue'
```

Im Empty State ein Templates-Grid hinzufuegen (nach dem CTA-Button). Template-Klick soll `startNewRule()` aufrufen und das Template als Ausgangspunkt fuer den Editor nutzen (analog zum vorhandenen `startNewRule`-Flow mit `newRuleName` vorbelegen).

### Prio 5 — BACKEND (Logic Engine Timer Loop)

Der Backend-Bug in `logic_engine.py:403` muss separat behoben werden (Server-Dev-Agent). Die Funktion `_check_conditions_modular` erwartet ein einzelnes `dict`, wird aber mit der gesamten `conditions`-Liste aufgerufen.

---

## Dateien betroffen

| Datei | Aenderung |
|-------|-----------|
| `El Frontend/src/types/logic.ts` | `LogicRulesResponse` Interface korrigieren |
| `El Frontend/src/shared/stores/logic.store.ts` | `response.items` → `response.data`, `conditions_result` → `would_trigger` |
| `El Frontend/src/api/logic.ts` | `toggleRule` Body hinzufuegen, `TestResponse` Type korrigieren |
| `El Frontend/src/views/LogicView.vue` | Templates importieren und im Empty State einbinden |
| `El Servador/god_kaiser_server/src/services/logic_engine.py` | `_check_conditions_modular` Zeile 403 iteriert statt `.get()` aufzurufen |
