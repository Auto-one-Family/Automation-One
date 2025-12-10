// 🔧 SOFORTIGE GOD-ID INKONSISTENZ-BEHEBUNG
// Führe dieses Script im Browser aus um alte inkonsistente Daten zu bereinigen

console.log('🔧 Starte God-ID Inkonsistenz-Bereinigung...')

try {
  // 1. Aktuelle Konfiguration laden
  const config = JSON.parse(localStorage.getItem('central_config') || '{}')
  console.log('📋 Aktuelle Konfiguration:', config)

  // 2. Problem identifizieren
  const hasInconsistency =
    config.godIdManuallySet === true &&
    config.godName &&
    config.godId &&
    config.godId !== `god_${config.godName.toLowerCase().replace(/\s+/g, '_')}`

  if (hasInconsistency) {
    console.log('⚠️ Inkonsistenz gefunden!')
    console.log('   - godName:', config.godName)
    console.log('   - godId:', config.godId)
    console.log('   - godIdManuallySet:', config.godIdManuallySet)

    // 3. Inkonsistenz beheben
    config.godIdManuallySet = false // Entsperrt automatische Generierung
    config.godId = null // Erzwingt Neu-Generierung

    // 4. Bereinigte Konfiguration speichern
    localStorage.setItem('central_config', JSON.stringify(config))

    console.log('✅ Inkonsistenz behoben!')
    console.log('   - godIdManuallySet auf false gesetzt')
    console.log('   - godId auf null gesetzt')
    console.log('   - Automatische Generierung wird beim nächsten Update aktiviert')

    // 5. Seite neu laden um Änderungen zu aktivieren
    console.log('🔄 Seite wird in 3 Sekunden neu geladen...')
    setTimeout(() => {
      location.reload()
    }, 3000)
  } else {
    console.log('✅ Keine Inkonsistenz gefunden - alles in Ordnung!')
  }
} catch (error) {
  console.error('❌ Fehler bei der Bereinigung:', error)
}

// 🎯 VERWENDUNG:
// 1. Öffne Browser-Entwicklertools (F12)
// 2. Gehe zu Console-Tab
// 3. Kopiere und führe dieses Script aus
// 4. Warte auf automatisches Neuladen
// 5. Teste God-Name-Änderung in der MindMap
