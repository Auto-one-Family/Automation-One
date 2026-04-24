# Frontend Debug Report

**Erstellt:** 2026-04-24
**Modus:** B – Spezifisch: "Toast ESP_x wurde zu Zone y zugewiesen taucht periodisch wieder auf"
**Quellen:** `zone.store.ts`, `esp.ts`, `esp-websocket-subscription.ts`, `useToast.ts`, `useZoneDragDrop.ts`, `ackPresentation.ts`, `ZoneAssignmentPanel.vue`, `heartbeat_handler.py`, `zone_ack_handler.py`, `heartbeat_metrics_handler.py`, AUT-134 Steuerdatei

---

## 1. Zusammenfassung

Der Toast `"${deviceName}" wurde zu "${zoneName}" zugewiesen` wird von **`zone.store.ts:handleZoneAssignment()`** gefeuert – ohne `dedupeKey` und ohne Idempotenz-Prüfung. Der primäre Frontend-Fehler ist, dass **jedes eintreffende `zone_assignment` WS-Event bedingungslos einen Toast auslöst**, auch wenn die Zuweisung identisch mit dem aktuellen Gerätezustand ist. Die periodische Wiederholung kommt durch zwei Backend-Trigger: den **WP7 Heartbeat Zone-Resync-Loop** (60s Cooldown) und den **Full-State-Push nach Reconnect** – beide erzeugen erneute `zone_assignment` WS-Events für bereits korrekt zugewiesene Geräte. AUT-134 (Config-Oversize) ist ein Verschärfungsfaktor, der den Resync-Loop durch einen potenziell dauerhaften `zone_assigned=false`-Zustand auf Mock-ESPs verlängert.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `zone.store.ts` | Befund | Primärer Toast-Auslöser, kein `dedupeKey`, kein Idempotenz-Guard |
| `esp.ts` | OK | Reines Delegate zu `zone.store.ts`, kein doppelter Handler |
| `esp-websocket-subscription.ts` | OK | `zone_assignment` korrekt im Subscription-Set |
| `useToast.ts` | Teilbefund | `DEDUP_WINDOW_MS = 2000` — zu kurz für periodische Resync-Events |
| `useZoneDragDrop.ts` | OK | Nutzt `dedupeKey` korrekt für REST-Antwort-Toasts |
| `ZoneAssignmentPanel.vue` | OK | Kein `useToast`-Import, kein zusätzlicher Toast |
| `ackPresentation.ts` | OK | Korrekte Textkonstruktion, keine Logik |
| `heartbeat_handler.py` | Befund | WP7 Zone Resync (60s), Full-State-Push — beide triggern `zone_assignment` WS |
| `zone_ack_handler.py` | Befund | Broadcast ohne Idempotenz-Prüfung gegen aktuellen DB-Zustand |
| `heartbeat_metrics_handler.py` | OK | Kein WS-Broadcast, reiner Metrics-Buffer — nicht relevant |
| AUT-134 Steuerdatei | Kontext | Config-Oversize als Verschärfungsfaktor identifiziert |

---

## 3. Befunde

### 3.1 Kein Idempotenz-Guard in `zone.store.ts:handleZoneAssignment()`

- **Schwere:** Hoch
- **Detail:** Jedes eintreffende `zone_assignment` WS-Event mit `status === 'zone_assigned'` löst bedingungslos einen Toast aus. Es wird **nicht** geprüft, ob `data.zone_id === snapshot.zone_id` (d.h. ob die Zuweisung neu ist oder nur eine Wiederholung einer bereits gespeicherten).
- **Evidenz:** `zone.store.ts:241–260`

```
if (data.status === 'zone_assigned') {
  // ...patch...
  toast.success(bridgeLine ? `${title}\n${bridgeLine}` : title)
  // ← IMMER, kein Vergleich mit snapshot.zone_id
}
```

Der `snapshot` (Zeile 233) wird **vor** dem Patch gezogen — ein Vergleich `snapshot.zone_id === data.zone_id` wäre technisch korrekt und würde redundante Toasts unterdrücken.

### 3.2 Kein `dedupeKey` für WS-getriggerte Zone-Toasts

- **Schwere:** Mittel
- **Detail:** `useZoneDragDrop.ts` setzt `dedupeKey: 'zone-assign-accepted:${deviceId}:${toZoneId}'` korrekt für den REST-Response-Toast. `zone.store.ts` setzt **keinen** `dedupeKey` für den WS-Toast. Das text-basierte Dedupe in `useToast` (Zeile 73: `t.message === options.message && t.type === options.type`) gilt nur innerhalb von `DEDUP_WINDOW_MS = 2000ms`. Kommt dasselbe WS-Event nach >2s erneut, entsteht ein neuer Toast.
- **Evidenz:** `useToast.ts:47,72-73`; `zone.store.ts:260`

### 3.3 Backend-Trigger 1: Heartbeat WP7 Zone-Resync-Loop (60s)

- **Schwere:** Hoch (primäre Quelle der Periodizität)
- **Detail:** `heartbeat_handler.py`, WP7-Logik (Zeile 1110–1175): Wenn der ESP im Heartbeat `zone_assigned=false` meldet **oder** `heartbeat_zone_id != db_zone_id`, und kein Reconnect/Pending-Flag gesetzt ist, sendet der Server automatisch ein MQTT `zone/assign`. Cooldown: 60 Sekunden (`zone_resync_cooldown_seconds = 60`).

  Vollständige Kausalkette:
  ```
  Heartbeat (zone_assigned=false oder zone_id-Mismatch)
    → heartbeat_handler.py WP7 → MQTT zone/assign (alle 60s)
    → ESP → MQTT zone/ack
    → zone_ack_handler.py → WS broadcast "zone_assignment"
    → zone.store.ts:handleZoneAssignment()
    → toast.success("ESP_x wurde zu Zone y zugewiesen")  ← alle 60s
  ```

- **Evidenz:** `heartbeat_handler.py:1110–1175`; `zone_ack_handler.py:267–278`

### 3.4 Backend-Trigger 2: Full-State-Push nach Reconnect

- **Schwere:** Mittel
- **Detail:** Bei Reconnect eines echten ESP (>60s offline) mit vorhandener `zone_id` wird `_handle_reconnect_state_push()` als async Task gestartet (Zeile 715–725). Diese sendet erneut zone/assign via `MQTTCommandBridge.send_and_wait_ack()` → ESP ack → `zone_ack_handler.py` broadcast → Frontend Toast. Der Cooldown (`full_state_push_sent_at`) wird **nur nach erfolgreichem ACK** gesetzt. Bei Timeout: kein Cooldown → nächster Reconnect-Heartbeat triggert sofort erneut.
- **Evidenz:** `heartbeat_handler.py:2065–2130`

### 3.5 AUT-134-Verbindung: Config-Oversize als Verschärfungsfaktor

- **Schwere:** Mittel (Verschärfung, nicht Primärursache)
- **Detail:** AUT-134 beschreibt `intent_outcome rejected (VALIDATION_FAIL, Payload 4164–4370 > 4096 bytes)`. Wenn der Config-Push für einen ESP wiederholt scheitert, verbleibt der ESP länger in einem Zustand, in dem er möglicherweise Zone-Config nicht persistiert hat (`zone_assigned=false` in Heartbeat). Dies verlängert den WP7 Resync-Loop (Befund 3.3) über die normale Reboot-Erholungszeit hinaus. Der Heartbeat-Handler berücksichtigt `CONFIG_PENDING_AFTER_RESET` nur für den Logic-Engine-Backoff, **nicht** für den Zone-Resync (Zeile 1085–1090 prüft nur `is_reconnect`, nicht `CONFIG_PENDING`).
- **Evidenz:** `heartbeat_handler.py:1082–1090`; AUT-134 Steuerdatei (scope: "heartbeat/config Trigger-Burst rund um Count-Mismatch und Re-Sync")

### 3.6 Stale JSDoc-Kommentar in `esp.ts`

- **Schwere:** Niedrig (Lesbarkeit)
- **Detail:** `esp.ts:1378–1395` enthält einen alten Dokumentationsblock für den `handleZoneAssignment`-Payload — direkt vor dem aktuellen Delegate-JSDoc. Zwei JSDoc-Blöcke für eine Funktion erzeugen Verwirrung.
- **Evidenz:** `esp.ts:1378–1407`

---

## 4. Extended Checks (eigenständig durchgeführt)

| Check | Ergebnis |
|-------|----------|
| Source-Code-Analyse `zone.store.ts` | Kein `dedupeKey`, kein Idempotenz-Guard bei `zone_assigned` |
| Source-Code-Analyse `useToast.ts` | `DEDUP_WINDOW_MS = 2000` — zu kurz, kein persistenter Cache |
| Source-Code-Analyse `heartbeat_handler.py` | WP7 Resync: 60s Cooldown, Full-State-Push: nur bei Reconnect |
| Source-Code-Analyse `zone_ack_handler.py` | Broadcast immer nach commit, kein Idempotenz-Check gegen DB-Zustand |
| Source-Code-Analyse `heartbeat_metrics_handler.py` | Kein WS-Broadcast — nicht relevant |
| Doppel-Toast-Analyse REST+WS | `useZoneDragDrop` korrekt mit `dedupeKey`; `zone.store` ohne |

---

## 5. Blind-Spot-Fragen (an User)

1. **Tritt der Toast auch auf, wenn keinerlei manuelle Zuweisung vorgenommen wird?** (Würde Befund 3.3/3.4 als alleinigen Trigger bestätigen — rein heartbeat-getriggert)
2. **Welcher ESP ist betroffen?** Mock-ESP oder Real-ESP? (Mock-ESPs werden für Full-State-Push explizit ausgeschlossen, Zeile 2084–2091)
3. **Browser Network-Tab: Kommen mehrere `zone_assignment` WS-Frames für denselben ESP innerhalb von Minuten an?** (Würde Backend-Trigger quantifizieren)
4. **Gibt es eine `zone_resync_sent_at`-Zeitstempel-Progression in den Server-Logs?** (`grep "Auto-reassigning zone\|zone resync cooldown" logs/server/god_kaiser.log`)

---

## 6. Bewertung & Empfehlung

**Root Cause:** Zweistufig — **Frontend fehlt Idempotenz-Guard** (immer Toast bei `zone_assigned`), **Backend sendet periodisch Zone-Assignments** an bereits korrekt konfigurierte ESPs (WP7 Resync-Loop + Full-State-Push).

**Minimale Fix-Vorschläge (Frontend-Patterns, keine Breaking Changes):**

### Fix A — Idempotenz-Guard in `zone.store.ts` (empfohlen, minimal-invasiv)

In `handleZoneAssignment`, Zeile 250–260 — Toast nur feuern wenn sich `zone_id` wirklich geändert hat:

```typescript
// Snapshot VOR applyDevicePatch gezogen (Zeile 233) — Vergleich ist korrekt
const zoneChanged = data.zone_id !== snapshot.zone_id
applyDevicePatch(espId, (device) => ({ ...device, ...updates }))

if (zoneChanged) {
  const { title, bridgeLine } = formatZoneAckSuccess({ deviceName, zoneName, reasonCode: data.reason_code })
  toast.success(bridgeLine ? `${title}\n${bridgeLine}` : title)
} else {
  logger.debug(`zone_assignment toast suppressed (idempotent resync): ${espId} already in ${data.zone_id}`)
}
```

**Seiteneffekte:** Keine — useZoneDragDrop/REST-Pfad bleibt unberührt; Removal-Toast (zone_removed) unberührt.

### Fix B — `dedupeKey` für WS-Toast (ergänzend zu Fix A)

```typescript
toast.success(bridgeLine ? `${title}\n${bridgeLine}` : title, {
  dedupeKey: `zone-assigned-ws:${espId}:${data.zone_id}`
})
```

Greift als Fallback, wenn Fix A nicht aktiv ist — verhindert doppelte Toasts innerhalb von 2s (z.B. REST + WS innerhalb des Dedupe-Fensters). Deckt **nicht** den 60s-Resync-Loop ab (DEDUP_WINDOW_MS zu kurz). Wert liegt in REST+WS-Kollisionsfall.

### Fix C — `reason_code` für Auto-Resync-Events (Backend-seitig, nicht minimal-invasiv)

Wenn `zone_resync_sent_at`-Logik in `heartbeat_handler.py` ein `reason_code: "auto_resync"` in den MQTT-Payload einfügt (Zeile 1157–1163), könnte `zone.store.ts` Toasts für Auto-Resync-Events unterdrücken:

```typescript
if (data.reason_code === 'auto_resync') {
  logger.debug(`Zone resync toast suppressed: ${espId}`)
  return
}
```

**Voraussetzung:** Firmware muss `reason_code` aus zone/assign-Payload transparent in zone/ack weiterleiten — aktuell nicht bestätigt. Erfordert Backend-Änderung.

### Fix D — Backend: Resync-Cooldown erhöhen (Symptom-Linderung)

`heartbeat_handler.py:1122`: `zone_resync_cooldown_seconds = 60` → erhöhen auf `300`. Reduziert Toast-Frequenz 5x ohne Logik-Änderung. Kein Frontend-Fix erforderlich. Nachteil: verzögert legitime Zone-Recovery nach NVS-Verlust.

**Priorisierung:** Fix A allein löst das Frontend-Problem vollständig und ist der minimal-invasivste Eingriff. Fix B ist empfehlenswerter Defensiv-Layer. Fix D als Backend-Sofortmaßnahme falls Analyse-Ergebnis bestätigt.

**Naechste Schritte:**
1. Blind-Spot-Fragen 1–4 klären (besonders Server-Log-Check)
2. Fix A implementieren in `zone.store.ts`
3. AUT-134 Config-Oversize separat adressieren (verhindert sekundäre Verlängerung des Resync-Loops)

**Lastintensive Ops (auf Anfrage):**
- `docker compose exec el-frontend npx vue-tsc --noEmit` — Type-Check (1–3 min)
- `grep "Auto-reassigning zone\|zone resync cooldown" logs/server/god_kaiser.log | tail -30` — Resync-Häufigkeit quantifizieren
