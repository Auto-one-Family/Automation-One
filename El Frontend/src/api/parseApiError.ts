/**
 * Structured API Error Parser
 *
 * Extracts structured error information from REST API responses
 * (GodKaiserException format with numeric_code + request_id).
 *
 * Works with the unified error response format:
 * {
 *   success: false,
 *   error: {
 *     code: "ESP_NOT_FOUND",
 *     numeric_code: 5001,
 *     message: "ESP32 device not found",
 *     details: { esp_id: "..." },
 *     request_id: "uuid"
 *   }
 * }
 */

import type { AxiosError } from 'axios'

export interface StructuredApiError {
  /** String error code (e.g. "ESP_NOT_FOUND") */
  code: string
  /** Numeric error code (e.g. 5001) — null for unstructured errors */
  numericCode: number | null
  /** Human-readable error message */
  message: string
  /** Additional error details */
  details: Record<string, unknown>
  /** Server-generated request ID for cross-layer tracing */
  requestId: string | null
  /** HTTP status code */
  statusCode: number
}

/**
 * Parse an Axios error into a structured API error.
 *
 * Handles both GodKaiserException responses (with numeric_code)
 * and plain HTTPException responses (with detail string).
 */
export function parseApiError(error: AxiosError): StructuredApiError {
  const response = error.response
  const statusCode = response?.status ?? 0

  // GodKaiserException format: { success: false, error: { code, numeric_code, ... } }
  const errorData = (response?.data as Record<string, unknown>)?.error as Record<string, unknown> | undefined

  if (errorData && typeof errorData === 'object') {
    return {
      code: String(errorData.code ?? 'UNKNOWN'),
      numericCode: typeof errorData.numeric_code === 'number' ? errorData.numeric_code : null,
      message: String(errorData.message ?? error.message),
      details: (errorData.details as Record<string, unknown>) ?? {},
      requestId: typeof errorData.request_id === 'string' ? errorData.request_id : null,
      statusCode,
    }
  }

  // FastAPI HTTPException format: { detail: "..." }
  const detail = (response?.data as Record<string, unknown>)?.detail
  if (detail) {
    return {
      code: 'HTTP_ERROR',
      numericCode: null,
      message: typeof detail === 'string' ? detail : JSON.stringify(detail),
      details: {},
      requestId: response?.headers?.['x-request-id'] ?? null,
      statusCode,
    }
  }

  // Network error or unrecognized format
  return {
    code: 'NETWORK_ERROR',
    numericCode: null,
    message: error.message || 'An unexpected error occurred',
    details: {},
    requestId: null,
    statusCode,
  }
}

/**
 * Check if an error has a numeric error code (from GodKaiserException).
 */
export function hasNumericCode(error: StructuredApiError): boolean {
  return error.numericCode !== null
}

/**
 * Check if an error is a "not found" error (404).
 */
export function isNotFoundError(error: StructuredApiError): boolean {
  return error.statusCode === 404
}

/**
 * Check if an error is a validation error (400).
 */
export function isValidationError(error: StructuredApiError): boolean {
  return error.statusCode === 400
}
