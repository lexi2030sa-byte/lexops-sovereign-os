/**
 * محرك السياسات والرواتب السيادي — SPE Engine
 *
 * المرجع: SOCF v2 + القرار الملكي 11438 + WPS + نافذة التكرار 180 يوماً
 * + وثيقة "تطبيق الموظفين" (الرواتب).
 *
 * SPEEngine ينفّذ:
 *  1) applyJSONLogic: تقييم شرط عبر محرك json-logic-js
 *  2) applyWPSRule: الالتزام ≥ 80% لآخر 3 أشهر
 *  3) applyRepeatViolationRule: تكرار المخالفة خلال 180 يوماً
 *  4) applyRoyalDecreeRule: الفلتر الملكي 11438 (إنذار مسبق + 3 أيام عمل)
 *  5) evaluate: تجميع النتائج لكل قاعدة في السياسة
 *
 * ويضيف دوال الرواتب: computeNetSalary + إقفال شهري (بصمة ZATCA + C9).
 */

import { createHash, createHmac } from 'crypto';
import jsonLogic from 'json-logic-js';
import { C9Ledger, C9Event } from '@lexops/c9-ledger';
import { REGULATORY_DEADLINES } from '@lexops/shared';
import {
  PayrollCloseInput,
  PayrollCloseResult,
  PayrollInput,
  PayrollResult,
  SPEEngineInterface,
  SPEContext,
  SPEPolicy,
  SPEPolicyResult,
  SPEPolicyRule,
} from './types';

/** تقريب إلى خانتين */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** أيام العمل بين تاريخين (استبعاد الجمعة/السبت) */
export function countWorkdays(fromISO: string, toISO: string): number {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  let days = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getUTCDay();
    if (dow !== 5 && dow !== 6) days += 1; // الجمعة 5، السبت 6
  }
  return days;
}

/**
 * محرك SPE الكامل — ينفذ كل فئات القواعد السيادية.
 */
export class SPEEngine implements SPEEngineInterface {
  /** تقييم كل قواعد السياسة على السياق */
  evaluate(policy: SPEPolicy, ctx: SPEContext): SPEPolicyResult[] {
    return policy.rules.map((rule) => {
      const reasoning: string[] = [];
      let verdict: SPEPolicyResult['verdict'] = 'not_applicable';
      let outputs: Record<string, unknown> | undefined;

      switch (rule.category) {
        case 'json_logic': {
          const matched = this.applyJSONLogic(rule, ctx);
          if (matched) {
            verdict = 'compliant';
            outputs = rule.outputs;
            reasoning.push(`json_logic: شرط القاعدة ${rule.id} تحقق`);
          } else {
            verdict = 'violation';
            reasoning.push(`json_logic: شرط القاعدة ${rule.id} لم يتحقق`);
          }
          break;
        }
        case 'wps': {
          const matched = this.applyWPSRule(rule, ctx);
          if (matched) {
            verdict = 'compliant';
            reasoning.push('wps: الالتزام أعلى من العتبة');
          } else {
            verdict = 'violation';
            reasoning.push(`wps: الالتزام (${ctx.wpsCompliancePercent ?? 0}%) دون العتبة (${this.wpsMinPercent(rule)}%)`);
          }
          break;
        }
        case 'repeat_violation': {
          const repeated = this.applyRepeatViolationRule(rule, ctx);
          if (repeated) {
            verdict = 'violation';
            reasoning.push(`repeat_violation: تكرار مخالفة خلال ${this.repeatWindowDays(rule)} يوماً`);
          } else {
            verdict = 'compliant';
            reasoning.push('repeat_violation: لا تكرار خلال النافذة');
          }
          break;
        }
        case 'royal_11438': {
          const r = this.applyRoyalDecreeRule(rule, ctx);
          if (r.allowed) {
            verdict = 'compliant';
            reasoning.push('royal_11438: الفلتر الملكي مستوفى (إنذار مسبق + مهلة تصحيح)');
          } else {
            verdict = 'blocked';
            reasoning.push(`royal_11438: ${r.reason ?? 'التسجيل ممنوع بلا إنذار مسبق'}`);
          }
          break;
        }
        case 'socf': {
          const matched = this.applyJSONLogic(rule, ctx);
          if (matched) {
            verdict = 'compliant';
            outputs = rule.outputs;
            reasoning.push(`socf: قاعدة الامتثال التفاضلي ${rule.id} استوفيت`);
          } else {
            verdict = 'violation';
            reasoning.push(`socf: قاعدة الامتثال التفاضلي ${rule.id} لم تستوف`);
          }
          break;
        }
        default: {
          // general: قواعد عامة بلا منطق — تُقيَّم كمطابقة دائماً مع ملاحظة
          verdict = 'compliant';
          reasoning.push(`general: قاعدة ${rule.id} وصفية`);
          break;
        }
      }

      return { ruleId: rule.id, category: rule.category, matched: verdict !== 'violation' && verdict !== 'blocked', verdict, outputs, reasoning };
    });
  }

  /** تقييم JSON Logic عبر محرك json-logic-js */
  applyJSONLogic(rule: SPEPolicyRule, ctx: SPEContext): boolean {
    if (!rule.logic) return true;
    try {
      return jsonLogic.apply(rule.logic, ctx.data) === true;
    } catch {
      return false;
    }
  }

  /** قاعدة WPS — الالتزام ≥ عتبة لآخر 3 أشهر */
  applyWPSRule(rule: SPEPolicyRule, ctx: SPEContext): boolean {
    const compliance = ctx.wpsCompliancePercent ?? 0;
    return compliance >= this.wpsMinPercent(rule);
  }

  /** قاعدة التكرار — مخالفة متكررة خلال نافذة (180 يوماً) */
  applyRepeatViolationRule(rule: SPEPolicyRule, ctx: SPEContext): boolean {
    const windowDays = this.repeatWindowDays(rule);
    const now = ctx.now ?? new Date().toISOString();
    const history = ctx.history ?? [];
    const occurrences = history.filter((h) => {
      if (h.eventType !== 'violation') return false;
      if (h.ruleId && rule.id && h.ruleId !== rule.id) return false;
      const days = (new Date(now).getTime() - new Date(h.occurredAt).getTime()) / 86_400_000;
      return days >= 0 && days <= windowDays;
    });
    const max = rule.repeat?.maxOccurrences ?? 1;
    return occurrences.length > max;
  }

  /** الفلتر الملكي 11438 — لا تسجيل لمخالفة غير جسيمة بلا إنذار مسبق + 3 أيام عمل */
  applyRoyalDecreeRule(
    rule: SPEPolicyRule,
    ctx: SPEContext,
  ): { allowed: boolean; reason?: string } {
    // المخالفات الجسيمة لا تمر عبر الفلتر
    if (ctx.severity === 'severe') return { allowed: true };

    const grace = rule.royalDecree?.graceWorkDays ?? REGULATORY_DEADLINES.correctionGraceWorkDays;
    const now = ctx.now ?? new Date().toISOString();
    const history = ctx.history ?? [];

    const warning = history.find(
      (h) => h.eventType === 'early_warning' && (!h.ruleId || h.ruleId === rule.id),
    );
    if (!warning) return { allowed: false, reason: 'no_prior_warning' };

    const workdays = countWorkdays(warning.occurredAt, now);
    if (workdays < grace) {
      return { allowed: false, reason: `grace_period_not_elapsed:${workdays}/${grace}` };
    }
    return { allowed: true };
  }

  private wpsMinPercent(rule: SPEPolicyRule): number {
    return rule.wps?.minPercent ?? REGULATORY_DEADLINES.wpsComplianceMinPercent;
  }

  private repeatWindowDays(rule: SPEPolicyRule): number {
    return rule.repeat?.windowDays ?? REGULATORY_DEADLINES.recurrenceWindowWorkDays;
  }
}

/* ====================== دوال الرواتب ====================== */

/** حساب صافي راتب موظف */
export function computeNetSalary(input: PayrollInput): PayrollResult {
  const deductionsTotal = round2(input.deductions.reduce((acc, d) => acc + d.amount, 0));
  const netSalary = round2(input.baseSalary + input.allowances - deductionsTotal);
  const attendanceRatio = input.totalDays > 0 ? round2(input.workedDays / input.totalDays) : 0;
  const wpsCompliant =
    input.wpsCompliancePercent >= REGULATORY_DEADLINES.wpsComplianceMinPercent;

  return {
    employeeId: input.employeeId,
    period: input.period,
    baseSalary: round2(input.baseSalary),
    allowances: round2(input.allowances),
    deductionsTotal,
    netSalary: Math.max(0, netSalary),
    wpsCompliant,
    attendanceRatio,
    closed: false,
  };
}

/** بصمة ZATCA للرواتب — SHA-256 على كشف الإقفال الكنسي */
export function payrollZatcaFingerprint(
  entityId: string,
  period: string,
  results: PayrollResult[],
): string {
  const canonical = JSON.stringify({
    entityId,
    period,
    results: results.map((r) => ({
      employeeId: r.employeeId,
      netSalary: r.netSalary,
      wpsCompliant: r.wpsCompliant,
    })),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** محرك الرواتب — حساب + إقفال شهري مربوط بـ C9 */
export class SpeEngine {
  constructor(
    private readonly ledger: C9Ledger,
    private readonly hmacSecret: string,
  ) {}

  calculate(input: PayrollInput): PayrollResult {
    return computeNetSalary(input);
  }

  sealPayroll(entityId: string, period: string, results: PayrollResult[]): string {
    const fp = payrollZatcaFingerprint(entityId, period, results);
    return createHmac('sha256', this.hmacSecret)
      .update(`${fp}|${entityId}|${period}`)
      .digest('hex');
  }

  async close(input: PayrollCloseInput): Promise<PayrollCloseResult> {
    const totalNet = round2(input.results.reduce((acc, r) => acc + r.netSalary, 0));
    const fingerprint = payrollZatcaFingerprint(input.entityId, input.period, input.results);
    const seal = this.sealPayroll(input.entityId, input.period, input.results);

    const c9Event: C9Event = {
      entityId: input.entityId,
      actorId: 'spe-engine',
      eventType: 'PAYROLL_CLOSE',
      payload: { period: input.period, totalNet, resultsCount: input.results.length, fingerprint, seal },
      timestamp: Date.now(),
      legalCode: 'SPE_CLOSE',
    };
    const write = await this.ledger.appendEvent(c9Event);

    return {
      entityId: input.entityId,
      period: input.period,
      totalNet,
      resultsCount: input.results.length,
      zatcaFingerprint: fingerprint,
      c9BlockId: write.ok ? write.block.blockIndex : -1,
      closedAt: new Date().toISOString(),
    };
  }
}
