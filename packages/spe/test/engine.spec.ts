import { describe, expect, it } from 'vitest';
import { C9Ledger, C9Storage, C9Block } from '@lexops/c9-ledger';
import {
  SPEEngine,
  SpeEngine,
  computeNetSalary,
  payrollZatcaFingerprint,
} from '../src/index';
import type { PayrollInput, SPEPolicy, SPEContext } from '../src/index';

class MemStorage implements C9Storage {
  private blocks: Map<string, C9Block[]> = new Map();

  async getLatestBlock(entityId: string): Promise<C9Block | null> {
    const arr = this.blocks.get(entityId) ?? [];
    return arr.length ? arr[arr.length - 1] : null;
  }

  async appendBlock(block: C9Block): Promise<void> {
    const arr = this.blocks.get(block.event.entityId) ?? [];
    arr.push(block);
    this.blocks.set(block.event.entityId, arr);
  }

  async getBlock(entityId: string, blockIndex: number): Promise<C9Block | null> {
    const arr = this.blocks.get(entityId) ?? [];
    return arr.find((b) => b.blockIndex === blockIndex) ?? null;
  }
}

const SECRET = 'test-spe-secret';
const ENTITY = '700-1000001234';

/** سياق تقييم أساسي */
function ctx(overrides: Partial<SPEContext> = {}): SPEContext {
  return {
    entityId: ENTITY,
    data: { worked_days: 20, total_days: 25 },
    history: [],
    now: '2026-07-31T00:00:00Z',
    wpsCompliancePercent: 85,
    ...overrides,
  };
}

describe('SPEEngine — JSON Logic', () => {
  it('يقيّم شرط JSON Logic صحيحاً', () => {
    const engine = new SPEEngine();
    const policy: SPEPolicy = {
      id: 'p-1',
      rules: [
        {
          id: 'attendance-80',
          category: 'json_logic',
          logic: { '<': [{ var: 'worked_days' }, 15] },
        },
      ],
    };
    const results = engine.evaluate(policy, ctx({ data: { worked_days: 10 } }));
    expect(results[0].matched).toBe(true);
    expect(results[0].verdict).toBe('compliant');
  });

  it('يقيّم شرط JSON Logic خاطئاً كمخالفة', () => {
    const engine = new SPEEngine();
    const policy: SPEPolicy = {
      id: 'p-1',
      rules: [
        {
          id: 'attendance-80',
          category: 'json_logic',
          logic: { '>=': [{ var: 'worked_days' }, 22] },
        },
      ],
    };
    const results = engine.evaluate(policy, ctx({ data: { worked_days: 10 } }));
    expect(results[0].verdict).toBe('violation');
  });
});

describe('SPEEngine — نافذة التكرار 180 يوماً', () => {
  it('يكشف تكرار المخالفة خلال 180 يوماً', () => {
    const engine = new SPEEngine();
    const policy: SPEPolicy = {
      id: 'p-repeat',
      rules: [
        {
          id: 'R-100',
          category: 'repeat_violation',
          repeat: { windowDays: 180, maxOccurrences: 1 },
        },
      ],
    };
    const results = engine.evaluate(
      policy,
      ctx({
        history: [
          { eventType: 'violation', ruleId: 'R-100', occurredAt: '2026-05-01T00:00:00Z' },
          { eventType: 'violation', ruleId: 'R-100', occurredAt: '2026-07-01T00:00:00Z' },
        ],
      }),
    );
    expect(results[0].verdict).toBe('violation');
    expect(results[0].reasoning[0]).toContain('180');
  });

  it('لا يعد التكرار خارج النافذة (تجاوز 180 يوماً)', () => {
    const engine = new SPEEngine();
    const policy: SPEPolicy = {
      id: 'p-repeat',
      rules: [{ id: 'R-100', category: 'repeat_violation' }],
    };
    const results = engine.evaluate(
      policy,
      ctx({
        history: [
          { eventType: 'violation', ruleId: 'R-100', occurredAt: '2025-01-01T00:00:00Z' },
          { eventType: 'violation', ruleId: 'R-100', occurredAt: '2025-02-01T00:00:00Z' },
        ],
      }),
    );
    expect(results[0].verdict).toBe('compliant');
  });
});

describe('SPEEngine — مهلة 3 أيام عمل (11438)', () => {
  it('يرفض التسجيل بلا إنذار مسبق (blocked)', () => {
    const engine = new SPEEngine();
    const policy: SPEPolicy = {
      id: 'p-11438',
      rules: [{ id: 'R-200', category: 'royal_11438' }],
    };
    const results = engine.evaluate(policy, ctx({ severity: 'minor', history: [] }));
    expect(results[0].verdict).toBe('blocked');
    expect(results[0].reasoning[0]).toContain('royal_11438');
  });

  it('يقبل التسجيل بعد انقضاء مهلة 3 أيام عمل من الإنذار', () => {
    const engine = new SPEEngine();
    const policy: SPEPolicy = {
      id: 'p-11438',
      rules: [{ id: 'R-200', category: 'royal_11438', royalDecree: { graceWorkDays: 3 } }],
    };
    // إنذار قبل 5 أيام تقويمية (أربعاء → إثنين) = 3+ أيام عمل
    const results = engine.evaluate(
      policy,
      ctx({
        severity: 'minor',
        now: '2026-07-27T00:00:00Z',
        history: [{ eventType: 'early_warning', ruleId: 'R-200', occurredAt: '2026-07-20T00:00:00Z' }],
      }),
    );
    expect(results[0].verdict).toBe('compliant');
  });

  it('المخالفة الجسيمة لا تمر عبر الفلتر (تسجيل مباشر)', () => {
    const engine = new SPEEngine();
    const policy: SPEPolicy = {
      id: 'p-11438',
      rules: [{ id: 'R-300', category: 'royal_11438' }],
    };
    const results = engine.evaluate(policy, ctx({ severity: 'severe', history: [] }));
    expect(results[0].verdict).toBe('compliant');
  });
});

describe('SPEEngine — WPS', () => {
  it('يمرر الالتزام ≥ 80%', () => {
    const engine = new SPEEngine();
    const policy: SPEPolicy = {
      id: 'p-wps',
      rules: [{ id: 'wps-80', category: 'wps' }],
    };
    const results = engine.evaluate(policy, ctx({ wpsCompliancePercent: 85 }));
    expect(results[0].verdict).toBe('compliant');
  });

  it('يرفض الالتزام دون 80% كمخالفة', () => {
    const engine = new SPEEngine();
    const policy: SPEPolicy = {
      id: 'p-wps',
      rules: [{ id: 'wps-80', category: 'wps' }],
    };
    const results = engine.evaluate(policy, ctx({ wpsCompliancePercent: 60 }));
    expect(results[0].verdict).toBe('violation');
  });
});

describe('SPEEngine — القرار الملكي + SOCF', () => {
  it('يعالج قاعدة socf عبر JSON Logic', () => {
    const engine = new SPEEngine();
    const policy: SPEPolicy = {
      id: 'p-socf',
      rules: [
        {
          id: 'socf-diff',
          category: 'socf',
          logic: { '==': [{ var: 'establishment_size' }, 'A'] },
          outputs: { fine_ceiling: 5000 },
        },
      ],
    };
    const results = engine.evaluate(policy, ctx({ data: { establishment_size: 'A' } }));
    expect(results[0].matched).toBe(true);
    expect(results[0].outputs).toEqual({ fine_ceiling: 5000 });
  });
});

/* ====================== دوال الرواتب ====================== */

function baseInput(overrides: Partial<PayrollInput> = {}): PayrollInput {
  return {
    employeeId: 'u-1',
    entityId: ENTITY,
    period: '2026-07',
    baseSalary: 5000,
    allowances: 1000,
    deductions: [],
    workedDays: 22,
    totalDays: 22,
    paidViaWps: true,
    wpsCompliancePercent: 85,
    ...overrides,
  };
}

describe('SPE Payroll — صافي الراتب والإقفال', () => {
  it('يحسب صافي الراتب: أساسي + بدلات − استقطاعات', () => {
    const r = computeNetSalary(
      baseInput({
        allowances: 1000,
        deductions: [
          { reason: 'absence', amount: 200, legal: true, linkedViolationId: 123 },
          { reason: 'insurance', amount: 100, legal: true },
        ],
      }),
    );
    expect(r.netSalary).toBe(5700);
    expect(r.deductionsTotal).toBe(300);
    expect(r.attendanceRatio).toBe(1);
  });

  it('يحسب نسبة الحضور', () => {
    const r = computeNetSalary(baseInput({ workedDays: 20, totalDays: 25 }));
    expect(r.attendanceRatio).toBe(0.8);
  });

  it('يصدر بصمة ZATCA مستقرة', () => {
    const r = computeNetSalary(baseInput());
    const fp1 = payrollZatcaFingerprint(ENTITY, '2026-07', [r]);
    const fp2 = payrollZatcaFingerprint(ENTITY, '2026-07', [r]);
    expect(fp1).toMatch(/^[a-f0-9]{64}$/);
    expect(fp1).toBe(fp2);
  });

  it('الإقفال الشهري يسجل كتلة C9', async () => {
    const ledger = new C9Ledger(new MemStorage(), SECRET);
    const engine = new SpeEngine(ledger, SECRET);
    const result = await engine.close({
      entityId: ENTITY,
      period: '2026-07',
      results: [computeNetSalary(baseInput())],
    });
    expect(result.c9BlockId).toBe(1);
    expect(result.totalNet).toBe(6000);
    expect(result.zatcaFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
