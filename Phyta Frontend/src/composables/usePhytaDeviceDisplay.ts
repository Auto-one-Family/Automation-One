import { getDeviceId } from '@/api/esp'
import type { PhytaEspDevice } from '@/types/esp'

/**
 * D5 naming contract (AUT-514 / TM-Entscheidung D1):
 *
 * | Layer            | Field / source              | UI role                          |
 * |------------------|-----------------------------|----------------------------------|
 * | Device title     | `esp_devices.name`          | Primary label in every ESP view  |
 * | Device fallback  | `Gerät N` (index in zone)   | When `name` is empty             |
 * | Device fallback  | `device_id`                 | Last resort title + mono caption |
 * | Zone context     | `zone_name` / `zone_id`     | Breadcrumb / subtitle only       |
 * | Technical ID     | `device_id`                 | Mono subline, tooltip — never title |
 *
 * Zone name must never substitute for device name (AUT-514 P4/P8 consistency break).
 */

/** Primary operator-facing device name — never zone name. */
export function getDeviceDisplayName(
  device: PhytaEspDevice,
  fallbackIndex?: number,
): string {
  const custom = device.name?.trim()
  if (custom) return custom
  if (fallbackIndex != null && fallbackIndex > 0) return `Gerät ${fallbackIndex}`
  return getDeviceId(device) || 'Gerät'
}

/** Zone context shown as breadcrumb / subtitle — not as device title. */
export function getDeviceZoneLabel(device: PhytaEspDevice): string | null {
  const zone = device.zone_name?.trim() || device.zone_id?.trim()
  return zone || null
}

/** Technical device id for captions — empty when title already equals id. */
export function getDeviceIdCaption(device: PhytaEspDevice, fallbackIndex?: number): string | null {
  const id = getDeviceId(device)
  if (!id) return null
  return getDeviceDisplayName(device, fallbackIndex) === id ? null : id
}

/** Operator caption: optional zone · optional device id (for wizard, scan stub, etc.). */
export function formatDeviceContextCaption(
  device: PhytaEspDevice,
  fallbackIndex?: number,
): string {
  const zone = getDeviceZoneLabel(device)
  const id = getDeviceIdCaption(device, fallbackIndex)
  if (zone && id) return `${zone} · ${id}`
  return zone || id || ''
}
