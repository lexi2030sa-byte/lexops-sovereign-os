/**
 * عقد API السيادي v0.1 — Sovereign API Contract v0.1
 *
 * المرجع: الأمر التنفيذي LEXOPS-T6-API-CONTRACT-01.
 * يوثّق عقود المسارات الحالية (SADE / Attendance / HILAP / ZATCA / Sovereign Pulse)
 * بنوعية مشتركة قابلة للاختبار، قبل أي UI أو تكامل خارجي.
 *
 * القاعدة الحاكمة: لا اختراع صلاحيات جديدة — كل دور هنا موثق في السجل الحالي
 * (identity.ts + scope.ts + Fortress 700).
 */

import type { SovereignRole, SovereignErrorCode } from '../identity';

/** بادئة المسار العامة */
export const API_V0_1_PREFIX = '/api/v0.1' as const;

/** أساليب HTTP المدعومة */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** غلاف الخطأ الموحد */
export interface ApiErrorEnvelope {
  success: false;
  message: string;
  data: null;
  meta: { requestId: string };
}

/** تعريف مسار واحد في العقد */
export interface ApiEndpoint {
  method: HttpMethod;
  path: string;
  purpose: string;
  /** الأدوار المصرح لها — دون اختراع أدوار جديدة */
  allowedRoles: SovereignRole[];
  /** رؤوس سيادية إلزامية */
  requiresEntityId: boolean;
  requestSchema?: string;
  responseSchema?: string;
  /** الأخطاء السيادية المتوقعة */
  errors: SovereignErrorCode[];
}

/** رموز الخطأ الدلالية (business errors) */
export type ApiSemanticError =
  | 'VALIDATION_ERROR'
  | 'MISSING_RULE'
  | 'UNCERTAIN_DECISION'
  | 'FROZEN_DECISION'
  | 'HMAC_INVALID'
  | 'C9_LEDGER_MISSING';

/** جرد المسارات الموثقة في عقد v0.1 */
export const API_CONTRACT_V0_1_ENDPOINTS: ApiEndpoint[] = [
  {
    method: 'POST',
    path: '/sade/triggers',
    purpose: 'تشغيل تدفق التوثيق الذاتي: تقييم قاعدة → مستند مختوم HMAC → كتلة C9',
    allowedRoles: ['founder', 'entity_admin', 'hr_manager', 'compliance_officer', 'field_inspector', 'legal_advisor', 'payroll_officer'],
    requiresEntityId: true,
    requestSchema: 'SadeTriggerRequest',
    responseSchema: 'SadeTriggerResponse',
    errors: ['SOV_401', 'SOV_403', 'SOV_422'],
  },
  {
    method: 'POST',
    path: '/attendance/check-in',
    purpose: 'تسجيل حضور عبر GeoGate (Haversine + كشف التزييف)',
    allowedRoles: ['employee', 'freelancer'],
    requiresEntityId: true,
    requestSchema: 'AttendanceAttemptRequest',
    responseSchema: 'AttendanceOutcomeResponse',
    errors: ['SOV_401', 'SOV_403', 'SOV_422'],
  },
  {
    method: 'POST',
    path: '/attendance/check-out',
    purpose: 'تسجيل انصراف عبر GeoGate',
    allowedRoles: ['employee', 'freelancer'],
    requiresEntityId: true,
    requestSchema: 'AttendanceAttemptRequest',
    responseSchema: 'AttendanceOutcomeResponse',
    errors: ['SOV_401', 'SOV_403', 'SOV_422'],
  },
  {
    method: 'POST',
    path: '/hilap/freeze',
    purpose: 'تجميد قرار دون عتبة LEXI (مسار تحكيم بشري حصري)',
    allowedRoles: ['founder', 'entity_admin', 'hr_manager', 'compliance_officer', 'field_inspector', 'legal_advisor', 'payroll_officer'],
    requiresEntityId: false,
    requestSchema: 'HilapFreezeRequest',
    responseSchema: 'HilapFreezeResponse',
    errors: ['SOV_401', 'SOV_403', 'SOV_422'],
  },
  {
    method: 'POST',
    path: '/hilap/cases',
    purpose: 'فتح قضية نقض حظر (المرحلة 1 من دورة التحكيم)',
    allowedRoles: ['founder', 'entity_admin', 'hr_manager', 'compliance_officer', 'field_inspector', 'legal_advisor'],
    requiresEntityId: true,
    requestSchema: 'HilapOpenRequest',
    responseSchema: 'HilapOpenResponse',
    errors: ['SOV_401', 'SOV_403', 'SOV_422'],
  },
  {
    method: 'POST',
    path: '/hilap/review',
    purpose: 'مراجعة مرحلة لاحقة من دورة التحكيم (أولي/قانوني/قرار إدارة)',
    allowedRoles: ['founder', 'entity_admin', 'hr_manager', 'compliance_officer', 'field_inspector', 'legal_advisor'],
    requiresEntityId: false,
    requestSchema: 'HilapReviewRequest',
    responseSchema: 'HilapReviewResponse',
    errors: ['SOV_401', 'SOV_403', 'SOV_422'],
  },
  {
    method: 'POST',
    path: '/zatca/seal',
    purpose: 'ختم فاتورة إلكترونية (UBL 2.1 + هاش SHA-256 + QR-TLV + ختم HMAC)',
    allowedRoles: ['founder', 'entity_admin', 'hr_manager', 'compliance_officer', 'payroll_officer'],
    requiresEntityId: false,
    requestSchema: 'ZatcaSealRequest',
    responseSchema: 'ZatcaSealResponse',
    errors: ['SOV_401', 'SOV_403', 'SOV_422'],
  },
  {
    method: 'POST',
    path: '/zatca/verify',
    purpose: 'التحقق من صحة ختم فاتورة',
    allowedRoles: ['founder', 'entity_admin', 'hr_manager', 'compliance_officer', 'field_inspector', 'legal_advisor', 'payroll_officer'],
    requiresEntityId: false,
    requestSchema: 'ZatcaVerifyRequest',
    responseSchema: 'ZatcaVerifyResponse',
    errors: ['SOV_401', 'SOV_403', 'SOV_422'],
  },
  {
    method: 'GET',
    path: '/sovereign/pulse',
    purpose: 'نبض النظام الشامل — للمؤسس حصراً (مسار /sovereign/ عبر Fortress 700)',
    allowedRoles: ['founder'],
    requiresEntityId: false,
    responseSchema: 'PulseResponse',
    errors: ['SOV_401', 'SOV_403', 'SOV_422'],
  },
  {
    method: 'GET',
    path: '/health',
    purpose: 'فحص الصحة العامة (مسار عام — لا يتطلب هوية)',
    allowedRoles: [],
    requiresEntityId: false,
    responseSchema: 'HealthResponse',
    errors: [],
  },
];

/** رموز الخطأ الدلالية الممكنة حسب المسار */
export const SEMANTIC_ERRORS_BY_ENDPOINT: Record<string, ApiSemanticError[]> = {
  '/sade/triggers': ['MISSING_RULE', 'UNCERTAIN_DECISION', 'FROZEN_DECISION', 'C9_LEDGER_MISSING'],
  '/attendance/check-in': ['VALIDATION_ERROR', 'C9_LEDGER_MISSING'],
  '/attendance/check-out': ['VALIDATION_ERROR', 'C9_LEDGER_MISSING'],
  '/hilap/freeze': ['UNCERTAIN_DECISION', 'FROZEN_DECISION'],
  '/hilap/cases': ['VALIDATION_ERROR', 'C9_LEDGER_MISSING'],
  '/hilap/review': ['VALIDATION_ERROR', 'C9_LEDGER_MISSING'],
  '/zatca/seal': ['VALIDATION_ERROR', 'HMAC_INVALID'],
  '/zatca/verify': ['VALIDATION_ERROR', 'HMAC_INVALID'],
  '/sovereign/pulse': [],
  '/health': [],
};
