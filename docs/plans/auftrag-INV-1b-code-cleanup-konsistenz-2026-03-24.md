# Auftrag INV-1b — Code-Cleanup + API-Konsistenz

> **Erstellt:** 2026-03-24
> **Grundlage:** Backend-DB-Endpunkt-Inventur (`Datenbanken/Backend-DB-Endpunkt-Inventur-2026-03-24.md`)
> **Typ:** Cleanup + Refactoring — kein neues Feature
> **Aufwand:** ~3-4h
> **Prioritaet:** MEDIUM
> **Abhaengigkeit:** Kann parallel zu INV-1a ausgefuehrt werden

---

## Kontext

Die Inventur hat toten Code, deprecated Handler, inkonsistente Benennungen und doppelte Endpoints identifiziert. Dieser Auftrag raeumt auf, ohne neue Funktionalitaet hinzuzufuegen. Alle Aenderungen sind rueckwaertskompatibel, mit einer Ausnahme (H2 — Sequences-Prefix), die ein bewusstes Breaking Change ist.

---

## Block A: Toten Code entfernen (~1h)

### A1: library.py entfernen (Finding M1)

`src/api/v1/library.py` ist eine **komplett leere Router-Datei** — 0 Endpoints. Geplant fuer OTA-Updates, aber nie implementiert.

**Umsetzung:**
1. Datei `src/api/v1/library.py` loeschen
2. Import und Router-Einhaengung in `src/api/v1/__init__.py` (oder wo der Router registriert wird) entfernen
3. Falls die Datei `src/db/models/library.py` (`LibraryMetadata` Model) NUR von library.py genutzt wird: Model und Tabelle vorerst **behalten** (koennte spaeter fuer OTA gebraucht werden), aber einen Kommentar ergaenzen: `# Stub — wird aktuell von keinem Endpoint genutzt`

**Akzeptanzkriterien:**
- [ ] Kein `/api/v1/library` Prefix mehr in der API
- [ ] Server startet ohne Fehler
- [ ] `library_metadata` Tabelle bleibt bestehen (kein Alembic-Drop)

### A2: KaiserHandler Stub entfernen (Finding M2)

`src/mqtt/handlers/kaiser_handler.py` hat nur einen Docstring, keinen Code. Die Datei ist **nicht registriert** — weder in `src/mqtt/handlers/__init__.py` importiert noch in `src/main.py` subscribed. Es gibt keinen aktiven Topic-Subscribe fuer diesen Handler.

**Umsetzung:**
1. Datei loeschen
2. ~~Handler-Registrierung im MQTT-Client entfernen~~ [Korrektur: Nicht noetig — kaiser_handler ist weder in `__init__.py` importiert noch in `main.py` registriert. Nur Datei loeschen genuegt.]

**Akzeptanzkriterien:**
- [ ] Datei `kaiser_handler.py` entfernt
- [ ] MQTT-Handler-Anzahl: 15 aktiv (12 regulaere + 3 Mock-Handler in main.py) — unveraendert, da Stub nie registriert war
- [ ] Server startet ohne Fehler

### A3: Deprecated Debug-Endpoints markieren (Finding M3)

3 Debug-Endpoints in `src/api/v1/debug.py` sind deprecated:

1. `GET /debug/mock-esp/{esp_id}/messages` (Z.1839) — immer leere Liste, nutzt `AdminUser` Auth
2. `DELETE /debug/mock-esp/{esp_id}/messages` (Z.1871) — no-op, nutzt `AdminUser` Auth
3. `GET /debug/mock-esp/sync-status` (Z.3750) — veraltet, **hat bereits `deprecated=True` (Z.3755)**

**Umsetzung:**
Die 2 Endpoints ohne `deprecated`-Flag (GET messages, DELETE messages) mit `deprecated=True` im Router-Decorator versehen. Endpoint 3 (sync-status) hat das Flag bereits — dort nur pruefen ob Description-Text konsistent ist:

```python
@router.get(
    "/mock-esp/{esp_id}/messages",
    deprecated=True,  # FastAPI markiert in OpenAPI als deprecated
    description="DEPRECATED — wird in naechster Version entfernt"
)
```

NICHT sofort entfernen — erst pruefen ob das Frontend sie noch aufruft. Wenn Frontend-Calls gefunden werden: Diese ebenfalls entfernen.

**Hinweis:** Es gibt einen 4. bereits deprecated Endpoint `DELETE /cleanup/orphaned-mocks` (Z.3490, hat `deprecated=True`) — dieser ist NICHT Teil dieses Auftrags, nur zur Kenntnis.

**Akzeptanzkriterien:**
- [ ] 3 Endpoints in Swagger-UI als "deprecated" markiert (1 davon war es schon)
- [ ] Funktionalitaet unveraendert (kein Breaking Change)

### A4: DiscoveryHandler deprecation dokumentieren (Finding M4)

`src/mqtt/handlers/discovery_handler.py` ist deprecated — Device-Discovery laeuft ueber den HeartbeatHandler. Der DiscoveryHandler bleibt vorerst fuer Rueckwaertskompatibilitaet mit alten Firmware-Versionen.

**IST-Zustand:** Der Handler hat bereits einen ausfuehrlichen Deprecation-Docstring (Z.1-18): "DEPRECATED", "PRIMARY DISCOVERY MECHANISM: Heartbeat messages", Migrationshinweise. Es fehlt aber ein `logger.warning` beim Aufruf — aktuell wird nur `logger.info("Processing discovery...")` geloggt (Z.79).

**Umsetzung:**
1. ~~Docstring am Handler-Anfang~~ [Korrektur: Docstring existiert bereits — kein Handlungsbedarf]
2. Logger-Warning beim Aufruf ergaenzen: In `handle_discovery()` (Z.79) ein `logger.warning("DiscoveryHandler called — deprecated since T13, use HeartbeatHandler", extra={"esp_id": ...})` VOR dem bestehenden `logger.info` einfuegen
3. NICHT entfernen (Firmware-Kompatibilitaet)

**Akzeptanzkriterien:**
- [x] Deprecation-Hinweis im Code (bereits vorhanden)
- [ ] Warning im Log wenn Handler getriggert wird (fehlt noch — nur logger.info vorhanden)
- [ ] Keine Funktionsaenderung

---

## Block B: API-Inkonsistenzen beheben (~1.5h)

### B1: Zone-Endpoint-Duplikate konsolidieren (Finding M5)

Es gibt **zwei verschiedene Endpoints** die Zonen auflisten:

| Endpoint | Router | Auth | Response |
|----------|--------|------|----------|
| `GET /api/v1/zones/` | zones.py | **OperatorUser** | Basis-Zonen (nur zones-Tabelle) |
| `GET /api/v1/zone/zones` | zone.py | **ActiveUser** | Enriched Zonen (mit Device-Counts, Sensor-Counts) |

Das ist verwirrend fuer Frontend-Entwickler und fuehrt zu falscher Auth-Wahl.

**SOLL-Zustand:**
- `GET /api/v1/zones/` (zones.py) wird **zum enriched Endpoint** — gleiche Response wie aktuell `GET /api/v1/zone/zones`
- `GET /api/v1/zone/zones` bekommt `deprecated=True` und leitet intern auf den zones.py-Endpoint weiter
- Auth fuer `GET /api/v1/zones/` wird auf **ActiveUser** gesenkt (Read-Only braucht kein Operator)

**Umsetzung:**
1. In `zones.py`: `list_zones()` um Device/Sensor-Counts anreichern (Service-Call wie in zone.py)
2. In `zones.py`: Auth von `OperatorUser` auf `ActiveUser` fuer `GET /` aendern
3. In `zone.py`: `GET /zones` mit `deprecated=True` markieren, Response von zones.py forwarden
4. Frontend: Alle Calls auf `GET /api/v1/zone/zones` auf `GET /api/v1/zones/` umstellen (falls Frontend-Zugriff moeglich)

**Akzeptanzkriterien:**
- [ ] `GET /api/v1/zones/` liefert enriched Daten (mit Counts)
- [ ] `GET /api/v1/zones/` erfordert nur ActiveUser
- [ ] `GET /api/v1/zone/zones` weiterhin funktional (deprecated, aber nicht kaputt)
- [ ] Kein Frontend-Bruch

### B2: Zone-CRUD Auth vereinheitlichen (Finding M6)

Zone-Read-Endpoints haben inkonsistente Auth-Level:

| Endpoint | Aktuell | Sollte sein |
|----------|---------|-------------|
| `GET /api/v1/zones/` | OperatorUser | **ActiveUser** (Read-Only) |
| `GET /api/v1/zones/{zone_id}` | OperatorUser | **ActiveUser** (Read-Only) |
| `GET /api/v1/zone/zones` | ActiveUser | ActiveUser (korrekt) |
| `GET /api/v1/zone/{zone_id}/devices` | ActiveUser | ActiveUser (korrekt) |
| `POST/PUT/PATCH/DELETE /zones/*` | OperatorUser | OperatorUser (korrekt) |

**Regel:** Alle GET-Endpoints (Read-Only) brauchen nur ActiveUser. Alle mutierenden Endpoints (POST/PUT/PATCH/DELETE) brauchen OperatorUser. Das ist konsistent mit allen anderen Routern im System (sensors.py, actuators.py, esp.py).

**Umsetzung:**
In `zones.py`: `list_zones` (Z.93) und `get_zone` (Z.126) von `OperatorUser` auf `ActiveUser` aendern. Dafuer muss `ActiveUser` in den Import aufgenommen werden (aktuell Z.36: `from ..deps import DBSession, OperatorUser` — `ActiveUser` fehlt). Die 6 mutierenden Endpoints (POST, PUT, PATCH, DELETE, archive, reactivate) bleiben bei OperatorUser.

**Akzeptanzkriterien:**
- [ ] `GET /zones/` und `GET /zones/{zone_id}` erfordern nur ActiveUser
- [ ] Mutierende Zone-Endpoints weiterhin OperatorUser
- [ ] Kein Frontend-Bruch

### B3: Sequences-Prefix korrigieren (Finding H2)

`src/api/v1/sequences.py` hat den Prefix `/sequences` statt `/v1/sequences`. Dadurch sind die Endpoints unter `/api/sequences/` statt `/api/v1/sequences/` erreichbar — als einziger Router im gesamten System.

**ACHTUNG:** Das ist ein **Breaking Change**. ~~Vor der Umsetzung muss geprueft werden ob das Frontend `/api/sequences/*` aufruft.~~ [Korrektur: Bereits geprueft — das Frontend hat KEINE Aufrufe an `/api/sequences`. Einzige Fundstelle ist ein Kommentar in `eventGrouper.ts:57` ("emergency sequences"), kein HTTP-Call. Der Breaking Change betrifft also nur externe API-Consumer, nicht das Frontend.]

**Umsetzung:**
1. In `sequences.py`: Prefix von `/sequences` auf `/v1/sequences` aendern
2. ~~Im Frontend: Grep nach `/api/sequences` und auf `/api/v1/sequences` umstellen~~ [Korrektur: Nicht noetig — Frontend nutzt keine Sequences-Endpoints]
3. Optional: Temporaere Redirect-Route von `/api/sequences/*` auf `/api/v1/sequences/*` (fuer Uebergangszeit)

**Akzeptanzkriterien:**
- [ ] Alle 4 Sequence-Endpoints unter `/api/v1/sequences/` erreichbar
- [ ] Frontend nutzt den neuen Pfad
- [ ] Alte Pfade geben 404 (oder Redirect, falls implementiert)

---

## Was NICHT gemacht wird

- Keine neuen Endpoints oder Tabellen
- Kein Debug-Endpoint-Splitting (Finding L6) — Aufwand steht nicht im Verhaeltnis zum Nutzen
- Kein Entfernen des DiscoveryHandlers (Firmware-Kompatibilitaet)
- Keine Aenderungen an Sensor Processing Auth (H3) — das separate API-Key-System ist eine bewusste Design-Entscheidung fuer ESP-zu-Server-Kommunikation

---

## Reihenfolge

1. **Block A** (A1-A4) — Kann sofort parallel bearbeitet werden, kein Risiko
2. **Block B** (B1-B3) — B1 und B2 betreffen dieselbe Datei (`zones.py`) und sollten zusammen gemacht werden. B3 (Sequences) ist unabhaengig und kann parallel laufen. B3 Schritt 2 (Frontend) entfaellt — keine Frontend-Aenderung noetig.
