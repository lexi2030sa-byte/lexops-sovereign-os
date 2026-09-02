/**
 * نماذج SPE — Sovereign Policy & Payroll Engine Types
 *
 * المرجع: وثيقة "تطبيق الموظفين" (شاشة الرواتب) + وثيقة "لتحويل الأنظمة
 * القانونية..." (SPE) + SOCF v2 + القرار الملكي 11438 + نافذة التكرار 180 يوماً.
 *
 * الحاكمات:
 *  - JSON Logic: تقييم الشروط عبر محرك json-logic-js
 *  - SOCF: قواعد الامتثال التفاضلي (تصنيف المخالفة حسب الجسامة/التكرار)
 *  - WPS: الالتزام ≥ 80% لآخر 3 أشهر
 *  - التكرار: نافذة 180 يوماً
 *  - القرار الملكي 11438: لا تسجيل لمخالفة غير جسيمة بلا إنذار مسبق + 3 أيام عمل
 *  - الرواتب: صافي = أساسي + بدلات − استقطاعات + إقفال شهري + بصمة ZATCA + C9
 */

import type { RulePriority, RuleSeverity } from '@lexops/rule-engine';

/** قاعدة سياسة واحدة قابلة للتقييم (SOCF / WPS / 11438 / JSON Logic) */
export interface SPEPolicyRule {
  id: string;
  name?: string;
  category:
    | 'json_logic'
    | 'socf'
    | 'wps'
    | 'repeat_violation'
    | 'royal_11438'
    | 'general';
  priority?: RulePriority;
  severity?: RuleSeverity;
  /** شروط JSON Logic القابلة للتنفيذ */
  logic?: unknown;
  /** قواعد WPS */
  wps?: {
    /** عتبة الالتزام (افتراضي 80%) */
    minPercent?: number;
    /** الأشهر المعتبرة (افتراضي 3) */
    monthsWindow?: number;
  };
  /** قواعد التكرار */
  repeat?: {
    /** نافذة التكرار بالأيام (افتراضي 180) */
    windowDays?: number;
    /** عدد مرات التكرار المسموح قبل التصعيد */
    maxOccurrences?: number;
  };
  /** قواعد القرار الملكي 11438 */
  royalDecree?: {
    /** مهلة التصحيح بأيام العمل (افتراضي 3) */
    graceWorkDays?: number;
  };
  /** مخرجات القاعدة عند تطابقها */
  outputs?: Record<string, unknown>;
  /** مرجع المصدر */
  source?: Record<string, unknown>;
}

/** سياسة كاملة — مجموعة قواعد */
export interface SPEPolicy {
  id: string;
  name?: string;
  jurisdiction?: string;
  rules: SPEPolicyRule[];
}

/** سياق التقييم — البيانات المدخلة للسياسة */
export interface SPEContext {
  entityId: string;
  actorId?: string;
  /** بيانات الحالة (لتقييم JSON Logic) */
  data: Record<string, unknown>;
  /** جسامة المخالفة الحالية */
  severity?: RuleSeverity;
  /** سجل C9 التاريخي (للإنذار السابق/التكرار) */
  history?: Array<{
    eventType: 'early_warning' | 'violation';
    ruleId?: string;
    occurredAt: string;
  }>;
  /** تاريخ التقييم (ISO) */
  now?: string;
  /** نسبة الالتزام بـ WPS لآخر 3 أشهر (0-100) */
  wpsCompliancePercent?: number;
}

/** نتيجة تقييم قاعدة واحدة */
export interface SPEPolicyResult {
  ruleId: string;
  category: SPEPolicyRule['category'];
  matched: boolean;
  /** القرار الحاكم */
  verdict: 'compliant' | 'violation' | 'blocked' | 'not_applicable';
  /** المخرجات عند التطابق */
  outputs?: Record<string, unknown>;
  /** التسبيب النظامي */
  reasoning: string[];
}

/** واجهة محرك SPE */
export interface SPEEngineInterface {
  evaluate(policy: SPEPolicy, ctx: SPEContext): SPEPolicyResult[];
  applyJSONLogic(rule: SPEPolicyRule, ctx: SPEContext): boolean;
  applyRepeatViolationRule(rule: SPEPolicyRule, ctx: SPEContext): boolean;
  applyRoyalDecreeRule(rule: SPEPolicyRule, ctx: SPEContext): { allowed: boolean; reason?: string };
  applyWPSRule(rule: SPEPolicyRule, ctx: SPEContext): boolean;
}

/* ====================== أنوع الرواتب (Payroll) ====================== */

/** خصم من الراتب (مرتبط بغياب أو مخالفة) */
export interface PayrollDeduction {
  reason: string;
  amount: number;
  legal: boolean;
  linkedViolationId?: number;
}

/** مستحقات الموظف الشهرية */
export interface PayrollInput {
  employeeId: string;
  entityId: string;
  /** الشهر: ISO yyyy-MM */
  period: string;
  baseSalary: number;
  allowances: number;
  deductions: PayrollDeduction[];
  /** أيام العمل المحتسبة من سجل الحضور */
  workedDays: number;
  /** إجمالي أيام الوردية للشهر */
  totalDays: number;
  /** هل صُرف الراتب عبر WPS؟ */
  paidViaWps: boolean;
  /** نسبة الالتزام بـ WPS لآخر 3 أشهر (0-100) */
  wpsCompliancePercent: number;
}

/** نتيجة حساب صافي الراتب */
export interface PayrollResult {
  employeeId: string;
  period: string;
  baseSalary: number;
  allowances: number;
  deductionsTotal: number;
  netSalary: number;
  wpsCompliant: boolean;
  attendanceRatio: number;
  zatcaFingerprint?: string;
  c9BlockId?: number;
  closed: boolean;
}

/** إقفال شهري */
export interface PayrollCloseInput {
  entityId: string;
  period: string;
  results: PayrollResult[];
}

export interface PayrollCloseResult {
  entityId: string;
  period: string;
  totalNet: number;
  resultsCount: number;
  zatcaFingerprint: string;
  c9BlockId: number;
  closedAt: string;
}
