/**
 * LexOps Sovereign OS — عقود الهوية السيادية
 *
 * المرجع: USDS-02 + وثيقة RBAC التفصيلية + Firestore Security Rules.
 *
 * ملاحظة سيادية (Zero-Assumption):
 * وثيقة RBAC تذكر 8 أدوار رسمية بينما وثيقة واجهات النظام تعتمد 3 أدوار
 * (founder / entity_admin / employee) والملف التشغيلي يضيف roles: root/admin/hr/employee
 * ووثيقة Firestore rules تعتمد (founder / manager / employee).
 * حتى يُحسم النطاق النهائي، تُعرّف الأدوار هنا بقيم ثابتة موثقة من المصدرين الرئيسيين
 * (USDS-02 الفصل 4.2 ووثيقة RBAC) — مع الإبقاء على التوافق مع Custom Claims.
 */

export type SovereignRole =
  | 'founder'
  | 'entity_admin'
  | 'hr_manager'
  | 'compliance_officer'
  | 'field_inspector'
  | 'legal_advisor'
  | 'payroll_officer'
  | 'employee'
  | 'freelancer';

/** الأدوار الأساسية المعتمدة في USDS-02 (الحد الأدنى القابل للتشغيل) */
export type CoreSovereignRole = 'founder' | 'entity_admin' | 'employee';

export const CORE_ROLES: readonly CoreSovereignRole[] = ['founder', 'entity_admin', 'employee'] as const;

/** الرتبة السيادية (Sovereign Rank) — المستخلصة من Firebase Custom Claims */
export interface SovereignIdentity {
  userId: string;
  /** Fortress 700 — رقم المنشأة الموحد. فارغ للمؤسس (Root) */
  entityId?: string;
  role: SovereignRole;
  /** الرقم الموحد 700 (إن توفر) */
  sevenHundred?: string;
  employeeId?: string;
}

/** الـ Headers السيادية الإلزامية */
export interface SovereignHeaders {
  'X-Entity-Id': string;
  'X-Sovereign-Role': SovereignRole;
  'X-User-Id': string;
  'X-Request-Id': string;
  Authorization: string;
}

/** غلاف الاستجابة الموحد (Unified Response Envelope) — بروتوكول الاتساق */
export interface SovereignEnvelope<T = unknown> {
  success: boolean;
  message: string;
  data: T | null;
  meta: {
    requestId: string;
    c9Hash?: string;
    c9EventId?: string;
    c9BlockIndex?: number;
  };
}

/** رموز الأخطاء السيادية */
export type SovereignErrorCode =
  | 'SOV_401'
  | 'SOV_403'
  | 'SOV_422'
  | 'SOV_409'
  | 'SOV_503'
  | 'SOV_900'
  | 'SOV_950';

export const SOVEREIGN_ERROR_CODES: Record<SovereignErrorCode, number> = {
  SOV_401: 401,
  SOV_403: 403,
  SOV_422: 422,
  SOV_409: 409,
  SOV_503: 503,
  SOV_900: 500,
  SOV_950: 409,
};

/** المسارات العامة (Public) — لا تتطلب X-Entity-Id */
export const PUBLIC_PATHS: readonly string[] = ['/auth/login', '/auth/register-founder', '/auth/refresh', '/health'] as const;
