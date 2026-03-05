/**
 * Subzone Helper Utilities
 *
 * Defense-in-depth: Normalize "Keine Subzone" semantics before API calls.
 * Backend uses utils/subzone_helpers.normalize_subzone_id (Auftrag 1);
 * Frontend normalizes for consistency.
 */

/**
 * Normalizes subzone_id for API requests.
 * "Keine Subzone" = always null. Never send "__none__" or "" to backend.
 *
 * @param val - Raw subzone_id from form/store
 * @returns null for "no subzone", trimmed string otherwise
 */
export function normalizeSubzoneId(val: string | null | undefined): string | null {
  if (val == null || val === '') return null
  const trimmed = String(val).trim()
  if (trimmed === '' || trimmed === '__none__') return null
  return trimmed
}
