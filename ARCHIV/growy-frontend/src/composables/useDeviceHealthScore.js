import { computed } from 'vue'

export function useDeviceHealthScore(deviceInfo) {
  const healthScore = computed(() => {
    let score = 100
    const issues = []

    // Verbindungsstatus (40 Punkte)
    if (!deviceInfo.value.status || deviceInfo.value.status === 'offline') {
      score -= 40
      issues.push('Offline')
    }

    // Zone-Konfiguration (25 Punkte)
    if (!deviceInfo.value.zone || deviceInfo.value.zone === '🕳️ Unkonfiguriert') {
      score -= 25
      issues.push('Keine Zone')
    }

    // Board-Typ (15 Punkte)
    if (!deviceInfo.value.board_type && !deviceInfo.value.boardType) {
      score -= 15
      issues.push('Board-Typ fehlt')
    }

    // ID-Konflikte (20 Punkte)
    if (deviceInfo.value.idConflict) {
      score -= 20
      issues.push('ID-Konflikt')
    }

    // Pin-Konfiguration (optional, nur wenn konfiguriert)
    if (deviceInfo.value.hasPinConfig && deviceInfo.value.missingPins?.length > 0) {
      score -= 10
      issues.push('Pin-Fehler')
    }

    return {
      score: Math.max(0, score),
      issues,
      status: getHealthStatus(score),
      color: getHealthColor(score),
      icon: getHealthIcon(score),
    }
  })

  const getHealthStatus = (score) => {
    if (score >= 90) return 'excellent'
    if (score >= 70) return 'good'
    if (score >= 50) return 'warning'
    return 'critical'
  }

  const getHealthColor = (score) => {
    if (score >= 90) return 'success'
    if (score >= 70) return 'info'
    if (score >= 50) return 'warning'
    return 'error'
  }

  const getHealthIcon = (score) => {
    if (score >= 90) return 'mdi-check-circle'
    if (score >= 70) return 'mdi-information'
    if (score >= 50) return 'mdi-alert'
    return 'mdi-alert-circle'
  }

  return {
    healthScore,
  }
}
