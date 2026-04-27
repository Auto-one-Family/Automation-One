# E7 — Auth, Security und ACL

**Etappe:** E7  
**Sprint:** AUT-175 Architektur-Wissensausbau  
**Datum:** 2026-04-26  
**Analysierte Quelldateien:**
- `El Servador/god_kaiser_server/src/api/v1/auth.py`
- `El Servador/god_kaiser_server/src/api/v1/debug.py`
- `El Servador/god_kaiser_server/src/api/deps.py`
- `El Servador/god_kaiser_server/src/core/security.py`
- `El Servador/god_kaiser_server/src/core/config.py`
- `El Servador/god_kaiser_server/src/db/models/auth.py`
- `El Servador/god_kaiser_server/src/db/models/user.py`
- `El Servador/god_kaiser_server/src/db/repositories/token_blacklist_repo.py`
- `El Servador/god_kaiser_server/src/services/mqtt_auth_service.py`
- `El Servador/god_kaiser_server/src/main.py` (Startup + CORS)

---

## 1. Überblick Auth-Mechanismus

Der God-Kaiser Server verwendet **JWT-basierte Authentifizierung** mit zwei Token-Typen (Access und Refresh). Der Mechanismus besteht aus drei Schichten:

1. **Token-Ausstellung** — `core/security.py` (Erstellung und Verifizierung via python-jose)
2. **Request-Validierung** — `api/deps.py` (FastAPI Dependency Injection, Blacklist-Prüfung, Token-Versioning)
3. **Rollenbasierte Zugriffskontrolle** — Drei Rollen: `viewer`, `operator`, `admin`

Das System ist **Server-Startup-geschützt**: Bei erkanntem Default-JWT-Secret in einer Produktionsumgebung verweigert der Server den Start (`SystemExit`).

---

## 2. JWT-Token-Struktur

### 2.1 Access Token

**Ablaufzeit (Default):** 30 Minuten (konfigurierbar via `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`)  
**Sonderfall `remember_me`:** 7 Tage (gesetzt beim Login-Request wenn `remember_me=true`)

**Kodierung:** HS256 (symmetrisch, konfigurierbar via `JWT_ALGORITHM`)

**Library:** `python-jose`

**Quelle:** `core/security.py`, Funktion `create_access_token()`

### 2.2 Refresh Token

**Ablaufzeit (Default):** 7 Tage (konfigurierbar via `JWT_REFRESH_TOKEN_EXPIRE_DAYS`)

**Zusatz gegenüber Access Token:** Der Refresh Token enthält einen `jti`-Claim (JWT ID, UUID4) um Eindeutigkeit für Token-Rotation sicherzustellen.

**Quelle:** `core/security.py`, Funktion `create_refresh_token()`

### 2.3 Claims-Schema

**Access Token Claims:**

| Claim | Typ | Inhalt |
|-------|-----|--------|
| `sub` | string | User-ID (als String kodiert, z.B. `"42"`) |
| `exp` | int (Unix-Timestamp) | Ablaufzeitpunkt |
| `iat` | int (Unix-Timestamp) | Ausstellungszeitpunkt |
| `type` | string | `"access"` |
| `role` | string | Benutzerrolle: `"admin"`, `"operator"` oder `"viewer"` |
| `token_version` | int | Aktuelle Token-Version des Users (fuer Logout-All) |

**Refresh Token Claims:**

| Claim | Typ | Inhalt |
|-------|-----|--------|
| `sub` | string | User-ID (als String) |
| `exp` | int (Unix-Timestamp) | Ablaufzeitpunkt |
| `iat` | int (Unix-Timestamp) | Ausstellungszeitpunkt |
| `jti` | string | UUID4, einmalig pro Token (Token-Rotation) |
| `type` | string | `"refresh"` |

**API Keys (Spezialfall):** API Keys sind Access Tokens mit zwei zusätzlichen Claims: `name` (Bezeichnung) und `api_key: true`. Ablaufzeit: 365 Tage. Funktion: `create_api_key()` in `core/security.py`.

---

## 3. Token-Blacklist (Logout-Mechanismus)

### Tabelle `token_blacklist`

**Modell:** `db/models/auth.py`, Klasse `TokenBlacklist`

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | Integer (PK, autoincrement) | Primärschlüssel |
| `token_hash` | String(64), UNIQUE, INDEX | SHA256-Hash des rohen JWT |
| `token_type` | String(20) | `"access"` oder `"refresh"` |
| `user_id` | Integer, INDEX | User-ID (kein FK, um Cascade-Probleme zu vermeiden) |
| `expires_at` | DateTime(timezone=True), INDEX | Natürliches Ablaufdatum des Tokens |
| `blacklisted_at` | DateTime(timezone=True) | Zeitpunkt der Sperrung |
| `reason` | String(50), nullable | Grund: `"logout"`, `"token_rotation"`, `"security"`, `"password_change"` etc. |

**Composite Index:** `idx_blacklist_expires_at_user` auf `(expires_at, user_id)` — beschleunigt Cleanup-Abfragen.

### Wie funktioniert der Blacklist-Check

Tokens werden **nicht im Klartext** gespeichert. Der rohe JWT wird via `hashlib.sha256` gehasht (64-stelliger Hex-String) und dieser Hash wird in der Datenbank abgelegt.

**Prüfung in `get_current_user()` (deps.py):**
1. Token aus `Authorization: Bearer <token>` Header extrahieren
2. JWT-Signatur und Ablaufzeit via `verify_token()` prüfen
3. **Blacklist-Check:** `TokenBlacklistRepository.is_blacklisted(token)` — SHA256-Hash des Tokens mit DB-Einträgen vergleichen
4. Token-Versioning prüfen (siehe Abschnitt 6)

**Prüfung beim Refresh (auth.py):**
- Blacklist-Check findet **vor** der JWT-Verifikation statt (`BEFORE verification`)

### Logout-Strategien

**Einzelner Logout (`all_devices=false`):**
- Aktueller Access Token wird gehasht und in `token_blacklist` eingetragen mit `reason="logout"`
- Refresh Token wird **nicht** explizit durch `/logout` invalidiert — dieser läuft nach 7 Tagen ab oder wird bei nächster Rotation verworfen

**Logout aller Geräte (`all_devices=true`, Token-Versioning):**
- `user_accounts.token_version` wird um 1 inkrementiert
- Alle bestehenden Tokens, deren `token_version`-Claim kleiner als der neue Wert ist, werden beim nächsten Request abgelehnt
- Kein explizites Blacklisting aller Tokens nötig — effizient auch bei vielen Sessions

**Token-Rotation beim Refresh:**
- Alter Refresh Token wird in `token_blacklist` eingetragen mit `reason="token_rotation"` BEVOR neue Tokens ausgestellt werden
- Race-Condition abgefangen: Fehler beim Blacklisting führt zu Rollback und Fortsetzung (Best-Effort)

### Cleanup abgelaufener Einträge

`TokenBlacklistRepository.cleanup_expired()` löscht alle Einträge mit `expires_at < now`. Dieser Zeitpunkt entspricht dem natürlichen Ablaufzeitpunkt des Tokens, d.h. nach Ablauf ist der Eintrag redundant (Token wäre ohnehin ungültig).

> [!ANNAHME] Cleanup-Scheduling
>
> **Basis:** Im Maintenance-Service (`maintenance/service.py`) sind Cleanup-Jobs für Sensor-Daten, Command-History und Heartbeat-Logs registriert. Ein expliziter Cleanup-Job für `token_blacklist` wurde im analysierten Code nicht gefunden.
> **Zu verifizieren:** Ob `maintenance/service.py` einen `cleanup_token_blacklist`-Job registriert oder ob dies ein fehlendes Maintenance-Feature ist. Suche nach `cleanup_expired` oder `token_blacklist` in `maintenance/service.py`.

---

## 4. Auth-Flow (Sequenz-Diagramm)

### Login-Flow

```
Client                    FastAPI                 PostgreSQL
  |                          |                        |
  |-- POST /v1/auth/login -->|                        |
  |   {username, password}   |                        |
  |                          |-- authenticate() ----->|
  |                          |   (username lookup)    |
  |                          |<-- User-Record --------|
  |                          |                        |
  |                          |-- verify_password()    |
  |                          |   (bcrypt.checkpw)     |
  |                          |                        |
  |                          |-- create_access_token()|
  |                          |   create_refresh_token()|
  |                          |                        |
  |<-- LoginResponse --------|                        |
  |   {access_token,         |                        |
  |    refresh_token,        |                        |
  |    token_type: "bearer"} |                        |
```

### Request-Validierung (get_current_user)

```
Client                    FastAPI                 PostgreSQL
  |                          |                        |
  |-- GET /v1/sensors/ ----->|                        |
  |   Authorization: Bearer  |                        |
  |   <access_token>         |                        |
  |                          |-- verify_token() ------|
  |                          |   (JOSE decode+verify) |
  |                          |                        |
  |                          |-- is_blacklisted()---->|
  |                          |   (SHA256 hash lookup) |
  |                          |<-- bool ---------------|
  |                          |                        |
  |                          |-- get_by_id(user_id)->|
  |                          |<-- User-Record --------|
  |                          |                        |
  |                          |-- token_version check  |
  |                          |   (payload vs. user)   |
  |                          |                        |
  |<-- Response (200) -------|                        |
```

### Refresh-Flow (Token-Rotation)

```
Client                    FastAPI                 PostgreSQL
  |                          |                        |
  |-- POST /v1/auth/refresh ->|                       |
  |   {refresh_token}         |                       |
  |                          |                        |
  |                          |-- is_blacklisted() --->|
  |                          |   (BEFORE verify!)     |
  |                          |<-- false --------------|
  |                          |                        |
  |                          |-- verify_token()       |
  |                          |   (type="refresh")     |
  |                          |                        |
  |                          |-- get_by_id(user_id)->|
  |                          |<-- User-Record --------|
  |                          |                        |
  |                          |-- add_token() -------->|
  |                          |   (old refresh token,  |
  |                          |    reason="token_rotation")
  |                          |-- commit() ----------->|
  |                          |                        |
  |                          |-- create_access_token()|
  |                          |-- create_refresh_token()|
  |                          |                        |
  |<-- RefreshTokenResponse --|                       |
  |   {new_access_token,      |                       |
  |    new_refresh_token}     |                       |
```

---

## 5. Rollen und ACL

### 5.1 Rollen-Definitionen

Das Rollensystem ist im `User`-Modell (`db/models/user.py`, Tabelle `user_accounts`) als String-Spalte implementiert. Es gibt keine Enum-Tabelle in der Datenbank — Rollen sind String-Werte.

| Rolle | String-Wert | Beschreibung |
|-------|-------------|--------------|
| Viewer | `"viewer"` | Lesezugriff auf Betriebsdaten (Default bei Neuregistrierung) |
| Operator | `"operator"` | Lese- und Schreibzugriff auf Sensoren, Aktoren, Logik, Zonen |
| Admin | `"admin"` | Vollzugriff inkl. User-Management, Debug-Endpoints, Audit-Retention |

Hilfsmethoden am `User`-Objekt: `user.is_admin` und `user.is_operator` (Python Properties).

**Erstanmeldung (Setup):** Der erste Admin-User wird über `POST /v1/auth/setup` ohne Authentifizierung erstellt — dieser Endpoint ist nur verfügbar wenn noch kein User in der Datenbank existiert.

### 5.2 Endpunkte nach Rollen-Anforderung

| Auth-Anforderung | Dependency | Endpunkte (Auswahl) |
|------------------|------------|---------------------|
| **Public** (kein Token) | — | `GET /v1/auth/status`, `POST /v1/auth/login`, `POST /v1/auth/setup`, `GET /v1/logs`, `POST /v1/webhooks/grafana` |
| **ActiveUser** (jeder eingeloggte User) | `ActiveUser` | `GET /v1/auth/me`, `POST /v1/auth/logout`, `GET /v1/auth/mqtt/status`, `GET /v1/sensors/`, `GET /v1/actuators/`, `GET /v1/esp/`, `GET /v1/errors/`, `GET /v1/notifications/`, `GET /v1/diagnostics/status` |
| **OperatorUser** (operator oder admin) | `OperatorUser` | POST/PUT/DELETE auf `/v1/sensors/`, `/v1/actuators/`, `/v1/logic/`, `/v1/zone/`, `/v1/sequences/`, `/v1/plugins/` |
| **AdminUser** (nur admin) | `AdminUser` | `GET/POST/DELETE /v1/users/*`, alle `/v1/debug/*` (59 Endpoints), `DELETE /v1/audit/retention/*`, `POST /v1/auth/register`, `POST /v1/auth/mqtt/configure` |

---

## 6. FastAPI Auth-Dependencies

Alle Auth-Dependencies befinden sich in `api/deps.py`. Sie werden als **Annotated Type Aliases** bereitgestellt.

### Dependency-Kette

```
get_current_user()          — JWT decode + Blacklist-Check + Token-Versioning
    |
    v
get_current_active_user()   — prüft user.is_active == True
    |
    +-- require_operator()  — prüft role in ("admin", "operator")
    |
    +-- require_admin()     — prüft role == "admin"
```

### Type Aliases (verwendete Annotated-Typen)

| Alias | Typ-Annotation | Verwendung in Endpoints |
|-------|---------------|------------------------|
| `CurrentUser` | `Annotated[User, Depends(get_current_user)]` | Interne Basis |
| `ActiveUser` | `Annotated[User, Depends(get_current_active_user)]` | Standard-Auth |
| `OperatorUser` | `Annotated[User, Depends(require_operator)]` | Operator-Operationen |
| `AdminUser` | `Annotated[User, Depends(require_admin)]` | Admin-Only-Endpoints |
| `OptionalUser` | `Annotated[Optional[User], Depends(get_optional_user)]` | Public+Auth-Endpoints |
| `DBSession` | `Annotated[AsyncSession, Depends(get_db)]` | DB-Injektion |

**OAuth2-Schema:** `OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)` — `auto_error=False` erlaubt es, den Token als Optional zu behandeln (für Swagger UI und optionale Auth).

**Token-Versioning-Logik in `get_current_user()`:**
- Token-Claim `token_version` wird gegen `user.token_version` in der DB geprüft
- Wenn `token_version` im Token < `user.token_version`: HTTP 401 ("Token has been invalidated (logout all devices)")
- Wenn Token keinen `token_version`-Claim hat (Alttoken): Warnung wird geloggt, Token wird akzeptiert (Backwards-Compatibility)

### Debug-Mode Bypass (nur non-production!)

Bei `DEBUG_MODE=true` und `DEBUG_AUTH_BYPASS_ENABLED=true` und fehlendem Token: `get_current_user()` gibt den User mit Username `"admin"` zurück. In Production-Umgebungen (`ENVIRONMENT=production`) wird dieser Bypass **explizit blockiert** mit einem `CRITICAL`-Log-Eintrag und einem HTTP 401.

---

## 7. Password-Hashing

**Library:** `bcrypt` (Python-Paket `bcrypt`)  
**Konfiguration:** `PASSWORD_HASH_ALGORITHM=bcrypt`, `PASSWORD_MIN_LENGTH=8` (min. 6)

**Funktionen in `core/security.py`:**

| Funktion | Zweck |
|----------|-------|
| `hash_password(password: str) -> str` | bcrypt.gensalt() + bcrypt.hashpw(), gibt dekodierten String zurück |
| `get_password_hash` | Alias für `hash_password` (Backwards-Compatibility) |
| `verify_password(plain, hashed) -> bool` | bcrypt.checkpw() |

**Salt:** Wird von `bcrypt.gensalt()` automatisch generiert und im Hash-String kodiert. Kein separates Salt-Management nötig.

**Passwort-Stärke-Validierung** (`validate_password_strength()`):
- Mindestlänge: 8 Zeichen (konfigurierbar)
- Mindestens 1 Grossbuchstabe
- Mindestens 1 Kleinbuchstabe
- Mindestens 1 Ziffer
- Mindestens 1 Sonderzeichen aus `!@#$%^&*()_+-=[]{}|;:,.<>?`

Die Validierung wird bei `create_user()` im `UserRepository` aufgerufen.

> [!ANNAHME] Passwort-Stärke-Erzwingung
>
> **Basis:** `validate_password_strength()` ist in `core/security.py` definiert. Die Einbindung in `UserRepository.create_user()` wurde nicht direkt verifiziert (UserRepository-Quellcode nicht gelesen).
> **Zu verifizieren:** Ob `user_repo.create_user()` tatsächlich `validate_password_strength()` aufruft oder ob dies nur bei bestimmten Endpoints passiert.

---

## 8. Debug-Endpoints (Admin-Only)

Der Debug-Router (`api/v1/debug.py`) umfasst **59 Endpoints** unter dem Prefix `/v1/debug/`. Jeder einzelne Endpoint verwendet `AdminUser` als Dependency — kein Endpoint im Debug-Router ist ohne Admin-Authentifizierung zugänglich.

**Warum Admin-Guard für Debug-Endpoints?**

Die Debug-Endpoints bieten direkte operative Kontrolle über das gesamte System:

1. **Mock-ESP-Management:** Erstellen, Konfigurieren und Steuern virtueller ESP32-Geräte (inkl. Sensor-Werte setzen, Heartbeats auslösen, State-Transitions)
2. **Database Explorer:** Direkter Lesezugriff auf alle Datenbanktabellen (`ALLOWED_TABLES`) mit Masking sensibler Felder (`MASKED_FIELDS`, z.B. `password_hash`)
3. **Log-Zugriff:** Lesen und Filtern von Server-Logdateien
4. **Aktor-Direktsteuerung:** Senden von Aktor-Befehlen an Mock-Geräte ohne Safety-Service-Prüfung
5. **Audit-Retention:** Verwaltung der Log-Aufbewahrungsfristen

Ein Zugriff durch nicht-Admin-User würde es ermöglichen, Produktionsdaten zu manipulieren, Sicherheitsmechanismen zu umgehen und das gesamte System in einen inkonsistenten Zustand zu bringen.

**I12-Klarstellung:** Der Vorwurf "Debug-Endpoints sind nicht hinter Auth" ist widerlegt. Jeder Debug-Endpoint verlangt `AdminUser`. Die Endpoints sind ausschliesslich für autorisierte Administratoren zugänglich.

**Sensitive-Data-Masking im Database Explorer:**

```python
MASKED_FIELDS = {"password_hash", "token_hash", ...}  # aus schemas/debug_db.py
```

Felder in `MASKED_FIELDS` werden im Database Explorer nicht im Klartext zurückgegeben.

---

## 9. CORS/CSRF-Konfiguration

### CORS

**Middleware:** FastAPI `CORSMiddleware` (starlette)  
**Konfiguration in `core/config.py`** (`CORSSettings`):

| Parameter | Default | Env-Variable |
|-----------|---------|--------------|
| `allowed_origins` | `["http://localhost:3000", "http://localhost:5173"]` | `CORS_ALLOWED_ORIGINS` |
| `allow_credentials` | `True` | `CORS_ALLOW_CREDENTIALS` |
| `allow_methods` | `["GET", "POST", "PUT", "DELETE", "PATCH"]` | `CORS_ALLOW_METHODS` |
| `allow_headers` | `["*"]` | `CORS_ALLOW_HEADERS` |

**Registrierung in `main.py`** (nach `RequestIdMiddleware`):

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # aus CORSSettings
    allow_credentials=True,
    allow_methods=["*"],      # Override: alle Methoden erlaubt
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)
```

> [!INKONSISTENZ] CORS-Methoden: CORSSettings vs. main.py
>
> **Beobachtung:** `CORSSettings.allow_methods` definiert `["GET", "POST", "PUT", "DELETE", "PATCH"]` als konfigurierbare Einschränkung (via `CORS_ALLOW_METHODS`). In `main.py` wird jedoch `allow_methods=["*"]` (alle Methoden) hartcodiert und die `CORSSettings.allow_methods` wird ignoriert.
> **Korrekte Stelle:** `El Servador/god_kaiser_server/src/main.py`, Zeile ~1185; `El Servador/god_kaiser_server/src/core/config.py`, Zeile ~127
> **Empfehlung:** Entweder `settings.cors.allow_methods` in `main.py` verwenden um die Konfiguration zu respektieren, oder `CORSSettings.allow_methods` entfernen da es keinen Effekt hat.
> **Erst-Erkennung:** E7, 2026-04-26

### Middleware-Reihenfolge

1. `RequestIdMiddleware` — fügt `X-Request-ID` Header hinzu
2. `CORSMiddleware` — CORS-Headers
3. Prometheus Instrumentator — HTTP-Metriken

### CSRF

> [!ANNAHME] Kein expliziter CSRF-Schutz
>
> **Basis:** Im analysierten Code wurde kein CSRF-Token-Mechanismus gefunden. Da das Frontend per JWT im Authorization-Header authentifiziert (nicht via Cookies), ist klassisches CSRF per Cookie-Hijacking nicht anwendbar. JWT im Header ist per Definition CSRF-resistent.
> **Zu verifizieren:** Ob Tokens je in Cookies gesetzt werden (z.B. in Frontend-Code), was CSRF-Risiko einführen würde. Suche nach `Set-Cookie` oder `httpOnly` in Frontend-Code und Server-Responses.

---

## 10. MQTT-Geräte-Authentifizierung

### Authentifizierungskonzept

ESP32-Geräte authentifizieren sich am MQTT-Broker (Mosquitto) mit **Benutzername/Passwort**, nicht mit JWT. Die Konfiguration ist optional und wird über den Server verwaltet.

**Zuständiger Service:** `services/mqtt_auth_service.py`

### Konfigurationsablauf

1. Admin ruft `POST /v1/auth/mqtt/configure` auf (AdminUser-geschützt)
2. `MQTTAuthService.configure_credentials()` wird ausgeführt:
   - Passwort wird im **Mosquitto SHA-512-Format** gehasht: `$6$<16-Byte-Salt-Hex>$<SHA512(password+salt)>`
   - Passwort-Datei wird aktualisiert (`settings.mqtt.passwd_file_path`, Berechtigungen: `0o600`)
   - Mosquitto wird neu geladen: zuerst via `mosquitto_ctrl reload`, bei Fehler via `SIGHUP`-Signal
   - Konfiguration wird in DB persistiert (`system_config`-Tabelle)
3. Optional: Broadcast der neuen Credentials an alle ESPs via MQTT-Topic (nur wenn TLS aktiv)

### Mosquitto-Passwort-Format

Das verwendete Format weicht vom Standard-`mosquitto_passwd`-Tool ab:

```
username:$6$<salt_hex>$<sha512_hex>
```

Mosquitto erwartet eigentlich PBKDF2 (bei neueren Versionen) oder SHA-512-crypt (spezifisches Format). Das hier verwendete Format ist eine manuelle Implementierung in Python.

> [!ANNAHME] Mosquitto-Passwort-Format-Kompatibilität
>
> **Basis:** `MQTTAuthService.hash_mosquitto_password()` verwendet `hashlib.sha512(password + salt)` und schreibt `$6$salt$hash`. Das `$6$`-Präfix ist in Linux/crypt das SHA-512-crypt-Format — dieses verwendet jedoch PBKDF2-ähnliche Iterationslogik (5000 Runden), nicht einfaches SHA512.
> **Zu verifizieren:** Ob die von diesem Service erzeugten Passwort-Hashes tatsächlich von Mosquitto akzeptiert werden, oder ob Mosquitto sein eigenes Format (`mosquitto_passwd`) erwartet. Mögliche Inkompatibilität wenn Mosquitto >= 2.0 mit aktivierter Password-File-Auth verwendet wird.
> **Erst-Erkennung:** E7, 2026-04-26

### API-Key-Authentifizierung (HTTP-Endpoints)

Für HTTP-Requests von ESP32-Geräten (nicht MQTT) existiert eine API-Key-basierte Authentifizierung (`verify_api_key()` in `deps.py`):

- Header: `X-API-Key: <key>`
- Akzeptierte Schlüssel: Konfigurierbarer `settings.security.api_key`, Keys mit Prefix `esp_`, Keys mit Prefix `god_`
- Im Debug-Modus (non-production): Bypass aktiv, gibt `"debug-mode"` zurück

> [!ANNAHME] API-Key-Endpoint-Verwendung
>
> **Basis:** `verify_api_key()` und der Type Alias `APIKey` sind in `deps.py` definiert. Welche Endpoints tatsächlich `APIKey` als Dependency verwenden, wurde nicht vollständig geprüft.
> **Zu verifizieren:** Grep nach `APIKey` in `api/v1/*.py` um zu ermitteln, welche Endpoints ESP32-API-Keys erfordern.

### TLS-Schutz

- `settings.mqtt.use_tls` steuert ob MQTT-TLS aktiv ist
- Credential-Broadcast an ESPs findet **nur** bei aktiviertem TLS statt (`RuntimeError: "TLS not enabled"` wird andernfalls als Warning geloggt)
- Server-Startup: Warnung wenn `MQTT_USE_TLS=false` ("credentials will be sent in plain text")

---

## 11. Bekannte Inkonsistenzen (inline)

Die Inkonsistenzen und Annahmen wurden direkt in den jeweiligen Abschnitten als Callout-Blöcke dokumentiert:

| ID | Abschnitt | Typ | Beschreibung |
|----|-----------|-----|--------------|
| E7-I1 | Abschnitt 3 | ANNAHME | Cleanup-Job fuer `token_blacklist` nicht verifiziert |
| E7-I2 | Abschnitt 7 | ANNAHME | Passwort-Stärke-Erzwingung in `create_user()` nicht verifiziert |
| E7-I3 | Abschnitt 9 | INKONSISTENZ | CORS-Methoden: `CORSSettings.allow_methods` wird in `main.py` ignoriert |
| E7-I4 | Abschnitt 9 | ANNAHME | Kein CSRF-Schutz — vermutlich nicht nötig (JWT im Header), aber ungeprüft |
| E7-I5 | Abschnitt 10 | ANNAHME | Mosquitto-Passwort-Format-Kompatibilität ungeklärt |
| E7-I6 | Abschnitt 10 | ANNAHME | API-Key-Endpoint-Verwendung nicht vollständig geprüft |

---

*E7 abgeschlossen — 2026-04-26*
