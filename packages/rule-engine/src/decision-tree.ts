/**
 * شجرة القرار والمقيّم — Decision Tree & Evaluator
 *
 * يبني شجرة قرار موحدة من القواعد المطبّعة، ثم يقيّم كل قاعدة وفق صيغتها:
 *  1) JSON Logic مباشرة (محرك json-logic-js)
 *  2) صيغة Formal: { operation, params, conditions }
 *  3) النص التوليفي: { parsed: { condition, thenAssignments, elseAssignments } }
 *  4) وصفية (بلا منطق): تُسجَّل كتوعية دون قرار
 */

import { DecisionResult, NormalizedRuleSet, CanonicalRule, RuleSeverity } from './types';
import {
  FormalLogic,
  ParsedPseudocode,
  addBusinessDays,
  applyFormalCondition,
  daysBetween,
  resolveRef,
  safeApply,
} from './pseudocode';

export interface EvaluationContext {
  data: Record<string, unknown>;
  /** سجل القرارات السابقة (لبناء التسبيب المركّب) */
  reasoning?: string[];
}

export class DecisionTree {
  private readonly root: CanonicalRule[];

  constructor(private readonly ruleSet: NormalizedRuleSet) {
    // ترتيب القواعد: الوطنية أولاً (SPE) ثم المحلية، ثم حسب القسمية
    this.root = [...ruleSet.rules].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === 'national' ? -1 : 1;
      return a.severity === 'severe' ? -1 : 1;
    });
  }

  /** تقييم قاعدة واحدة */
  evaluateRule(rule: CanonicalRule, ctx: EvaluationContext): DecisionResult | null {
    const reasons: string[] = [];
    const base = {
      ruleId: rule.ruleId,
      matched: false,
      severity: rule.severity,
      priority: rule.priority,
      reasoning: reasons,
      description: rule.descriptionAr,
    };

    if (!rule.logic) {
      reasons.push(`قاعدة وصفية (${rule.ruleId}): ${rule.descriptionAr ?? rule.name}`);
      return { ...base, matched: true, outputs: { descriptive: true } };
    }

    // الصيغة التوليفية (if/then/else)
    const parsed = (rule.logic as { parsed?: ParsedPseudocode }).parsed;
    if (parsed) {
      const condOk = Boolean(safeApply(parsed.condition, ctx.data));
      const outputs = condOk ? parsed.thenAssignments : parsed.elseAssignments ?? {};
      reasons.push(
        condOk
          ? `القاعدة ${rule.ruleId}: الشرط تحقق (${JSON.stringify(parsed.condition)})`
          : `القاعدة ${rule.ruleId}: الشرط لم يتحقق`,
      );
      return { ...base, matched: true, outputs };
    }

    // الصيغة الرسمية operation/conditions
    const formal = rule.logic as unknown as FormalLogic | undefined;
    if (formal?.operation || formal?.conditions) {
      const result = this.evaluateFormal(formal, ctx.data, reasons);
      return { ...base, matched: true, outputs: result };
    }

    // JSON Logic مباشرة
    const out = safeApply(rule.logic, ctx.data);
    reasons.push(`القاعدة ${rule.ruleId}: نُفّذت عبر JSON Logic → ${JSON.stringify(out)}`);
    return { ...base, matched: true, outputs: out as Record<string, unknown> | undefined };
  }

  /** تقييم الشجرة كاملة — يرجع جميع القواعد المطابقة */
  evaluateAll(ctx: EvaluationContext): DecisionResult[] {
    const results: DecisionResult[] = [];
    for (const rule of this.root) {
      const r = this.evaluateRule(rule, ctx);
      if (r) results.push(r);
    }
    return results;
  }

  /** تقييم الصيغة الرسمية */
  private evaluateFormal(
    formal: FormalLogic,
    data: Record<string, unknown>,
    reasons: string[],
  ): Record<string, unknown> | undefined {
    const outputs: Record<string, unknown> = {};

    if (formal.operation === 'add_days') {
      const base = resolveRef(formal.params?.base_date, data);
      const days = Number(formal.params?.days ?? 0);
      if (typeof base === 'string') {
        outputs.probation_end_date = addBusinessDays(base, days);
        reasons.push(`حُسبت ${outputs.probation_end_date} (${days} يوم عمل من ${base})`);
        return outputs;
      }
    }

    if (formal.operation === 'compare_days') {
      const from = resolveRef(formal.params?.from_date, data);
      const to = resolveRef(formal.params?.to_date, data);
      if (typeof from === 'string' && typeof to === 'string') {
        outputs.days_difference = daysBetween(from, to);
        reasons.push(`الفرق بين التواريخ: ${outputs.days_difference} يوم`);
        return outputs;
      }
    }

    // conditions: [{ if, then, else }] — يدعم فروع else-سقوط كبديل
    if (Array.isArray(formal.conditions)) {
      let matchedBranch = false;
      for (const branch of formal.conditions) {
        if (branch.if) {
          if (applyFormalCondition(branch.if, { ...data, ...outputs })) {
            Object.assign(outputs, this.resolveOutputValues(branch.then ?? {}, { ...data, ...outputs }));
            reasons.push(`تحققت إحدى الشروط → ${JSON.stringify(branch.then)}`);
            matchedBranch = true;
          } else if (branch.else) {
            Object.assign(outputs, this.resolveOutputValues(branch.else, { ...data, ...outputs }));
            reasons.push(`لم يتحقق شرط → طُبّق البديل ${JSON.stringify(branch.else)}`);
            matchedBranch = true;
          }
        } else if (branch.else && !matchedBranch) {
          // فرع else منفرد = سقوط افتراضي عند عدم تحقق أي شرط سابق
          Object.assign(outputs, this.resolveOutputValues(branch.else, { ...data, ...outputs }));
          reasons.push(`سقوط افتراضي → ${JSON.stringify(branch.else)}`);
          matchedBranch = true;
        }
      }
    }

    return Object.keys(outputs).length ? outputs : undefined;
  }

  /** تحويل مراجع {{var}} داخل قيم الإخراج */
  private resolveOutputValues(outputs: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(outputs)) {
      resolved[key] = resolveRef(value, data);
    }
    return resolved;
  }

  get stats() {
    return this.ruleSet.stats;
  }

  /** عدد القواعد الوطنية مقابل المحلية */
  countByPriority(): { national: number; local: number } {
    return this.ruleSet.rules.reduce(
      (acc, r) => {
        if (r.priority === 'national') acc.national += 1;
        else acc.local += 1;
        return acc;
      },
      { national: 0, local: 0 },
    );
  }
}

export type { RuleSeverity };
export { DecisionResult };
