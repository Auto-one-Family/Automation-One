// ✅ NEU: Zentrale Datenvalidierung für Konsistenz und Rückwärtskompatibilität

/**
 * Validiert Pin-Datenstrukturen für Konsistenz
 * @param {Object} pinData - Pin-Daten zu validieren
 * @param {string} source - Quelle der Daten (z.B. 'espManagement', 'pinDragDropZone')
 * @returns {Object} Validierungsergebnis
 */
export const validatePinData = (pinData, source = 'unknown') => {
  const errors = []
  const warnings = []

  // Basis-Validierung
  if (!pinData || typeof pinData !== 'object') {
    return {
      valid: false,
      errors: ['Pin-Daten müssen ein Objekt sein'],
      warnings: [],
      source,
    }
  }

  // Erforderliche Felder
  if (!pinData.gpio || typeof pinData.gpio !== 'number') {
    errors.push('GPIO muss eine Zahl sein')
  }

  if (!pinData.type || typeof pinData.type !== 'string') {
    errors.push('Pin-Typ muss ein String sein')
  }

  if (!pinData.name || typeof pinData.name !== 'string') {
    errors.push('Pin-Name muss ein String sein')
  }

  // Subzone-Validierung (beide Eigenschaften prüfen)
  const hasSubzoneId = pinData.subzoneId !== undefined
  const hasSubzone = pinData.subzone !== undefined

  if (!hasSubzoneId && !hasSubzone) {
    warnings.push('Keine Subzone-Referenz gefunden (subzoneId oder subzone)')
  }

  if (hasSubzoneId && hasSubzone) {
    warnings.push('Beide Subzone-Eigenschaften vorhanden (subzoneId und subzone)')
  }

  // GPIO-Bereich-Validierung
  if (pinData.gpio !== undefined) {
    if (pinData.gpio < 0 || pinData.gpio > 40) {
      warnings.push(`GPIO ${pinData.gpio} außerhalb des üblichen Bereichs (0-40)`)
    }
  }

  // Typ-Validierung
  if (pinData.type) {
    const validTypes = [
      'SENSOR_TEMP_DS18B20',
      'SENSOR_SOIL',
      'SENSOR_FLOW',
      'SENSOR_HUMIDITY',
      'SENSOR_PRESSURE',
      'SENSOR_LIGHT',
      'AKTOR_RELAIS',
      'AKTOR_PUMP',
      'AKTOR_VALVE',
      'AKTOR_HUMIDIFIER',
      'AKTOR_FAN',
      'AKTOR_LIGHT',
    ]

    if (!validTypes.includes(pinData.type)) {
      warnings.push(`Unbekannter Pin-Typ: ${pinData.type}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    source,
    normalized: normalizePinData(pinData),
  }
}

/**
 * Normalisiert Pin-Daten für einheitliche Struktur
 * @param {Object} pinData - Zu normalisierende Pin-Daten
 * @returns {Object} Normalisierte Pin-Daten
 */
export const normalizePinData = (pinData) => {
  const normalized = {
    gpio: pinData.gpio,
    type: pinData.type,
    name: pinData.name,
    category: pinData.category || (pinData.type?.startsWith('SENSOR_') ? 'sensor' : 'actuator'),
  }

  // Subzone-Referenz normalisieren
  if (pinData.subzoneId !== undefined) {
    normalized.subzoneId = pinData.subzoneId
  }
  if (pinData.subzone !== undefined) {
    normalized.subzone = pinData.subzone
  }

  // Zusätzliche Eigenschaften beibehalten
  if (pinData.sensorType) normalized.sensorType = pinData.sensorType
  if (pinData.actuatorType) normalized.actuatorType = pinData.actuatorType
  if (pinData.espId) normalized.espId = pinData.espId

  return normalized
}

/**
 * Validiert ESP-Gerätedaten
 * @param {Object} espData - ESP-Daten zu validieren
 * @returns {Object} Validierungsergebnis
 */
export const validateEspData = (espData) => {
  const errors = []
  const warnings = []

  if (!espData || typeof espData !== 'object') {
    return {
      valid: false,
      errors: ['ESP-Daten müssen ein Objekt sein'],
      warnings: [],
    }
  }

  if (!espData.espId || typeof espData.espId !== 'string') {
    errors.push('ESP-ID muss ein String sein')
  }

  if (espData.subzones && !Array.isArray(espData.subzones)) {
    warnings.push('Subzones sollten ein Array sein')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validiert Drag & Drop Daten
 * @param {Object} dragData - Drag-Daten zu validieren
 * @param {string} expectedType - Erwarteter Typ
 * @returns {Object} Validierungsergebnis
 */
export const validateDragData = (dragData, expectedType = null) => {
  const errors = []
  const warnings = []

  if (!dragData || typeof dragData !== 'object') {
    return {
      valid: false,
      errors: ['Drag-Daten müssen ein Objekt sein'],
      warnings: [],
    }
  }

  if (!dragData.type || typeof dragData.type !== 'string') {
    errors.push('Drag-Typ muss ein String sein')
  }

  if (expectedType && dragData.type !== expectedType) {
    errors.push(`Erwarteter Typ: ${expectedType}, Erhalten: ${dragData.type}`)
  }

  // Typ-spezifische Validierung
  switch (dragData.type) {
    case 'pin':
      if (!dragData.pin || !dragData.espId) {
        errors.push('Pin-Daten unvollständig (pin und espId erforderlich)')
      }
      break
    case 'zone':
      if (!dragData.zoneId) {
        errors.push('Zone-ID fehlt')
      }
      break
    case 'sensor':
    case 'actuator':
      if (!dragData.espId || !dragData.gpio) {
        errors.push(`${dragData.type}-Daten unvollständig (espId und gpio erforderlich)`)
      }
      break
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validiert Konfigurationsdaten für Mindmap vs UnifiedDeviceDialog
 * @param {Object} configData - Konfigurationsdaten
 * @param {string} configType - Konfigurationstyp
 * @returns {Object} Validierungsergebnis
 */
export const validateConfigData = (configData, configType) => {
  const errors = []
  const warnings = []

  if (!configData || typeof configData !== 'object') {
    return {
      valid: false,
      errors: ['Konfigurationsdaten müssen ein Objekt sein'],
      warnings: [],
    }
  }

  const validConfigTypes = ['god', 'kaiser', 'zone', 'esp', 'mindmap']
  if (!validConfigTypes.includes(configType)) {
    errors.push(`Ungültiger Konfigurationstyp: ${configType}`)
  }

  // Typ-spezifische Validierung
  switch (configType) {
    case 'esp':
      if (!configData.espId) {
        errors.push('ESP-ID fehlt')
      }
      break
    case 'kaiser':
      if (!configData.kaiserId) {
        errors.push('Kaiser-ID fehlt')
      }
      break
    case 'zone':
      if (!configData.name) {
        errors.push('Zonen-Name fehlt')
      }
      break
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Erstellt einen Validierungsbericht für die gesamte Anwendung
 * @param {Object} data - Zu validierende Daten
 * @returns {Object} Validierungsbericht
 */
export const createValidationReport = (data) => {
  const report = {
    timestamp: new Date().toISOString(),
    totalErrors: 0,
    totalWarnings: 0,
    sections: {},
  }

  // Pin-Daten validieren
  if (data.pins && Array.isArray(data.pins)) {
    const pinValidation = data.pins.map((pin) => validatePinData(pin, 'validationReport'))
    report.sections.pins = {
      total: data.pins.length,
      valid: pinValidation.filter((v) => v.valid).length,
      errors: pinValidation.reduce((acc, v) => acc + v.errors.length, 0),
      warnings: pinValidation.reduce((acc, v) => acc + v.warnings.length, 0),
      details: pinValidation,
    }
    report.totalErrors += report.sections.pins.errors
    report.totalWarnings += report.sections.pins.warnings
  }

  // ESP-Daten validieren
  if (data.esps && Array.isArray(data.esps)) {
    const espValidation = data.esps.map((esp) => validateEspData(esp))
    report.sections.esps = {
      total: data.esps.length,
      valid: espValidation.filter((v) => v.valid).length,
      errors: espValidation.reduce((acc, v) => acc + v.errors.length, 0),
      warnings: espValidation.reduce((acc, v) => acc + v.warnings.length, 0),
      details: espValidation,
    }
    report.totalErrors += report.sections.esps.errors
    report.totalWarnings += report.sections.esps.warnings
  }

  return report
}
