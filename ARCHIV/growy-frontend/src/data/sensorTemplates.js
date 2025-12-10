export const sensorTemplates = [
  {
    id: 'temp_humidity_basic',
    name: 'Temperatur + Luftfeuchte (Basic)',
    description: 'DS18B20 + DHT22 für Gewächshaus',
    icon: 'mdi-thermometer',
    boardTypes: ['ESP32_DEVKIT', 'ESP32_C3_XIAO'],
    assignments: [
      {
        gpio: 4,
        type: 'SENSOR_TEMP_DS18B20',
        name: 'Temperatursensor',
        subzone: 'greenhouse_1',
      },
      {
        gpio: 5,
        type: 'SENSOR_MOISTURE',
        name: 'Luftfeuchtesensor',
        subzone: 'greenhouse_1',
      },
    ],
  },
  {
    id: 'i2c_environmental',
    name: 'I2C Umwelt-Sensoren',
    description: 'SHT31 + BME280 für präzise Messungen',
    icon: 'mdi-weather-cloudy',
    boardTypes: ['ESP32_DEVKIT'], // XIAO hat andere I2C-Pins
    assignments: [
      {
        gpio: 21, // I2C SDA
        type: 'SENSOR_CUSTOM_PI_ENHANCED',
        name: 'SHT31 Temperatur/Luftfeuchte',
        subzone: 'greenhouse_1',
        i2cAddress: '0x44',
        sensorHint: 'SHT31',
      },
      {
        gpio: 21, // I2C SDA (shared)
        type: 'SENSOR_CUSTOM_PI_ENHANCED',
        name: 'BME280 Druck/Temperatur',
        subzone: 'greenhouse_1',
        i2cAddress: '0x76',
        sensorHint: 'BME280',
      },
    ],
  },
  {
    id: 'i2c_xiao_environmental',
    name: 'I2C Umwelt-Sensoren (XIAO)',
    description: 'SHT31 + BME280 für ESP32-C3 XIAO',
    icon: 'mdi-weather-cloudy',
    boardTypes: ['ESP32_C3_XIAO'],
    assignments: [
      {
        gpio: 4, // XIAO I2C SDA
        type: 'SENSOR_CUSTOM_PI_ENHANCED',
        name: 'SHT31 Temperatur/Luftfeuchte',
        subzone: 'greenhouse_1',
        i2cAddress: '0x44',
        sensorHint: 'SHT31',
      },
      {
        gpio: 4, // XIAO I2C SDA (shared)
        type: 'SENSOR_CUSTOM_PI_ENHANCED',
        name: 'BME280 Druck/Temperatur',
        subzone: 'greenhouse_1',
        i2cAddress: '0x76',
        sensorHint: 'BME280',
      },
    ],
  },
  {
    id: 'watering_system',
    name: 'Bewässerungssystem',
    description: 'Feuchtigkeitssensor + Wasserpumpe',
    icon: 'mdi-water',
    boardTypes: ['ESP32_DEVKIT', 'ESP32_C3_XIAO'],
    assignments: [
      {
        gpio: 12,
        type: 'SENSOR_MOISTURE',
        name: 'Bodenfeuchtigkeit',
        subzone: 'plant_zone_1',
      },
      {
        gpio: 13,
        type: 'ACTUATOR_WATER_PUMP',
        name: 'Wasserpumpe',
        subzone: 'plant_zone_1',
      },
    ],
  },
  {
    id: 'ph_ec_monitoring',
    name: 'PH/EC-Überwachung',
    description: 'Elektrochemische Sensoren für Nährlösung',
    icon: 'mdi-flask',
    boardTypes: ['ESP32_DEVKIT'],
    assignments: [
      {
        gpio: 14,
        type: 'SENSOR_PH',
        name: 'PH-Sensor',
        subzone: 'nutrient_zone_1',
        eventBased: true,
        isTriggeredBy: 'ACTUATOR_WATER_PUMP',
        expectedInterval: 3600000, // 1 Stunde
      },
      {
        gpio: 15,
        type: 'SENSOR_EC',
        name: 'EC-Sensor',
        subzone: 'nutrient_zone_1',
        eventBased: true,
        isTriggeredBy: 'ACTUATOR_WATER_PUMP',
        expectedInterval: 3600000, // 1 Stunde
      },
    ],
  },
  {
    id: 'lighting_control',
    name: 'Beleuchtungssteuerung',
    description: 'Lichtsensor + LED-Streifen',
    icon: 'mdi-lightbulb',
    boardTypes: ['ESP32_DEVKIT', 'ESP32_C3_XIAO'],
    assignments: [
      {
        gpio: 14,
        type: 'SENSOR_LIGHT',
        name: 'Lichtsensor',
        subzone: 'grow_room_1',
      },
      {
        gpio: 15,
        type: 'ACTUATOR_LED_STRIP',
        name: 'LED-Wachstumslicht',
        subzone: 'grow_room_1',
      },
    ],
  },
  {
    id: 'climate_control',
    name: 'Klimasteuerung',
    description: 'Temperatur + Lüfter + Luftbefeuchter',
    icon: 'mdi-air-conditioner',
    boardTypes: ['ESP32_DEVKIT', 'ESP32_C3_XIAO'],
    assignments: [
      {
        gpio: 4,
        type: 'SENSOR_TEMP_DS18B20',
        name: 'Temperatursensor',
        subzone: 'climate_zone_1',
      },
      {
        gpio: 16,
        type: 'ACTUATOR_FAN',
        name: 'Klima-Lüfter',
        subzone: 'climate_zone_1',
      },
      {
        gpio: 17,
        type: 'ACTUATOR_HUMIDIFIER',
        name: 'Luftbefeuchter',
        subzone: 'climate_zone_1',
      },
    ],
  },
  {
    id: 'advanced_monitoring',
    name: 'Erweiterte Überwachung',
    description: 'Mehrere Sensoren für präzise Kontrolle',
    icon: 'mdi-monitor-dashboard',
    boardTypes: ['ESP32_DEVKIT'],
    assignments: [
      {
        gpio: 4,
        type: 'SENSOR_TEMP_DS18B20',
        name: 'Temperatursensor',
        subzone: 'monitoring_zone_1',
      },
      {
        gpio: 5,
        type: 'SENSOR_MOISTURE',
        name: 'Bodenfeuchtigkeit',
        subzone: 'monitoring_zone_1',
      },
      {
        gpio: 14,
        type: 'SENSOR_LIGHT',
        name: 'Lichtsensor',
        subzone: 'monitoring_zone_1',
      },
      {
        gpio: 21, // I2C SDA
        type: 'SENSOR_CUSTOM_PI_ENHANCED',
        name: 'SHT31 Luftfeuchte',
        subzone: 'monitoring_zone_1',
        i2cAddress: '0x44',
        sensorHint: 'SHT31',
      },
    ],
  },
]

export function getTemplatesForBoard(boardType) {
  return sensorTemplates.filter((template) => {
    return template.boardTypes.includes(boardType)
  })
}

export function validateTemplateForBoard(template, boardType) {
  // Prüfe Board-Kompatibilität
  if (!template.boardTypes.includes(boardType)) {
    return { valid: false, reason: 'Template nicht kompatibel mit diesem Board-Typ' }
  }

  // Prüfe I2C-Sensor-Limit
  const i2cSensors = template.assignments.filter((a) => a.type === 'SENSOR_CUSTOM_PI_ENHANCED')
  if (i2cSensors.length > 8) {
    return { valid: false, reason: 'Template enthält mehr als 8 I2C-Sensoren' }
  }

  return { valid: true }
}

export function getTemplateIcon(templateId) {
  const template = sensorTemplates.find((t) => t.id === templateId)
  return template?.icon || 'mdi-package-variant'
}

export function getTemplateDescription(templateId) {
  const template = sensorTemplates.find((t) => t.id === templateId)
  return template?.description || 'Keine Beschreibung verfügbar'
}
