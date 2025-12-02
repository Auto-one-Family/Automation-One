# Slash Commands - AutomationOne Framework

Dieses Verzeichnis enthält alle Slash Commands für Claude Code, organisiert nach System-Komponenten.

## Struktur

```
commands/
├── esp32/          # ESP32 Firmware Commands
├── server/         # God-Kaiser Server Commands
└── integration/    # System-übergreifende Commands
```

## 📁 ESP32 Commands (`esp32/`)

ESP32 Firmware-spezifische Build- und Test-Commands.

| Command | Datei | Beschreibung |
|---------|-------|--------------|
| `/esp-build` | [build.md](esp32/build.md) | Build ESP32 Firmware für XIAO oder ESP32 Dev |
| `/esp-test` | [test.md](esp32/test.md) | Führe ESP32 Tests aus (Server-orchestriert via pytest) |
| `/esp-test-category` | [test-category.md](esp32/test-category.md) | Legacy PlatformIO Tests (archiviert) |

**Dokumentation:**
- ESP32 Firmware: [El Trabajante/CLAUDE.md](../../CLAUDE.md)
- API Reference: `El Trabajante/docs/API_REFERENCE.md`
- System Flows: `El Trabajante/docs/system-flows/`

---

## 🖥️ Server Commands (`server/`)

God-Kaiser Server-spezifische Test- und Deployment-Commands.

| Command | Datei | Beschreibung |
|---------|-------|--------------|
| `/server-test` | [test.md](server/test.md) | Führe El Servador Python Tests aus |

**Dokumentation:**
- Server Referenz: [.claude/CLAUDE_SERVER.md](../CLAUDE_SERVER.md)
- ESP32 Testing: `El Servador/docs/ESP32_TESTING.md`
- MQTT Protocol: `El Trabajante/docs/Mqtt_Protocoll.md`

---

## 🔗 Integration Commands (`integration/`)

System-übergreifende Commands für End-to-End-Tests und Validierung.

| Command | Datei | Beschreibung |
|---------|-------|--------------|
| `/full-test` | [full-test.md](integration/full-test.md) | **EMPFOHLEN:** Kompletter Test-Workflow für ESP32 + Server |

**Dokumentation:**
- Test Workflow: [.claude/TEST_WORKFLOW.md](../TEST_WORKFLOW.md)
- Workflow Patterns: [.claude/WORKFLOW_PATTERNS.md](../WORKFLOW_PATTERNS.md)

---

## Verwendung

### Slash Command ausführen

```bash
/esp-build          # Build ESP32 Firmware
/esp-test           # ESP32 Tests (Server-orchestriert)
/server-test        # Server Python Tests
/full-test          # Kompletter Test-Workflow (EMPFOHLEN)
```

### Empfohlener Workflow

**Vor jedem Commit:**
```bash
/full-test
# Bei allen Tests grün: Commit OK
```

**Nach ESP32-Code-Änderungen:**
```bash
/esp-build          # Firmware kompilieren
/esp-test           # ESP32 Tests ausführen
```

**Nach Server-Code-Änderungen:**
```bash
/server-test        # Server Tests ausführen
/esp-test           # ESP32-Integration prüfen
```

---

## Neue Commands hinzufügen

### 1. Command-Datei erstellen

Erstelle eine neue Markdown-Datei im passenden Unterordner:

```markdown
---
description: Kurze Beschreibung des Commands
---

# Command-Name

## Aufgabe

1. Was tut der Command?
2. Welche Parameter?
3. Was wird zurückgegeben?

## Beispiele

\```bash
command-example
\```

## Bei Fehlern

- Troubleshooting-Hinweise
```

### 2. Command registrieren

Commands werden automatisch erkannt, wenn sie in `.claude/commands/` liegen.

### 3. Dokumentation aktualisieren

- Füge Command zu dieser README hinzu
- Aktualisiere verwandte Dokumentation

---

## Related Documentation

### Hauptdokumentation

- **ESP32 Firmware:** [CLAUDE.md](../../CLAUDE.md) - Vollständige ESP32-Dokumentation
- **God-Kaiser Server:** [.claude/CLAUDE_SERVER.md](../CLAUDE_SERVER.md) - Server-Referenz
- **Test Workflow:** [.claude/TEST_WORKFLOW.md](../TEST_WORKFLOW.md) - Test-Strategie

### Weitere Ressourcen

- **Architektur:** [.claude/ARCHITECTURE_DEPENDENCIES.md](../ARCHITECTURE_DEPENDENCIES.md)
- **Workflow Patterns:** [.claude/WORKFLOW_PATTERNS.md](../WORKFLOW_PATTERNS.md)
- **MQTT Protocol:** `El Trabajante/docs/Mqtt_Protocoll.md`

---

**Letzte Aktualisierung:** 2025-01
**Version:** 2.0 (Reorganisiert nach System-Komponenten)
