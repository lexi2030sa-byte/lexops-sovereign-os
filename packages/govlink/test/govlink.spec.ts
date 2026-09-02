import { describe, expect, it } from 'vitest';
import {
  GovLink,
  createQiwaAdapter,
  createBaladyAdapter,
  createGosiAdapter,
  createWpsAdapter,
  createZatcaAdapter,
  GOV_DEADLINES,
} from '../src/index';
import type { GovRequest } from '../src/index';

const ENTITY = '700-1000001234';

function req<T>(channelId: string, payload: T): GovRequest<T> {
  return {
    channelId: channelId as never,
    entityId: ENTITY,
    payload,
    actorId: 'gov-actor',
    requestId: `req-${Date.now()}`,
  };
}

describe('GovLink — بوابة الربط الحكومي (PH-N5)', () => {
  it('يمنع أي منفذ غير مفعّل (Fail-Closed)', async () => {
    const gov = new GovLink();
    gov.register(createQiwaAdapter('inactive'));
    gov.register(createBaladyAdapter('inactive'));

    const res = await gov.call(req('qiwa', { contractId: 'C1', employeeId: 'u1', notarizedAt: '2026-07-01' }));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('channel_inactive');
  });

  it('يرفض المنفذ قيد التجهيز (auth_pending)', async () => {
    const gov = new GovLink();
    gov.register(createZatcaAdapter('provisioning'));
    const res = await gov.call(
      req('zatca', { invoiceId: 'INV-1', invoiceHash: 'h', qrBase64: 'q' }),
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('auth_pending');
  });

  it('يعرض حالة القنوات المسجلة مع نموذج الربط', () => {
    const gov = new GovLink();
    gov.register(createQiwaAdapter('active'));
    gov.register(createGosiAdapter('inactive'));
    const statuses = gov.status();
    expect(statuses).toHaveLength(2);
    expect(statuses.find((c) => c.id === 'qiwa')?.status).toBe('active');
    expect(statuses.find((c) => c.id === 'qiwa')?.authModel).toContain('mTLS');
  });

  it('قوى موثّقة تستجيب عند التفعيل', async () => {
    const gov = new GovLink();
    gov.register(createQiwaAdapter('active'));
    const res = await gov.call(req('qiwa', { contractId: 'C1', employeeId: 'u1', notarizedAt: '2026-07-01' }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data?.contractRef).toBe('QW-C1');
      expect(res.data?.notarized).toBe(true);
    }
  });

  it('WPS يرفض الرواتب دون عتبة الالتزام (80%)', async () => {
    const gov = new GovLink();
    gov.register(createWpsAdapter('active'));
    const res = await gov.call(
      req('wps', { payrollId: 'P1', period: '2026-07', totalNet: 100000, compliancePercent: 60 }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data?.compliant).toBe(false);
      expect(res.data?.requiredMinPercent).toBe(80);
    }
  });

  it('GOSI و ZATCA يستجيبان عند التفعيل', async () => {
    const gov = new GovLink();
    gov.register(createGosiAdapter('active'));
    gov.register(createZatcaAdapter('active'));

    const gosi = await gov.call(req('gosi', { subscriptionId: 'S1', period: '2026-07', contributionAmount: 1000 }));
    expect(gosi.ok).toBe(true);

    const zatca = await gov.call(req('zatca', { invoiceId: 'INV-1', invoiceHash: 'h', qrBase64: 'q' }));
    expect(zatca.ok).toBe(true);
    if (zatca.ok) expect(zatca.data?.reportingRef).toBe('ZT-INV-1');
  });

  it('المدد السيادية الحاكمة (اعتراض 60 يوماً + تصحيح 3 أيام + WPS 80%)', () => {
    expect(GOV_DEADLINES.objectionWindowDays).toBe(60);
    expect(GOV_DEADLINES.correctionGraceWorkDays).toBe(3);
    expect(GOV_DEADLINES.wpsMinPercent).toBe(80);
  });
});
