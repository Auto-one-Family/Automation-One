# Frontend Debug Report

**Erstellt:** 2026-04-06
**Modus:** B (Spezifisch: "Aktor-Karte zeigt `undefined = undefined` statt `sensor_key = value`")
**Quellen:** ActuatorCard.vue, logic.store.ts, types/logic.ts, logic_engine.py (Server), api/v1/logic.py (Server), ActuatorSatellite.vue, ActuatorColumn.vue

---

## 1. Zusammenfassung

Bug vollstaendig lokalisiert. Die Ursache ist ein **fehlender Null-Guard** in
`logic.store.ts` Zeile 436. Der WebSocket-Handler baut `trigger_reason` immer als
Template-String `"${event.trigger.sensor_type} = ${event.trigger.value}"` — ohne zu
pruefen ob diese Felder im `trigger`-Objekt vorhanden sind. Bei **Timer-ausgeloesten
Regeln** (zeitbasierte Steuerung) sendet der Server `trigger: { type: "timer", timestamp, rule_id }` —
kein `sensor_type`, kein `value`. JavaScript wandelt `undefined` in Template-Strings
zu `"undefined"`, der resultierende String `"undefined = undefined"` wird direkt als
`trigger_reason` in die History eingetragen und von `ActuatorCard.vue` als
`(undefined = undefined)` angezeigt.

**Handlungsbedarf: HOCH** — Ein-Zeilen-Fix in `logic.store.ts:436`.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `src/components/devices/ActuatorCard.vue:224-229` | Korrekt | Template rendert `lastExecution.trigger_reason` unveraendert — kein Bug hier |
| `src/shared/stores/logic.store.ts:436` | **FEHLER** | Template-String ohne Null-Guard fuer Timer/Reconnect-Trigger |
| `src/shared/stores/logic.store.ts:27-43` | Mangelhaft | Interface `LogicExecutionEvent.trigger` typisiert alle Felder als required, obwohl Timer-Trigger diese nicht liefert |
| `src/types/logic.ts:169-179` | OK | `ExecutionHistoryItem.trigger_reason: string` korrekt als String definiert |
| `src/components/esp/ActuatorSatellite.vue` | OK | Kein "Zuletzt"-Rendering, kein Bug |
| `src/components/esp/ActuatorColumn.vue` | OK | Kein "Zuletzt"-Rendering, kein Bug |
| Server `logic_engine.py:232-240` | OK | Sensor-Trigger liefert `sensor_type` + `value` |
| Server `logic_engine.py:351-355` | Ursache | Timer-Trigger: nur `type`, `timestamp`, `rule_id` — kein `sensor_type`, kein `value` |
| Server `api/v1/logic.py:655-657` | Nicht betroffen | REST-Pfad formatiert serverseitig, unabhaengig |

---

## 3. Befunde

### 3.1 Haupt-Bug: Fehlender Null-Guard in `handleLogicExecutionEvent` — `logic.store.ts:436`

- **Schwere:** Hoch
- **Detail:** Der WebSocket-Handler erstellt fuer jeden `logic_execution`-Event einen
  `ExecutionHistoryItem`-Eintrag. `trigger_reason` wird immer als
  `"${event.trigger.sensor_type} = ${event.trigger.value}"` gebaut.
  Bei Timer-Triggern haben beide Felder den Wert `undefined` →
  String wird zu `"undefined = undefined"`.
- **Evidenz:**

  `logic.store.ts:436`:
  ```typescript
  trigger_reason: `${event.trigger.sensor_type} = ${event.trigger.value}`,
  ```

  `logic_engine.py:351-355` (Timer-Trigger-Pfad, kein `sensor_type`/`value`):
  ```python
  trigger_data = {
      "type": "timer",
      "timestamp": int(time.time()),
      "rule_id": str(rule.id),
  }
  ```

  `logic_engine.py:232-240` (Sensor-Trigger-Pfad, korrekt):
  ```python
  trigger_data = {
      "esp_id": esp_id,
      "gpio": gpio,
      "sensor_type": sensor_type,
      "value": value,
      "timestamp": int(time.time()),
      ...
  }
  ```

### 3.2 Typisierungsfehler: Interface `LogicExecutionEvent` — `logic.store.ts:27-43`

- **Schwere:** Mittel (kein Runtime-Fehler, aber falsche Sicherheitsgarantie durch TypeScript)
- **Detail:** Das Interface definiert `trigger.sensor_type: string` und `trigger.value: number`
  als required (kein `?`). Das gibt dem Entwickler eine falsche Sicherheit — TypeScript
  zeigt keinen Fehler an der Verwendung obwohl der Server diese Felder bei Timer-Triggern
  nicht sendet.

### 3.3 Warum "GPIO 25" korrekt, "Befeuchter" kaputt

- **Schwere:** Erklaerend
- **Detail:** "GPIO 25" wird von einer Sensor-Schwellwert-Regel gesteuert. Der Server
  sendet einen Sensor-Trigger-Event mit `sensor_type="sht31_humidity"` und `value=48.x`.
  Der "Befeuchter" hingegen wird per zeitbasierter Regel gesteuert. Der letzte
  `logic_execution`-WebSocket-Event fuer den Befeuchter kam ueber den Timer-Pfad →
  kein `sensor_type`, kein `value` → `"undefined = undefined"`.

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| `ActuatorSatellite.vue` gelesen | Kein "Zuletzt"-Rendering, kein `last_trigger_key`-Property — nicht der Bug |
| `ActuatorColumn.vue` gelesen | Kein Bug, rendert nur `ActuatorSatellite` |
| `logic.store.ts` vollstaendig gelesen | Bug in Zeile 436 bestaetigt |
| Server `logic_engine.py` Timer-Trigger gelesen | Bestaetigt: kein `sensor_type`/`value` im Timer-Pfad |
| Server REST-Pfad `api/v1/logic.py` gelesen | Eigene Formatierung, nicht betroffen |

---

## 5. Blind-Spot-Fragen (an User)

1. Wird die Regel fuer "Befeuchter" per Zeitfenster/Timer ausgeloest oder per
   Sensor-Schwellwert? Wenn Timer → Root Cause bestaetigt.
2. Soll bei Timer-Triggern ein spezifischer Text erscheinen (z.B. "Zeitbasierter Trigger")
   oder gar keine Klammer-Anzeige?

---

## 6. Konkreter Fix (Code-Diff)

**Datei:** `El Frontend/src/shared/stores/logic.store.ts`

### Fix 1: Interface korrigieren (ca. Zeile 27-43)

```diff
 interface LogicExecutionEvent {
   rule_id: string
   rule_name: string
   trigger: {
-    esp_id: string
-    gpio: number
-    sensor_type: string
-    value: number
+    type?: string
+    esp_id?: string
+    gpio?: number
+    sensor_type?: string
+    value?: number
+    rule_id?: string
   }
   action: {
     esp_id: string
     gpio: number
     command: string
   }
   success: boolean
   timestamp: number
 }
```

### Fix 2: Null-Guard in trigger_reason (Zeile 436)

```diff
-        trigger_reason: `${event.trigger.sensor_type} = ${event.trigger.value}`,
+        trigger_reason: event.trigger.sensor_type != null
+          ? `${event.trigger.sensor_type} = ${event.trigger.value}`
+          : event.trigger.type === 'timer'
+            ? 'Zeitbasierter Trigger'
+            : event.trigger.type ?? 'Unbekannter Trigger',
```

**Resultat nach Fix:**
- Sensor-Trigger: `(sht31_humidity = 48.2)` — unveraendert korrekt
- Timer-Trigger: `(Zeitbasierter Trigger)` — statt `(undefined = undefined)`
- Reconnect-Trigger (hat `sensor_type` wenn Cache vorhanden): `(sht31_humidity = 48.2)` — korrekt

---

## 7. Bewertung & Empfehlung

- **Root Cause:** `logic.store.ts:436` — Template-String ohne Null-Guard fuer
  Timer- und Reconnect-Trigger-Events.
- **Root Cause Server:** `logic_engine.py:351-355` sendet Timer-Trigger ohne `sensor_type`/`value` —
  das ist **korrekt und nicht zu aendern** (Timer-Trigger haben keine Sensor-Daten).
  Die Robustheit muss im Frontend liegen.
- **Naechste Schritte:**
  1. Fix 1 + Fix 2 in `El Frontend/src/shared/stores/logic.store.ts` anwenden
  2. `npm run build` zur Verifikation (Exit 0 erwartet, keine neuen TS-Fehler)
- **Seiteneffekte:** Keine. Der REST-History-Pfad (`loadExecutionHistory`) ist nicht
  betroffen — der Server formatiert dort serverseitig.
- **Lastintensive Ops:** Soll ich `vue-tsc --noEmit` ausfuehren um zu pruefen ob der
  falsch typisierte `trigger`-Interface weitere TS-Fehler verursacht?
  (`docker compose exec el-frontend npx vue-tsc --noEmit`, ca. 1-3 Minuten)
