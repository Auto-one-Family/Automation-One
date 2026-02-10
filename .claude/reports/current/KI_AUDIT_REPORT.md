# KI-Audit: Grafana Template Variables - Implementierungsplan

**Kontext:** Audit des Agent-Reports `grafana-template-variables-2026-02-10.md` gegen den TM-Befehl `grafana-template-variables.md` und die echte Dashboard-JSON `system-health.json`
**Pruefumfang:** Report-Analyse (631 Zeilen), TM-Befehl (156 Zeilen), Dashboard-JSON (1094 Zeilen), datasources.yml, dashboards.yml, prometheus.yml, alert-rules.yml
**Referenzen genutzt:** Echte Config-Dateien, Grafana 11.x JSON-Schema, Dashboard-JSON direkt
**Datum:** 2026-02-10

---

## Executive Summary

| Kategorie | Befunde | Kritisch / Warnung / Info |
|-----------|---------|---------------------------|
| 1.4 Copy-Paste-Propagation | Panel-Zaehler inkonsistent | 0 / 1 / 0 |
| 2.1 Plausibel aber falsch | Achsenbeschriftungen nicht aktualisiert | 0 / 1 / 0 |
| 2.4 Counter vs Gauge | Vorbestehende Dashboard-Fehler nicht geflaggt | 0 / 0 / 1 |
| 5.1 Row collapsed/open | Implementierer-Warnung fehlt | 0 / 0 / 1 |
| 9.4 Overengineering | Unnoetige Felder in Variable-Definition | 0 / 0 / 1 |
| 9.5 Kontext-Verlust | TM-Befehl Abweichung (korrekt begruendet) | 0 / 0 / 1 |
| **Gesamt** | **6 Befunde** | **0 / 2 / 4** |

**Gesamturteil:** Der Report ist von hoher Qualitaet. Keine kritischen Fehler. Zwei Warnungen die vor Implementierung behoben werden sollten. Die Analyse ist gruendlich, Live-verifiziert, und die Entscheidungen nachvollziehbar begruendet.

---

## Befunde (nach Katalog-ID)

### 1.4 Copy-Paste-Propagation - Panel-Zaehler inkonsistent

- **Wo:** Report Zeile 493 vs Zeile 626-628
- **Befund:** Die Ueberschrift in Abschnitt F sagt **"(5 Panels)"**, die Tabelle darunter listet aber nur **4 Panels** (IDs: 19, 24, 25, 26). Die Zusammenfassung am Report-Ende sagt korrekt "4". Es gibt einen Widerspruch innerhalb des Dokuments.
- **Empfehlung:** Ueberschrift auf "(4 Panels)" korrigieren.

### 2.1 Plausibel aber falsch - Achsenbeschriftungen veraltet nach $interval

- **Wo:** Dashboard-JSON Panel 24 (Zeile 966) und Panel 25 (Zeile 1017)
- **Befund:** Panel 24 hat `"axisLabel": "Errors / 5m"` und Panel 25 hat `"axisLabel": "Log Lines / 5m"`. Wenn `$interval` die hardcoded `[5m]` ersetzt, zeigen die Achsen weiterhin "/ 5m" an - auch wenn der User 1m, 15m oder 1h waehlt. Das ist **semantisch irrefuehrend**.
- **Im Report nicht erwaehnt:** Der Report aendert die `expr`-Queries korrekt, erwaehnt aber die `axisLabel`-Properties nicht.
- **Empfehlung:** Entweder:
  - (A) `axisLabel` auf generischen Text aendern: `"Errors / interval"` und `"Log Lines / interval"` (kein `$` - Grafana interpoliert in axisLabel nicht)
  - (B) `axisLabel` auf `""` setzen (Grafana zeigt dann keinen Achsentitel)
  - (C) Bewusst beibehalten und als bekannte Limitierung dokumentieren (da Grafana `$interval` in `axisLabel` nicht interpoliert)
  - **Empfohlene Loesung: (A)** - Generischer Text der nicht irrefuehrt

### 2.4 Counter vs Gauge - Vorbestehende Dashboard-Fehler

- **Wo:** Dashboard-JSON Panel 22 (Zeile 860) und Panel 18 (Zeile 693)
- **Befund:** `pg_stat_database_deadlocks` ist ein PostgreSQL-**Counter** (kumulative Zahl seit DB-Start), wird aber als raw Gauge angezeigt. Der angezeigte Wert steigt monoton und wird nie sinken - ein Deadlock-Count von "5" bedeutet "5 seit PostgreSQL-Start", nicht "5 gerade aktiv". Aehnlich: `broker_publish_messages_dropped` ist vermutlich ein Counter.
- **Im Report:** Die Bestandsaufnahme (Zeile 54) markiert Panel 22 als "raw gauge", was fuer die Template-Variable-Analyse korrekt ist (keine rate()-Query = nicht betroffen von $interval). Aber der Report verpasst die Gelegenheit, diesen vorbestehenden Fehler zu dokumentieren.
- **Empfehlung:** Kein Handlungsbedarf fuer die Template-Variable-Implementierung. Aber fuer ein zukuenftiges Dashboard-Review: Panel 22 sollte `increase(pg_stat_database_deadlocks{datname="god_kaiser_db"}[$interval])` verwenden und Panel 18 `increase(broker_publish_messages_dropped{job="mqtt-broker"}[$interval])`.

### 5.1 Row collapsed/open - Implementierer-Warnung fehlt

- **Wo:** Dashboard-JSON Zeile 781 (Row 103) und Zeile 941 (Row 104)
- **Befund:** Rows 103 (Database) und 104 (Logs & Errors) sind `"collapsed": true`. In Grafana bedeutet das: die Panels (20-23 bzw. 24-26) sind **INNERHALB** des Row-Objekts in `panels[x].panels[]` verschachtelt, NICHT im Top-Level `panels[]` Array. Rows 100-102 sind `"collapsed": false` mit leerem `panels: []` - ihre Kinder stehen als Geschwister-Elemente im Top-Level Array.
- **Im Report:** Der Report erwaehnt die Panel-IDs und Zeilen korrekt, warnt den Implementierer aber nicht explizit vor dieser JSON-strukturellen Besonderheit. Ein Implementierer der naiv im Top-Level `panels[]` Array nach Panel 24 sucht, wird es dort nicht finden.
- **Empfehlung:** In Abschnitt E.2 einen Hinweis ergaenzen: "Panels 24-26 befinden sich INNERHALB des Row-Objekts 104 (collapsed), nicht im Top-Level panels-Array. Suche nach `\"id\": 24` innerhalb von `panels[last].panels[]`."

### 9.4 Overengineering - Unnoetige Felder in $interval Variable

- **Wo:** Report Zeile 296-298
- **Befund:** Die $interval Variable definiert `"auto_count": 10` und `"auto_min": "1m"` obwohl `"auto": false` gesetzt ist. Diese Felder werden nur ausgewertet wenn `auto: true` ist. Harmlos, aber unnoetig.
- **Empfehlung:** Felder entfernen oder belassen - kein funktionaler Einfluss. Empfehlung: belassen fuer den Fall dass spaeter `auto: true` gewuenscht wird.

### 9.5 Kontext-Verlust - TM-Befehl Abweichung (korrekt begruendet)

- **Wo:** TM-Befehl Zeile 12 vs Report Abschnitt C.2-C.3
- **Befund:** Der TM-Befehl sagt `$interval` fuer "alle rate()-Queries (Row 1-3)". Der Report wendet $interval nur auf Row 3 (Panel 19) und Row 5 (Panels 24, 25) an. Rows 1-2 werden korrekt ausgeschlossen da sie keine rate()/count_over_time() Queries enthalten.
- **Bewertung:** Die Abweichung ist **korrekt und gut begruendet**. Der TM hatte "Row 1-3" als Schaetzung angegeben, der Agent hat durch Analyse festgestellt dass nur Row 3 betroffen ist und hat Row 5 (Loki count_over_time) ergaenzt. Der Report dokumentiert beide Listen (betroffene und nicht-betroffene Panels mit Begruendung) vollstaendig.
- **Empfehlung:** Keine Aenderung noetig. Der Report ist hier besser als der TM-Befehl.

---

## Nicht betroffen (kurz)

- **1.1 Halluzinierte APIs:** Loki-Query-Format `{label, stream, type: 1}` ist korrektes Grafana 11.x internes Format fuer Label-Values-Queries. Datasource-UIDs `prometheus` und `loki` verifiziert gegen `datasources.yml`. PromQL/LogQL Syntax korrekt.
- **1.2 Veraltete Syntax:** `schemaVersion: 39` ist aktuell. Kein Legacy-String-Format fuer Loki-Variablen. Keine veralteten Datasource-Referenzen.
- **1.3 Falsche Verschachtelung:** `templating.list[]` Objekte korrekt strukturiert. Keine Properties auf falscher Ebene.
- **2.2 Off-by-One/Grenzwerte:** `allValue: ".*"` und `includeAll: true` korrekt. `compose_service=~".*"` matcht alle Werte einschliesslich Edge Cases.
- **2.3 Threshold-Logik:** Keine Thresholds in Template Variables. Dashboard-Thresholds nicht betroffen.
- **3.1 YAML-Indentation:** Kein YAML im Pruefumfang der Template-Variable-Aenderungen.
- **3.2 JSON:** Vorgeschlagener JSON-Block syntaktisch valide. Keine trailing commas, korrekte Verschachtelung.
- **3.3 Escape:** LogQL Regex `(?i)(error|exception|critical)` korrekt escaped in JSON.
- **4.1 Isolation statt Integration:** Alert Rules (`alert-rules.yml`) verwenden eigene Data-Pipelines (A->B->C) und werden von Template Variables nicht beeinflusst. Korrekt nicht erwaehnt.
- **4.3 Naming-Inkonsistenz:** Korrekte Projekt-Namen verwendet (`auto-one`, `god_kaiser_db`, `el-servador`).
- **5.2-5.5 Grafana-spezifisch:** Datasource-Referenzen pro Panel und pro Target korrekt. fieldConfig/options-Trennung nicht betroffen. Threshold-Format korrekt (`"value": null` als Basis).
- **6.x Docker/Infrastruktur:** Nicht im Pruefumfang.
- **7.x Python/FastAPI:** Nicht im Pruefumfang.
- **8.x ESP32:** Nicht im Pruefumfang.

---

## Verifizierte Korrektheit (Positiv-Befunde)

| Aspekt | Status | Detail |
|--------|--------|--------|
| Panel-IDs korrekt | OK | Alle 26+5 IDs stimmen mit Dashboard-JSON ueberein |
| Datasource-UIDs | OK | `prometheus` und `loki` verifiziert gegen datasources.yml |
| LogQL Syntax `=~` | OK | Stream-Selektoren unterstuetzen `=~` nativ |
| `$interval` Minimum 1m | OK | >= 4 * 15s scrape_interval = rate()-sicher |
| Default-Werte | OK | $service="All", $interval="5m" = identisches Verhalten zum IST |
| Keine ${DS_*} Platzhalter | OK | Direkte UID-Referenzen, Provisioning-kompatibel |
| Panel 4 korrekt ausgeschlossen | OK | Semantisch an "el-frontend" gebunden, fixes 5m sinnvoll |
| Panels 16/17 korrekt ausgeschlossen | OK | Stat-Panels brauchen fixes Fenster fuer stabilen Einzelwert |
| Live-Verifikation durchgefuehrt | OK | 4 API-Calls dokumentiert (Loki labels/values, Prometheus metrics/esp_id) |
| $esp_id korrekt nur dokumentiert | OK | Leeres Label-Array, keine Implementierung = korrekte Entscheidung |
| Alert Rules unbeeinflusst | OK | Eigene Pipelines, keine Template-Variable-Abhaengigkeit |

---

## Empfehlungen (Prioritaet)

1. **[WARNUNG] Achsenbeschriftungen aktualisieren** - Panels 24 und 25: `axisLabel` von "Errors / 5m" und "Log Lines / 5m" auf generischen Text aendern (z.B. "Errors / interval", "Log Lines / interval"), da Grafana `$interval` in `axisLabel` nicht interpoliert. Ohne diese Aenderung zeigt die Y-Achse irrefuehrende Informationen.

2. **[WARNUNG] Panel-Zaehler korrigieren** - Report Abschnitt F Ueberschrift: "(5 Panels)" auf "(4 Panels)" aendern. Kosmetisch, aber bei einem Implementierungsplan darf kein Zaehler falsch sein.

3. **[INFO] Collapsed-Row-Warnung ergaenzen** - In Abschnitt E.2 explizit hinweisen dass Panels 24-26 in der verschachtelten `panels[]`-Struktur von Row 104 liegen, nicht im Top-Level Array. Verhindert Implementierungsfehler.

4. **[INFO] Counter-als-Gauge vormerken** - Panel 22 (Deadlocks) und Panel 18 (Messages Dropped) fuer ein separates Dashboard-Review vormerken. Nicht Teil dieses Auftrags, aber ein vorbestehender KI-Fehler im Dashboard.

---

*KI-Audit gemaess ki-audit Skill. Keine Fixes durchgefuehrt (nur Report). Fixes nur auf ausdrueckliche User-Anfrage.*
