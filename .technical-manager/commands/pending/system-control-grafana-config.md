# Auftrag 2: Grafana Dashboard-Config optimieren

**Datum:** 2026-02-09
**Agent:** @system-control
**Priorität:** KRITISCH
**Geschätzter Aufwand:** 20-30 Minuten
**Typ:** Config-Änderung (YAML + JSON)

---

## WORUM GEHT ES

Das Grafana Dashboard ist funktional, aber hat **zwei kritische Config-Lücken**:

1. **Kein Auto-Refresh:** Dashboard aktualisiert sich nicht automatisch → User sehen veraltete Daten
2. **Dashboard löschbar:** `disableDeletion: false` → Dashboard kann versehentlich gelöscht werden

**Warum ist das kritisch:**
- Monitoring-Dashboard muss Live-Daten zeigen (aktuell: statisch)
- Provisionierte Dashboards sollten geschützt sein (Infrastructure-as-Code)
- User könnten Dashboard löschen und verlieren kritische Monitoring-Capability

**Zusätzlich:** Default Admin-Passwort `admin` ist unsicher (wenn nicht in `.env` gesetzt).

---

## WAS MUSS ANALYSIERT WERDEN

### Phase A: Vollständige IST-Analyse (10 Min)

**1. Dashboard-Provider-Config verstehen**

Datei: `docker/grafana/provisioning/dashboards/dashboards.yml`

**Lesen und dokumentieren:**
```yaml
apiVersion: 1
providers:
  - name: 'AutomationOne'
    orgId: 1
    folder: 'AutomationOne'
    type: file
    disableDeletion: false  # ← PROBLEM
    editable: true
    options:
      path: /etc/grafana/provisioning/dashboards
```

**Analyse-Fragen:**
- Was bedeutet `disableDeletion: false`?
  - Dashboard kann über Grafana UI gelöscht werden
  - Bei Container-Neustart: Dashboard wird wieder provisioniert (aus JSON)
  - Risiko: User löscht versehentlich, denkt es ist weg
- Was bedeutet `editable: true`?
  - Dashboard kann über UI editiert werden
  - Änderungen gehen bei Container-Restart verloren (JSON ist Source-of-Truth)
  - Für Dev OK (schnelles Prototyping), für Prod problematisch

**2. Dashboard-JSON Auto-Refresh prüfen**

Datei: `docker/grafana/provisioning/dashboards/system-health.json`

**[KORREKTUR verify-plan]: JSON hat KEINEN `"dashboard": {...}` Wrapper! Alle Properties sind auf Root-Level:**
```json
{
  "title": "AutomationOne - System Health",
  "uid": "automationone-system-health",
  "refresh": ???,  // ← Prüfen ob vorhanden (Root-Level, NICHT in dashboard-Objekt)
  "time": {
    "from": "now-1h",
    "to": "now"
  },
  "panels": [...]
}
```

**Dokumentieren:**
- Ist `refresh` definiert? → **NEIN**, nicht vorhanden
- Dashboard aktualisiert nur manuell (Browser-Reload)

**3. Admin-Passwort Security prüfen**

**Dateien prüfen:**

`.env.example`:
```bash
GRAFANA_ADMIN_PASSWORD=changeme  # ← Default-Wert (UNSICHER)
```

`docker-compose.yml` (Grafana Service):
```yaml
environment:
  GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:-admin}  # ← Fallback zu "admin"
```

**Dokumentieren:**
- Ist `.env` in `.gitignore`? (MUSS: Ja)
- Ist `GRAFANA_ADMIN_PASSWORD` in `.env` gesetzt?
- Welcher Wert steht in `.env.example`? (Template für neue Instanzen)

**Security-Analyse:**
- Default-Passwort `admin` ist trivial
- Wenn User `.env.example` kopiert und nicht anpasst: Unsicher
- Lösung: Warnung in `.env.example` oder zufälliges Passwort generieren

---

## WIE SOLL GEARBEITET WERDEN

### Phase B: Lösungsplan erstellen (5 Min)

**1. disableDeletion aktivieren**

**VORHER:**
```yaml
disableDeletion: false  # Dashboard kann gelöscht werden
```

**NACHHER:**
```yaml
disableDeletion: true   # Dashboard geschützt
```

**Effekt:**
- Dashboard hat "Delete" Button nicht mehr in Grafana UI
- Dashboard-Settings können nicht gespeichert werden (schreibgeschützt)
- Änderungen nur via JSON-Datei + Container-Restart

**Begründung:**
- Dashboard ist Infrastructure (versioniert in Git)
- UI-Edits gehen bei Restart verloren → verwirrend
- Schützt vor versehentlichem Löschen

**Trade-off:**
- `editable: true` + `disableDeletion: true` = Paradox?
  - User kann editieren, aber nicht speichern
  - Für schnelles UI-Prototyping OK (Änderungen temporär)
  - Finale Änderungen müssen in JSON übertragen werden

**TM-Empfehlung:** `disableDeletion: true` setzen, `editable: true` beibehalten für Dev-Environment.

**2. Auto-Refresh konfigurieren**

**Dashboard-JSON erweitern:**
**[KORREKTUR verify-plan]: `refresh` auf ROOT-Level einfügen, KEIN `dashboard`-Wrapper!**
```json
{
  "refresh": "10s",  // ← NEU: Alle 10 Sekunden aktualisieren (Root-Level)
  "title": "AutomationOne - System Health",
  ...
}
```

**Wert-Optionen:**
- `"5s"` - Sehr häufig (High-Load bei vielen Usern)
- `"10s"` - **Empfohlen** für Monitoring-Dashboards
- `"30s"` - Moderate Updates
- `"1m"` - Niedrige Frequenz
- `false` oder nicht gesetzt - Kein Auto-Refresh

**Begründung:**
- 10s ist Standard für Echtzeit-Monitoring
- Prometheus scrapt alle 15s → 10s ist ausreichend
- Balance zwischen Aktualität und Server-Load

**Position im JSON:**
**[KORREKTUR verify-plan]: Kein `dashboard`-Wrapper! `refresh` direkt auf Root-Level nach `timezone` einfügen:**
```json
{
  "id": null,
  "uid": "automationone-system-health",
  "title": "AutomationOne - System Health",
  "tags": ["automationone", "system", "health"],
  "timezone": "browser",
  "refresh": "10s",  // ← Hier einfügen (Root-Level, nach timezone)
  "panels": [...]
}
```

**3. Admin-Passwort Warning hinzufügen**

**`.env.example` erweitern:**

**VORHER (IST-Zustand, korrigiert von verify-plan):**
```bash
# =======================
# Grafana (Profile: monitoring)
# =======================
GRAFANA_ADMIN_PASSWORD=changeme
```

**NACHHER:**
```bash
# =======================
# Grafana (Profile: monitoring)
# SECURITY: Ändern Sie dieses Passwort! Default-Fallback: 'admin' - UNSICHER!
# Empfehlung: Mindestens 12 Zeichen, Mix aus Groß/Klein/Zahlen/Sonderzeichen
# =======================
GRAFANA_ADMIN_PASSWORD=changeme
```

**Zusätzlich prüfen:** Ist `.env` in `.gitignore`?

Datei: `.gitignore`
```
.env  # ← MUSS vorhanden sein
```

**Falls nicht vorhanden → KRITISCHER BUG!**

---

## WO IM SYSTEM

### Dateipfade

| Datei | Zweck | Änderung |
|-------|-------|----------|
| `docker/grafana/provisioning/dashboards/dashboards.yml` | Dashboard-Provider-Config | **ÄNDERN** (`disableDeletion`) |
| `docker/grafana/provisioning/dashboards/system-health.json` | Dashboard-Definition | **ÄNDERN** (`refresh`) |
| `.env.example` | Environment-Template | **ÄNDERN** (Passwort-Warnung) |
| `.gitignore` | Git-Ignore-Rules | **PRÜFEN** (`.env` vorhanden?) |

### Container-Interaktion

**Grafana lädt Config beim Start:**
- Provisioning-Dateien werden via Bind-Mount eingelesen
- Änderungen brauchen Container-Restart

**Nach Änderung:**
```bash
# Nur Grafana restarten (schneller)
docker compose --profile monitoring restart grafana

# ODER: Gesamten Monitoring-Stack restarten (sicherer)
docker compose --profile monitoring down
docker compose --profile monitoring up -d
```

**Verifikation:**
```bash
# Grafana-Log prüfen
docker logs automationone-grafana --tail 100 | grep -i provisioning
# Erwartung: "provisioned dashboards" ohne Errors
```

---

## ERFOLGSKRITERIUM

### Technische Verifikation

**1. YAML-Syntax**
```bash
# dashboards.yml validieren (YAML-Syntax)
python3 -c "import yaml; yaml.safe_load(open('docker/grafana/provisioning/dashboards/dashboards.yml'))"
# Kein Output = valid
```

**2. JSON-Syntax**
```bash
# system-health.json validieren
jq . docker/grafana/provisioning/dashboards/system-health.json > /dev/null
# Exit-Code 0 = valid
```

**3. Container startet**
```bash
docker compose --profile monitoring restart grafana
docker logs automationone-grafana --tail 50 | grep -i error
# Keine Errors = OK
```

**4. Dashboard lädt**
- Browser: http://localhost:3000
- Login: admin / (password aus .env)
- Dashboard: AutomationOne → System Health

**5. Auto-Refresh aktiv**

**Im Browser prüfen:**
- Dashboard lädt
- Oben rechts: "Auto-refresh: 10s" angezeigt
- Nach 10 Sekunden: Dashboard aktualisiert sich (Timestamp ändert sich)

**Test:**
1. Dashboard öffnen
2. Uhrzeit notieren
3. 10 Sekunden warten
4. Panel-Daten sollten sich aktualisiert haben

**6. disableDeletion aktiv**

**Im Grafana UI prüfen:**
- Dashboard öffnen
- Dashboard-Settings öffnen (Zahnrad-Icon oben rechts)
- "Delete" Button sollte NICHT sichtbar sein
- Oder: Beim Versuch zu speichern → Error "Dashboard is provisioned"

**7. Admin-Passwort Warning**

**`.env.example` prüfen:**
- Kommentar über `GRAFANA_ADMIN_PASSWORD` vorhanden
- Warnung deutlich sichtbar

**`.gitignore` prüfen:**
- `.env` ist gelistet
- Kein `.env` im Git-Repo: `git ls-files | grep "^\.env$"` → kein Output

---

## STRUKTUR & PATTERN

### Grafana-Provisioning-Pattern

**AutomationOne folgt:**

1. **YAML-Provisionierung** für Provider (dashboards.yml, datasources.yml)
2. **JSON-Dashboards** (statisch versioniert)
3. **Read-Only-Dashboards** (`disableDeletion: true`, `editable` für Prototyping)

**Konventionen:**
- Provider-Name: `AutomationOne` (konsistent mit Projekt)
- Folder-Name: `AutomationOne` (alle Dashboards in einem Folder)
- Dashboard-UIDs: `automationone-*` Präfix

### Dashboard-Refresh-Pattern

**Grafana-Standard-Werte:**
- `"5s"` - Sehr häufig (Load-Tests, Incident-Response)
- `"10s"` - **Standard für Monitoring** (AutomationOne)
- `"30s"` - Application-Dashboards
- `"1m"` - Business-Metrics
- `"5m"` - Long-Term-Trends

**AutomationOne-Kontext:**
- Prometheus scrapt alle 15s
- 10s Refresh = User sieht Daten maximal 10s alt
- Balance zwischen Aktualität und Grafana-Server-Load

### Environment-Security-Pattern

**`.env.example` ist Template, NICHT Config:**
- Zeigt benötigte Variablen
- Default-Werte sind Beispiele/Platzhalter
- Muss von User in `.env` kopiert werden
- `.env` ist in `.gitignore` (Secrets bleiben lokal)

**Best Practice:**
- Unsichere Defaults mit Warnung versehen
- Empfohlene Werte dokumentieren
- Nie echte Secrets in `.env.example`

---

## REPORT ZURÜCK AN TM

**Datei:** `.technical-manager/inbox/agent-reports/system-control-grafana-config-2026-02-09.md`

**Struktur:**

```markdown
# Grafana Dashboard-Config Optimierung

## Analyse-Findings
- dashboards.yml: [disableDeletion Status, editable Status]
- system-health.json: [refresh vorhanden?, Wert]
- .env.example: [Passwort-Warnung vorhanden?]
- .gitignore: [.env gelistet?]

## Lösungsplan
- disableDeletion: [false → true, Begründung]
- refresh: [nicht gesetzt → "10s", Begründung]
- Passwort-Warning: [Text, Position]

## Implementierung
- dashboards.yml: [Diff]
- system-health.json: [Diff, JSON-Position]
- .env.example: [Diff]
- .gitignore: [Status, Action wenn fehlt]

## Verifikation
- YAML-Validierung: [OK/Fehler]
- JSON-Validierung: [OK/Fehler]
- Container-Restart: [OK/Fehler]
- Dashboard lädt: [OK/Fehler]
- Auto-Refresh aktiv: [Test durchgeführt, Ergebnis]
- Delete-Button: [Nicht sichtbar = OK]
- .env Security: [In .gitignore = OK]

## Trade-offs
- editable: true beibehalten → User kann experimentieren aber nicht speichern
- refresh: 10s → Mehr Grafana-Load, aber akzeptabel für Dev
```

---

## KRITISCHE HINWEISE

### JSON-Position von "refresh"

**[KORREKTUR verify-plan]: system-health.json hat KEINEN `"dashboard"` Wrapper!**
**WICHTIG:** `refresh` muss **Root-Level** im JSON sein, NICHT in einem Panel!

**RICHTIG:**
```json
{
  "refresh": "10s",  // ← Root-Level
  "title": "AutomationOne - System Health",
  "panels": [...]
}
```

**FALSCH:**
```json
{
  "panels": [
    {
      "refresh": "10s",  // ← FALSCH, nicht in Panel
      ...
    }
  ]
}
```

### disableDeletion vs editable

**[Hinweis verify-plan]: `editable: true` existiert DOPPELT: einmal in dashboards.yml (Provider-Level) und einmal in system-health.json Root-Level (Zeile 5). Beide müssen konsistent sein.**

**Verwirrende Kombination:**
- `editable: true` + `disableDeletion: true`
- User kann Dashboard in UI ändern
- User kann Änderungen NICHT speichern (Button disabled)
- Änderungen gehen bei Browser-Reload verloren

**Zweck:**
- Prototyping: User testet Panel-Queries in UI
- Wenn zufrieden: Ändert JSON-Datei, committed, deployed

**Alternative:**
- `editable: false` + `disableDeletion: true` = Komplett read-only
- TM-Empfehlung: `true` für Dev, `false` für Prod

### Environment-Security

**KRITISCH prüfen:**
```bash
# .env darf NICHT im Repo sein
git ls-files | grep "^\.env$"
# Output = KRITISCHER SECURITY-BUG

# .env.example SOLLTE im Repo sein
git ls-files | grep "^\.env\.example$"
# Kein Output = Fehlt (User weiß nicht welche Vars benötigt werden)
```

**Falls `.env` im Repo:**
1. `.env` aus Git entfernen: `git rm --cached .env`
2. `.gitignore` ergänzen
3. In Report KRITISCH markieren
4. Empfehlung: Alle Passwörter rotieren (sind jetzt exposed)

---

## ZUSAMMENFASSUNG

**Was wird gemacht:**
- `disableDeletion: true` → Dashboard schreibgeschützt
- `refresh: "10s"` → Dashboard aktualisiert alle 10s automatisch
- Passwort-Warnung in `.env.example`
- `.env` Security prüfen

**Warum:**
- Dashboard muss Live-Daten zeigen (Monitoring-Zweck)
- Provisionierte Dashboards schützen (Infrastructure-as-Code)
- User vor unsicheren Passwörtern warnen

**Wie:**
- YAML-Datei editieren (1 Zeile ändern)
- JSON-Datei erweitern (1 Property hinzufügen)
- `.env.example` kommentieren
- Validieren, Container restarten, testen

**Erwartung:**
- Dashboard zeigt "Auto-refresh: 10s"
- Delete-Button nicht sichtbar
- Security-Warnung dokumentiert
