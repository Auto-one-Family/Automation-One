# Production Security Checklist

> **Status:** Documentation for future production deployment
> **Note:** This is NOT a fix - it documents required security measures for production

---

## Authentication & Secrets

### JWT Configuration

| Item | Development | Production Requirement |
|------|-------------|------------------------|
| `JWT_SECRET_KEY` | Hardcoded in code | **MUST** be set via `.env` or Docker Secret |
| Key Length | Any | Minimum 256-bit (32 characters) |
| Algorithm | HS256 | HS256 or RS256 for enhanced security |

**Implementation:**
```bash
# .env file (not committed to git)
JWT_SECRET_KEY=your-256-bit-secret-key-here

# Or via Docker Secret
docker secret create jwt_secret ./jwt_secret.txt
```

---

## MQTT Broker (Mosquitto)

| Item | Development | Production Requirement |
|------|-------------|------------------------|
| `allow_anonymous` | `true` | **MUST** be `false` |
| Authentication | None | Password file or ACL |
| TLS | Disabled | TLS 1.2+ on port 8883 |

**Configuration (`mosquitto.conf`):**
```conf
# Production settings
allow_anonymous false
password_file /mosquitto/config/passwd
acl_file /mosquitto/config/acl

# TLS
listener 8883
cafile /mosquitto/certs/ca.crt
certfile /mosquitto/certs/server.crt
keyfile /mosquitto/certs/server.key
```

---

## TLS/HTTPS

### Nginx Reverse Proxy

| Component | Requirement |
|-----------|-------------|
| SSL Certificate | Let's Encrypt (certbot) or commercial CA |
| Protocol | TLS 1.2+ only |
| HTTP | Redirect to HTTPS |
| HSTS | Enable with `Strict-Transport-Security` header |

**Nginx Configuration:**
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        proxy_pass http://automationone-server:8000;
    }
}
```

---

## PostgreSQL

| Item | Development | Production Requirement |
|------|-------------|------------------------|
| Password | Default/simple | **Strong unique password** via `.env` |
| Network | Exposed | Internal network only |
| Port Exposure | `5432:5432` | Remove host binding or firewall |
| SSL | Disabled | Consider enabling `ssl = on` |

**docker-compose.yml (Production):**
```yaml
postgres:
  # Remove port binding for production
  # ports:
  #   - "5432:5432"
  networks:
    - automationone-internal  # Internal only
  environment:
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  # From .env
```

---

## CORS (Cross-Origin Resource Sharing)

| Environment | Allowed Origins |
|-------------|-----------------|
| Development | `*` or `localhost:*` |
| Production | Specific domains only |

**FastAPI Configuration:**
```python
# Production
origins = [
    "https://your-domain.com",
    "https://www.your-domain.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # NOT "*" in production
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)
```

---

## Environment Variables Summary

| Variable | Source | Description |
|----------|--------|-------------|
| `JWT_SECRET_KEY` | `.env` / Docker Secret | JWT signing key |
| `POSTGRES_PASSWORD` | `.env` / Docker Secret | Database password |
| `MQTT_USERNAME` | `.env` | MQTT broker username |
| `MQTT_PASSWORD` | `.env` / Docker Secret | MQTT broker password |
| `ALLOWED_ORIGINS` | `.env` | CORS allowed origins |

---

## ESP32 Emergency Token (AUT-62)

### Build-Flag: `EMERGENCY_TOKEN_REQUIRED`

| Environment | Flag | Verhalten |
|-------------|------|-----------|
| `esp32_dev` | `0` | Fail-open: Emergency ohne Token wird akzeptiert |
| `esp32_prod` | `1` | Fail-closed: Emergency ohne Token wird ABGEWIESEN |
| `wokwi_*` | erbt von `esp32_dev` | Fail-open |

### NVS-Keys

| Key | Namespace | Beschreibung |
|-----|-----------|--------------|
| `emergency_auth` | `system_config` | ESP-spezifischer Emergency-Token (1-64 Zeichen) |
| `broadcast_em_tok` | `system_config` | Broadcast-Emergency-Token (1-64 Zeichen) |

### Token-Provisioning

Token werden per MQTT-Command gesetzt (System-Command-Topic):

```json
{"command": "set_emergency_token", "token_type": "esp", "token": "<TOKEN>"}
{"command": "set_emergency_token", "token_type": "broadcast", "token": "<TOKEN>"}
```

**Empfehlung:** Token = 32-Byte Hex-String (64 Zeichen). Generierung z.B.:
```bash
openssl rand -hex 32
```

### Token-Rotation

1. Neuen Token generieren
2. Per MQTT-Command `set_emergency_token` an ESP senden
3. Server-seitigen Token ebenfalls aktualisieren
4. Alten Token nach Bestätigung verwerfen

**TODO:** Automatische Token-Rotation per MQTT-Admin-Command (Follow-up Issue).

### Telemetrie

Counter `emergency_rejected_no_token_total` im Heartbeat zeigt die Anzahl
abgewiesener Emergency-Commands ohne Token (nur bei `EMERGENCY_TOKEN_REQUIRED=1`).

### Prod-Deployment Schritte

1. `pio run -e esp32_prod` zum Bauen des Prod-Firmware-Images
2. Token vor oder nach Flash per MQTT-Command setzen
3. Heartbeat prüfen: `emergency_rejected_no_token_total` muss `0` sein
4. Emergency-Test mit Token: muss akzeptiert werden
5. Emergency-Test ohne Token: muss mit `REJECTED`-Log abgewiesen werden

---

## Pre-Deployment Checklist

- [ ] JWT_SECRET_KEY set via environment (not hardcoded)
- [ ] PostgreSQL password is strong and unique
- [ ] MQTT `allow_anonymous` is `false`
- [ ] MQTT authentication configured (password/ACL)
- [ ] TLS certificates obtained and configured
- [ ] Nginx reverse proxy configured with HTTPS
- [ ] CORS restricted to known origins
- [ ] Database port not exposed to public network
- [ ] All secrets stored in `.env` (gitignored) or Docker Secrets
- [ ] `.env.example` provided (without actual secrets)
- [ ] ESP32 Emergency-Token provisioniert (NVS-Keys `emergency_auth` + `broadcast_em_tok`)
- [ ] Prod-Build mit `-DEMERGENCY_TOKEN_REQUIRED=1` (`pio run -e esp32_prod`)
- [ ] Emergency-Rejection ohne Token verifiziert (Serial-Log `[INC-EA5484] emergency rejected no_token`)

---

*This checklist will be implemented during the production deployment phase.*
