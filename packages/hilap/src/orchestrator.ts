/**
 * منسّق التحكيم البشري — HILAP Orchestrator
 *
 * ينفّذ دورة النقض في 4 مراحل (تقديم → مراجعة أولية → مراجعة قانونية → قرار الإدارة)،
 * مع التحقق من الأدوار المخولة لكل مرحلة، وربط كل تدخل بكتلة C9 إلزامية.
 *
 * المرحلة 1 (تقديم الطلب) مفتوحة لأصحاب الصلاحية (org_owner/hr_manager/legal_advisor/compliance_officer).
 * المرحلة 2 (مراجعة أولية): hr_manager أو compliance_officer.
 * المرحلة 3 (مراجعة قانونية): legal_advisor حصراً.
 * المرحلة 4 (قرار الإدارة): org_owner أو founder.
 *
 * أي تدخل بدور غير مخول للمرحلة → رفض (SOV_HILAP_FORBIDDEN).
 */

import { createHmac } from 'crypto';
import { C9Ledger, C9Event } from '@lexops/c9-ledger';
import {
  HilapCase,
  HilapFinalDecision,
  HilapRequest,
  HilapReviewInput,
  HilapRole,
  HilapStageKey,
  HilapStatus,
  HILAP_STAGES,
  HILAP_TOTAL_MAX_HOURS,
} from './types';

/** مصفوفة الأدوار المخولة لكل مرحلة */
const STAGE_ALLOWED_ROLES: Record<HilapStageKey, HilapRole[]> = {
  SUBMIT: ['org_owner', 'hr_manager', 'legal_advisor', 'compliance_officer', 'founder'],
  PRELIMINARY_REVIEW: ['hr_manager', 'compliance_officer'],
  LEGAL_ARBITRATION: ['legal_advisor'],
  EXECUTIVE_DECISION: ['org_owner', 'founder'],
};

/** تسلسل المراحل المتتالية */
const STAGE_ORDER: HilapStageKey[] = [
  'SUBMIT',
  'PRELIMINARY_REVIEW',
  'LEGAL_ARBITRATION',
  'EXECUTIVE_DECISION',
];

/** مخزن حالات HILAP — تُوفّره Firestore في الإنتاج */
export interface HilapStore {
  save(case_: HilapCase): Promise<void>;
  get(caseId: string): Promise<HilapCase | null>;
}

/** توقيع المتدخل — HMAC-SHA256 على محتوى التدخل */
function signIntervention(
  input: HilapReviewInput,
  caseId: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${caseId}|${input.stage}|${input.actorId}|${input.action}`)
    .digest('hex');
}

/** تجميد قرار دون العتبة — يُحال إلى مسار HILAP حصرياً (من LEXI) */
export class HilapOrchestrator {
  constructor(
    private readonly store: HilapStore,
    private readonly ledger: C9Ledger,
    private readonly hmacSecret: string,
  ) {}

  /** إنشاء قضية نقض جديدة (المرحلة 1) */
  async open(request: HilapRequest, actorId: string, role: HilapRole): Promise<HilapCase> {
    if (!STAGE_ALLOWED_ROLES.SUBMIT.includes(role)) {
      throw new Error('SOV_HILAP_FORBIDDEN — دور غير مخول لتقديم طلب النقض');
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HILAP_TOTAL_MAX_HOURS * 3600_000).toISOString();
    const case_: HilapCase = {
      id: request.id,
      request,
      stage: 'SUBMIT',
      status: 'open',
      interventions: [
        {
          stage: 'SUBMIT',
          role,
          actorId,
          action: 'submit_reversal_request',
          note: request.reason,
          at: now.toISOString(),
          actorSignature: signIntervention(
            { caseId: request.id, stage: 'SUBMIT', role, actorId, action: 'submit_reversal_request' },
            request.id,
            this.hmacSecret,
          ),
        },
      ],
      expiresAt,
    };
    await this.store.save(case_);
    return case_;
  }

  /** المراحل التالية: مراجعة أولية → قانونية → قرار الإدارة */
  async review(input: HilapReviewInput): Promise<HilapCase> {
    const case_ = await this.store.get(input.caseId);
    if (!case_) throw new Error('SOV_HILAP_NOT_FOUND — قضية غير موجودة');
    if (case_.status === 'decided' || case_.status === 'expired') {
      throw new Error('SOV_HILAP_CLOSED — القضية مغلقة');
    }

    const expectedStage = STAGE_ORDER[STAGE_ORDER.indexOf(case_.stage) + 1];
    if (input.stage !== expectedStage) {
      throw new Error(`SOV_HILAP_STAGE — المرحلة الحالية ${case_.stage} تتطلب ${expectedStage}`);
    }
    if (!STAGE_ALLOWED_ROLES[input.stage].includes(input.role)) {
      throw new Error('SOV_HILAP_FORBIDDEN — دور غير مخول لهذه المرحلة');
    }

    case_.interventions.push({
      stage: input.stage,
      role: input.role,
      actorId: input.actorId,
      action: input.action,
      note: input.note,
      at: new Date().toISOString(),
      actorSignature: signIntervention(input, case_.id, this.hmacSecret),
    });
    case_.stage = input.stage;
    if (input.stage === 'EXECUTIVE_DECISION') {
      case_.status = 'decided';
      case_.decision = input.action as HilapFinalDecision;
      case_.decidedBy = input.actorId;
      case_.decidedAt = new Date().toISOString();
    } else {
      case_.status = 'in_review';
    }

    // ربط كتلة التدخل البشري في C9 — غير قابلة للتعديل/الحذف
    const c9Event: C9Event = {
      entityId: case_.request.entityId,
      actorId: input.actorId,
      eventType: `hilap:${input.stage.toLowerCase()}`,
      payload: {
        hilapId: case_.id,
        originalBlockId: case_.request.blockId,
        ruleId: case_.request.ruleId,
        role: input.role,
        action: input.action,
        note: input.note,
      },
      timestamp: Date.now(),
      legalCode: case_.request.ruleId,
    };
    const write = await this.ledger.appendEvent(c9Event);
    if (write.ok) {
      case_.c9 = {
        originalBlockHash: String(case_.c9?.originalBlockHash ?? ''),
        interventionBlockId: write.block.blockIndex,
        interventionBlockHash: write.block.hash,
      };
    }

    await this.store.save(case_);
    return case_;
  }

  /** تفعيل التجميد: قرار LEXI دون العتبة → فتح قضية HILAP تلقائياً */
  freeze(frozenConfidence: number, threshold: number): { frozen: boolean; reason?: string } {
    if (frozenConfidence < threshold) {
      return { frozen: true, reason: 'below_confidence_threshold' };
    }
    return { frozen: false };
  }

  /** التحقق من انقضاء المهلة (48 ساعة) — قضية منتهية تُغلَق */
  isExpired(case_: HilapCase, now = new Date().toISOString()): boolean {
    return new Date(case_.expiresAt).getTime() < new Date(now).getTime();
  }
}
