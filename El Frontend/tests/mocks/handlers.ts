/**
 * MSW Request Handlers
 *
 * Mock API responses for testing.
 * These handlers intercept HTTP requests and return mock responses.
 *
 * API Endpoints Reference: .claude/reference/api/REST_ENDPOINTS.md
 */

import { http, HttpResponse } from 'msw'

// =============================================================================
// Mock Data
// =============================================================================

const mockUser = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  full_name: 'Test User',
  role: 'admin',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z'
}

const mockTokens = {
  access_token: 'mock-access-token-12345',
  refresh_token: 'mock-refresh-token-67890',
  token_type: 'bearer',
  expires_in: 3600
}

const mockESPDevice = {
  esp_id: 'ESP_TEST_001',
  device_id: 'ESP_TEST_001',
  name: 'Test ESP',
  zone_id: 'zone_1',
  zone_name: 'Test Zone',
  status: 'online',
  is_mock: true,
  system_state: 'OPERATIONAL',
  heap_free: 128000,
  wifi_rssi: -65,
  uptime: 3600,
  last_heartbeat: new Date().toISOString(),
  last_seen: new Date().toISOString(),
  connected: true,
  sensors: [],
  actuators: [],
  sensor_count: 0,
  actuator_count: 0,
  hardware_type: 'MOCK_ESP32',
  auto_heartbeat: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z'
}

const mockSensor = {
  gpio: 4,
  sensor_type: 'ds18b20',
  name: 'Temperature Sensor',
  subzone_id: null,
  raw_value: 23.5,
  processed_value: 23.5,
  unit: '°C',
  quality: 'excellent' as const,
  raw_mode: true,
  last_read: new Date().toISOString(),
  operating_mode: 'continuous',
  timeout_seconds: 180,
  is_stale: false,
  stale_reason: undefined,
  is_multi_value: false,
  device_type: null,
  multi_values: null
}

const mockActuator = {
  gpio: 16,
  actuator_type: 'relay',
  name: 'Pump Relay',
  state: false,
  pwm_value: 0,
  emergency_stopped: false,
  last_command: null
}

const mockPendingDevice = {
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
  hardware_type: 'ESP32_WROOM'
}

const mockGpioStatus = {
  available: [5, 12, 13, 14, 15, 17, 18, 19, 23, 25, 26, 27, 32, 33],
  reserved: [
    { gpio: 4, owner: 'sensor' as const, component: 'ds18b20', name: 'Temperature', id: 'uuid-1', source: 'database' as const },
    { gpio: 16, owner: 'actuator' as const, component: 'relay', name: 'Pump', id: 'uuid-2', source: 'database' as const }
  ],
  system: [0, 1, 2, 3, 6, 7, 8, 9, 10, 11, 21, 22],
  total_available: 14,
  total_reserved: 2,
  total_system: 12,
  last_esp_report: new Date().toISOString()
}

// =============================================================================
// Auth Handlers
// =============================================================================

const authHandlers = [
  // GET /auth/status - Check setup status
  http.get('/api/v1/auth/status', () => {
    return HttpResponse.json({
      setup_required: false,
      user_count: 1
    })
  }),

  // POST /auth/login - Login
  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = await request.json() as { username: string; password: string }

    if (body.username === 'testuser' && body.password === 'password123') {
      return HttpResponse.json({
        tokens: mockTokens,
        user: mockUser
      })
    }

    return HttpResponse.json(
      { detail: 'Invalid username or password' },
      { status: 401 }
    )
  }),

  // POST /auth/setup - Initial setup
  http.post('/api/v1/auth/setup', async ({ request }) => {
    const body = await request.json() as {
      username: string
      email: string
      password: string
      full_name?: string
    }

    return HttpResponse.json({
      tokens: mockTokens,
      user: {
        ...mockUser,
        username: body.username,
        email: body.email,
        full_name: body.full_name || null
      }
    })
  }),

  // POST /auth/refresh - Refresh tokens
  // Server returns: { tokens: { access_token, refresh_token, ... } }
  http.post('/api/v1/auth/refresh', async ({ request }) => {
    const body = await request.json() as { refresh_token: string }

    if (body.refresh_token === 'mock-refresh-token-67890') {
      return HttpResponse.json({
        tokens: {
          access_token: 'mock-access-token-renewed',
          refresh_token: 'mock-refresh-token-renewed',
          token_type: 'bearer',
          expires_in: 3600
        }
      })
    }

    return HttpResponse.json(
      { detail: 'Invalid refresh token' },
      { status: 401 }
    )
  }),

  // GET /auth/me - Get current user
  http.get('/api/v1/auth/me', ({ request }) => {
    const authHeader = request.headers.get('Authorization')

    if (authHeader?.startsWith('Bearer mock-')) {
      return HttpResponse.json(mockUser)
    }

    return HttpResponse.json(
      { detail: 'Not authenticated' },
      { status: 401 }
    )
  }),

  // POST /auth/logout - Logout
  http.post('/api/v1/auth/logout', () => {
    return HttpResponse.json({ message: 'Logged out successfully' })
  })
]

// =============================================================================
// ESP Device Handlers
// =============================================================================

const espHandlers = [
  // GET /esp/devices - Get all devices
  http.get('/api/v1/esp/devices', () => {
    return HttpResponse.json({
      data: [mockESPDevice],
      total: 1
    })
  }),

  // GET /esp/devices/pending - Get pending devices
  http.get('/api/v1/esp/devices/pending', () => {
    return HttpResponse.json({
      data: [],
      total: 0
    })
  }),

  // GET /esp/devices/:id - Get single device
  http.get('/api/v1/esp/devices/:espId', ({ params }) => {
    const { espId } = params

    if (espId === 'ESP_TEST_001') {
      return HttpResponse.json(mockESPDevice)
    }

    return HttpResponse.json(
      { detail: 'Device not found' },
      { status: 404 }
    )
  }),

  // PATCH /esp/devices/:id - Update device
  http.patch('/api/v1/esp/devices/:espId', async ({ params, request }) => {
    const { espId } = params
    const body = await request.json() as Record<string, unknown>

    if (espId === 'ESP_TEST_001') {
      return HttpResponse.json({
        ...mockESPDevice,
        ...body
      })
    }

    return HttpResponse.json(
      { detail: 'Device not found' },
      { status: 404 }
    )
  }),

  // DELETE /esp/devices/:id - Delete device
  http.delete('/api/v1/esp/devices/:espId', ({ params }) => {
    const { espId } = params

    if (espId === 'ESP_TEST_001' || (espId as string).startsWith('ESP_MOCK')) {
      return HttpResponse.json({ message: 'Device deleted' })
    }

    return HttpResponse.json(
      { detail: 'Device not found' },
      { status: 404 }
    )
  }),

  // POST /esp/devices/:id/approve - Approve pending device
  http.post('/api/v1/esp/devices/:espId/approve', async ({ params, request }) => {
    const { espId } = params
    const body = await request.json() as { name?: string; zone_id?: string; zone_name?: string }

    return HttpResponse.json({
      success: true,
      message: 'Device approved',
      device_id: espId,
      status: 'approved',
      approved_by: 'testuser',
      approved_at: new Date().toISOString(),
      name: body.name,
      zone_id: body.zone_id
    })
  }),

  // POST /esp/devices/:id/reject - Reject pending device
  http.post('/api/v1/esp/devices/:espId/reject', async ({ params, request }) => {
    const { espId } = params
    const body = await request.json() as { reason: string }

    return HttpResponse.json({
      success: true,
      message: 'Device rejected',
      device_id: espId,
      status: 'rejected',
      rejection_reason: body.reason,
      cooldown_until: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    })
  }),

  // GET /esp/devices/:id/gpio-status - Get GPIO status
  http.get('/api/v1/esp/devices/:espId/gpio-status', () => {
    return HttpResponse.json(mockGpioStatus)
  })
]

// =============================================================================
// Sensor Handlers
// =============================================================================

const sensorHandlers = [
  // GET /sensors/data - Get sensor data
  http.get('/api/v1/sensors/data', ({ request }) => {
    const url = new URL(request.url)
    const espId = url.searchParams.get('esp_id')
    const gpio = url.searchParams.get('gpio')

    return HttpResponse.json({
      success: true,
      esp_id: espId,
      gpio: Number(gpio),
      sensor_type: 'ds18b20',
      readings: [
        {
          timestamp: new Date().toISOString(),
          raw_value: 23.5,
          processed_value: 23.5,
          unit: '°C',
          quality: 'excellent'
        }
      ],
      count: 1
    })
  }),

  // PUT /sensors/:espId/:gpio - Create or update sensor
  http.put('/api/v1/sensors/:espId/:gpio', async ({ params, request }) => {
    const { espId, gpio } = params
    const body = await request.json() as {
      sensor_type: string
      name?: string
      subzone_id?: string
    }

    return HttpResponse.json({
      id: 'sensor-uuid-1234',
      esp_id: espId,
      gpio: Number(gpio),
      sensor_type: body.sensor_type,
      name: body.name || 'New Sensor',
      subzone_id: body.subzone_id || null,
      raw_value: 0,
      processed_value: 0,
      quality: 'excellent',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  })
]

// =============================================================================
// Actuator Handlers
// =============================================================================

const actuatorHandlers = [
  // POST /v1/actuators/:espId/:gpio/command - Send actuator command
  http.post('/api/v1/actuators/:espId/:gpio/command', async ({ params, request }) => {
    const { espId, gpio } = params
    const body = await request.json() as {
      command: string
      value?: number
    }

    return HttpResponse.json({
      success: true,
      esp_id: espId,
      gpio: Number(gpio),
      command: body.command,
      value: body.value || 0,
      command_sent: true,
      acknowledged: true,
      safety_warnings: []
    })
  }),

  // POST /v1/actuators/emergency_stop - Emergency stop all actuators (note: underscore not hyphen)
  http.post('/api/v1/actuators/emergency_stop', async ({ request }) => {
    const body = await request.json() as { reason?: string; esp_id?: string; gpio?: number }

    return HttpResponse.json({
      success: true,
      message: 'Emergency stop executed',
      reason: body.reason || 'manual',
      devices_stopped: 2,
      actuators_stopped: 5,
      timestamp: new Date().toISOString(),
      details: []
    })
  })
]

// =============================================================================
// OneWire Handlers
// =============================================================================

const oneWireHandlers = [
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
        { rom_code: '28FF0987654321CD', family: 0x28, is_configured: true }
      ],
      found_count: 2,
      scan_time_ms: 150
    })
  })
]

// =============================================================================
// Zone Handlers
// =============================================================================

const zoneHandlers = [
  // POST /zone/devices/:id/assign - Assign device to zone
  http.post('/api/v1/zone/devices/:espId/assign', async ({ params, request }) => {
    const { espId } = params
    const body = await request.json() as { zone_id: string; zone_name?: string }

    return HttpResponse.json({
      success: true,
      message: 'Zone assigned successfully',
      device_id: espId,
      zone_id: body.zone_id,
      zone_name: body.zone_name || body.zone_id,
      mqtt_topic: `kaiser/god/esp/${espId}/config/zone`,
      mqtt_sent: true
    })
  }),

  // POST /zone/devices/:id/remove - Remove device from zone
  http.post('/api/v1/zone/devices/:espId/remove', ({ params }) => {
    const { espId } = params

    return HttpResponse.json({
      success: true,
      message: 'Zone removed successfully',
      device_id: espId,
      mqtt_topic: `kaiser/god/esp/${espId}/config/zone`,
      mqtt_sent: true
    })
  })
]

// =============================================================================
// Logic Handlers
// =============================================================================

const mockLogicRule = {
  id: 'rule-001',
  name: 'Temperature Fan Control',
  description: 'Turn on fan when temperature exceeds 25°C',
  enabled: true,
  conditions: [
    {
      type: 'sensor_threshold',
      esp_id: 'ESP_TEST_001',
      gpio: 4,
      sensor_type: 'ds18b20',
      operator: '>',
      value: 25
    }
  ],
  logic_operator: 'AND',
  actions: [
    {
      type: 'actuator_command',
      esp_id: 'ESP_TEST_002',
      gpio: 16,
      command: 'ON'
    }
  ],
  priority: 1,
  cooldown_seconds: 60,
  max_executions_per_hour: 10,
  last_triggered: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z'
}

const logicHandlers = [
  // GET /logic/rules - Get all rules
  http.get('/api/v1/logic/rules', () => {
    return HttpResponse.json({
      items: [mockLogicRule],
      total: 1,
      page: 1,
      page_size: 50
    })
  }),

  // GET /logic/rules/:id - Get single rule
  http.get('/api/v1/logic/rules/:ruleId', ({ params }) => {
    const { ruleId } = params

    if (ruleId === 'rule-001') {
      return HttpResponse.json(mockLogicRule)
    }

    return HttpResponse.json(
      { detail: 'Rule not found' },
      { status: 404 }
    )
  }),

  // POST /logic/rules/:id/toggle - Toggle rule
  http.post('/api/v1/logic/rules/:ruleId/toggle', ({ params }) => {
    const { ruleId } = params

    if (ruleId === 'rule-001') {
      return HttpResponse.json({
        success: true,
        message: 'Rule toggled',
        rule_id: ruleId,
        enabled: !mockLogicRule.enabled
      })
    }

    return HttpResponse.json(
      { detail: 'Rule not found' },
      { status: 404 }
    )
  }),

  // POST /logic/rules/:id/test - Test rule
  http.post('/api/v1/logic/rules/:ruleId/test', ({ params }) => {
    const { ruleId } = params

    if (ruleId === 'rule-001') {
      return HttpResponse.json({
        success: true,
        message: 'Rule evaluation completed',
        rule_id: ruleId,
        conditions_result: true,
        evaluation_details: [
          { condition_index: 0, result: true, sensor_value: 26.5 }
        ],
        would_execute_actions: true
      })
    }

    return HttpResponse.json(
      { detail: 'Rule not found' },
      { status: 404 }
    )
  })
]

// =============================================================================
// Database Handlers (Debug DB Explorer)
// =============================================================================

/** Inline type for mock table schema */
interface TableSchemaForMock {
  table_name: string
  columns: Array<{
    name: string
    type: string
    nullable: boolean
    primary_key: boolean
    foreign_key?: string | null
  }>
  row_count: number
  primary_key: string
}

const mockTableSchema: TableSchemaForMock = {
  table_name: 'esp_devices',
  columns: [
    { name: 'id', type: 'uuid', nullable: false, primary_key: true },
    { name: 'esp_id', type: 'string', nullable: false, primary_key: false },
    { name: 'name', type: 'string', nullable: true, primary_key: false },
    { name: 'status', type: 'string', nullable: false, primary_key: false },
    { name: 'created_at', type: 'datetime', nullable: false, primary_key: false }
  ],
  row_count: 5,
  primary_key: 'id'
}

const mockTableData = {
  success: true,
  table_name: 'esp_devices',
  data: [
    { id: 'uuid-1', esp_id: 'ESP_TEST_001', name: 'Test ESP', status: 'online', created_at: '2026-01-01T00:00:00Z' },
    { id: 'uuid-2', esp_id: 'ESP_TEST_002', name: 'Second ESP', status: 'offline', created_at: '2026-01-02T00:00:00Z' }
  ],
  total_count: 2,
  page: 1,
  page_size: 50,
  total_pages: 1
}

const databaseHandlers = [
  // GET /debug/db/tables - List all tables
  http.get('/api/v1/debug/db/tables', () => {
    return HttpResponse.json({
      success: true,
      tables: [mockTableSchema]
    })
  }),

  // GET /debug/db/:table/schema - Get table schema
  http.get('/api/v1/debug/db/:table/schema', ({ params }) => {
    const { table } = params

    if (table === 'esp_devices') {
      return HttpResponse.json(mockTableSchema)
    }

    return HttpResponse.json(
      { detail: `Table '${table}' not found` },
      { status: 404 }
    )
  }),

  // GET /debug/db/:table - Query table data
  http.get('/api/v1/debug/db/:table', ({ params, request }) => {
    const { table } = params
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page')) || 1
    const pageSize = Number(url.searchParams.get('page_size')) || 50

    if (table === 'esp_devices') {
      return HttpResponse.json({
        ...mockTableData,
        page,
        page_size: pageSize
      })
    }

    return HttpResponse.json(
      { detail: `Table '${table}' not found` },
      { status: 404 }
    )
  }),

  // GET /debug/db/:table/:recordId - Get single record
  http.get('/api/v1/debug/db/:table/:recordId', ({ params }) => {
    const { table, recordId } = params

    if (table === 'esp_devices' && recordId === 'uuid-1') {
      return HttpResponse.json({
        success: true,
        table_name: 'esp_devices',
        record: mockTableData.data[0]
      })
    }

    return HttpResponse.json(
      { detail: 'Record not found' },
      { status: 404 }
    )
  })
]

// =============================================================================
// Audit Handlers
// =============================================================================

const auditHandlers = [
  // GET /audit/statistics - Get audit statistics
  http.get('/api/v1/audit/statistics', () => {
    return HttpResponse.json({
      total_events: 100,
      events_by_type: {
        sensor_data: 50,
        actuator_command: 30,
        system_event: 20
      },
      problems: []
    })
  })
]

// =============================================================================
// Debug/Mock ESP Handlers
// =============================================================================

const debugHandlers = [
  // POST /debug/mock-esp - Create mock ESP
  http.post('/api/v1/debug/mock-esp', async ({ request }) => {
    const body = await request.json() as {
      esp_id?: string
      name?: string
      zone_id?: string
      zone_name?: string
      auto_heartbeat?: boolean
    }

    const espId = body.esp_id || `ESP_MOCK_${Date.now()}`

    return HttpResponse.json({
      esp_id: espId,
      device_id: espId,
      name: body.name || null,
      zone_id: body.zone_id || null,
      zone_name: body.zone_name || null,
      status: 'online',
      system_state: 'OPERATIONAL',
      connected: true,
      auto_heartbeat: body.auto_heartbeat ?? true,
      heap_free: 128000,
      wifi_rssi: -65,
      uptime: 0,
      sensors: [],
      actuators: [],
      created_at: new Date().toISOString()
    })
  }),

  // GET /debug/mock-esp - List all mock ESPs
  http.get('/api/v1/debug/mock-esp', () => {
    return HttpResponse.json({
      success: true,
      data: [mockESPDevice],
      total: 1
    })
  }),

  // GET /debug/mock-esp/:id - Get single mock ESP
  http.get('/api/v1/debug/mock-esp/:espId', ({ params }) => {
    const { espId } = params

    if (espId === 'ESP_TEST_001' || (espId as string).startsWith('ESP_MOCK')) {
      return HttpResponse.json({
        ...mockESPDevice,
        esp_id: espId,
        device_id: espId
      })
    }

    return HttpResponse.json(
      { detail: 'Mock ESP not found' },
      { status: 404 }
    )
  }),

  // DELETE /debug/mock-esp/:id - Delete mock ESP
  http.delete('/api/v1/debug/mock-esp/:espId', ({ params }) => {
    const { espId } = params

    if (espId === 'ESP_NOT_FOUND') {
      return HttpResponse.json(
        { detail: 'Mock ESP not found' },
        { status: 404 }
      )
    }

    return HttpResponse.json({
      message: `Mock ESP ${espId} deleted`
    })
  }),

  // POST /debug/mock-esp/:id/sensors - Add sensor to mock ESP
  http.post('/api/v1/debug/mock-esp/:espId/sensors', async ({ params, request }) => {
    const { espId } = params
    const body = await request.json() as {
      gpio: number
      sensor_type: string
      name?: string
    }

    return HttpResponse.json({
      success: true,
      message: 'Sensor added',
      esp_id: espId,
      sensor: {
        gpio: body.gpio,
        sensor_type: body.sensor_type,
        name: body.name || 'New Sensor',
        raw_value: 0,
        quality: 'excellent'
      }
    })
  }),

  // DELETE /debug/mock-esp/:id/sensors/:gpio - Remove sensor
  http.delete('/api/v1/debug/mock-esp/:espId/sensors/:gpio', ({ params }) => {
    const { espId, gpio } = params

    return HttpResponse.json({
      success: true,
      message: `Sensor on GPIO ${gpio} removed from ${espId}`
    })
  }),

  // POST /debug/mock-esp/:id/actuators - Add actuator to mock ESP
  http.post('/api/v1/debug/mock-esp/:espId/actuators', async ({ params, request }) => {
    const { espId } = params
    const body = await request.json() as {
      gpio: number
      actuator_type: string
      name?: string
    }

    return HttpResponse.json({
      success: true,
      message: 'Actuator added',
      esp_id: espId,
      actuator: {
        gpio: body.gpio,
        actuator_type: body.actuator_type,
        name: body.name || 'New Actuator',
        state: false,
        pwm_value: 0
      }
    })
  }),

  // POST /debug/mock-esp/:id/state - Set mock ESP state
  http.post('/api/v1/debug/mock-esp/:espId/state', async ({ params, request }) => {
    const { espId } = params
    const body = await request.json() as {
      state: string
      reason?: string
    }

    return HttpResponse.json({
      success: true,
      message: `State changed to ${body.state}`,
      esp_id: espId,
      system_state: body.state,
      reason: body.reason
    })
  }),

  // POST /debug/mock-esp/:id/heartbeat - Trigger heartbeat
  http.post('/api/v1/debug/mock-esp/:espId/heartbeat', ({ params }) => {
    const { espId } = params

    return HttpResponse.json({
      success: true,
      message: 'Heartbeat sent',
      esp_id: espId,
      timestamp: new Date().toISOString()
    })
  }),

  // POST /debug/mock-esp/:id/sensors/:gpio/value - Set sensor value
  http.post('/api/v1/debug/mock-esp/:espId/sensors/:gpio/value', async ({ params, request }) => {
    const { espId, gpio } = params
    const body = await request.json() as {
      raw_value: number
      quality?: string
      publish?: boolean
    }

    return HttpResponse.json({
      success: true,
      message: 'Sensor value updated',
      esp_id: espId,
      gpio: Number(gpio),
      raw_value: body.raw_value,
      quality: body.quality || 'excellent'
    })
  }),

  // POST /debug/mock-esp/:id/actuators/:gpio/state - Set actuator state
  http.post('/api/v1/debug/mock-esp/:espId/actuators/:gpio/state', async ({ params, request }) => {
    const { espId, gpio } = params
    const body = await request.json() as {
      state: boolean
      pwm_value?: number
    }

    return HttpResponse.json({
      success: true,
      message: 'Actuator state updated',
      esp_id: espId,
      gpio: Number(gpio),
      state: body.state,
      pwm_value: body.pwm_value || 0
    })
  }),

  // POST /debug/mock-esp/:id/emergency-stop - Emergency stop for mock ESP
  http.post('/api/v1/debug/mock-esp/:espId/emergency-stop', async ({ params, request }) => {
    const { espId } = params
    const body = await request.json() as { reason?: string }

    return HttpResponse.json({
      success: true,
      message: 'Emergency stop executed',
      esp_id: espId,
      reason: body.reason || 'manual'
    })
  }),

  // POST /debug/mock-esp/:id/clear-emergency - Clear emergency for mock ESP
  http.post('/api/v1/debug/mock-esp/:espId/clear-emergency', ({ params }) => {
    const { espId } = params

    return HttpResponse.json({
      success: true,
      message: 'Emergency cleared',
      esp_id: espId
    })
  }),

  // POST /debug/mock-esp/:id/auto-heartbeat - Set auto-heartbeat
  http.post('/api/v1/debug/mock-esp/:espId/auto-heartbeat', async ({ params, request }) => {
    const { espId } = params
    const body = await request.json() as {
      enabled: boolean
      interval_seconds?: number
    }

    return HttpResponse.json({
      success: true,
      message: body.enabled ? 'Auto-heartbeat enabled' : 'Auto-heartbeat disabled',
      esp_id: espId,
      auto_heartbeat: body.enabled,
      interval_seconds: body.interval_seconds || 30
    })
  }),

  // POST /debug/mock-esp/:id/actuators/:gpio - Set actuator state (sendActuatorCommand for Mock)
  http.post('/api/v1/debug/mock-esp/:espId/actuators/:gpio', async ({ params, request }) => {
    const { espId, gpio } = params
    const body = await request.json() as {
      state?: boolean
      pwm_value?: number
      command?: string
      publish?: boolean
    }

    return HttpResponse.json({
      success: true,
      message: 'Actuator command executed',
      esp_id: espId,
      gpio: Number(gpio),
      state: body.state,
      pwm_value: body.pwm_value || 0
    })
  })
]

// =============================================================================
// Export All Handlers
// =============================================================================

export const handlers = [
  ...authHandlers,
  ...espHandlers,
  ...sensorHandlers,
  ...actuatorHandlers,
  ...oneWireHandlers,
  ...zoneHandlers,
  ...logicHandlers,
  ...databaseHandlers,
  ...auditHandlers,
  ...debugHandlers
]

// =============================================================================
// Export Mock Data (for use in tests)
// =============================================================================

export {
  mockUser,
  mockTokens,
  mockESPDevice,
  mockSensor,
  mockActuator,
  mockPendingDevice,
  mockGpioStatus,
  mockLogicRule,
  mockTableSchema,
  mockTableData
}
