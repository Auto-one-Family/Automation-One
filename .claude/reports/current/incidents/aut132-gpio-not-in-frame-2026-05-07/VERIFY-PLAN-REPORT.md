# VERIFY-PLAN-REPORT — AUT-132 GPIO_NOT_IN_FRAME

**Datum:** 2026-05-07  
**Incident:** aut132-gpio-not-in-frame-2026-05-07

---

## Ergebnisse pro Package

| PKG | Agent | Status | Aktion |
|---|---|---|---|
| PKG-01 SERVER | server-dev | ⚠️ PARTIAL | `reason_detail` Feld existiert, aber Inhalt zeigt keine `seen_esp_ids` → kleiner Logging-Fix |
| PKG-02 FRONTEND | frontend-dev | ❌ FAIL (minor) | `reason_detail` fehlt im inline-Typ-Cast in `config.store.ts:147` → Fix + Display |
| PKG-03 ESP32 | esp32-dev | ✅ PASS | Alle 3 Konstanten identisch = 8. Kein Code-Change |
| PKG-04 MQTT | mqtt-dev | ✅ PASS | `config.pop("offline_rules_diagnostics")` korrekt auf Zeile 586 in `esp_service.py`. Kein Code-Change |

---

## PKG-01 SERVER — PARTIAL (Inhalt-Lücke in `reason_detail`)

**verify-plan Befund:** `reason_detail` ist BEREITS in allen `stripped_rules`-Einträgen als Feld vorhanden. Das TypeScript-Interface `OfflineRuleStrippedEntry` hat `reason_detail: string` (websocket-events.ts:350–356). Die `_skip()`-Funktion in config_builder.py (Zeilen 794–808) schreibt `reason_detail` korrekt.

**Verbleibende Lücke:** Der aktuelle `reason_detail`-Text bei Source A (Zeile ~893) ist:
```
"no actuator action targets ESP 'ESP_698EB4' (cross-ESP or missing gpio)"
```
Er zeigt NICHT welche `esp_id`-Werte tatsächlich in den actions gefunden wurden. Ohne diese Info kann der Operator den Data-Fix nicht selbst durchführen.

**Angepasste PKG-01 Aufgabe (MINIMAL-FIX):**
- In `_extract_offline_rule()` Zeilen ~886–896: Vor dem `_skip()`-Aufruf die `seen_esp_ids` aus allen passenden actions extrahieren und in `reason_detail` einbauen
- Kein neues Feld, nur Inhalt des bestehenden `reason_detail` anreichern

**Betroffene Zeile:** `El Servador/god_kaiser_server/src/services/config_builder.py` ~Zeile 886–896

---

## PKG-02 FRONTEND — FAIL (Typ-Cast und Display)

**verify-plan Befund:** 
- `OfflineRuleStrippedEntry` in `websocket-events.ts:350–356` hat `reason_detail: string` ✓
- Server sendet `reason_detail` bereits im Payload ✓  
- **LÜCKE:** `config.store.ts:147` hat einen lokalen inline-Typ-Cast ohne `reason_detail`:
  ```typescript
  // AKTUELL (unvollständig)
  { rule_name?: string; actuator_gpio?: number; reason_code?: string }
  
  // SOLL
  { rule_name?: string; actuator_gpio?: number; reason_code?: string; reason_detail?: string }
  // ODER: Import von OfflineRuleStrippedEntry aus @/types/websocket-events
  ```
- Die `.map()`-Funktion zeigt `reason_detail` nicht an

**Angepasste PKG-02 Aufgabe:**
- `config.store.ts:147`: Typ-Cast um `reason_detail?: string` ergänzen
- `.map()` in derselben Funktion: `r.reason_detail` (gekürzt auf 60 Zeichen) in die Anzeige einbauen

**Betroffene Dateien:**
- `El Frontend/src/shared/stores/config.store.ts` (Zeilen 126–161)

---

## PKG-03 ESP32 — PASS ✅

Alle drei Konstanten konsistent auf Wert **8**:
- `El Trabajante/src/models/offline_rule.h:15` → `static const uint8_t MAX_OFFLINE_RULES = 8`
- `El Servador/god_kaiser_server/src/services/config_builder.py:203` → `MAX_OFFLINE_RULES = 8`
- `El Frontend/src/components/rules/RuleFlowEditor.vue:64` → `OFFLINE_RULES_LIMIT_PER_ESP = 8`

**Kein Code-Change erforderlich.** ESP32-dev kann Verifikation bestätigen ohne Implementierung.

---

## PKG-04 MQTT — PASS ✅

`esp_service.py:586`:
```python
config.pop("offline_rules_diagnostics", None)
```
Korrekt vor `publish_config()` (Zeile 660). Diagnostics gehen nur in:
- WebSocket-Broadcast `config_published` (Zeile 748) ✓  
- Audit-Log `CONFIG_OFFLINE_RULES_STRIPPED` (Zeile 701) ✓

**Kein Code-Change erforderlich.** mqtt-dev kann Verifikation bestätigen ohne Implementierung.

---

## OUTPUT FÜR ORCHESTRATOR

**Angepasste TASK-PACKAGES nach verify-plan:**

- **PKG-01**: Scope reduziert auf Minimal-Fix: `reason_detail`-String in `_extract_offline_rule()` Source-A-Pfad um `seen_esp_ids` anreichern. Datei: `config_builder.py:~893`
- **PKG-02**: Unverändert — Typ-Cast + Display-Fix in `config.store.ts:147`
- **PKG-03**: Kein Code-Change → verify only
- **PKG-04**: Kein Code-Change → verify only

**Startauftrag:**
- server-dev: PKG-01 minimal-fix (1 Zeile in reason_detail)
- frontend-dev: PKG-02 Typ-Fix + Display (3–5 Zeilen in config.store.ts)
- esp32-dev: Keine Implementierung
- mqtt-dev: Keine Implementierung

**Verbleibende BLOCKER:**
- KEIN BLOCKER für PKG-01/PKG-02
- Data-Fix für Logic-Rules (Operator-Aufgabe): DB-Query nach merge ausführen um stale `actions.esp_id` zu identifizieren
