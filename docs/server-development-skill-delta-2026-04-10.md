# Delta: Server-Development-Skill (2026-04-10)

Ziel: Skill `.claude/skills/server-development/SKILL.md` auf **El Servador** (Ist-Stack, Schichten, Dual-Protokoll, Agent-Regeln) schärfen — ohne generisches FastAPI-Tutorial.

---

## Phase A — Bestandsaufnahme (Repo)

### A.1 Skill-Pfad

- Hauptdatei: `.claude/skills/server-development/SKILL.md`
- Progressive disclosure: `MODULE_REGISTRY.md`, `databases.md` (unverändert inhaltlich tiefgreifend; Delta betrifft primär `SKILL.md`)

### A.2 Kurz-Matrix (Ist vs. Skill vorher / nachher)

| Bereich | Bereits explizit im Skill (vorher) | Lücke / vage (vorher) | Nachstellung (jetzt) |
|---------|-----------------------------------|------------------------|----------------------|
| FastAPI Lifespan / App | Startup-Tabelle mit **veralteten Zeilennummern** | Brüche bei Refactors | Logische Phasen + Verweis auf `register_handler(` in `main.py` |
| API `api/v1/` | Ja | — | Präzisiert: Router-Bündelung `api/v1/__init__.py` |
| Pydantic vs. DB | Ja | — | Unverändert zentral |
| MQTT Client/Subscriber/Handler/Publisher | Ja, aber **Handler-Snippet falsch** (freie Funktion statt Klasse+Callback) | Abgleich Topic-Tabelle vs. Code | Dual-Protokoll-Abschnitt, korrektes Handler-Muster, `MQTT_TOPICS.md` als Source of Truth |
| DB Engine/Session | `get_db` im Beispiel | `get_session` vs. `get_db` vs. Scheduler | Explizite Tabelle zu drei Session-Mustern (`api/deps.py`, `db/session.py`) |
| Alembic | Ja (`alembic revision`) | — | Unverändert |
| Auth (JWT, Rollen) | Auth-Matrix | API-Key in `deps.py` nur kurz | In Agenten-Regeln: „Auth-Stufen respektieren“ |
| Business-Services | Großes Inventar | — | Unverändert; Feature-Pfad ergänzt |
| WebSocket / Realtime | Erwähnt | Konkrete Pfade | `api/v1/websocket/realtime.py`, `websocket/manager.py` |
| Background / Scheduler | Sektion 9 | — | Verweis bleibt auf Lifespan + Services |
| Observability | Logging, Metriken | Request-ID / Trace | `middleware/request_id.py`, Kontext in Regel „Logging“ |
| Tests | Verweis TEST_WORKFLOW | `dependency_overrides` | Explizit `tests/conftest.py` + `get_db`-Override |
| Docker Compose | — | — | `postgres`, `mqtt-broker` in `docker-compose.yml` (Root) — für lokale Infra |
| Fragile / safety-kritisch | safety_service, logic_engine | — | In §12 als „nicht hacken“ implizit |

### A.3 Projektdoku (Auszug, nur Übernommenes)

- `.claude/CLAUDE.md`: Server-zentrisch; Verifikation `pytest` / `ruff` unter `El Servador/god_kaiser_server`; Referenzen `reference/api/`, `errors/`, `testing/`.
- `AGENTS.md`: Stack-Tabelle, Umgebungsvariablen, Compose-Netzwerk-Hinweis.
- `El Servador/god_kaiser_server/docs/finalitaet-http-mqtt-ws.md`: HTTP-/MQTT-/WS-Finalität und `correlation_id`-Semantik (nicht erfunden — dort dokumentiert).

---

## Phase B — Recherche (Web, stack-spezifisch)

Gezielte Richtungen (angebunden an **dieses** Repo):

| Thema | Quellen (Typ) | Übernehmen / Ablehnen |
|-------|----------------|------------------------|
| FastAPI Lifespan | [FastAPI Lifespan Events](https://fastapi.tiangolo.com/advanced/events/) | **Übernehmen:** `@asynccontextmanager` für Startup/Shutdown wie in `src/main.py` — kein zweites Event-Pattern einführen. |
| Async SQLAlchemy + FastAPI DI | [SQLAlchemy asyncio](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html), Diskussion zu Session-per-Request | **Übernehmen:** AsyncSession, kein implizites Lazy-Load — deckt sich mit Skill-Regel `selectinload`. |
| Tests `dependency_overrides` | [FastAPI Testing Dependencies](https://fastapi.tiangolo.com/advanced/testing-dependencies/) | **Übernehmen:** Overrides für `get_db` wie in `tests/conftest.py` — nicht ein zweites Test-DI erfinden. |
| MissingGreenlet | SQLAlchemy-Doku / Community zu async ORM | **Übernehmen:** Eager Loading — bereits Skill-Regel; keine Änderung am Muster. |

**Abgelehnt:** Generische „FastAPI 101“-Tutorials ohne Async-SQLAlchemy-2.x und ohne Bezug zu `get_session()`-Generator und MQTT-Lifespan.

---

## Phase C — Synthese (was im Skill jetzt steht)

- **Stack-Anker** aus `pyproject.toml` (Versionen/Grenzen).
- **Schichtenmodell** mit echten Pfaden unter `god_kaiser_server/src/`.
- **Dual-Protokoll:** REST + MQTT + WebSocket mit Verweis auf `docs/finalitaet-http-mqtt-ws.md` und `.claude/reference/api/*`.
- **Handler-Erweiterung:** realistisches Muster (Klasse + `register_handler`, `TopicBuilder`), keine erfundene Funktionssignatur.
- **Feature-Minimalpfad** und **§12 Agenten** für Scope und Regressionsschutz.

---

## Phase D — Umsetzung

Abschnitt **„12. Coding-Agenten: typische Fehler und Soll-Verhalten“** in `SKILL.md` — checklistenartig, auf El Servador zugeschnitten.

---

## Optional: PR-/Review-Checkliste (Backend-Agent)

1. [ ] Kein neues Framework / kein zweites ORM — nur `pyproject.toml`-Stack.
2. [ ] Änderung an Gerätezustand: MQTT-Topics/Payloads und ggf. WS-Events mit Referenzdateien abgeglichen.
3. [ ] Keine Business-Logik neu in `main.py` oder nur im Router ohne Service.
4. [ ] DB-Zugriff über Repository-Muster; keine String-SQL-Injection.
5. [ ] Async-Pfad: kein `time.sleep`; kein blockierendes sync-IO ohne bewusste Auslagerung.
6. [ ] Schema-/DB-Änderung: Alembic-Revision geprüft, Models konsistent.
7. [ ] Tests ergänzt/angepasst; bei API-Tests `dependency_overrides`/`conftest`-Muster.
8. [ ] Aktorbefehle: `SafetyService`-Pfad nicht umgangen.
9. [ ] Logging/Korrelation: bestehende Middleware und strukturierte Logs respektiert.
10. [ ] `pytest` und bei Backend-Touch `ruff check` grün (siehe `CLAUDE.md`).

---

*Ende Delta.*
