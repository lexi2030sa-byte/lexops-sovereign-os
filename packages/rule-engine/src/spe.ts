/**
 * محرك السياسات السيادية — Sovereign Policy Engine (SPE)
 *
 * المرجع: USDS-02 + وثائق SPE/SOCF + الأمر العملياتي (التوجيه 2).
 *
 * القاعدة الحاكمة: القاعدة الوطنية العليا تُلغي أي قاعدة محلية متعارضة داخل المنشأة.
 * (مثال: نسبة توطين وطنية تعلو على قرار داخلية في المنشأة؛ عقوبة وطنية تلغي حسمية محلية).
 */

import { CanonicalRule, DecisionResult, RulePriority } from './types';
import { EvaluationContext } from './decision-tree';

export interface SpeConflict {
  nationalRuleId: string;
  localRuleId: string;
  nationalReason: string;
}

export interface SpeOverrideResult {
  /** القواعد المعتمدة بعد تطبيق التجاوز السيادي */
  finalRules: CanonicalRule[];
  /** النزاعات المكتشفة والمحسومة */
  conflicts: SpeConflict[];
  /** مسار اتخاذ القرار (يُشفَّر في C9) */
  decisions: string[];
}

/** وصفة كشف التعارض: قاعدتان من نفس الفئة تتناقضان في المخرج */
function sameCategoryNationalOverrides(local: CanonicalRule, national: CanonicalRule): boolean {
  return local.category === national.category;
}

/**
 * تطبيق التجاوز السيادي: القواعد الوطنية العليا تُلغي القواعد المحلية المتعارضة.
 * الناتج النهائي خالٍ من القواعد المحلية المتضاربة مع أي قاعدة وطنية.
 */
export function applySpeOverride(
  rules: CanonicalRule[],
  ctx: EvaluationContext,
): SpeOverrideResult {
  const nationals = rules.filter((r) => r.priority === 'national');
  const locals = rules.filter((r) => r.priority === 'local');

  const conflicts: SpeConflict[] = [];
  const decisions: string[] = [];
  const survivingLocals: CanonicalRule[] = [];

  for (const local of locals) {
    const overriding = nationals.find((n) => sameCategoryNationalOverrides(local, n));
    if (overriding) {
      conflicts.push({
        nationalRuleId: overriding.ruleId,
        localRuleId: local.ruleId,
        nationalReason: `قاعدة وطنية (${overriding.ruleId}) تعلو على المحلية (${local.ruleId}) في الفئة ${local.category}`,
      });
      decisions.push(
        `SPE Override: أُلغيت القاعدة المحلية ${local.ruleId} لمصلحة الوطنية ${overriding.ruleId}`,
      );
    } else {
      survivingLocals.push(local);
    }
  }

  return {
    finalRules: [...nationals, ...survivingLocals],
    conflicts,
    decisions,
  };
}

/**
 * ربط التسبيب النظامي بنتيجة القرار — يُشفَّر لاحقاً في كتلة C9.
 * يرجع نصاً واحداً مترابطاً يشرح "لماذا اتُّخذ القرار".
 */
export function buildSovereignReasoning(
  results: DecisionResult[],
  spe: SpeOverrideResult,
): string {
  const parts: string[] = [];
  for (const d of spe.decisions) parts.push(d);
  for (const c of spe.conflicts) parts.push(c.nationalReason);
  for (const r of results) parts.push(...r.reasoning);
  return parts.join(' | ');
}

export type { RulePriority };
