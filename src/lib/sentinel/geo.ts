const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lon points, in km. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Apparent travel speed between two session origins, km/h.
 * Anything above ~900 km/h (airliner) for a human is physically impossible —
 * a classic account-takeover tell.
 */
export function impliedSpeedKmh(
  lat1: number,
  lon1: number,
  ts1: number,
  lat2: number,
  lon2: number,
  ts2: number,
): number {
  const hours = Math.abs(ts2 - ts1) / 3_600_000;
  if (hours < 1 / 60) return Infinity; // same instant, different origin
  return haversineKm(lat1, lon1, lat2, lon2) / hours;
}
