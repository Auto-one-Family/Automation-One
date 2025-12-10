// 🆕 NEU: Logic Recommendations Module
import { useActuatorLogicStore } from '@/stores/actuatorLogic'
import { useSensorRegistryStore } from '@/stores/sensorRegistry'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { computed } from 'vue'

export class LogicRecommendations {
  constructor() {
    this.actuatorLogicStore = useActuatorLogicStore()
    this.sensorRegistry = useSensorRegistryStore()
    const centralDataHub = useCentralDataHub()
    this.mqttStore = computed(() => centralDataHub.storeReferences.mqtt)
  }

  // 🆕 NEU: Intelligente Standardwerte generieren
  generateDefaultValues(espId, gpio, actuatorType) {
    const defaults = {
      conditions: [],
      timers: [],
      events: [],
      configuration: {
        enabled: true,
        evaluationInterval: 30000,
        failsafeEnabled: true,
        failsafeState: false,
        priority: 'LOGIC',
      },
      metadata: {
        name: '',
        description: '',
        createdBy: 'user',
        lastModified: new Date().toISOString(),
      },
    }

    // Aktor-Typ-spezifische Standardwerte
    switch (actuatorType) {
      case 'ACTUATOR_PUMP': {
        defaults.configuration.failsafeState = false // Pumpe aus bei Failsafe
        defaults.configuration.evaluationInterval = 60000 // 1 Minute für Pumpen
        defaults.metadata.name = 'Bewässerungspumpe'
        defaults.metadata.description =
          'Automatische Bewässerung basierend auf Feuchtigkeitssensoren'
        break
      }

      case 'ACTUATOR_LED': {
        defaults.configuration.failsafeState = false // LED aus bei Failsafe
        defaults.configuration.evaluationInterval = 30000 // 30 Sekunden für LEDs
        defaults.metadata.name = 'LED-Beleuchtung'
        defaults.metadata.description =
          'Automatische Beleuchtung basierend auf Licht- und Zeitbedingungen'
        break
      }

      case 'ACTUATOR_HEATER': {
        defaults.configuration.failsafeState = false // Heizung aus bei Failsafe
        defaults.configuration.evaluationInterval = 45000 // 45 Sekunden für Heizungen
        defaults.metadata.name = 'Temperaturregelung'
        defaults.metadata.description =
          'Automatische Temperaturregelung basierend auf Temperatursensoren'
        break
      }

      case 'ACTUATOR_FAN': {
        defaults.configuration.failsafeState = false // Lüfter aus bei Failsafe
        defaults.configuration.evaluationInterval = 30000 // 30 Sekunden für Lüfter
        defaults.metadata.name = 'Lüftungssteuerung'
        defaults.metadata.description =
          'Automatische Lüftung basierend auf Temperatur und Luftfeuchtigkeit'
        break
      }

      default: {
        defaults.metadata.name = 'Aktor-Logik'
        defaults.metadata.description = 'Automatische Steuerung basierend auf Sensor-Daten'
      }
    }

    return defaults
  }

  // 🆕 NEU: Sensor-Empfehlungen generieren
  generateSensorRecommendations(espId, gpio, actuatorType, zoneId = null) {
    const recommendations = []
    const availableSensors = this.sensorRegistry.getSensorsByEsp(espId)

    // Aktor-Typ-spezifische Sensor-Empfehlungen
    switch (actuatorType) {
      case 'ACTUATOR_PUMP': {
        // Feuchtigkeitssensoren empfehlen
        const moistureSensors = availableSensors.filter((s) => s.type === 'SENSOR_MOISTURE')
        if (moistureSensors.length === 0) {
          recommendations.push({
            type: 'safety',
            priority: 'critical',
            message: 'Feuchtigkeitssensor erforderlich für sichere Pumpensteuerung',
            action: 'add_moisture_sensor',
            suggestedConditions: [
              {
                sensorGpio: 'auto',
                operator: '<',
                threshold: 30,
                description: 'Bewässerung bei Feuchtigkeit unter 30%',
              },
            ],
          })
        } else {
          recommendations.push({
            type: 'optimization',
            priority: 'high',
            message: `${moistureSensors.length} Feuchtigkeitssensor(en) verfügbar`,
            action: 'use_moisture_sensors',
            suggestedConditions: moistureSensors.map((sensor) => ({
              sensorGpio: sensor.gpio,
              operator: '<',
              threshold: 30,
              description: `Bewässerung bei ${sensor.name} unter 30%`,
            })),
          })
        }

        // Temperatursensoren für Frostschutz
        const tempSensors = availableSensors.filter((s) => s.type === 'SENSOR_TEMP_DS18B20')
        if (tempSensors.length > 0) {
          recommendations.push({
            type: 'safety',
            priority: 'medium',
            message: 'Temperatursensor für Frostschutz verwenden',
            action: 'add_frost_protection',
            suggestedConditions: tempSensors.map((sensor) => ({
              sensorGpio: sensor.gpio,
              operator: '<',
              threshold: 2,
              description: `Frostschutz bei ${sensor.name} unter 2°C`,
            })),
          })
        }
        break
      }

      case 'ACTUATOR_LED': {
        // Lichtsensoren empfehlen
        const lightSensors = availableSensors.filter((s) => s.type === 'SENSOR_LIGHT')
        if (lightSensors.length === 0) {
          recommendations.push({
            type: 'functionality',
            priority: 'high',
            message: 'Lichtsensor für automatische Beleuchtung empfehlenswert',
            action: 'add_light_sensor',
            suggestedConditions: [
              {
                sensorGpio: 'auto',
                operator: '<',
                threshold: 100,
                description: 'Beleuchtung bei Lichtstärke unter 100 lux',
              },
            ],
          })
        } else {
          recommendations.push({
            type: 'optimization',
            priority: 'medium',
            message: `${lightSensors.length} Lichtsensor(en) verfügbar`,
            action: 'use_light_sensors',
            suggestedConditions: lightSensors.map((sensor) => ({
              sensorGpio: sensor.gpio,
              operator: '<',
              threshold: 100,
              description: `Beleuchtung bei ${sensor.name} unter 100 lux`,
            })),
          })
        }
        break
      }

      case 'ACTUATOR_HEATER': {
        // Temperatursensoren empfehlen
        const heaterTempSensors = availableSensors.filter((s) => s.type === 'SENSOR_TEMP_DS18B20')
        if (heaterTempSensors.length === 0) {
          recommendations.push({
            type: 'safety',
            priority: 'critical',
            message: 'Temperatursensor erforderlich für sichere Heizungssteuerung',
            action: 'add_temp_sensor',
            suggestedConditions: [
              {
                sensorGpio: 'auto',
                operator: '<',
                threshold: 18,
                description: 'Heizung bei Temperatur unter 18°C',
              },
            ],
          })
        } else {
          recommendations.push({
            type: 'optimization',
            priority: 'high',
            message: `${heaterTempSensors.length} Temperatursensor(en) verfügbar`,
            action: 'use_temp_sensors',
            suggestedConditions: heaterTempSensors.map((sensor) => ({
              sensorGpio: sensor.gpio,
              operator: '<',
              threshold: 18,
              description: `Heizung bei ${sensor.name} unter 18°C`,
            })),
          })
        }

        // Luftfeuchtigkeitssensoren für Komfort
        const humiditySensors = availableSensors.filter((s) => s.type === 'SENSOR_HUMIDITY')
        if (humiditySensors.length > 0) {
          recommendations.push({
            type: 'comfort',
            priority: 'medium',
            message: 'Luftfeuchtigkeitssensor für Komfortsteuerung verwenden',
            action: 'add_humidity_control',
            suggestedConditions: humiditySensors.map((sensor) => ({
              sensorGpio: sensor.gpio,
              operator: '<',
              threshold: 40,
              description: `Heizung bei ${sensor.name} unter 40%`,
            })),
          })
        }
        break
      }

      case 'ACTUATOR_FAN': {
        // Temperatur- und Luftfeuchtigkeitssensoren
        const fanTempSensors = availableSensors.filter((s) => s.type === 'SENSOR_TEMP_DS18B20')
        const fanHumiditySensors = availableSensors.filter((s) => s.type === 'SENSOR_HUMIDITY')

        if (fanTempSensors.length > 0) {
          recommendations.push({
            type: 'functionality',
            priority: 'high',
            message: 'Temperatursensor für Lüftungssteuerung verwenden',
            action: 'use_temp_for_fan',
            suggestedConditions: fanTempSensors.map((sensor) => ({
              sensorGpio: sensor.gpio,
              operator: '>',
              threshold: 25,
              description: `Lüftung bei ${sensor.name} über 25°C`,
            })),
          })
        }

        if (fanHumiditySensors.length > 0) {
          recommendations.push({
            type: 'functionality',
            priority: 'medium',
            message: 'Luftfeuchtigkeitssensor für Lüftungssteuerung verwenden',
            action: 'use_humidity_for_fan',
            suggestedConditions: fanHumiditySensors.map((sensor) => ({
              sensorGpio: sensor.gpio,
              operator: '>',
              threshold: 70,
              description: `Lüftung bei ${sensor.name} über 70%`,
            })),
          })
        }
        break
      }
    }

    // Zone-spezifische Empfehlungen
    if (zoneId) {
      const zoneRecommendations = this.generateZoneSpecificRecommendations(zoneId, actuatorType)
      recommendations.push(...zoneRecommendations)
    }

    return recommendations
  }

  // 🆕 NEU: Timer-Empfehlungen generieren
  generateTimerRecommendations(espId, gpio, actuatorType) {
    const recommendations = []

    // Aktor-Typ-spezifische Timer-Empfehlungen
    switch (actuatorType) {
      case 'ACTUATOR_PUMP': {
        recommendations.push({
          type: 'schedule',
          priority: 'high',
          message: 'Bewässerungszeiten für optimale Pflanzenentwicklung',
          action: 'add_watering_schedule',
          suggestedTimers: [
            {
              name: 'Morgens',
              startTime: '06:00',
              endTime: '08:00',
              days: [1, 2, 3, 4, 5, 6, 0], // Montag-Sonntag
              description: 'Frühe Bewässerung für optimale Aufnahme',
            },
            {
              name: 'Abends',
              startTime: '18:00',
              endTime: '20:00',
              days: [1, 2, 3, 4, 5, 6, 0],
              description: 'Abendliche Bewässerung für Nachtaufnahme',
            },
          ],
        })
        break
      }

      case 'ACTUATOR_LED': {
        recommendations.push({
          type: 'schedule',
          priority: 'medium',
          message: 'Beleuchtungszeiten für Pflanzenwachstum',
          action: 'add_lighting_schedule',
          suggestedTimers: [
            {
              name: 'Tageslicht',
              startTime: '08:00',
              endTime: '20:00',
              days: [1, 2, 3, 4, 5, 6, 0],
              description: 'Tägliche Beleuchtung für Pflanzenwachstum',
            },
          ],
        })
        break
      }

      case 'ACTUATOR_HEATER': {
        recommendations.push({
          type: 'schedule',
          priority: 'high',
          message: 'Heizungszeiten für Komfort und Effizienz',
          action: 'add_heating_schedule',
          suggestedTimers: [
            {
              name: 'Tag',
              startTime: '06:00',
              endTime: '22:00',
              days: [1, 2, 3, 4, 5], // Montag-Freitag
              description: 'Heizung während Arbeitszeiten',
            },
            {
              name: 'Wochenende',
              startTime: '08:00',
              endTime: '23:00',
              days: [6, 0], // Samstag-Sonntag
              description: 'Heizung am Wochenende',
            },
          ],
        })
        break
      }

      case 'ACTUATOR_FAN': {
        recommendations.push({
          type: 'schedule',
          priority: 'medium',
          message: 'Lüftungszeiten für Luftqualität',
          action: 'add_ventilation_schedule',
          suggestedTimers: [
            {
              name: 'Stoßlüftung',
              startTime: '08:00',
              endTime: '08:15',
              days: [1, 2, 3, 4, 5, 6, 0],
              description: 'Morgendliche Stoßlüftung',
            },
            {
              name: 'Mittagslüftung',
              startTime: '12:00',
              endTime: '12:15',
              days: [1, 2, 3, 4, 5, 6, 0],
              description: 'Mittägliche Stoßlüftung',
            },
          ],
        })
        break
      }
    }

    return recommendations
  }

  // 🆕 NEU: Sicherheits-Empfehlungen generieren
  generateSafetyRecommendations(espId, gpio, actuatorType, currentLogic = null) {
    const recommendations = []

    // Aktor-Typ-spezifische Sicherheitsempfehlungen
    switch (actuatorType) {
      case 'ACTUATOR_PUMP': {
        recommendations.push({
          type: 'safety',
          priority: 'critical',
          message: 'Failsafe-Modus aktivieren (Pumpe aus bei Fehler)',
          action: 'enable_failsafe',
          details: 'Verhindert Überflutungen bei Systemfehlern',
        })

        if (!currentLogic?.failsafeEnabled) {
          recommendations.push({
            type: 'safety',
            priority: 'critical',
            message: 'Failsafe-Modus ist deaktiviert',
            action: 'enable_failsafe_immediately',
            details: 'Aktivieren Sie den Failsafe-Modus für Überflutungsschutz',
          })
        }

        recommendations.push({
          type: 'safety',
          priority: 'high',
          message: 'Maximale Laufzeit begrenzen',
          action: 'add_max_runtime',
          details: 'Verhindert Dauerbetrieb der Pumpe',
        })
        break
      }

      case 'ACTUATOR_HEATER': {
        recommendations.push({
          type: 'safety',
          priority: 'critical',
          message: 'Failsafe-Modus aktivieren (Heizung aus bei Fehler)',
          action: 'enable_failsafe',
          details: 'Verhindert Überhitzung bei Systemfehlern',
        })

        recommendations.push({
          type: 'safety',
          priority: 'high',
          message: 'Maximale Temperatur begrenzen',
          action: 'add_max_temperature',
          details: 'Verhindert Überhitzung der Umgebung',
        })
        break
      }

      case 'ACTUATOR_LED': {
        recommendations.push({
          type: 'safety',
          priority: 'medium',
          message: 'Maximale Betriebszeit begrenzen',
          action: 'add_max_uptime',
          details: 'Verhindert Dauerbetrieb der LEDs',
        })
        break
      }

      case 'ACTUATOR_FAN': {
        recommendations.push({
          type: 'safety',
          priority: 'medium',
          message: 'Maximale Laufzeit begrenzen',
          action: 'add_max_runtime',
          details: 'Verhindert Dauerbetrieb des Lüfters',
        })
        break
      }
    }

    // Allgemeine Sicherheitsempfehlungen
    recommendations.push({
      type: 'safety',
      priority: 'medium',
      message: 'Regelmäßige Wartungsintervalle einplanen',
      action: 'add_maintenance_schedule',
      details: 'Sichert langfristige Funktionsfähigkeit',
    })

    return recommendations
  }

  // 🆕 NEU: Performance-Empfehlungen generieren
  generatePerformanceRecommendations(espId, gpio, actuatorType, currentLogic = null) {
    const recommendations = []

    // Auswertungsintervall optimieren
    if (currentLogic?.evaluationInterval) {
      const interval = currentLogic.evaluationInterval

      if (interval < 10000) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          message: 'Auswertungsintervall zu kurz (Performance-Risiko)',
          action: 'increase_interval',
          details: `Aktuell: ${interval}ms, Empfohlen: mindestens 10.000ms`,
        })
      } else if (interval > 300000) {
        recommendations.push({
          type: 'performance',
          priority: 'medium',
          message: 'Auswertungsintervall zu lang (Reaktionszeit-Risiko)',
          action: 'decrease_interval',
          details: `Aktuell: ${interval}ms, Empfohlen: maximal 300.000ms`,
        })
      }
    }

    // Aktor-Typ-spezifische Performance-Empfehlungen
    switch (actuatorType) {
      case 'ACTUATOR_PUMP': {
        recommendations.push({
          type: 'performance',
          priority: 'medium',
          message: 'Bewässerungszyklen optimieren',
          action: 'optimize_watering_cycles',
          details: 'Kürzere, häufige Bewässerung statt langer Intervalle',
        })
        break
      }

      case 'ACTUATOR_LED': {
        recommendations.push({
          type: 'performance',
          priority: 'low',
          message: 'LED-Dimming für Energieeffizienz',
          action: 'add_led_dimming',
          details: 'Reduziert Energieverbrauch und verlängert Lebensdauer',
        })
        break
      }

      case 'ACTUATOR_HEATER': {
        recommendations.push({
          type: 'performance',
          priority: 'medium',
          message: 'Heizungszyklen optimieren',
          action: 'optimize_heating_cycles',
          details: 'Verhindert häufiges Ein-/Ausschalten',
        })
        break
      }
    }

    return recommendations
  }

  // 🆕 NEU: Zone-spezifische Empfehlungen
  generateZoneSpecificRecommendations(zoneId, actuatorType) {
    const recommendations = []

    // Zone-Typ-basierte Empfehlungen
    const zoneType = this.getZoneType(zoneId)

    switch (zoneType) {
      case 'greenhouse': {
        if (actuatorType === 'ACTUATOR_PUMP') {
          recommendations.push({
            type: 'zone_specific',
            priority: 'high',
            message: 'Gewächshaus-spezifische Bewässerung',
            action: 'greenhouse_watering',
            details: 'Angepasste Bewässerung für Gewächshaus-Umgebung',
          })
        }
        break
      }

      case 'outdoor': {
        if (actuatorType === 'ACTUATOR_PUMP') {
          recommendations.push({
            type: 'zone_specific',
            priority: 'medium',
            message: 'Regensensor für Außenbewässerung',
            action: 'add_rain_sensor',
            details: 'Verhindert Bewässerung bei Regen',
          })
        }
        break
      }

      case 'indoor': {
        if (actuatorType === 'ACTUATOR_HEATER') {
          recommendations.push({
            type: 'zone_specific',
            priority: 'medium',
            message: 'Raumtemperatur-Optimierung',
            action: 'indoor_temperature_optimization',
            details: 'Angepasste Heizung für Innenräume',
          })
        }
        break
      }
    }

    return recommendations
  }

  // 🆕 NEU: Zone-Typ ermitteln
  getZoneType(zoneId) {
    // Vereinfachte Zone-Typ-Erkennung
    if (zoneId?.includes('greenhouse') || zoneId?.includes('gewächshaus')) {
      return 'greenhouse'
    } else if (zoneId?.includes('outdoor') || zoneId?.includes('außen')) {
      return 'outdoor'
    } else if (zoneId?.includes('indoor') || zoneId?.includes('innen')) {
      return 'indoor'
    }
    return 'unknown'
  }

  // 🆕 NEU: Vollständige Empfehlungen generieren
  generateCompleteRecommendations(espId, gpio, actuatorType, zoneId = null, currentLogic = null) {
    const recommendations = {
      defaults: this.generateDefaultValues(espId, gpio, actuatorType),
      sensors: this.generateSensorRecommendations(espId, gpio, actuatorType, zoneId),
      timers: this.generateTimerRecommendations(espId, gpio, actuatorType),
      safety: this.generateSafetyRecommendations(espId, gpio, actuatorType, currentLogic),
      performance: this.generatePerformanceRecommendations(espId, gpio, actuatorType, currentLogic),
      summary: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    }

    // Zusammenfassung generieren
    const allRecommendations = [
      ...recommendations.sensors,
      ...recommendations.timers,
      ...recommendations.safety,
      ...recommendations.performance,
    ]

    recommendations.summary.total = allRecommendations.length
    recommendations.summary.critical = allRecommendations.filter(
      (r) => r.priority === 'critical',
    ).length
    recommendations.summary.high = allRecommendations.filter((r) => r.priority === 'high').length
    recommendations.summary.medium = allRecommendations.filter(
      (r) => r.priority === 'medium',
    ).length
    recommendations.summary.low = allRecommendations.filter((r) => r.priority === 'low').length

    return recommendations
  }
}

// 🆕 NEU: Singleton-Instanz
export const logicRecommendations = new LogicRecommendations()
