# Context-Management-Strategie für Claude Code

> Optimale Kontext-Verwaltung für effiziente AI-gestützte Entwicklung

## 🎯 Ziel

Maximiere Claude's Verständnis des Projekts bei minimalem Token-Verbrauch durch intelligente Kontext-Priorisierung.

---

## 📊 Token-Budget

**Gesamt verfügbar:** ~200.000 Tokens pro Konversation
**Target-Nutzung:**
- Basis-Context: ≤ 15.000 Tokens (7.5%)
- Task-Context: ≤ 50.000 Tokens (25%)
- Reserve: 135.000 Tokens (67.5% für Antworten, Code-Generierung)

---

## 🔄 3-Schichten Context-Model

### Schicht 1: Permanenter Basis-Context (IMMER laden)

**Dateien (auto-included via settings.json):**
```
1. CLAUDE.md                              (~8.000 Tokens)
2. El Trabajante/platformio.ini          (~500 Tokens)
3. El Servador/pyproject.toml            (~200 Tokens)
────────────────────────────────────────────────────────
Total:                                    ~8.700 Tokens
```

**Warum diese Dateien:**
- `CLAUDE.md`: Komplette Projekt-Übersicht, Architektur, Befehle
- `platformio.ini`: Build-Konfiguration, Feature-Flags, Environments
- `pyproject.toml`: Python-Dependencies, Versions

**Ergebnis:** Claude versteht sofort:
- Was das Projekt ist
- Wie man es baut
- Welche Technologien verwendet werden
- Wo welche Komponenten liegen

---

### Schicht 2: Task-spezifischer Context (on-demand)

Lade zusätzlichen Context basierend auf Task-Typ:

#### 🔧 ESP32 Firmware Development

**Kern-Files:**
```
El Trabajante/src/core/application.h           (~500 Tokens)
El Trabajante/src/core/main_loop.h             (~400 Tokens)
El Trabajante/src/models/system_types.h        (~600 Tokens)
El Trabajante/src/config/feature_flags.h       (~300 Tokens)
```

**Plus relevante Service-Module:**
```
Sensor-Task:
  → services/sensor/sensor_manager.h
  → services/sensor/sensor_factory.h
  → services/sensor/pi_enhanced_processor.h

Actuator-Task:
  → services/actuator/actuator_manager.h
  → services/actuator/safety_controller.h

MQTT-Task:
  → services/communication/mqtt_client.h
  → models/mqtt_messages.h
  → docs/Mqtt_Protocoll.md
```

**Geschätzte Tokens:** 3.000-8.000 (je nach Task)

#### 🌐 Server Development (Python/FastAPI)

**Kern-Files:**
```
El Servador/god_kaiser_server/src/core/config.py
El Servador/god_kaiser_server/src/api/v1/*.py      (relevante Endpoints)
El Servador/god_kaiser_server/src/services/*.py    (relevante Services)
El Servador/god_kaiser_server/src/mqtt/handlers/*.py
```

**Plus Docs:**
```
El Servador/god_kaiser_server/docs/ARCHITECTURE.md
El Servador/god_kaiser_server/docs/API.md          (bei API-Changes)
```

**Geschätzte Tokens:** 5.000-12.000 (je nach Scope)

#### 🔗 MQTT/Protocol Development

**Files:**
```
El Trabajante/docs/Mqtt_Protocoll.md              (~4.000 Tokens)
El Trabajante/docs/MQTT_CLIENT_API.md             (~2.000 Tokens)
El Servador/god_kaiser_server/docs/MQTT_TOPICS.md (~3.000 Tokens)
El Trabajante/src/services/communication/mqtt_client.h
El Servador/god_kaiser_server/src/mqtt/client.py
```

**Geschätzte Tokens:** 10.000-15.000

#### 🧪 Testing/Quality Assurance

**Files:**
```
El Trabajante/test/                               (relevante Tests)
El Servador/god_kaiser_server/tests/              (relevante Tests)
El Servador/god_kaiser_server/docs/TESTING.md     (~3.000 Tokens)
```

**Geschätzte Tokens:** 5.000-10.000

#### 📚 Documentation/Planning

**Files:**
```
El Trabajante/docs/Roadmap.md                     (~20.000 Tokens!)
El Trabajante/docs/System_Overview.md             (~30.000 Tokens!)
El Trabajante/docs/system-flows/*.md              (~je 2.000 Tokens)
El Trabajante/docs/PHASE_*_STATUS.md
```

**⚠️ Wichtig:** Diese Docs sind GROSS!
- System_Overview.md: 34.000 Tokens (zu groß!)
- Roadmap.md: 26.000 Tokens (zu groß!)

**Strategie:**
- Nutze `Read` mit `offset` und `limit` für große Docs
- Oder nutze `Grep` für spezifische Sections
- CLAUDE.md fasst wichtigste Infos zusammen

**Geschätzte Tokens:** 5.000-15.000 (mit Einschränkungen)

---

### Schicht 3: Deep-Dive Context (selektiv)

Nur bei sehr spezifischen Tasks laden:

#### Provisioning/Dynamic Zones
```
El Trabajante/docs/Dynamic Zones and Provisioning/
  ├── PROVISIONING_DESIGN.md
  ├── ANALYSIS.md
  ├── DYNAMIC_ZONES_IMPLEMENTATION.md
  └── INTEGRATION_GUIDE.md
```

**Tokens:** ~8.000-12.000

#### Health Monitoring (Phase 7)
```
El Trabajante/src/error_handling/health_monitor.h
El Trabajante/src/error_handling/circuit_breaker.h
El Trabajante/src/error_handling/mqtt_connection_manager.h
El Trabajante/docs/PHASE_7_IMPLEMENTATION_STATUS.md
```

**Tokens:** ~5.000-8.000

#### Server Architecture Deep-Dive
```
El Servador/god_kaiser_server/docs/ARCHITECTURE.md
El Servador/god_kaiser_server/docs/SECURITY.md
El Servador/god_kaiser_server/docs/DEPLOYMENT.md
```

**Tokens:** ~8.000-12.000

---

## 🎯 Context-Auswahl-Matrix

| Task-Typ | Basis | ESP32 | Server | MQTT | Tests | Docs | Total Est. |
|----------|-------|-------|--------|------|-------|------|------------|
| **ESP Sensor hinzufügen** | ✅ | ✅✅ | ❌ | ✅ | ❌ | ❌ | ~15K |
| **Server Endpoint** | ✅ | ❌ | ✅✅ | ✅ | ❌ | ❌ | ~18K |
| **MQTT Protocol ändern** | ✅ | ✅ | ✅ | ✅✅ | ❌ | ❌ | ~25K |
| **Bug-Fix (ESP)** | ✅ | ✅✅ | ❌ | ❌ | ✅ | ✅ | ~20K |
| **Bug-Fix (Server)** | ✅ | ❌ | ✅✅ | ❌ | ✅ | ✅ | ~22K |
| **Feature-Planning** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅✅ | ~20K |
| **Testing-Setup** | ✅ | ✅ | ✅ | ❌ | ✅✅ | ✅ | ~30K |
| **Full Refactoring** | ✅ | ✅✅ | ✅✅ | ✅ | ✅ | ✅✅ | ~50K |

**Legende:**
- ✅ = Light Context (1-2 Dateien)
- ✅✅ = Heavy Context (5-10+ Dateien)

---

## 🚀 Best Practices

### 1. Lazy Loading
**Nicht sofort alles laden!**
```
❌ FALSCH:
"Lade mir alle Docs + alle .h Dateien + alle .py Dateien"
→ Überschreitet Token-Limit!

✅ RICHTIG:
"Ich will Sensor X hinzufügen"
→ Claude lädt nur: CLAUDE.md + sensor_manager.h + sensor_factory.h + docs/Mqtt_Protocoll.md
```

### 2. Incremental Context
**Erst Overview, dann Details**
```
1. Start: CLAUDE.md lesen
2. Task verstehen: Welche Komponenten betroffen?
3. Kern-Files laden (Manager, Factory)
4. Bei Bedarf: Spezifische Driver/Handlers
5. Nur wenn nötig: Große Docs mit Grep/Offset
```

### 3. Context-Refresh bei Scope-Change
```
Beispiel: Erst ESP32-Task, dann Server-Task
→ Alter ESP32-Context kann "vergessen" werden
→ Neuer Server-Context wird geladen
→ Basis-Context bleibt (CLAUDE.md)
```

### 4. Große Dateien mit Grep durchsuchen
```bash
# Statt ganzen Roadmap.md zu lesen:
grep -A 10 "Phase 8" El Trabajante/docs/Roadmap.md

# Statt ganzen System_Overview.md:
grep -A 20 "Sensor-Verarbeitung" El Trabajante/docs/System_Overview.md
```

### 5. System Flows gezielt nutzen
```
Sensor-Task → docs/system-flows/02-sensor-reading-flow.md
Actuator-Task → docs/system-flows/03-actuator-command-flow.md
Boot-Issue → docs/system-flows/01-boot-sequence.md
Error-Handling → docs/system-flows/07-error-recovery-flow.md
```

---

## 📋 Context-Loading-Checkliste

**Vor jedem Task:**
1. ✅ Ist CLAUDE.md geladen? (Auto via settings.json)
2. ✅ Welcher Task-Typ? (siehe Matrix oben)
3. ✅ Minimaler Context für Task identifiziert?
4. ✅ Token-Budget gecheckt? (≤50K für Task-Context)
5. ✅ Große Docs mit Grep/Offset geplant?

---

## 🎯 Optimale Workflows

### Workflow 1: Neuer Sensor (ESP32)
```
1. CLAUDE.md (auto-loaded)
2. platformio.ini (auto-loaded)
3. Read: src/services/sensor/sensor_manager.h
4. Read: src/services/sensor/sensor_factory.h
5. Grep: docs/Mqtt_Protocoll.md für Sensor-Topics
6. Implementierung
7. Read: relevanter System Flow (02-sensor-reading-flow.md)
────────────────────────────────────────────────
Tokens: ~12.000
```

### Workflow 2: Server Endpoint (Python)
```
1. CLAUDE.md (auto-loaded)
2. pyproject.toml (auto-loaded)
3. Read: src/api/v1/ (relevanter Router)
4. Read: src/services/ (relevanter Service)
5. Read: src/schemas/ (relevante DTOs)
6. Grep: docs/API.md für Endpoint-Konventionen
────────────────────────────────────────────────
Tokens: ~15.000
```

### Workflow 3: MQTT Protocol Update
```
1. CLAUDE.md (auto-loaded)
2. Read: docs/Mqtt_Protocoll.md (komplett oder Grep)
3. Read: El Trabajante/src/services/communication/mqtt_client.h
4. Read: El Servador/src/mqtt/client.py
5. Read: El Servador/src/mqtt/handlers/ (relevante Handler)
6. Beide Seiten synchron ändern
────────────────────────────────────────────────
Tokens: ~18.000
```

---

## 🔍 Debugging: "Claude versteht Projekt nicht"

**Symptom:** Claude fragt nach Infos, die in CLAUDE.md stehen

**Lösungen:**
1. Prüfe ob `settings.json` korrekt ist
2. Prüfe ob `alwaysInclude` CLAUDE.md enthält
3. Explizit erinnern: "Siehe CLAUDE.md für Projekt-Übersicht"
4. Bei Session-Start: `/session-start` Hook zeigt Projekt-Info

---

## 📈 Token-Tracking

**Faustregel:**
- 1 Token ≈ 4 Zeichen (Englisch)
- 1 Token ≈ 2-3 Zeichen (Code)
- Kleine .h Datei: ~500 Tokens
- Mittlere .py Datei: ~1.000 Tokens
- Große .md Datei: 5.000-30.000 Tokens!

**Tools:**
- Claude zeigt Token-Count nach jeder Antwort
- Bei >100K: Context reduzieren

---

## ✨ Fazit

**Mit dieser Strategie:**
- ✅ Claude versteht Projekt sofort (CLAUDE.md)
- ✅ Minimaler Token-Verbrauch (Lazy Loading)
- ✅ Maximale Effizienz (Task-spezifisch)
- ✅ Keine Token-Limit-Überschreitungen
- ✅ Schnellere Entwicklung (weniger Context-Loading)

**Remember:**
> "Weniger ist mehr" - Lade nur was du brauchst, wenn du es brauchst!
