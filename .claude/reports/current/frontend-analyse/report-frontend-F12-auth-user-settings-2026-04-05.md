# Report F12: Auth, User-Management und Settings-Recovery

Datum: 2026-04-05  
Prioritaet: P1  
Scope: `El Frontend/src/shared/stores/auth.store.ts`, `El Frontend/src/router/index.ts`, `El Frontend/src/api/index.ts`, `El Frontend/src/api/auth.ts`, `El Frontend/src/views/LoginView.vue`, `El Frontend/src/views/SetupView.vue`, `El Frontend/src/views/SettingsView.vue`, `El Frontend/src/views/UserManagementView.vue`, `El Frontend/src/shared/design/layout/Sidebar.vue`, `El Frontend/tests/unit/stores/auth.test.ts`, `El Frontend/tests/e2e/scenarios/auth.spec.ts`  
Out of Scope: IAM-Neubau auf Server-Seite

## 1) Ergebnisbild (IST vs SOLL)

- Der Auth-Lebenszyklus ist technisch funktional und klar verkabelt (setup/login/refresh/logout/guard).
- Rollenrechte sind zweistufig abgesichert (Navigation + Router), damit keine reine UI-Scheinabsicherung entsteht.
- Der 401-Refresh-Mechanismus ist queue-basiert und fuer parallele Requests ausgelegt (`isRefreshing`, `failedQueue`).
- Recovery bei Auth-Fehlern ist nicht durchgaengig transparent: mehrere Pfade enden in stiller Bereinigung oder hartem Redirect ohne kontextuelle Nutzerfuehrung.
- Sessionstrategie ist fuer Nutzer nicht explizit: `remember_me` wird gesendet, aber Storage-Verhalten bleibt immer `localStorage`.
- Audit-Traceability ist technisch vorhanden (`X-Request-ID`), aber im User-Management-UI nicht sichtbar gekoppelt.

Bewertung gegen SOLL:
- Deterministischer Recovery-Pfad: **teilweise erreicht**
- Sichtbare Sessionstrategie: **nicht erreicht**
- Audit-Traceability fuer sensible User-Aktionen: **teilweise erreicht**

---

## 2) Auth-Eventkette (setup/login/refresh/logout/guard)

## 2.1 Setup-Flow

1. Router-Guard triggert bei Start `authStore.checkAuthStatus()`, wenn `setupRequired === null` (`src/router/index.ts`).
2. Store ruft `authApi.getStatus()` auf und setzt `setupRequired` (`src/shared/stores/auth.store.ts`, `src/api/auth.ts`).
3. Falls Setup erforderlich: Guard erzwingt `/setup`; Store loescht ggf. alte Tokens (`clearAuth()`).
4. `SetupView.handleSetup()` ruft `authStore.setup()` auf (`src/views/SetupView.vue`).
5. Setup-Response setzt Tokens + User + `setupRequired=false`; Navigation auf `/`.

## 2.2 Login-Flow

1. `LoginView.handleLogin()` uebergibt `username/password/remember_me` an `authStore.login()` (`src/views/LoginView.vue`).
2. Store ruft `authApi.login()`, setzt Tokens via `setTokens()` und setzt `user` (`src/shared/stores/auth.store.ts`).
3. `setTokens()` persistiert Access/Refresh immer in `localStorage`.
4. View navigiert auf Redirect-Query oder `/`; Guard gibt Zugriff bei `isAuthenticated=true`.

## 2.3 Guard-Flow

Entscheidungskette in `router.beforeEach` (`src/router/index.ts`):
1. Initiale Statuspruefung (`checkAuthStatus()`).
2. `setupRequired=true` -> immer `/setup`.
3. `to.meta.requiresAuth && !isAuthenticated` -> `/login?redirect=...`.
4. `to.meta.requiresAdmin && !isAdmin` -> `/hardware`.
5. Bereits authentifiziert auf `/login` oder `/setup` -> `/hardware`.

## 2.4 Refresh-Flow (401 Recovery)

Entscheidungskette in Axios-Response-Interceptor (`src/api/index.ts`):
1. 401 auf nicht-auth-Endpunkt + `!_retry` + `refreshToken` -> Refresh-Pfad.
2. Falls Refresh bereits laeuft (`isRefreshing=true`) -> Request in `failedQueue` parken.
3. Genau ein aktiver Refresh ruft `authStore.refreshTokens()` auf.
4. Erfolgsfall: Queue mit neuem Token aufloesen, Requests erneut senden.
5. Fehlerfall: Queue reject, `authStore.clearAuth()`, `window.location.href='/login'`.

## 2.5 Logout-Flow

1. `SettingsView` bietet `handleLogout()` und bestaetigtes `handleLogoutAll()` (`src/views/SettingsView.vue`).
2. Store ruft `authApi.logout(logoutAll)`; API-Fehler werden nur geloggt (`src/shared/stores/auth.store.ts`).
3. Im `finally`: WebSocket disconnect, Intent-Signale clear, `clearAuth()`.
4. View navigiert auf `/login`.

---

## 3) Recovery-Matrix (Fehlerfall -> aktuelles Verhalten -> Sollverhalten)

| Fehlerfall | Aktuelles Verhalten (Code) | Sollverhalten (SOLL-Zustand) |
|---|---|---|
| `auth/status` oder `checkAuthStatus()` fehlschlaegt | Store setzt `error`, Guard faehrt ohne expliziten Recovery-Screen fort (`auth.store`, `router`) | Dedizierter Recovery-Pfad: Retry-CTA + "Zur Anmeldung" + technischer Kontext (request_id sofern vorhanden) |
| Login 401/Validation | `authStore.error` wird in Login-UI sichtbar, Formular bleibt bedienbar | Beibehalten; zusaetzlich standardisierte Fehlertypen (Credentials/Netzwerk/Server) |
| Setup-Fehler | Fehler im Setup-Form sichtbar, kein harter Redirect | Beibehalten; zusaetzlich Hilfehinweis bei wiederholten Fehlern |
| Access-Token abgelaufen, Refresh erfolgreich | Transparente Wiederholung der Requests ueber Queue | Beibehalten; optional kurzzeitiger Session-Refresh-Statusindikator |
| Refresh fehlschlaegt | Harte Sessionbeendigung + Redirect `/login` ohne kontextuelle Meldung | Login-Seite mit Grundhinweis "Session abgelaufen, bitte neu anmelden" + optional request_id |
| Logout-API fehlschlaegt | Lokal wird immer aufgeraeumt, serverseitige Invalidierung unsicher | UI-Hinweis "Lokale Abmeldung erfolgt, serverseitige Abmeldung konnte nicht bestaetigt werden" |
| Nicht-Admin versucht Admin-Route | Guard-Redirect auf `/hardware` ohne Grundanzeige | Kurzer, nicht-blockierender Hinweis "Admin-Rechte erforderlich" |

---

## 4) Sessionstrategie (Storage / remember / TTL-Kommunikation)

## 4.1 IST

- `remember_me` wird im Login-Request gesendet (`src/views/LoginView.vue`).
- Tokenpersistenz ist aktuell immer `localStorage` (`src/shared/stores/auth.store.ts`).
- `sessionStorage` wird nur fuer Router-Reload-Cooldown genutzt, nicht fuer Auth-Session (`src/router/index.ts`).
- Keine explizite UI-Kommunikation zu Session-TTL, Tokenablauf oder "angemeldet bleiben"-Semantik.

## 4.2 Konsolidierte Zielstrategie (Frontend-seitig)

1. **Storage-Strategie deterministisch**
   - `remember_me=false` -> `sessionStorage`
   - `remember_me=true` -> `localStorage`
2. **Session-Kommunikation sichtbar**
   - Nach Login kurze Info, wo/wie lange Session gilt (z. B. "bis Browser geschlossen" vs "7 Tage").
3. **Refresh-Fehlerfuehrung vereinheitlichen**
   - Ein zentraler "Session abgelaufen"-Pfad statt stummem Redirect.
4. **Technischer Nachweis**
   - Bei Auth-Fehlern request_id/correlation_id (falls vorhanden) im Fehlerhinweis anzeigbar machen.

---

## 5) Pfadbelege: Guard- und Refresh-Entscheidungen

| Entscheidung | Pfadbeleg |
|---|---|
| Initialer Auth-Check bei Guard-Start | `El Frontend/src/router/index.ts` (`setupRequired === null` -> `checkAuthStatus()`) |
| Setup-Redirect | `El Frontend/src/router/index.ts` (`if (authStore.setupRequired && to.name !== 'setup')`) |
| RequiresAuth-Redirect auf Login | `El Frontend/src/router/index.ts` (`to.meta.requiresAuth && !authStore.isAuthenticated`) |
| RequiresAdmin-Redirect auf Hardware | `El Frontend/src/router/index.ts` (`to.meta.requiresAdmin && !authStore.isAdmin`) |
| Auth-Endpunkte vom Refresh ausgeschlossen | `El Frontend/src/api/index.ts` (`isAuthEndpoint` fuer refresh/login/setup/status) |
| 401 -> Single-Refresh + Queue | `El Frontend/src/api/index.ts` (`isRefreshing`, `failedQueue`, `processQueue`) |
| Refresh-Ausfuehrung | `El Frontend/src/api/index.ts` (`await authStore.refreshTokens()`) + `El Frontend/src/shared/stores/auth.store.ts` |
| Refresh-Fehler -> Session clear + Login-Redirect | `El Frontend/src/api/index.ts` (`authStore.clearAuth(); window.location.href = '/login'`) |

---

## 6) Admin- und Non-Admin-Reisen inkl. Fehlerzweigen

| Reise | Happy Path | Fehlerzweig | Beobachtung |
|---|---|---|---|
| Admin: Login -> `/users` -> `logout(true)` | Login erfolgreich, Admin-Route erlaubt, Logout-All ueber ConfirmDialog (`LoginView`, `router`, `SettingsView`) | Logout-API kann fehlschlagen, lokales Logout erfolgt trotzdem (`auth.store.logout`) | Funktional robust, aber keine klare Rueckmeldung zur serverseitigen Logout-All-Finalitaet |
| Admin: Session mit abgelaufenem Access Token | 401 triggert Refresh, Requests laufen weiter (`api/index`) | Refresh-Fehler beendet Session hart und leitet auf `/login` | Deterministisch technisch, aber UX-Transparenz gering |
| Non-Admin: Login -> Versuch `/users` | Guard blockiert und leitet auf `/hardware` (`router`) | Kein Sicht-Hinweis auf fehlende Berechtigung | Sicherheitsziel erreicht, Nutzerfuehrung ausbaubar |
| Non-Admin: Navigation | Admin-Sektion nicht sichtbar (`Sidebar`) | Direkter URL-Zugriff auf Admin-Route wird vom Guard gestoppt | UI+Router in Kombination konsistent |

---

## 7) User-Aktionsnachverfolgbarkeit (request_id / audit links)

## 7.1 IST-Befund

- Jeder API-Request bekommt clientseitig `X-Request-ID` (`src/api/index.ts`).
- Response-/Error-Logging nutzt `x-request-id` zur Korrelation (`src/api/index.ts`).
- User-Management-Aktionen (Create/Update/Delete/Reset/Change Password) geben nur generische Success/Error-Feedbacks aus (`src/views/UserManagementView.vue`).
- Keine direkte Anzeige/Kopie von `request_id` je sensible Aktion im User-Management-UI.
- Es existiert request_id/correlation_id-Visualisierung in System-Monitor-Flows, aber nicht im User-Management-Kontext (`src/views/SystemMonitorView.vue`, `src/components/system-monitor/EventDetailsPanel.vue`).

## 7.2 Bewertung

- Technische Traceability: **vorhanden**
- Operative UI-Traceability im F12-Scope: **nicht ausreichend**

## 7.3 SOLL fuer F12

- Nach mutierenden User-Aktionen optionale Anzeige: "Request-ID kopieren".
- Link/Shortcut in Richtung Audit-/Event-Ansicht mit vorgefilterter request_id.
- Fehlerdialoge bei Auth/User-Fehlern sollten request_id mitschreiben, sofern vorhanden.

---

## 8) Tests und Nachweise (Soll vs Ist)

## 8.1 Geforderter Nachweis: E2E login -> admin route -> logout-all

- Vorhanden: `tests/e2e/scenarios/auth.spec.ts` deckt Login + Logout-Basis ab.
- Luecke: Kein expliziter E2E-Pfad fuer "admin route + logout all devices".
- Empfehlung: neuer E2E-Testfall fuer `/users` Zugriff und bestaetigtes `Sign Out All Devices`.

## 8.2 Geforderter Nachweis: Integration parallele 401 mit genau einem Refresh-Lauf

- Codepfad vorhanden: Queue-Mechanik in `src/api/index.ts`.
- Luecke: Kein dedizierter Integrationstest auf "N parallele 401 -> genau 1 Refresh-Request".
- Empfehlung: Integrationstest mit MSW/Spy auf `/auth/refresh` und zwei parallelen API-Calls.

## 8.3 Bestehende relevante Tests

- `tests/unit/stores/auth.test.ts`: Auth-Store-Lifecycle inkl. refreshTokens-Grundverhalten.
- `tests/e2e/scenarios/auth.spec.ts`: Login/Logout-Basisfluss.

---

## 9) Risiken und priorisierte Folgeauftraege

## R1 (hoch): Nicht einheitliche Recovery-Kommunikation bei Auth-Fehlern
- Symptom: Silent clear / harter Redirect ohne klare Nutzeranweisung.
- Folgeauftrag: zentrale Auth-Recovery-UX (Banner + CTA + Reason-Code).

## R2 (mittel): `remember_me` ohne wirksame Session-Semantik
- Symptom: Checkbox vorhanden, aber keine differenzierte Storage-Strategie.
- Folgeauftrag: Storage-Split (`sessionStorage` vs `localStorage`) + TTL-Hinweis.

## R3 (mittel): Keine sichtbare Audit-Kopplung fuer User-Admin-Aktionen
- Symptom: Request-IDs technisch vorhanden, aber in User-UI nicht nutzbar.
- Folgeauftrag: Request-ID-Expose + Deep-Link in Audit/System-Ansicht.

---

## 10) Akzeptanzkriterien-Check

- Kein stiller Auth-Ausfall ohne Nutzeranweisung: **noch nicht erfuellt** (R1 offen).
- Sessionverhalten klar und reproduzierbar: **noch nicht erfuellt** (R2 offen).
- Sensible User-Aktionen auditierbar: **teilweise erfuellt** (technisch ja, UI-seitig nein).

Gesamtfazit F12: Architektur und technische Flows sind tragfaehig, aber fuer P1-Anforderung fehlt die letzte Meile in Recovery-Transparenz, Session-UX und operativer Audit-Nutzbarkeit.

