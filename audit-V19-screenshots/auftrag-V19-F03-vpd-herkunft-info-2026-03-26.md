# V19-F03 — VPD-Herkunfts-Information im UI anzeigen

> **Typ:** UX-Verbesserung (Frontend)
> **Erstellt:** 2026-03-26
> **Prioritaet:** MEDIUM
> **Geschaetzter Aufwand:** ~1-2h
> **Abhaengigkeit:** V19-F01 (VPD-Anzeige muss erst funktionieren)

---

## Kontext

### Was ist VPD und warum ist Transparenz wichtig?

VPD (Vapor Pressure Deficit, Dampfdruckdefizit) ist kein direkt gemessener Wert, sondern wird aus Temperatur und Luftfeuchtigkeit berechnet. Die Formel (Magnus-Tetens Air-VPD):

```
SVP = 0.6108 * exp((17.27 * T) / (T + 237.3))   # Saettigungsdampfdruck in kPa
VPD = SVP * (1 - RH / 100)                        # Dampfdruckdefizit in kPa
```

VPD ist ein ueberlegener Klimaparameter gegenueber reinen Feuchte-Messungen, weil er Temperatur- und Luftfeuchte-Information integriert. Professionelle CEA-Plattformen (AROYA, Pulse Pro) behandeln VPD als primaere Leit-Metrik. Dieser Mehrwert erschliesst sich dem Nutzer aber nur, wenn er versteht, dass der Wert aus zwei anderen Sensoren berechnet wird.

### Wie VPD in AutomationOne erzeugt wird

Im Backend (El Servador, FastAPI) laeuft nach jedem SHT31-Sensor-Datensatz automatisch eine VPD-Berechnung. Der Ausloeser ist die Funktion `_try_compute_vpd()` im `sensor_handler`-Modul. Das Ergebnis wird als eigenstaendige Sensor-Daten-Zeile gespeichert:

- `sensor_type = 'vpd'`
- `interface_type = 'VIRTUAL'`
- `processing_mode = 'computed'`
- GPIO-Wert entspricht dem des ausloesenden SHT31-Sensors

Gleichzeitig wird eine `sensor_config`-Zeile automatisch angelegt, damit der VPD-Sensor wie ein normaler Sensor im System erscheint. Er taucht damit im Sensor-Dropdown, in den Sensor-Cards des Monitor-Views und im HistoricalChart auf — ohne dass der Nutzer ihn manuell angelegt hat.

### Das UX-Problem

Ein Nutzer sieht auf Monitor L2 eine Sensor-Card "VPD (berechnet)" mit einem Wert in kPa. Nirgends steht:
- **Aus welchen Sensoren** der VPD berechnet wurde (Temperatur + Luftfeuchtigkeit desselben SHT31)
- **Warum der Wert kPa hat** und was das bedeutet
- **Warum "berechnet"** — es gibt keinen physischen VPD-Sensor, der Wert ist ein Derivat

Das Label "(berechnet)" ist der einzige Hinweis. Das reicht nicht fuer einen Gaertner oder Grower, der dem Wert vertrauen und handeln soll. Progressive Offenlegung — Details nur auf Nachfrage — ist hier die richtige Antwort: kein Informationsueberfluss im Normalzustand, aber ein klar sichtbares Info-Element das bei Bedarf die Herkunft erklaert.

---

## IST-Zustand

- **Sensor-Card (Monitor L2):** Zeigt "VPD (berechnet)" als Titel, Wert in kPa, ESP-Name, Subzone-Name. Kein Tooltip, kein Info-Icon, kein Hinweis auf Quell-Sensoren.
- **Komponenten-Tab (/sensors):** Zeigt "VIRTUAL" als Interface-Typ, aber die Spalte ist nicht prominent sichtbar und erklaert die Herkunft nicht.
- **HistoricalChart:** Zeigt die VPD-Zeitreihe mit 5 farbigen Zonen (rot/gelb/gruen/gelb/rot aus `chartjs-plugin-annotation`), aber ohne Erklaerung welche Sensoren zugrunde liegen.
- **TypeScript-Typ:** `MockSensor.interface_type` in `src/types/index.ts` umfasst aktuell nur `'I2C' | 'ONEWIRE' | 'ANALOG' | 'DIGITAL' | null`. Der Wert `'VIRTUAL'` wird vom Backend bereits so zurueckgeliefert, ist aber im Frontend-Typ noch nicht deklariert — fuehrt zu TypeScript-Warnings.

---

## SOLL-Zustand

### Info-Icon mit Tooltip auf der Sensor-Card (empfohlen)

Neben dem Titel "VPD (berechnet)" erscheint ein kleines Lucide `Info`-Icon (14px). Bei Hover (Desktop) oder Klick (Touch) zeigt sich ein Tooltip:

```
Berechnet aus:
• Temperatur (SHT31)
• Luftfeuchtigkeit (SHT31)
Formel: Magnus-Tetens (Air-VPD)
```

Das Info-Icon erscheint **ausschliesslich bei virtuellen Sensoren** (`interface_type === 'VIRTUAL'`). Physische Sensoren (sht31_temp, sht31_humidity, ph, ec etc.) bekommen kein Info-Icon.

### Quell-Sensor-Identifikation (statische Zuordnung im Frontend)

Die Quell-Sensoren muessen **nicht per API abgefragt** werden. Die Zuordnung ist folgendermassen abgeleitet:

- VPD-Sensoren haben immer `sensor_type = 'vpd'`.
- VPD wird aktuell ausschliesslich aus SHT31-Sensoren berechnet. SHT31 liefert zwei Sub-Typen: `sht31_temp` (Temperatur) und `sht31_humidity` (Luftfeuchtigkeit).
- Die Quell-Sensoren befinden sich auf demselben ESP wie der VPD-Sensor (gleiche `esp_id`).
- Eine statische Mapping-Tabelle in `src/utils/sensorDefaults.ts` oder einem neuen `virtualSensorMeta`-Objekt genuegt fuer die aktuelle Implementierung.

Beispiel fuer das Mapping:

```typescript
const VIRTUAL_SENSOR_META: Record<string, { sources: string[]; formula: string }> = {
  vpd: {
    sources: ['Temperatur (SHT31)', 'Luftfeuchtigkeit (SHT31)'],
    formula: 'Magnus-Tetens (Air-VPD)',
  },
};
```

Spaetere virtuelle Sensoren (z.B. Taupunkt, Growing Degree Days) koennen denselben Mechanismus nutzen.

### TypeScript-Typ-Erweiterung (Pflicht)

`interface_type` in `src/types/index.ts` beim `MockSensor`-Interface muss `'VIRTUAL'` als gueltigen Wert erhalten:

```typescript
interface_type: 'I2C' | 'ONEWIRE' | 'ANALOG' | 'DIGITAL' | 'VIRTUAL' | null;
```

Das Pydantic-Backend-Schema (`SensorCreate`) muss **nicht** angepasst werden — `VIRTUAL`-Sensoren werden nur intern vom Backend erzeugt, nie ueber die Create-API. Nur der Response-Typ im Frontend muss stimmen.

---

## Vorgehen

1. **TypeScript-Typ erweitern:** In `src/types/index.ts` beim `MockSensor`-Interface `'VIRTUAL'` zu `interface_type` hinzufuegen.

2. **Mapping-Tabelle anlegen:** In `src/utils/sensorDefaults.ts` (oder einer neuen kleinen Utility-Datei) das `VIRTUAL_SENSOR_META`-Objekt mit den Quell-Informationen fuer `vpd` anlegen.

3. **Sensor-Card erweitern:** In der Sensor-Card-Komponente (vermutlich `SensorCard.vue` oder `SensorDataCard.vue` in `components/monitor/`): Wenn `sensor.interface_type === 'VIRTUAL'` und ein Eintrag in `VIRTUAL_SENSOR_META[sensor.sensor_type]` existiert, ein Lucide `Info`-Icon (14px) neben dem Titel rendern.

4. **Tooltip implementieren:** Tooltip-Inhalt aus `VIRTUAL_SENSOR_META` befuellen. Styling mit bestehenden Design-Tokens (Details unten). Desktop: `:hover` auf Icon. Touch: Klick-Toggle.

5. **Bauen und pruefen:** `vue-tsc --noEmit` und `npm run build` muessen ohne Fehler durchlaufen.

---

## Styling-Vorgaben

Das Design-System nutzt semantische CSS-Tokens ohne `--ao-*`-Prefix. Massgebliche Tokens fuer diese Aenderung:

| Zweck | Token |
|-------|-------|
| Icon-Farbe (gedaempft) | `var(--color-text-muted)` |
| Abstand Icon zu Titel | `var(--space-1)` (4px) |
| Tooltip-Hintergrund | `var(--glass-bg)` |
| Tooltip-Border | `var(--glass-border)` |
| Tooltip-Text | `var(--color-text-secondary)` |

Tooltip mit `backdrop-filter: blur(8px)` analog zur Hover-Toolbar in `InlineDashboardPanel.vue` (dort: Klasse `widget-hover-toolbar`). Kein neues CSS-Konzept einfuehren — dasselbe Glassmorphism-Pattern das bereits im System existiert.

Mindest-Touch-Target fuer das Info-Icon: 32x32px (Padding um das 14px-Icon herum).

---

## Was NICHT geaendert werden darf

- Die Sensor-Card-Struktur fuer physische Sensoren — keine Info-Icons fuer sht31_temp, ph, ec etc.
- Die VPD-Berechnungslogik im Backend (`sensor_handler._try_compute_vpd()`).
- Die VPD-Box-Annotations in `HistoricalChart.vue` (5 farbige Zonen) — bleiben unveraendert.
- Kein neuer API-Endpoint. Alle Informationen kommen aus dem bestehenden Sensor-Config-Response (der `interface_type` bereits enthaelt) plus der statischen Mapping-Tabelle.
- Keine Aenderungen an anderen Widget-Typen (HistoricalChart, MultiSensorChart, GaugeWidget etc.).

---

## Akzeptanzkriterien

- [ ] VPD-Sensor-Card auf Monitor L2 zeigt ein Lucide `Info`-Icon (14px) neben dem Titel
- [ ] Hover/Klick auf das Icon zeigt einen Tooltip mit Quell-Sensoren ("Temperatur (SHT31)", "Luftfeuchtigkeit (SHT31)") und Formel ("Magnus-Tetens (Air-VPD)")
- [ ] Das Info-Icon erscheint NUR bei `interface_type === 'VIRTUAL'`, nicht bei physischen Sensoren
- [ ] `MockSensor.interface_type` in `src/types/index.ts` enthaelt `'VIRTUAL'` als gueltigen Wert
- [ ] `vue-tsc --noEmit` laeuft ohne TypeScript-Fehler durch
- [ ] `npm run build` laeuft ohne Fehler durch
- [ ] Tooltip nutzt ausschliesslich bestehende Design-Tokens (`--glass-bg`, `--glass-border`, `--color-text-muted`, `--space-1`) — kein neues CSS
