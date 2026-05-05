# TASK-PACKAGES — impl-plan-esp32-logging-nvs-trace-2026-04-11

**Git (Lagebild):** Branch Soll `auto-debugger/work` — vor Arbeit `git checkout auto-debugger/work` und `git branch --show-current` prüfen.

## PKG-01 — Serial-Trace MQTT / NVS / Config / Heartbeat

| Feld | Inhalt |
|------|--------|
| **Owner** | esp32-dev |
| **Risiko** | Serial-Last, 128-Byte-Logger-Puffer, keine Secrets in Logs |
| **Quelle** | `implementierungsplan-PKG-ESP-LOG-NVS-TRACE-2026-04-11.md` (Matrix L01–L14) |
| **Verify** | `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante"; pio run -e esp32_dev` |
| **Abhängigkeiten** | keine |

### Akzeptanzkriterien

1. Matrix-Zeilen L01–L14 sind umgesetzt oder im PR-Kommentar begründet abgewichen (mit Anker-Verweis).
2. Keine Änderung an MQTT-Topics, QoS, JSON-Schemata.
3. `pio run -e esp32_dev` Exit-Code 0.
4. Alle Commits nur auf Branch **`auto-debugger/work`**; kein Commit auf `master`.

### Verify-Anpassungen (nach Gate)

- TAG in `config_update_queue.cpp`: bestehenden `SYNC` (`CFG_Q_TAG`) verwenden.
- Optional: `IST-ESP-MQTT-NVS-TRACEPOINTS.md` nachziehen wenn Vor-STEUER abgeschlossen — nicht Teil von PKG-01 Done.

---

*Ende TASK-PACKAGES*
