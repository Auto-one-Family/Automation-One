# Bug-Report: HW-Test Session 2026-02-25

> **Gemeldet von:** Robin (während HW-Test-Vorbereitung SHT31)
> **Branch:** fix/trockentest-bugs
> **Priorität:** Gemischt (Bugs + Feature-Request)
> **Status:** Dokumentiert, nicht gefixt

---

## Bug 1: Login-Button sieht komisch aus

### Beschreibung
Der Anmelde-Button auf der Login-Seite sieht "komisch" aus. Der Rest der Seite ist OK.

### Root Cause: Falsche CSS-Klasse (Copy-Paste-Fehler)

**Datei:** [LoginView.vue:224](El Frontend/src/views/LoginView.vue#L224)

```vue
<!-- Zeile 212-228 -->
<button type="submit" class="login-form__submit btn-primary" ...>
  <span v-if="authStore.isLoading" class="login-form__submit-content">
    <!-- Spinner -->
    Wird angemeldet...
  </span>
  <span v-else class="setup-form__submit-content">   <!-- ← FALSCH! -->
    <LogIn class="login-form__submit-icon" />
    Anmelden
  </span>
</button>
```

**Fehler:** Zeile 224 verwendet `setup-form__submit-content` statt `login-form__submit-content`. Copy-Paste-Fehler aus der SetupView. Der BEM-Klassenname ist inkonsistent, was zu fehlendem oder falschem Styling des Button-Inhalts führt.

**Erwartung:** `login-form__submit-content` (konsistent mit dem Rest des Login-Forms).

### Betroffene Dateien
| Datei | Zeile | Problem |
|-------|-------|---------|
| [LoginView.vue](El Frontend/src/views/LoginView.vue) | 224 | Falsche BEM-Klasse `setup-form__submit-content` |

### Fix-Aufwand
Trivial — 1 Zeile ändern.

---

## Bug 2 / Feature-Request: Öffentliche Nutzer-Registrierung

### Beschreibung
Aktuell kann sich ein neuer Nutzer **nur** registrieren wenn:
- **Kein User existiert** → Setup-Seite wird angezeigt (erster Admin)
- **Admin erstellt** → Admin muss manuell neue User über `/users` anlegen

Robin wünscht sich: Externe Nutzer sollen sich selbstständig registrieren können (z.B. als "Zuschauer"/Viewer). Der Admin kann die Rolle danach bei Bedarf anpassen.

### Aktueller Flow (IST-Zustand)

```
Erster Start (0 User):
  Browser → GET /auth/status → setup_required: true → SetupView → POST /auth/setup → Admin erstellt

Danach (≥1 User):
  Browser → GET /auth/status → setup_required: false → LoginView (KEIN Link zur Registrierung)
  Neue User: Admin → /users → "Neuer User" → POST /auth/register (Admin-Token erforderlich)
```

### Relevante Code-Stellen

| Datei | Zeile | Funktion |
|-------|-------|----------|
| [auth.py](El Servador/god_kaiser_server/src/api/v1/auth.py) | 77-109 | `GET /auth/status` — `setup_required = (user_count == 0)` |
| [auth.py](El Servador/god_kaiser_server/src/api/v1/auth.py) | 111-209 | `POST /auth/setup` — Gesperrt wenn `user_count > 0` |
| [auth.py](El Servador/god_kaiser_server/src/api/v1/auth.py) | 369-447 | `POST /auth/register` — **Erfordert `AdminUser` Dependency** |
| [router/index.ts](El Frontend/src/router/index.ts) | 215-244 | Navigation Guard: Redirect zu Setup nur wenn `setupRequired === true` |
| [user.py](El Servador/god_kaiser_server/src/db/models/user.py) | 64-69 | Rollen: `admin`, `operator`, `viewer` (Default: `viewer`) |

### Registrierungs-Sperre im Backend

```python
# auth.py:369-447 — Register Endpoint
@router.post("/register", ...)
async def register(
    request: RegisterRequest,
    db: DBSession,
    current_user: AdminUser,   # ← NUR Admin darf registrieren
) -> RegisterResponse:
```

### Gewünschter Flow (SOLL-Zustand)

```
Jederzeit (≥1 User):
  Browser → LoginView → Link "Registrieren" → RegisterView
  → POST /auth/public-register → User wird mit role="viewer" erstellt
  → Optional: Email-Verifizierung / Admin-Bestätigung / Captcha
  → Admin kann Rolle danach hochstufen (viewer → operator → admin)
```

### Sicherheitsanforderungen (Robin's Input)
- Neue User sollen sich "von außen" registrieren können
- Default-Rolle: `viewer` (nur Lesezugriff)
- Admin kann Rolle jederzeit anpassen
- Sicherheitsverfahren nötig (Spam-Schutz, ggf. Email-Verifizierung)
- Optionale Idee: Verschiedene Rollen bei Registrierung wählbar

### Implementierungs-Überlegungen

1. **Neuer Public-Endpoint:** `POST /auth/public-register` (keine Auth erforderlich)
2. **Rate-Limiting:** Schutz gegen Brute-Force/Spam-Registrierung
3. **Frontend:** Registrierungs-Link auf LoginView + neue RegisterView
4. **Admin-Approval optional:** Admin muss neuen User freischalten bevor Login möglich
5. **Rollen-Vergabe:** Entweder fix `viewer` oder wählbar mit Admin-Override

### Fix-Aufwand
Mittlerer Feature-Aufwand — neuer Endpoint, neue View, Sicherheitslogik.

---

## Bug 3: Login erfordert Page-Reload + Allgemeine Reaktivitätsprobleme

### Beschreibung
1. **Login-Bug:** Beim ersten Seitenaufruf muss die Seite nach dem Login neu geladen werden, damit der Login wirkt.
2. **Generell:** Auf mehreren Seiten aktualisieren sich Daten erst nach Seitenwechsel oder manuellem Reload.
3. **DashboardBuilder** hat das größte Problem — keine Live-Updates.

### Teilproblem A: Login-Race-Condition

**Kern:** Nach erfolgreichem Login wird `checkAuthStatus()` im Router Guard **erneut** aufgerufen. Falls die `/auth/me` API noch nicht bereit ist oder kurz 401 zurückgibt, wird `user = null` gesetzt und der User zurück zum Login redirected.

**Ablauf des Bugs:**
```
1. User gibt Credentials ein → handleLogin()
2. authStore.login() → setzt accessToken + user (async)
3. router.push('/') → Navigation startet
4. beforeEach Guard → setupRequired === null → checkAuthStatus() erneut!
5. checkAuthStatus() → GET /auth/me → evtl. Race-Condition → clearAuth()
6. isAuthenticated = false → Redirect zurück zu /login
7. Seite neu laden → Token im localStorage → diesmal klappt's
```

**Betroffene Dateien:**

| Datei | Zeile | Problem |
|-------|-------|---------|
| [router/index.ts](El Frontend/src/router/index.ts) | 215-244 | `checkAuthStatus()` wird nach Login erneut aufgerufen |
| [auth.store.ts](El Frontend/src/stores/auth.store.ts) | 28-67 | `checkAuthStatus()` kann `clearAuth()` aufrufen und Login rückgängig machen |
| [App.vue](El Frontend/src/App.vue) | 25-28 | Auth-Check nur einmal beim App-Mount, kein Refresh-Polling |

**Router Guard Code (index.ts:215-244):**
```typescript
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()
  if (authStore.setupRequired === null) {
    await authStore.checkAuthStatus()  // ← Race-Condition!
  }
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }
})
```

### Teilproblem B: DashboardBuilder — Keine Live-Updates

**Kern:** CustomDashboardView lädt Daten **nur** in `onMounted()`. Es gibt keine WebSocket-Subscription und keine Watchers auf Store-Änderungen.

| Datei | Zeile | Problem |
|-------|-------|---------|
| [CustomDashboardView.vue](El Frontend/src/views/CustomDashboardView.vue) | 91-135 | `espStore.fetchAll()` nur einmal in `onMounted` |
| [CustomDashboardView.vue](El Frontend/src/views/CustomDashboardView.vue) | 244-278 | Widget-Props werden statisch gesetzt, nicht reaktiv |

```typescript
// CustomDashboardView.vue:91-135
onMounted(() => {
  if (espStore.devices.length === 0) {
    espStore.fetchAll()  // ← EINMALIG, kein Watch/Subscribe
  }
  // ... GridStack init mit statischen Props
})
```

### Teilproblem C: Generelle Store-Initialisierung bei Route-Wechsel

**Kern:** Stores laden Daten nicht neu wenn der User zwischen Views navigiert. Der ESP-Store hat zwar WebSocket-Subscriptions, aber:
- Filter sind global statt view-spezifisch
- Kein `fetchAll()` bei Route-Wechsel
- Stale Daten bleiben im Store bis manueller Refresh

| Datei | Zeile | Problem |
|-------|-------|---------|
| [esp.ts (Store)](El Frontend/src/stores/esp.ts) | 91-140 | WebSocket mit globalen Filtern, keine dynamische Subscription |
| [useWebSocket.ts](El Frontend/src/composables/useWebSocket.ts) | 216-227 | Status-Check per 1s-Polling statt Event-basiert |

### Betroffene Views (Symptome)
- **LoginView:** Login wirkt erst nach Reload
- **CustomDashboardView (DashboardBuilder):** Größtes Problem, keine Live-Updates
- **Andere Views:** Daten aktualisieren sich erst nach Seitenwechsel

### Fix-Aufwand
Mittel-Hoch — betrifft Router Guard, Auth-Store, WebSocket-Composable und mehrere Views.

---

## Bug 4: Automatischer Mock-Device bei Frontend-Neustart

### Beschreibung
Bei jedem Frontend-Neustart (Docker Container Restart) erscheint automatisch ein neuer Mock-Device in der Datenbank:
- `device_id`: `MOCK_XXXXXXXX` (zufällige ID)
- `hardware_type`: `MOCK_ESP32`
- Zone: nicht zugewiesen
- Status: `online`

Auch direkt nach einem DB-Cleanup (alle Mocks gelöscht) taucht sofort ein neuer Mock auf, ohne dass der User etwas tut.

### Root Cause: SimulationScheduler.recover_mocks() bei Server-Startup

**Ablauf des Bugs:**

```
1. Mock wird erstellt (manuell oder automatisch) mit auto_heartbeat=true
2. Backend speichert simulation_state="running" in device_metadata (DB)
3. DB-Cleanup löscht den Mock aus esp_devices
4. ABER: Wenn Backend/Frontend Container neu startet...
5. main.py lifespan() → recover_mocks() → sucht simulation_state="running"
6. SimulationScheduler stellt Mock wieder her ODER erstellt neuen
7. Neuer Mock erscheint in der DB ohne User-Interaktion
```

### Betroffene Code-Kette

**1. Server-Startup — Recovery**

| Datei | Zeile | Funktion |
|-------|-------|----------|
| [main.py](El Servador/god_kaiser_server/src/main.py) | 349-363 | `lifespan()` → `_simulation_scheduler.recover_mocks(session)` |

```python
# main.py:349-363
# Step 3.5: Recover running Mock-ESP simulations from database
try:
    async for session in get_session():
        recovered_count = await _simulation_scheduler.recover_mocks(session)
        if recovered_count > 0:
            logger.info(f"Mock-ESP recovery: {recovered_count} simulations restored")
```

**2. SimulationScheduler — Recovery-Logik**

| Datei | Zeile | Funktion |
|-------|-------|----------|
| [scheduler.py](El Servador/god_kaiser_server/src/services/simulation/scheduler.py) | 419-489 | `recover_mocks()` — sucht alle Mocks mit `simulation_state="running"` |

```python
# scheduler.py:419-489
async def recover_mocks(self, session: AsyncSession) -> int:
    esp_repo = ESPRepository(session)
    running_mocks = await esp_repo.get_running_mock_devices()
    # ... stellt jeden running Mock wieder her
```

**3. ESP-Repository — "Running" Mocks finden**

| Datei | Zeile | Funktion |
|-------|-------|----------|
| [esp_repo.py](El Servador/god_kaiser_server/src/db/repositories/esp_repo.py) | 246-262 | `get_running_mock_devices()` — Filter auf `simulation_state == "running"` |

```python
# esp_repo.py:246-262
async def get_running_mock_devices(self) -> List[ESPDevice]:
    all_mocks = await self.get_mock_devices()
    return [
        device for device in all_mocks
        if device.device_metadata
        and device.device_metadata.get("simulation_state") == "running"
    ]
```

**4. Mock-Creation — Auto-Start Flag**

| Datei | Zeile | Funktion |
|-------|-------|----------|
| [debug.py](El Servador/god_kaiser_server/src/api/v1/debug.py) | 261 | `auto_start=config.auto_heartbeat` bei Mock-Erstellung |
| [esp_repo.py](El Servador/god_kaiser_server/src/db/repositories/esp_repo.py) | 411 | `simulation_state: "running" if auto_start else "stopped"` |

```python
# esp_repo.py:411
device_metadata = {
    "mock": True,
    "simulation_state": "running" if auto_start else "stopped",
    # ...
}
```

### Offene Frage

Der User sagt "Frontend neu starten" — es ist unklar ob damit:
- **Docker Frontend-Container restart** gemeint ist (nur Vue-App, Backend läuft weiter)
- **Docker Compose restart** (alles neu, Backend startet auch neu → `recover_mocks()` läuft)
- **Browser-Reload** (kein Server-Restart)

Falls nur der Frontend-Container neu startet, liegt die Ursache **NICHT** bei `recover_mocks()` (das läuft nur bei Backend-Start). Dann gibt es möglicherweise einen **anderen Mechanismus** der den Mock erstellt — z.B.:
- Ein Frontend-API-Call der einen Mock triggert
- Der MQTT-Logger Service der Mock-Daten sendet
- Ein automatischer Seed-Prozess

**Weitere Analyse nötig:** Prüfen ob der Mock auch bei reinem Browser-Reload erscheint (ohne Backend-Neustart).

### Fix-Aufwand
Mittel — `recover_mocks()` Logik überarbeiten, `simulation_state` Cleanup bei Device-Delete sicherstellen.

---

## Zusammenfassung

| # | Bug | Schwere | Aufwand | Typ |
|---|-----|---------|---------|-----|
| 1 | Login-Button CSS-Klasse falsch | Niedrig | Trivial (1 Zeile) | Bug |
| 2 | Öffentliche Registrierung fehlt | Mittel | Mittel (neuer Endpoint + View) | Feature-Request |
| 3 | Login Race-Condition + Reaktivität | Hoch | Mittel-Hoch (Router, Store, Views) | Bug |
| 4 | Auto-Mock bei Container-Restart | Mittel | Mittel (Scheduler-Logik) | Bug |

---

## Nächste Schritte

- [ ] Bug 1: `setup-form__submit-content` → `login-form__submit-content` in LoginView.vue:224
- [ ] Bug 2: Public-Register Feature designen (Endpoint, View, Sicherheit)
- [ ] Bug 3a: Router Guard Race-Condition fixen (checkAuthStatus nicht doppelt aufrufen)
- [ ] Bug 3b: CustomDashboardView WebSocket-Subscription hinzufügen
- [ ] Bug 3c: Store-Initialisierung bei Route-Wechsel prüfen
- [ ] Bug 4: Klären ob Mock bei Frontend-Restart oder Backend-Restart erscheint
- [ ] Bug 4: `recover_mocks()` Logik überarbeiten oder deaktivieren
