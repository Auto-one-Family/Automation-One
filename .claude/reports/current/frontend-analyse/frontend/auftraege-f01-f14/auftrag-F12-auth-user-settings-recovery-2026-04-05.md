# Auftrag F12: Auth, User-Management und Settings-Recovery

> **Typ:** Analyseauftrag  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend / F12  
> **Prioritaet:** P1

## Relevantes Wissen (kompakt und verbindlich)
- Auth-Lebenszyklus umfasst Setup, Login, Token-Refresh, Guard und Logout-Cleanup.
- Rollenrechte werden in Navigation und Router durchgesetzt.
- 401-Refresh-Queue ist robust, aber Userfuehrung bei Fehlern darf nicht still brechen.
- `remember_me`/Settings-Persistenz ohne klare UX-Strategie erzeugt Unsicherheit.

## IST-Befund
- Auth- und Rollenfluss ist funktional.
- User-Management ist breit abgedeckt (CRUD + Passwortpfade).
- Recovery-Kommunikation bei Guard-/Statusfehlern ist nicht durchgaengig transparent.
- Settings sind derzeit eher Session-Aktionen als echte Preferences.

## SOLL-Zustand
- Deterministischer Recovery-Pfad bei Auth-Fehlern mit klarer Nutzerfuehrung.
- Sichtbare Sessionstrategie (Storage, TTL, remember behavior).
- Audit-Traceability fuer sensible User-Aktionen.

## Analyseauftrag
1. Auth-Eventkette dokumentieren: setup/login/refresh/logout/guard.
2. Recovery-Matrix erstellen: `Fehlerfall -> aktuelles Verhalten -> Sollverhalten`.
3. Sessionstrategie konsolidieren (`sessionStorage`/`localStorage`/TTL-Kommunikation).
4. User-Aktionsnachverfolgbarkeit im UI bewerten (request_id/audit links).

## Scope
- **In Scope:** Login, Setup, auth.store, users/settings views, router guard.
- **Out of Scope:** IAM-Architekturneubau serverseitig.

## Nachweise
- Pfadbelege fuer jede Guard- und Refresh-Entscheidung.
- Tabelle mit Admin- und Non-Admin-Reisen inkl. Fehlerzweigen.

## Akzeptanzkriterien
- Kein "stiller" Auth-Ausfall ohne Nutzeranweisung.
- Sessionverhalten ist fuer Nutzer klar und reproduzierbar.
- Sensible User-Aktionen sind auditierbar.

## Tests/Nachweise
- E2E: login -> admin route -> logout-all.
- Integration: parallele 401 Requests mit exakt einem Refresh-Lauf.
