import { describe, expect, it } from 'vitest';
import { ZatcaService } from '../src/zatca/zatca.service';
import { ZatcaController } from '../src/zatca/zatca.controller';
import type { ZatcaInvoice } from '@lexops/zatca';

const INVOICE: ZatcaInvoice = {
  id: 'INV-900',
  uuid: 'b1c2d3e4-0000-4e10-9f1b-abcdef123456',
  issuedAt: '2026-08-14T12:00:00Z',
  seller: { name: 'رائد التقنية', vatId: '310122393500003' },
  lines: [{ id: '1', name: 'خدمة', quantity: 1, unitPrice: 200, vatPercent: 15 }],
};

function makeReq() {
  return { scopeGuard: { entityId: '700-1000001234', userId: 'admin1', role: 'entity_admin' } };
}

describe('ZATCA Controller — ختم الفوترة', () => {
  it('يختم فاتورة ويعيد QR + هاش + ختم', () => {
    const ctrl = new ZatcaController(new ZatcaService());
    const res = ctrl.seal({ invoice: INVOICE }, makeReq() as never);
    expect(res.success).toBe(true);
    const data = res.data as {
      invoiceHash: string;
      qrBase64: string;
      seal: string;
      hasProductionCsid: boolean;
    };
    expect(data.invoiceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.qrBase64.length).toBeGreaterThan(0);
    expect(data.hasProductionCsid).toBe(false);
  });

  it('يرفض الفاتورة غير الصالحة', () => {
    const ctrl = new ZatcaController(new ZatcaService());
    expect(() => ctrl.seal({ invoice: { id: '', lines: [] } as never }, makeReq() as never)).toThrow(
      'invoice صالحة مطلوبة',
    );
  });
});
