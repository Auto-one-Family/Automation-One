# Auftrag 4.2: Frontend Logging Assessment – Erstanalyse
Datum: 2026-02-09
Typ: Analyse (kein Code)

## Context

Aus der Monitoring-Stack-Analyse wissen wir:
- Frontend hat **68 `console.*`-Calls** in 34 Dateien (nicht 242 wie ursprünglich angenommen)
- **Kein zentraler Logger** – alle Calls sind ad-hoc `console.log/warn/error`
- **Keine Loki-Integration** – Frontend-Errors sind nur in Browser-DevTools sichtbar
- **Keine Grafana-Integration** – kein API-Client, kein Embedding
- Frontend-Panel 4 im Dashboard zeigt nur "Log Activity" (Loki count_over_time auf Container-stdout)

Robin hat entschieden: Langfristig Option A (zentraler Logger + Loki-Push). Dieser Auftrag ist die **Bestandsaufnahme** als Grundlage.

## Focus

1. **Console-Call-Inventar:** Kategorisiere die 68 Calls. Wie viele sind debug/info/warn/error? In welchen Komponenten? Gibt es Patterns (z.B. API-Error-Handling, Store-Actions, Lifecycle-Hooks)?
2. **Error-Handling analysieren:** Wie werden API-Fehler aktuell behandelt? Gibt es einen globalen Error-Handler? `window.onerror`? Vue `errorHandler`? Oder fällt alles still durch?
3. **Logging-Bibliotheken bewerten:** Was würde als zentraler Logger passen? `pino` (lightweight), `loglevel`, oder Custom? Kriterien: Bundle-Size, Tree-Shaking, Browser-Kompatibilität.
4. **Loki-Push-Pfad skizzieren:** Wie kämen Frontend-Logs nach Loki? Optionen: Direct-Push an Loki-API (CORS?), Proxy über El Servador, oder Promtail-kompatibles Format über stdout.

## Agents

**Schritt 1:** `/agent frontend-debug` – Modus A (allgemeine Analyse). Vollständiges Inventar der `console.*`-Calls: Datei, Zeile, Level, Kontext. Analyse des Error-Handlings: globale Handler, try/catch-Patterns, API-Error-Propagation. Bewertung der aktuellen Logging-Architektur.

**Schritt 2:** `/agent server-debug` – Prüfe ob El Servador bereits einen Endpoint hat der Frontend-Logs entgegennehmen könnte (z.B. `/api/v1/debug/`-Routen). Prüfe CORS-Config: Könnte das Frontend direkt an Loki pushen?

## Goal

Ein Assessment das den IST-Zustand des Frontend-Loggings vollständig dokumentiert und einen realistischen Migrationspfad zu strukturiertem Logging + Loki-Integration aufzeigt.

## Success Criterion

Report enthält: Kategorisiertes Console-Call-Inventar, Error-Handling-Analyse, Logger-Empfehlung mit Begründung, Loki-Push-Strategie mit Vor-/Nachteilen. Robin kann danach Aufwand und Priorität einschätzen.

## Report zurück an
.technical-manager/inbox/agent-reports/frontend-logging-assessment.md
