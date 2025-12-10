/**
 * Zentrale Tooltip-Texte - menschlich und benutzerfreundlich
 */

export const tooltipTexts = {
  // Geräte-Grundlagen
  deviceName: {
    label: 'Gerätename',
    hint: 'Gib diesem Agent einen Namen, den du leicht wiedererkennst.',
  },

  deviceZone: {
    label: 'Zone',
    hint: 'Wo steht oder wirkt dieses Gerät? Wähle eine existierende Zone.',
  },

  // Verbindung
  connection: {
    test: 'Verbindung zum Gerät testen',
    reconnect: 'Verbindung erneuern',
    status: 'Aktueller Verbindungsstatus',
  },

  // Health & Status
  health: {
    status: 'Wie gut funktioniert dein Gerät?',
    details: 'Detaillierte Informationen zum Gerätestatus',
  },

  safeMode: {
    label: 'Gerät meldet, dass es nur eingeschränkt funktioniert',
    disable: 'Safe Mode deaktivieren - Gerät kann wieder normal arbeiten',
    enable: 'Safe Mode aktivieren - Nur für Notfälle',
  },

  // Aktionen
  actions: {
    restart: 'Neustart des Geräts durchführen',
    configure: 'Erweiterte Einstellungen öffnen',
    settings: 'Zur erweiterten Geräteverwaltung',
    zoneChange: 'Zone für dieses Gerät ändern',
    sync: 'Mit übergeordnetem System synchronisieren',
    autonomous: 'Autonomen Modus umschalten',
    add: 'Neues Gerät hinzufügen',
  },

  // Technische Details (nur für Fortgeschrittene)
  technical: {
    ipAddress: 'IP-Adresse (nur für manuelle Konfiguration)',
    port: 'Verbindungsport (nur für Fortgeschrittene)',
    mqttPrefix: 'MQTT-Topic-Präfix (nur für Experten)',
    deviceId: 'Eindeutige Geräte-ID (automatisch generiert)',
    firmware: 'Firmware-Version und Update-Status',
  },

  // System-Architektur
  system: {
    godPi: 'Zentrale Steuerung für große Systeme',
    kaiser: 'Lokaler Vermittler zwischen God Pi und ESP-Geräten',
    esp: 'Feldgerät für Sensoren und Aktoren',
    hierarchy: 'Wie die Geräte miteinander kommunizieren',
  },

  // ESP-spezifisch
  esp: {
    board_type: 'Welche Hardware verwendet dein ESP-Gerät?',
    pinConfig: 'Welcher Anschluss misst Temperatur & Co.?',
    sensorConfig: 'Welche Sensoren sind angeschlossen?',
    actuatorConfig: 'Welche Aktoren (Pumpen, Ventile) steuerst du?',
    otaUpdate: 'Firmware-Update über das Netzwerk',
  },

  // Kaiser-spezifisch
  kaiser: {
    autonomousMode: 'Kaiser arbeitet unabhängig ohne God Pi',
    syncStatus: 'Synchronisationsstatus mit übergeordnetem System',
    sync: 'Mit God Pi synchronisieren',
    toggleAutonomous: 'Autonomen Modus umschalten',
    pi0Server: 'IP und Port des Pi0-Servers, wo der Edge Controller läuft',
    godConnection: 'IP und Port der zentralen Steuerung für Daten-Sharing',
    agents: 'Anzahl der verwalteten Agenten (ESP-Geräte)',
    library: 'Anzahl der installierten Bibliotheken für erweiterte Funktionen',
    testConnections: 'Alle Verbindungen testen',
    manageAgents: 'Agenten verwalten und konfigurieren',
    manageLibrary: 'Bibliothek verwalten und erweitern',
  },

  // God Pi-spezifisch
  godPi: {
    centralControl: 'Zentrale Steuerung für mehrere Standorte',
    dataCollection: 'Sammelt Daten von allen untergeordneten Systemen',
    coordination: 'Koordiniert mehrere Kaiser-Controller',
  },

  // Allgemeine UI
  ui: {
    expand: 'Mehr Details anzeigen',
    collapse: 'Details ausblenden',
    save: 'Änderungen speichern',
    cancel: 'Änderungen verwerfen',
    delete: 'Löschen (kann nicht rückgängig gemacht werden)',
    refresh: 'Aktualisieren',
  },

  // 🆕 NEU: Benutzerfreundliche Begriffe
  userFriendly: {
    mqtt: 'Echtzeit-Verbindung',
    broker: 'Verbindung',
    httpPort: 'Daten-Port',
    websocket: 'Live-Verbindung',
    topic: 'Nachrichtenkanal',
    connected: 'Verbunden',
    disconnected: 'Nicht verbunden',
    sync: 'Synchronisiert',
    autonomous: 'Autonom',
    agent: 'Agent',
    agents: 'Agenten',
    fieldDevice: 'Feldgerät',
    fieldDevices: 'Feldgeräte',
  },

  // 🆕 NEU: Navigation & Breadcrumbs
  navigation: {
    back: 'Zurück zur vorherigen Seite',
    home: 'Zur Hauptübersicht',
    settings: 'Zu den Einstellungen',
    devices: 'Zur Geräteverwaltung',
    dashboard: 'Zum Dashboard',
    zones: 'Zu den Zonen',
    development: 'Zu den Entwickler-Tools',
  },

  // 🆕 NEU: Verbindungen & Ports
  connections: {
    mqtt: 'Echtzeit-Verbindung für Live-Daten',
    http: 'Daten-Port für Sensor-Informationen',
    websocket: 'Live-Verbindung für Dashboard',
    broker: 'Verbindung zu anderen Geräten',
  },

  ports: {
    httpPort: 'Port für Sensor-Daten und Konfiguration',
    mqttPort: 'Port für Echtzeit-Kommunikation',
    websocketPort: 'Port für Dashboard-Verbindung',
  },

  // 🆕 NEU: System-Begriffe
  systemTerms: {
    kaiser: 'Edge Controller',
    godPi: 'Zentrale Steuerung',
    esp: 'Agent',
    espPlural: 'Agenten',
    bibliothek: 'Bibliothek',
    libraryManagement: 'Bibliothek verwalten',
  },

  // 🆕 NEU: Zonen-Management
  zones: {
    unconfigured: 'Noch nicht zugewiesen',
    dragToZone: 'Ziehe das Gerät in eine Zone',
    zoneInfo: 'Diese Zone enthält {n} aktive Agenten',
    createZone: 'Neue Zone erstellen',
    deleteZone: 'Zone löschen (alle Geräte werden unkonfiguriert)',
    zoneName: 'Name der Zone (z.B. Gewächshaus, Hochbeet)',
  },

  // 🆕 NEU: Agent-Management
  agents: {
    unconfigured: 'Agent ist noch nicht konfiguriert',
    configure: 'Agent konfigurieren',
    dragToZone: 'Agent in Zone ziehen',
    removeFromZone: 'Agent aus Zone entfernen',
    addToZone: 'Agent zu Zone hinzufügen',
    moveAgent: 'Agent zwischen Zonen verschieben',
    agentInfo: 'Agent-Informationen und Status',
    agentHealth: 'Agent-Gesundheit und Performance',
  },

  // 🆕 NEU: Drag & Drop
  dragDrop: {
    dragHandle: 'Zum Verschieben ziehen',
    dropZone: 'Hier ablegen um Zone zu ändern',
    dragOver: 'Zone als Ziel markiert',
    dropSuccess: 'Gerät erfolgreich verschoben',
    dropError: 'Fehler beim Verschieben',
    agentDrag: 'Agent zum Verschieben ziehen',
    zoneDrop: 'Hier ablegen um Agent zuzuweisen',
  },

  // 🆕 NEU: Konfiguration
  configuration: {
    libraryIp: 'Die IP, unter der dieser Agent die zentrale Steuerung erreicht.',
    mqttPort: 'Der Port für die Echtzeit-Kommunikation mit der Zentrale.',
    wifiName: 'Der Netzwerkname, mit dem sich der Agent verbinden soll.',
    deviceName: 'Gib diesem Agent einen Namen, den du leicht wiedererkennst.',
    zoneAssignment: 'Wo steht oder wirkt dieses Gerät? Wähle eine existierende Zone.',
  },
}

/**
 * Ermittelt den passenden Tooltip-Text
 * @param {string} category - Kategorie (z.B. 'deviceName')
 * @param {string} key - Schlüssel (z.B. 'label')
 * @param {Object} replacements - Ersetzungen für Platzhalter
 * @returns {string} Tooltip-Text
 */
export function getTooltipText(category, key, replacements = {}) {
  const text = tooltipTexts[category]?.[key] || 'Hilfe nicht verfügbar'

  // Ersetze Platzhalter
  return text.replace(/\{(\w+)\}/g, (match, placeholder) => {
    return replacements[placeholder] || match
  })
}

/**
 * Kurzform für häufige Tooltips
 */
export const quickTooltips = {
  deviceName: () => getTooltipText('deviceName', 'label'),
  deviceZone: () => getTooltipText('deviceZone', 'label'),
  restart: () => getTooltipText('actions', 'restart'),
  configure: () => getTooltipText('actions', 'configure'),
  settings: () => getTooltipText('actions', 'settings'),
  safeMode: () => getTooltipText('safeMode', 'label'),
  health: () => getTooltipText('health', 'status'),
}

/**
 * 🆕 NEU: Benutzerfreundliche Terminologie-Übersetzung
 * @param {string} technicalTerm - Technischer Begriff
 * @returns {string} Benutzerfreundlicher Begriff
 */
export function translateTerm(technicalTerm) {
  const translations = {
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

  return translations[technicalTerm] || technicalTerm
}

/**
 * 🆕 NEU: Erstellt benutzerfreundliche Zone-Informationen
 * @param {string} zoneName - Name der Zone
 * @param {number} deviceCount - Anzahl der Geräte in der Zone
 * @returns {string} Benutzerfreundliche Zone-Beschreibung
 */
export function getZoneDescription(zoneName, deviceCount) {
  if (deviceCount === 0) {
    return `Zone "${zoneName}" (leer)`
  } else if (deviceCount === 1) {
    return `Zone "${zoneName}" (1 Agent)`
  } else {
    return `Zone "${zoneName}" (${deviceCount} Agenten)`
  }
}

/**
 * 🆕 NEU: Erstellt benutzerfreundliche Konfigurations-Hinweise
 * @param {string} configType - Typ der Konfiguration
 * @returns {string} Benutzerfreundlicher Hinweis
 */
export function getConfigurationHint(configType) {
  const hints = {
    libraryIp: 'Die IP, unter der dieser Agent die zentrale Steuerung erreicht.',
    mqttPort: 'Der Port für die Echtzeit-Kommunikation mit der Zentrale.',
    wifiName: 'Der Netzwerkname, mit dem sich der Agent verbinden soll.',
    deviceName: 'Gib diesem Agent einen Namen, den du leicht wiedererkennst.',
    zoneAssignment: 'Wo steht oder wirkt dieses Gerät? Wähle eine existierende Zone.',
  }

  return hints[configType] || 'Konfigurationshinweis nicht verfügbar'
}
