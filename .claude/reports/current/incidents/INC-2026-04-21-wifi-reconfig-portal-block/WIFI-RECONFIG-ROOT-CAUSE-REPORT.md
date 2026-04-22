# WIFI Reconfiguration Root-Cause Report

Datum: 2026-04-21  
System: `El Trabajante` (ESP32 Firmware)  
Betroffenes Geraet: ESP mit SSID `Vodafone-6F44` in neuem Netzwerk (laut Serial-Log)

## 1) Executive Summary

Der ESP oeffnet das Reconfig-Portal **nicht**, obwohl WLAN dauerhaft ausfaellt, weil die aktuelle Firmware-Policy das Portal in genau diesem Betriebsmodus explizit blockiert.

Die Blockierung ist intentional und wird mit `PORTAL_BLOCKED_OFFLINE_AUTONOMY` protokolliert.  
Damit priorisiert die Firmware die lokale Offline-Autonomie (Actuator-Hold/Offline-Rules) gegenueber einem automatischen Wechsel in AP-Portal-Modus.

Kurz: **Kein Runtime-Bug im Sinne "vergessen zu oeffnen", sondern eine aktive Guard-Entscheidung in der Portal-Autorisierung.**

---

## 2) Symptom-Bild aus dem Log (belegt)

Der gelieferte Serial-Log zeigt konsistent:

1. WLAN-Reconnect scheitert mit `NO_AP_FOUND` bzw. `SSID not found`.
2. WiFi-Circuit-Breaker geht auf OPEN/HALF_OPEN-Zyklen.
3. MQTT bleibt disconnected und produziert Transportfehler (`Host is unreachable`).
4. Offline-Safety bleibt aktiv (`offline_rule_hold`, `Disconnect+rules: held=1 forced=0`).
5. Portal-Eskalation wird **explizit unterdrueckt**:
   - `[PORTAL] skip opening on disconnect (code=PORTAL_BLOCKED_OFFLINE_AUTONOMY)`

Damit ist das beobachtete Verhalten vollstaendig reproduzierbar und deterministisch.

---

## 3) Code-Evidenz: Warum das Portal blockiert wird

### 3.1 Zentrale Policy: Portal-Guard blockiert bei Offline-Autonomie

```3:18:El Trabajante/src/services/provisioning/portal_authority.cpp
bool mayOpenPortal(PortalOpenReason reason,
                   const PortalDecisionContext& context,
                   const char** out_code) {
    if (context.portal_already_open) {
        ...
    }

    if (context.boot_force_offline_autonomy || context.has_valid_local_autonomy_config) {
        if (out_code != nullptr) {
            *out_code = "PORTAL_BLOCKED_OFFLINE_AUTONOMY";
        }
        return false;
    }
    ...
}
```

Interpretation: Sobald `boot_force_offline_autonomy=true` (oder local-autonomy-config als gueltig gilt), darf das Portal nicht geoeffnet werden.

### 3.2 Dieser Guard greift exakt in deinem Fall (Disconnect + Persistent Failure)

```105:120:El Trabajante/src/tasks/communication_task.cpp
if (g_system_config.current_state == STATE_OPERATIONAL && !mqttClient.isConnected() && !WiFi.isConnected()) {
    ...
    decision_context.boot_force_offline_autonomy = g_boot_force_offline_autonomy;
    decision_context.has_valid_local_autonomy_config = false;
    ...
    if (!mayOpenPortal(PortalOpenReason::DISCONNECT_DEBOUNCE, decision_context, &decision_code)) {
        LOG_W(COMM_TAG, String("[PORTAL] skip opening on disconnect (code=") +
                       String(decision_code != nullptr ? decision_code : "UNKNOWN") + ")");
        ...
    }
}
```

Und analog fuer den 5-Minuten-Fallback:

```149:160:El Trabajante/src/tasks/communication_task.cpp
} else if (millis() - mqtt_failure_start > MQTT_PERSISTENT_FAILURE_TIMEOUT_MS) {
    ...
    decision_context.boot_force_offline_autonomy = g_boot_force_offline_autonomy;
    ...
    if (!mayOpenPortal(PortalOpenReason::MQTT_PERSISTENT_FAILURE, decision_context, &decision_code)) {
        LOG_W(COMM_TAG, String("[PORTAL] skip opening after persistent MQTT failure (code=") +
                       String(decision_code != nullptr ? decision_code : "UNKNOWN") + ")");
        ...
    }
}
```

### 3.3 Wie `g_boot_force_offline_autonomy` gesetzt wird

Beim Boot mit gueltiger lokaler Autonomie-Konfiguration:

```3002:3009:El Trabajante/src/main.cpp
bool has_valid_local_config = hasValidLocalAutonomyConfig();
if (has_valid_local_config) {
  g_boot_force_offline_autonomy = true;
  g_system_config.current_state = STATE_OPERATIONAL;
  g_system_config.safe_mode_reason = "Booted in local offline autonomy (WiFi unavailable)";
  ...
}
```

`hasValidLocalAutonomyConfig()` verlangt Sensoren + Aktoren + Offline-Regeln:

```451:477:El Trabajante/src/main.cpp
static bool hasValidLocalAutonomyConfig() {
  ...
  bool has_valid = sensor_count > 0 && actuator_count > 0 && offline_rule_count > 0;
  ...
  return has_valid;
}
```

Fazit der Kette:
- Config vorhanden -> `g_boot_force_offline_autonomy=true`
- spaeter Disconnect -> `mayOpenPortal(...)`
- Guard blockiert -> `PORTAL_BLOCKED_OFFLINE_AUTONOMY`
- Geraet bleibt im Offline-Betrieb statt AP-Portal.

---

## 4) Nebenbefund: MQTT-Reconnect-Spam bei fehlendem WLAN

`MQTTClient::processManagedReconnect_()` prueft nicht fruehzeitig auf WiFi-Connectivity, bevor `esp_mqtt_client_reconnect()` gerufen wird:

```988:1017:El Trabajante/src/services/communication/mqtt_client.cpp
void MQTTClient::processManagedReconnect_() {
    if (mqtt_client_ == nullptr || g_mqtt_connected.load()) { ... }
    if (next_managed_reconnect_ms_ == 0 || millis() < next_managed_reconnect_ms_) { return; }
    ...
    esp_err_t err = esp_mqtt_client_reconnect(mqtt_client_);
    if (err != ESP_OK) {
        LOG_W(TAG, String("[INC-EA5484] managed reconnect request failed: ") + esp_err_to_name(err));
        scheduleManagedReconnect_("esp_mqtt_client_reconnect_failed");
        return;
    }
}
```

Das passt exakt zu den wiederholten `Host is unreachable` und hoher MQTT-Failure-Zaehlung im Log.

Wichtig: Das ist kein direkter Ausloeser fuer die Portal-Blockade, aber es verstaerkt Last/Log-Rauschen im Offline-Fall.

---

## 5) Sicherheits-/Betriebsbewertung (laufendes System nicht gefaehrden)

Die aktuelle Policy ist aus Safety-Sicht nachvollziehbar:

- Aktoren bleiben ueber Offline-Regeln kontrolliert (`offline_rule_hold` sichtbar im Log).
- Kein harter Moduswechsel in AP-Portal waehrend kritischer Offline-Steuerung.
- Watchdog bleibt im degraded mode weiter aktiv.

Risiko bei "Portal immer auto-oeffnen":
- AP/HTTP/DNS-Last im ungünstigen Zeitpunkt.
- Mehr Komplexitaet in einem bereits degradierten Netzwerkzustand.
- Potenzieller Einfluss auf deterministische Offline-Regelzyklen.

Deshalb: Jede Aenderung muss **gated und fail-safe** erfolgen, nicht als harte Sofort-Umschaltung.

---

## 6) Antwort auf die Architekturfrage: Web-Portal ersetzen oder vereinfachen?

### 6.1 Was zwischen Web-Portal und reinem Serial liegt

Geeignete Zwischenloesungen (lightweight, ohne Display):

1. **BLE Provisioning (GATT) als Service-Modus**
   - Smartphone-App oder kleine Utility, Credentials per BLE schreiben.
   - Deutlich leichter als Captive-Portal (kein AP+DNS+HTTP Stack notwendig).
   - Gut fuer Offline-Wartung am Feldgeraet.

2. **Temporarer Config-Hotspot ohne Captive-Portal**
   - AP an, aber nur minimaler endpoint (z. B. UDP/TCP command oder sehr kleine HTTP-POST API ohne grosse Seite).
   - Kein Captive-DNS-Handling, weniger Overhead.

3. **Einmal-Pairing mit signiertem Reconfig-Token**
   - Reconfig nur auf physischen Trigger (Button long-press) + kurzer Zeitfenster.
   - Minimiert Risiko fuer laufende Offline-Autonomie.

4. **Dual-Path Policy**
   - Default: Offline-Autonomie (wie heute)
   - Optionaler Maintenance-Pfad: leichte Reconfig-Schnittstelle (BLE/minimal API), nur wenn conditions safe sind.

### 6.2 Empfehlung (ohne Implementierung, nur Strategie)

Pragmatischer Mittelweg:

- Portal nicht sofort entfernen.
- **Portal-Autorisierung in 2 Stufen**:
  1) Runtime-kritisch -> weiter blocken (heutige Policy)
  2) Wartungsfenster/physischer Trigger -> lightweight Reconfig-Kanal erlauben (vorzugsweise BLE oder minimal API)

So bleibt Safety erhalten, aber man bleibt nicht "blind" ohne Serielle.

---

## 7) Exakte Fehlerformulierung (fuer Ticket/Incident)

**Fehlerbild:**  
Bei WLAN-Wechsel (SSID nicht erreichbar) oeffnet der ESP nicht automatisch das Reconfig-Portal.

**Root Cause:**  
Die Portal-Entscheidungslogik blockiert Portal-Open explizit, sobald lokale Offline-Autonomie aktiv ist (`g_boot_force_offline_autonomy=true`). Dadurch werden sowohl Disconnect-Debounce als auch Persistent-MQTT-Failure Eskalationen mit `PORTAL_BLOCKED_OFFLINE_AUTONOMY` abgewiesen.

**Beleg:**  
`portal_authority.cpp` (Guard), `communication_task.cpp` (Skip-Logs), `main.cpp` (Setzen von `g_boot_force_offline_autonomy`), plus Serial-Log mit `skip opening on disconnect (code=PORTAL_BLOCKED_OFFLINE_AUTONOMY)`.

**Impact:**  
Geraet bleibt in degradierter Offline-Autonomie ohne Benutzerweg zur Netz-Neukonfiguration am Geraet, solange kein externer Reconfig-Pfad genutzt wird.

---

## 8) Konkrete naechste Schritte (Analyse-basiert, nicht implementiert)

1. Policy-Entscheidung treffen:
   - A) Safety-first strikt behalten (aktuelles Verhalten), oder
   - B) kontrollierten Maintenance-Reconfig-Pfad ergaenzen.

2. Falls B:
   - BLE-Minimal-Reconfig als bevorzugte Lightweight-Option evaluieren.
   - Portal-Guard um "safe maintenance gate" erweitern (nicht global aufweichen).

3. MQTT-Offline-Rauschen reduzieren:
   - reconnect-versuche bei `WiFi.isConnected()==false` fruehzeitig drosseln/skippen.
   - Ziel: weniger Log-Flut, weniger unnötige Last im degradierten Zustand.

4. Regression-Schutz:
   - Testszenario "SSID weg + offline rules aktiv + portal gate" als feste Testsequenz aufnehmen.

