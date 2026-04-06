# Auftrag S1 — Core-Infrastruktur (Config, Logging, Resilience, Health, Metrics)

**Datum:** 2026-04-05  
**Typ:** Tiefenanalyse  
**Empfohlener Agent:** `server-debug`

---

## Verbindliche Referenzen

1. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` — insb. G4, E3 (Degraded vs. „scheinbar OK“)  
2. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\README-serie-S0-S13-2026-04-05.md`

---

## Code-Wurzel

`El Servador/god_kaiser_server/src/core/`

---

## Report

`Auto-one/.claude/reports/current/server-analyse/report-server-S1-core-infrastruktur-2026-04-05.md`

---

## Ziel

Du dokumentierst, **wie** das Backend Fehler, Degradation und Gesundheit nach außen und innen abbildet — und ob Health/Metrics den **Realbetrieb** (MQTT, DB) zuverlässig widerspiegeln.

---

## Scope

- `config` (Settings, Umgebungsvariablen, Defaults)  
- `logging` / strukturierte Logs (falls vorhanden)  
- `exceptions` und zentrale Fehlercodes (inkl. Bezug zu API-Responses)  
- `resilience`, Circuit Breaker, Retry-Grenzen  
- Health-Endpoints, Prometheus/Metrics (falls unter `core/` oder eng gekoppelt)

---

## Aufgaben

1. **Degradation-Signale:** Welche Zustände/Flags bedeuten „DEGRADED“ oder „nicht voll funktionsfähig“, und wo werden sie gesetzt?  
2. **Health vs. Realität:** Kann `/health` oder äquivalent „grün“ sein, während MQTT oder DB faktisch untauglich ist? Belege mit Codepfaden.  
3. **Exception-Mapping:** Wie wandern interne Exceptions zu HTTP-Status, WebSocket-Fehlern, MQTT-Fehlerpublishes?  
4. **Observability:** Welche Log-Keys oder Metric-Namen sind für Störfälle relevant (liste konkrete Strings aus dem Code)?  
5. **Störfall-Matrix:** Mindestens **drei** konkrete Szenarien (z. B. DB timeout, MQTT disconnect, breaker open) mit **erwartetem** sichtbaren Signal (Log/Metric/HTTP).

---

## Deliverables

- Matrix: Signal | Bedeutung | gesetzt in | sichtbar als …  
- Kurzliste Drift-Risiken (Dokumentation vs. Code) falls auffällig  
- Gap-Liste P0/P1/P2 bezogen auf G2/G4

---

## Abnahmekriterien

- Jede Zeile der Matrix hat mindestens einen **Codeanker**  
- Kein Health-Endpoint ohne Aussage zu seinen Abhängigkeiten (was wird wirklich geprüft)
