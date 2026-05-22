# TASK-PACKAGES — AUT-132 GPIO_NOT_IN_FRAME

**Incident:** aut132-gpio-not-in-frame-2026-05-07  
**Branch:** auto-debugger/work  
**Datum:** 2026-05-07

---

## PKG-01 — SERVER: Diagnose-Logging verbessern in `_extract_offline_rule()`

**Agent:** server-dev  
**Priorität:** HIGH — ermöglicht sofort Root-Cause-Bestimmung ohne DB-Query  
**Datei:** `El Servador/god_kaiser_server/src/services/config_builder.py`

### Problem
Wenn `_extract_offline_rule()` keinen matching Action-Eintrag findet (Source A), wird nur  
`"no actuator action targets ESP 'X' (cross-ESP or missing gpio)"` geloggt.  
Die tatsächlich **gesehenen `esp_id`-Werte** in den Actions fehlen komplett.

### Änderungen

#### 1. Logging verbessern (Zeilen ~860–896)
```python
# VORHER
if actuator_gpio is None:
    logger.warning(
        "[CONFIG] Offline-rule skip: rule '%s' — no matching actuator action for esp %s",
        rule.rule_name, esp_id,
    )
    _skip(self.REASON_GPIO_NOT_IN_FRAME, f"no actuator action targets ESP '{esp_id}' ...")
    return None

# NACHHER
if actuator_gpio is None:
    seen_esp_ids = [
        a.get("esp_id") for a in actions
        if isinstance(a, dict) and a.get("type") in ("actuator_command", "actuator")
    ]
    sub_reason = "cross_esp" if seen_esp_ids and all(e != esp_id for e in seen_esp_ids) \
                 else "no_local_action"
    logger.warning(
        "[CONFIG] Offline-rule skip: rule '%s' — no matching actuator action for esp %s "
        "(seen_esp_ids=%s, sub=%s)",
        rule.rule_name, esp_id, seen_esp_ids, sub_reason,
    )
    _skip(
        self.REASON_GPIO_NOT_IN_FRAME,
        f"no actuator action targets ESP '{esp_id}'; seen esp_ids: {seen_esp_ids}",
    )
    return None
```

#### 2. `reason_detail` in `stripped_rules` anreichern
Bereits implementiert durch obigen Fix: `_skip()` übergibt `reason_detail` mit `seen_esp_ids`.  
Das Frontend kann diesen String dann anzeigen.

#### 3. Server-Log bei Source B (Consistency Guard, Zeile ~728) — optionale Ergänzung
```python
logger.debug(
    "[CONFIG] AUT-59 strip: rule=%s actuator_gpio=%s sensor_gpio=%s reason=%s",
    rule.get("rule_name"), a_gpio, s_gpio, "; ".join(reasons)
)
```

### Tests
```
cd "El Servador/god_kaiser_server" && pytest tests/ -k "offline" --tb=short -q
```
Kein neuer Test nötig (Logging-Only-Änderung), aber bestehende offline_rules Tests müssen grün bleiben.

### Akzeptanzkriterien
- `pytest` Exit-Code 0
- `ruff check .` ohne Errors
- Server-Log bei Source-A enthält `seen_esp_ids=[...]` mit den tatsächlichen Werten
- `stripped_rules[].reason_detail` enthält `"seen esp_ids: ..."` Text

---

## PKG-02 — FRONTEND: `config.store.ts` Warning um `reason_detail` erweitern

**Agent:** frontend-dev  
**Priorität:** MEDIUM — verbessert Operator-UX, kein Breaking Change  
**Datei:** `El Frontend/src/shared/stores/config.store.ts`

### Problem
Die Warning-Meldung zeigt aktuell:
```
Beleuchtung Zelt (GPIO ?: GPIO_NOT_IN_FRAME)
```
Das ist für Operator-UX nicht ausreichend. Das Feld `reason_detail` ist im Server-Payload vorhanden aber wird nicht angezeigt.

### Änderungen

#### `config.store.ts` Zeile ~140–160

```typescript
// VORHER
const examples = (diagnostics.stripped_rules ?? []).slice(0, 2)
  .map(r => `${r.rule_name ?? 'Regel'} (GPIO ${r.actuator_gpio ?? '?'}: ${r.reason_code ?? '?'})`)
  .join(', ')

// NACHHER
const examples = (diagnostics.stripped_rules ?? []).slice(0, 2)
  .map(r => {
    const gpioStr = r.actuator_gpio != null ? `GPIO ${r.actuator_gpio}` : 'GPIO ?'
    const detail = r.reason_detail
      ? ` — ${r.reason_detail.substring(0, 60)}${r.reason_detail.length > 60 ? '…' : ''}`
      : ''
    return `${r.rule_name ?? 'Regel'} (${gpioStr}: ${r.reason_code ?? '?'}${detail})`
  })
  .join('; ')
```

#### Type-Definition prüfen/ergänzen
`reason_detail` muss im `OfflineRuleStrippedEntry` Interface (in websocket-events.ts oder config.store.ts lokal) als `reason_detail?: string` deklariert sein.

### Tests
```
cd "El Frontend" && npx vue-tsc --noEmit
cd "El Frontend" && npm run build
```

### Akzeptanzkriterien
- TypeScript-Kompilierung ohne Errors
- `reason_detail` (wenn vorhanden) erscheint in Console-Warn und Toast
- Toast bleibt <= 120 Zeichen (substring(0, 60) für detail)
- Bestehende Warn-Logik für den Fall `reason_detail == null` bleibt identisch

---

## PKG-03 — ESP32: Konstanten-Konsistenz `MAX_OFFLINE_RULES`

**Agent:** esp32-dev  
**Priorität:** LOW — Verifikation, kein Produktions-Bug  
**Dateien:** `El Trabajante/src/models/offline_rule.h`, `El Trabajante/src/...`

### Problem
Frontend `OFFLINE_RULES_LIMIT_PER_ESP` wurde in `862b97fb` von 20 → 8 geändert.  
ESP32-Firmware muss `MAX_OFFLINE_RULES = 8` als Konstante haben (entsprechend AUT-134).  
Server `config_builder.py` muss dieselbe Grenze enforzen.

### Aufgabe
1. Verify `El Trabajante/src/models/offline_rule.h` — ist `MAX_OFFLINE_RULES = 8`?
2. Verify `config_builder.py` `MAX_OFFLINE_RULES_PER_ESP` Server-Konstante == 8
3. Verify Frontend `OFFLINE_RULES_LIMIT_PER_ESP = 8` in `RuleFlowEditor.vue`
4. Falls Mismatch: korrigieren (nur Server oder Frontend, KEIN ESP32 Firmware-Change ohne Flash)

### Tests
```
cd "El Trabajante" && pio run -e esp32_dev
```
(Nur falls ESP32-seitig eine Änderung nötig ist)

### Akzeptanzkriterien
- Alle drei Konstanten identisch (8)
- Kein Firmware-Flash erforderlich wenn bereits 8 (nur Verify)
- Build Exit-Code 0 falls geändert

---

## PKG-04 — MQTT: Verify Config-Strip transparent

**Agent:** mqtt-dev  
**Priorität:** LOW — Dokumentations-/Verify-Task, kein Code-Bug  
**Dateien:** Keine Code-Änderung erwartet

### Aufgabe
Sicherstellen dass der Config-Payload mit gestrippten offline_rules korrekt über MQTT publiziert wird:

1. Verify `El Servador/god_kaiser_server/src/services/esp_service.py` `send_config()`:
   - `offline_rules_diagnostics` wird via `config.pop("offline_rules_diagnostics", None)` **vor** dem MQTT-Publish entfernt (geht NICHT ans ESP32)
   - Das Strip ist transparent für das ESP32 — es empfängt nur die validen Regeln
2. Verify dass kein MQTT-Topic `offline_rules_diagnostics` existiert (nur WS `config_published`)
3. Falls Lücke: Dokument in `.claude/reference/api/MQTT_TOPICS.md` ergänzen

### Akzeptanzkriterien
- `esp_service.py send_config()` entfernt `offline_rules_diagnostics` vor Publish: ✓ oder Fix
- Kein `offline_rules_diagnostics` in MQTT-Payload (nur in WS)
- `MQTT_TOPICS.md` ist korrekt / aktualisiert wenn nötig

---

## Abhängigkeiten

```
PKG-01 (Server) → PKG-02 (Frontend) — nach PKG-01 enthält reason_detail mehr Info
PKG-03 (ESP32)  → unabhängig, parallel zu PKG-01/02
PKG-04 (MQTT)   → unabhängig, parallel zu PKG-01/02/03
```

PKG-01 und PKG-02 können parallel entwickelt werden (verschiedene Dateien).  
PKG-02 ist idempotent — funktioniert auch ohne PKG-01 (reason_detail kann leer sein).
