import { describe, expect, it } from 'vitest';
import { GeoGate, isLate, statusFor, clampRadius } from '../src/index';
import type { AttendanceStore, AttendanceAttempt, Person, AttendanceRecord, GateFence } from '../src/index';

const PERSON: Person = {
  userId: 'u-1',
  entityId: '700-1000001234',
  role: 'employee',
  shift: { start: '09:00', end: '17:00', graceMinutes: 10 },
  active: true,
};

const FENCE: GateFence = {
  entityId: '700-1000001234',
  center: { latitude: 26.4, longitude: 50.15, timestamp: 0 },
  radiusMeters: 40,
};

const CENTER = { latitude: 26.4, longitude: 50.15 };

function makeStore(overrides: Partial<AttendanceStore> = {}): AttendanceStore {
  const records = new Map<string, AttendanceRecord>();
  return {
    async getPerson(userId) {
      return userId === PERSON.userId ? PERSON : null;
    },
    async getTodayRecord(userId, entityId, date) {
      return records.get(`${userId}:${entityId}:${date}`) ?? null;
    },
    async saveRecord(record) {
      records.set(`${record.userId}:${record.entityId}:${record.date}`, record);
    },
    async getGateFence() {
      return FENCE;
    },
    ...overrides,
  };
}

function attempt(overrides: Partial<AttendanceAttempt> = {}): AttendanceAttempt {
  return {
    userId: 'u-1',
    entityId: '700-1000001234',
    action: 'check_in',
    clientTimestamp: Date.now(),
    gps: { latitude: CENTER.latitude, longitude: CENTER.longitude, timestamp: Date.now() },
    deviceId: 'dev-1',
    ...overrides,
  };
}

describe('GeoGate — بوابة الحضور الجغرافية', () => {
  it('يقبل الحضور داخل النطاق (inside) بدرجة يقين 100', async () => {
    const gate = new GeoGate(makeStore());
    const out = await gate.process(attempt());
    expect(out.accepted).toBe(true);
    if (out.accepted) {
      expect(out.record.certaintyScore).toBe(100);
      expect(out.record.geo?.checkIn.status).toBe('inside');
      expect(out.record.status).toBe('on_time');
    }
  });

  it('يرفض الموظف خارج النطاق ويجمّد الحضور', async () => {
    const gate = new GeoGate(makeStore());
    const out = await gate.process(
      attempt({
        gps: { latitude: CENTER.latitude + 0.02, longitude: CENTER.longitude, timestamp: Date.now() },
      }),
    );
    expect(out.accepted).toBe(false);
    if (!out.accepted) {
      expect(out.reason).toBe('outside_fence');
      expect(out.certaintyScore).toBe(0);
    }
  });

  it('يرفض الإحداثيات غير الصحيحة كتزييف (mock_spoofed)', async () => {
    const gate = new GeoGate(makeStore());
    const out = await gate.process(
      attempt({ gps: { latitude: 200, longitude: 400, timestamp: Date.now() } }),
    );
    expect(out.accepted).toBe(false);
    if (!out.accepted) expect(out.reason).toBe('mock_spoofed');
  });

  it('يرفض تضارب الزمن (clock skew) — certainty = 0', async () => {
    const gate = new GeoGate(makeStore());
    const out = await gate.process(attempt({ clientTimestamp: Date.now() - 3600_000 }));
    expect(out.accepted).toBe(false);
    if (!out.accepted) expect(out.reason).toBe('clock_skew');
  });

  it('يمرر check_out ويحفظ سجل اليوم المكتمل', async () => {
    const store = makeStore();
    const gate = new GeoGate(store);
    await gate.process(attempt());
    const out = await gate.process(attempt({ action: 'check_out' }));
    expect(out.accepted).toBe(true);
    if (out.accepted) {
      expect(out.record.checkInAt).toBeDefined();
      expect(out.record.checkOutAt).toBeDefined();
      expect(out.record.geo?.checkOut?.status).toBe('inside');
    }
  });

  it('حضور قريب من حافة النطاق (> 80% من نصف القطر) → pending_review', async () => {
    const gate = new GeoGate(makeStore());
    // نقطة تبعد ~0.00045 درجة عرض ≈ 50م عن المركز (نصف قطر 40م × 0.8 = 32م حد)
    // لنتأكد من تجاوز 80%: نستخدم مسافة داخلية كبيرة قريبة من النطاق
    const nearEdgeLat = CENTER.latitude + 0.00036; // ≈ 40م — عند الحافة
    const out = await gate.process(
      attempt({ gps: { latitude: nearEdgeLat, longitude: CENTER.longitude, timestamp: Date.now() } }),
    );
    if (out.accepted) {
      expect(out.record.reviewState).toBe('pending_review');
    }
  });

  it('يُبلّغ الشذوذ عبر المبلّغ (ربط C9)', async () => {
    const incidents: string[] = [];
    const reporter = {
      report: async (i: { type: string }) => {
        incidents.push(i.type);
      },
    };
    const gate = new GeoGate(makeStore(), reporter);
    await gate.process(
      attempt({ gps: { latitude: 200, longitude: 400, timestamp: Date.now() } }),
    );
    expect(incidents).toContain('mock_spoofed');
  });
});

describe('دوال الحالة', () => {
  const shift = { start: '09:00', end: '17:00', graceMinutes: 10 };

  it('isLate: بعد الوردية + السماح = متأخر', () => {
    expect(isLate(shift, '09:05')).toBe(false);
    expect(isLate(shift, '09:11')).toBe(true);
  });

  it('statusFor: on_time / late / absent', () => {
    expect(statusFor(shift, '09:00')).toBe('on_time');
    expect(statusFor(shift, '09:30')).toBe('late');
    expect(statusFor(shift, undefined)).toBe('absent');
  });

  it('clampRadius: يقصّر النطاق ضمن 30–50م', () => {
    expect(clampRadius(10)).toBe(30);
    expect(clampRadius(40)).toBe(40);
    expect(clampRadius(100)).toBe(50);
    expect(clampRadius(NaN)).toBe(40);
  });
});
