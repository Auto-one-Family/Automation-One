# SI-4 ActuatorsView — Aktor-Card-Zustands-Konsolidierung

> **Issue:** AUT-241
> **Parent:** AUT-230 (Frontend-Konsolidierung 2026, Strang 4 von 8)
> **Datum:** 2026-05-06
> **Modus:** Read-only Evidenz-Analyse — keine Implementierung

---

## Executive Summary

Das Aktor-System ist funktional solide, hat aber vier konkrete Konsolidierungsbedarfe:

1. **F-V4-02 (aktuell gepatcht, strukturell riskant):** `getActuatorTypeInfo()` kompensiert den `digital`/`relay`-Mismatch per `hardware_type`-Fallback. Die Wurzel (Server schreibt `actuator_type="digital"` in `actuator_states`) bleibt offen.
2. **PWM-Wert-Interpretation:** `pwm_value` enthält laut Server-Kommentar typisch 8-Bit-Werte (0–255), `ActuatorCard` rechnet aber `val * 100` als Prozent — korrekt nur wenn Wert 0–1. Datenpfad ist nicht normalisiert.
3. **Pending-Timeout-Dualismus:** `ACTUATOR_COMMAND_TIMEOUT_MS = 15_000` in zwei Komponenten, `ACTUATOR_RESPONSE_TIMEOUT_MS = 30_000` im Store — drei Konstanten, keine gemeinsame Quelle.
4. **Emergency-Stop:** Confirmation-Dialog vorhanden, Reason hardcoded, kein Audit-Log-Linkout in der UI.

---

## 1. State-Matrix

### Valide States im System

| State (WS/MQTT) | Herkunft | Frontend-Normalisierung |
|---|---|---|
| `"on"` | Server WS `actuator_status` | `normalizeActuatorState()` → `state = true` |
| `"off"` | Server WS `actuator_status` | `normalizeActuatorState()` → `state = false` |
| `"pwm"` | Server WS `actuator_status` | `normalizeActuatorState()` → `state = true` (gleiche Boolean-Logik) |
| `"error"` | Nur Server-Validierung (`_validate_payload`) | Nicht separat gemappt, landet in `state = false` |
| `"unknown"` | Server-Fallback bei fehlendem `actuator_config` | Nicht separat gemappt, landet in `state = false` |
| `emergency_stopped` | `actuator_alert` WS Event (`alert_type = emergency_stop`) | `actuator.emergency_stopped = true` (eigenes Flag) |

**Belege:**
- `actuator_handler.py:412` (`_validate_payload`): valide States = `["on", "off", "pwm", "error", "unknown"]`
- `actuator.store.ts:733-734`: `state = normalizedState === 'on' || normalizedState === 'pwm'`
- `actuator.store.ts:658-688`: `handleActuatorAlert()` setzt `emergency_stopped = true`

### State-to-Badge-Mapping in ActuatorCard

| Zustand | Rendernde Komponente | Badge-Element | Manual-Override-Lock | Online-Guard |
|---|---|---|---|---|
| `state = true` (on/pwm) | `ActuatorCard.vue:286` | `actuator-card__state-primary--on` ("Ein") | Button deaktiviert wenn `emergency_stopped` | Button deaktiviert wenn `isEspOffline` |
| `state = false` (off/error/unknown) | `ActuatorCard.vue:286` | `actuator-card__state-primary--off` ("Aus") | Button deaktiviert wenn `emergency_stopped` | Button deaktiviert wenn `isEspOffline` |
| `emergency_stopped = true` | `ActuatorCard.vue:312-313` | `.badge.badge-danger` "Not-Stopp" | Toggle-Button disabled via `:disabled="actuator.emergency_stopped"` | n/a |
| `commandIsPending = true` | `ActuatorCard.vue:315-316` | `.actuator-card__badge--pending` "Wird ausgeführt..." | Toggle-Button disabled via `:disabled="commandIsPending"` | Toggle-Button disabled via `:disabled="isEspOffline"` |
| `isEspOffline = true` | `ActuatorCard.vue:320-322` | `.actuator-card__badge--offline` "ESP offline" | Toggle-Button disabled via `:disabled="isEspOffline"` | Originiert aus diesem Guard |
| `isStale = true` | `ActuatorCard.vue:323-328` | `.actuator-card__badge--stale` (Zeitstempel) | Toggle-Button disabled via `:disabled="isStale"` | — |
| `showWarnBadge = true` | `ActuatorCard.vue:318` | `StatusBadge level="warning"` "Keine Bestätigung" | Kein Button-Lock | — |

**Kein einheitlicher State-to-Badge-Enum.** Die Badges sind über Template-Direktiven verstreut. `"error"` und `"unknown"` aus dem Server-Payload landen ohne eigenen Badge-Typ in `state = false`.

### Kanonischer Konsolidierungsvorschlag

Eine Funktion `resolveActuatorDisplayState()` wäre der richtige Ansatz:

```
type ActuatorDisplayState = 'on' | 'off' | 'pwm' | 'pending' | 'emergency' | 'offline' | 'stale' | 'warn' | 'unknown'
```

Sie würde aus `(state: boolean, emergency_stopped: boolean, commandIsPending: boolean, isEspOffline: boolean, isStale: boolean, showWarnBadge: boolean, rawState?: string)` einen einzigen DisplayState ableiten — mit klarer Prioritätsordnung: `emergency > offline > pending > warn > stale > on/off/pwm > unknown`.

---

## 2. F-V4-02 Root-Cause-Analyse

### Problem

`actuator_configs.actuator_type` = `"digital"` (Server-normalisiert)
`actuator_states.actuator_type` = `"digital"` (aus Handler übernommen)

ESP32 sendet `"relay"` oder `"pump"` — der Server normalisiert auf `"digital"`.

### Wo wird `actuator_type` in `actuator_states` geschrieben?

**Server-Seite:**
- `actuator_handler.py:130-138`: Handler priorisiert `actuator_config.actuator_type` (= `"digital"`) als Quelle für `actuator_type`.
- `actuator_handler.py:140-149`: `hardware_type` wird auf dem Config-Objekt aktualisiert, wenn der ESP32 einen anderen Typ meldet.
- WS-Broadcast (`actuator_handler.py:290-310`): sendet `actuator_type` (normalisiert) + `hardware_type` (ESP32-original) getrennt.

**Frontend-Store:**
- `actuator.store.ts:740-742`: `if (data.hardware_type !== undefined) actuator.hardware_type = data.hardware_type` — Store speichert `hardware_type` aus dem WS-Event.

**`getActuatorTypeInfo()` (labels.ts:99-117):**
- Nimmt `hardwareType ?? type` als Lookup-Key.
- Wenn `hardwareType = "relay"` → Icon `ToggleRight`, Label `Relais`.
- Wenn `hardwareType = null` und `type = "digital"` → Icon `ToggleRight`, Label `"Digital"`.

**Wo liest ActuatorCard?**
- `ActuatorCard.vue:95`: `getActuatorTypeInfo(props.actuator.actuator_type, props.actuator.hardware_type)`
- `ActuatorSatellite.vue:93`: identisch — `getActuatorTypeInfo(props.actuatorType, props.hardwareType)`

### Root Cause

Der Mismatch tritt auf, wenn `hardware_type` in der DB `null` ist (Altdaten vor der Stufe-2-Migration) und der ESP noch kein neues Status-Event gesendet hat. In diesem Fall ist `actuator_type = "digital"` und `hardware_type = null` → Icon fallback `ToggleRight`, Label `"Digital"` statt `"Relais"`.

Der aktuelle Workaround in `actuator_handler.py:140-149` behebt das Problem für neue Status-Events. Für Geräte, die seit der Migration nicht online waren, bleibt das Problem bestehen bis zum nächsten Status-Event.

### Kanonische Lösung

**`ActuatorCard` soll immer aus `actuator_configs.actuator_type` + `hardware_type` lesen** (beide bereits im `ActuatorWithContext`-Typ von `useZoneGrouping.ts:52,54`). Das ist der aktuelle Stand.

Das verbleibende Risiko: `hardware_type = null` für Altdaten. Eine Migration, die `hardware_type` aus dem DB-Namen oder einem einmaligen Config-Pass befüllt, würde das schliessen.

**Nicht empfohlen:** `ActuatorCard` aus `actuator_states.actuator_type` zu lesen, da dieser Wert ebenfalls server-normalisiert ist.

---

## 3. Online-Guard UI-Inventar

### Error-Code 5414 im Frontend

`5414` taucht in keiner Frontend-Datei auf (`grep`-Ergebnis: keine Treffer in `El Frontend/src`).

Der Server wirft `DeviceOfflineError` mit `numeric_code=5414` und HTTP 409 (`exceptions.py:401-413`). Das Frontend verarbeitet 409 generisch in `esp.ts:1920-1923`:

```
uiError.status === 409
  ? `Befehl nicht ausgeführt: Gerät ist offline oder aktuell blockiert.`
  : formatUiApiError(uiError)
```

Error-Code `5414` wird nicht ausgelesen, die Fehlermeldung ist statisch — korrekt für den User, aber kein typspezifisches Handling.

### Online-Status-Check in ActuatorCard

**`isEspOffline` (ActuatorCard.vue:81-83):**
```
const isEspOffline = computed(() =>
  !!props.actuator.esp_state && props.actuator.esp_state !== 'OPERATIONAL'
)
```

Abhängig von `props.actuator.esp_state` aus `ActuatorWithContext`. Nutzt **nicht** `useESPStatus()` — arbeitet stattdessen direkt gegen `esp_state`. Das ist eine abweichende Quelle gegenüber `useESPStatus`, die `device.status` + `device.connected` + Heartbeat kombiniert.

**`isStale` (ActuatorCard.vue:86-90):**
Nutzt `props.actuator.last_seen` mit `ZONE_STALE_THRESHOLD_MS`. Wert kommt aus `formatters.ts`.

**ActuatorCardWidget (Dashboard):**
```
const isEspOffline = computed(() => espDevice.value?.status === 'offline')
```
Drittes Muster — liest `device.status` direkt.

### Resultat: drei inkonsistente Offline-Erkennungsmuster

| Komponente | Methode | Quelle |
|---|---|---|
| `ActuatorCard.vue` | `esp_state !== 'OPERATIONAL'` | `ActuatorWithContext.esp_state` |
| `ActuatorCardWidget.vue` | `device.status === 'offline'` | `ESPDevice.status` |
| `useESPStatus.ts` | Prioritäts-Kette (status + connected + heartbeat-age) | `ESPDevice` vollständig |

**Toggle-Button-Deaktivierung bei offline:** Ja, in beiden Komponenten implementiert via `:disabled="isEspOffline"`.

**Warnung beim Aktor:** `ActuatorCard.vue:320-322` zeigt Badge "ESP offline" + `WifiOff`-Icon. `ActuatorCardWidget.vue:155-156` zeigt Status-Badge "ESP offline". Kein dediziertes Warning-Modal.

---

## 4. Emergency-Stop UI-Inventar

**Datei:** `El Frontend/src/components/safety/EmergencyStopButton.vue`

### Verwendungsstellen

| Datei | Kontext |
|---|---|
| `shared/design/layout/TopBar.vue:211` | Globale TopBar (immer sichtbar) |
| `views/SensorsView.vue:419` | Inventory-Tab Header |

### Confirmation-Dialog

Vorhanden (EmergencyStopButton.vue:80-125). Teleport zu `body`. Keyboard-Escape schliesst Dialog. Zwei Aktionen: "Abbrechen" und "STOPP AUSFÜHREN".

### Reason-Eingabe

Nicht implementiert. Reason ist hardcoded in der `handleEmergencyStop`-Funktion:

```
await espStore.emergencyStopAll('Manueller Notfall-Stopp über UI')
```

Die Server-API `EmergencyStopRequest` erwartet `reason: str` als required Field (schemas/actuator.py:576-577). Der String `'Manueller Notfall-Stopp über UI'` ist der einzige Wert der je gesendet wird — keine User-Eingabe möglich.

### Audit-Log-Linkout

Nicht implementiert. Nach erfolgreichem Stop zeigt `espStore.emergencyStopAll()` einen Toast (esp.ts:1936-1939) mit Anzahl gestoppter Aktoren. Kein Link zu einem Audit-Log oder History-View.

### Safety-Token-Nutzung (AUT-198)

Kein Hinweis auf Safety-Tokens in `EmergencyStopButton.vue`. Der Stop geht direkt über `espStore.emergencyStopAll()` ohne Token-Validierung im Frontend.

### Clear-Emergency

Implementiert. `handleClearEmergency()` ruft `espStore.clearEmergencyAll()` auf. Gleicher Dialog, anderer Titel und Button-Text.

### Befund-Zusammenfassung

| Feature | Status |
|---|---|
| Confirmation-Dialog | Implementiert |
| Reason-Eingabe | Fehlt — hardcoded String |
| Audit-Log-Linkout | Fehlt |
| Safety-Token (AUT-198) | Fehlt |
| Clear-Emergency | Implementiert |
| Keyboard-Accessibility | Implementiert (ESC) |

---

## 5. PWM-Anzeige-Befund

### Datenpfad

1. ESP32 sendet `"value": 255` (8-Bit, 0–255) im MQTT-Payload.
2. `actuator_handler.py:295-299` kommentiert: "ESP sendet typisch 8-Bit-PWM 0–255; 0–1 Duty nur bei normalisierten Pfaden."
3. Server speichert den Wert in `actuator_states.current_value` als `float`.
4. WS-Broadcast sendet `"value": value` unverändert.
5. `actuator.store.ts:736`: `actuator.pwm_value = data.value` — kein Normalisierungsschritt.

### Anzeige in ActuatorCard

`ActuatorCard.vue:137-142`:
```
const pwmPercent = computed(() => {
  if (props.actuator.actuator_type !== 'pwm' && props.actuator.actuator_type !== 'fan') return null
  const val = props.actuator.pwm_value
  if (val != null && val > 0) return `${Math.round(val * 100)}%`
  return null
})
```

**Problem:** `val * 100` ist korrekt für Werte 0–1 (z.B. `0.75 * 100 = 75%`), aber falsch für 8-Bit-Werte (z.B. `128 * 100 = 12800%`). Der Kommentar im Server-Handler legt nahe, dass der tatsächliche Wert je nach Pfad entweder 0–1 oder 0–255 sein kann.

### PWM-Filter in Badges

`ActuatorCard.vue:138`: PWM-Badge wird nur angezeigt wenn `actuator_type === 'pwm'` oder `'fan'`. Da `actuator_type` oft `'digital'` ist (server-normalisiert), wird der PWM-Badge für viele PWM-Aktoren nie angezeigt, auch wenn sie einen gültigen `pwm_value` haben.

### ActuatorSatellite

`ActuatorSatellite.vue:36`: Props-Definition `pwmValue?: number` mit Kommentar `0-255, if applicable`. Zeigt den Wert direkt (keine Konvertierung ersichtlich in den ersten 100 Zeilen).

### Befund

Zwei offene Fragen:
1. Ist `pwm_value` im Frontend-Store normalisiert (0–1) oder roh (0–255)? Kein einheitlicher Normalisierungsschritt gefunden.
2. `pwmPercent`-Berechnung setzt 0–1-Normalisierung voraus, die der Server-Kommentar nicht garantiert.

---

## 6. Pending-State-Befund (AUT-202)

### Timeout-Konstanten

| Konstante | Wert | Datei | Ebene |
|---|---|---|---|
| `ACTUATOR_COMMAND_TIMEOUT_MS` | 15.000 ms | `ActuatorCard.vue:25` | Komponenten-lokal |
| `ACTUATOR_COMMAND_TIMEOUT_MS` | 15.000 ms | `ActuatorCardWidget.vue:15` | Komponenten-lokal (dupliziert) |
| `ACTUATOR_RESPONSE_TIMEOUT_MS` | 30.000 ms | `actuator.store.ts:178` | Store |

**Dualismus:** Die Komponente hat einen eigenen 15-Sekunden-Timer, der `showWarnBadge = true` setzt und einen Warning-Toast auslöst. Der Store hat einen separaten 30-Sekunden-Timer, der das Intent auf `terminal_timeout` setzt und einen Error-Toast auslöst. Beide laufen parallel wenn ein Befehl gesendet wird.

### Pending-Anzeige-Logik in ActuatorCard

**Während `commandIsPending = true`:**
- Icon ersetzt durch `Loader2`-Spinner (ActuatorCard.vue:280)
- Badge "Wird ausgeführt..." sichtbar (ActuatorCard.vue:315)
- Toggle-Button disabled und zeigt "Wird ausgeführt..." (ActuatorCard.vue:343,347)
- Acknowledgement-Badge ausgeblendet (ActuatorCard.vue:330)

**Nach 15 Sekunden (Komponenten-Timer):**
- `showWarnBadge = true`
- `StatusBadge level="warning"` "Keine Bestätigung" erscheint (ActuatorCard.vue:318)
- Warning-Toast ausgegeben

**Nach 30 Sekunden (Store-Timer):**
- Intent wird `terminal_timeout`
- `commandIsPending = false` (da Intent terminal)
- Error-Toast mit "Timeout" ausgegeben
- Spinner verschwindet, Snapshot wird wiederhergestellt

**Cleanup bei erfolgreichem Terminal:**
- `watch(commandIsPending)` in ActuatorCard.vue:224-241: wenn `pending` von `true` auf `false` wechselt und `terminalOutcome === 'success'`, wird `showWarnBadge = false` gesetzt.

### Befund zu AUT-202

Der 15-Sekunden-Komponenten-Timer ist unabhängig vom Store-Intent und produziert potenziell Doppel-Feedback (Warning-Toast bei 15s + Error-Toast bei 30s). Es fehlt eine gemeinsame Konstante. Die Logik ist in sich konsistent aber nicht DRY.

---

## 7. Follow-up-Vorschläge (priorisiert)

### P1 — Kritisch

**F-V4-02-DB-Fix: `hardware_type`-Migration für Altdaten**
Einmalige Datenbank-Migration, die `hardware_type = NULL` Einträge in `actuator_configs` aus dem Gerätenamen oder einer Config-Heuristik befüllt. Betrifft nur Geräte, die nach der Stufe-2-Migration nicht online waren. Ohne diese Migration zeigen Altgeräte weiterhin das falsche Icon ("Digital" statt gerätespezifisches Icon).
Zuständig: `server-dev` + `db-inspector`.

**PWM-Normalisierungspfad dokumentieren und erzwingen**
Klären ob `actuator_states.current_value` 0–1 oder 0–255 speichert. Wenn 0–255: entweder im Server-Handler normalisieren oder in `ActuatorCard.pwmPercent` mit `val / 255 * 100` rechnen. Aktuell ist das Verhalten undefiniert.
Zuständig: `server-dev` + `frontend-dev`.

### P2 — Hoch

**AUT-202: Pending-Timeout-Konsolidierung**
`ACTUATOR_COMMAND_TIMEOUT_MS` aus `ActuatorCard.vue` und `ActuatorCardWidget.vue` in eine geteilte Konstante (z.B. `actuator.store.ts` oder `constants.ts`) auslagern. Den 15-Sekunden-Warn-Timer auf den Store-Intent stützen statt eigenen `setTimeout` zu führen.
Zuständig: `frontend-dev`.

**Online-Guard-Konsistenz**
`ActuatorCard.vue` (`esp_state !== 'OPERATIONAL'`) und `ActuatorCardWidget.vue` (`device.status === 'offline'`) auf `getESPStatus()` aus `useESPStatus.ts` vereinheitlichen. Vermeidet abweichende Offline-Diagnosen zwischen Dashboard und Monitor.
Zuständig: `frontend-dev`.

**AUT-199-Integration in ActuatorCard**
`useESPStatus` / `espHealth`-Degradierungs-Badges (z.B. "MQTT Circuit Breaker offen") werden aktuell nicht in `ActuatorCard` angezeigt. Ein degradiertes Gerät zeigt weder in Monitor- noch Config-Mode einen Hinweis, obwohl Commands möglicherweise scheitern.
Zuständig: `frontend-dev`.

### P3 — Medium

**Emergency-Stop: Reason-Eingabe**
Freitext-Input im Confirmation-Dialog (max. 200 Zeichen, required). Entspricht dem API-Contract (`EmergencyStopRequest.reason` ist required). Aktuell ist der Reason hardcoded.
Zuständig: `frontend-dev`.

**Emergency-Stop: Audit-Log-Linkout**
Nach erfolgreichem Stop Link zu `/history?type=emergency` oder ähnlichem im Toast oder Dialog. Setzt voraus, dass eine History-View mit Filterung existiert.
Zuständig: `frontend-dev`.

**`resolveActuatorDisplayState()` — Kanonische State-Funktion**
Eine einzige Funktion in `utils/actuatorState.ts` (oder `labels.ts`) die alle Zustandsflags zu einem `ActuatorDisplayState`-Enum zusammenführt. Entfernt die Template-Direktiven-Streuung in `ActuatorCard` und `ActuatorCardWidget`.
Zuständig: `frontend-dev`.

---

## Datei-Referenzen

| Datei | Relevanz |
|---|---|
| `El Frontend/src/components/devices/ActuatorCard.vue` | Hauptkomponente, alle 6 State-Badges |
| `El Frontend/src/components/dashboard-widgets/ActuatorCardWidget.vue` | Dashboard-Variante, duplizierte Timeout-Konstante |
| `El Frontend/src/components/esp/ActuatorSatellite.vue` | L2/Orbital-Ansicht, PWM-Rohwert-Anzeige |
| `El Frontend/src/components/safety/EmergencyStopButton.vue` | Emergency-Stop UI, hardcoded Reason |
| `El Frontend/src/shared/stores/actuator.store.ts` | Intent-System, 30s-Timeout, `normalizeActuatorState()` |
| `El Frontend/src/utils/labels.ts` | `getActuatorTypeInfo()` mit `hardware_type`-Fallback |
| `El Frontend/src/domain/esp/espHealth.ts` | `useESPStatus`, `getESPStatus()` — nicht in ActuatorCard genutzt |
| `El Frontend/src/composables/useESPStatus.ts` | `isOnline`, Online-Guard-Composable |
| `El Servador/god_kaiser_server/src/mqtt/handlers/actuator_handler.py` | `actuator_type`-Normalisierung, `hardware_type`-Update, WS-Broadcast |
| `El Servador/god_kaiser_server/src/schemas/actuator.py` | `ACTUATOR_TYPE_MAPPING`, `EmergencyStopRequest` |
| `El Servador/god_kaiser_server/src/core/exceptions.py:401-413` | `DeviceOfflineError`, HTTP 409, `numeric_code=5414` |
| `El Servador/god_kaiser_server/src/api/v1/actuators.py:743-745` | V1-22 Online-Guard, `DeviceOfflineError` raise |
