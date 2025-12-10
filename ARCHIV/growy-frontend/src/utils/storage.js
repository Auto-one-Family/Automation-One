import { errorHandler } from './errorHandler'

export const storage = {
  save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data))
    } catch (error) {
      errorHandler.error('Failed to save to localStorage', error, { key, data })
    }
  },

  load(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch (error) {
      errorHandler.error('Failed to load from localStorage', error, { key, defaultValue })
      return defaultValue
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      errorHandler.error('Failed to remove from localStorage', error, { key })
    }
  },
}
