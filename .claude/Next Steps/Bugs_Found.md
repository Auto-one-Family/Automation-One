# Bugs Found - Wokwi CI Integration

> **Dokument-Zweck:** Dokumentation aller gefundenen Bugs beim Wokwi CI/CD Setup
> **Erstellt:** 2026-01-05
> **Status:** Aktiv

---

## Bug #1: Mosquitto Health-Check Timeout (KRITISCH)

### Zusammenfassung

Der Wokwi-Workflow schlägt beim Schritt "Start Mosquitto MQTT Broker" fehl, obwohl Mosquitto tatsächlich läuft und Verbindungen akzeptiert.

### Status

| Eigenschaft | Wert |
|-------------|------|
| **Workflow Run ID** | 20703443328 |
| **Fehler-Schritt** | `Start Mosquitto MQTT Broker` |
| **Exit Code** | 1 |
| **Ursache** | Fehlerhafter Health-Check |
| **Fix Status** | ANGEWENDET (2026-01-05) |

### Symptome

```
Mosquitto failed to start
```

**Aber in den Logs sieht man:**
```
1767580771: mosquitto version 2.0.22 running
1767580771: Opening ipv4 listen socket on port 1883.
1767580771: New connection from 127.0.0.1:45580 on port 1883.
1767580771: New client connected from 127.0.0.1:45580 as auto-DBE4B187-...
```

Mosquitto läuft und akzeptiert Verbindungen erfolgreich!

### Root Cause Analyse

**Datei:** [.github/workflows/wokwi-tests.yml](.github/workflows/wokwi-tests.yml)
**Zeilen:** 66-77

```yaml
# Wait for Mosquitto to be ready
echo "Waiting for Mosquitto to start..."
for i in {1..30}; do
  if docker exec mosquitto mosquitto_sub -t '#' -C 1 -W 1 2>/dev/null; then
    echo "Mosquitto is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Mosquitto failed to start"
    docker logs mosquitto
    exit 1
  fi
  sleep 1
done
```

**Problem:**
- `mosquitto_sub -t '#' -C 1 -W 1` wartet auf **eine eingehende Nachricht** (Parameter `-C 1`)
- Timeout ist 1 Sekunde (`-W 1`)
- Da niemand eine Nachricht sendet, timeout der Befehl immer
- Nach 30 Versuchen (30 Sekunden) gibt der Workflow auf

**Dies ist ein falsches Negativ** - der Broker funktioniert, aber der Test ist falsch konstruiert.

### Lösung

Der Health-Check muss prüfen ob Mosquitto **Verbindungen akzeptiert**, nicht ob **Nachrichten ankommen**.

**Option A: Selbst-Test mit Publish/Subscribe (empfohlen)**
```yaml
# Self-test: publish and subscribe to same topic
for i in {1..30}; do
  if docker exec mosquitto sh -c 'mosquitto_pub -t test/health -m "ok" && mosquitto_sub -t test/health -C 1 -W 1' 2>/dev/null | grep -q "ok"; then
    echo "Mosquitto is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Mosquitto failed to start"
    docker logs mosquitto
    exit 1
  fi
  sleep 1
done
```

**Option B: Port-Check mit netcat**
```yaml
for i in {1..30}; do
  if docker exec mosquitto sh -c 'nc -z localhost 1883' 2>/dev/null; then
    echo "Mosquitto is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Mosquitto failed to start"
    exit 1
  fi
  sleep 1
done
```

**Option C: Einfacher mosquitto_pub Test**
```yaml
for i in {1..30}; do
  if docker exec mosquitto mosquitto_pub -t 'health/check' -m 'ping' 2>/dev/null; then
    echo "Mosquitto is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Mosquitto failed to start"
    exit 1
  fi
  sleep 1
done
```

### Betroffene Dateien

| Datei | Beschreibung |
|-------|--------------|
| [.github/workflows/wokwi-tests.yml](.github/workflows/wokwi-tests.yml) | GitHub Actions Workflow |

### Log-Abruf

```bash
# Workflow-Status prüfen
gh run list --workflow=wokwi-tests.yml

# Fehlgeschlagene Logs abrufen
gh run view 20703443328 --log-failed

# Vollständige Logs
gh run view 20703443328 --log
```

### Priorität

**KRITISCH** - Blockiert gesamte Wokwi CI/CD Pipeline

---

## Workflow-Status Übersicht (2026-01-05)

| Workflow | Run ID | Status | Fehler |
|----------|--------|--------|--------|
| **Wokwi ESP32 Tests** | 20703443328 | FAILURE | Bug #1 (Mosquitto Health-Check) |
| **ESP32 Tests** | 20703443326 | SUCCESS | - |
| **Server Tests** | 20703443330 | IN_PROGRESS | - |

---

## Nächste Schritte

1. [ ] Bug #1 fixen: Mosquitto Health-Check korrigieren
2. [ ] Workflow erneut ausführen
3. [ ] Wokwi-Simulation validieren

---

**Letzte Aktualisierung:** 2026-01-05 02:45 UTC
