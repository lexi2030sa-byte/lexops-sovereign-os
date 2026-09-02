/**
 * بوابة الحضور الجغرافية — GeoGate Service
 *
 * المرجع: وثيقة التحقق المكاني + "تطبيق الموظفين" (شاشة الحضور) + "الموظف التابع".
 *
 * الحاكمة:
 *  1) كل محاولة حضور تمر عبر التحقق الجغرافي (Haversine + كشف التزييف/السرعة)
 *  2) أي شذوذ (إحداثيات غير صحيحة، سرعة > 500 م/ث، خارج النطاق، تضارب زمني)
 *     → certainty = 0 → يُجمَّد الحضور ويُسجَّل كحادثة سيادية
 *  3) المسموح داخل النطاق 30–50م (الافتراضي 40م)
 */

import {
  verifyGeoFence,
  haversineMeters,
  speedMetersPerSecond,
  ABNORMAL_SPEED_THRESHOLD_MPS,
  SAFE_RADIUS_RANGE,
  DEFAULT_SAFE_RADIUS_METERS,
  GeoPoint,
  Geofence,
} from '@lexops/geofencing';
import {
  AttendanceAttempt,
  AttendanceRecord,
  AttendanceOutcome,
  GateFence,
  GeoIncidentReporter,
  GeoVerdictSnapshot,
  Person,
  ShiftWindow,
} from './types';

/** مخزن PEOPLE/ATTENDANCE — تُوفره Firestore من طبقة أعلى */
export interface AttendanceStore {
  getPerson(userId: string): Promise<Person | null>;
  getTodayRecord(userId: string, entityId: string, date: string): Promise<AttendanceRecord | null>;
  saveRecord(record: AttendanceRecord): Promise<void>;
  getGateFence(entityId: string, branchId?: string): Promise<GateFence | null>;
}

/** حاسبة التأخير: بداية الوردية + مهلة السماح بالدقائق */
export function isLate(shift: ShiftWindow, checkInTime: string): boolean {
  const [startH, startM] = shift.start.split(':').map(Number);
  const [checkH, checkM] = checkInTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const checkMinutes = checkH * 60 + checkM;
  return checkMinutes > startMinutes + shift.graceMinutes;
}

/** حساب حالة اليوم من سجل وردية */
export function statusFor(
  shift: ShiftWindow,
  checkInTime?: string,
): 'on_time' | 'late' | 'absent' {
  if (!checkInTime) return 'absent';
  return isLate(shift, checkInTime) ? 'late' : 'on_time';
}

/** سماحية نصف القطر ضمن النطاق المصرح (30–50م) */
export function clampRadius(radius: number): number {
  if (!Number.isFinite(radius)) return DEFAULT_SAFE_RADIUS_METERS;
  return Math.min(SAFE_RADIUS_RANGE.max, Math.max(SAFE_RADIUS_RANGE.min, radius));
}

/**
 * بوابة الحضور — GeoGate
 */
export class GeoGate {
  constructor(
    private readonly store: AttendanceStore,
    private readonly incidentReporter?: GeoIncidentReporter,
  ) {}

  /**
   * معالجة محاولة حضور:
   *  - تحقق Geo (المسافة/السرعة/الصلاحية)
   *  - كشف تضارب الزمن (clientTimestamp مقابل ختم الخادم ± 60 ثانية)
   *  - إنشاء/تحديث سجل اليوم وربط الحالة
   */
  async process(attempt: AttendanceAttempt): Promise<AttendanceOutcome> {
    const person = await this.store.getPerson(attempt.userId);
    if (!person) {
      return { accepted: false, reason: 'absent', certaintyScore: 0 };
    }

    // 1) كشف التضارب الزمني (Clock Skew) — انحراف > 60 ثانية
    const serverNow = Date.now();
    const skewMs = Math.abs(attempt.clientTimestamp - serverNow);
    if (skewMs > 60_000) {
      const outcome: AttendanceOutcome = {
        accepted: false,
        reason: 'clock_skew',
        certaintyScore: 0,
        verdict: {
          status: 'mock_spoofed',
          reason: `clock_skew:${Math.round(skewMs / 1000)}s`,
          at: new Date(serverNow).toISOString(),
        },
      };
      await this.reportIncident(attempt, 'clock_skew', `clock_skew:${Math.round(skewMs / 1000)}s`, serverNow);
      return outcome;
    }

    // 2) الحصول على بوابة المنشأة/الفرع
    const gate = await this.store.getGateFence(attempt.entityId, person.branchId);
    if (!gate) {
      const outcome: AttendanceOutcome = { accepted: false, reason: 'outside_fence', certaintyScore: 0 };
      await this.reportIncident(attempt, 'outside_fence', 'no_gate_registered', serverNow);
      return outcome;
    }

    const fence: Geofence = {
      entityId: attempt.entityId,
      branchId: gate.branchId,
      center: gate.center,
      radiusMeters: clampRadius(gate.radiusMeters),
    };

    // 3) التحقق الجغرافي (المسافة + السرعة + الصلاحية)
    const previous = await this.getPreviousReading(attempt);
    const verdict = verifyGeoFence(fence, attempt.gps, previous ?? undefined);

    const snapshot: GeoVerdictSnapshot = {
      status: verdict.status,
      distanceMeters: verdict.status === 'inside' || verdict.status === 'outside'
        ? verdict.distanceMeters
        : undefined,
      reason: verdict.status === 'mock_spoofed' ? verdict.reason : undefined,
      speedMetersPerSecond: verdict.status === 'abnormal_speed'
        ? verdict.speedMetersPerSecond
        : undefined,
      at: new Date(serverNow).toISOString(),
    };

    // 4) أي شذوذ → certainty = 0 وتجميد + إبلاغ C9 (PH-N2)
    if (verdict.status !== 'inside') {
      const reason: 'outside_fence' | 'mock_spoofed' | 'abnormal_speed' =
        verdict.status === 'outside' ? 'outside_fence' : verdict.status;
      await this.reportIncident(attempt, reason, snapshot.reason ?? snapshot.speedMetersPerSecond?.toString() ?? reason, serverNow);
      return { accepted: false, reason, certaintyScore: 0, verdict: snapshot };
    }

    // 5) التحديث القياسي للسجل اليومي
    const date = new Date(serverNow).toISOString().slice(0, 10);
    const existing = await this.store.getTodayRecord(attempt.userId, attempt.entityId, date);

    const checkInAt = attempt.action === 'check_in'
      ? new Date(serverNow).toISOString()
      : existing?.checkInAt;
    const checkOutAt = attempt.action === 'check_out'
      ? new Date(serverNow).toISOString()
      : existing?.checkOutAt;

    if (!checkInAt) {
      return { accepted: false, reason: 'absent', certaintyScore: 0 };
    }

    const shift = person.shift;
    const status = shift ? statusFor(shift, checkInAt) : 'on_time';

    // 5) حالة المراجعة: حضور قريب من حافة النطاق (> 80% من نصف القطر)
    //    → pending_review (PH-N2) — يبقى مسجلاً لكنه ينتظر مراجعة المشرف
    const insideDistance = snapshot.distanceMeters ?? 0;
    const nearEdge = insideDistance > fence.radiusMeters * 0.8;
    const reviewState: AttendanceRecord['reviewState'] = nearEdge ? 'pending_review' : 'none';

    if (nearEdge) {
      await this.reportIncident(attempt, 'pending_review', `near_edge:${Math.round(insideDistance)}m/radius:${fence.radiusMeters}m`, serverNow);
    }

    const record: AttendanceRecord = {
      userId: attempt.userId,
      entityId: attempt.entityId,
      date,
      checkInAt,
      checkOutAt,
      status,
      certaintyScore: 100,
      reviewState,
      geo: {
        checkIn: snapshot,
        checkOut: attempt.action === 'check_out' ? snapshot : existing?.geo?.checkOut,
      },
    };

    await this.store.saveRecord(record);
    return { accepted: true, record };
  }

  /** إبلاغ الشذوذ الجغرافي — يُسجل كحادثة سيادية في C9 عند توفر المبلّغ */
  private async reportIncident(
    attempt: AttendanceAttempt,
    type: 'mock_spoofed' | 'abnormal_speed' | 'outside_fence' | 'clock_skew' | 'pending_review',
    reason: string,
    occurredAt: number,
  ): Promise<void> {
    if (!this.incidentReporter) return;
    await this.incidentReporter.report({
      type,
      entityId: attempt.entityId,
      userId: attempt.userId,
      reading: attempt.gps,
      reason,
      occurredAt,
    });
  }

  /** القراءة المكانية السابقة لأغراض كشف السرعة غير الطبيعية */
  private async getPreviousReading(attempt: AttendanceAttempt): Promise<GeoPoint | null> {
    // في الطراز الحالي: لا نقرأ سابقاً إلا إذا وُجد سجل اليوم بهوية قراءة
    const date = new Date(attempt.clientTimestamp).toISOString().slice(0, 10);
    const today = await this.store.getTodayRecord(attempt.userId, attempt.entityId, date);
    const snap = today?.geo?.checkOut ?? today?.geo?.checkIn;
    if (!snap?.at) return null;
    // إعادة بناء نقطة لاغية فقط للكشف عن السرعة — تُستبدل بتخزين القراءات في الإنتاج
    return null;
  }
}
