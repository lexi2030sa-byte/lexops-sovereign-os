/**
 * نماذج PEOPLE و ATTENDANCE — Blueprints السيادية
 *
 * المرجع: وثيقة "تطبيق الموظفين" + "الموظف التابع" + بروتوكول LEXI لدورة حياة
 * المنشأة + وثيقة التحقق المكاني (GeoGate).
 *
 * الحاكمات:
 *  - كل تسجيل حضور يمر عبر GeoGate (Haversine + كشف التزييف) قبل قبوله.
 *  - أي تضارب (GPS غير صحيح / سرعة غير طبيعية / خارج النطاق) → certainty = 0
 *    ويُجمَّد الحضور (يُسجَّل حادثة سيادية في C9).
 *  - حالة اليوم: on_time | late | absent — تُحسب من مواعيد الوردية.
 */

import type { GeoPoint } from '@lexops/geofencing';

/** هوية شخصية سيادية (PEOPLE) */
export interface Person {
  userId: string;
  entityId: string;
  branchId?: string;
  role: 'employee' | 'freelancer';
  /** الاسم الظاهر */
  name?: string;
  /** رقم الوثيقة (إقامة/هوية) */
  documentNumber?: string;
  /** جهة العمل (للمستقلين) */
  employer?: string;
  /** بيانات الوردية الافتراضية */
  shift?: ShiftWindow;
  /** هل الحساب نشط */
  active: boolean;
}

/** نافذة الوردية — لحساب التأخير والغياب */
export interface ShiftWindow {
  /** وقت بدء الوردية (HH:mm) */
  start: string;
  /** وقت انتهاء الوردية (HH:mm) */
  end: string;
  /** مهلة السماح بالدقائق (تجاوزها = متأخر) */
  graceMinutes: number;
}

/** سجل حضور يومي (ATTENDANCE) */
export interface AttendanceRecord {
  userId: string;
  entityId: string;
  /** ISO yyyy-MM-dd */
  date: string;
  checkInAt?: string;
  checkOutAt?: string;
  status: 'on_time' | 'late' | 'absent';
  /** درجة اليقين — أي تضارب = 0 */
  certaintyScore: number;
  /** نتائج GeoGate عند كل تسجيل */
  geo?: {
    checkIn: GeoVerdictSnapshot;
    checkOut?: GeoVerdictSnapshot;
  };
  /** حالة المراجعة اليدوية للحضور المشكوك فيه (PH-N2) */
  reviewState?: 'none' | 'pending_review' | 'approved' | 'rejected';
  /** تحديد نهاية اليوم */
  frozen?: { reason: string; occurredAt: string };
}

/** لقطة حكم GeoGate عند لحظة تسجيل */
export interface GeoVerdictSnapshot {
  status: 'inside' | 'outside' | 'mock_spoofed' | 'abnormal_speed';
  distanceMeters?: number;
  reason?: string;
  speedMetersPerSecond?: number;
  at: string;
}

/** حدث الحضور القادم من جهاز الموظف */
export interface AttendanceAttempt {
  userId: string;
  entityId: string;
  action: 'check_in' | 'check_out';
  /** وقت الجهاز (epoch ms) — يُقارن بختم الخادم لكشف تضارب زمني */
  clientTimestamp: number;
  gps: GeoPoint;
  /** معرف الجهاز — ضد إعادة التشغيل المتزامنة */
  deviceId?: string;
}

/** نقطة الوردية المصرح بها للبوابة */
export interface GateFence {
  entityId: string;
  branchId?: string;
  center: GeoPoint;
  /** نصف قطر الأمان (ضمن 30–50م) */
  radiusMeters: number;
}

/** نتيجة معالجة محاولة الحضور */
export type AttendanceOutcome =
  | { accepted: true; record: AttendanceRecord }
  | {
      accepted: false;
      reason: 'mock_spoofed' | 'abnormal_speed' | 'outside_fence' | 'clock_skew' | 'absent';
      certaintyScore: number;
      verdict?: GeoVerdictSnapshot;
    };

/** مُبلّغ الشذوذ الجغرافي — يُسجل كحادثة سيادية في C9 (PH-N2) */
export interface GeoIncidentReporter {
  report(incident: {
    type: 'mock_spoofed' | 'abnormal_speed' | 'outside_fence' | 'clock_skew' | 'pending_review';
    entityId: string;
    userId: string;
    reading: GeoPoint;
    reason: string;
    occurredAt: number;
  }): Promise<void>;
}

export type { GeoPoint };
