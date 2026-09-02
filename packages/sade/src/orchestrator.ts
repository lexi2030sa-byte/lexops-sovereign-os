/**
 * موزّع SADE — SADE Orchestrator
 *
 * سير العمل (مرجع: وثيقة SADE — نظرة عامة معمارية):
 *  1) Event Listener يستقبل حدث المنصة (VIOLATION_ADJUDICATED, STEP_COMPLETED, ...)
 *  2) Rule Engine: يقيّم القواعد عبر SovereignRuleEngine.load(config) → adjudicate
 *  3) Document Builder: يبني المستند المختوم HMAC-SHA256 من القالب
 *  4) C9 Ledger Bridge: يسجل الحدث في سلسلة المنشأة ويربط المستند بكتلة C9
 *  5) الناتج: SadeDocument بكتلة C9 مرتبطة (LEDGER_RECORDED)
 *
 * كل المستندات تُختم وتُرتبط بسجل الحقيقة — لا مستند بلا بصمة.
 */

import { C9Ledger, C9Event, C9WriteResult } from '@lexops/c9-ledger';
import { SovereignRuleEngine, EvaluationContext } from '@lexops/rule-engine';
import { RoyalFilterInput } from '@lexops/rule-engine';
import { DocumentBuilder } from './document-builder';
import { SadeDocument, SadeGenerationContext, SadeTriggerEvent, SadeTemplate } from './types';

export interface SadeOutcome {
  document: SadeDocument;
  ledger: C9WriteResult;
}

export interface SadeEngine {
  ruleEngine: SovereignRuleEngine;
  documentBuilder: DocumentBuilder;
  ledger: C9Ledger;
  /** قوالب جاهزة للاختيار حسب نوع الحدث */
  templates: SadeTemplate[];
}

/** إدخال التدفق الكامل — الحدث + بيانات التقييم + إدخال الفلتر الملكي */
export interface SadeRunInput {
  event: SadeTriggerEvent;
  ruleId: string;
  evalCtx: EvaluationContext;
  royalInput: RoyalFilterInput;
  entityId: string;
  actorId: string;
  extraMeta?: Record<string, unknown>;
}

/**
 * موزّع التوثيق الذاتي.
 * يجمع بين محرك القواعد + مولّد المستندات + سجل C9 في تدفق واحد.
 */
export class SadeOrchestrator {
  constructor(private readonly engine: SadeEngine) {}

  /** تقييم قاعدة عبر محرك القواعد مع الفلتر الملكي */
  evaluateRule(royalInput: RoyalFilterInput, evalCtx: EvaluationContext): ReturnType<SovereignRuleEngine['adjudicate']> {
    const { ruleEngine } = this.engine;
    if (!ruleEngine.isLoaded) {
      throw new Error('SOV_ORCHESTRATION_UNLOADED — يجب تحميل محرك القواعد قبل التقييم');
    }
    return ruleEngine.adjudicate(evalCtx, royalInput);
  }

  /** الاختيار الحاكم للقالب حسب الحدث */
  private pickTemplate(event: SadeTriggerEvent, type: SadeDocument['type']): SadeTemplate {
    const match =
      this.engine.templates.find((t) => t.type === type) ??
      this.engine.templates[0];
    if (!match) {
      throw new Error(`SOV_NO_TEMPLATE — لا قالب مسجلاً لنوع ${type}`);
    }
    return match;
  }

  /**
   * التدفق الكامل: حدث → تقييم قواعد → مستند مختوم → كتلة C9 مرتبطة.
   */
  async run(input: SadeRunInput): Promise<SadeOutcome> {
    const { event, ruleId, evalCtx, royalInput, entityId, actorId } = input;

    const verdict = this.evaluateRule(royalInput, evalCtx);
    const type: SadeDocument['type'] =
      event === 'VIOLATION_ADJUDICATED' || event === 'STEP_COMPLETED'
        ? 'STEP_RECORD'
        : event === 'PILOT_STARTED' || event === 'PILOT_COMPLETED'
          ? 'PILOT_SUMMARY'
          : event === 'GOV_LETTER_SENT'
            ? 'GOV_LETTER'
            : 'PHASE_REPORT';
    const template = this.pickTemplate(event, type);

    const genCtx: SadeGenerationContext = {
      entityId,
      actorId,
      event,
      verdict: {
        ruleId: verdict.ruleId,
        severity: verdict.severity,
        confidence: verdict.confidence,
        sovereignReasoning: verdict.sovereignReasoning,
        registerAllowed: verdict.registerAllowed,
      },
      metadata: { ...(input.extraMeta ?? {}) },
    };

    const document = this.engine.documentBuilder.build(genCtx);

    const c9Event: C9Event = {
      entityId,
      actorId,
      eventType: `sade:${event.toLowerCase()}`,
      payload: {
        ruleId: verdict.ruleId,
        severity: verdict.severity,
        confidence: verdict.confidence,
        registerAllowed: verdict.registerAllowed,
        documentId: document.id,
        documentHash: document.hash,
        docType: document.type,
      },
      timestamp: Date.now(),
      evidenceRef: document.id,
      legalCode: verdict.ruleId,
    };

    const ledger = await this.engine.ledger.appendEvent(c9Event);

    if (ledger.ok) {
      document.status = 'LEDGER_RECORDED';
      document.ledgerBlockId = ledger.block.blockIndex;
      document.ledgerTxId = ledger.block.hash;
    }

    return { document, ledger };
  }
}
