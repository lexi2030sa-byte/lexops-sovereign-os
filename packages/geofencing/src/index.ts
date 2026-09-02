/**
 * محرك Geo السيادي — Geofencing Engine
 *
 * المرجع: USDS-02 (فصل التحقق المكاني) + بروتوكول اليقين الاستدلالي (الطبقة المادية)
 * + وثيقة الأمان المكاني. المعايير المعتمدة:
 *  - نصف قطر الأمان الآمن: 30–50 متر (الحد الافتراضي 40م)
 *  - كشف الانتقال غير الطبيعي: سرعة > 500 م/ث → Mock/Spoofing → تجميد الحضور
 *  - أي شذوذ يُسجل كـ Sovereign Incident في C9
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
  /** دقة GPS بالأمتار (اختياري) */
  accuracy?: number;
  /** وقت الالتقاط (epoch ms) — حيوي لكشف السرعة */
  timestamp: number;
}

export interface Geofence {
  entityId: string;
  branchId?: string;
  center: GeoPoint;
  /** نصف قطر الأمان بالأمتار (Default 40م ضمن النطاق المصرح 30–50م) */
  radiusMeters: number;
}

export type GeoVerdict =
  | { status: 'inside'; distanceMeters: number }
  | { status: 'outside'; distanceMeters: number; requiredRadiusMeters: number }
  | { status: 'mock_spoofed'; reason: string }
  | { status: 'abnormal_speed'; speedMetersPerSecond: number };

const EARTH_RADIUS_METERS = 6371000;

/**
 * معادلة Haversine لحساب المسافة بين نقطتين بالأمتار.
 * مرجعية في وثيقة الأمان المكاني لـ LexOps.
 */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/** حساب السرعة الفورية (م/ث) بين قراءتين مكانيتين متتاليتين */
export function speedMetersPerSecond(a: GeoPoint, b: GeoPoint): number {
  const dtSeconds = Math.abs(b.timestamp - a.timestamp) / 1000;
  if (dtSeconds <= 0) return Infinity;
  return haversineMeters(a, b) / dtSeconds;
}

/** عتبة الانتقال غير الطبيعي المعتمدة (م/ث) */
export const ABNORMAL_SPEED_THRESHOLD_MPS = 500;

/** النطاق المصرح لنصف قطر الأمان (30–50م) */
export const SAFE_RADIUS_RANGE = { min: 30, max: 50 } as const;
export const DEFAULT_SAFE_RADIUS_METERS = 40;

/**
 * التحقق السيادي: نقطة داخل النطاق الآمن أم لا، مع كشف التزييف.
 * أي انتهاك يعيد وضعية خارجية/مزيّفة ليُجمّد التوثيق فوراً.
 */
export function verifyGeoFence(
  fence: Geofence,
  reading: GeoPoint,
  previousReading?: GeoPoint,
): GeoVerdict {
  if (
    !Number.isFinite(reading.latitude) ||
    !Number.isFinite(reading.longitude) ||
    Math.abs(reading.latitude) > 90 ||
    Math.abs(reading.longitude) > 180
  ) {
    return { status: 'mock_spoofed', reason: 'invalid_coordinates' };
  }

  if (previousReading) {
    const speed = speedMetersPerSecond(previousReading, reading);
    if (speed > ABNORMAL_SPEED_THRESHOLD_MPS) {
      return { status: 'abnormal_speed', speedMetersPerSecond: speed };
    }
  }

  const distance = haversineMeters(fence.center, reading);
  if (distance <= fence.radiusMeters) {
    return { status: 'inside', distanceMeters: distance };
  }
  return {
    status: 'outside',
    distanceMeters: distance,
    requiredRadiusMeters: fence.radiusMeters,
  };
}

/** تصعيد شذوذ Geo إلى حادثة سيادية (يُكتب في C9 من طبقة أعلى) */
export interface GeoIncident {
  type: 'mock_spoofed' | 'abnormal_speed' | 'outside_fence';
  entityId: string;
  userId: string;
  reading: GeoPoint;
  verdict: GeoVerdict;
  occurredAt: number;
}
