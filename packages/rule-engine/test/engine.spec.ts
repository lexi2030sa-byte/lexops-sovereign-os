import { describe, expect, it } from 'vitest';
import {
  SovereignRuleEngine,
  applyRoyalFilter,
  countWorkdays,
  parseIfThenElse,
  filterViolationRegistration,
} from '../src/index';

/** المخطط الرسمي legal_logic_rules.json (من ملف محرك الربط المنطقي) */
const OFFICIAL_DOC = {
  metadata: {
    version: '1.0.0',
    jurisdiction: 'Saudi Arabia',
    source: ['نظام العمل السعودي 2026', 'القرار الملكي 11438'],
    last_updated: '2026-03-28',
  },
  rules: [
    {
      id: 'probation_period_90_days',
      name: 'حساب فترة التجربة 90 يوماً',
      category: 'employment_contract',
      inputs: { contract_start_date: 'date' },
      outputs: { probation_end_date: 'date' },
      logic: { operation: 'add_days', params: { base_date: '{{contract_start_date}}', days: 90 } },
    },
    {
      id: 'license_radar_30_days',
      name: 'تنبيه قبل انتهاء الرخصة بـ 30 يوماً',
      category: 'license_compliance',
      logic: {
        operation: 'compare_days',
        params: { from_date: '{{current_date}}', to_date: '{{license_expiry_date}}' },
        conditions: [
          { if: { less_or_equal: { left: '{{days_difference}}', right: 30 } }, then: { should_alert: true } },
          { else: { should_alert: false } },
        ],
      },
    },
    {
      id: 'max_probation_extension_rule',
      name: 'منع تجاوز الحد الأقصى لفترة التجربة',
      category: 'employment_contract',
      logic: {
        conditions: [
          { if: { less_or_equal: { left: '{{total_probation_days}}', right: 180 } }, then: { is_valid: true } },
          { else: { is_valid: false, violation_message: 'إجمالي فترة التجربة تجاوز الحد النظامي (180 يوماً).' } },
        ],
      },
    },
    {
      id: 'lexi_usage_quota_standard',
      name: 'كوتا LEXI – الباقة الأساسية',
      category: 'ai_quota',
      logic: {
        conditions: [
          {
            if: { and: [{ equals: { left: '{{plan_type}}', right: 'standard' } }, { less_than: { left: '{{daily_hits}}', right: 3 } }] },
            then: { allowed: true },
          },
          {
            if: { and: [{ equals: { left: '{{plan_type}}', right: 'standard' } }, { greater_or_equal: { left: '{{daily_hits}}', right: 3 } }] },
            then: { allowed: false, reason: 'تم استهلاك الحد اليومي.' },
          },
        ],
      },
    },
  ],
};

/** مخطط البلدية — قواعد منطقية نصية (if/then) */
const MUNICIPALITY_DOC = {
  file_id: '66a81fca-a286-4ba1-978c-0ab92ec016bf',
  compliance_rules: [
    {
      rule_id: 'PEN-001',
      source_article: '2',
      description: 'تحديد نوع الجزاء بناءً على نوع المخالفة',
      logic: "if violation_type == 'serious' then max_fine = 1000000 else max_fine = 500000",
    },
    {
      rule_id: 'PEN-003',
      source_article: '2',
      description: 'إلغاء الترخيص للمخالفات الجسيمة فقط',
      logic: "if violation_type == 'serious' AND repeat_count >= 4 then license_revocation = true",
    },
  ],
};

describe('SovereignRuleEngine — العقل السيادي', () => {
  it('يطبّع المخطط الرسمي ويبني شجرة القرار', () => {
    const engine = new SovereignRuleEngine();
    const set = engine.load(OFFICIAL_DOC);
    expect(set.stats.totalRules).toBe(4);
    expect(set.stats.executable).toBeGreaterThanOrEqual(4);
    expect(set.stats.sources).toContain('نظام العمل السعودي 2026');
  });

  it('يحسب نهاية فترة التجربة (90 يوم عمل)', () => {
    const engine = new SovereignRuleEngine();
    engine.load(OFFICIAL_DOC);
    const { results } = engine.evaluateAll({ data: { contract_start_date: '2026-01-01' } });
    const rule = results.find((r) => r.ruleId === 'probation_period_90_days');
    expect(rule?.outputs?.probation_end_date).toBeDefined();
    expect(rule?.reasoning.length).toBeGreaterThan(0);
  });

  it('يمنع تجاوز إجمالي فترة التجربة 180 يوماً', () => {
    const engine = new SovereignRuleEngine();
    engine.load(OFFICIAL_DOC);
    const { results } = engine.evaluateAll({ data: { total_probation_days: 200 } });
    const rule = results.find((r) => r.ruleId === 'max_probation_extension_rule');
    expect(rule?.outputs?.is_valid).toBe(false);
    expect(rule?.outputs?.violation_message).toContain('180');
  });

  it('كوتا LEXI: الباقة الأساسية تسمح بأقل من 3 استعلامات يومية', () => {
    const engine = new SovereignRuleEngine();
    engine.load(OFFICIAL_DOC);
    const { results } = engine.evaluateAll({ data: { plan_type: 'standard', daily_hits: 2 } });
    const rule = results.find((r) => r.ruleId === 'lexi_usage_quota_standard');
    expect(rule?.outputs?.allowed).toBe(true);
  });
});

describe('المخطط النصي للبلدية (if/then → JSON Logic)', () => {
  it('يحلل شرطاً نصياً بسيطاً', () => {
    const parsed = parseIfThenElse("if violation_type == 'serious' then max_fine = 1000000 else max_fine = 500000");
    expect(parsed).not.toBeNull();
    expect(parsed?.thenAssignments.max_fine).toBe(1000000);
    expect(parsed?.elseAssignments?.max_fine).toBe(500000);
  });

  it('يدعم شرط AND مزدوج', () => {
    const parsed = parseIfThenElse("if violation_type == 'serious' AND repeat_count >= 4 then license_revocation = true");
    expect(parsed).not.toBeNull();
    expect(parsed?.condition).toHaveProperty('and');
  });

  it('ينفّذ قاعدة بلدية نصية على سياق بيانات', () => {
    const engine = new SovereignRuleEngine();
    engine.load(MUNICIPALITY_DOC);
    const { results } = engine.evaluateAll({ data: { violation_type: 'serious' } });
    const pen1 = results.find((r) => r.ruleId === 'PEN-001');
    expect(pen1?.outputs?.max_fine).toBe(1000000);
  });
});

describe('الفلتر الملكي 11438', () => {
  const base = {
    ruleId: 'R-LABOR-007',
    severity: 'minor' as const,
    entityId: '700-1000001234',
    now: '2026-05-10',
  };

  it('يرفض المخالفة غير الجسيمة دون إنذار مسبق', () => {
    const v = applyRoyalFilter({ ...base, history: [] });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe('no_prior_warning');
  });

  it('يرفضها إذا لم تنقض مهلة الـ 3 أيام عمل', () => {
    const v = applyRoyalFilter({
      ...base,
      history: [{ eventType: 'early_warning', ruleId: 'R-LABOR-007', occurredAt: '2026-05-08' }],
    });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe('grace_period_not_elapsed');
  });

  it('يمررها بعد مرور 3 أيام عمل من الإنذار', () => {
    // 2026-05-08 هو الجمعة → أيام العمل تبدأ الاثنين 11/05
    const v = applyRoyalFilter({
      ...base,
      now: '2026-05-12',
      history: [{ eventType: 'early_warning', ruleId: 'R-LABOR-007', occurredAt: '2026-05-07' }],
    });
    expect(v.allowed).toBe(true);
  });

  it('المخالفة الجسيمة تمر فوراً', () => {
    const v = applyRoyalFilter({ ...base, severity: 'severe', history: [] });
    expect(v.allowed).toBe(true);
  });

  it('يحسب أيام العمل باستبعاد الجمعة/السبت', () => {
    // من الثلاثاء 05/05 إلى الاثنين 11/05: 4 أيام عمل (الأربعاء، الخميس، الأحد، الاثنين)
    expect(countWorkdays('2026-05-05', '2026-05-11')).toBe(4);
  });

  it('filterViolationRegistration يعطي رسالة تسبيب واضحة', () => {
    const r = filterViolationRegistration({ ...base, history: [] });
    expect(r.register).toBe(false);
    expect(r.message).toContain('11438');
  });
});
