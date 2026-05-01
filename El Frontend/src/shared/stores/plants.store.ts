/**
 * Plants Store
 *
 * Minimal store for plant inventory used by MultispeQ snapshot assignment
 * (AUT-213). A more complete plants management view will arrive with AUT-221.
 *
 * Server endpoint: GET /v1/plants  (AUT-222)
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api/index'
import { createLogger } from '@/utils/logger'

const logger = createLogger('PlantsStore')

export interface Plant {
  /** UUID */
  id: string
  qr_code: string
  genotype: string
  phase: string
}

interface PlantListEnvelope {
  data?: Plant[]
}

export const usePlantsStore = defineStore('plants', () => {
  const plants = ref<Plant[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchPlants(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const response = await api.get<Plant[] | PlantListEnvelope>('/plants')
      const payload = response.data
      plants.value = Array.isArray(payload)
        ? payload
        : payload.data ?? []
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Plants konnten nicht geladen werden'
      logger.error('Failed to fetch plants', e)
    } finally {
      isLoading.value = false
    }
  }

  function $reset(): void {
    plants.value = []
    isLoading.value = false
    error.value = null
  }

  return { plants, isLoading, error, fetchPlants, $reset }
})
