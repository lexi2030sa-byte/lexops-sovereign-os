/**
 * دستور النواة — ثوابت الامتثال السيادية
 *
 * مصدر هذه القيم هي الوثائق المرجعية (مرجع حقيقة نهائي):
 *  - إطار SOCF v2 / SADE / قواعد Firestore / وثيقة واجهات النظام
 *  - البروتوكول التشغيلي للمدة 60 يوماً والدفوع النوعية
 *
 * ملاحظة سيادية (Zero-Assumption): هذه القيم قابلة للتعديل عبر Console الإدارة
 * ولا تُهندَس في الكود، لكنها تُحفَّظ هنا كقيم افتراضية موثقة.
 */

/** المواعيد النظامية (بالأيام) — المرجع: الدفوع النوعية + قواعد الامتثال */
export const REGULATORY_DEADLINES = {
  /** مهلة الاعتراض/التظلم على المخالفات */
  objectionWindowDays: 60,
  /** نافذة تكرار المخالفة (العمل) */
  recurrenceWindowWorkDays: 180,
  /** نافذة تكرار المخالفة (البلدي) */
  recurrenceWindowMunicipalDays: 365,
  /** فترة التجربة القصوى */
  probationMaxDays: 90,
  /** التمديد الأقصى لفترة التجربة (بموافقة مكتوبة) */
  probationExtensionDays: 180,
  /** إبلاغ تغيير بيانات المنشأة */
  entityDataChangeReportDays: 10,
  /** صرف مستحقات نهاية الخدمة */
  settlementPayoutDays: 7,
  /** إشعار إنهاء العقد */
  terminationNoticeDays: 60,
  /** الالتزام النسبي بـ WPS لآخر 3 أشهر */
  wpsComplianceMinPercent: 80,
  /** الحد الأقصى للحسميات الشهرية (أيام) */
  maxMonthlyDeductionDays: 5,
  /** المهلة التصحيحية للمخالفات غير الجسيمة */
  correctionGraceWorkDays: 3,
} as const;

/** عتبة اليقين الاستدلالي للقرارات الآلية
 * القرار الحاكم (حسب حسم المؤسس): نطاق ديناميكي 80–90%
 *  - القرارات الاعتيادية: ≥ 80%
 *  - القرارات الجسيمة / حساسة: ≥ 90%
 *  - النقض البشري الحاكم (HILAP): عند 90% وفوق
 */
export const LEXI_CONFIDENCE = {
  /** الحد الأدنى للقرار الآلي (الحالات الاعتيادية) */
  minAutoDecision: 0.8,
  /** عتبة القرار الآلي للحالات الجسيمة/الحساسة */
  severeAutoDecision: 0.9,
  /** عتبة النقض البشري الحاكم (HILAP) */
  humanOverrideThreshold: 0.9,
} as const;

/** المصنفات الحجمية للمنشأة (قرار وزاري 112377) */
export const SIZE_CLASS = {
  A: { label: 'A', minEmployees: 50, fineCeiling: 5000 },
  B: { label: 'B', minEmployees: 21, fineCeiling: 3000 },
  C: { label: 'C', minEmployees: 0, fineCeiling: 1500 },
} as const;

/** أدوار RBAC (النطاق المعتمد في USDS-02) */
export const SOVEREIGN_ROLES = ['founder', 'entity_admin', 'employee', 'freelancer'] as const;

/** نطاقات Firestore المعتمدة (نموذج متعدد المستأجرين) — مرجع: قواعد أمن Firestore.
 *  القرار الحاكم (حسم المؤسس): البنية المتداخلة tenants/{tenantId} + staff/{userId}
 *  (تقرير المجموعات العليا السابق كان تجربة سابقة غير معتمدة).
 */
export const FIRESTORE_COLLECTIONS = {
  staff: 'staff',
  tenants: 'tenants',
  c9Ledger: 'c9_ledger',
  /** مسار سجل C9 داخل المستأجر: tenants/{tenantId}/c9_ledger */
  tenantC9Ledger: 'c9_ledger',
} as const;

/** المنطقة السيادية (Sovereign Region) — الدمام me-central2 */
export const SOVEREIGN_REGION = 'me-central2';
export const SOVEREIGN_REGION_NAME = 'الدمام — Dammam';

/** مدة الحصن Fortress 700 */
export const FORTRESS_700 = {
  name: 'Fortress 700',
  /** النطاق الجغرافي الآمن */
  safeRadiusMeters: { min: 30, max: 50 },
} as const;
