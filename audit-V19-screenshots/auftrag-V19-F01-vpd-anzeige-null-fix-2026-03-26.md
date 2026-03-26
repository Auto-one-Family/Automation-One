# V19-F01 — VPD-Anzeige zeigt 0 statt korrektem Wert (CRITICAL)

> **Typ:** Bugfix (Backend WebSocket-Broadcast + Frontend Datenverarbeitung)
> **Erstellt:** 2026-03-26
> **Prioritaet:** CRITICAL
> **Geschaetzter Aufwand:** ~2-3h (Analyse + Fix)
> **Abhaengigkeit:** Keine
> **Betroffene Schichten:** El Servador (sensor_handler.py) + El Frontend (Store, Widgets)

---

## Kontext

VPD (Vapor Pressure Deficit) ist ein berechneter Sensor-Wert. Das Backend berechnet VPD event-driven im `sensor_handler.py` via `_try_compute_vpd()` Hook, sobald ein SHT31-Sensor (Temperatur + Luftfeuchtigkeit) neue Daten liefert. Die Berechnung nutzt die Magnus-Tetens-Formel in `vpd_calculator.py` und speichert das Ergebnis als `sensor_data`-Row mit `sensor_type='vpd'`, `processing_mode='computed'`, `interface_type='VIRTUAL'`.

Das Backend speichert den VPD-Wert korrekt — die REST-API (`GET /api/v1/sensors/?sensor_type=vpd`) liefert `latest_value: 1.1898`, `quality: "good"`. Die VPD-Zeitreihe (`GET /api/v1/sensors/data`) liefert ebenfalls korrekte historische Werte.

**Das Problem:** Das Frontend zeigt ueberall "0 kPa" bzw. "0,00 kPa" an — in der Sensor-Card auf Monitor L2, im Gauge-Widget im Editor, und in der Komponenten-Tabelle.

---

## IST-Zustand

1. **Monitor L2 Sensor-Card:** VPD-Sensor-Card zeigt "0 kPa" mit flacher Sparkline bei 0.
2. **Gauge-Widget (Editor/Monitor):** VPD-Gauge zeigt "0" im Zentrum.
3. **Komponenten-Tabelle (/sensors):** VPD-Zeile zeigt Wert "0".
4. **Backend API:** `latest_value: 1.1898 kPa` — der Wert ist korrekt gespeichert.
5. **Zeitreihe API:** Historische VPD-Daten existieren und sind korrekt.

---

## SOLL-Zustand

1. **Monitor L2 Sensor-Card:** Zeigt "1.19 kPa" (2 Dezimalstellen, wie in `sensorDefaults.ts` definiert: `decimals: 2`).
2. **Gauge-Widget:** Zeigt "1.19" mit korrekter Farbzone (gruen = 0.8-1.2 kPa fuer VPD).
3. **Komponenten-Tabelle:** Zeigt "1.19 kPa".
4. **Sparkline in Sensor-Card:** Zeigt den realen VPD-Verlauf, nicht eine Linie bei 0.

---

## Root-Cause-Analyse

Es liegen **zwei gleichzeitige Bugs** vor. Bug 1 ist bestaetigt (Code-Review), Bug 2 erfordert Analyse.

---

### Bug 1 (BESTAETIGT): VPD-Broadcast sendet UUID statt device_id

**Status:** Bestaetigt durch Code-Review — kein Hypothese-Charakter.

Die VPD-Broadcast-Logik in `sensor_handler.py` (ca. Zeile 687) bestimmt die ESP-ID so:

```python
esp_id_str = esp_device.esp_id if hasattr(esp_device, "esp_id") else str(esp_device.id)
```

Das `ESPDevice`-Model hat **kein Attribut `esp_id`** — das Feld heisst `device_id` (definiert in `db/models/esp.py`). Daher:
- `hasattr(esp_device, "esp_id")` → `False`
- Fallback: `str(esp_device.id)` → UUID (z.B. `"8f67d252-8aaa-..."`)

**Zum Vergleich:** Die regulaere Sensor-Broadcast (ca. Zeile 479) nutzt `esp_id_str` aus dem MQTT-Topic-Parsing (ca. Zeile 155), was korrekt den `device_id`-String liefert (z.B. `"ESP_12AB34CD"`).

**Konsequenz:** Der VPD-WebSocket-Broadcast sendet eine UUID als `esp_id`. Das Frontend sucht per `devices.find(d => getDeviceId(d) === espId)` in `sensor.store.ts` (ca. Zeile 114). Da das Frontend `device_id`-Format erwartet (`"ESP_12AB34CD"`), gibt es **keinen Match**. VPD-Werte via WebSocket werden **nie** im Store aktualisiert.

**Fix:** Das Projekt hat bereits `mqtt/websocket_utils.py` mit der Funktion `get_device_id_for_broadcast()` — genau fuer diesen Zweck. Die VPD-Broadcast-Logik nutzt diese Utility **nicht**. Der Fix ist:

```python
# Zeile ~687 ersetzen:
# ALT: esp_id_str = esp_device.esp_id if hasattr(esp_device, "esp_id") else str(esp_device.id)
# NEU:
from src.mqtt.websocket_utils import get_device_id_for_broadcast
esp_id_str = get_device_id_for_broadcast(esp_device)
```

Alternativ (minimal): `esp_id_str = esp_device.device_id`

---

### Bug 2 (HYPOTHESE): Initialer API-Wert zeigt ebenfalls "0"

Bug 1 erklaert warum **WebSocket-Updates** nie ankommen. Aber VPD zeigt auch bei initialem Seitenaufruf "0" — die Daten kommen dann ueber die REST-API, nicht WebSocket. Moegliche Ursachen:

#### Hypothese A: Store/Composable ueberschreibt den API-Wert

Das Frontend koennte den initialen API-Wert korrekt laden, aber ein reaktiver Store oder Composable ueberschreibt ihn mit einem Default von 0. Moegliche Stellen:
1. `useSensorData` oder aehnliches Composable — initialisiert es `latest_value` mit 0?
2. `sensor.store.ts` — wird `latest_value` aus der API-Response korrekt uebernommen oder geht es bei der Zuweisung verloren?
3. VPD-spezifische Logik im Frontend — gibt es eine Frontend-seitige VPD-Berechnung die den Server-Wert ueberschreibt?

#### Hypothese B: esp_id-Mismatch beim API-Datenabruf

VPD-Sensoren haben `sensor_type='vpd'` und nutzen die gleiche GPIO wie der Trigger-Sensor (SHT31). Wenn die VPD-SensorConfig in der Datenbank mit der UUID des ESP statt dem `device_id` verknuepft ist (gleicher Bug-Ursprung wie Bug 1), koennten API-Responses den Sensor nicht korrekt dem Frontend-Device zuordnen.

**Pruefschritte:**
1. API-Response `GET /api/v1/sensors/?sensor_type=vpd` pruefen: Welches Format hat `esp_id` in der Response? UUID oder device_id-String?
2. Falls UUID: Die SensorConfig-Erstellung in `_try_compute_vpd()` prueft woher die `esp_id` stammt.

#### Hypothese C: sensorId-Mismatch in Widgets

Das `sensorId`-Format ist `espId:gpio:sensorType` (3-teilig). Wenn die Sensor-Card oder das Gauge den sensorType nicht korrekt als `'vpd'` uebergibt, koennte es den falschen Sensor abfragen (z.B. SHT31-Temperatur statt VPD).

**Pruefschritte:**
1. Pruefen welche `sensorId` fuer VPD-Widgets/Cards gesetzt wird.
2. Pruefen ob `useSensorId.ts` den Typ `'vpd'` korrekt parst.
3. Pruefen ob der Store-Lookup nach `espId + gpio + sensorType` filtert oder nur nach `espId + gpio`.

---

## Vorgehen

### Schritt 1: Bug 1 fixen (bestaetigt, Backend)

1. **`sensor_handler.py`** oeffnen, die VPD-Broadcast-Logik finden (ca. Zeile 687).
2. Die fehlerhafte `esp_id_str`-Zuweisung ersetzen:
   - **Option A (bevorzugt):** `get_device_id_for_broadcast(esp_device)` aus `mqtt/websocket_utils.py` importieren und nutzen. Diese Utility existiert genau fuer diesen Zweck.
   - **Option B (minimal):** `esp_id_str = esp_device.device_id` direkt setzen.
3. Pruefen ob weitere Stellen in `_try_compute_vpd()` oder dem VPD-Broadcast-Block das gleiche `esp_device.esp_id`-Pattern nutzen und ebenfalls korrigieren.

### Schritt 2: Bug 2 analysieren und fixen (Frontend)

1. **Reproduktion:** Frontend oeffnen, zu Monitor L2 navigieren (eine Zone mit VPD-Sensor). VPD-Card finden → Wert pruefen. Parallel API-Call `GET /api/v1/sensors/?sensor_type=vpd` machen und `latest_value` vergleichen.
2. **API-Response pruefen:** Hat `esp_id` in der VPD-Sensor-Response UUID-Format oder device_id-Format? Falls UUID → gleicher Root Cause wie Bug 1 (SensorConfig wurde mit UUID statt device_id erstellt).
3. **Store-Debug:** Vue DevTools → Pinia Store → Sensor-Store. Welchen Wert hat der VPD-Sensor im Store? Stimmt er mit der API ueberein?
4. **Code-Analyse:** Hypothesen A-C systematisch durchgehen. Root Cause identifizieren.
5. **Fix:** Je nach Root Cause:
   - Hypothese A: Store-Initialisierung oder reaktive Zuweisung fixen.
   - Hypothese B: esp_id-Format in SensorConfig-Erstellung korrigieren (Backend).
   - Hypothese C: sensorId-Mapping fuer VPD in betroffenen Widgets korrigieren.

### Schritt 3: WebSocket-Verifikation

1. **WebSocket-Debug:** Browser DevTools → Network → WS → `sensor_data`-Events filtern. Nach Bug-1-Fix muss ein Event fuer `sensor_type: 'vpd'` mit korrektem `esp_id`-Format (`"ESP_..."`) und korrektem `value` ankommen.
2. VPD-Wert muss sich live aktualisieren wenn ein neuer SHT31-Wert eingeht.

### Schritt 4: Verifikation

VPD-Wert muss in allen drei Stellen korrekt erscheinen: Sensor-Card (Monitor L2), Gauge-Widget (Editor/Monitor), Komponenten-Tabelle (/sensors). Zusaetzlich: SensorCardWidget (Dashboard-Widget-Variante) pruefen.

---

## Relevante Dateien

| Bereich | Datei | Pfad im Repo |
|---------|-------|-------------|
| VPD-Berechnung (Backend) | `sensor_handler.py` → `_try_compute_vpd()` | `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` |
| VPD-Formel (Backend) | `vpd_calculator.py` | `El Servador/god_kaiser_server/src/services/vpd_calculator.py` |
| **Broadcast-Utility (Backend)** | `websocket_utils.py` → `get_device_id_for_broadcast()` | `El Servador/god_kaiser_server/src/mqtt/websocket_utils.py` |
| WebSocket-Manager (Backend) | `manager.py` | `El Servador/god_kaiser_server/src/websocket/manager.py` |
| ESP-Device-Model (Backend) | `esp.py` → Feld `device_id` (NICHT `esp_id`) | `El Servador/god_kaiser_server/src/db/models/esp.py` |
| Frontend Sensor-Store | `sensor.store.ts` | `El Frontend/src/shared/stores/sensor.store.ts` |
| Sensor-Card (Monitor L2) | `SensorCard.vue` | `El Frontend/src/components/devices/SensorCard.vue` |
| **Sensor-Card-Widget (Dashboard)** | `SensorCardWidget.vue` | `El Frontend/src/components/dashboard-widgets/SensorCardWidget.vue` |
| Gauge-Widget | `GaugeWidget.vue` | `El Frontend/src/components/dashboard-widgets/GaugeWidget.vue` |
| sensorId-Parser | `useSensorId.ts` | `El Frontend/src/composables/useSensorId.ts` |
| VPD-Defaults | `sensorDefaults.ts` (vpd: decimals=2, unit='kPa', category='air') | `El Frontend/src/utils/sensorDefaults.ts` |
| Komponenten-Tabelle | `SensorsView.vue` (Route: `/sensors`) | `El Frontend/src/views/SensorsView.vue` |

---

## Was NICHT geaendert werden darf

- Die Backend-VPD-Berechnung (`vpd_calculator.py`, Magnus-Tetens-Formel) funktioniert korrekt — NICHT anfassen.
- Die `sensorDefaults.ts` VPD-Konfiguration (decimals=2, unit='kPa', min=0, max=3, category='air') — ist korrekt.
- Die 5 VPD-Box-Annotations in `HistoricalChart.vue` (rot/gelb/gruen/gelb/rot Zonen) — sind korrekt.
- Andere Sensor-Typen (sht31_temp, sht31_humidity etc.) — nur VPD fixen.
- Die regulaere Sensor-Broadcast-Logik (ca. Zeile 479 in sensor_handler.py) — funktioniert korrekt, nutzt bereits das richtige `esp_id_str` aus dem MQTT-Topic-Parsing.

---

## Akzeptanzkriterien

### Bug 1 (Backend)
- [ ] `sensor_handler.py` VPD-Broadcast nutzt `get_device_id_for_broadcast()` oder `esp_device.device_id` — NICHT `esp_device.esp_id` (existiert nicht) oder `str(esp_device.id)` (UUID)
- [ ] WebSocket `sensor_data`-Event fuer VPD sendet `esp_id` im Format `"ESP_..."` (device_id), NICHT als UUID
- [ ] VPD-Werte aktualisieren sich live im Frontend wenn ein neuer SHT31-Wert eingeht

### Bug 2 (Frontend/API)
- [ ] VPD-Sensor-Card auf Monitor L2 zeigt den korrekten Wert (z.B. "1.19 kPa"), NICHT "0 kPa"
- [ ] VPD-Gauge-Widget zeigt den korrekten Wert
- [ ] SensorCardWidget (Dashboard-Widget-Variante) zeigt den korrekten VPD-Wert
- [ ] Komponenten-Tabelle (`/sensors`) zeigt den korrekten VPD-Wert
- [ ] Sparkline in VPD-Sensor-Card zeigt realen Verlauf (nicht flach bei 0)

### Keine Regression
- [ ] Andere Sensor-Typen (sht31_temp, sht31_humidity, etc.) zeigen weiterhin korrekte Werte
- [ ] Regulaere (nicht-VPD) Sensor-Broadcasts funktionieren unveraendert
- [ ] `vue-tsc --noEmit` und `npm run build` ohne Fehler
