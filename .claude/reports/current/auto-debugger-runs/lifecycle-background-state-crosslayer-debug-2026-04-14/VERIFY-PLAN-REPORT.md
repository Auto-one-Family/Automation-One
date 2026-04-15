# VERIFY-PLAN-REPORT

Run-ID: `lifecycle-background-state-crosslayer-debug-2026-04-14`  
Kontext: Verify-Gate fuer `TASK-PACKAGES.md` im selben Run-Ordner

## /verify-plan Ergebnis

**Plan:** Chirurgische P0/P1-Maßnahmen für Lifecycle-Konflikte (Delete vs Hintergrundprozesse) in Server/DB/Frontend/Firmware.  
**Geprüft:** 14 Pfade, 4 Rollen, 0 neue Services, 0 neue externe Abhängigkeiten.

### Bestätigt
- Alle referenzierten Kernpfade existieren.
- Paketaufteilung entlang der Schichten ist konsistent.
- Keine Breaking-Contract-Änderung als Pflichtannahme enthalten.
- Branch-Vorgabe `auto-debugger/work` ist in allen PKGs als Akzeptanzkriterium hinterlegt.

### Korrekturen/Schärfungen
1. **PKG-01** muss Restore-Policy explizit als konfigurierbare Entscheidung behandeln (nicht hart „restore off“).
2. **PKG-02** braucht klare Trennung „Runtime-Liste“ vs „Historienansicht“, damit keine stillen Regressionen bei Reports entstehen.
3. **PKG-03** sollte Route-Fallback nur dann triggern, wenn Gerät wirklich nicht mehr im Store vorhanden ist (kein aggressives Redirect).
4. **PKG-05** braucht Hinweis auf Error-Code-Dokumentation (`.claude/reference/errors/ERROR_CODES.md`) falls neue Codes entstehen.

### Fehlende Vorbedingungen
- Business-Entscheidung zur Restore-Policy (Delete final vs. Auto-Restore) liegt noch nicht final vor.
- Für Firmware-Telemetrie muss geklärt sein, ob neuer Error-Code-Bereich genutzt wird oder nur bestehende Codes erweitert werden.

### Zusammenfassung
Der Plan ist ausführbar, sofern die Restore-Policy vor Implementierung final entschieden wird. Die Pakete wurden auf minimal-invasive Änderungen geschärft und können rollenweise umgesetzt werden.

## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

### PKG → Delta
| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-01 | `heartbeat_handler.py`, `esp.py`, `sensor_handler.py`; Risiko: Restore-Verhalten; Reihenfolge zuerst; Test: Heartbeat nach Delete + normaler Reconnect getrennt verifizieren. |
| PKG-02 | `sensor_repo.py` plus betroffene Reader; Delta: Filterstrategie dokumentieren (`runtime_only` vs `include_deleted`); Test: Listen-Endpunkte gegen soft-deleted Geräte. |
| PKG-03 | `HardwareView.vue` (optional `esp.ts`); Delta: L2->L1 Fallback nur bei `selectedDevice===null`; Test: Delete aus L2 ohne visuelle Regression. |
| PKG-04 | `ZonePlate.vue`, `DeviceMiniCard.vue`; Delta: Emit-Signaturen konsolidieren; Test: Delete-Click-Pfad L1, kein Doppeltrigger. |
| PKG-05 | `main.cpp`, `mqtt_client.cpp`, `sensor_command_queue.cpp`; Delta: Revocation-Outcome/Logs, ggf. Error-Code-Doku; HW-Gate: Wokwi/Hardware-Szenario separat markieren. |

### PKG → empfohlene Dev-Rolle
| PKG | Rolle (z. B. server-dev, frontend-dev, esp32-dev, mqtt-dev) |
|-----|---------------------------------------------------------------|
| PKG-01 | server-dev |
| PKG-02 | server-dev |
| PKG-03 | frontend-dev |
| PKG-04 | frontend-dev |
| PKG-05 | esp32-dev + mqtt-dev |

### Cross-PKG-Abhängigkeiten
- PKG-01 -> PKG-05: Firmware-Diagnose soll Restore-/Delete-Semantik aus PKG-01 übernehmen.
- PKG-02 -> PKG-03: Frontend-Fallback-Logik soll auf konsistente Runtime-Listen basieren.
- PKG-03 <-> PKG-04: Event-Konsolidierung und Route-Guard gemeinsam testen.

### BLOCKER
- Restore-Policy nicht final entschieden.
- Unklar, ob für PKG-05 neuer Error-Code angelegt oder bestehender Pfad erweitert wird.

