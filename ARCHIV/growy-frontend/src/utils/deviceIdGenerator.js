/**
 * Einheitliche ID-Generierung für alle Gerätetypen
 * Basierend auf bestehenden Strukturen in centralConfig.js und mqtt.js
 */

/**
 * Generiert eine technische ID aus einem benutzerfreundlichen Namen
 * @param {string} friendlyName - Benutzerfreundlicher Name
 * @param {string} type - Gerätetyp (device, kaiser, esp, god)
 * @returns {string} Technische ID
 */
export function generateDeviceId(friendlyName, type = 'device') {
  if (!friendlyName || typeof friendlyName !== 'string') return `${type}_default`

  return friendlyName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Umlaute entfernen
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_') // Sonderzeichen zu _
    .replace(/_+/g, '_') // Mehrfache _ zu einem
    .replace(/^_|_$/g, '') // Anfang/Ende _ entfernen
}

/**
 * Generiert eine Kaiser-ID aus einem benutzerfreundlichen Namen
 * @param {string} friendlyName - Benutzerfreundlicher Kaiser-Name
 * @returns {string} Kaiser-ID
 */
export function generateKaiserId(friendlyName) {
  return `kaiser_${generateDeviceId(friendlyName, 'kaiser')}`
}

/**
 * Generiert eine God-ID aus einem God-Namen
 * @param {string} godName - God-Name
 * @returns {string} God-ID
 */
export function generateGodId(godName) {
  return `god_${generateDeviceId(godName, 'god')}`
}

/**
 * Generiert eine God-Kaiser-ID (God-ID = Kaiser-ID für God)
 * @param {string} godName - God-Name
 * @returns {string} God-Kaiser-ID
 */
export function generateGodKaiserId(godName) {
  // ✅ KORRIGIERT: Verwende "god_kaiser_" Prefix für Unterscheidung von God-ID
  return `god_kaiser_${generateDeviceId(godName, 'god')}`
}

/**
 * Generiert eine ESP-ID aus einem benutzerfreundlichen Namen
 * @param {string} friendlyName - Benutzerfreundlicher ESP-Name
 * @returns {string} ESP-ID
 */
export function generateEspId(friendlyName) {
  return generateDeviceId(friendlyName, 'esp')
}

/**
 * Validiert eine generierte ID
 * @param {string} id - Zu validierende ID
 * @returns {boolean} True wenn gültig
 */
export function isValidDeviceId(id) {
  if (!id || typeof id !== 'string') return false

  // Mindestlänge 3, maximal 50 Zeichen
  if (id.length < 3 || id.length > 50) return false

  // Nur Kleinbuchstaben, Zahlen und Unterstriche erlaubt
  if (!/^[a-z0-9_]+$/.test(id)) return false

  // Nicht mit Zahl beginnen
  if (/^\d/.test(id)) return false

  return true
}

/**
 * Prüft ob eine ID bereits existiert
 * @param {string} id - Zu prüfende ID
 * @param {Array} existingIds - Array existierender IDs
 * @returns {boolean} True wenn ID bereits existiert
 */
export function isDeviceIdConflict(id, existingIds = []) {
  return existingIds.includes(id)
}

/**
 * Generiert eine eindeutige ID mit Fallback
 * @param {string} friendlyName - Benutzerfreundlicher Name
 * @param {string} type - Gerätetyp
 * @param {Array} existingIds - Array existierender IDs
 * @returns {string} Eindeutige ID
 */
export function generateUniqueDeviceId(friendlyName, type = 'device', existingIds = []) {
  let baseId = generateDeviceId(friendlyName, type)
  let uniqueId = baseId
  let counter = 1

  // Füge Zähler hinzu bis ID eindeutig ist
  while (isDeviceIdConflict(uniqueId, existingIds)) {
    uniqueId = `${baseId}_${counter}`
    counter++
  }

  return uniqueId
}

/**
 * Formatiert eine ID für die Anzeige
 * @param {string} id - Technische ID
 * @returns {string} Formatierte ID für Anzeige
 */
export function formatDeviceIdForDisplay(id) {
  if (!id) return 'Unbekannt'

  return id.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

/**
 * Extrahiert den ursprünglichen Namen aus einer ID
 * @param {string} id - Technische ID
 * @param {string} type - Gerätetyp
 * @returns {string} Ursprünglicher Name
 */
export function extractNameFromDeviceId(id, type = 'device') {
  if (!id) return ''

  // Entferne Typ-Prefix
  let name = id
  if (type === 'kaiser' && id.startsWith('kaiser_')) {
    name = id.substring(7)
  } else if (type === 'god' && id.startsWith('god_')) {
    name = id.substring(4)
  }

  // Konvertiere zurück zu lesbarem Namen
  return name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}
