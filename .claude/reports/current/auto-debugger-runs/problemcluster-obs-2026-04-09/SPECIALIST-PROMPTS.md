# SPECIALIST-PROMPTS — Run `problemcluster-obs-2026-04-09`

Jeder Block ist copy-paste-fähig. **Vor jeder schreibenden Aktion** die Pflichtabschnitte in der angegebenen Reihenfolge beachten (sinngemäß wie `.claude/agents/auto-debugger.md` §0a).

---

### Server-Dev — PKG-01 (MQTT Subscriber Parse-Korrelation)

#### Git (Pflicht)

- Arbeitsbranch: **auto-debugger/work**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.  
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.  
- Zusätzlich: globale Git-Regeln aus der Steuerdatei `forbidden` (kein `reset --hard` ohne Gate).

#### Pattern-Reuse (Pflicht)

Vor Code: per `Grep`/`Glob` die **closest existing implementation** im MQTT-Layer nennen (z. B. bestehende Log-Keys in `subscriber.py`, `test_mqtt_correlation.py`) und **dort** anbinden — keine parallele Korrelations-Hilfsschicht.

#### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

Nur Backend; **keine** Vermischung von ISA-/DB-Notification-Pfaden mit transientem WS-`error_event`. Logging-IDs: MQTT-CID vs. HTTP-`request_id` in Text/Keys klar trennen (siehe IST-Dokument Semantik-Warnung).

#### Verify-Befehl (Pflicht)

Nach Abschluss:

`cd "El Servador/god_kaiser_server" && poetry run pytest tests/unit/test_mqtt_correlation.py -q`

— Exit-Code 0.

#### Fehler-Register (Pflicht bei Code)

Pro Fehler: Evidenzzeile → einzeilige Hypothese → Minimalfix → **derselbe** pytest-Befehl erneut; erst bei grün weiterarbeiten. Einträge im Run-Ordner `FEHLER-REGISTER.md` (falls angelegt).

#### Scope (Inhalt)

Du arbeitest nur unter `El Servador/god_kaiser_server/`. Ziel: bei `JSONDecodeError` in `mqtt/subscriber.py` (`_route_message`) eine **korrelierbare** Logzeile (Topic + Parse-Fail-Kennung), **ohne** Handler auszuführen. Tests in `tests/unit/test_mqtt_correlation.py` erweitern.

---

### Frontend-Dev — PKG-02 / PKG-03 (Finalität + `data-testid` + E2E)

#### Git (Pflicht)

- Arbeitsbranch: **auto-debugger/work**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.  
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

#### Pattern-Reuse (Pflicht)

Vor Code: `Grep`/`Glob` — **closest** bestehende Patterns: `useToast`, Notification-Drawer, bestehende E2E-Szenarien unter `tests/e2e/scenarios/`. Erweitern, keine zweite Notification-Welt.

#### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

Persistierte Inbox (REST + `notification_*` WS) vs. transientes **`error_event`** nicht als dieselbe Root-Cause behandeln. UI-Feedback (Toast/Finalität) an **tatsächliche** API-Ergebnisse koppeln; `correlation_id` / `X-Request-ID` nicht verwechseln.

#### Verify-Befehl (Pflicht)

Nach Abschluss (mindestens):

`cd "El Frontend" && npx vue-tsc --noEmit`

Optional ergänzend: `npx vitest run` (betroffene Stores/Komponenten), `npx playwright test tests/e2e/scenarios/alert-center.spec.ts` mit laufendem Stack.

#### Fehler-Register (Pflicht bei Code)

Pro Fehler: Evidenz → Hypothese → Minimalfix → Re-Verify mit **demselben** Befehl wie oben.

#### Scope (Inhalt)

Du arbeitest nur unter `El Frontend/`. Relevant u. a.: `src/shared/stores/alert-center.store.ts`, `notification-inbox.store.ts`, `src/components/notifications/NotificationDrawer.vue`, `NotificationItem.vue`, `NotificationBadge.vue`, `AlertStatusBar.vue`, `src/api/notifications.ts`, `tests/e2e/scenarios/alert-center.spec.ts`.

---

### ESP32-Dev — PKG-05 (nur nach Verify + Hardware-Plan)

#### Git (Pflicht)

- Arbeitsbranch: **auto-debugger/work**; wie Frontend-/Server-Block.

#### Pattern-Reuse (Pflicht)

Bestehende Error-/MQTT-Pfade (`ErrorTracker`, `TopicBuilder`, Safety) erweitern — keine parallelen Kanäle.

#### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

Firmware liefert Rohdaten/ACKs; **keine** Annahme, dass jeder Fehler in der Server-Inbox landet. Timing/HW beachten.

#### Verify-Befehl (Pflicht)

`cd "El Trabajante" && pio run -e esp32_dev` (WROOM; Seeed XIAO: `seeed_xiao_esp32c3`) — Exit-Code 0.

#### Fehler-Register (Pflicht bei Code)

Wie oben; Verify: `pio run` erneut.

#### Scope (Inhalt)

Du arbeitest nur unter `El Trabajante/`. Keine Server-Logik. `VERIFY-PLAN-REPORT.md` und Hardware-Checkliste lesen.

---

### test-log-analyst (unterstützend)

#### Git (Pflicht)

Wenn Commits an Workflows — nur `auto-debugger/work`.

#### Pattern-Reuse (Pflicht)

Bestehende CI-/Playwright-Doku und `test-log-analyst`-Skill nutzen — keine neuen Report-Formate ohne Auftrag.

#### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

Nur relevant, wenn E2E-Flaky durch Alert-UI; sonst „n. z.“.

#### Verify-Befehl (Pflicht)

Nach Robin-Testlauf: Befehle und Logs gemäß Skill `test-log-analyst`; kein Ersatz für `vue-tsc` der Dev-Rolle.

#### Fehler-Register (Pflicht bei Code)

n. z. für reine Log-Analyse; bei Workflow-Patches wie Dev-Disziplin.

#### Scope (Inhalt)

Unterstützt CI-Einbindung neuer Playwright-Szenarien; keine Produktcode-Änderung ohne Auftrag.

---

*Ende SPECIALIST-PROMPTS.*
