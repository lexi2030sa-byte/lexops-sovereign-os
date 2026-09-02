/**
 * مجموعات Firestore الأساسية — Persistent Collections (PH-N1)
 *
 * المرجع: قرار المؤسس (البنية المتداخلة tenants/{tenantId}) + وثيقة قاعدة بيانات
 * Firestore + USDS-02.
 *
 * البنية الحاكمة: كل كيان داخل مستأجره — لا وصول متقاطع (Fortress 700).
 *   tenants/{tenantId}/entities|branches|employees|attendance|violations|objections|payroll
 *   tenants/{tenantId}/c9_ledger/{eventId}  (سجل الحقيقة)
 *   staff/{userId}                          (بطاقات الموظفين)
 */

/** المجموعات الأساسية المعتمدة */
export const FIRESTORE_GROUPS = {
  entities: 'entities',
  branches: 'branches',
  employees: 'employees',
  attendance: 'attendance',
  violations: 'violations',
  objections: 'objections',
  payroll: 'payroll',
  c9Ledger: 'c9_ledger',
} as const;

export type FirestoreGroup = keyof typeof FIRESTORE_GROUPS;

/** مسار مجموعة داخل مستأجر: tenants/{tenantId}/{group} */
export function tenantGroupPath(tenantId: string, group: FirestoreGroup): string {
  return `tenants/${tenantId}/${FIRESTORE_GROUPS[group]}`;
}

/** مسار مستند داخل مجموعة مستأجر */
export function tenantDocPath(tenantId: string, group: FirestoreGroup, docId: string): string {
  return `${tenantGroupPath(tenantId, group)}/${docId}`;
}

/** مسار سجل C9: tenants/{tenantId}/c9_ledger/{eventId} */
export function c9EventPath(tenantId: string, eventId: string): string {
  return tenantDocPath(tenantId, 'c9Ledger', eventId);
}

/** بطاقة موظف: staff/{userId} */
export function staffDocPath(userId: string): string {
  return `staff/${userId}`;
}

/** هل تتوفر الاعتمادات الحية (Service Account / Emulator)؟ */
export function hasLiveCredentials(): boolean {
  return (
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS) ||
    Boolean(process.env.FIRESTORE_EMULATOR_HOST) ||
    Boolean(process.env.GCLOUD_PROJECT)
  );
}
