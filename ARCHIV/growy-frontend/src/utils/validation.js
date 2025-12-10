/**
 * Zentrale Validierungsfunktionen für das God-System
 */

export const validateGodName = (name) => {
  // ✅ KORRIGIERT: Erlaube leere Namen für Reset-Funktionalität
  if (typeof name !== 'string') {
    return { valid: false, error: 'God-Name muss ein Text sein' }
  }

  // Leere Namen sind erlaubt (für Reset-Funktionalität)
  if (!name.trim()) {
    return { valid: true, error: null }
  }

  if (name.trim().length < 2) {
    return { valid: false, error: 'God-Name muss mindestens 2 Zeichen haben' }
  }

  if (name.trim().length > 50) {
    return { valid: false, error: 'God-Name darf maximal 50 Zeichen haben' }
  }

  // Erlaube nur alphanumerische Zeichen, Leerzeichen, Bindestriche und Unterstriche
  const validPattern = /^[a-zA-Z0-9\s\-_]+$/
  if (!validPattern.test(name.trim())) {
    return {
      valid: false,
      error:
        'God-Name darf nur Buchstaben, Zahlen, Leerzeichen, Bindestriche und Unterstriche enthalten',
    }
  }

  return { valid: true, error: null }
}

export const validateKaiserName = (name) => {
  // Identisch zu validateGodName aber für Kaiser
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Kaiser-Name ist erforderlich' }
  }

  if (name.trim().length < 2) {
    return { valid: false, error: 'Kaiser-Name muss mindestens 2 Zeichen haben' }
  }

  if (name.trim().length > 50) {
    return { valid: false, error: 'Kaiser-Name darf maximal 50 Zeichen haben' }
  }

  const validPattern = /^[a-zA-Z0-9\s\-_]+$/
  if (!validPattern.test(name.trim())) {
    return {
      valid: false,
      error:
        'Kaiser-Name darf nur Buchstaben, Zahlen, Leerzeichen, Bindestriche und Unterstriche enthalten',
    }
  }

  return { valid: true, error: null }
}
