import { format } from 'date-fns'

export const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'N/A'
  return format(new Date(timestamp), 'HH:mm:ss')
}

export const formatDateTime = (timestamp) => {
  if (!timestamp) return 'N/A'
  return format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss')
}

export const formatRelativeTime = (timestamp) => {
  if (!timestamp) return 'N/A'
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 1000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss')
}

export const formatISOTimestamp = (timestamp) => {
  if (!timestamp) return 'N/A'
  return new Date(timestamp).toISOString()
}

// ✅ NEU: Unix-Timestamp-Konvertierung für Option B
export const convertUnixToMillis = (unixTimestamp) => {
  if (!unixTimestamp) return null

  // Prüfe ob bereits Millisekunden (13 Stellen) oder Sekunden (10 Stellen)
  const timestampStr = unixTimestamp.toString()
  if (timestampStr.length === 13) {
    // Bereits Millisekunden
    return unixTimestamp
  } else if (timestampStr.length === 10) {
    // Sekunden zu Millisekunden konvertieren
    return unixTimestamp * 1000
  } else {
    // Unbekanntes Format - als Millisekunden behandeln
    console.warn(`Unknown timestamp format: ${unixTimestamp}, treating as milliseconds`)
    return unixTimestamp
  }
}

// ✅ NEU: Aktueller Unix-Timestamp in Sekunden
export const getCurrentUnixTimestamp = () => {
  return Math.floor(Date.now() / 1000)
}

// ✅ NEU: Aktueller Unix-Timestamp in Millisekunden
export const getCurrentUnixTimestampMillis = () => {
  return Date.now()
}

// ✅ NEU: Unix-Timestamp zu lesbarem Format
export const formatUnixTimestamp = (unixTimestamp, formatType = 'relative') => {
  const millis = convertUnixToMillis(unixTimestamp)
  if (!millis) return 'N/A'

  switch (formatType) {
    case 'relative':
      return formatRelativeTime(millis)
    case 'datetime':
      return formatDateTime(millis)
    case 'iso':
      return formatISOTimestamp(millis)
    case 'timestamp':
      return formatTimestamp(millis)
    default:
      return formatRelativeTime(millis)
  }
}

// ✅ NEU: Dauer-Formatierung für SafeMode und andere Zeiträume
export const formatDuration = (milliseconds) => {
  if (!milliseconds) return 'N/A'

  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

// 🆕 NEU: Zeit-Konvertierung für Timer-Logik
export const timeToMinutes = (timeString) => {
  try {
    // Validierung vor Konvertierung
    const validation = validateTimeString(timeString)
    if (!validation.valid) {
      console.warn(`Ungültige Zeit erkannt: ${timeString} - ${validation.error}`)
      // Fallback auf 08:00 statt Error werfen
      return 8 * 60
    }

    const [hours, minutes] = timeString.split(':').map(Number)
    return hours * 60 + minutes
  } catch (error) {
    console.error(`Fehler bei Zeit-Konvertierung: ${timeString}`, error)
    // Fallback auf 08:00 bei jedem Fehler
    return 8 * 60
  }
}

export const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

// 🆕 KRITISCH: Zeit-Validierung für Timer-Komponenten
export const validateTimeString = (timeString) => {
  if (!timeString || typeof timeString !== 'string') {
    return { valid: false, error: 'Zeit-Wert ist erforderlich' }
  }

  const timePattern = /^([01]?\d|2[0-3]):([0-5]?\d)$/
  if (!timePattern.test(timeString)) {
    return { valid: false, error: 'Ungültiges Zeit-Format (HH:MM erwartet)' }
  }

  const [hours, minutes] = timeString.split(':').map(Number)
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return { valid: false, error: 'Zeit außerhalb des gültigen Bereichs (00:00-23:59)' }
  }

  return { valid: true, error: null }
}

export const validateTimeRange = (startTime, endTime) => {
  const startValidation = validateTimeString(startTime)
  if (!startValidation.valid) {
    return { valid: false, error: `Start-Zeit: ${startValidation.error}` }
  }

  const endValidation = validateTimeString(endTime)
  if (!endValidation.valid) {
    return { valid: false, error: `End-Zeit: ${endValidation.error}` }
  }

  const startMinutes = timeToMinutes(startTime)
  const endMinutes = timeToMinutes(endTime)

  if (startMinutes >= endMinutes) {
    return { valid: false, error: 'Start-Zeit muss vor End-Zeit liegen' }
  }

  return { valid: true, error: null }
}
