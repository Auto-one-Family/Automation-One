# AutomationOne Frontend

> **Vuetify 3 Frontend für das AutomationOne Framework**  
> **Status:** 📋 In Entwicklung

## Übersicht

Modernes, responsives Frontend für die Steuerung und Überwachung von ESP32-basierten IoT-Geräten.

## Technologie-Stack

- **Vue 3** (Composition API)
- **Vuetify 3** (Material Design)
- **Pinia** (State Management)
- **Vite** (Build Tool)
- **Axios** (REST API Client)
- **WebSocket** (Real-time Updates)
- **Chart.js** (Datenvisualisierung)

## Projekt-Setup

```bash
# Dependencies installieren
npm install

# Development-Server starten
npm run dev

# Production-Build
npm run build

# Preview Production-Build
npm run preview
```

## Projekt-Struktur

Siehe `FRONTEND_PLAN.md` für detaillierte Dokumentation.

## Entwicklung

### Phasen

1. **Phase 1:** Grundlagen (Authentifizierung, API-Setup)
2. **Phase 2:** ESP-Verwaltung
3. **Phase 3:** Sensor-Management
4. **Phase 4:** Actuator-Steuerung
5. **Phase 5:** Dashboard
6. **Phase 6:** Logic Builder
7. **Phase 7:** Zone-Verwaltung
8. **Phase 8:** Settings & Polish

### API-Integration

- **REST API:** `http://localhost:8000/api/v1/`
- **WebSocket:** `ws://localhost:8000/ws/realtime`

## Dokumentation

- **Vollständiger Plan:** `../FRONTEND_PLAN.md`
- **Backend-Doku:** `../Hierarchie.md`
- **ESP32-Doku:** `../.claude/CLAUDE.md`
- **Server-Doku:** `../.claude/CLAUDE_SERVER.md`

