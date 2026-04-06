# Auftrag F12: Auth, User-Management, Settings, Setup

## Ziel
Validiere den Sicherheitskern des Frontends: Session-Lebenszyklus, Rollenwirkung, Berechtigungsdurchsetzung und Settings-Persistenz.

## IST-Wissen aus dem Frontend
- Login/Setup sind oeffentlich, geschuetzte Bereiche laufen ueber Guards.
- Auth-Rolle wirkt auf Admin-Views.
- User- und Settings-Fluesse verteilen sich auf View, Store und API.

## Scope
- `El Frontend/src/views/LoginView.vue`
- `El Frontend/src/views/SetupView.vue`
- `El Frontend/src/views/SettingsView.vue`
- `El Frontend/src/views/UserManagementView.vue`
- `El Frontend/src/shared/stores/auth.store.ts`
- `El Frontend/src/api/auth.ts`
- `El Frontend/src/api/users.ts`

## Analyseaufgaben
1. Zerlege Login/Refresh/Logout inkl. Tokenhaltung und Guard-Folge.
2. Belege Rollenwirkung in Navigation und API-Zugriffen.
3. Analysiere User-Management-Lifecycle inkl. Fehler- und Audit-Aspekten.
4. Trenne lokale und serverseitige Settings-Persistenz.

## Pflichtnachweise
- Auth-Event -> Store -> Router -> sichtbare Freigabe/Sperre.
- User-Aktion -> API -> Resultat -> UI-Rueckmeldung.

## Akzeptanzkriterien
- Jeder auth-kritische Pfad besitzt Failure- und Recovery-Dokumentation.
- Rollenluecken sind als konkrete Risiken mit Folgeauftrag ausgewiesen.

## Report
`.claude/reports/current/frontend-analyse/report-frontend-F12-auth-user-settings-2026-04-05.md`
