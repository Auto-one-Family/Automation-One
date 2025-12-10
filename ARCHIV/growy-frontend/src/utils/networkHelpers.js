// ✅ NEU: Netzwerk-Helper-Funktionen für IP/Port-Validierung

export const isValidIP = (ip) => {
  if (!ip || typeof ip !== 'string') return false
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)
}

export const isValidPort = (port) => {
  const portNum = parseInt(port)
  return portNum > 0 && portNum < 65536
}

export const getLocalIP = () => {
  // Versuche verschiedene Methoden zur IP-Erkennung
  if (window.location.hostname && window.location.hostname !== 'localhost') {
    return window.location.hostname
  }

  // Fallback zu gespeicherter lokaler IP
  return localStorage.getItem('local_frontend_ip') || 'localhost'
}

export const getLocalPort = () => {
  return window.location.port || localStorage.getItem('local_frontend_port') || '5173'
}

export const testConnection = async (ip, port, protocol = 'http') => {
  try {
    const url = `${protocol}://${ip}:${port}/api/health`
    const response = await fetch(url, { timeout: 3000 })
    return response.ok
  } catch {
    return false
  }
}

export const formatIP = (ip) => {
  if (!ip) return 'Nicht verfügbar'
  return ip
}

export const formatPort = (port) => {
  if (!port) return 'Nicht verfügbar'
  return port.toString()
}

// ✅ NEU: Automatische IP-Erkennung für lokales System
export const autoDetectLocalIP = async () => {
  try {
    // Versuche über WebRTC die lokale IP zu ermitteln
    const response = await fetch('/api/local-ip')
    if (response.ok) {
      const data = await response.json()
      return data.ip
    }
  } catch {
    // Fallback zu window.location
  }

  return window.location.hostname || 'localhost'
}

// ✅ NEU: Netzwerk-Scan für verfügbare Server
export const scanNetworkForServers = async (baseIP, ports = [8443, 9001]) => {
  const network = baseIP.split('.').slice(0, 3).join('.')
  const results = []

  for (let i = 1; i <= 254; i++) {
    const ip = `${network}.${i}`

    for (const port of ports) {
      try {
        const isReachable = await testConnection(ip, port)
        if (isReachable) {
          results.push({ ip, port, reachable: true })
        }
      } catch {
        // IP nicht erreichbar
      }
    }
  }

  return results
}
