/**
 * Sensor/Actuator Type Schemas
 *
 * Declarative form schemas for sensor and actuator configuration.
 * Used by DynamicForm in SensorConfigPanel / ActuatorConfigPanel.
 *
 * Sensor types aligned with:
 * - El Trabajante firmware sensor registry
 * - El Servador sensor_handler.py
 * - Frontend RuleNodePalette sensor types
 */

import type { FormSchema } from '@/types/form-schema'

const sensorSchemas: Record<string, FormSchema> = {
  DS18B20: {
    groups: [
      {
        title: 'Hardware',
        fields: [
          {
            key: 'gpio',
            type: 'gpio-select',
            label: 'GPIO Pin',
            required: true,
            helper: 'OneWire Data Pin',
          },
          {
            key: 'interface_type',
            type: 'select',
            label: 'Interface',
            options: [{ value: 'ONEWIRE', label: 'OneWire' }],
            disabled: true,
          },
        ],
      },
      {
        title: 'Measurement',
        fields: [
          {
            key: 'interval_ms',
            type: 'number',
            label: 'Interval (ms)',
            min: 1000,
            max: 60000,
            step: 1000,
            helper: '1-60 seconds',
          },
          {
            key: 'processing_mode',
            type: 'select',
            label: 'Processing',
            options: [
              { value: 'pi_enhanced', label: 'Pi-Enhanced (Server)' },
              { value: 'raw', label: 'Raw (Direct)' },
            ],
          },
        ],
      },
      {
        title: 'Thresholds',
        collapsed: true,
        fields: [
          { key: 'threshold_min', type: 'number', label: 'Min (Alarm)', step: 0.1 },
          { key: 'threshold_max', type: 'number', label: 'Max (Alarm)', step: 0.1 },
          { key: 'warning_min', type: 'number', label: 'Min (Warning)', step: 0.1 },
          { key: 'warning_max', type: 'number', label: 'Max (Warning)', step: 0.1 },
        ],
      },
    ],
  },

  SHT31: {
    groups: [
      {
        title: 'Hardware',
        fields: [
          {
            key: 'gpio_sda',
            type: 'gpio-select',
            label: 'SDA Pin',
            required: true,
          },
          {
            key: 'gpio_scl',
            type: 'gpio-select',
            label: 'SCL Pin',
            required: true,
          },
          {
            key: 'i2c_address',
            type: 'select',
            label: 'I2C Address',
            options: [
              { value: '0x44', label: '0x44 (Default)' },
              { value: '0x45', label: '0x45 (Alt)' },
            ],
          },
        ],
      },
      {
        title: 'Measurement',
        fields: [
          {
            key: 'interval_ms',
            type: 'number',
            label: 'Interval (ms)',
            min: 1000,
            max: 60000,
            step: 1000,
            helper: '1-60 seconds',
          },
        ],
      },
      {
        title: 'Thresholds',
        collapsed: true,
        description: 'Temperature and humidity alarm thresholds',
        fields: [
          { key: 'temp_threshold_min', type: 'number', label: 'Temp Min (Alarm)', step: 0.1 },
          { key: 'temp_threshold_max', type: 'number', label: 'Temp Max (Alarm)', step: 0.1 },
          { key: 'humidity_threshold_min', type: 'number', label: 'Humidity Min (%)', step: 1 },
          { key: 'humidity_threshold_max', type: 'number', label: 'Humidity Max (%)', step: 1 },
        ],
      },
    ],
  },

  pH: {
    groups: [
      {
        title: 'Hardware',
        fields: [
          {
            key: 'gpio',
            type: 'gpio-select',
            label: 'Analog GPIO Pin',
            required: true,
          },
        ],
      },
      {
        title: 'Calibration',
        fields: [
          {
            key: 'calibration_ph4',
            type: 'number',
            label: 'pH 4.0 Voltage (mV)',
            step: 0.1,
            helper: 'Calibration point for pH 4.0 buffer',
          },
          {
            key: 'calibration_ph7',
            type: 'number',
            label: 'pH 7.0 Voltage (mV)',
            step: 0.1,
            helper: 'Calibration point for pH 7.0 buffer',
          },
          {
            key: 'calibration_ph10',
            type: 'number',
            label: 'pH 10.0 Voltage (mV)',
            step: 0.1,
            helper: 'Optional 3-point calibration',
          },
        ],
      },
      {
        title: 'Measurement',
        fields: [
          {
            key: 'interval_ms',
            type: 'number',
            label: 'Interval (ms)',
            min: 2000,
            max: 60000,
            step: 1000,
          },
        ],
      },
    ],
  },

  soil_moisture: {
    groups: [
      {
        title: 'Hardware',
        fields: [
          {
            key: 'gpio',
            type: 'gpio-select',
            label: 'Analog GPIO Pin',
            required: true,
          },
        ],
      },
      {
        title: 'Calibration',
        fields: [
          {
            key: 'dry_value',
            type: 'number',
            label: 'Dry Value (ADC)',
            helper: 'ADC reading when sensor is dry',
          },
          {
            key: 'wet_value',
            type: 'number',
            label: 'Wet Value (ADC)',
            helper: 'ADC reading when sensor is submerged',
          },
        ],
      },
      {
        title: 'Measurement',
        fields: [
          {
            key: 'interval_ms',
            type: 'number',
            label: 'Interval (ms)',
            min: 5000,
            max: 300000,
            step: 5000,
            helper: '5-300 seconds',
          },
        ],
      },
    ],
  },
}

const actuatorSchemas: Record<string, FormSchema> = {
  relay: {
    groups: [
      {
        title: 'Hardware',
        fields: [
          {
            key: 'gpio',
            type: 'gpio-select',
            label: 'GPIO Pin',
            required: true,
          },
          {
            key: 'active_high',
            type: 'toggle',
            label: 'Active High',
            helper: 'ON = GPIO HIGH (most relay modules are active-low)',
          },
        ],
      },
      {
        title: 'Safety',
        collapsed: true,
        fields: [
          {
            key: 'max_on_duration_ms',
            type: 'number',
            label: 'Max ON Duration (ms)',
            min: 0,
            max: 86400000,
            step: 1000,
            helper: '0 = unlimited, otherwise auto-off after timeout',
          },
          {
            key: 'default_state',
            type: 'select',
            label: 'Default State',
            options: [
              { value: 'off', label: 'OFF (Safe)' },
              { value: 'on', label: 'ON' },
            ],
          },
        ],
      },
    ],
  },

  pwm: {
    groups: [
      {
        title: 'Hardware',
        fields: [
          {
            key: 'gpio',
            type: 'gpio-select',
            label: 'GPIO Pin',
            required: true,
          },
          {
            key: 'frequency',
            type: 'number',
            label: 'PWM Frequency (Hz)',
            min: 1,
            max: 40000,
            step: 100,
            helper: 'Typical: 1000 Hz for motors, 25000 Hz for fans',
          },
        ],
      },
      {
        title: 'Duty Cycle Range',
        fields: [
          {
            key: 'duty_min',
            type: 'range',
            label: 'Minimum Duty (%)',
            min: 0,
            max: 100,
            step: 1,
          },
          {
            key: 'duty_max',
            type: 'range',
            label: 'Maximum Duty (%)',
            min: 0,
            max: 100,
            step: 1,
          },
        ],
      },
    ],
  },
}

/** Generic fallback schema for unknown sensor types */
const genericSensorSchema: FormSchema = {
  groups: [
    {
      title: 'Hardware',
      fields: [
        {
          key: 'gpio',
          type: 'gpio-select',
          label: 'GPIO Pin',
          required: true,
        },
        {
          key: 'interface_type',
          type: 'select',
          label: 'Interface',
          options: [
            { value: 'ONEWIRE', label: 'OneWire' },
            { value: 'I2C', label: 'I2C' },
            { value: 'ADC', label: 'Analog (ADC)' },
            { value: 'DIGITAL', label: 'Digital' },
          ],
        },
      ],
    },
    {
      title: 'Measurement',
      fields: [
        {
          key: 'interval_ms',
          type: 'number',
          label: 'Interval (ms)',
          min: 1000,
          max: 300000,
          step: 1000,
          helper: '1-300 seconds',
        },
      ],
    },
  ],
}

const genericActuatorSchema: FormSchema = {
  groups: [
    {
      title: 'Hardware',
      fields: [
        {
          key: 'gpio',
          type: 'gpio-select',
          label: 'GPIO Pin',
          required: true,
        },
      ],
    },
  ],
}

export function getSensorSchema(sensorType: string): FormSchema {
  return sensorSchemas[sensorType] ?? genericSensorSchema
}

export function getActuatorSchema(actuatorType: string): FormSchema {
  return actuatorSchemas[actuatorType] ?? genericActuatorSchema
}
