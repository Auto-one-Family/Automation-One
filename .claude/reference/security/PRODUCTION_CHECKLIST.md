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

---

*This checklist will be implemented during the production deployment phase.*
