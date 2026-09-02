/**
 * C9 Triggers — طبقة الحصانة التنفيذية (Append-Only Enforcement)
 *
 * المرجع: USDS-02 (فصل C9) + دليل البرمجة (DB Triggers تمنع UPDATE/DELETE)
 * + SOCF + الخطأ المعتمد "Immutable Record" (SOV_950).
 *
 * هذه الطبقة هي "السند التنفيذي التقني": تحويل سجل C9 من سجل منطقي إلى
 * سجل لا يقبل النقض بحجية تنفيذية على مستوى قاعدة البيانات.
 *
 * تُطبَّق ثلاث طبقات دفاع (Defense in Depth):
 *  1. Firestore Security Rules — تمنع update/delete على c9_ledger (انظر c9.firestore.rules)
 *  2. PostgreSQL Triggers — دوال قبل التحديث/الحذف ترفع استثناء immutable_record
 *  3. هذا الحارس (TypeScript) — فحص استباقي قبل وصول أي استدعاء للمخزن
 */

export type C9Mutation = 'create' | 'update' | 'delete';

export interface C9WriteAttempt {
  entityId: string;
  operation: C9Mutation;
  blockIndex?: number;
}

export type C9EnforcementResult =
  | { ok: true }
  | { ok: false; error: 'immutable_record'; code: 'SOV_950'; message: string };

const IMMUTABLE_MESSAGE =
  'Immutable Record — يحظر تعديل أو حذف سجلات C9 (Append-Only). أي تغيير يكسر سلسلة الثقة السيادية.';

/**
 * حارس الحصانة — يرفض أي عملية update/delete على سجل C9
 * (بأي واجهة برمجية كانت، قبل الوصول إلى المخزن).
 */
export function enforceAppendOnly(attempt: C9WriteAttempt): C9EnforcementResult {
  if (attempt.operation === 'create') {
    return { ok: true };
  }
  return {
    ok: false,
    error: 'immutable_record',
    code: 'SOV_950',
    message: IMMUTABLE_MESSAGE,
  };
}

/**
 * مرجع التخطيط لسلسلة C9 في قاعدة البيانات:
 * يرفع استثناءً فورياً عند أي update أو delete — يُنفَّذ في Firestore عبر Rules
 * وفي PostgreSQL عبر Trigger Function (انظر الملفات المصاحبة).
 */
export const IMMUTABLE_RECORD_ERROR = {
  code: 'SOV_950' as const,
  httpStatus: 409,
  message: IMMUTABLE_MESSAGE,
};
