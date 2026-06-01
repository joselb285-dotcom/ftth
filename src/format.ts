/** Formats a power value in dBm with one decimal. */
export function formatPower(dbm: number): string {
  return `${dbm.toFixed(1)} dBm`
}

/** Formats a length in km to a human-readable string (km or m). */
export function formatDistance(km: number): string {
  return km >= 1 ? `${km.toFixed(3)} km` : `${(km * 1000).toFixed(1)} m`
}

/** Formats a length in meters to a human-readable string (km or m). */
export function formatDistanceM(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(3)} km`
    : `${meters.toFixed(0)} m`
}
