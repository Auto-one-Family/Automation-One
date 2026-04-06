# Report F12: Auth, User-Management, Settings, Setup

Datum: 2026-04-05  
Scope: `El Frontend/src/views/LoginView.vue`, `El Frontend/src/views/SetupView.vue`, `El Frontend/src/views/SettingsView.vue`, `El Frontend/src/views/UserManagementView.vue`, `El Frontend/src/shared/stores/auth.store.ts`, `El Frontend/src/api/auth.ts`, `El Frontend/src/api/users.ts`, `El Frontend/src/api/index.ts`, `El Frontend/src/router/index.ts`, `El Frontend/src/shared/design/layout/Sidebar.vue`

## 1) Executive Result

- Auth-Lebenszyklus ist klar implementiert: Login/Setup setzen Tokens, Guard erzwingt Zugriff, Interceptor erneuert Access-Token, Logout bereinigt Session und WS.
- Rollenwirkung ist doppelt abgesichert: UI-Navigation blendet Admin-Bereiche aus und Router blockiert Admin-Routen serverunabhaengig.
- User-Management ist funktional vollstaendig (CRUD + Passwort-Reset + eigenes Passwort aendern) inkl. klarer UI-Rueckmeldungen.
- Auth-kritische Failure-Pfade sind vorhanden, aber teils uneinheitlich in UX (silent clear vs. sichtbarer Fehlerhinweis).
- Settings-Persistenz ist aktuell minimal: in `SettingsView` selbst keine echte Persistenzlogik, nur Session-Aktionen (Logout/Logout-all).
- Es gibt 3 konkrete Risiken: fehlende explizite Guard-Recovery bei Auth-Status-Fehler, keine sichtbare Audit-Kopplung im User-UI, ungenutztes `remember_me`.

---

## 2) Auth-Flow Ende-zu-Ende (Login, Refresh, Logout, Guard)

## 2.1 Login-Flow

1. `LoginView.handleLogin()` ruft `authStore.login(...)` auf.
2. `auth.store.login()` ruft `authApi.login()` auf.
3. Response verarbeitet `tokens.access_token` + `tokens.refresh_token` via `setTokens()`.
4. Tokens werden in `localStorage` persistiert (`el_frontend_access_token`, `el_frontend_refresh_token`).
5. `user` wird direkt aus Login-Response gesetzt.
6. View navigiert auf Redirect-Route oder `/`.
7. Router-Guard laesst geschuetzte Route zu, weil `isAuthenticated = !!accessToken && !!user`.

## 2.2 Setup-Flow (First Run)

1. Guard triggert `checkAuthStatus()` bei uninitialisiertem Zustand (`setupRequired === null`).
2. `authApi.getStatus()` liefert `setup_required`.
3. Falls `true`: Guard erzwingt Route `/setup`.
4. `SetupView.handleSetup()` ruft `authStore.setup(...)`.
5. Setup setzt Tokens + User analog Login und markiert `setupRequired = false`.
6. Navigation auf `/`, Guard erlaubt Zugriff.

## 2.3 Refresh-Flow (401 Recovery)

1. API-Response-Interceptor erkennt `401` (ausser auth-Endpunkte).
2. Falls `refreshToken` vorhanden und Request noch nicht retried:
   - Startet genau einen Refresh (`isRefreshing` + `failedQueue`).
   - Parallele Requests warten in Queue.
3. `authStore.refreshTokens()` ruft `/auth/refresh`, setzt neue Tokens, holt dann `authApi.me()`.
4. Originalrequest(s) werden mit neuem Bearer Token wiederholt.
5. Bei Refresh-Fehler: Queue reject, `clearAuth()`, Hard-Redirect auf `/login`.

## 2.4 Logout-Flow

1. `SettingsView` bietet `logout()` und `logout(true)` (alle Geraete) inkl. Confirm-Dialog.
2. `auth.store.logout()` versucht API-Logout (Fehler werden geloggt, aber nicht blockierend behandelt).
3. Immer ausgefuehrt im `finally`:
   - `websocketService.disconnect()`
   - `intentSignalsStore.clearAll()`
   - `clearAuth()` (Token + User aus Store/LocalStorage entfernen)
4. View navigiert auf `/login`.

---

## 3) Pflichtnachweis A: Auth-Event -> Store -> Router -> sichtbare Freigabe/Sperre

Beispiel "Nicht eingeloggt -> Login erforderlich":

1. Nutzer oeffnet z. B. `/users`.
2. Guard in `router.beforeEach` prueft `to.meta.requiresAuth`.
3. `!authStore.isAuthenticated` -> Redirect auf `login` mit `?redirect=/users`.
4. Sichtbarer Effekt: geschuetzte Seite ist gesperrt, Login-Maske sichtbar.

Beispiel "Erfolgreich eingeloggt -> Bereich freigegeben":

1. `authStore.login()` setzt Tokens + `user`.
2. `isAuthenticated` wird `true`.
3. `router.push(redirect || '/')`.
4. Guard laesst Navigation passieren, geschuetzter Bereich wird sichtbar.

Beispiel "Rolle nicht admin -> Admin-Sperre":

1. Nutzer mit Rolle `viewer` navigiert auf `/users` oder `/system-monitor`.
2. Guard prueft `to.meta.requiresAdmin && !authStore.isAdmin`.
3. Redirect auf `/hardware`.
4. Sichtbarer Effekt: Admin-Bereiche sind gesperrt.

---

## 4) Rollenwirkung in Navigation und API-Zugriff

## 4.1 Navigation (UI-Gating)

- `Sidebar.vue` zeigt den gesamten Abschnitt "Administration" nur bei `authStore.isAdmin`.
- Nicht-Admins sehen damit Links zu `System`, `Benutzer`, `Kalibrierung`, `Plugins`, `Postfach` nicht.
- Das reduziert Fehlbedienung, ersetzt aber nicht das Router-Gating.

## 4.2 Router (Route-Gating)

- Admin-Routen sind mit `meta.requiresAdmin: true` markiert (`/users`, `/system-monitor`, `/system-config`, `/load-test`, `/plugins`, `/email`, `/calibration`).
- Guard blockiert diese Routen hart fuer Nicht-Admins.

## 4.3 API-Zugriff (Transportebene)

- Jeder Request erhaelt Bearer Token via Request-Interceptor.
- Bei Ablauf des Access-Tokens greift der Refresh-Mechanismus zentral.
- Rollenautorisierung der Endpunkte selbst passiert backendseitig; Frontend erzwingt nur Session + Route-Level.

---

## 5) User-Management-Lifecycle inkl. Fehler- und Audit-Aspekte

## 5.1 Lifecycle (UI -> API -> Resultat -> Feedback)

1. `onMounted` in `UserManagementView` laedt via `usersApi.listUsers()`.
2. Aktionen:
   - Create: `usersApi.createUser()`
   - Update: `usersApi.updateUser()`
   - Delete: `usersApi.deleteUser()`
   - Reset Passwort: `usersApi.resetPassword()`
   - Eigenes Passwort: `usersApi.changeOwnPassword()`
3. Erfolgsfall:
   - Modal schliesst
   - Erfolgsmeldung (`successMessage`)
   - bei CRUD zusaetzlich Reload der Userliste
4. Fehlerfall:
   - Fehler aus `response.data.detail` (Fallback-Text)
   - sichtbare Error-Alert-Leiste

## 5.2 Failure-/Recovery-Bewertung

- **Positiv:** Jede Kernaktion hat try/catch und Nutzerfeedback.
- **Positiv:** `isLoading` wird sauber zurueckgesetzt.
- **Luecke:** Erfolgs-/Fehlermeldungen sind Englisch, waehrend restliche UI deutsch ist (Betriebskonsistenz).
- **Luecke:** Keine explizite Retry-Aktion bei Fehlern ausser erneut klicken.

## 5.3 Audit-Aspekte

- API-Client setzt pro Request `X-Request-ID` (Trace-Korrelation vorhanden).
- Frontend selbst zeigt diese Audit-Korrelation im User-Management nicht an.
- Folge: Operator kann konkrete User-Aktionen in der UI nicht direkt mit Backend-Audit-Eintraegen matchen.

---

## 6) Trennung lokale vs. serverseitige Settings-Persistenz

| Bereich | Lokal (Frontend) | Serverseitig |
|---|---|---|
| Auth-Token | `localStorage` (`TOKEN_KEY`, `REFRESH_TOKEN_KEY`) | Ausgabe/Invalidierung ueber `/auth/login`, `/auth/setup`, `/auth/refresh`, `/auth/logout` |
| Session-User | In-Memory `authStore.user` | Quelle ist `/auth/me` bzw. Login/Setup-Response |
| Logout-All | Kein lokaler Zustand ausser Session-Clear | Token-Invalidierung fuer alle Geraete via `/auth/logout { all_devices: true }` |
| SettingsView | Keine persistierten User-Settings, nur Anzeige + Logout-Aktionen | Keine Settings-Write-Calls in dieser View |
| User-Management-Einstellungen (Rolle/Aktiv/Passwort) | Form-State nur transient in View | Persistenz ueber `/users*` Endpunkte |

Fazit: In F12-Scope sind "Settings" primar Session-/Account-Aktionen; eine eigenstaendige lokale Settings-Persistenz (Preferences) ist hier nicht implementiert.

---

## 7) Failure- und Recovery-Dokumentation je auth-kritischem Pfad

## P1: `checkAuthStatus()` beim App-/Guard-Start

- Failure: `authApi.getStatus()` oder nachgelagerte Calls schlagen fehl.
- Aktuelles Verhalten: `error = 'Failed to check authentication status'`, `isLoading=false`.
- Recovery: kein automatischer Redirect; spaetere Navigation wird weiter durch Guard bewertet.
- Risiko: unklarer Zustand fuer Nutzer ohne klare Retry-Fuehrung.

## P2: Login

- Failure: falsche Credentials / API-Fehler.
- Verhalten: `authStore.error` wird gesetzt und in `LoginView` angezeigt.
- Recovery: Nutzer kann Eingaben korrigieren und erneut absenden.

## P3: Setup

- Failure: Validierung/Serverfehler.
- Verhalten: Fehlermeldung ueber Store in `SetupView`.
- Recovery: Formular bleibt offen, erneute Eingabe moeglich.

## P4: Token-Refresh

- Failure: Refresh token ungueltig/abgelaufen.
- Verhalten: `clearAuth()` + Redirect `/login` (harte Session-Beendigung).
- Recovery: erneute Anmeldung.

## P5: Logout / Logout-All

- Failure: `/auth/logout` call fehlschlaegt.
- Verhalten: Fehler wird nur geloggt; lokaler Cleanup wird trotzdem immer ausgefuehrt.
- Recovery: Session-Ende frontendseitig garantiert; serverseitige Invalidierung kann im Fehlerfall ausbleiben.

---

## 8) Konkrete Risiken und Folgeauftraege

## R1 (mittel): Guard-Startup bei Auth-Status-Fehler nicht explizit geleitet

- Beobachtung: `checkAuthStatus()` setzt Fehlertext, aber kein definierter UX-Pfad (z. B. Retry/Forced Login/Error-Screen).
- Folgeauftrag F12-A: definierter Recovery-Pfad fuer Auth-Init-Fehler (retry button + fallback route + observability event).

## R2 (mittel): `remember_me` wird gesendet, aber im Frontend nicht sichtbar wirksam

- Beobachtung: Login sendet `remember_me`, Token-Speicher ist aber immer `localStorage` ohne differenzierte Strategie.
- Folgeauftrag F12-B: Session-Persistenzstrategie explizit machen (z. B. sessionStorage bei `remember_me=false` oder serverseitige TTL-Rueckmeldung im UI anzeigen).

## R3 (niedrig-mittel): Audit-Transparenz im User-Management fehlt

- Beobachtung: Request-ID wird erzeugt, aber nicht pro User-Aktion eingeblendet.
- Folgeauftrag F12-C: optionale "Audit-Trace-ID kopieren"-Anzeige nach mutierenden User-Aktionen.

---

## 9) Endbewertung gegen Akzeptanzkriterien

- Kriterium "Jeder auth-kritische Pfad besitzt Failure-/Recovery-Dokumentation": erfuellt (Abschnitt 7).
- Kriterium "Rollenluecken als konkrete Risiken mit Folgeauftrag": erfuellt (Abschnitt 8, R1-R3 inkl. Folgeauftraege).
- Pflichtnachweis "Auth-Event -> Store -> Router -> Freigabe/Sperre": erfuellt (Abschnitt 3).
- Pflichtnachweis "User-Aktion -> API -> Resultat -> UI-Rueckmeldung": erfuellt (Abschnitt 5.1).

