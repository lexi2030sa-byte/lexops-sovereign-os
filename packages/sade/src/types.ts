/**
 * نماذج SADE — Sovereign Auto-Documentation Engine Types
 *
 * المرجع: وثيقة "الآلية السيادية للتوثيق الذاتي داخل المنصة" (SADE Components)
 * + USDS-02 (Orchestration Engine Layer 2).
 *
 * أنواع المستندات الحاكمة:
 *   STEP_RECORD / PHASE_REPORT / GOV_LETTER / PILOT_SUMMARY / CONTRACT_DRAFT
 * حالة المستند:
 *   GENERATED → SIGNED → HASHED → LEDGER_RECORDED → ARCHIVED
 */

export type SadeDocumentType =
  | 'STEP_RECORD'
  | 'PHASE_REPORT'
  | 'GOV_LETTER'
  | 'PILOT_SUMMARY'
  | 'CONTRACT_DRAFT';

export type SadeDocumentStatus =
  | 'GENERATED'
  | 'SIGNED'
  | 'HASHED'
  | 'LEDGER_RECORDED'
  | 'ARCHIVED';

/** أحداث المنصة المثبّتة لزناد التوثيق */
export type SadeTriggerEvent =
  | 'PHASE_COMPLETED'
  | 'STEP_COMPLETED'
  | 'PILOT_STARTED'
  | 'PILOT_COMPLETED'
  | 'REPORT_GENERATED'
  | 'GOV_LETTER_SENT'
  | 'CONTRACT_DRAFTED'
  | 'CONTRACT_SIGNED'
  | 'VIOLATION_ADJUDICATED';

/** بيانات المستند في سجل SADE (نموذج sade_documents) */
export interface SadeDocument {
  id: string;
  phaseId?: string;
  stepId?: string;
  type: SadeDocumentType;
  title: string;
  status: SadeDocumentStatus;
  createdAt: string;
  createdBy: string;
  /** محتوى المستند النهائي (PDF افتراضي / JSON) */
  content: string;
  /** بصمة HMAC-SHA256 على المحتوى */
  hash: string;
  /** معرف كتلة C9 المرتبطة */
  ledgerBlockId?: number;
  /** معرّف معاملة C9 */
  ledgerTxId?: string;
  metadata: Record<string, unknown>;
}

/** قالب مستند (نموذج sade_templates) */
export interface SadeTemplate {
  id: string;
  type: SadeDocumentType;
  name: string;
  version: number;
  language: 'AR' | 'EN' | 'BILINGUAL';
  /** نص القالب مع مواضع {{placeholder}} */
  body: string;
  placeholders: string[];
}

/** سياق إنشاء المستند — ناتج زناد محرك القواعد */
export interface SadeGenerationContext {
  entityId: string;
  actorId: string;
  event: SadeTriggerEvent;
  /** ناتج محرك القواعد (verdict) ليُدمج في المستند */
  verdict: {
    ruleId?: string;
    severity?: string;
    confidence?: number;
    sovereignReasoning?: string;
    registerAllowed?: boolean;
  };
  metadata: Record<string, unknown>;
}

/** خريطة ربط الحدث بنوع المستند */
export const TRIGGER_TO_DOCUMENT_TYPE: Record<SadeTriggerEvent, SadeDocumentType> = {
  PHASE_COMPLETED: 'PHASE_REPORT',
  STEP_COMPLETED: 'STEP_RECORD',
  PILOT_STARTED: 'PILOT_SUMMARY',
  PILOT_COMPLETED: 'PILOT_SUMMARY',
  REPORT_GENERATED: 'PHASE_REPORT',
  GOV_LETTER_SENT: 'GOV_LETTER',
  CONTRACT_DRAFTED: 'CONTRACT_DRAFT',
  CONTRACT_SIGNED: 'CONTRACT_DRAFT',
  VIOLATION_ADJUDICATED: 'STEP_RECORD',
};
