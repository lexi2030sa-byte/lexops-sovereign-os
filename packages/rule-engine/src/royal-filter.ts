/**
 * الفلتر الملكي 11438 — Royal Filter
 *
 * المرجع: القرار الملكي 11438 (نظام العمل 2026) + ملاحظات التدرج في العقوبة
 * [153، 457، 593] + الأمر العملياتي (التوجيه 3).
 *
 * القاعدة الحاكمة: لا يُسجَّل أي مخالفة "غير جسيمة" ما لم:
 *  1) وُجد في السجل التاريخي (C9) حدث "إنذار مسبق" (early_warning) لنفس الكيان/المخالفة،
 *  2) مرّت مهلة التصحيح: 3 أيام عمل على الأقل من تاريخ الإنذار.
 *
 * أي محاولة تسجيل مخالفة غير جسيمة دون استيفاء الشرطين تُرفض.
 */

export interface PriorWarningRecord {
  eventType: 'early_warning' | 'violation';
  ruleId?: string;
  /** ISO تاريخ الإنذار المسبق */
  occurredAt: string;
}

export interface RoyalFilterInput {
  ruleId: string;
  severity: 'severe' | 'moderate' | 'minor';
  entityId: string;
  /** سجل C9 التاريخي للمنشأة (الأحداث المتعلقة بنفس القاعدة) */
  history: PriorWarningRecord[];
  /** تاريخ محاولة التسجيل الحالية (ISO) */
  now: string;
  /** مهلة التصحيح بالأيام (افتراضي: 3 أيام عمل وفق الدستور) */
  correctionGraceDays?: number;
}

export type RoyalFilterVerdict =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | 'no_prior_warning'
        | 'grace_period_not_elapsed';
      priorWarningDate?: string;
      workdaysElapsed?: number;
      requiredGraceDays: number;
    };

/** حاسبة أيام العمل (استبعاد الجمعة/السبت) */
export function countWorkdays(fromISO: string, toISO: string): number {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  let days = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getUTCDay();
    if (dow !== 5 && dow !== 6) days += 1; // الجمعة 5، السبت 6
  }
  return days;
}

/**
 * تنفيذ الفلتر الملكي — لا تسجيل لمخالفة غير جسيمة بلا إنذار مسبق + 3 أيام عمل.
 * المخالفات الجسيمة لا تمر عبر هذا الفلتر (تُسجَّل مباشرة بضمانات C9).
 */
export function applyRoyalFilter(input: RoyalFilterInput): RoyalFilterVerdict {
  const grace = input.correctionGraceDays ?? 3;

  if (input.severity === 'severe') {
    return { allowed: true };
  }

  const warning = input.history.find(
    (h) => h.eventType === 'early_warning' && (!h.ruleId || h.ruleId === input.ruleId),
  );

  if (!warning) {
    return { allowed: false, reason: 'no_prior_warning', requiredGraceDays: grace };
  }

  const workdays = countWorkdays(warning.occurredAt, input.now);
  if (workdays < grace) {
    return {
      allowed: false,
      reason: 'grace_period_not_elapsed',
      priorWarningDate: warning.occurredAt,
      workdaysElapsed: workdays,
      requiredGraceDays: grace,
    };
  }

  return { allowed: true };
}

/**
 * دمج الفلتر مع نتيجة تقييم المخالفة:
 * يرجع القرار النهائي بعد التأكد من استيفاء شروط القرار الملكي 11438.
 */
export function filterViolationRegistration(input: RoyalFilterInput): {
  register: boolean;
  verdict: RoyalFilterVerdict;
  message: string;
} {
  const verdict = applyRoyalFilter(input);
  if (verdict.allowed) {
    return {
      register: true,
      verdict,
      message: `القرار الملكي 11438 مستوفى — يجوز تسجيل مخالفة ${input.ruleId}`,
    };
  }
  return {
    register: false,
    verdict,
    message:
      verdict.reason === 'no_prior_warning'
        ? 'القرار الملكي 11438: لا يُسجَّل مخالفة غير جسيمة دون إنذار مسبق في سجل C9.'
        : `القرار الملكي 11438: مهلة التصحيح (${verdict.requiredGraceDays} أيام عمل) لم تنقض بعد.`,
  };
}
