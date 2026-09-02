import { describe, expect, it } from 'vitest';
import { GovLinkService } from '../src/govlink/govlink.service';
import { GovLinkController } from '../src/govlink/govlink.controller';

function makeReq() {
  return { scopeGuard: { entityId: '700-1000001234', userId: 'admin1', role: 'entity_admin' } };
}

describe('GovLink Controller — البوابة الحكومية', () => {
  it('يعرض حالة المنافذ الخمسة غير المفعّلة + المدد', () => {
    const ctrl = new GovLinkController(new GovLinkService());
    const res = ctrl.status();
    const data = res.data as {
      channels: Array<{ id: string; status: string }>;
      deadlines: { objectionWindowDays: number; correctionGraceWorkDays: number; wpsMinPercent: number };
    };
    expect(data.channels).toHaveLength(5);
    expect(data.channels.every((c) => c.status === 'inactive')).toBe(true);
    expect(data.deadlines.objectionWindowDays).toBe(60);
    expect(data.deadlines.correctionGraceWorkDays).toBe(3);
    expect(data.deadlines.wpsMinPercent).toBe(80);
  });

  it('يرفض طلباً على منفذ غير مفعل (Fail-Closed)', async () => {
    const ctrl = new GovLinkController(new GovLinkService());
    const res = await ctrl.call(
      { channelId: 'qiwa', payload: { contractId: 'C1' } },
      makeReq() as never,
    );
    expect(res.success).toBe(false);
    const data = res.data as { ok: boolean; reason: string };
    expect(data.reason).toBe('channel_inactive');
  });

  it('يرفض بلا entityId', async () => {
    const ctrl = new GovLinkController(new GovLinkService());
    await expect(
      ctrl.call({ channelId: 'gosi', payload: {} }, { scopeGuard: { userId: 'x', role: 'admin' } } as never),
    ).rejects.toThrow('X-Entity-Id');
  });
});
