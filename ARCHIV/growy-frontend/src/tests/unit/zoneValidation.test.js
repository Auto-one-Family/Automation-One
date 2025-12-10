import { describe, it, expect, vi } from 'vitest'
import {
  normalizeZoneName,
  validateZoneName,
  findDuplicateZones,
  exportZoneMapping,
  importZoneMapping,
} from '@/utils/espHelpers'

// Mock MQTT Store
vi.mock('@/stores/mqtt', () => ({
  useMqttStore: () => ({
    espDevices: new Map([
      ['ESP32_001', { zone: 'Gewächshaus 1' }],
      ['ESP32_002', { zone: 'Gewächshaus 2' }],
      ['ESP32_003', { zone: null }],
    ]),
  }),
}))

describe('Zone Validation Functions', () => {
  describe('normalizeZoneName', () => {
    it('should normalize zone names correctly', () => {
      expect(normalizeZoneName('Gewächshaus 1')).toBe('gewächshaus 1')
      expect(normalizeZoneName('  Zone Test  ')).toBe('zone test')
      expect(normalizeZoneName('')).toBe('')
      expect(normalizeZoneName(null)).toBe('')
      expect(normalizeZoneName(undefined)).toBe('')
    })
  })

  describe('validateZoneName', () => {
    it('should validate valid zone names', () => {
      expect(validateZoneName('Gewächshaus 1')).toEqual({ isValid: true, error: null })
      expect(validateZoneName('Zone-Test')).toEqual({ isValid: true, error: null })
      expect(validateZoneName('Test123')).toEqual({ isValid: true, error: null })
    })

    it('should reject empty zone names', () => {
      expect(validateZoneName('')).toEqual({
        isValid: false,
        error: 'Zonename darf nicht leer sein',
      })
      expect(validateZoneName('   ')).toEqual({
        isValid: false,
        error: 'Zonename darf nicht leer sein',
      })
    })

    it('should reject too short zone names', () => {
      expect(validateZoneName('A')).toEqual({
        isValid: false,
        error: 'Zonename muss mindestens 2 Zeichen lang sein',
      })
    })

    it('should reject too long zone names', () => {
      const longName = 'A'.repeat(51)
      expect(validateZoneName(longName)).toEqual({
        isValid: false,
        error: 'Zonename darf maximal 50 Zeichen lang sein',
      })
    })

    it('should reject zone names with invalid characters', () => {
      expect(validateZoneName('Zone<Test')).toEqual({
        isValid: false,
        error: 'Zonename enthält ungültige Zeichen',
      })
      expect(validateZoneName('Zone:Test')).toEqual({
        isValid: false,
        error: 'Zonename enthält ungültige Zeichen',
      })
      expect(validateZoneName('Zone/Test')).toEqual({
        isValid: false,
        error: 'Zonename enthält ungültige Zeichen',
      })
    })

    it('should reject reserved zone names', () => {
      expect(validateZoneName('default')).toEqual({
        isValid: false,
        error: 'Zonename ist reserviert',
      })
      expect(validateZoneName('null')).toEqual({ isValid: false, error: 'Zonename ist reserviert' })
      expect(validateZoneName('unkonfiguriert')).toEqual({
        isValid: false,
        error: 'Zonename ist reserviert',
      })
    })
  })

  describe('findDuplicateZones', () => {
    it('should find duplicate zones case-insensitive', () => {
      const zones = ['Gewächshaus 1', 'gewächshaus 1', 'Zone 2', 'zone 2']
      const duplicates = findDuplicateZones(zones)

      expect(duplicates).toHaveLength(2)
      expect(duplicates[0]).toEqual({
        original1: 'Gewächshaus 1',
        original2: 'gewächshaus 1',
        normalized: 'gewächshaus 1',
      })
      expect(duplicates[1]).toEqual({
        original1: 'Zone 2',
        original2: 'zone 2',
        normalized: 'zone 2',
      })
    })

    it('should not find duplicates in unique zones', () => {
      const zones = ['Gewächshaus 1', 'Gewächshaus 2', 'Zone 3']
      const duplicates = findDuplicateZones(zones)

      expect(duplicates).toHaveLength(0)
    })

    it('should handle empty zones array', () => {
      const duplicates = findDuplicateZones([])
      expect(duplicates).toHaveLength(0)
    })
  })

  describe('exportZoneMapping', () => {
    it('should export zone mapping correctly', () => {
      const mapping = exportZoneMapping()

      expect(mapping).toEqual({
        ESP32_001: 'Gewächshaus 1',
        ESP32_002: 'Gewächshaus 2',
        ESP32_003: '🕳️ Unkonfiguriert',
      })
    })
  })

  describe('importZoneMapping', () => {
    it('should import valid zone mapping', () => {
      const mapping = {
        ESP32_001: 'Neue Zone 1',
        ESP32_002: 'Neue Zone 2',
      }

      const result = importZoneMapping(mapping)

      expect(result.success).toBe(true)
      expect(result.imported).toBe(2)
      expect(result.errors).toHaveLength(0)
    })

    it('should handle invalid ESP IDs', () => {
      const mapping = {
        INVALID_ESP: 'Test Zone',
        ESP32_001: 'Valid Zone',
      }

      const result = importZoneMapping(mapping)

      expect(result.success).toBe(false)
      expect(result.imported).toBe(1)
      expect(result.errors).toContain('ESP INVALID_ESP nicht gefunden')
    })

    it('should handle invalid zone names', () => {
      const mapping = {
        ESP32_001: '', // Empty zone name
        ESP32_002: 'Valid Zone',
      }

      const result = importZoneMapping(mapping)

      expect(result.success).toBe(false)
      expect(result.imported).toBe(1)
      expect(result.errors).toContain(
        'Ungültiger Zonename für ESP ESP32_001: Zonename darf nicht leer sein',
      )
    })
  })
})
