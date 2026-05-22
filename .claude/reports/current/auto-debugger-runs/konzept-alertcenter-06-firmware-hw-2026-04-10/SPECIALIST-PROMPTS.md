# SPECIALIST-PROMPTS — STEUER 06 (rollenweise)

**Run:** `konzept-alertcenter-06-firmware-hw-2026-04-10`  
**Git (Orchestrator):** Branch `auto-debugger/work` verifiziert.

---

## esp32-dev — PKG-01 + optional PKG-02

### Kontext

STEUER 06 (`artefact_improvement`): Firmware-Pfad für `system/error`-Publish — IST in `error_tracker.cpp`, Callback in `main.cpp`, Publish-Pfad in `mqtt_client` (kritische Topics inkl. `system/error`). Konzept §5.4 / §7.4; Abnahme nicht allein Wokwi bei I/O/NVS/Timing.

### Auftrag

1. **PKG-01:** IST bestätigen: Topic über `TopicBuilder::buildSystemErrorTopic`, Payload-Felder, Arduino-`String`-Stellen, Throttle-Verhalten; Abgleich mit `error_handler.py` nur **lesen** (keine Server-Logik duplizieren). Befunde an Task-Paket/Verify-Report anbinden.
2. **PKG-02 (optional):** Nur wenn TM priorisiert — minimale Reduktion von `String` im MQTT-Error-Publish-Pfad, Konventionen `firmware.mdc`, keine SafetyController-Änderungen.

### Dateien (vollständige Pfade)

- `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante\src\error_handling\error_tracker.cpp`
- `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante\src\error_handling\error_tracker.h`
- `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante\src\main.cpp` (Callback `errorTrackerMqttCallback`)
- `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante\src\utils\topic_builder.cpp` / `topic_builder.h`
- Lesend: `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\src\mqtt\handlers\error_handler.py`

### Git (Pflicht)

- Arbeitsbranch: **auto-debugger/work**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)

- Vor Code: per `Grep`/`Glob` die **closest existing implementation** im gleichen Layer nennen und **dort** anbinden — hier: bestehende `publishErrorToMqtt` / `TopicBuilder` / MQTT-Publish-Queue-Patterns in `mqtt_client.cpp`.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

- Firmware liefert **nur** MQTT `system/error` → Server erzeugt u. a. WS `error_event` — **keine** ISA-Inbox-Notification über diesen Pfad. Alert-Center-/Notification-Ketten sind getrennt; keine Vermischung der Root-Cause in Reports.

### Verify-Befehl (Pflicht)

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
pio run -e seeed_xiao_esp32c3
```

Nach jedem Fix denselben Befehl erneut — Exit-Code 0.

### Fehler-Register (Pflicht bei Code)

- Pro Fehler: Evidenz → Hypothese → Minimalfix → gleicher Verify-Befehl; Einträge in `FEHLER-REGISTER.md` im Run-Ordner.

---

## Operator / Robin — PKG-03 (Hardware)

### Auftrag

Konzept §7.4 ausfüllen: `esp_id` festhalten, Build flashen, MQTT-Connect, Fehler reproduzieren, Trace sichern. Bei fehlender Hardware: BLOCKER-Text im `VERIFY-PLAN-REPORT` akzeptieren oder `HW-PROTOKOLL.md` nachliefern.

### Verify

- Kein Ersatz für Firmware-Build; ergänzend: manueller Nachweis (Serial/MQTT-Log/Server-Log).

---

*Ende SPECIALIST-PROMPTS.*
