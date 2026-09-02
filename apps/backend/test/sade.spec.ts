import { describe, expect, it } from 'vitest';
import { SadeService } from '../src/sade/sade.service';
import { SadeController } from '../src/sade/sade.controller';

/** توكن تجريبي: userId.role.entityId */
const TOKEN_ADMIN = 'Bearer admin1.entity_admin.700-1000001234';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    headers: {
      authorization: TOKEN_ADMIN,
      'x-user-id': 'admin1',
      'x-request-id': 'req-sade-1',
      'x-entity-id': '700-1000001234',
      'x-sovereign-role': 'entity_admin',
    },
    scopeGuard: {
      entityId: '700-1000001234',
      userId: 'admin1',
      role: 'entity_admin',
      requestId: 'req-sade-1',
      verified: true,
    },
    ...overrides,
  };
}

describe('SADE Controller — زناد التوثيق الذاتي', () => {
  it('يولّد مستنداً مختوماً مرتبطاً بكتلة C9 عبر HTTP', async () => {
    const controller = new SadeController(new SadeService());
    const res = await controller.trigger(
      {
        event: 'VIOLATION_ADJUDICATED',
        ruleId: 'R-100',
        data: { entity_id: '700-1000001234' },
        severity: 'severe',
      },
      makeReq() as never,
    );

    expect(res.success).toBe(true);
    const doc = (res.data as {
      document: {
        id: string;
        type: string;
        status: string;
        hash: string;
        ledgerBlockId: number;
      };
    }).document;
    expect(doc.type).toBe('STEP_RECORD');
    expect(doc.status).toBe('LEDGER_RECORDED');
    expect(doc.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(doc.ledgerBlockId).toBe(1);
    expect((res.data as { ledgerOk: boolean }).ledgerOk).toBe(true);
  });

  it('يرفض الطلب بلا event أو ruleId', async () => {
    const controller = new SadeController(new SadeService());
    await expect(
      controller.trigger({} as never, makeReq() as never),
    ).rejects.toThrow('event و ruleId مطلوبان');
  });

  it('يرفض الطلب بلا رقم منشأة (X-Entity-Id)', async () => {
    const controller = new SadeController(new SadeService());
    const req = makeReq();
    delete (req.headers as Record<string, string>)['x-entity-id'];
    await expect(
      controller.trigger(
        { event: 'STEP_COMPLETED', ruleId: 'R-100', data: {} } as never,
        { scopeGuard: { userId: 'admin1', role: 'entity_admin' } } as never,
      ),
    ).rejects.toThrow('X-Entity-Id');
  });
});
