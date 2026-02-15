# Git Commit & Branch-Konsolidierungsplan

**Erstellt:** 2026-02-15 19:00 UTC
**Branch:** feature/frontend-consolidation
**Status:** BEREIT ZUR AUSFUEHRUNG

---

## Ausgangslage

| Metrik | Wert |
|--------|------|
| Aktueller Branch | `feature/frontend-consolidation` (synchron mit origin) |
| Uncommitted Changes | 10 Dateien (unstaged) |
| Feature-Branch ahead of master | 64 Commits |
| Feature-Branch behind master | 1 Commit (PR#3 Merge-Commit `20c1592`) |
| Lokale Branches gesamt | 15 |
| Davon merged in Feature-Branch | 12 (sicher loeschbar) |
| Davon NICHT merged | 2 (backup + phase2-wokwi-ci) |
| Remote-Branches | 7 (3 davon Cleanup-Kandidaten) |

---

## Phase 1: Uncommitted Changes committen

### Commit 1: feat(frontend): improve WebSocket lifecycle and ESP error handling

**Was:** WebSocket-Service bekommt reaktive Status-Callbacks (statt Polling), der useWebSocket-Composable erkennt ob er in Component- oder Store-Kontext laeuft und waehlt die passende Strategie. ESP-API propagiert DB-Fehler korrekt und verschaerft Mock-Erkennung. Store nutzt inklusivere Offline-Logik.

**Dateien:**
- `El Frontend/src/services/websocket.ts` - onStatusChange() callback system, centralized setStatus(), better reconnect error handling
- `El Frontend/src/composables/useWebSocket.ts` - component vs store context detection, callback-based status for stores
- `El Frontend/src/api/esp.ts` - DB fetch error propagation, stricter mock detection (remove `includes('MOCK')`)
- `El Frontend/src/stores/esp.ts` - inverted offline filter logic (more inclusive)

**Befehle:**
```bash
git add "El Frontend/src/services/websocket.ts" "El Frontend/src/composables/useWebSocket.ts" "El Frontend/src/api/esp.ts" "El Frontend/src/stores/esp.ts"
git commit -m "feat(frontend): improve WebSocket lifecycle and ESP error handling

- Add onStatusChange() callback system to WebSocket service (avoids polling)
- Detect component vs store context in useWebSocket composable
- Use callback-based status monitoring in store contexts (no setInterval leak)
- Propagate DB fetch errors in ESP API when no mock fallback available
- Tighten mock ESP detection (remove overly broad includes check)
- Use inclusive offline filter logic in ESP store

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Commit 2: fix(server): thread-safe MQTT buffering and ESP registration hardening

**Was:** MQTT-Client bekommt thread-safe asyncio-Scheduling fuer den Offline-Buffer (paho-mqtt Callback-Thread hat keinen Event-Loop). Discovery nutzt korrektes `device_metadata` Feld. Heartbeat-Handler bekommt Session-Rollback bei History-Fehler und entfernt Debug-Logs. Sensor-Handler bekommt Task-Done-Callbacks. ESP-Service setzt neue Geraete auf `pending_approval` statt direkt `online`.

**Dateien:**
- `El Servador/god_kaiser_server/src/mqtt/client.py` - _schedule_buffer_add() for thread-safe async, event loop capture
- `El Servador/god_kaiser_server/src/mqtt/handlers/discovery_handler.py` - metadata -> device_metadata field fix
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` - session rollback on history error, remove DEBUG timing logs, improve error logging
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` - task done callbacks for logic evaluation visibility
- `El Servador/god_kaiser_server/src/services/esp_service.py` - pending_approval for new devices, persist status changes, log WebSocket errors

**Befehle:**
```bash
git add "El Servador/god_kaiser_server/src/mqtt/client.py" "El Servador/god_kaiser_server/src/mqtt/handlers/discovery_handler.py" "El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py" "El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py" "El Servador/god_kaiser_server/src/services/esp_service.py"
git commit -m "fix(server): thread-safe MQTT buffering and ESP registration hardening

- Add _schedule_buffer_add() for thread-safe async scheduling from paho threads
- Capture event loop reference during connect() for cross-thread use
- Fix metadata -> device_metadata field name in discovery handler
- Add session rollback on heartbeat history insert failure
- Remove DEBUG timing logs from heartbeat handler
- Add task done callbacks for logic evaluation error visibility
- New ESP devices start as pending_approval (not auto-online)
- Preserve existing device status on re-registration
- Persist offline status changes via session commit
- Log WebSocket broadcast errors instead of silently swallowing

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Commit 3: docs(reports): update git health report

**Was:** Git Health Report aktualisiert mit vollstaendiger Branch-Analyse, Repo-Groesse, Secrets-Audit und CI-Bewertung.

**Dateien:**
- `.claude/reports/current/GIT_HEALTH_REPORT.md` - complete rewrite with branch hygiene, repo size analysis

**Befehle:**
```bash
git add ".claude/reports/current/GIT_HEALTH_REPORT.md"
git commit -m "docs(reports): update git health report with branch and repo analysis

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Phase 2: Master synchronisieren

### Schritt 2.1: Master in Feature-Branch mergen

Master hat 1 Commit den Feature-Branch nicht hat (PR#3 Merge `20c1592`).

```bash
# Auf feature/frontend-consolidation bleiben
git merge master -m "Merge master: sync PR#3 merge commit"
```

**Erwartung:** Clean merge (keine Konflikte erwartet, da feature/frontend-consolidation bereits den Inhalt von feature/docs-cleanup enthaelt - es fehlt nur der Merge-Commit selbst).

### Schritt 2.2: Feature-Branch pushen

```bash
git push origin feature/frontend-consolidation
```

---

## Phase 3: Feature-Branch in Master mergen

### Schritt 3.1: Auf Master wechseln und Feature-Branch mergen

```bash
git checkout master
git merge feature/frontend-consolidation -m "Merge feature/frontend-consolidation: ESP registration, WebSocket improvements, MQTT thread safety"
```

### Schritt 3.2: Master pushen

```bash
git push origin master
```

---

## Phase 4: Branch-Cleanup (lokal)

### 4a. Sicher loeschbar (bereits vollstaendig in feature/frontend-consolidation gemerged)

Diese 12 Branches sind vollstaendig in feature/frontend-consolidation enthalten. Da feature/frontend-consolidation in master gemerged wird, sind sie auch in master enthalten.

```bash
git branch -d chore/infra
git branch -d docs/claude-reports
git branch -d feat/dashboard-consolidation
git branch -d feat/firmware-mqtt
git branch -d feat/frontend-esp-tokens
git branch -d feat/frontend-rules-views
git branch -d feat/server-esp
git branch -d feature/dashboard-consolidation
git branch -d feature/docs-cleanup
git branch -d fix/pending-panel
git branch -d test/e2e-esp-registration
git branch -d feature/frontend-consolidation
```

### 4b. Pruefung noetig (NICHT in feature/frontend-consolidation gemerged)

| Branch | Unique Commits | Empfehlung |
|--------|----------------|------------|
| `backup/frontend-consolidation-full` | 1 (`c6f026f` WIP backup) | LOESCHEN - war Sicherungskopie, Inhalt ist laengst in feature/frontend-consolidation |
| `feature/phase2-wokwi-ci` | 2 (`5ebd1f6` WIP + `20c1592` PR#3) | LOESCHEN - alter WIP-Branch, 853 Dateien hinter aktuellem Stand, Inhalt superseded |

```bash
# Nur mit -D (force) da nicht gemerged - User muss bestaetigen!
git branch -D backup/frontend-consolidation-full
git branch -D feature/phase2-wokwi-ci
```

---

## Phase 5: Remote-Branch-Cleanup

### Alte Feature-Branches (bereits in master via PRs gemerged)

```bash
git push origin --delete feature/docs-cleanup
git push origin --delete feature/dashboard-consolidation
git push origin --delete feature/frontend-consolidation
```

### Verwaiste Branches (Cursor IDE / Claude generiert)

```bash
git push origin --delete cursor/playwright-css-testkonzept-7562
git push origin --delete cursor/projekt-design-konsolidierung-161e
git push origin --delete claude/review-agent-structure-ymhUi
```

### Remote-Tracking bereinigen

```bash
git remote prune origin
git gc
```

---

## Zusammenfassung

| # | Aktion | Dateien/Branches | Typ |
|---|--------|------------------|-----|
| 1 | `feat(frontend): improve WebSocket lifecycle and ESP error handling` | 4 | feat |
| 2 | `fix(server): thread-safe MQTT buffering and ESP registration hardening` | 5 | fix |
| 3 | `docs(reports): update git health report` | 1 | docs |
| 4 | Merge master -> feature/frontend-consolidation | sync | merge |
| 5 | Push feature/frontend-consolidation | - | push |
| 6 | Merge feature/frontend-consolidation -> master | 64+ Commits | merge |
| 7 | Push master | - | push |
| 8 | Loesche 14 lokale Branches | 14 | cleanup |
| 9 | Loesche 6 remote Branches | 6 | cleanup |
| 10 | git gc + prune | - | maintenance |

### Endergebnis

- **master:** Enthaelt ALLE Arbeit aus feature/frontend-consolidation (64+ Commits)
- **Lokale Branches:** Nur `master`
- **Remote Branches:** Nur `origin/master` + `origin/HEAD`
- **Kein Datenverlust:** Alle Commits preserved, uncommitted changes committed

### Hinweise

- Phase 2 (merge master) sollte conflict-free sein
- Phase 4b (force-delete) erfordert User-Bestaetigung
- Phase 5 (remote delete) ist destruktiv und sollte erst NACH erfolgreichem master-push erfolgen
- Falls CI auf master laeuft: Phase 3 evtl. besser via PR (GitHub UI)
