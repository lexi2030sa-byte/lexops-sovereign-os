import { describe, expect, it } from 'vitest';
import { SpeService } from '../src/spe/spe.service';
import { SpeController } from '../src/spe/spe.controller';
import type { PayrollInput, SPEPolicy } from '@lexops/spe';

const INPUT: PayrollInput = {
  employeeId: 'u-1',
  entityId: '700-1000001234',
  period: '2026-07',
  baseSalary: 5000,
  allowances: 1000,
  deductions: [{ reason: 'absence', amount: 200, legal: true }],
  workedDays: 22,
  totalDays: 22,
  paidViaWps: true,
  wpsCompliancePercent: 85,
};

function makeReq() {
  return { scopeGuard: { entityId: '700-1000001234', userId: 'payroll-1', role: 'payroll_officer' } };
}

describe('SPE Controller — الرواتب السيادية', () => {
  it('يحسب صافي راتب عبر HTTP', () => {
    const ctrl = new SpeController(new SpeService());
    const res = ctrl.calculate(INPUT, makeReq() as never);
    expect(res.success).toBe(true);
    const data = res.data as { netSalary: number; wpsCompliant: boolean };
    expect(data.netSalary).toBe(5800);
    expect(data.wpsCompliant).toBe(true);
  });

  it('يرفض الطلب بلا entityId', () => {
    const ctrl = new SpeController(new SpeService());
    expect(() =>
      ctrl.calculate(INPUT, { scopeGuard: { userId: 'x', role: 'payroll_officer' } } as never),
    ).toThrow('X-Entity-Id');
  });

  it('يقفل الشهري ويسجل كتلة C9', async () => {
    const ctrl = new SpeController(new SpeService());
    const res = await ctrl.close(
      { period: '2026-07', results: [INPUT] },
      makeReq() as never,
    );
    expect(res.success).toBe(true);
    const data = res.data as { c9BlockId: number; zatcaFingerprint: string };
    expect(data.c9BlockId).toBe(1);
    expect(data.zatcaFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('يقيّم سياسة عبر /spe/evaluate (JSON Logic)', () => {
    const ctrl = new SpeController(new SpeService());
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
    const res = ctrl.evaluate(
      { policy, context: { entityId: '700-1000001234', data: { worked_days: 10 } } },
      makeReq() as never,
    );
    expect(res.success).toBe(true);
    const results = res.data as Array<{ ruleId: string; verdict: string }>;
    expect(results[0].ruleId).toBe('attendance-80');
    expect(results[0].verdict).toBe('compliant');
  });

  it('يرفض /spe/evaluate بلا policy.rules', () => {
    const ctrl = new SpeController(new SpeService());
    expect(() =>
      ctrl.evaluate({ policy: { id: 'p', rules: [] }, context: {} as never }, makeReq() as never),
    ).toThrow('policy.rules مطلوبة');
  });
});
