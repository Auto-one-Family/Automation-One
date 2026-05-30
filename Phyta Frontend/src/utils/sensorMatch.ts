export function normalizeSensorType(type: string): string {
  return type.trim().toLowerCase().replace(/-/g, '_')
}
