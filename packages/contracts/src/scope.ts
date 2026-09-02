/**
 * عقد النطاق السيادي — Sovereign Scope Contract (Fortress 700)
 *
 * المرجع: USDS-02 (عقيدة الحصن 700) + وثيقة RBAC التفصيلية + وثيقة واجهات النظام.
 *
 * القاعدة الحاكمة: لا يوجد وصول متقاطع بين المنشآت إطلاقاً.
 *  - المؤسس (founder): وصول شامل داخل منشأته فقط + تجاوز سيادي مشروع للتشخيص
 *  - مدير المنشأة (entity_admin): منشأته فقط
 *  - الموظف (employee): ملفه الشخصي فقط
 *  - أي محاولة Cross-tenant تُرفض بـ SOV_403.
 */

import type { SovereignRole } from './identity';

export type ScopeTarget =
  | { type: 'entity'; entityId: string }
  | { type: 'staff'; entityId: string; staffId: string }
  | { type: 'self'; userId: string };

export type ScopeVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'missing_entity_id' | 'cross_tenant' | 'forbidden_role' | 'self_mismatch' };

/** تصنيف الدور ضمن التسلسل السيادي (الأعلى = أوسع نطاقاً) */
export const ROLE_HIERARCHY: Record<SovereignRole, number> = {
  founder: 6,
  entity_admin: 5,
  hr_manager: 4,
  compliance_officer: 3,
  field_inspector: 3,
  legal_advisor: 3,
  payroll_officer: 3,
  employee: 1,
  freelancer: 1,
};

/**
 * حكم عزل الحصن 700 — يمنع أي وصول متقاطع بين المنشآت.
 * كل حكم هنا مبني على الوثائق الحاكمة لا على افتراض.
 */
export function evaluateScope(
  identity: { userId: string; entityId?: string; role: SovereignRole },
  target: ScopeTarget,
): ScopeVerdict {
  const myEntityId = identity.entityId;

  switch (target.type) {
    case 'entity':
      if (!myEntityId) {
        // المؤسس بدون رقم منشأة يملك نطاق جذر للتشخيص فقط — لا وصول لأي منشأة افتراضياً
        return { allowed: false, reason: 'missing_entity_id' };
      }
      return target.entityId === myEntityId
        ? { allowed: true }
        : { allowed: false, reason: 'cross_tenant' };

    case 'staff':
      if (!myEntityId) {
        return { allowed: false, reason: 'missing_entity_id' };
      }
      // لا بد أن تنتمي بطاقة الموظف لنفس منشأة الطالب
      if (target.entityId !== myEntityId) {
        return { allowed: false, reason: 'cross_tenant' };
      }
      // الموظف العادي لا يرى ملفات زملائه إلا إذا كان الملف لنفسه
      if (ROLE_HIERARCHY[identity.role] <= 1) {
        if (target.staffId !== identity.userId) {
          return { allowed: false, reason: 'self_mismatch' };
        }
      }
      return { allowed: true };

    case 'self':
      return target.userId === identity.userId
        ? { allowed: true }
        : { allowed: false, reason: 'self_mismatch' };
  }
}

/** هل يملك الدور صلاحية كتابة على نطاق المنشأة؟ (للعمليات الإدارية) */
export function canAdministerEntity(role: SovereignRole): boolean {
  return ROLE_HIERARCHY[role] >= 2;
}
