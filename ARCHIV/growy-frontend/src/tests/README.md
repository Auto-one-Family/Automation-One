# Test Suite - Growy Frontend

## 📋 Übersicht

Diese Test-Suite deckt die kritischen Funktionen des Growy Frontends ab, mit besonderem Fokus auf:

- **MQTT Store Funktionalität**
- **SafeMode-Verarbeitung**
- **UI-Komponenten-Verhalten**
- **Error Handling**

## 🧪 Test-Struktur

```
src/tests/
├── unit/
│   ├── mqtt.test.js           # MQTT Store Tests
│   └── SystemStateCard.test.js # UI Component Tests
└── README.md                  # Diese Datei
```

## 🚀 Tests ausführen

### Voraussetzungen

```bash
npm install vitest @vue/test-utils
```

### Alle Tests ausführen

```bash
npm run test
```

### Spezifische Tests

```bash
# Nur MQTT Tests
npm run test mqtt

# Nur Component Tests
npm run test SystemStateCard

# Mit Coverage
npm run test:coverage
```

### Watch Mode (Entwicklung)

```bash
npm run test:watch
```

## 📊 Test-Coverage

### MQTT Store (`mqtt.test.js`)

- ✅ `handleSafeModeMessage()` - Vollständige Payload-Verarbeitung
- ✅ `enter_reason` Handling - Mit und ohne Grund
- ✅ SafeMode Deaktivierung
- ✅ Error Handling für nicht-existente Devices
- ✅ State Management über mehrere Updates

### SystemStateCard (`SystemStateCard.test.js`)

- ✅ Tooltip-Anzeige bei `enter_reason` vorhanden
- ✅ Kein Tooltip ohne `enter_reason`
- ✅ Kein Tooltip bei deaktiviertem SafeMode
- ✅ Graceful Handling fehlender Devices
- ✅ Korrekte Status-Text-Anzeige

## 🔧 Test-Konfiguration

### Vitest Config

```javascript
// vite.config.js
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.js'],
  },
})
```

### Test Setup

```javascript
// src/tests/setup.js
import { vi } from 'vitest'

// Mock window.$snackbar
Object.defineProperty(window, '$snackbar', {
  value: {
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
    showInfo: vi.fn(),
  },
  writable: true,
})
```

## 📝 Test-Writing Guidelines

### 1. Test-Struktur

```javascript
describe('Component/Function Name', () => {
  beforeEach(() => {
    // Setup
  })

  it('should do something specific', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

### 2. Naming Convention

- **Test-Namen**: `should [expected behavior] when [condition]`
- **Describe-Blöcke**: Funktions-/Komponentenname
- **Datei-Namen**: `[component].test.js`

### 3. Mocking

```javascript
// Store Mocking
const createMockStore = (data) => ({
  espDevices: new Map([['test_esp', data]]),
  getKaiserId: vi.fn(() => 'default_kaiser'),
  // ... weitere Properties
})

// Component Mocking
const wrapper = mount(Component, {
  global: {
    provide: { mqttStore: createMockStore(mockData) },
    stubs: { 'v-card': true, 'v-chip': true },
  },
})
```

## 🎯 Test-Prioritäten

### Phase 1: Kritische Funktionen ✅

- [x] MQTT SafeMode-Verarbeitung
- [x] UI Tooltip-Funktionalität
- [x] Error Handling

### Phase 2: Erweiterte Tests (Geplant)

- [ ] GPIO-Konflikt-Verarbeitung
- [ ] Validierungsfehler-Handling
- [ ] Sensor-Daten-Verarbeitung
- [ ] E2E Tests für kritische User Flows

### Phase 3: Integration Tests (Optional)

- [ ] Store-Integration Tests
- [ ] Composable Tests
- [ ] Router Tests

## 🐛 Debugging Tests

### Test-Logs aktivieren

```bash
npm run test -- --reporter=verbose
```

### Einzelnen Test debuggen

```javascript
it.only('should debug this test', () => {
  // Nur dieser Test wird ausgeführt
})
```

### Test überspringen

```javascript
it.skip('should skip this test', () => {
  // Dieser Test wird übersprungen
})
```

## 📈 Coverage-Ziele

- **Statements**: > 80%
- **Branches**: > 70%
- **Functions**: > 85%
- **Lines**: > 80%

## 🔄 CI/CD Integration

Tests werden automatisch ausgeführt bei:

- **Pull Requests**: Alle Tests + Coverage
- **Main Branch**: Alle Tests + Coverage + E2E
- **Pre-commit**: Unit Tests

## 📚 Weitere Ressourcen

- [Vitest Dokumentation](https://vitest.dev/)
- [Vue Test Utils](https://test-utils.vuejs.org/)
- [Testing Best Practices](https://vuejs.org/guide/scaling-up/testing.html)
