## V-SS-03: Frontend-Darstellung Stale Actuator

**Erstellt:** 2026-03-10
**Modus:** B — Spezifische Code-Analyse (kein Browser-Test)
**Quellen:**
- `El Frontend/src/components/devices/ActuatorCard.vue`
- `El Frontend/src/components/devices/SensorCard.vue`
- `El Frontend/src/components/dashboard-widgets/ActuatorCardWidget.vue`
- `El Frontend/src/composables/useZoneGrouping.ts`
- `El Frontend/src/utils/formatters.ts`
- `El Frontend/src/views/MonitorView.vue`

---

**Ergebnis:** PARTIAL

---

### Offline-Indikator

- **Vorhanden:** Ja
- **Mechanismus:** CSS-Klasse `actuator-card--offline` setzt `opacity: 0.5`. Zusaetzlich ein Badge "ESP offline" mit WifiOff-Icon im Badge-Bereich.
- **Code-Stelle:**
  - Bedingung: `ActuatorCard.vue:55-57` — `isEspOffline = computed(() => !!props.actuator.esp_state && props.actuator.esp_state !== 'OPERATIONAL')`
  - CSS-Klasse: `ActuatorCard.vue:118` — `'actuator-card--offline': isEspOffline`
  - Badge: `ActuatorCard.vue:158-160` — `v-if="isEspOffline"` → `<WifiOff :size="12" /> ESP offline`
  - CSS: `ActuatorCard.vue:225-227` — `opacity: 0.5`

**Hinweis:** Die Offline-Bedingung prueft ob `esp_state` vorhanden UND ungleich `'OPERATIONAL'` ist (`!!props.actuator.esp_state && ...`). Wenn `esp_state` `undefined` oder `null` ist (z.B. bei Mock-Devices ohne system_state), wird der ESP als "online" behandelt. SensorCard prueft hingegen `props.sensor.esp_state !== undefined && props.sensor.esp_state !== 'OPERATIONAL'` — ein minimaler Unterschied: die SensorCard zeigt den Offline-Badge auch wenn `esp_state === ''` (leerer String), ActuatorCard nicht (wegen `!!`-cast).

---

### Stale-Erkennung

- **Vorhanden:** Ja
- **Threshold:** `ZONE_STALE_THRESHOLD_MS = 60_000` (1 Minute) — importiert aus `@/utils/formatters`
- **Code-Stelle:**
  - `ActuatorCard.vue:60-64` — `isStale = computed(() => { const lastSeen = props.actuator.last_seen; if (!lastSeen) return false; return Date.now() - new Date(lastSeen).getTime() > ZONE_STALE_THRESHOLD_MS })`
  - CSS-Klasse: `ActuatorCard.vue:119` — `'actuator-card--stale': isStale && !isEspOffline`
  - CSS: `ActuatorCard.vue:229-232` — `opacity: 0.7; border-left: 3px solid var(--color-warning)`
- **Datenquelle:** `last_seen` kommt aus `esp.last_seen` (ESP-Heartbeat-Timestamp), gemappt in `useZoneGrouping.ts:249`

**Kritischer Befund — Threshold-Diskrepanz:**
- ActuatorCard nutzt `ZONE_STALE_THRESHOLD_MS = 60_000` (60 Sekunden)
- SensorCard nutzt `getDataFreshness(props.sensor.last_read)` → Threshold `DATA_STALE_THRESHOLD_S = 120` (120 Sekunden)
- ActuatorCard-Stale basiert auf **ESP-Heartbeat** (`last_seen` = ESP-Ebene), SensorCard-Stale basiert auf **Sensor-Messwert-Timestamp** (`last_read` = Sensor-Ebene)
- Ein ESP, der seit 18h offline ist, hat `last_seen` = 18h alt → `isStale = true` → die Card wuerde als stale markiert. Da `isEspOffline` aber ebenfalls `true` ist (wenn `esp_state` korrekt als nicht-OPERATIONAL gesetzt), wuerde die Stale-CSS-Klasse NICHT angewendet (`isStale && !isEspOffline`). Die Offline-Klasse mit `opacity: 0.5` dominiert korrekt.

**Sekundaerer Befund — Kein Stale-Badge:**
SensorCard zeigt bei stale einen Badge mit Timestamp: `<Clock /> {{ formatRelativeTime(sensor.last_read) }}`. ActuatorCard hat bei Stale-Zustand keinen entsprechenden Badge — nur die visuellen CSS-Indikatoren (opacity + border-left). Der User sieht nicht "wann" der Aktor zuletzt gesehen wurde.

---

### Toggle-Button bei Offline

- **Deaktiviert:** Nein — FEHLT
- **Code-Stelle:** `ActuatorCard.vue:165-172`

```
<button
  v-if="mode !== 'monitor'"
  class="btn-secondary btn-sm flex-shrink-0 touch-target"
  :disabled="actuator.emergency_stopped"
  @click="handleToggle"
>
```

Der Toggle-Button ist nur bei `emergency_stopped` deaktiviert. Weder `isEspOffline` noch `isStale` fuehren zu einem `:disabled`. Ein User koennte den Toggle-Button betaetigen, obwohl der ESP seit 18h offline ist — der Command wuerde per WebSocket/MQTT gesendet, aber nie ausgefuehrt.

**SensorCard-Vergleich:** SensorCard hat keinen Toggle-Button (Sensoren sind read-only), daher kein analoges Problem. Das Fehlen der Offline-Deaktivierung ist ein ActuatorCard-spezifischer Befund ohne Pendant in SensorCard.

---

### Widget-Version (ActuatorCardWidget.vue)

- **Offline-Indikator:** Nicht vorhanden
- **Stale-Erkennung:** Nicht vorhanden
- **Toggle-Deaktivierung bei Offline:** Nicht vorhanden
- **Code-Stelle:** `ActuatorCardWidget.vue` — nutzt `MockActuator` direkt aus dem ESP Store, kein `ActuatorWithContext`. Der Widget hat Zugang zum esp-Store (`useEspStore()`), aber kein `esp_state` oder `last_seen` wird ausgewertet.

Das Widget ist die Dashboard-Version und faellt komplett hinter ActuatorCard zurueck — keinerlei Stale- oder Offline-Signalisierung.

---

### Paritaet mit SensorCard

- **Gleiche Mechanismen:** Teilweise (PARTIAL)

| Mechanismus | SensorCard | ActuatorCard | Status |
|-------------|-----------|--------------|--------|
| Offline-CSS-Klasse (opacity 0.5) | `sensor-card--esp-offline` | `actuator-card--offline` | Paritaet OK |
| Offline-Badge (WifiOff) | `sensor-card__badge--offline` | `actuator-card__badge--offline` | Paritaet OK |
| Stale-CSS-Klasse (opacity 0.7 + border-left) | `sensor-card--stale` | `actuator-card--stale` | Paritaet OK |
| Stale-Badge mit Timestamp | `<Clock /> formatRelativeTime(last_read)` | **Fehlt** | DISKREPANZ |
| Stale-Threshold-Basis | `last_read` (Sensor-Messwert, 120s) | `last_seen` (ESP-Heartbeat, 60s) | Verschiedene Semantik |
| "Zeitpunkt unbekannt"-Badge | Vorhanden (`isTimestampUnknown`) | **Fehlt** | DISKREPANZ |
| Quality-Dot (Stale overrides quality) | Vorhanden (`effectiveQualityStatus`) | **Fehlt** (kein Quality-Dot) | Strukturell anders |
| Offline-Bedingung (`!!`-Unterschied) | `esp_state !== undefined && !== 'OPERATIONAL'` | `!!esp_state && !== 'OPERATIONAL'` | Minimale Diskrepanz |

**Unterschiede zusammengefasst:**

1. **Stale-Badge fehlt:** ActuatorCard zeigt bei Stale kein Badge mit relativem Timestamp. SensorCard zeigt `<Clock /> vor 5 min`. Der User weiss nicht, wann der Aktor zuletzt gesehen wurde.

2. **Toggle nicht deaktiviert bei Offline/Stale:** Kritischster Unterschied. SensorCard hat kein Toggle — das Problem existiert nur in ActuatorCard. Ein Aktor-Toggle fuer einen offline ESP wuerde einen ineffektiven Command abschicken.

3. **Threshold-Semantik unterschiedlich:** SensorCard misst Freshness des Messwerts (120s). ActuatorCard misst ESP-Heartbeat-Freshness (60s). Das ist intentional unterschiedlich (Aktoren haben keinen eigenen Messwert-Timestamp), aber die 60s vs. 120s-Grenze ist inkonsistent.

4. **Widget (ActuatorCardWidget) ohne jede Stale-/Offline-Logik:** Kompletter Blind Spot im Dashboard.

---

### Bewertung

**Root Cause des Backend-Befunds (state=on bei offline ESP):**

Der Server liefert `state=on` ohne Stale-Markierung in der API-Response. Das Frontend hat keine Information ob ein `state=on` aktuell oder stale ist — es kann nur anhand des `last_seen`-Timestamps des ESP ableiten, ob der Aktor-Zustand vertrauenswuerdig ist. Die aktuelle Stale-Logik macht das korrekt (1-Minuten-Threshold), zeigt es aber nicht deutlich genug an.

**Schwere:**
- Fehlendes Toggle-Disable bei Offline: **Hoch** — User-Action auf totem ESP moeglich
- Kein Stale-Badge mit Timestamp: **Mittel** — visuelle Inkonsistenz zu SensorCard
- Widget ohne Stale-Logik: **Mittel** — Dashboard-Widgets zeigen stale State ohne Warnung
- Offline-Bedingung `!!`-Unterschied: **Niedrig** — Edge Case bei leerem String

**Naechste Schritte:**
1. Toggle-Button in ActuatorCard bei `isEspOffline || isStale` deaktivieren: `:disabled="actuator.emergency_stopped || isEspOffline || isStale"`
2. Stale-Badge mit relativem Timestamp hinzufuegen (analog zu SensorCard)
3. ActuatorCardWidget: `esp_state` und `last_seen` aus dem Store lesen und Offline-Indikator ergaenzen
