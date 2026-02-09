# TM-Auftrag 07: Redis Queuing – Überprüfung & Integration

**Verfasser:** Robin (System-Kontext)  
**Format:** Einzelgespräch mit Technical Manager  
**Ziel:** Redis prüfen, höchsten Standard, volle Kontrolle, lokale Integration

---

## 0. Referenzdokumente für TM (Robin mitliefern)

**Diese Dateien zuerst lesen – sie liefern die Grundlage für gezielte Analyse.**

| Priorität | Pfad (relativ zu Projektroot) | Inhalt |
|-----------|-------------------------------|--------|
| 1 | `El Servador/god_kaiser_server/src/core/config.py` | `RedisSettings` – REDIS_ENABLED, REDIS_HOST, REDIS_PORT |
| 2 | `El Servador/god_kaiser_server/src/api/deps.py` | `RedisRateLimiter`, In-Memory-Fallback |
| 3 | `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | Aktuell kein Redis-Service – wo einfügen? |
| 4 | `El Servador/god_kaiser_server/.env.example` | REDIS_* Variablen |
| 5 | `El Trabajante/docs/Mqtt_Protocoll.md` | Redis-Cache für Duplikat-Detection (geplant) |
| 6 | `El Servador/docs/AUTHENTICATION_AUDIT.md` | Redis für Rate Limiting (Production) |

**Hinweis:** Redis ist aktuell **nicht** im Stack – nur Config und Code-Skeleton vorhanden.

---

## 1. Referenzdateien für TM-Session hochladen

| # | Datei | Zweck |
|---|-------|-------|
| 1 | `El Servador/god_kaiser_server/src/core/config.py` | RedisSettings |
| 2 | `El Servador/god_kaiser_server/src/api/deps.py` | RateLimiter (Redis + In-Memory) |
| 3 | `.claude/reference/infrastructure/DOCKER_AKTUELL.md` | Kein Redis im Projekt |
| 4 | `El Servador/god_kaiser_server/.env.example` | REDIS_* Variablen |
| 5 | `El Trabajante/docs/Mqtt_Protocoll.md` | Redis-Cache für Duplikat-Detection |
| 6 | `El Frontend/Docs/UI/Audit.md` | Query Caching mit Redis |
| 7 | `El Servador/docs/AUTHENTICATION_AUDIT.md` | Redis für Rate Limiting |

---

## 2. IST-Zustand (Fakten)

### 2.1 Redis im Projekt

- **Nicht aktiv:** Redis wird aktuell nicht genutzt (DOCKER_AKTUELL.md: "No Redis").
- **Config:** RedisSettings existiert (REDIS_ENABLED=false, REDIS_HOST, REDIS_PORT, etc.).
- **Rate Limiter:** In-Memory als Fallback; Redis-basierte Implementierung vorgesehen für Production.
- **deps.py:** RedisRateLimiter implementiert; nutzt redis.asyncio wenn REDIS_ENABLED=true.

### 2.2 Mögliche Einsatzbereiche

| Bereich | Quelle | Beschreibung |
|---------|--------|--------------|
| Rate Limiting | deps.py, AUTHENTICATION_AUDIT | Sliding-Window über Prozesse |
| MQTT Duplikat-Detection | Mqtt_Protocoll.md | Schneller als Memory |
| Query Caching | Audit.md | Häufige Such-Queries |
| Message Queue | Mqtt_Protocoll.md | RabbitMQ/Redis für Async |

### 2.3 Anforderungen (Robin)

- Höchster Standard, volle Kontrolle.
- Voll im Projektkontext und System integriert.
- Industrieller Standard, robust.
- Absolut lokal, perfekt in System integriert.

---

## 3. Offene Fragen (für TM)

1. **Queuing vs. Caching:** Welche Use-Cases brauchen wir? Nur Rate Limiting oder auch Caching, Duplikat-Detection, Message Queue?
2. **Lokal:** Redis als Docker-Service neben PostgreSQL/MQTT? Welcher Port, welches Volume?
3. **Industriestandard:** Welche Redis-Features (Pub/Sub, Streams, Lua-Scripts) sind für AutomationOne relevant?
4. **Robustheit:** Persistenz (RDB/AOF)? Sentinel/Cluster für HA? Oder zunächst Single-Instance?
5. **Integration:** Wo genau im Code? Rate Limiter, MQTT-Handler, Audit, andere?
6. **Test/Dev/Prod:** Gleicher Redis für alle? Oder in Tests deaktiviert (wie jetzt)?
7. **Alternativen:** Celery, RQ, Bull – oder reicht Redis direkt mit async? Welche Queue-Bibliothek?

---

## 4. Bereiche für Detail-Analyse

| Bereich | Dateien | Fokus |
|---------|---------|-------|
| Config | config.py | RedisSettings |
| Rate Limiter | deps.py | RedisRateLimiter, Fallback |
| Docker | docker-compose.yml | Redis-Service (falls neu) |
| MQTT | Mqtt_Protocoll.md, Handler | Duplikat-Detection |
| Auth | AUTHENTICATION_AUDIT | Rate Limiting Production |

### 4.1 Wo suchen / Was suchen

| Schicht | Wo suchen | Was suchen |
|---------|-----------|------------|
| **Config** | `config.py` | `RedisSettings`, `REDIS_ENABLED`, `REDIS_URL` |
| **Deps** | `src/api/deps.py` | `RedisRateLimiter`, `redis.asyncio`, Fallback wenn disabled |
| **Docker** | `docker-compose.yml` | Kein redis-Service – Vergleich mit postgres, mqtt-broker |
| **MQTT** | `Mqtt_Protocoll.md` | Duplikat-Detection, Message Queue |
| **Auth** | `AUTHENTICATION_AUDIT` | Rate Limiting Architektur |

### 4.2 Agent-Befehle für gezielte Analyse

| Analyse-Ziel | Agent | TM-Befehl (Kern) |
|--------------|-------|------------------|
| Redis-Integration im Code | server-dev | Wo wird RedisRateLimiter genutzt? Welche Stellen brauchen Redis? |
| Docker-Service hinzufügen | system-control + server-dev | Redis-Service in compose, Port 6379, depends_on |
| MQTT Duplikat-Detection | mqtt-dev | Wie soll Redis in sensor_handler/actuator_handler eingebunden werden? |

---

## 5. Empfohlene Agents & Skills

| Zweck | Agent | Skill |
|-------|-------|-------|
| Server-Integration | server-dev | server-development |
| Docker-Stack | system-control | system-control |
| MQTT-Layer | mqtt-dev | mqtt-development |
| Flow-Konsistenz | agent-manager | agent-manager |

---

## 6. Verknüpfung mit anderen Punkten

- **Punkt 2 (Docker):** Redis-Service im Stack.
- **Punkt 4 (Netzwerk):** Redis-Port, erreichbar von el-servador.

---

## 7. Randinformationen (Full-Stack-Kontext)

| Kontext | Info |
|---------|------|
| **Aktuell** | REDIS_ENABLED=false – In-Memory-Rate-Limiter aktiv |
| **Integration** | el-servador müsste REDIS_HOST (z.B. redis:6379) bei Docker-Netz auflösen |
| **Referenz** | DOCKER_REFERENCE.md Sektion 1.2 – Compose-Varianten (ci, e2e) müssten Redis erhalten |
