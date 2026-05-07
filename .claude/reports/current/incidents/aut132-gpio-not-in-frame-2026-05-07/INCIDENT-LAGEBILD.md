# INCIDENT-LAGEBILD — AUT-132 GPIO_NOT_IN_FRAME

**Incident-ID:** aut132-gpio-not-in-frame-2026-05-07  
**Datum:** 2026-05-07  
**ESP:** ESP_698EB4  
**Schicht:** El Servador (Server) → El Frontend (Anzeige)  
**Severity:** MEDIUM — kein Datenverlust, aber Offline-Regeln werden nicht ans ESP übertragen

---

## Symptom (Browser-Konsole)

```
{"level":"warn","component":"ConfigStore",
 "message":"AUT-132: 5 Offline-Regel(n) nicht gesendet für ESP_698EB4 — 
  Beleuchtung Zelt (GPIO ?: GPIO_NOT_IN_FRAME), 
  Bewässerung 5 (GPIO ?: GPIO_NOT_IN_FRAME)",
 "timestamp":"2026-05-07T16:49:06.683Z"}
```

Stack-Trace: `config.store.ts:155` ← `esp.ts:1764` ← `useWebSocket.ts:144` ← `websocket.ts:449`

---

## Call-Stack (vollständig aufgelöst)

| Layer | Datei | Zeile | Was passiert |
|---|---|---|---|
| WS Eingang | `El Frontend/src/services/websocket.ts` | 449 | `routeMessage()` dispatcht `config_published`-Event |
| WS Handler | `El Frontend/src/composables/useWebSocket.ts` | 144 | Typ-spezifischer Callback aufgerufen |
| ESP Store | `El Frontend/src/stores/esp.ts` | 1764 | `useConfigStore().handleConfigPublished(message, ...)` |
| Config Store | `El Frontend/src/shared/stores/config.store.ts` | 155 | Liest `offline_rules_diagnostics.stripped_rules` und loggt Warn |

Das Frontend **zeigt nur an** was der Server schickt — es ist kein Frontend-Bug.

---

## Server-seitige Root-Cause

### Wo der Fehler entsteht

**Datei:** `El Servador/god_kaiser_server/src/services/config_builder.py`  
**Funktion:** `_extract_offline_rule()`, Zeilen 860–896  
**Auslöser:** Source A (Pre-Consistency-Check)

```python
# Zeilen 858–895 config_builder.py
for action in actions:
    if not isinstance(action, dict):
        continue
    if action.get("type") not in ("actuator_command", "actuator"):
        continue
    if action.get("esp_id") != esp_id:          # esp_id = "ESP_698EB4"
        continue
    raw_gpio = action.get("gpio")
    if raw_gpio is None:
        continue
    actuator_gpio = int(raw_gpio)
    break

if actuator_gpio is None:
    _skip(
        self.REASON_GPIO_NOT_IN_FRAME,
        f"no actuator action targets ESP '{esp_id}' (cross-ESP or missing gpio)",
    )
    return None  # → actuator_gpio = None → Frontend zeigt "GPIO ?"
```

**`GPIO ?` in der Meldung** bedeutet: `r.actuator_gpio` ist `None` — Source A hat gefeuert, BEVOR der Consistency-Guard (Source B, Zeile 706–731) greift. Das ist das Frühstadium: keine einzige Action im Regelarray hat gleichzeitig `esp_id == "ESP_698EB4"` UND ein gültiges `gpio`-Feld.

### Zwei mögliche Sub-Ursachen bei Source A

| Sub-Code | Bedeutung | Erkennbar an |
|---|---|---|
| `cross_esp` | `action.esp_id != "ESP_698EB4"` (Regel steuert Aktor auf anderem ESP) | `action.esp_id` in DB ≠ `"ESP_698EB4"` |
| `no_local_action` | Kein `actions`-Eintrag mit Type `"actuator_command"` / `"actuator"` für diesen ESP | actions-Array leer oder nur Nicht-Aktor-Typen |
| `null_gpio` | `action.esp_id` passt aber `action.gpio` ist `None` | `gpio: null` im JSON |

**Aktuell unbekannt (ohne DB-Query):** Welcher Sub-Fall vorliegt. Der Server-Log schreibt nur:  
`"no actuator action targets ESP 'ESP_698EB4' (cross-ESP or missing gpio)"`  
— ohne zu zeigen, welche `esp_id`-Werte er in den actions GESEHEN hat.

---

## Was NICHT die Ursache ist

| Kandidat | Status | Begründung |
|---|---|---|
| Format-Mismatch `esp_id` (UUID vs. String) | ❌ AUSGESCHLOSSEN | Beide Seiten nutzen `"ESP_XXXXXX"` Strings; Pydantic-Pattern `^(ESP_[A-F0-9]{6,8}\|MOCK_[A-Z0-9]+)$` erzwingt einheitliches Format |
| Subzone-Filter in `get_by_esp()` | ❌ AUSGESCHLOSSEN | `actuator_repo.get_by_esp()` hat keinen Subzone-Filter — liefert alle Aktoren des ESP unabhängig von Subzone |
| Geänderte Dateien (Dashboard-Widget, Calibration) | ❌ AUSGESCHLOSSEN | Nur Widget-Cleanup beim Device-Delete und pH-Kalibrierungs-Punkt-Rollen-Fix |
| Alert-Center / Layout-Fixes (AUT-269) | ❌ AUSGESCHLOSSEN | Nur UI-Routing-Änderungen, keine Config-Push-Änderungen |
| Oversize-Handling (AUT-134) | ❌ AUSGESCHLOSSEN | Budget-Gate greift VOR offline_rules, würde anderen Reason-Code liefern |

---

## Subzone-Bezug: Warum erwähnt der User Subzone?

Subzone-Änderungen können **indirekt** offline_rules invalidieren, wenn:
1. Eine Subzone-Reassignment-Operation einen Aktor **deaktiviert** (`enabled=False`) oder **löscht + neu anlegt**
2. Eine neue Actuator-Config mit demselben Namen aber neuer `esp_id` / neuem `gpio` entsteht

In diesem Fall würde **Source A weiterhin** feuern (weil die Regel noch die alte `esp_id`/GPIO referenziert). Die Lösung liegt dann in der Logic-Rule, nicht in der Subzone-Logik selbst.

**Direkter Code-Check:** `get_by_esp()` filtert nur nach `esp_id` (UUID), nicht nach Subzone. Subzone-Metadaten gehen als Payload-Feld mit, aber sie steuern nicht welche Aktoren im Frame erscheinen.

---

## Limit-Änderung (AUT-134 Kontext)

Commit `862b97fb`: `OFFLINE_RULES_LIMIT_PER_ESP` Frontend: **20 → 8**  
Spiegelt ESP32-Firmware-Konstante `MAX_OFFLINE_RULES = 8` in `El Trabajante/src/models/offline_rule.h`.

Die 5 gestrippten Regeln haben `reason_code: GPIO_NOT_IN_FRAME`, NICHT `MAX_RULE_LIMIT`. Das Limit ist **nicht** der direkte Auslöser hier — aber es reduziert den Spielraum: wenn künftig mehr als 8 Regeln valid wären, würden weitere mit `MAX_RULE_LIMIT` gestripped.

---

## Diagnose-Lücke (Code-seitig)

Der Server-Log bei Source A ist nicht aussagekräftig genug:  
**Ist:** `"no actuator action targets ESP 'ESP_698EB4' (cross-ESP or missing gpio)"`  
**Soll:** `"no actuator action targets ESP 'ESP_698EB4' — seen esp_ids in actions: ['ESP_ABCDEF', 'ESP_123456']"`

Das Frontend zeigt `reason_detail` nicht an (nur `reason_code`).

---

## Hypothesen (Priorität)

1. **H1 (HOCH):** Regeln wurden erstellt als Aktoren noch auf einem anderen ESP waren. Nach Geräte-Neuzuweisung/Umregistrierung wurden Logic-Rules nicht aktualisiert → Cross-ESP-Referenz.
2. **H2 (MITTEL):** Subzone-Reassignment hat Aktor-Config gelöscht+neu angelegt mit neuer `esp_id` → Regel zeigt auf alten nicht-mehr-existenten Eintrag.
3. **H3 (NIEDRIG):** `actions.gpio` ist `null` im DB-Eintrag (Daten-Korruption bei Erstellung).

---

## Nächste Schritte

- **PKG-01 SERVER:** `_extract_offline_rule()` diagnostisches Logging verbessern + `reason_sub_code` hinzufügen
- **PKG-02 FRONTEND:** `config.store.ts` Warning um `reason_detail` aus Server-Payload erweitern  
- **PKG-03 ESP32:** Verifizieren dass `MAX_OFFLINE_RULES = 8` und Frontend-Konstante konsistent sind
- **PKG-04 MQTT:** Keine Code-Änderungen — Verify dass Config-Strip transparent für MQTT-Layer ist
- **DB-Inspektion (Robin, manuell):** `SELECT rule_name, actions FROM cross_esp_logic WHERE enabled = true AND actions::text LIKE '%698EB4%'` — Sub-Ursache eingrenzen
