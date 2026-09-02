/**
 * محرك الاستدلال السيادي للقواعد — Sovereign Rule Engine (Facade)
 *
 * المرجع: ملف "محرك الربط المنطقي – JSON Logic" + الأمر العملياتي (التوجيهات 1-4).
 *
 * سير العمل:
 *  1) RuleNormalizer: تطبيع أي مخطط JSON إلى NormalizedRuleSet
 *  2) DecisionTree: بناء شجرة قرار وتقييم القواعد (JSON Logic / Formal / Pseudocode)
 *  3) applySpeOverride: القواعد الوطنية العليا تُلغي المحلية المتعارضة
 *  4) applyRoyalFilter: فلتر 11438 — لا تسجيل لمخالفة غير جسيمة بلا إنذار مسبق + 3 أيام عمل
 *  5) التسبيب النظامي يُبنى ويُشفَّر في كتلة C9 التالية
 */

import { RuleNormalizer } from './normalizer';
import { DecisionTree, EvaluationContext, DecisionResult } from './decision-tree';
import { applySpeOverride, buildSovereignReasoning, SpeOverrideResult } from './spe';
import {
  applyRoyalFilter,
  filterViolationRegistration,
  countWorkdays,
  RoyalFilterInput,
  RoyalFilterVerdict,
} from './royal-filter';
import { NormalizedRuleSet } from './types';
import { parseIfThenElse, safeApply } from './pseudocode';
import jsonLogic from 'json-logic-js';

export interface EngineVerdict {
  ruleId: string;
  severity: 'severe' | 'moderate' | 'minor';
  confidence: number;
  /** التسبيب النظامي — يُشفَّر في C9 */
  sovereignReasoning: string;
  /** الفلتر الملكي 11438 */
  royalFilter: RoyalFilterVerdict;
  /** هل يجوز تسجيل المخالفة */
  registerAllowed: boolean;
}

export class SovereignRuleEngine {
  private readonly normalizer = new RuleNormalizer();
  private tree: DecisionTree | null = null;
  private lastSpe: SpeOverrideResult | null = null;

  /** تحميل مستند قواعد (أي مخطط) وبناء شجرة القرار */
  load(doc: unknown): NormalizedRuleSet {
    const normalized = this.normalizer.normalize(doc as Record<string, unknown>);
    this.tree = new DecisionTree(normalized);
    this.lastSpe = null;
    return normalized;
  }

  get isLoaded(): boolean {
    return this.tree !== null;
  }

  get stats() {
    return this.tree?.stats ?? { totalRules: 0, executable: 0, descriptive: 0, sources: [] };
  }

  /** تقييم كل القواعد على سياق، مع تطبيق التجاوز السيادي */
  evaluateAll(ctx: EvaluationContext): { results: DecisionResult[]; spe: SpeOverrideResult | null } {
    if (!this.tree) return { results: [], spe: null };
    const all = this.tree.evaluateAll(ctx);
    // إعادة البناء بترتيب SPE (الأولوية للوطنية) على القواعد المطبّعة
    const spe = applySpeOverride(this.tree['root'] as never, ctx);
    this.lastSpe = spe;
    return { results: all, spe };
  }

  /**
   * الحكم الشامل على مخالفة — يدمج تقييم القاعدة + SPE + الفلتر الملكي 11438.
   * الناتج جاهز للختم في كتلة C9.
   */
  adjudicate(ctx: EvaluationContext, royalInput: RoyalFilterInput): EngineVerdict {
    const { results, spe } = this.evaluateAll(ctx);

    const matched = results.find((r) => r.ruleId === royalInput.ruleId) ?? results[0];
    const severity = matched?.severity ?? royalInput.severity;

    const royal = applyRoyalFilter({ ...royalInput, severity });
    const reasoning = buildSovereignReasoning(
      results.filter((r) => r.ruleId === royalInput.ruleId || !matched),
      spe ?? { finalRules: [], conflicts: [], decisions: [] },
    );

    // الثقة: تبدأ من 0.9 لقواعد محددة، وتنخفض للقواعد الوصفية
    let confidence = 0.9;
    if (matched && !matched.outputs) confidence = 0.7;

    return {
      ruleId: royalInput.ruleId,
      severity,
      confidence,
      sovereignReasoning: reasoning,
      royalFilter: royal,
      registerAllowed: royal.allowed,
    };
  }
}

export {
  RuleNormalizer,
  DecisionTree,
  applySpeOverride,
  buildSovereignReasoning,
  applyRoyalFilter,
  filterViolationRegistration,
  countWorkdays,
  parseIfThenElse,
  safeApply,
  jsonLogic,
};

export type { EvaluationContext } from './decision-tree';

export * from './types';
export * from './pseudocode';
export * from './spe';
export * from './royal-filter';
