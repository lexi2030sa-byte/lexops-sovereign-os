import { describe, expect, it } from 'vitest';
import {
  haversineMeters,
  verifyGeoFence,
  ABNORMAL_SPEED_THRESHOLD_MPS,
  DEFAULT_SAFE_RADIUS_METERS,
} from '../src/index';

const Dammam = { latitude: 26.4307, longitude: 50.0993, timestamp: 1000 };

describe('Geofencing Engine', () => {
  it('المسافة داخل النطاق الآمن تعطي inside', () => {
    const fence = { entityId: '700-1000001234', center: Dammam, radiusMeters: DEFAULT_SAFE_RADIUS_METERS };
    const r = verifyGeoFence(fence, { ...Dammam, latitude: Dammam.latitude + 0.0002, timestamp: 2000 });
    expect(r.status).toBe('inside');
  });

  it('الانتقال الأسرع من 500 م/ث يُعتبر تزييفاً', () => {
    const fence = { entityId: '700-1000001234', center: Dammam, radiusMeters: 40 };
    const a = { ...Dammam, timestamp: 1000 };
    const b = { ...Dammam, latitude: Dammam.latitude + 0.01, timestamp: 1001 }; // ~1.1km في ثانية
    const r = verifyGeoFence(fence, b, a);
    expect(r.status).toBe('abnormal_speed');
    if (r.status === 'abnormal_speed') expect(r.speedMetersPerSecond).toBeGreaterThan(ABNORMAL_SPEED_THRESHOLD_MPS);
  });

  it('الإحداثيات غير الصالحة تُرفض كـ mock_spoofed', () => {
    const fence = { entityId: '700', center: Dammam, radiusMeters: 40 };
    const r = verifyGeoFence(fence, { latitude: 999, longitude: 0, timestamp: 3000 });
    expect(r.status).toBe('mock_spoofed');
  });

  it('حساب Haversine معروف المسافة', () => {
    // ~111.2 كم لكل درجة عرض — مسافة درجة واحدة طولياً عند خط الاستواء
    const d = haversineMeters(
      { latitude: 0, longitude: 0, timestamp: 0 },
      { latitude: 1, longitude: 0, timestamp: 0 },
    );
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });
});
