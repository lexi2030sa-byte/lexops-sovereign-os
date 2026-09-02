/**
 * نماذج HILAP 2.0 — Human-in-the-Loop Arbitration Protocol
 *
 * المرجع: وثيقة "بروتوكول التحكيم والتدخل البشري الحاكم لنقض الحظر الآلي (HILAP)".
 *
 * الحاكمات:
 *  - القرارات دون عتبة LEXI (الاعتيادي 80% / الجسيم 90%) تُجمَّد ولا تُنفَّذ آلياً.
 *  - الحظر الآلي قابل للنقض عبر دورة تحكيم (4 مراحل، إجمالي ≤ 48 ساعة).
 *  - كل تدخل بشري يُسجل ككتلة إلزامية في C9 Ledger (بصمة + توقيعان).
 *  - الأدوار المخولة: Org Owner / HR Manager / Legal Advisor / Compliance Officer / Founder.
 *  - لا يشمل: تعديل/حذف/إعادة تسلسل C9 إطلاقاً.
 */

/** أدوار التدخل البشري المخولة (الجدول الحاكم في الوثيقة) */
export type HilapRole =
  | 'org_owner'
  | 'hr_manager'
  | 'legal_advisor'
  | 'compliance_officer'
  | 'founder';

/** مراحل الدورة الإجرائية (الزمن الحاكم) */
export const HILAP_STAGES = {
  SUBMIT: { key: 'SUBMIT', label: 'تقديم طلب نقض الحظر', maxHours: 24 },
  PRELIMINARY_REVIEW: { key: 'PRELIMINARY_REVIEW', label: 'مراجعة أولية', maxHours: 4 },
  LEGAL_ARBITRATION: { key: 'LEGAL_ARBITRATION', label: 'مراجعة قانونية', maxHours: 8 },
  EXECUTIVE_DECISION: { key: 'EXECUTIVE_DECISION', label: 'قرار الإدارة العليا', maxHours: 12 },
} as const;

export type HilapStageKey = keyof typeof HILAP_STAGES;

/** قرار الإدارة العليا الحاكم */
export type HilapFinalDecision = 'uphold' | 'overturn' | 'suspend' | 'reinvestigate';

/** حالة دورة التحكيم */
export type HilapStatus = 'open' | 'in_review' | 'decided' | 'expired' | 'escalated';

/** طلب نقض الحظر */
export interface HilapRequest {
  /** معرف التدخل (HILAP-ID) */
  id: string;
  entityId: string;
  /** رقم كتلة الحظر الأصلي في C9 */
  blockId: number;
  ruleId?: string;
  /** سبب الاعتراض */
  reason: string;
  /** أدلة مرفقة — بصمات فقط */
  evidenceHashes: string[];
  submittedBy: string;
  submittedAt: string;
  /** الثقة التي جُمِّد عندها القرار */
  frozenConfidence: number;
}

/** تدخل بشري في مرحلة ما */
export interface HilapIntervention {
  stage: HilapStageKey;
  role: HilapRole;
  actorId: string;
  action: string;
  note?: string;
  at: string;
  /** توقيع المتدخل */
  actorSignature?: string;
}

/** نتيجة الدورة الكاملة */
export interface HilapCase {
  id: string;
  request: HilapRequest;
  stage: HilapStageKey;
  status: HilapStatus;
  interventions: HilapIntervention[];
  /** القرار النهائي */
  decision?: HilapFinalDecision;
  decidedBy?: string;
  decidedAt?: string;
  /** بصمة كتلة C9 للقرار الأصلي + بصمة كتلة التدخل */
  c9?: {
    originalBlockHash: string;
    interventionBlockId?: number;
    interventionBlockHash?: string;
  };
  /** انقضاء المهلة المتبقية */
  expiresAt: string;
}

/** مدخلات مراجعة من قبل دور مخوّل */
export interface HilapReviewInput {
  caseId: string;
  stage: HilapStageKey;
  role: HilapRole;
  actorId: string;
  action: string;
  note?: string;
}

/** الزمن الكلي الحاكم للدورة (ساعات) */
export const HILAP_TOTAL_MAX_HOURS = 48;
