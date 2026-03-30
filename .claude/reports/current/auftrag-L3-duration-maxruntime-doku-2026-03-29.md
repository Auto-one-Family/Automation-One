## Auftrag L3: Duration/MaxRuntime — UI-Labels und Tooltips

**Ziel-Repo:** auto-one (El Frontend)
**Kontext:** Im Live-System (Pi 5 mit SHT31 + Luftbefeuchter) wurden zwei unabhaengige Sicherheitsmechanismen fuer Aktoren identifiziert, die im Frontend unterschiedlich konfiguriert werden, aber verwechslungsanfaellig beschriftet sind. Dieser Auftrag klaert die UI-Sprache fuer beide Mechanismen.
**Bezug:** Phase L3 der Logic Engine Produktion Roadmap — folgt auf L1 (Live-Verifikation dass Duration-Timer funktioniert)
**Prioritaet:** Mittel
**Datum:** 2026-03-29
**Geschaetzter Aufwand:** ~1h
**Zustaendiger Agent:** frontend-dev

---

### Ist-Zustand

Das Frontend zeigt zwei Felder an zwei verschiedenen Stellen, die beide mit "Laufzeit" oder "Auto-Abschaltung" assoziiert werden, aber voellig unterschiedliche Mechanismen repraesentieren:

**Stelle 1 — RuleConfigPanel (Logic Engine Rule Editor):**
- Feld: `duration` im Aktor-Action-Node (Frontend nutzt `localData.duration`; Backend-Alias `duration_seconds` existiert nur in `logic.ts:94` und wird in `RuleFlowEditor.vue:684` gemappt)
- Aktuelle Beschriftung: "Auto-Abschaltung (Sek.)" (RuleConfigPanel.vue:651)
- Was es wirklich ist: Ein Regel-spezifischer Timer, der pro Ausfuehrung gilt. Wenn die Regel feuert und der Aktor ON schaltet, sendet das Backend im MQTT-Payload `{"command": "ON", "value": 1.0, "duration": 15}`. Die Firmware empfaengt das und setzt intern einen Timer `command_duration_end_ms`. Nach Ablauf schaltet die Firmware den Aktor automatisch und sauber auf OFF — der Aktor ist danach sofort wieder verfuegbar fuer neue Befehle. Wert 0 = kein Timer, Aktor laeuft bis manuelles OFF oder andere Regel.

**Stelle 2 — ActuatorConfigPanel (Geraetekonfiguration):**
- Feld: `max_runtime_seconds` (Frontend: `maxRuntime` in ActuatorConfigPanel.vue:81, gespeichert als `config.max_runtime_seconds` in Zeile 336)
- Aktuelle Beschriftung Pump: "Max. Laufzeit (Safety)" + Helper "Pumpe schaltet IMMER nach dieser Zeit ab" (ActuatorConfigPanel.vue:491,496). Valve: "Max. Offen-Zeit (Safety)" (Zeile 510).
- Accordion "Laufzeit & Wartung" (Zeile 626) = RuntimeMaintenanceSection — zeigt Uptime/Wartungslog, KEIN max_runtime-Feld. Die max_runtime-Felder stehen in der Pump- bzw. Valve-Sektion weiter oben.
- Was es wirklich ist: Ein absolutes Sicherheitslimit auf dem Geraet selbst, das unabhaengig von jeder Regel wirkt. Es wird beim Config-Push in der Firmware-Konfiguration hinterlegt (`runtime_protection.max_runtime_ms` — Firmware intern in Millisekunden). Die Firmware zaehlt akkumulierte Laufzeit im `processActuatorLoops()`-Zyklus. Wenn das Limit erreicht wird, loest die Firmware einen Emergency Stop aus — der Aktor bleibt gesperrt bis `clearEmergencyStop()` explizit aufgerufen wird. Default: 3600 Sekunden = 1 Stunde. Frontend-Einheit: Sekunden.

**Problem:** Ein Nutzer, der eine Hysterese-Regel mit 30s Duration konfiguriert, weiss nicht ob das Feld in der Regel oder in der Geraetekonfiguration gemeint ist, wenn beide "Laufzeit" heissen. Die Hierarchie ist unklar.

---

### Systemkontext (fuer Entscheidungen im Code)

Die Daten fliessen wie folgt:

```
Rule Duration (duration):
  RuleConfigPanel (localData.duration) → Backend Rule-Speicherung (duration_seconds Alias)
  → ActuatorActionExecutor.execute() liest action.get("duration_seconds")
  → actuator_service.send_command(..., duration=duration_seconds)
  → MQTT Payload: {"command": "ON", "duration": 15}
  → Firmware: command_duration_end_ms Timer
  → Firmware: Clean OFF nach Ablauf ✅
  → Aktor sofort wieder verfuegbar ✅

Device Max Runtime (max_runtime_seconds):
  ActuatorConfigPanel (maxRuntime) → Backend actuator_configs.safety_constraints
  → Config-Push an ESP (MQTT config topic)
  → Firmware: runtime_protection.max_runtime_ms persistiert (intern ms)
  → Firmware: processActuatorLoops() zaehlt akkumulierte Laufzeit
  → Bei Ueberschreitung: Emergency Stop ❗
  → Aktor gesperrt bis clearEmergencyStop() ❗
```

Hierarchie: Duration laeuft IMMER zuerst ab (wenn > 0 gesetzt). Max Runtime ist der absolute Fallback-Schutz, der greift wenn Duration nicht gesetzt ist oder bei manuellen Befehlen ohne Duration.

---

### Was getan werden muss

Ein Nutzer soll auf einen Blick verstehen:
1. Im Rule Editor: "Wie lange laeuft der Aktor maximal bei DIESER Regel-Ausfuehrung?"
2. Im Aktor-Konfig-Panel: "Ab wann schaltet die Geraete-Sicherheit ein — unabhaengig von Regeln?"

Beide Mechanismen sind notwendig und sinnvoll. Sie duerfen nicht zusammengefuehrt oder einer entfernt werden. Die Beschriftung muss den Unterschied klar machen.

---

### Technische Details

**Betroffene Schichten:**
- [x] Frontend (El Frontend) — ausschliesslich Label- und Tooltip-Aenderungen
- [ ] Backend (El Servador) — kein Aenderungsbedarf
- [ ] Firmware (El Trabajante) — kein Aenderungsbedarf

**Betroffene Komponenten:**

| Komponente | Pfad (relativ zu El Frontend/src) | Feld | Aktion |
|-----------|----------------------------------|------|--------|
| RuleConfigPanel | `components/rules/RuleConfigPanel.vue` | `duration` im Aktor-Action-Node (Zeile 651-662) | Label + Tooltip aendern |
| ActuatorConfigPanel | `components/esp/ActuatorConfigPanel.vue` | `maxRuntime` in Pump-Sektion (Zeile 491) + `maxOpenTime` in Valve-Sektion (Zeile 510) | Label + Tooltip aendern (zwei Stellen) |

**Was konkret geaendert werden muss:**

#### L3-FE-1: RuleConfigPanel — duration

IST: Das Feld ist beschriftet mit "Auto-Abschaltung (Sek.)" — der Bezug zur Regel-Ausfuehrung ist nicht klar.

SOLL:
- **Label:** "Maximale Laufzeit pro Ausfuehrung (Sek.)"
- **Tooltip / Hilfstext:** "Wie lange der Aktor maximal laeuft, wenn diese Regel ausfeuert. Nach Ablauf schaltet die Firmware den Aktor automatisch aus. 0 = kein Limit fuer diese Regel (Geraete-Sicherheitslimit greift dann als Fallback)."
- Placeholder bleibt: `0` (unbegrenzt)
- Einheit-Suffix bleibt oder wird hinzugefuegt: "Sek."

#### L3-FE-2: ActuatorConfigPanel — max_runtime_seconds

IST: Pump: "Max. Laufzeit (Safety)" + "Pumpe schaltet IMMER nach dieser Zeit ab" (Zeile 491/496). Valve: "Max. Offen-Zeit (Safety)" (Zeile 510). Zwei aktortyp-spezifische Stellen.

SOLL:
- **Label:** "Geraete-Sicherheitslimit (unabhaengig von Regeln)"
- **Subtext oder zweite Zeile:** "Sekunden — greift auch bei manuellen Befehlen"
- **Tooltip / Hilfstext:** "Absolute Sicherheitsgrenze auf dem Geraet. Wenn der Aktor die konfigurierte Laufzeit ueberschreitet (auch ohne Regel), loest die Firmware einen Emergency Stop aus. Der Aktor bleibt gesperrt bis der Stop manuell zurueckgesetzt wird. Standard: 3600 Sekunden = 1 Stunde."
- Einheit bleibt Sekunden (Frontend konvertiert nicht — Backend erwartet `max_runtime_seconds`)
- **Beide Stellen** (Pump + Valve) muessen aktualisiert werden

#### L3-FE-3: Warnung wenn Duration > Max Runtime (optional, nach Einschaetzung umsetzen)

Wenn beide Werte gleichzeitig konfigurierbar sind oder referenzierbar (z.B. wenn `max_runtime_seconds` aus dem Aktor-Konfig im RuleConfigPanel bekannt ist), kann eine Frontend-Validierung helfen:

Bedingung: `duration > max_runtime_seconds && max_runtime_seconds > 0` (beide Felder sind in Sekunden — keine Konvertierung noetig)

Warnung (kein Error, kein Blocker): "Hinweis: Die Regel-Laufzeit ueberschreitet das Geraete-Sicherheitslimit. Das Limit wird vor dem Ablauf der Regel-Dauer greifen."

**Nur umsetzen wenn:** `max_runtime_seconds` des referenzierten Aktors zum Zeitpunkt der Regel-Bearbeitung bereits im Store verfuegbar ist (kein zusaetzlicher API-Call). Wenn nicht direkt verfuegbar, diese Teilaufgabe weglassen.

---

### Akzeptanzkriterien

- [ ] `RuleConfigPanel.vue`: Feld `duration` (Zeile 651) zeigt Label "Maximale Laufzeit pro Ausfuehrung (Sek.)" (oder sinngleiche deutsche Formulierung)
- [ ] `RuleConfigPanel.vue`: Tooltip oder Hilfstext erklaert den Mechanismus (Clean OFF nach Ablauf, Aktor sofort wieder verfuegbar)
- [ ] `ActuatorConfigPanel.vue`: Feld `maxRuntime` (Pump, Zeile 491) UND `maxOpenTime` (Valve, Zeile 510) zeigen Label "Geraete-Sicherheitslimit (unabhaengig von Regeln)" (oder sinngleiche Formulierung)
- [ ] `ActuatorConfigPanel.vue`: Tooltip oder Hilfstext erklaert Emergency Stop (Aktor gesperrt bis manueller Reset) — fuer BEIDE Stellen (Pump + Valve)
- [ ] Kein Nutzer-Test noetig: Der Unterschied beider Mechanismen ist allein aus den Labels und Tooltips erkennbar
- [ ] Kein Breaking Change: Keine Feldnamen, API-Typen, Props oder Datenstrukturen werden geaendert — ausschliesslich Text

---

### Einschraenkungen — Was NICHT geaendert wird

- **Kein Backend-Change:** `duration` (Frontend) / `duration_seconds` (Backend-Alias) und `max_runtime_seconds` behalten ihre Namen in DB, API und Store
- **Kein Firmware-Change:** Timer-Logik und Emergency-Stop-Verhalten bleiben unveraendert
- **Kein Zusammenfuehren:** Die Felder werden nicht in eine gemeinsame Komponente zusammengezogen
- **Kein Fallback-Verhalten aendern:** Es wird KEIN Fallback implementiert (`duration = action.duration_seconds or config.max_runtime_seconds`). Das waere eine Verhaltensaenderung und gehoert nicht in diesen Auftrag.
- **Nur Labels und Tooltips:** Keine Layoutaenderungen, keine neuen Validierungen ausser optionalem L3-FE-3

---

### Referenzen (im auto-one Repo)

| Datei | Relevanz |
|-------|----------|
| `El Frontend/src/components/rules/RuleConfigPanel.vue` | L3-FE-1: duration Label (Zeile 651) |
| `El Frontend/src/components/esp/ActuatorConfigPanel.vue` | L3-FE-2: max_runtime_seconds Label (Zeile 491 Pump, Zeile 510 Valve) |
| `El Trabajante/docs/system-flows/03-actuator-command-flow.md` (Zeile 239) | Datenfluss Rule → ESP (Referenz, kein Aenderungsbedarf) |
| `El Servador/.../services/logic/actions/actuator_executor.py` | duration_seconds → duration Mapping (Referenz) |

---

### Abhaengigkeit

Dieser Auftrag setzt voraus, dass **L1 (Live-Verifikation)** abgeschlossen ist und bestaetigt hat, dass der Duration-Timer in der Firmware korrekt funktioniert (F1 ist gefixt). Nur dann ist der Tooltip-Text "Clean OFF nach Ablauf" faktisch korrekt und kein potentiell irrefuehrendes Versprechen.

Wenn L1 noch laeuft: L3 kann parallel vorbereitet werden, aber erst mergen wenn L1 bestaetigt ist.

---

### Offene Punkte

- Aktuelle Wortlaute der Felder im Code sind bekannt: RuleConfigPanel:651 "Auto-Abschaltung (Sek.)", ActuatorConfigPanel:491 "Max. Laufzeit (Safety)", ActuatorConfigPanel:510 "Max. Offen-Zeit (Safety)"
- L3-FE-3 (Warnung) nur umsetzen wenn max_runtime_seconds ohne zusaetzlichen API-Call verfuegbar ist; sonst weglassen und als Notiz hinterlassen
