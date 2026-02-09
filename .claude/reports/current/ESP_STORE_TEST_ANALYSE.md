# esp.ts Store Tests – Analyse & Implementierungsplan

**Datum**: 2026-02-06
**Agent**: Frontend-Test-Analyst
**Modus**: PLAN MODE (Readonly)

---

## Executive Summary

Der `esp.ts` Pinia Store ist mit **2512 Zeilen** und **~100 KB** die größte und komplexeste Komponente im Frontend. Er verwaltet:
- **9 State-Properties** (devices, pendingDevices, gpioStatus, oneWireScan, etc.)
- **10 Getters** (computed values für UI)
- **35+ Actions** (API-Calls, State-Mutationen, WebSocket-Handler)
- **20+ WebSocket-Event-Handler** (Live-Updates von ESP32/Server)

Geschätzter Test-Aufwand: **~800-1000 LOC**, **45-55 Tests**

---

## 1. Store-Struktur

### 1.1 State (Zeilen 85-129)

| Property | Typ | Default | Beschreibung |
|----------|-----|---------|--------------|
| `devices` | `ref<ESPDevice[]>` | `[]` | Alle geladenen ESP-Geräte (Mock + Real) |
| `selectedDeviceId` | `ref<string \| null>` | `null` | Aktuell ausgewähltes Gerät |
| `isLoading` | `ref<boolean>` | `false` | Lade-Indikator für API-Calls |
| `error` | `ref<string \| null>` | `null` | Letzte Fehlermeldung |
| `gpioStatusMap` | `ref<Map<string, GpioStatusResponse>>` | `new Map()` | GPIO-Status pro ESP |
| `gpioStatusLoading` | `ref<Map<string, boolean>>` | `new Map()` | GPIO-Lade-Status pro ESP |
| `pendingDevices` | `ref<PendingESPDevice[]>` | `[]` | Geräte die auf Genehmigung warten |
| `isPendingLoading` | `ref<boolean>` | `false` | Lade-Indikator für Pending-Devices |
| `oneWireScanStates` | `ref<Record<string, OneWireScanState>>` | `{}` | OneWire-Scan-Status pro ESP |

### 1.2 Getters (Zeilen 131-173)

| Name | Rückgabetyp | Komplexität | Test-Priorität |
|------|-------------|-------------|----------------|
| `selectedDevice` | `ESPDevice \| null` | Mittel (find mit OR) | P2 |
| `deviceCount` | `number` | Trivial | P3 |
| `onlineDevices` | `ESPDevice[]` | Mittel (filter mit OR) | P2 |
| `offlineDevices` | `ESPDevice[]` | Mittel (filter mit OR) | P2 |
| `mockDevices` | `ESPDevice[]` | Mittel (filter + isMockEsp) | P2 |
| `realDevices` | `ESPDevice[]` | Mittel (filter + !isMockEsp) | P2 |
| `devicesByZone` | `(zoneId: string) => ESPDevice[]` | Mittel (parametrisch) | P2 |
| `masterZoneDevices` | `ESPDevice[]` | Einfach (filter) | P3 |
| `pendingCount` | `number` | Trivial | P3 |
| `isMock` | `(deviceId: string) => boolean` | Einfach (delegate) | P3 |

### 1.3 Actions (Zeilen 614-2509)

#### API Actions (kritisch - Prio 1)

| Name | Parameter | API-Call | WS-Event | Test-Priorität |
|------|-----------|----------|----------|----------------|
| `fetchAll` | `params?: {...}` | `espApi.listDevices` | - | P1 |
| `fetchDevice` | `deviceId: string` | `espApi.getDevice` | - | P1 |
| `createDevice` | `config: ESPDeviceCreate \| MockESPCreate` | `espApi.createDevice` | - | P1 |
| `updateDevice` | `deviceId, update` | `espApi.updateDevice` | - | P1 |
| `deleteDevice` | `deviceId: string` | `espApi.deleteDevice` | - | P1 |
| `fetchPendingDevices` | - | `espApi.getPendingDevices` | - | P1 |
| `approveDevice` | `deviceId, data?` | `espApi.approveDevice` | - | P1 |
| `rejectDevice` | `deviceId, reason` | `espApi.rejectDevice` | - | P1 |
| `fetchGpioStatus` | `espId: string` | `espApi.getGpioStatus` | - | P2 |
| `sendActuatorCommand` | `deviceId, gpio, command, value?` | `actuatorsApi.sendCommand` / `debugApi` | - | P1 |
| `emergencyStopAll` | `reason?: string` | `actuatorsApi.emergencyStop` | - | P1 |

#### Mock-ESP Actions (Prio 2)

| Name | Parameter | API-Call | Test-Priorität |
|------|-----------|----------|----------------|
| `triggerHeartbeat` | `deviceId` | `debugApi.triggerHeartbeat` | P2 |
| `setState` | `deviceId, state, reason?` | `debugApi.setState` | P2 |
| `setAutoHeartbeat` | `deviceId, enabled, interval` | `debugApi.setAutoHeartbeat` | P2 |
| `addSensor` | `deviceId, config` | `debugApi.addSensor` / `sensorsApi` | P2 |
| `updateSensorConfig` | `deviceId, gpio, config` | `debugApi` / `sensorsApi` | P2 |
| `setSensorValue` | `deviceId, gpio, rawValue, quality?, publish?` | `debugApi.setSensorValue` | P2 |
| `removeSensor` | `deviceId, gpio` | `debugApi.removeSensor` | P2 |
| `addActuator` | `deviceId, config` | `debugApi.addActuator` | P2 |
| `setActuatorState` | `deviceId, gpio, state, pwmValue?` | `debugApi.setActuatorState` | P2 |
| `emergencyStop` | `deviceId, reason?` | `debugApi.emergencyStop` | P2 |
| `clearEmergency` | `deviceId` | `debugApi.clearEmergency` | P2 |

#### OneWire Actions (Prio 3)

| Name | Parameter | Test-Priorität |
|------|-----------|----------------|
| `scanOneWireBus` | `espId, pin` | P3 |
| `clearOneWireScan` | `espId` | P3 |
| `toggleRomSelection` | `espId, romCode` | P3 |
| `selectAllOneWireDevices` | `espId` | P3 |
| `deselectAllOneWireDevices` | `espId` | P3 |
| `selectSpecificRomCodes` | `espId, romCodes[]` | P3 |

#### Utility Actions (Prio 3)

| Name | Parameter | Test-Priorität |
|------|-----------|----------------|
| `selectDevice` | `deviceId \| null` | P3 |
| `clearError` | - | P3 |
| `updateDeviceInList` | `device` | P3 |
| `updateDeviceZone` | `deviceId, zoneData` | P3 |
| `initWebSocket` | - | P2 |
| `cleanupWebSocket` | - | P2 |

### 1.4 WebSocket-Handler (Zeilen 1313-2418)

| Event | Handler-Funktion | State-Mutation | Zeilen | Test-Priorität |
|-------|------------------|----------------|--------|----------------|
| `esp_health` | `handleEspHealth` | devices[].status, heap, rssi, uptime | 1327-1424 | P1 |
| `sensor_data` | `handleSensorData` | devices[].sensors[].raw_value, quality | 1482-1640 | P1 |
| `actuator_status` | `handleActuatorStatus` | devices[].actuators[].state, pwm_value | 1664-1688 | P1 |
| `actuator_alert` | `handleActuatorAlert` | devices[].actuators[].emergency_stopped | 1430-1471 | P1 |
| `config_response` | `handleConfigResponse` | Toast, fetchGpioStatus | 1699-1779 | P2 |
| `zone_assignment` | `handleZoneAssignment` | devices[].zone_id, zone_name | 1795-1827 | P2 |
| `sensor_health` | `handleSensorHealth` | devices[].sensors[].is_stale | 1936-1994 | P2 |
| `device_discovered` | `handleDeviceDiscovered` | pendingDevices.push() | 1837-1866 | P1 |
| `device_approved` | `handleDeviceApproved` | pendingDevices.filter() | 1873-1892 | P1 |
| `device_rejected` | `handleDeviceRejected` | pendingDevices.filter() | 1898-1914 | P2 |
| `actuator_response` | `handleActuatorResponse` | Toast | 2005-2027 | P2 |
| `actuator_command` | `handleActuatorCommand` | Toast | 2124-2133 | P3 |
| `actuator_command_failed` | `handleActuatorCommandFailed` | Toast | 2140-2153 | P2 |
| `config_published` | `handleConfigPublished` | Toast | 2163-2173 | P3 |
| `config_failed` | `handleConfigFailed` | Toast | 2179-2191 | P2 |
| `device_rediscovered` | `handleDeviceRediscovered` | devices[].status | 2201-2216 | P2 |
| `notification` | `handleNotification` | Toast | 2033-2042 | P3 |
| `error_event` | `handleErrorEvent` | Toast | 2048-2102 | P2 |
| `system_event` | `handleSystemEvent` | Toast | 2108-2114 | P3 |
| `sequence_*` | `handleSequence*` | Toast | 2225-2275 | P3 |

---

## 2. Bestehende Test-Patterns

### 2.1 Store-Test-Vorlage (aus auth.test.ts)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useEspStore } from '@/stores/esp'
import { server } from '../../mocks/server'
import { http, HttpResponse } from 'msw'
import { mockESPDevice } from '../../mocks/handlers'

// Mock WebSocket Service
vi.mock('@/services/websocket', () => ({
  websocketService: {
    disconnect: vi.fn(),
    connect: vi.fn(),
    isConnected: vi.fn(() => false),
    on: vi.fn(() => () => {}),  // Returns unsubscribe function
    onConnect: vi.fn(() => () => {}),
  }
}))

// Mock useWebSocket composable
vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    on: vi.fn(() => () => {}),
    disconnect: vi.fn(),
    connect: vi.fn(),
    status: 'connected',
  }))
}))

// Mock useToast composable
vi.mock('@/composables/useToast', () => ({
  useToast: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
  }))
}))

describe('ESP Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  // Tests here...
})
```

### 2.2 Mock-Inventar

| Mock | Vorhanden | Pfad | Erweiterung nötig |
|------|-----------|------|-------------------|
| MSW Server | ✅ | `tests/mocks/server.ts` | - |
| Auth Handlers | ✅ | `tests/mocks/handlers.ts` | - |
| ESP Device Handlers | ⚠️ Teilweise | `tests/mocks/handlers.ts` | Pending, GPIO, OneWire |
| Sensor Handlers | ⚠️ Minimal | `tests/mocks/handlers.ts` | createOrUpdate, history |
| Actuator Handlers | ❌ | - | Komplett neu |
| Debug/Mock-ESP Handlers | ⚠️ Teilweise | `tests/mocks/handlers.ts` | addSensor, setState, etc. |
| Mock WebSocket | ✅ | `tests/mocks/websocket.ts` | - |
| WebSocket Test Helpers | ✅ | `tests/mocks/websocket.ts` | - |

### 2.3 MSW-Handler-Abdeckung

| Endpoint | Handler existiert? | Response-Format |
|----------|-------------------|-----------------|
| `GET /esp/devices` | ✅ | `{ data: ESPDevice[], total: number }` |
| `GET /esp/devices/pending` | ✅ | `{ data: [], total: 0 }` |
| `GET /esp/devices/:id` | ✅ | `ESPDevice` |
| `PATCH /esp/devices/:id` | ✅ | `ESPDevice` |
| `DELETE /esp/devices/:id` | ✅ | `{ message: string }` |
| `POST /esp/devices/:id/approve` | ❌ | Benötigt |
| `POST /esp/devices/:id/reject` | ❌ | Benötigt |
| `GET /esp/devices/:id/gpio-status` | ❌ | Benötigt |
| `POST /debug/mock-esp` | ✅ | `{ esp_id, status, message }` |
| `DELETE /debug/mock-esp/:id` | ✅ | `{ message }` |
| `GET /debug/mock-esp` | ❌ | Benötigt (listMockEsps) |
| `GET /debug/mock-esp/:id` | ❌ | Benötigt (getMockEsp) |
| `POST /debug/mock-esp/:id/sensors` | ❌ | Benötigt |
| `DELETE /debug/mock-esp/:id/sensors/:gpio` | ❌ | Benötigt |
| `POST /debug/mock-esp/:id/actuators` | ❌ | Benötigt |
| `POST /debug/mock-esp/:id/state` | ❌ | Benötigt |
| `POST /debug/mock-esp/:id/heartbeat` | ❌ | Benötigt |
| `PUT /sensors/:espId/:gpio` | ❌ | Benötigt |
| `POST /actuators/:espId/:gpio/command` | ❌ | Benötigt |
| `POST /actuators/emergency-stop` | ❌ | Benötigt |
| `POST /onewire/:espId/scan` | ❌ | Benötigt |

---

## 3. Typ-Map für Test-Daten

### Mock ESP Device

```typescript
const mockESPDevice: ESPDevice = {
  id: 'uuid-1234-5678',
  device_id: 'ESP_TEST_001',
  esp_id: 'ESP_TEST_001',
  name: 'Test ESP',
  zone_id: 'zone_1',
  zone_name: 'Test Zone',
  master_zone_id: null,
  is_zone_master: false,
  ip_address: '192.168.1.100',
  mac_address: 'AA:BB:CC:DD:EE:FF',
  firmware_version: '1.0.0',
  hardware_type: 'ESP32_WROOM',
  status: 'online',
  last_seen: new Date().toISOString(),
  system_state: 'OPERATIONAL',
  sensors: [],
  actuators: [],
  auto_heartbeat: true,
  heap_free: 128000,
  wifi_rssi: -65,
  uptime: 3600,
  last_heartbeat: new Date().toISOString(),
  connected: true,
  sensor_count: 0,
  actuator_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}
```

### Mock Sensor

```typescript
const mockSensor: MockSensor = {
  gpio: 4,
  sensor_type: 'ds18b20',
  name: 'Temperature Sensor',
  subzone_id: null,
  raw_value: 23.5,
  processed_value: 23.5,
  unit: '°C',
  quality: 'excellent',
  raw_mode: true,
  last_read: new Date().toISOString(),
  operating_mode: 'continuous',
  timeout_seconds: 180,
  is_stale: false,
  stale_reason: undefined,
  is_multi_value: false,
  device_type: null,
  multi_values: null,
}
```

### Mock Actuator

```typescript
const mockActuator: MockActuator = {
  gpio: 16,
  actuator_type: 'relay',
  name: 'Pump Relay',
  state: false,
  pwm_value: 0,
  emergency_stopped: false,
  last_command: null,
}
```

### Mock Pending Device

```typescript
const mockPendingDevice: PendingESPDevice = {
  device_id: 'ESP_PENDING_001',
  discovered_at: new Date().toISOString(),
  last_seen: new Date().toISOString(),
  ip_address: '192.168.1.101',
  zone_id: null,
  heap_free: 120000,
  wifi_rssi: -70,
  sensor_count: 0,
  actuator_count: 0,
  heartbeat_count: 1,
  hardware_type: 'ESP32_WROOM',
}
```

### Mock GPIO Status

```typescript
const mockGpioStatus: GpioStatusResponse = {
  available: [5, 12, 13, 14, 15, 17, 18, 19, 23, 25, 26, 27, 32, 33],
  reserved: [
    { gpio: 4, owner: 'sensor', component: 'ds18b20', name: 'Temperature', id: 'uuid', source: 'database' },
    { gpio: 16, owner: 'actuator', component: 'relay', name: 'Pump', id: 'uuid', source: 'database' },
  ],
  system: [0, 1, 2, 3, 6, 7, 8, 9, 10, 11, 21, 22],
  total_available: 14,
  total_reserved: 2,
  total_system: 12,
  last_esp_report: new Date().toISOString(),
}
```

### Mock WebSocket Events

```typescript
// esp_health Event
const mockEspHealthEvent = {
  type: 'esp_health',
  data: {
    esp_id: 'ESP_TEST_001',
    status: 'online',
    heap_free: 128000,
    wifi_rssi: -65,
    uptime: 3600,
    sensor_count: 1,
    actuator_count: 1,
    timestamp: Date.now(),
  },
  timestamp: new Date().toISOString(),
}

// sensor_data Event
const mockSensorDataEvent = {
  type: 'sensor_data',
  data: {
    esp_id: 'ESP_TEST_001',
    gpio: 4,
    sensor_type: 'ds18b20',
    value: 24.5,
    unit: '°C',
    quality: 'excellent',
    timestamp: Math.floor(Date.now() / 1000),
  },
  timestamp: new Date().toISOString(),
}

// device_discovered Event
const mockDeviceDiscoveredEvent = {
  type: 'device_discovered',
  data: {
    device_id: 'ESP_NEW_001',
    discovered_at: new Date().toISOString(),
    ip_address: '192.168.1.102',
    heap_free: 125000,
    wifi_rssi: -68,
    sensor_count: 0,
    actuator_count: 0,
    hardware_type: 'ESP32_WROOM',
  },
  timestamp: new Date().toISOString(),
}

// actuator_alert Event
const mockActuatorAlertEvent = {
  type: 'actuator_alert',
  data: {
    esp_id: 'ESP_TEST_001',
    gpio: 16,
    alert_type: 'emergency_stop',
    reason: 'manual',
    timestamp: Date.now(),
  },
  timestamp: new Date().toISOString(),
}
```

---

## 4. Test-Plan (Priorisiert)

### Priorität 1: State-Mutationen & API-Integration (~20 Tests)

```typescript
describe('ESP Store - API Actions', () => {
  describe('fetchAll', () => {
    it('should load devices and set devices array')
    it('should set isLoading during fetch')
    it('should set error on fetch failure')
    it('should deduplicate devices by device_id')
    it('should pass filter params to API')
  })

  describe('fetchDevice', () => {
    it('should fetch single device and update in list')
    it('should add device to list if not exists')
    it('should set error on 404')
  })

  describe('createDevice', () => {
    it('should create device and add to list')
    it('should prevent duplicates when creating')
    it('should set error on validation failure')
  })

  describe('updateDevice', () => {
    it('should update device in list')
    it('should re-fetch mock device for complete data')
    it('should handle 404 for orphaned mock ESPs')
  })

  describe('deleteDevice', () => {
    it('should remove device from list')
    it('should clear selectedDeviceId if deleted device was selected')
    it('should handle 404 gracefully (device already gone)')
  })

  describe('sendActuatorCommand', () => {
    it('should call actuatorsApi for real ESP')
    it('should call debugApi for mock ESP')
    it('should show toast on error')
  })

  describe('emergencyStopAll', () => {
    it('should call actuatorsApi.emergencyStop')
    it('should show warning toast on success')
    it('should show error toast on failure')
  })
})

describe('ESP Store - Pending Devices', () => {
  describe('fetchPendingDevices', () => {
    it('should load pending devices')
    it('should set isPendingLoading during fetch')
  })

  describe('approveDevice', () => {
    it('should remove device from pending list')
    it('should refresh device list')
    it('should show success toast')
  })

  describe('rejectDevice', () => {
    it('should remove device from pending list')
    it('should show info toast')
  })
})
```

### Priorität 1: WebSocket-Handler (kritisch) (~10 Tests)

```typescript
describe('ESP Store - WebSocket Handlers', () => {
  describe('handleEspHealth', () => {
    it('should update device status to online')
    it('should update device status to offline with offlineInfo')
    it('should update heap_free, wifi_rssi, uptime')
    it('should trigger fetchAll for unknown online device (BUG X FIX)')
    it('should show warning toast for LWT disconnect')
  })

  describe('handleSensorData', () => {
    it('should update sensor raw_value and quality')
    it('should update last_read timestamp')
    it('should handle multi-value sensors (known device type)')
    it('should dynamically detect multi-value sensors')
  })

  describe('handleActuatorStatus', () => {
    it('should update actuator state (on/off/pwm)')
    it('should update pwm_value')
    it('should update emergency_stopped from emergency field')
  })

  describe('handleActuatorAlert', () => {
    it('should set emergency_stopped on emergency alert')
    it('should set state to false on emergency')
    it('should handle ALL devices for system-wide emergency')
  })

  describe('handleDeviceDiscovered', () => {
    it('should add new device to pendingDevices')
    it('should not add duplicate pending device')
    it('should show info toast')
  })

  describe('handleDeviceApproved', () => {
    it('should remove device from pendingDevices')
    it('should trigger fetchAll')
  })
})
```

### Priorität 2: Getters (~8 Tests)

```typescript
describe('ESP Store - Getters', () => {
  describe('selectedDevice', () => {
    it('should return device matching selectedDeviceId')
    it('should return null when no device selected')
    it('should find by device_id OR esp_id')
  })

  describe('onlineDevices', () => {
    it('should filter by status=online')
    it('should filter by connected=true')
    it('should return empty array when no online devices')
  })

  describe('offlineDevices', () => {
    it('should filter by status=offline')
    it('should filter by connected=false')
  })

  describe('mockDevices', () => {
    it('should filter devices with MOCK in ID')
  })

  describe('realDevices', () => {
    it('should filter devices without MOCK in ID')
  })

  describe('devicesByZone', () => {
    it('should return devices matching zone_id')
    it('should return empty array for unknown zone')
  })

  describe('pendingCount', () => {
    it('should return pendingDevices.length')
  })
})
```

### Priorität 2: Mock-ESP Actions (~8 Tests)

```typescript
describe('ESP Store - Mock ESP Actions', () => {
  describe('triggerHeartbeat', () => {
    it('should call debugApi.triggerHeartbeat')
    it('should throw error for real ESP')
    it('should handle orphaned mock (404)')
  })

  describe('setState', () => {
    it('should call debugApi.setState')
    it('should refresh device data')
    it('should throw error for real ESP')
  })

  describe('addSensor', () => {
    it('should call debugApi.addSensor for mock ESP')
    it('should call sensorsApi.createOrUpdate for real ESP')
    it('should infer interface_type from sensor_type')
  })

  describe('removeSensor', () => {
    it('should call debugApi.removeSensor')
    it('should throw error for real ESP')
  })

  describe('addActuator', () => {
    it('should call debugApi.addActuator')
    it('should throw error for real ESP')
  })

  describe('setActuatorState', () => {
    it('should call debugApi.setActuatorState')
    it('should throw error for real ESP')
  })
})
```

### Priorität 3: Edge Cases & WebSocket Management (~10 Tests)

```typescript
describe('ESP Store - Edge Cases', () => {
  describe('Initial State', () => {
    it('should initialize with empty devices array')
    it('should initialize with null selectedDeviceId')
    it('should initialize with isLoading=false')
    it('should auto-initialize WebSocket handlers')
  })

  describe('WebSocket Management', () => {
    it('should register all handlers on initWebSocket')
    it('should not duplicate handlers on multiple init calls')
    it('should cleanup all handlers on cleanupWebSocket')
    it('should register onConnect callback for fetchAll')
  })

  describe('Error Handling', () => {
    it('should extract validation errors from axios response')
    it('should clear error via clearError()')
    it('should handle API timeout gracefully')
  })

  describe('GPIO Status', () => {
    it('should fetch and cache GPIO status')
    it('should prevent duplicate fetches')
    it('should clear GPIO status on clearGpioStatus')
    it('should update GPIO status from heartbeat')
  })

  describe('OneWire Scan', () => {
    it('should initialize scan state on getOneWireScanState')
    it('should toggle ROM code selection')
    it('should clear scan results')
  })
})
```

---

## 5. Implementierungsplan

### 5.1 Neue Dateien

```
El Frontend/tests/unit/stores/esp.test.ts     (~800-1000 LOC)
El Frontend/tests/mocks/esp-fixtures.ts        (~150 LOC, optional)
```

### 5.2 Änderungen an bestehenden Dateien

**handlers.ts** - Folgende Handler hinzufügen:

```typescript
// =============================================================================
// ESP Device Handlers (Erweiterung)
// =============================================================================

// POST /esp/devices/:id/approve
http.post('/api/v1/esp/devices/:espId/approve', async ({ params, request }) => {
  const { espId } = params
  const body = await request.json() as ESPApprovalRequest
  return HttpResponse.json({
    success: true,
    message: 'Device approved',
    device_id: espId,
    status: 'approved',
    approved_by: 'testuser',
    approved_at: new Date().toISOString(),
  })
})

// POST /esp/devices/:id/reject
http.post('/api/v1/esp/devices/:espId/reject', async ({ params, request }) => {
  const { espId } = params
  const body = await request.json() as { reason: string }
  return HttpResponse.json({
    success: true,
    message: 'Device rejected',
    device_id: espId,
    status: 'rejected',
    rejection_reason: body.reason,
  })
})

// GET /esp/devices/:id/gpio-status
http.get('/api/v1/esp/devices/:espId/gpio-status', ({ params }) => {
  return HttpResponse.json({
    available: [5, 12, 13, 14, 15, 17, 18, 19, 23, 25, 26, 27, 32, 33],
    reserved: [],
    system: [0, 1, 2, 3, 6, 7, 8, 9, 10, 11, 21, 22],
    total_available: 14,
    total_reserved: 0,
    total_system: 12,
  })
})

// =============================================================================
// Debug/Mock-ESP Handlers (Erweiterung)
// =============================================================================

// GET /debug/mock-esp - List all mock ESPs
http.get('/api/v1/debug/mock-esp', () => {
  return HttpResponse.json([mockESPDevice])
})

// GET /debug/mock-esp/:id - Get single mock ESP
http.get('/api/v1/debug/mock-esp/:espId', ({ params }) => {
  const { espId } = params
  if (espId === 'ESP_TEST_001' || espId === 'ESP_MOCK_TEST') {
    return HttpResponse.json({
      ...mockESPDevice,
      esp_id: espId,
      device_id: espId,
    })
  }
  return HttpResponse.json({ detail: 'Mock ESP not found' }, { status: 404 })
})

// POST /debug/mock-esp/:id/sensors - Add sensor
http.post('/api/v1/debug/mock-esp/:espId/sensors', async ({ params, request }) => {
  return HttpResponse.json({ success: true, message: 'Sensor added' })
})

// DELETE /debug/mock-esp/:id/sensors/:gpio - Remove sensor
http.delete('/api/v1/debug/mock-esp/:espId/sensors/:gpio', () => {
  return HttpResponse.json({ success: true, message: 'Sensor removed' })
})

// POST /debug/mock-esp/:id/actuators - Add actuator
http.post('/api/v1/debug/mock-esp/:espId/actuators', async ({ request }) => {
  return HttpResponse.json({ success: true, message: 'Actuator added' })
})

// POST /debug/mock-esp/:id/state - Set state
http.post('/api/v1/debug/mock-esp/:espId/state', async ({ request }) => {
  return HttpResponse.json({ success: true, message: 'State updated' })
})

// POST /debug/mock-esp/:id/heartbeat - Trigger heartbeat
http.post('/api/v1/debug/mock-esp/:espId/heartbeat', () => {
  return HttpResponse.json({ success: true, message: 'Heartbeat sent' })
})

// =============================================================================
// Sensor Handlers (Erweiterung)
// =============================================================================

// PUT /sensors/:espId/:gpio - Create or update sensor
http.put('/api/v1/sensors/:espId/:gpio', async ({ params, request }) => {
  const { espId, gpio } = params
  const body = await request.json()
  return HttpResponse.json({
    id: 'sensor-uuid',
    esp_id: espId,
    gpio: Number(gpio),
    ...body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
})

// =============================================================================
// Actuator Handlers (Neu)
// =============================================================================

// POST /actuators/:espId/:gpio/command - Send command
http.post('/api/v1/actuators/:espId/:gpio/command', async ({ params, request }) => {
  const { espId, gpio } = params
  const body = await request.json() as { command: string; value?: number }
  return HttpResponse.json({
    success: true,
    message: `Command ${body.command} sent`,
    esp_id: espId,
    gpio: Number(gpio),
  })
})

// POST /actuators/emergency-stop - Emergency stop all
http.post('/api/v1/actuators/emergency-stop', async ({ request }) => {
  return HttpResponse.json({
    success: true,
    message: 'Emergency stop executed',
    devices_stopped: 2,
    actuators_stopped: 5,
  })
})

// =============================================================================
// OneWire Handlers (Neu)
// =============================================================================

// POST /onewire/:espId/scan - Scan OneWire bus
http.post('/api/v1/onewire/:espId/scan', async ({ params, request }) => {
  const { espId } = params
  const body = await request.json() as { pin?: number }
  return HttpResponse.json({
    success: true,
    esp_id: espId,
    pin: body.pin || 4,
    devices: [
      { rom_code: '28FF1234567890AB', family: 0x28, is_configured: false },
      { rom_code: '28FF0987654321CD', family: 0x28, is_configured: true },
    ],
    found_count: 2,
    scan_time_ms: 150,
  })
})
```

### 5.3 Dependencies

| Package | Vorhanden? | Aktion |
|---------|------------|--------|
| vitest | ✅ | - |
| @vue/test-utils | ✅ | - |
| @pinia/testing | ✅ | - |
| msw | ✅ | - |

---

## 6. Aufwand

| Phase | Tests | LOC (geschätzt) | Stunden |
|-------|-------|-----------------|---------|
| handlers.ts Erweiterung | - | ~150 | 1-2h |
| API Actions Tests | ~20 | ~350 | 3-4h |
| WebSocket Handler Tests | ~10 | ~200 | 2-3h |
| Getters Tests | ~8 | ~100 | 1h |
| Mock-ESP Actions Tests | ~8 | ~150 | 1-2h |
| Edge Cases & Utility Tests | ~10 | ~150 | 1-2h |
| **Gesamt** | **~55** | **~1000** | **9-14h** |

---

## 7. Risiken

| Risiko | Mitigation |
|--------|------------|
| WebSocket-Mocking komplex | Bestehendes MockWebSocketService nutzen, vi.mock für websocketService |
| Store initialisiert WS automatisch | Mock VOR Store-Import setzen, oder initWebSocket guard nutzen |
| API-Routing (Mock vs Real) | Separate Tests für Mock-Path und Real-Path |
| Viele Toast-Aufrufe | useToast als vi.mock, Toast-Calls in Assertions prüfen |
| Race Conditions bei async Actions | Proper await, flush promises mit vi.waitFor |

---


---

*Report erstellt von Frontend-Test-Analyst Agent*
*Basierend auf Analyse von esp.ts (2512 Zeilen), auth.test.ts, handlers.ts, websocket.ts, types/index.ts, api/esp.ts, services/websocket.ts*
