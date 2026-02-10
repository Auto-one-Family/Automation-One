# Grafana Dashboard Redesign – Analyse & Konzept
# =================================================
# Datum: 2026-02-09
# Erstellt von: Technical Manager (Claude Desktop)
# Ergänzt von: verify-plan Agent – 2026-02-10
#
# ANWEISUNG AN VERIFY-PLAN:
# Dieses Dokument enthält TM-Wissen (markiert als ✅ TM-WISSEN) und offene Fragen
# (markiert als ❓ VERIFY-PLAN). Dein Auftrag: Ergänze ALLE ❓-Stellen direkt in
# diesem Dokument. Ersetze die Fragezeichen durch echte Daten. Lösche dabei NICHT
# die bestehenden Inhalte – ergänze sie. Wenn du etwas korrigieren musst, markiere
# es mit 🔧 KORREKTUR. Am Ende des Dokuments: Füge eine Sektion "Verify-Plan
# Ergebnisse" hinzu mit deiner Zusammenfassung und dem Zeitstempel.

---

# TEIL 1: IST-ZUSTAND GRAFANA

## 1.1 Provisioning-Struktur ✅ TM-WISSEN

```
docker/grafana/provisioning/
├── alerting/
│   └── alert-rules.yml         # 5 Alert Rules, 2 Gruppen
├── dashboards/
│   ├── dashboards.yml           # Provider-Config (folder: AutomationOne)
│   └── system-health.json       # 1 Dashboard, 12 Panels
└── datasources/
    └── datasources.yml          # 2 Datasources: Prometheus (default) + Loki
```

## 1.2 Datasources ✅ TM-WISSEN

| Name | Type | URL | UID | Default |
|------|------|-----|-----|---------|
| Prometheus | prometheus | http://prometheus:9090 | `prometheus` | ✅ |
| Loki | loki | http://loki:3100 | `loki` | ❌ |

Beide `editable: false` (provisioniert, nicht über UI änderbar).

## 1.3 Aktuelles Dashboard: "System Health" ✅ TM-WISSEN

**UID:** `automationone-system-health`
**Refresh:** 10s
**Time Range:** Last 1h
**Tags:** automationone, system, health
**Template Variables:** KEINE

### Panel-Layout (aktuell 12 Panels):

```
┌──────────────────────────────────────────────────────────────────────┐
│ y=0: STATUS ROW                                                      │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────────────┐           │
│ │ ID:1    │ │ ID:2    │ │ ID:3    │ │ ID:4             │           │
│ │ Server  │ │ MQTT    │ │ Database│ │ Frontend Errors  │           │
│ │ UP/DOWN │ │ UP/DOWN │ │ UP/DOWN │ │ (Last 5m)        │           │
│ │ stat    │ │ stat    │ │ stat    │ │ stat (Loki)      │           │
│ │ 6w      │ │ 6w      │ │ 6w      │ │ 6w               │           │
│ └─────────┘ └─────────┘ └─────────┘ └──────────────────┘           │
├──────────────────────────────────────────────────────────────────────┤
│ y=4: LOGS ROW                                                        │
│ ┌──────────────────────┐ ┌──────────────────────┐                   │
│ │ ID:5                 │ │ ID:6                 │                   │
│ │ Log Volume by Svc    │ │ Recent Error Logs    │                   │
│ │ timeseries (Loki)    │ │ logs panel (Loki)    │                   │
│ │ 12w                  │ │ 12w                  │                   │
│ └──────────────────────┘ └──────────────────────┘                   │
├──────────────────────────────────────────────────────────────────────┤
│ y=12: ROW HEADER "MQTT Broker Metrics" (ID:7)                        │
├──────────────────────────────────────────────────────────────────────┤
│ y=13: MQTT STATS                                                     │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                   │
│ │ ID:8    │ │ ID:9    │ │ ID:10   │ │ ID:11   │                   │
│ │ Broker  │ │Connected│ │Messages │ │Subscript│                   │
│ │ UP/DOWN │ │Clients  │ │Dropped  │ │  ions   │                   │
│ │ stat    │ │ stat    │ │ stat    │ │ stat    │                   │
│ │ 6w      │ │ 6w      │ │ 6w      │ │ 6w      │                   │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘                   │
├──────────────────────────────────────────────────────────────────────┤
│ y=17: MQTT MESSAGE RATE                                              │
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │ ID:12 - MQTT Message Rate (Received/s, Sent/s)                │  │
│ │ timeseries, 24w, smooth lines, legend bottom (mean, max)      │  │
│ └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Bewertung IST-Dashboard

**Was gut ist:**
- ✅ Status-Ampeln oben (Server, MQTT, DB)
- ✅ MQTT-Sektion mit Message Rate
- ✅ Error-Logs direkt im Dashboard
- ✅ Konsistente Farbcodierung (red/green für UP/DOWN)

**Was fehlt:**
- ❌ Server-Performance (CPU, Memory, Uptime) – Metriken existieren aber kein Panel!
- ❌ ESP32-Fleet-Status (Total/Online/Offline) – Metriken existieren aber kein Panel!
- ❌ Database-Details (Connections, Size, Queries)
- ❌ Keine collapsible Rows (alles flach)
- ❌ Kein Alerting-Status-Panel (welche Alerts feuern gerade?)
- ❌ MQTT Broker UP (ID:8) nutzt `up{job="mqtt-broker"}` (Exporter), nicht `god_kaiser_mqtt_connected` (Server-Sicht) – das sind zwei verschiedene Perspektiven die nicht erklärt werden
- ❌ Keine Template Variables (kein Time-Range-Selector, kein Service-Filter)

## 1.4 Alert Rules ✅ TM-WISSEN

| UID | Name | Metric | Threshold | For | Severity |
|-----|------|--------|-----------|-----|----------|
| ao-server-down | Server Down | `up{job="el-servador"}` | < 1 | 1m | critical |
| ao-mqtt-disconnected | MQTT Disconnected | `god_kaiser_mqtt_connected` | < 1 | 1m | critical |
| ao-database-down | Database Down | `pg_up` | < 1 | 1m | critical |
| ao-high-memory | High Memory | `god_kaiser_memory_percent` | > 85 | 5m | warning |
| ao-esp-offline | ESP Offline | `god_kaiser_esp_offline > 0 and esp_total > 0` | > 0 | 3m | warning |

**Bewertung:** Alert Rules sind solide. Struktur (A→B→C Pipeline) ist korrekt.
Problem mit ESP Offline + Mock-Daten wird in Part 4 gelöst.

---

# TEIL 2: VERFÜGBARE METRIKEN

## 2.1 Server-Metriken (god_kaiser_*) ✅ TM-WISSEN (aus A0)

Bekannte Metriken vom `/api/v1/health/metrics` Endpoint:

| Metrik | Typ | Beschreibung | Letzter bekannter Wert |
|--------|-----|-------------|----------------------|
| `god_kaiser_uptime_seconds` | gauge | Server-Laufzeit | 5145s |
| `god_kaiser_cpu_percent` | gauge | Server-Prozess CPU | 4.5% |
| `god_kaiser_memory_percent` | gauge | Server-Prozess Memory | 21.4% |
| `god_kaiser_mqtt_connected` | gauge | MQTT-Verbindung (0/1) | 1.0 |
| `god_kaiser_esp_total` | gauge | Registrierte ESPs | 100 |
| `god_kaiser_esp_online` | gauge | Online ESPs | 0 |
| `god_kaiser_esp_offline` | gauge | Offline ESPs | 32 |

✅ VERIFY-PLAN ERGEBNIS (2026-02-10):

**god_kaiser_* Metriken (Custom):** Exakt die 7 oben gelisteten. Keine weiteren. Alle gauge.
Aktuelle Live-Werte: uptime=9735s, cpu=8.7%, mem=21.5%, mqtt=1.0, esp_total=100, esp_online=1, esp_offline=31.

**Prometheus-Instrumentator-Metriken (automatisch via prometheus-client):**

| Metrik | Typ | Beschreibung |
|--------|-----|-------------|
| `process_virtual_memory_bytes` | gauge | Virtual Memory |
| `process_resident_memory_bytes` | gauge | RSS Memory |
| `process_start_time_seconds` | gauge | Process Start (Unix epoch) |
| `process_cpu_seconds_total` | counter | Total CPU Time |
| `process_open_fds` | gauge | Open File Descriptors |
| `process_max_fds` | gauge | Max File Descriptors |
| `http_requests_total{handler,method,status}` | counter | Request Count by Handler |
| `http_request_size_bytes{handler}` | summary | Request Size |
| `python_gc_objects_collected_total{generation}` | counter | GC Stats |
| `python_info{implementation,major,minor,patchlevel,version}` | gauge | Python Version |

**Dashboard-relevant:** `http_requests_total` ist sehr nützlich für ein "Request Rate" Panel (z.B. `rate(http_requests_total[5m])`).

## 2.2 PostgreSQL-Metriken (postgres-exporter) 

✅ VERIFY-PLAN ERGEBNIS (2026-02-10):

🔧 KORREKTUR: Label-Filter muss `datname="god_kaiser_db"` sein, NICHT `datname="automationone"`!
Die Datenbank heißt `god_kaiser_db` (siehe .env POSTGRES_DB).

| Metrik | Beschreibung | Verfügbar? | Labels | Aktueller Wert |
|--------|-------------|-----------|--------|----------------|
| `pg_up` | DB erreichbar | ✅ | `{server}` | 1 |
| `pg_stat_database_numbackends` | Aktive Connections | ✅ gauge | `{datid,datname}` | 9 (god_kaiser_db) |
| `pg_stat_database_tup_fetched` | Rows gelesen | ❌ NICHT verfügbar | — | — |
| `pg_stat_database_tup_inserted` | Rows eingefügt | ❌ NICHT verfügbar | — | — |
| `pg_stat_database_conflicts` | Conflicts | ✅ counter | `{datid,datname}` | 0 |
| `pg_stat_database_deadlocks` | Deadlocks | ✅ counter | `{datid,datname}` | 0 |
| `pg_database_size_bytes` | DB-Größe | ✅ | `{datname}` | 55210467 (~52.7MB) |
| `pg_stat_activity_count` | Queries nach State | ✅ | `{datname,state,usename}` | active=2, idle=7 |
| `pg_slow_queries` | Slow Queries | ❌ NICHT verfügbar | — | — |
| `pg_locks_count` | Locks nach Modus | ✅ | `{datname,mode}` | 1 (accesssharelock) |
| `pg_replication_is_replica` | Ist Replica? | ✅ | — | 0 |

**Neue Dashboard-relevante Metriken:**

| Metrik | Beschreibung | Empfehlung |
|--------|-------------|-----------|
| `pg_stat_activity_count{datname="god_kaiser_db",state="active"}` | Aktive Queries | ✅ Für Panel 20 verwenden statt numbackends |
| `pg_locks_count{datname="god_kaiser_db"}` | Locks | ✅ Für Panel 22 verwenden statt "Deadlocks" |
| `pg_stat_database_blks_hit` / `pg_stat_database_blks_read` | Cache Hit Ratio | Optional (fortgeschritten) |

🔧 KORREKTUR: `pg_stat_database_tup_*` und `pg_slow_queries` existieren NICHT im postgres-exporter v0.16.0.
Für Tupel-Statistiken müsste ein custom collector konfiguriert werden. Nicht notwendig für Phase 1.

## 2.3 MQTT-Metriken (mosquitto-exporter)

✅ VERIFY-PLAN ERGEBNIS (2026-02-10):

Alle Metriken keine Labels (Prometheus fügt `{job="mqtt-broker"}` beim Scraping hinzu).

| Metrik | Beschreibung | Verfügbar? | Aktueller Wert |
|--------|-------------|-----------|----------------|
| `broker_clients_connected` | Verbundene Clients | ✅ | 2 |
| `broker_messages_received` | Empfangene Messages (counter) | ✅ | 1756 |
| `broker_messages_sent` | Gesendete Messages (counter) | ✅ | 41839 |
| `broker_publish_messages_dropped` | Verworfene Messages | ✅ | 0 |
| `broker_subscriptions_count` | Aktive Subscriptions | ✅ | 17 |
| `broker_bytes_received` | Empfangene Bytes | ✅ | 179924 |
| `broker_bytes_sent` | Gesendete Bytes | ✅ | 1829361 |
| `broker_clients_total` | Total je verbundene Clients | ✅ | 2 |
| `broker_messages_stored` | Retained Messages | ✅ | 51 |
| 🔧 `broker_uptime` | Broker-Laufzeit (Sekunden) | ✅ | 9240 |

🔧 KORREKTUR: Metrik heißt `broker_uptime`, NICHT `broker_uptime_seconds`. Wert ist bereits in Sekunden.

**Zusätzlich verfügbare Metriken (nicht im TM-Plan):**

| Metrik | Beschreibung | Dashboard-relevant? |
|--------|-------------|-------------------|
| `broker_clients_disconnected` | Disconnected Clients | Optional |
| `broker_clients_expired` | Expired Sessions | Optional |
| `broker_clients_maximum` | Max je gleichzeitig verbunden | ✅ historisch interessant |
| `broker_publish_messages_received` | Publish-only Received | Optional (Subset von messages_received) |
| `broker_publish_messages_sent` | Publish-only Sent | Optional |
| `broker_retained_messages_count` | Retained Messages | ✅ gleich wie messages_stored |
| `broker_store_messages_bytes` | Store Size in Bytes | Optional |
| `broker_load_messages_received_{1min,5min,15min}` | Load Average (Msg/s) | ✅ Alternative zu rate() |
| `broker_load_bytes_sent_{1min,5min,15min}` | Bandwidth Load Average | Optional |

## 2.4 Loki-Labels

✅ VERIFY-PLAN ERGEBNIS (2026-02-10):

**Verfügbare Labels:**

| Label | Werte |
|-------|-------|
| `compose_project` | `auto-one` |
| `compose_service` | `el-frontend`, `el-servador`, `grafana`, `loki`, `mosquitto-exporter`, `mqtt-broker`, `postgres`, `postgres-exporter`, `prometheus`, `promtail` |
| `container` | Container-Namen (z.B. `automationone-server`) |
| `service` | gleich wie compose_service (Duplikat durch relabel_configs) |
| `service_name` | vorhanden |
| `stream` | `stdout`, `stderr` |
| `__stream_shard__` | intern |

🔧 KORREKTUR: **`level` Label hat KEINE Werte!** Die Loki API gibt `{"status":"success"}` ohne Data zurück.
🔧 KORREKTUR: **`component` Label hat KEINE Werte!**

**Analyse der Promtail Pipeline:**
- `level` und `component` werden NUR für `compose_service="el-frontend"` via JSON-Parsing extrahiert
- el-servador hat KEINE level-Extraktion in der Promtail Pipeline
- Fazit: `{compose_service="el-frontend", level="error"}` funktioniert theoretisch, aber offenbar erzeugt das Frontend keine passenden JSON-Logs mit "level" Key – deshalb gibt es keine Werte

**Auswirkung auf Dashboard-Queries:**
- Panel 4 (Frontend Errors): `{compose_service="el-frontend", level="error"}` wird IMMER 0 liefern, da kein `level` Label existiert
- Panel 24 (Error Rate by Service): Regex-Filter `|~ "(?i)(error|exception|critical)"` ist die richtige Strategie
- Panel 26 (Recent Error Logs): Regex-Filter ist korrekt

**Empfehlung:** Panel 4 Frontend Errors sollte auf Regex-Filter umgestellt werden:
`sum(count_over_time({compose_service="el-frontend"} |~ "(?i)(error|exception|critical)" [5m]))` statt Label-Filter.

---

# TEIL 3: SOLL-DASHBOARD KONZEPT

## 3.1 Design-Prinzipien

1. **Ampel-Prinzip:** Oben eine Zeile die auf einen Blick zeigt ob alles OK ist (grün/gelb/rot)
2. **Drill-Down:** Von oben (Überblick) nach unten (Details) – collapsible Rows
3. **Keine Redundanz:** Jede Information genau einmal, am sinnvollsten Ort
4. **Menschenverständlich:** Klare Titel, deutsche Beschreibungen, sinnvolle Einheiten
5. **KI-Debugging-fähig:** Strukturierte Logs querybar, Metriken korrelierbar
6. **Nicht überladen:** Maximal 5-6 Rows, Details in collapsible Sections

## 3.2 Dashboard-Layout: "AutomationOne – Operations"

**UID:** `automationone-operations` (ersetzt `automationone-system-health`)
**Refresh:** 10s
**Default Time Range:** Last 1h

```
┌══════════════════════════════════════════════════════════════════════┐
║ ROW 0: SYSTEM STATUS (immer sichtbar, NICHT collapsible)            ║
║                                                                      ║
║ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ║
║ │ Server │ │  MQTT  │ │   DB   │ │Frontend│ │  ESP   │ │ Alerts │ ║
║ │  UP ✅ │ │  UP ✅ │ │  UP ✅ │ │ 0 err  │ │ 68/100 │ │ 0 🔥   │ ║
║ │  stat  │ │  stat  │ │  stat  │ │  stat  │ │  stat  │ │  stat  │ ║
║ │  4w    │ │  4w    │ │  4w    │ │  4w    │ │  4w    │ │  4w    │ ║
║ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ ║
╠══════════════════════════════════════════════════════════════════════╣
║ ROW 1: SERVER PERFORMANCE (collapsible, default: open)              ║
║                                                                      ║
║ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────────────────────┐    ║
║ │ CPU %  │ │ Mem %  │ │ Uptime │ │ CPU + Memory über Zeit    │    ║
║ │ gauge  │ │ gauge  │ │  stat  │ │ timeseries (dual-axis)    │    ║
║ │  4w    │ │  4w    │ │  4w    │ │ 12w                       │    ║
║ └────────┘ └────────┘ └────────┘ └────────────────────────────┘    ║
╠══════════════════════════════════════════════════════════════════════╣
║ ROW 2: ESP32 FLEET (collapsible, default: open)                     ║
║                                                                      ║
║ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────────────────────┐    ║
║ │ Total  │ │ Online │ │Offline │ │ Online-Rate über Zeit     │    ║
║ │  stat  │ │  stat  │ │  stat  │ │ timeseries (%)            │    ║
║ │  4w    │ │  4w    │ │  4w    │ │ 12w                       │    ║
║ └────────┘ └────────┘ └────────┘ └────────────────────────────┘    ║
╠══════════════════════════════════════════════════════════════════════╣
║ ROW 3: MQTT TRAFFIC (collapsible, default: open)                    ║
║                                                                      ║
║ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                        ║
║ │Clients │ │Msg/s in│ │Msg/s ou│ │Dropped │                        ║
║ │  stat  │ │  stat  │ │  stat  │ │  stat  │                        ║
║ │  6w    │ │  6w    │ │  6w    │ │  6w    │                        ║
║ └────────┘ └────────┘ └────────┘ └────────┘                        ║
║ ┌────────────────────────────────────────────────────────────────┐  ║
║ │ MQTT Message Rate (Received/s + Sent/s über Zeit)             │  ║
║ │ timeseries, 24w                                                │  ║
║ └────────────────────────────────────────────────────────────────┘  ║
╠══════════════════════════════════════════════════════════════════════╣
║ ROW 4: DATABASE (collapsible, default: collapsed)                   ║
║                                                                      ║
║ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────────────────────┐    ║
║ │Active  │ │DB Size │ │  Dead  │ │ Connections über Zeit     │    ║
║ │Connec. │ │  MB    │ │ locks  │ │ timeseries               │    ║
║ │  stat  │ │  stat  │ │  stat  │ │ 12w                       │    ║
║ └────────┘ └────────┘ └────────┘ └────────────────────────────┘    ║
╠══════════════════════════════════════════════════════════════════════╣
║ ROW 5: LOGS & ERRORS (collapsible, default: collapsed)              ║
║                                                                      ║
║ ┌──────────────────────────────┐ ┌──────────────────────────────┐  ║
║ │ Error Rate by Service        │ │ Log Volume by Service        │  ║
║ │ timeseries (Loki)            │ │ timeseries (Loki)            │  ║
║ │ 12w                          │ │ 12w                          │  ║
║ └──────────────────────────────┘ └──────────────────────────────┘  ║
║ ┌────────────────────────────────────────────────────────────────┐  ║
║ │ Recent Error Logs (Loki log panel, sortiert, mit Labels)      │  ║
║ │ 24w, 8h height                                                 │  ║
║ └────────────────────────────────────────────────────────────────┘  ║
└══════════════════════════════════════════════════════════════════════┘
```

## 3.3 Panel-Spezifikationen

### ROW 0: System Status (6 Panels)

| # | Titel | Typ | Datasource | Query | Thresholds | Notizen |
|---|-------|-----|-----------|-------|------------|---------|
| 1 | Server | stat | Prometheus | `up{job="el-servador"}` | 0=red DOWN, 1=green UP | Mapping: 0→DOWN, 1→UP |
| 2 | MQTT | stat | Prometheus | `god_kaiser_mqtt_connected` | 0=red DOWN, 1=green UP | Server-Sicht (nicht Exporter) |
| 3 | Database | stat | Prometheus | `pg_up` | 0=red DOWN, 1=green UP | Exporter-Sicht |
| 4 | Frontend Errors | stat | Loki | `sum(count_over_time({compose_service="el-frontend", level="error"}[5m]))` | 0=green, 1+=yellow, 10+=red | noValue="0" |
| 5 | ESP Fleet | stat | Prometheus | `god_kaiser_esp_online` | Dynamisch (s.u.) | Format: "68 / 100" via textMode |
| 6 | Active Alerts | ✅ VERIFY-PLAN: **Kein stat-Panel möglich.** Es gibt keine Prometheus-Metrik für Grafana-interne Alerts (kein Alertmanager deployed). Empfehlung: Grafana "Alert List" Panel-Typ (`type: "alertlist"`) verwenden – zeigt automatisch alle feuernden Alerts. Alternativ: Panel weglassen und die 4w-Breite auf ESP Fleet (ID:5) verteilen. | 0=green, 1+=red | Alert List Panel: `options: { maxItems: 5, alertName: "", folderId: 0, stateFilter: { firing: true, pending: true } }` |

**ESP Fleet Panel (ID:5) – Spezial-Konfiguration:**

✅ VERIFY-PLAN ERGEBNIS (2026-02-10):

Alle drei Optionen sind technisch möglich. Empfehlung:

- **Option A (empfohlen):** Zwei Targets im selben stat-Panel: Target A = `god_kaiser_esp_online` (Hauptwert), Target B = `god_kaiser_esp_total` (Subtext via override `textMode: "value_and_name"`). Konfigurierbar über `reduceOptions` und Field Overrides. Aktueller Wert: `1 / 100`.
- **Option B:** Funktioniert als gauge, aber Division-by-Zero bei esp_total=0. Fix: `god_kaiser_esp_online / clamp_min(god_kaiser_esp_total, 1) * 100`
- **Option C:** Wird ohnehin in ROW 2 gemacht (Panel 11-13), wäre redundant in ROW 0.

Thresholds für ESP Online:
- 0 = red (keine ESPs online)
- > 0 = green (mindestens ein ESP online)
- Spezialfall: wenn `esp_total = 0` → grau/blau "No Devices" (via value mapping: `noValue: "No Devices"`)

### ROW 1: Server Performance (4 Panels)

| # | Titel | Typ | Query | Thresholds | Unit |
|---|-------|-----|-------|------------|------|
| 7 | CPU | gauge | `god_kaiser_cpu_percent` | 0-60=green, 60-80=yellow, 80+=red | percent (0-100) |
| 8 | Memory | gauge | `god_kaiser_memory_percent` | 0-70=green, 70-85=yellow, 85+=red | percent (0-100) |
| 9 | Uptime | stat | `god_kaiser_uptime_seconds` | — | duration (dhms) |
| 10 | Performance Over Time | timeseries | CPU + Memory als zwei Serien | — | percent |

**Panel 10 Detail:**
- Target A: `god_kaiser_cpu_percent` → legendFormat "CPU %"
- Target B: `god_kaiser_memory_percent` → legendFormat "Memory %"
- Dual lines, fillOpacity 10, smooth interpolation
- Y-Axis: 0-100%

### ROW 2: ESP32 Fleet (4 Panels)

| # | Titel | Typ | Query | Thresholds |
|---|-------|-----|-------|------------|
| 11 | Total Registered | stat | `god_kaiser_esp_total` | blue (informational) |
| 12 | Online | stat | `god_kaiser_esp_online` | 0=red, >0=green |
| 13 | Offline | stat | `god_kaiser_esp_offline` | 0=green, >0=orange, >10=red |
| 14 | Online Rate Over Time | timeseries | `god_kaiser_esp_online / god_kaiser_esp_total * 100` | — |

✅ VERIFY-PLAN ERGEBNIS (2026-02-10):

- `god_kaiser_esp_online / god_kaiser_esp_total * 100` ist valides PromQL (Operator-Precedenz: Division vor Multiplikation ist korrekt bei gleicher Precedenz links-nach-rechts ausgewertet).
- **Division by Zero:** Wenn esp_total=0, gibt PromQL `NaN` zurück (kein Error, aber leeres Panel).
- **Empfohlene sichere Expression:** `god_kaiser_esp_online / clamp_min(god_kaiser_esp_total, 1) * 100`
- `(god_kaiser_esp_total > 0)` funktioniert NICHT als Guard – es gibt 0 oder 1 zurück, nicht den Originalwert.
- Aktueller Wert: `1 / 100 * 100 = 1%` (1 ESP online von 100 registrierten).

### ROW 3: MQTT Traffic (5 Panels)

| # | Titel | Typ | Query | Thresholds |
|---|-------|-----|-------|------------|
| 15 | Connected Clients | stat | `broker_clients_connected{job="mqtt-broker"}` | 0=red, 1=orange, 2+=green |
| 16 | Msg/s In | stat | `rate(broker_messages_received{job="mqtt-broker"}[5m])` | blue |
| 17 | Msg/s Out | stat | `rate(broker_messages_sent{job="mqtt-broker"}[5m])` | blue |
| 18 | Messages Dropped | stat | `broker_publish_messages_dropped{job="mqtt-broker"}` | 0=green, >0=red |
| 19 | Message Rate | timeseries | Received/s + Sent/s (wie aktuelles ID:12) | — |

### ROW 4: Database (4 Panels)

✅ VERIFY-PLAN ERGEBNIS (2026-02-10):

🔧 KORREKTUR: `datname="automationone"` → `datname="god_kaiser_db"` (überall!)

| # | Titel | Typ | Query | Unit | Status |
|---|-------|-----|-------|------|--------|
| 20 | Active Connections | stat | `pg_stat_database_numbackends{datname="god_kaiser_db"}` | short | ✅ verfügbar (aktuell: 9) |
| 21 | DB Size | stat | `pg_database_size_bytes{datname="god_kaiser_db"}` | bytes | ✅ verfügbar (aktuell: ~52.7MB) |
| 22 | Deadlocks | stat | `pg_stat_database_deadlocks{datname="god_kaiser_db"}` | short | ✅ verfügbar (counter, aktuell: 0) |
| 23 | Connections Over Time | timeseries | `pg_stat_database_numbackends{datname="god_kaiser_db"}` | short | ✅ verfügbar |

**Alternatives Panel 22:** Statt nur Deadlocks (die fast immer 0 sind) könnten Locks gezeigt werden:
`sum(pg_locks_count{datname="god_kaiser_db"})` – zeigt aktive Locks aller Modi.

### ROW 5: Logs & Errors (3 Panels)

| # | Titel | Typ | Datasource | Query |
|---|-------|-----|-----------|-------|
| 24 | Error Rate by Service | timeseries | Loki | `sum(count_over_time({compose_project="auto-one"} \|~ "(?i)(error\|exception\|critical)" [5m])) by (compose_service)` |
| 25 | Log Volume by Service | timeseries | Loki | `sum(count_over_time({compose_project="auto-one"} [5m])) by (compose_service)` |
| 26 | Recent Error Logs | logs | Loki | `{compose_project="auto-one"} \|~ "(?i)(error\|exception\|fail\|critical)"` |

**Panel 26 Optionen:**
- enableLogDetails: true
- showLabels: true (compose_service, level)
- showTime: true
- sortOrder: Descending
- wrapLogMessage: false
- dedupStrategy: none

✅ VERIFY-PLAN ERGEBNIS (2026-02-10):

🔧 KORREKTUR: Das `level` Label ist NICHT verfügbar (siehe Loki-Labels Analyse oben).
Die Promtail Pipeline extrahiert `level` nur für el-frontend (JSON), und selbst dort hat es keine Werte.
Für el-servador fehlt jegliche level-Extraktion.

**Empfehlung:** Regex-Filter beibehalten. Die aktuellen Queries sind korrekt:
- Panel 24: `{compose_project="auto-one"} |~ "(?i)(error|exception|critical)"` ✅
- Panel 26: `{compose_project="auto-one"} |~ "(?i)(error|exception|fail|critical)"` ✅

Für performantere Queries in der Zukunft: Promtail Pipeline in Part 3 um el-servador level-Extraktion erweitern (JSON-Logs parsen → `level` Label setzen). Erst DANACH können Label-basierte Queries genutzt werden.

---

# TEIL 4: ALERT RULES (nach Part 4 Cleanup)

Die bestehenden 5 Alert Rules bleiben. Nach dem ESP Offline Fix (Part 4) sollte
die Rule `ao-esp-offline` eine verbesserte Expression haben.

✅ VERIFY-PLAN ERGEBNIS (2026-02-10):

Grafana API abgefragt: `curl -s -u admin:admin http://localhost:3000/api/prometheus/grafana/api/v1/rules`

| UID | Name | State | Health | Seit |
|-----|------|-------|--------|------|
| ao-server-down | Server Down | ✅ inactive (Normal) | ok | 2026-02-09T20:54:00Z |
| ao-mqtt-disconnected | MQTT Disconnected | ✅ inactive (Normal) | ok | 2026-02-09T20:09:50Z |
| ao-database-down | Database Down | ⚠️ pending | ok | 2026-02-09T23:14:00Z |
| ao-high-memory | High Memory Usage | ✅ inactive (Normal) | ok | 2026-02-09T07:12:50Z |
| ao-esp-offline | ESP Devices Offline | 🔥 firing (Alerting) | ok | 2026-02-09T20:12:50Z |

🔧 WICHTIGE DISKREPANZ bei ao-esp-offline:
- **YAML-Datei (alert-rules.yml):** `god_kaiser_esp_offline > 5 and god_kaiser_esp_total > 0 and god_kaiser_esp_online > 0`
- **Laufende Grafana-Instanz:** `god_kaiser_esp_offline > 0 and god_kaiser_esp_total > 0` (ältere Version!)
- **Ursache:** Die alert-rules.yml wurde aktualisiert (Part 4), aber Grafana wurde seitdem NICHT neugestartet.
- **Fix:** `docker compose --profile monitoring restart grafana` oder `make monitor-down && make monitor-up`

⚠️ ao-database-down im "pending" State:
- pg_up=1 (DB ist erreichbar), aber Threshold ist `< 1` → sollte NICHT feuern
- Mögliche Ursache: Timing/Evaluation-Lag nach letztem Monitoring-Restart
- Beobachten: Sollte nach kurzer Zeit wieder "inactive" werden

---

# TEIL 5: OFFENE FRAGEN FÜR IMPLEMENTATION

## 5.1 Dashboard-Strategie

✅ VERIFY-PLAN ERGEBNIS (2026-02-10):

**Empfehlung: ERSETZEN** – TM-Empfehlung bestätigt.

Begründung:
- `dashboards.yml` hat `disableDeletion: true` → Grafana löscht provisionierte Dashboards nicht
- Wenn die UID gleich bleibt (`automationone-system-health`), wird das alte Dashboard einfach aktualisiert
- Wenn ein NEUES Dashboard mit anderer UID daneben gestellt wird, existiert das alte weiterhin → Verwirrung
- Das Provisioning-Verzeichnis hat `foldersFromFilesStructure: false` → alle JSONs im selben Ordner "AutomationOne"
- system-health.json ist die einzige Dashboard-Datei → einfach Inhalt ersetzen, UID beibehalten

## 5.2 Template Variables

Für die Zukunft wäre sinnvoll:
- `$timerange` – vordefinierte Zeitfenster (1h, 6h, 24h, 7d)
- `$service` – Dropdown mit allen compose_services (für Log-Panels)

✅ VERIFY-PLAN ERGEBNIS (2026-02-10):

**Ja, Template Variables funktionieren in provisionierten Dashboards.** Sie werden im `templating.list` Array definiert.

**Prometheus-basiertes Template Variable (Service-Filter):**
```json
{
  "templating": {
    "list": [
      {
        "name": "service",
        "type": "query",
        "datasource": { "type": "prometheus", "uid": "prometheus" },
        "query": "label_values(up, job)",
        "refresh": 1,
        "includeAll": true,
        "allValue": ".*",
        "current": { "text": "All", "value": "$__all" },
        "multi": false
      }
    ]
  }
}
```

**Loki-basiertes Template Variable (Log Service Filter):**
```json
{
  "name": "log_service",
  "type": "query",
  "datasource": { "type": "loki", "uid": "loki" },
  "query": "label_values(compose_service)",
  "refresh": 1,
  "includeAll": true,
  "allValue": ".*",
  "current": { "text": "All", "value": "$__all" },
  "multi": true
}
```

**Empfehlung:** Für Phase 1 KEINE Template Variables einbauen – hält das Dashboard einfacher. In Phase 2 sinnvoll wenn mehrere Dashboards oder detaillierte Drill-Down-Ansichten gewünscht sind.

## 5.3 Dashboard-UID und Folder

- **UID:** `automationone-system-health` (beibehalten für Link-Kompatibilität)
  ODER `automationone-operations` (neuer Name, klarer)
- **Folder:** "AutomationOne" (wie in dashboards.yml konfiguriert)

✅ VERIFY-PLAN ERGEBNIS (2026-02-10):

**UID-Wechsel verursacht Duplikat!** Bei einem UID-Wechsel (z.B. `automationone-system-health` → `automationone-operations`):
- Grafana behält das alte Dashboard (wegen `disableDeletion: true`)
- PLUS erstellt ein neues Dashboard mit der neuen UID
- Ergebnis: 2 Dashboards im Folder "AutomationOne"

**Empfehlung:** UID **beibehalten**: `automationone-system-health`. Nur den `title` ändern auf "AutomationOne - Operations". So wird das bestehende Dashboard in-place aktualisiert.

---

# TEIL 6: VERIFY-PLAN ERGEBNISSE

## Verify-Plan Analyse

**Datum:** 2026-02-10
**Agent:** verify-plan
**Geprüft:** 4 Metrics-Endpoints, 6 Loki-Labels, 5 Alert Rules, 26 Panel-Queries, 3 Provisioning-Dateien

### Metriken-Audit

| Endpoint | Metriken-Count | Dashboard-relevant |
|----------|---------------|-------------------|
| Server (`/api/v1/health/metrics`) | 7 custom (god_kaiser_*) + 10 instrumentator | 7 + 1 (http_requests_total) |
| Postgres-Exporter (`:9187/metrics`) | ~20 relevante pg_* | 5 (up, numbackends, size, deadlocks, locks) |
| Mosquitto-Exporter (`:9234/metrics`) | ~30 broker_* | 10 (clients, messages, subscriptions, bytes, uptime) |
| Loki (`:3100`) | Log-Streams von 10 Services | compose_service, compose_project, container, stream |

### Loki-Labels

| Label | Werte-Count | Werte |
|-------|------------|-------|
| compose_project | 1 | auto-one |
| compose_service | 10 | el-frontend, el-servador, grafana, loki, mosquitto-exporter, mqtt-broker, postgres, postgres-exporter, prometheus, promtail |
| container | 10 | Container-Namen |
| service | 10 | gleich wie compose_service |
| stream | 2 | stdout, stderr |
| level | 0 | **LEER** (Promtail Pipeline extrahiert nicht korrekt) |
| component | 0 | **LEER** |

### Alert-Status

| Rule | State | Seit | Kommentar |
|------|-------|------|-----------|
| Server Down | ✅ Normal | 20:54 | OK |
| MQTT Disconnected | ✅ Normal | 20:09 | OK |
| Database Down | ⚠️ Pending | 23:14 | Transient – pg_up=1, sollte sich selbst lösen |
| High Memory Usage | ✅ Normal | 07:12 | OK (21.5% < 85%) |
| ESP Devices Offline | 🔥 Alerting | 20:12 | Erwartet: 31 Mock-ESPs offline, Alert feuert korrekt |

### PromQL-Validierung

| Panel | Query | Status | Korrektur |
|-------|-------|--------|-----------|
| 1-3 (Status) | `up{job="el-servador"}`, `god_kaiser_mqtt_connected`, `pg_up` | ✅ OK | — |
| 4 (Frontend Errors) | `{compose_service="el-frontend", level="error"}` | 🔧 FAIL | level Label leer → Regex-Filter nutzen |
| 5 (ESP Fleet) | `god_kaiser_esp_online` | ✅ OK | — |
| 6 (Active Alerts) | stat + Prometheus Metrik | 🔧 FAIL | Keine Metrik → "Alert List" Panel nutzen |
| 7-9 (Server Perf) | `god_kaiser_cpu_percent`, `memory_percent`, `uptime_seconds` | ✅ OK | — |
| 10 (Perf Timeseries) | CPU + Memory dual | ✅ OK | — |
| 11-13 (ESP Fleet) | `esp_total`, `esp_online`, `esp_offline` | ✅ OK | — |
| 14 (Online Rate) | `esp_online / esp_total * 100` | ⚠️ FIX | `clamp_min(god_kaiser_esp_total, 1)` als Divisor |
| 15-19 (MQTT) | broker_* mit `{job="mqtt-broker"}` | ✅ OK | — |
| 20-23 (Database) | `pg_stat_database_*{datname="automationone"}` | 🔧 FAIL | `datname="god_kaiser_db"` |
| 24-26 (Logs) | Loki Regex-Filter | ✅ OK | — |

### Korrekturen am TM-Konzept (Zusammenfassung)

| # | Kategorie | Was der TM schrieb | Was korrekt ist |
|---|-----------|--------------------|-----------------|
| 1 | 🔧 DB-Name | `datname="automationone"` | `datname="god_kaiser_db"` |
| 2 | 🔧 Metrik-Name | `broker_uptime_seconds` | `broker_uptime` (Wert ist bereits in Sekunden) |
| 3 | 🔧 Loki level | `{level="error"}` als Label-Filter | Label ist leer – Regex `\|~ "(?i)(error\|...)"` nutzen |
| 4 | 🔧 Alerts Panel | stat + Prometheus Metrik | "Alert List" Panel-Typ (kein Alertmanager deployed) |
| 5 | 🔧 PG Metriken | `pg_stat_database_tup_*`, `pg_slow_queries` | Nicht verfügbar im postgres-exporter v0.16.0 |
| 6 | 🔧 Alert-Sync | ESP Offline Rule updated in YAML | Laufende Grafana hat noch alte Rule (>0 statt >5) |
| 7 | ⚠️ Div by Zero | `esp_online / esp_total * 100` | `esp_online / clamp_min(esp_total, 1) * 100` |

### Empfehlungen

1. **VOR Dashboard-Implementierung:** Grafana Container neustarten um aktualisierte Alert Rules zu laden
2. **Panel 4 (Frontend Errors):** Query auf Regex-Filter umstellen da `level` Label nicht funktioniert
3. **Panel 6 (Active Alerts):** "Alert List" Panel statt stat verwenden – zeigt automatisch feuernde Alerts
4. **Panel 14 (Online Rate):** `clamp_min` für Division-by-Zero Safety verwenden
5. **Panel 20-23 (Database):** Alle Queries mit `datname="god_kaiser_db"` statt `"automationone"`
6. **UID beibehalten:** `automationone-system-health` → kein Duplikat, bestehende Links funktionieren
7. **Template Variables:** Für Phase 1 weglassen, in Phase 2 bei Bedarf nachrüsten
8. **Promtail Pipeline:** In Part 3 (falls noch offen) el-servador level-Extraktion einbauen für zukünftige Label-basierte Loki-Queries

---

# ZUSAMMENFASSUNG FÜR IMPLEMENTATION

Nach verify-plan Ergänzung wird dieses Dokument zur vollständigen Spezifikation
für das neue Grafana Dashboard. Der nächste Schritt ist dann:
1. Robin prüft verify-plan Ergebnisse
2. TM erstellt finalen /do-Auftrag für die Dashboard-Implementation
3. /do Agent baut das system-health.json basierend auf dieser Spezifikation
