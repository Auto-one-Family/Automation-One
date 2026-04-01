# Frontend Debug Report

**Erstellt:** 2026-03-31
**Modus:** B (Spezifisch: "403 bei POST /actuators/ESP_EA5484/14")
**Quellen:** `El Frontend/src/api/actuators.ts`, `El Frontend/src/stores/esp.ts` (Z.894-933), `El Frontend/src/components/esp/AddActuatorModal.vue` (Z.120-178), `El Frontend/src/api/esp.ts` (Z.186-191), `El Frontend/src/api/index.ts`, `El Servador/.../api/v1/actuators.py` (Z.404-501), `El Servador/.../api/deps.py` (Z.270-294), `El Servador/.../core/exceptions.py` (Z.586-601), DB-Query, Server-Log

---

## 1. Zusammenfassung

Der 403-Fehler stammt nicht aus dem Frontend-Code. Die Ursache liegt vollstaendig auf der Server-Seite: `ESP_EA5484` hat in der Datenbank den Status `offline`, und der Server-Endpoint verweigert jede Konfigurationsoperation an nicht-genehmigten Geraeten mit `DeviceNotApprovedError` (HTTP 403, Error-Code `DEVICE_NOT_APPROVED`, Numeric 5405). Das Frontend ist korrekt implementiert und leitet den Fehler nur weiter. Handlungsbedarf liegt im Device-Status-Management (DB) oder optional in der Frontend-UX (spezifisches Toast-Feedback statt stillem logger.error).

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `api/actuators.ts:87-100` | OK | URL-Konstruktion korrekt |
| `stores/esp.ts:894-933` | OK | Mock/Real-Trennung korrekt, Payload vollstaendig |
| `AddActuatorModal.vue:158-168` | OK (UX-Luecke) | Store-Aufruf korrekt, aber kein 403-spezifisches Toast |
| `api/esp.ts:186-191` | OK | `isMockEsp()` klassifiziert ESP_EA5484 korrekt als Real-ESP |
| `api/index.ts` | OK | Auth-Interceptor, Token-Handling, kein Beitrag zum 403 |
| DB: esp_devices | FEHLER | ESP_EA5484 hat Status `offline` |
| Server: `actuators.py:450` | ROOT CAUSE | Status-Guard blockiert mit 403 bei Status != approved/online |
| Server: `deps.py:288` | OK | OperatorUser-Check — kein Beitrag wenn User Operator/Admin ist |

---

## 3. Befunde

### 3.1 Root Cause: Device-Status-Guard auf Server-Seite

- **Schwere:** Hoch (funktionaler Block — kein Bug, aber beabsichtigtes Server-Verhalten das den User blockiert)
- **Detail:** `ESP_EA5484` hat DB-Status `offline`. Der Server-Endpoint `POST /{esp_id}/{gpio}` prueft in `actuators.py:450` explizit `if esp_device.status not in ("approved", "online")` und wirft `DeviceNotApprovedError` mit HTTP 403. Das ist korrektes, beabsichtigtes Verhalten: Konfiguration ist nur an genehmigten Geraeten erlaubt.
- **Evidenz:**
  - DB: `SELECT device_id, status FROM esp_devices WHERE device_id LIKE '%EA5484%'` → `ESP_EA5484 | offline`
  - `exceptions.py:589` `status_code = 403`
  - `exceptions.py:590` `error_code = "DEVICE_NOT_APPROVED"`
  - `actuators.py:450-451` `if esp_device.status not in ("approved", "online"): raise DeviceNotApprovedError(esp_id, esp_device.status)`
  - Response-Body (Server): `"Device 'ESP_EA5484' must be approved before configuration (current status: offline)"`

### 3.2 Frontend-Code ist korrekt — fehlende UX-Rueckmeldung

- **Schwere:** Mittel (UX-Problem, kein Logik-Fehler)
- **Detail:** Das Frontend fuehrt keinen Pre-Check des Device-Status durch. Der 403 landet im `catch`-Block des Store (`esp.ts:930`) der `error.value` setzt und rethrows. `AddActuatorModal.vue:166` faengt den Fehler und loggt ihn nur via `logger.error` — kein `toast.error`, kein spezifisches Feedback fuer "Geraet nicht genehmigt". Der User sieht keinen Toast, nur einen stillen Fehler.
- **Evidenz:**
  ```typescript
  // AddActuatorModal.vue:158-168
  async function addActuator() {
    try {
      await espStore.addActuator(props.espId, newActuator.value)
      toast.success('Aktor erfolgreich hinzugefügt')
      // ...
    } catch (err) {
      logger.error('Failed to add actuator', err)
      // FEHLT: toast.error mit spezifischer Meldung
    }
  }
  ```

### 3.3 isMock-Klassifizierung korrekt

- **Schwere:** Kein Befund
- **Detail:** `isMockEsp()` in `esp.ts:186-191` prueft `startsWith('ESP_MOCK_')` und `startsWith('MOCK_')`. `ESP_EA5484` trifft keines — wird korrekt als Real-ESP behandelt. Der Code-Pfad laeuft durch den `else`-Zweig in `esp.ts:905-926` zu `actuatorsApi.createOrUpdate()`.

### 3.4 URL-Konstruktion korrekt

- **Schwere:** Kein Befund
- **Detail:** `actuators.ts:93` baut `/actuators/${espId}/${gpio}` → `/actuators/ESP_EA5484/14`. Es gibt keinen separaten Endpoint fuer Mock vs. Real. Die Trennung erfolgt im Store vor dem API-Call (Mock → `debugApi`, Real → `actuatorsApi`). Fuer Real-ESPs ist `/actuators/{esp_id}/{gpio}` der korrekte Endpoint.

### 3.5 Payload vollstaendig und korrekt

- **Schwere:** Kein Befund
- **Detail:** `esp.ts:909-924` baut `ActuatorConfigCreate` mit allen Pflichtfeldern (`esp_id`, `gpio`, `actuator_type`, `enabled`). Optional-Felder (`name`, `subzone_id`, `max_runtime_seconds`, `cooldown_seconds`, `pwm_frequency`, `metadata`) werden korrekt mit `null` oder berechnetem Wert belegt. Server ueberschreibt `esp_id` und `gpio` aus Path-Params (actuators.py:436) — keine Inkonsistenz moeglich.

### 3.6 Nebenthema: LWT-Flood im Server-Log

- **Schwere:** Niedrig (separates Problem)
- **Detail:** ESP_EA5484 erzeugt kontinuierliche LWT-Nachrichten (`unexpected_disconnect`) im Server-Log — mehrere pro Sekunde. Das ist ein MQTT-Reconnect-Loop des physischen Geraets und erklaert den persistenten `offline`-Status.
- **Evidenz:** `logs/server/god_kaiser.log` — 20+ LWT-Entries fuer ESP_EA5484 im Bereich 16:03-16:04 Uhr

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| `curl http://localhost:8000/api/v1/health/live` | `{"alive":true}` — Server erreichbar |
| `docker compose ps` | Alle 12 Services healthy/running |
| DB: ESP_EA5484 Status | `offline` — Root Cause bestaetigt |
| `grep "ESP_EA5484" logs/server/god_kaiser.log` | LWT-Flood bestaetigt, kein direkter 403-Log-Eintrag vorhanden |
| `api/esp.ts:186-191` isMockEsp-Logik | Korrekt, ESP_EA5484 als Real-ESP klassifiziert |

---

## 5. Blind-Spot-Fragen (an User)

1. Welche Rolle hat der eingeloggte User (`viewer`/`operator`/`admin`)? Falls `viewer`, kommt der 403 aus `deps.py:290` (OperatorUser-Check) und nicht aus dem Status-Guard. Beide liefern HTTP 403, aber mit unterschiedlichem `detail`-Text im Response-Body.
2. Was zeigt die Browser-Console exakt als Response-Body? Der Server-Text `"Device 'ESP_EA5484' must be approved before configuration"` vs. `"Operator or admin privileges required"` erlaubt eindeutige Unterscheidung der 403-Quelle.
3. Soll ESP_EA5484 manuell auf `approved` gesetzt werden fuer den Test?

---

## 6. Bewertung & Empfehlung

### Root Cause

`ESP_EA5484` hat DB-Status `offline`. Der Server-Endpoint `POST /actuators/{esp_id}/{gpio}` verweigert Konfigurationsoperationen an Geraeten mit Status != `approved`/`online` mit `DeviceNotApprovedError` (HTTP 403, Numeric 5405). Das Frontend ist korrekt implementiert — der Fehler liegt nicht im Frontend-Code-Pfad.

### Naechste Schritte

**Option A — Geraet genehmigen (wenn legitim):**
```sql
UPDATE esp_devices SET status = 'approved' WHERE device_id = 'ESP_EA5484';
```
Danach erneut versuchen. Das Geraet muss anschliessend verbunden sein, damit der Status automatisch auf `online` wechselt.

**Option B — Frontend-UX verbessern (unabhaengig von A, Aufwand gering):**
`AddActuatorModal.vue:166` sollte den 403-Fall spezifisch behandeln:
- 403 → `toast.error('Geraet nicht genehmigt. Status muss "approved" oder "online" sein.')`
- Alternativ: Button deaktivieren wenn `esp.status !== 'approved' && esp.status !== 'online'` (Pre-Check via `espStore.devices`)
- Zustaendig: `frontend-dev`

**Option C — LWT-Flood untersuchen (separates Ticket):**
Der Reconnect-Loop von ESP_EA5484 deutet auf ein Firmware- oder Netzwerkproblem hin. Solange der ESP im Loop ist, bleibt der Status `offline` und Option A wuerde nur temporaer helfen. Zustaendig: `esp32-debug`.

### Lastintensive Ops

Nicht erforderlich — Root Cause vollstaendig durch leichtgewichtige Checks bestaetigt.
