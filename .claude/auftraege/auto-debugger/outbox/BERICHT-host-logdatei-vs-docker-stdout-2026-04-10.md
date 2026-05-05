# Bericht: Abweichende Aktualität — Host-`god_kaiser.log` vs. Docker-Stdout

**Datum:** 2026-04-10  
**Scope:** `logging_config.setup_logging`, Bind-Mount `logs/server`, Uvicorn `--reload` / WatchFiles  
**Status:** Analyse

---

## 1. Symptom (Beobachtung)

- **`docker logs automationone-server`** zeigt **aktuelle** Ereignisse (Startup, Shutdown, WatchFiles-Reload, MQTT, HTTP).
- Die Datei **`logs/server/god_kaiser.log`** auf dem Host kann **hinterherhängen** oder **lange keine neuen JSON-Zeilen** enthalten, obwohl der Container „läuft“ und stdout voll ist.
- Zusätzlich: Beim **Reload** erscheinen in Docker oft **uvicorn/WatchFiles**-Warnungen, die in einer **alten** Datei-Generation **nicht** vorkommen.

---

## 2. Architektur: Zwei Handler, eine Wahrheit?

In `setup_logging` schreibt der Root-Logger **sowohl** in eine **Rotationsdatei** als auch nach **stdout**:

```160:193:El Servador/god_kaiser_server/src/core/logging_config.py
    try:
        file_handler = logging.handlers.RotatingFileHandler(
            filename=settings.logging.file_path,
            ...
        )
        ...
        root_logger.addHandler(file_handler)
    except (PermissionError, OSError) as e:
        ...  # Fallback stderr

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    ...
    root_logger.addHandler(console_handler)
```

- **Docker** zeigt typischerweise **stdout/stderr** des Prozesses (hier: Text-Console-Handler + uvicorn).
- Die **Datei** hängt vom **Pfad** `settings.logging.file_path` ab (z. B. `logs/god_kaiser.log` relativ zum Arbeitsverzeichnis im Container, oft gemountet nach `logs/server/god_kaiser.log`).

---

## 3. Ursachen für Divergenz (häufige Kombinationen)

### 3.1 Prozesswechsel bei `uvicorn --reload` (WatchFiles)

Bei Code-Änderungen startet uvicorn einen **neuen** Python-Prozess. Dabei gilt:

- **`setup_logging()`** wird erneut ausgeführt; `root_logger.handlers.clear()` ersetzt Handler.
- Ein **RotatingFileHandler** öffnet die Datei neu; in der Praxis können **Bind-Mounts / Windows / gleichzeitige Leser** dazu führen, dass der **Beobachter** auf dem Host **nicht** das sieht, was er bei „durchgehendem“ tail erwartet — oder es gibt eine **Pause** in den Schreibpfaden während Shutdown.

### 3.2 Unterschiedliche Formatter pro Sink

Im gleichen Setup:

- **Datei:** bei `LOG_FORMAT=json` → `JSONFormatter`
- **Konsole:** immer `TextFormatter` (lesbar)

Vergleiche „Zeile zu Zeile“ zwischen Datei und Docker sind **nicht** 1:1 dieselben Strings — inhaltlich ähnlich, Format unterschiedlich.

### 3.3 Zeitstempel

JSON-`timestamp` in der Datei folgt dem Formatter (`formatTime`). Docker-Textzeilen haben eigene `asctime`-Präfixe. **UTC vs. lokale Zeit** am Host erzeugt zusätzlich Schein-„Lücken“, wenn man Fenster falsch vergleicht.

### 3.4 Kurzer Shutdown-Block

Beim Reload-Shutdown werden oft letzte Logs **geschrieben**; der neue Prozess appeniert weiter. Ein Monitoring, das nur „mtime der Datei“ prüft, kann irreführend sein, wenn Rotation oder Buffer beteiligt sind.

---

## 4. Einordnung für Incident-Arbeit (auto-debugger)

| Risiko | Beschreibung |
|--------|----------------|
| **Falsche Korrelation** | Wenn nur die Host-Datei mit HTTP-`X-Request-ID` oder MQTT-CIDs verknüpft wird, **fehlen** Reload- und MQTT-Zeilen aus Docker. |
| **Falsche Ruhe** | „Datei hat seit Stunden keine ERRORs“ — kann **falsch** sein, wenn Docker ERRORs hat. |
| **Doppelte Operationalität** | Dokumentation (`LOG_LOCATIONS.md`) empfiehlt `tail` auf die Datei — für **Docker-Dev mit Reload** sollte **ergänzend** `docker logs` oder **Loki** genannt werden. |

---

## 5. Empfohlene Arbeitsregel (operativ)

1. **Ground Truth live:** `docker logs automationone-server` (Zeitfenster `--since`) oder **Loki** `compose_service="el-servador"`.  
2. **Host-Datei:** für **rotationssichere** JSON-Auswertung und Batch-Grep, aber **Fenster mit Docker abgleichen**.  
3. Bei **WatchFiles-Stürmen:** Incident nicht auf Datei-„Lücken“ stützen — Reload ist im stdout sichtbar.

---

## 6. Optionale technische Vertiefung (nicht umgesetzt)

- Explizit dokumentieren, ob im Container `LOG_FILE_PATH` auf den Mount zeigt und ob **ein** Prozess oder **Reload** die Datei truncated/rotiert.  
- Prüfen, ob `RotatingFileHandler` beim Reload auf Windows-Host-Mounts **Edge Cases** hat (Handle-Lecks, verzögertes Flush).

---

## 7. Referenzen

- `El Servador/god_kaiser_server/src/core/logging_config.py` (`setup_logging`)
- `.claude/reference/debugging/LOG_LOCATIONS.md` (Quick Reference — bei Dev-Reload Docker ergänzend nutzen)
