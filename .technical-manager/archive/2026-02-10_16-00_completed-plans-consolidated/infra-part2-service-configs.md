# Auftrag: Service-Konfigurationen Fixes
# ========================================
# Datum: 2026-02-09
# Auftraggeber: Technical Manager
# Ausführung: /do
# Referenz: .technical-manager/commands/pending/infrastructure-reference-architecture.md
#
# KONTEXT: Zwei Service-Konfigurationen haben echte Probleme die unabhängig von
# docker-compose.yml gefixt werden müssen. PostgreSQL-Log-Rotation ist DEFEKT
# (98MB Einzeldatei), Mosquitto-Logging erzeugt unnötige Redundanz.

---

## Ziel

Service-Konfigurationen für PostgreSQL und Mosquitto so anpassen, dass Logging
robust, rotiert und konsistent mit der Promtail/Loki-Pipeline funktioniert.
Kein unbegrenztes Wachstum, keine Doppel-Speicherung ohne Nutzen.

## Referenz-Dokument

Lies zuerst diese Abschnitte in `.technical-manager/commands/pending/infrastructure-reference-architecture.md`:
- **A4** (PostgreSQL IST – Log-Rotation DEFEKT, 98MB)
- **B4** (PostgreSQL Production-Tuning – SOLL-Referenz)
- **A3** (MQTT IST – Log-Config, 1MB aktuell)
- **B3** (MQTT Security – Mosquitto Log-Rotation Hinweis)
- **C3** (Log-Redundanz – ~240MB+ doppelt gespeichert)
- **C14** (Mosquitto Log-Wachstum – 55KB/h ohne Rotation)
- **E3** (PostgreSQL log_filename Fix – priorisiert)

---

## Datei 1: docker/postgres/postgresql.conf

### Problem

`log_filename = 'postgresql.log'` ist ein FIXER Name. PostgreSQL appendet immer in
dieselbe Datei statt neue zu erstellen. `log_rotation_age = 1d` und
`log_rotation_size = 50MB` greifen NICHT wenn der Dateiname keinen Timestamp enthält.
Ergebnis: eine 98MB Datei die endlos wächst.

### Änderungen

**1. log_filename mit Timestamp-Pattern:**
```
# VORHER:
log_filename = 'postgresql.log'

# NACHHER:
log_filename = 'postgresql-%Y-%m-%d.log'
```

**2. log_truncate_on_rotation aktivieren:**
```
# VORHER:
log_truncate_on_rotation = off

# NACHHER:
log_truncate_on_rotation = on
```
Damit wird beim Rotieren (neue Datei pro Tag) die alte Datei nicht weiter befüllt.
Mit dem Timestamp-Pattern erzeugt PostgreSQL täglich eine neue Datei.
`log_rotation_size = 50MB` sorgt dafür, dass auch innerhalb eines Tages rotiert wird.

**3. Bestehende Konfiguration beibehalten:**
```
log_rotation_age = 1d      # ← bleibt (täglich neue Datei)
log_rotation_size = 50MB   # ← bleibt (zusätzlich bei Größe)
```

**4. Kommentar aktualisieren:**
Der Kommentar-Block über ROTATION soll klar beschreiben was passiert:
```
# ========== ROTATION ==========
# Täglich neue Log-Datei (postgresql-YYYY-MM-DD.log)
# Zusätzliche Rotation bei 50MB innerhalb eines Tages
# Alte Dateien werden NICHT automatisch gelöscht – Cleanup via Docker-Volume oder Cron
log_rotation_age = 1d
log_rotation_size = 50MB
log_truncate_on_rotation = on
log_filename = 'postgresql-%Y-%m-%d.log'
```

### Kein Performance-Tuning jetzt

Die Referenz (B4) listet SOLL-Werte für shared_buffers, work_mem etc.
Das ist für Production relevant, NICHT für Development. Hier wird NUR das
Log-Rotation-Problem gelöst. Performance-Tuning ist ein separater Auftrag.

---

## Datei 2: docker/mosquitto/mosquitto.conf

### Problem

Mosquitto loggt aktuell in Datei UND stdout:
```
log_dest file /mosquitto/log/mosquitto.log
log_dest stdout
```

Das erzeugt:
1. Bind-Mount-Datei (`logs/mqtt/mosquitto.log`) – 1MB, wachsend ohne Rotation
2. Docker stdout → json-file Driver → Promtail → Loki
3. Doppelte Speicherung desselben Inhalts

Mosquitto hat KEINE eingebaute Log-Rotation. Die Datei wächst unbegrenzt (~1.3MB/Tag).

### Strategie: stdout-only

Die industrielle Empfehlung (Referenz B3): `log_dest stdout` only.
Docker json-file Driver rotiert (durch Part 1 jetzt konfiguriert: 10m × 3 Dateien).
Promtail fängt alles via Docker SD ab und schickt es an Loki.

Die Bind-Mount-Datei wird dadurch obsolet. Der Bind-Mount `./logs/mqtt:/mosquitto/log`
kann BEIBEHALTEN werden (für den Fall dass jemand temporär `log_dest file` wieder aktiviert),
aber die aktive Nutzung wird auf stdout umgestellt.

### Änderungen

**1. Log-Destination auf stdout-only:**
```
# VORHER:
log_dest file /mosquitto/log/mosquitto.log
log_dest stdout

# NACHHER:
log_dest stdout
# log_dest file /mosquitto/log/mosquitto.log   # Auskommentiert: Docker/Promtail/Loki ist primär
```

**2. Log-Level beibehalten:**
```
log_type error
log_type warning
log_type notice
log_type information
log_type subscribe
log_type unsubscribe
```
Alles bleibt. Für Development wollen wir alles sehen. Subscribe/Unsubscribe-Events
sind für ESP32-Debugging essentiell.

**3. Kommentar-Block aktualisieren:**
```
# ============================================
# Logging
# ============================================
# Primärer Log-Weg: stdout → Docker json-file → Promtail → Loki
# Docker json-file rotiert automatisch (max-size: 10m, max-file: 3)
# Für temporäres File-Logging: log_dest file /mosquitto/log/mosquitto.log aktivieren
log_dest stdout
```

**4. Nicht ändern:**
- Listener-Konfiguration (1883 + 9001) → bleibt
- Authentication (allow_anonymous true) → bleibt für Development
- Persistence-Settings → bleiben
- Connection-Settings → bleiben
- Alle Production-Kommentare zu Auth/ACL/TLS → bleiben als Roadmap

---

## Qualitätskriterien

- PostgreSQL: Nach Container-Restart (`docker compose restart postgres`) muss eine
  neue Datei `postgresql-YYYY-MM-DD.log` im Log-Verzeichnis erscheinen
- Mosquitto: Nach Container-Restart (`docker compose restart mqtt-broker`) darf KEINE
  neue Datei in `logs/mqtt/` erscheinen. Logs nur noch in `docker logs automationone-mqtt`
- Beide Config-Dateien müssen saubere, menschenverständliche Kommentare haben
- Kein Service darf nach dem Restart crashen

## Verifikation

```bash
# PostgreSQL Log-Rotation
docker compose restart postgres
sleep 5
docker exec automationone-postgres ls -la /var/log/postgresql/
# Erwartung: postgresql-2026-02-09.log (oder aktuelles Datum), NICHT postgresql.log

# Mosquitto stdout-only
docker compose restart mqtt-broker
docker logs --tail 5 automationone-mqtt
# Erwartung: Log-Output sichtbar
ls -la logs/mqtt/
# Erwartung: Keine NEUE mosquitto.log (alte kann noch existieren)
```

## Hinweis: Alte Log-Dateien

Die existierende 98MB `postgresql.log` und die 1MB `mosquitto.log` in den Bind-Mounts
werden durch diese Änderung NICHT automatisch gelöscht. Das ist bewusst – Robin kann
sie manuell löschen wenn der Fix verifiziert ist. Der Agent soll sie NICHT löschen.

## Report

Erstelle nach Abschluss einen Report mit:
- Jede Änderung dokumentiert (vorher/nachher)
- Beide Config-Dateien: Vollständiger neuer Inhalt
- Offene Punkte
- Report nach: `.technical-manager/inbox/agent-reports/infra-part2-service-configs.md`
