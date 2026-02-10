# LOG_ACCESS_REFERENCE.md Korrektur

**Agent:** agent-manager | **Datum:** 2026-02-09 | **Auftrag:** 5

---

## Analyse-Findings

### 1. Fehlerhafte Label-Namen

| Datei | Zeile | Fehlerhaft | Korrekt |
|-------|-------|-----------|---------|
| LOG_ACCESS_REFERENCE.md | 45 | `service_name` | `service` |

**Umfang:** Nur 1 Stelle in LOG_ACCESS_REFERENCE.md betroffen (Zeile 45).

### 2. Promtail-Config verifiziert

`docker/promtail/config.yml` Zeile 30-31:
```yaml
- source_labels: ['__meta_docker_container_label_com_docker_compose_service']
  target_label: 'service'
```

Bestaetigte Labels aus Promtail-Config:
- `container` (Z.27)
- `stream` (Z.29)
- `service` (Z.31)
- `compose_service` (Z.33)
- `compose_project` (Z.35)

### 3. Frontend-Loki-Integration: KEINE

Suche in `El Frontend/src/` nach `loki`, `service_name`, `LogQL`, `3100`: **0 Treffer**.

Frontend hat keine direkte Loki-Integration. Die "60+ Queries" Behauptung, die der TM erwaehnte, existiert NICHT in LOG_ACCESS_REFERENCE.md. Diese Behauptung stammt moeglicherweise aus TM SKILLS.md oder einer aelteren Version.

### 4. LOG_LOCATIONS.md bereits korrekt

LOG_LOCATIONS.md (v3.1, 2026-02-09) wurde offensichtlich bereits korrigiert:
- Sektion 12.2: Alle Query-Beispiele nutzen `{service="..."}` (korrekt)
- Sektion 12.3: Label-Tabelle korrekt (`service`, `container`, etc.)
- Keine Erwaehnungen von `service_name`

### 5. Zusaetzlicher Zeile-45-Fehler

Neben dem Label-Namen waren auch die Beispielwerte falsch zugeordnet:
- **Alt:** `service_name` oder `container` mit Container-Namen (`automationone-server`, ...)
- **Korrekt:** `service` = Compose-Service-Namen (`el-servador`, ...), `container` = Container-Namen (`automationone-server`, ...)

---

## Korrektur-Plan

| # | Aktion | Begruendung |
|---|--------|-------------|
| 1 | `service_name` -> `service` in Zeile 45 | Promtail-Config Z.31 |
| 2 | Werte korrekt zuordnen (service vs container) | Semantische Korrektheit |
| 3 | Warnung vor `service_name` Auto-Label hinzufuegen | Ambiguitaet dokumentieren |

---

## Implementierung

**Datei:** `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md`

**Diff (Zeile 45):**

```diff
- **Loki-Befehle (für session.sh):** [LOG_LOCATIONS.md](LOG_LOCATIONS.md) Sektion 12. Labels: `service_name` oder `container` mit Container-Namen (`automationone-server`, `automationone-mqtt`, `automationone-frontend`). Windows: `curl.exe` statt `curl`.
+ **Loki-Befehle (für session.sh):** [LOG_LOCATIONS.md](LOG_LOCATIONS.md) Sektion 12. Labels: `service` (Compose-Service: `el-servador`, `mqtt-broker`, `el-frontend`) oder `container` (Container-Name: `automationone-server`, `automationone-mqtt`, `automationone-frontend`). Windows: `curl.exe` statt `curl`.
+
+ > **Achtung:** Das Label `service_name` existiert ebenfalls (Docker SD Auto-Label), ist aber ambig (mischt Container- und Service-Namen). Stattdessen `service` verwenden.
```

---

## Cross-References

### Dateien mit `service_name` in `.claude/`

| Datei | Typ | Status |
|-------|-----|--------|
| `reference/debugging/LOG_ACCESS_REFERENCE.md` Z.45 | Reference | **KORRIGIERT** |
| `reports/Technical Manager/TM SKILLS.md` Z.179-200 | Report | Fehlerhaft, aber Report (nicht aendern) |
| `reports/current/CONSOLIDATED_REPORT.md` Z.112,218,229,245 | Report | Dokumentiert den Fehler bereits |
| `reports/current/MONITORING_STACK_DEPLOYMENT.md` Z.66,80 | Report | Korrekt: dokumentiert `service_name` als Auto-Label |
| `reports/current/Monitoring_stack.md` Z.441 | Report | Korrekt: "Label heisst `service` (NICHT `service_name`)" |
| `skills/esp32-development/MODULE_REGISTRY.md` Z.466 | Skill | Code-Variable, kein Loki-Label (irrelevant) |

### Quelle der Fehlinformation

**TM SKILLS.md Zeile 181:**
> "WICHTIG: Label ist `service_name` (NICHT `service`!)"

Dies ist die **Quelle der Fehlinformation**. Die Behauptung ist komplett falsch - das Promtail-Config-Label heisst `service`. `service_name` ist ein Auto-Label von Docker SD.

**Empfehlung:** TM sollte TM SKILLS.md als fehlerhaft markieren/aktualisieren.

---

## Verifikation

- [x] `service_name` in Zeile 45 durch `service` ersetzt
- [x] Werte korrekt zugeordnet (service = Compose-Namen, container = Container-Namen)
- [x] Warnung vor `service_name` Auto-Label hinzugefuegt
- [x] Cross-References geprueft (6 Dateien, 1 korrigiert, 5 Reports/irrelevant)
- [x] Frontend-Loki-Check: 0 Treffer bestaetigt
- [ ] Live-Loki-Test nicht durchgefuehrt (Stack nicht aktiv)

---

## TM-Hinweise

1. **Auftragsumfang war ueberbewertet:** TM erwartete "60+ Frontend-Queries" Korrektur und viele Query-Beispiel-Fixes. Tatsaechlich war nur Zeile 45 betroffen. LOG_LOCATIONS.md Sektion 12 war bereits korrekt.

2. **TM SKILLS.md korrigieren:** Die Datei `.claude/reports/Technical Manager/TM SKILLS.md` enthaelt auf Z.179-200 falsche Label-Informationen. Dies ist die wahrscheinliche Quelle der Fehlinformation.

3. **Label-Referenz-Tabelle:** Bereits in LOG_LOCATIONS.md Sektion 12.3 vorhanden. Keine Duplikation in LOG_ACCESS_REFERENCE.md noetig (diese Datei verweist auf LOG_LOCATIONS.md).
