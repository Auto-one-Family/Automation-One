# SPECIALIST-PROMPTS

Run-ID: `lifecycle-background-state-crosslayer-debug-2026-04-14`  
Stand: nach Verify-Delta aus `VERIFY-PLAN-REPORT.md`

## Prompt: server-dev (PKG-01 + PKG-02)

### Git (Pflicht)
- Arbeitsbranch: `auto-debugger/work`.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; kein Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

### Auftrag
Bitte implementiere PKG-01 und PKG-02 aus `TASK-PACKAGES.md`:
1. Delete-Guard + Restore-Policy in Heartbeat/Sensor-Ingest.
2. Einheitliche Runtime-Filterstrategie für Soft-Delete in den relevanten Query-Pfaden.

### Scope-Dateien
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
- `El Servador/god_kaiser_server/src/api/v1/esp.py`
- `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py`

### Verify-Fokus
- Restore-Policy muss konfigurierbar sein (kein harter Verhaltenstausch ohne Gate).
- Runtime vs Historie klar unterscheiden (`runtime_only` vs `include_deleted`).
- Keine Breaking Contracts.

### Testhinweis
- Unit/Integration für Delete->Heartbeat und Soft-Delete-List-Queries ausführen.

---

## Prompt: frontend-dev (PKG-03 + PKG-04)

### Git (Pflicht)
- Arbeitsbranch: `auto-debugger/work`.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; kein Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

### Auftrag
Bitte implementiere PKG-03 und PKG-04 aus `TASK-PACKAGES.md`:
1. L2->L1 Route-Fallback bei fehlendem `selectedDevice`.
2. Delete-Event-Kette zwischen ZonePlate und Device-Karten konsolidieren.

### Scope-Dateien
- `El Frontend/src/views/HardwareView.vue`
- `El Frontend/src/stores/esp.ts` (nur falls nötig)
- `El Frontend/src/components/dashboard/ZonePlate.vue`
- `El Frontend/src/components/dashboard/DeviceMiniCard.vue`

### Verify-Fokus
- Guard nur bei tatsächlichem Missing-Device triggern (kein aggressiver Redirect).
- Keine Doppeltrigger beim Delete-Event.
- Bestehendes UX-Verhalten in L1/L2 erhalten.

### Testhinweis
- Unit/Component-Tests für Delete aus L1/L2 und Event-Emission ergänzen/ausführen.

---

## Prompt: esp32-dev + mqtt-dev (PKG-05, nach PKG-01)

### Git (Pflicht)
- Arbeitsbranch: `auto-debugger/work`.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; kein Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

### Auftrag
Bitte implementiert PKG-05 aus `TASK-PACKAGES.md`:
1. Revocation-/Upstream-Delete-Diagnosepfad im bestehenden Admission/Intent-Muster ergänzen.
2. Zusätzliche Korrelation in Logs für reproduzierbare Feldanalyse.

### Abhängigkeit
- Start erst nach finaler Restore-Policy aus PKG-01 (semantische Konsistenz).

### Scope-Dateien
- `El Trabajante/src/main.cpp`
- `El Trabajante/src/services/communication/mqtt_client.cpp`
- `El Trabajante/src/tasks/sensor_command_queue.cpp`

### Verify-Fokus
- Fail-closed Verhalten beibehalten.
- Keine Änderung der Topic-Taxonomie.
- Falls neue Error-Codes: Dokumentation in `.claude/reference/errors/ERROR_CODES.md`.

### Testhinweis
- Wokwi/Hardware-Szenario getrennt verifizieren; Admission-Outcome assertions ergänzen.

## Blocker (global)
- Restore-Policy (Delete final vs Auto-Restore) muss vor Start final bestätigt werden.
- Entscheidung zu neuer oder bestehender Error-Code-Nutzung für PKG-05 erforderlich.

