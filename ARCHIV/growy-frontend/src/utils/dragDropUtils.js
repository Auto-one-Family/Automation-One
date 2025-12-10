// ✅ NEU: Zentrale Drag & Drop Utilities für einheitliche Datenformate
export const createDragData = (type, data) => {
  const baseData = {
    type,
    timestamp: Date.now(),
    source: 'growy-frontend',
  }

  switch (type) {
    case 'pin':
      return {
        ...baseData,
        pin: data.pin,
        espId: data.espId,
        subzoneId: data.subzoneId,
      }
    case 'zone':
      return {
        ...baseData,
        zoneId: data.zoneId,
        zoneName: data.zoneName,
      }
    case 'sensor':
      return {
        ...baseData,
        sensorId: data.sensorId,
        espId: data.espId,
        gpio: data.gpio,
      }
    case 'actuator':
      return {
        ...baseData,
        actuatorId: data.actuatorId,
        espId: data.espId,
        gpio: data.gpio,
      }
    case 'logic-template':
      return {
        ...baseData,
        template: data.template,
      }
    default:
      return { ...baseData, ...data }
  }
}

export const parseDragData = (event) => {
  try {
    const data = JSON.parse(event.dataTransfer.getData('application/json'))
    return data
  } catch (error) {
    console.error('Invalid drag data:', error)
    return null
  }
}

export const validateDragData = (data, expectedType) => {
  if (!data || !data.type) {
    return { valid: false, reason: 'Ungültige Drag-Daten' }
  }

  if (expectedType && data.type !== expectedType) {
    return { valid: false, reason: `Erwarteter Typ: ${expectedType}, Erhalten: ${data.type}` }
  }

  // Typ-spezifische Validierung
  switch (data.type) {
    case 'pin':
      if (!data.pin || !data.espId) {
        return { valid: false, reason: 'Pin-Daten unvollständig' }
      }
      break
    case 'zone':
      if (!data.zoneId) {
        return { valid: false, reason: 'Zone-ID fehlt' }
      }
      break
    case 'sensor':
      if (!data.espId || !data.gpio) {
        return { valid: false, reason: 'Sensor-Daten unvollständig' }
      }
      break
    case 'actuator':
      if (!data.espId || !data.gpio) {
        return { valid: false, reason: 'Aktor-Daten unvollständig' }
      }
      break
  }

  return { valid: true, reason: null }
}

export const setDragEffect = (event, effect = 'copy') => {
  event.dataTransfer.effectAllowed = effect
  event.dataTransfer.dropEffect = effect
}

export const createPinDragData = (pin, espId, subzoneId = null) => {
  return createDragData('pin', {
    pin,
    espId,
    subzoneId,
  })
}

export const createZoneDragData = (zoneId, zoneName) => {
  return createDragData('zone', {
    zoneId,
    zoneName,
  })
}

export const createSensorDragData = (sensorId, espId, gpio) => {
  return createDragData('sensor', {
    sensorId,
    espId,
    gpio,
  })
}

export const createActuatorDragData = (actuatorId, espId, gpio) => {
  return createDragData('actuator', {
    actuatorId,
    espId,
    gpio,
  })
}
