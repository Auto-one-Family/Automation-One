/**
 * Benutzerfreundliche Terminologie-Utilities
 * Erweitert das bestehende Tooltip-System um konsistente Begriffsverwendung
 */

import { translateTerm } from './tooltipTexts'

/**
 * Zentrale Terminologie-Definitionen für das gesamte System
 */
export const userFriendlyTerms = {
  // Technische Begriffe → Benutzerfreundlich
  mqtt: 'Echtzeit-Verbindung',
  broker: 'Verbindung',
  httpPort: 'Daten-Port',
  websocket: 'Live-Verbindung',
  topic: 'Nachrichtenkanal',

  // System-Begriffe
  kaiser: 'Edge Controller',
  godPi: 'Zentrale Steuerung',
  esp: 'Agent',
  espPlural: 'Agenten',
  bibliothek: 'Bibliothek',
  edgeComputer: 'Edge Controller',

  // ✅ NEU: Kaiser-spezifische Begriffe
  pi0Server: 'Pi0-Server',
  godConnection: 'God-Verbindung',
  libraries: 'Bibliotheken',
  dashboardLogics: 'Dashboard-Logiken',

  // ✅ NEU: Status-Begriffe
  pi0ServerStatus: 'Pi0-Server Status',
  godConnectionStatus: 'God-Verbindungs Status',
  agentStatus: 'Agenten Status',
  libraryStatus: 'Bibliotheken Status',

  // Status-Begriffe
  connected: 'Verbunden',
  disconnected: 'Nicht verbunden',
  syncStatus: 'Synchronisiert',
  autonomous: 'Autonom',

  // Geräte-Begriffe
  fieldDevice: 'Agent',
  fieldDevices: 'Agenten',
  device: 'Gerät',
  devices: 'Geräte',

  // 🆕 NEU: Agent-spezifische Begriffe
  agent: 'Agent',
  agents: 'Agenten',
  unconfigured: 'Nicht konfiguriert',
  configured: 'Konfiguriert',
  agentAssignment: 'Agent-Zuweisung',
  removeFromZone: 'Aus Zone entfernen',
  addToZone: 'Zu Zone hinzufügen',
  configureAgent: 'Agent konfigurieren',
  moveAgent: 'Agent verschieben',

  // Navigation
  home: 'Hauptübersicht',
  dashboard: 'Dashboard',
  settings: 'Einstellungen',
  zones: 'Agenten',
  development: 'Entwickler-Tools',

  // Aktionen
  configure: 'Konfigurieren',
  restart: 'Neustart',
  sync: 'Synchronisieren',
  save: 'Speichern',
  cancel: 'Abbrechen',
  delete: 'Löschen',
}

/**
 * Übersetzt technische Begriffe in benutzerfreundliche Begriffe
 * @param {string} technicalTerm - Technischer Begriff
 * @returns {string} Benutzerfreundlicher Begriff
 */
export function getFriendlyTerm(technicalTerm) {
  return translateTerm(technicalTerm)
}

/**
 * Erstellt eine benutzerfreundliche Geräte-Bezeichnung
 * @param {string} deviceType - Gerätetyp ('kaiser', 'esp', 'god')
 * @param {string} deviceId - Geräte-ID
 * @param {string} customName - Benutzerdefinierter Name (optional)
 * @returns {string} Benutzerfreundliche Bezeichnung
 */
export function getFriendlyDeviceName(deviceType, deviceId, customName = null) {
  if (customName) {
    return customName
  }

  const typeNames = {
    kaiser: 'Kaiser',
    esp: 'Agent',
    god: 'Zentrale Steuerung',
  }

  const typeName = typeNames[deviceType] || deviceType.toUpperCase()

  // Für Kaiser: Verwende dynamischen Namen basierend auf ID
  if (deviceType === 'kaiser') {
    // Extrahiere den Namen aus der Kaiser-ID (z.B. "kaiser_mein_system" -> "Mein System")
    const namePart = deviceId.replace(/^kaiser_/, '').replace(/_/g, ' ')
    const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1)
    return `Kaiser ${displayName}`
  }

  return `${typeName} ${deviceId}`
}

/**
 * Erstellt eine benutzerfreundliche System-Bezeichnung basierend auf Kontext
 * @param {Object} context - System-Kontext
 * @returns {string} Benutzerfreundliche System-Bezeichnung
 */
export function getSystemDisplayName(context = {}) {
  const { kaiserId, godName, isKaiserMode } = context

  if (isKaiserMode && kaiserId && kaiserId !== 'default_kaiser') {
    return `Edge Controller ${kaiserId}`
  }

  if (godName && godName !== 'Mein IoT System') {
    return godName
  }

  return 'Growy System'
}

/**
 * Erstellt benutzerfreundliche Menü-Labels
 * @param {string} menuKey - Menü-Schlüssel
 * @returns {string} Benutzerfreundliches Label
 */
export function getMenuLabel(menuKey) {
  const menuLabels = {
    home: 'Hauptübersicht',
    dashboard: 'Dashboard',
    settings: 'Einstellungen',
    zones: 'Agenten',
    devices: 'Geräteverwaltung',
    development: 'Entwickler-Tools',
    debug: 'Debug',
  }

  return menuLabels[menuKey] || menuKey
}

/**
 * Erstellt benutzerfreundliche Status-Beschreibungen
 * @param {string} status - Technischer Status
 * @returns {string} Benutzerfreundliche Beschreibung
 */
export function getStatusDescription(status) {
  const statusDescriptions = {
    online: 'Online',
    offline: 'Offline',
    connected: 'Verbunden',
    disconnected: 'Nicht verbunden',
    operational: 'Betriebsbereit',
    error: 'Fehler',
    warning: 'Warnung',
    info: 'Information',
    success: 'Erfolgreich',
    autonomous: 'Autonom',
    supervised: 'Überwacht',
  }

  return statusDescriptions[status] || status
}

/**
 * Erstellt benutzerfreundliche Verbindungs-Beschreibungen
 * @param {string} connectionType - Verbindungstyp
 * @returns {string} Benutzerfreundliche Beschreibung
 */
export function getConnectionDescription(connectionType) {
  const connectionDescriptions = {
    mqtt: 'Echtzeit-Verbindung',
    http: 'Daten-Verbindung',
    websocket: 'Live-Verbindung',
    wifi: 'WLAN-Verbindung',
    ethernet: 'Kabel-Verbindung',
  }

  return connectionDescriptions[connectionType] || connectionType
}

/**
 * Erstellt benutzerfreundliche Port-Beschreibungen
 * @param {string} portType - Port-Typ
 * @returns {string} Benutzerfreundliche Beschreibung
 */
export function getPortDescription(portType) {
  const portDescriptions = {
    http: 'Daten-Port',
    mqtt: 'Echtzeit-Port',
    websocket: 'Live-Port',
    api: 'API-Port',
  }

  return portDescriptions[portType] || portType
}

/**
 * Erstellt benutzerfreundliche Aktion-Beschreibungen
 * @param {string} action - Aktion
 * @returns {string} Benutzerfreundliche Beschreibung
 */
export function getActionDescription(action) {
  const actionDescriptions = {
    configure: 'Konfigurieren',
    restart: 'Neustart',
    sync: 'Synchronisieren',
    save: 'Speichern',
    cancel: 'Abbrechen',
    delete: 'Löschen',
    edit: 'Bearbeiten',
    add: 'Hinzufügen',
    remove: 'Entfernen',
    enable: 'Aktivieren',
    disable: 'Deaktivieren',
    test: 'Testen',
    refresh: 'Aktualisieren',
  }

  return actionDescriptions[action] || action
}

/**
 * Erstellt benutzerfreundliche Fehler-Beschreibungen
 * @param {string} errorType - Fehlertyp
 * @returns {string} Benutzerfreundliche Beschreibung
 */
export function getErrorDescription(errorType) {
  const errorDescriptions = {
    connection: 'Verbindungsfehler',
    timeout: 'Zeitüberschreitung',
    notFound: 'Nicht gefunden',
    unauthorized: 'Nicht autorisiert',
    forbidden: 'Zugriff verweigert',
    serverError: 'Server-Fehler',
    networkError: 'Netzwerk-Fehler',
    validationError: 'Eingabefehler',
  }

  return errorDescriptions[errorType] || errorType
}

/**
 * Erstellt benutzerfreundliche Zeit-Beschreibungen
 * @param {number} timestamp - Unix-Timestamp
 * @returns {string} Benutzerfreundliche Zeit-Beschreibung
 */
export function getTimeDescription(timestamp) {
  if (!timestamp) return 'Nie'

  const now = Date.now()
  const diff = now - timestamp

  if (diff < 60000) return 'Gerade eben'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} Minuten`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} Stunden`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} Tage`

  return new Date(timestamp).toLocaleDateString('de-DE')
}

/**
 * Erstellt benutzerfreundliche Größen-Beschreibungen
 * @param {number} bytes - Bytes
 * @returns {string} Benutzerfreundliche Größen-Beschreibung
 */
export function getSizeDescription(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
