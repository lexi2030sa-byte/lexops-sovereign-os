import { describe, expect, it } from 'vitest';
import {
  ZatcaSealer,
  invoiceTotals,
  buildQrPayload,
  buildUblXml,
  round2,
} from '../src/index';
import type { ZatcaInvoice } from '../src/index';

const CSID = { vatId: '310122393500003', signingKey: 'PEM-KEY', certificate: 'PEM-CERT' };

const INVOICE: ZatcaInvoice = {
  id: 'INV-001',
  uuid: 'a8f0f7b1-0000-4e10-9f1b-123456789abc',
  issuedAt: '2026-08-14T12:00:00Z',
  seller: { name: 'رائد التقنية', vatId: '310122393500003', registrationId: '1010111111' },
  buyer: { name: 'شركة النقل', vatId: '310122393500004' },
  lines: [
    { id: '1', name: 'خدمة استشارية', quantity: 2, unitPrice: 100, vatPercent: 15 },
    { id: '2', name: 'ترخيص', quantity: 1, unitPrice: 50, vatPercent: 15 },
  ],
};

describe('ZATCA Sealer — ختم الفوترة الإلكترونية', () => {
  it('يحسب الإجماليات بدقة (صافي/ضريبة/إجمالي)', () => {
    const totals = invoiceTotals(INVOICE);
    expect(totals.netTotal).toBe(250);
    expect(totals.vatTotal).toBe(37.5);
    expect(totals.grossTotal).toBe(287.5);
  });

  it('يبني QR-TLV Base64 قابلاً للفك وفق الوسوم الحاكمة', () => {
    const totals = invoiceTotals(INVOICE);
    const qr = buildQrPayload(INVOICE, totals);
    const decoded = Buffer.from(qr, 'base64');
    // 5 وسوم: كل وسم = 1 (tag) + 1 (len) + value
    expect(decoded.length).toBeGreaterThan(0);
    // تبدأ بالوسم 1 (اسم البائع)
    expect(decoded[0]).toBe(1);
  });

  it('يُنتج UBL 2.1 صالحاً يحتوي العناصر الحاكمة', () => {
    const totals = invoiceTotals(INVOICE);
    const xml = buildUblXml(INVOICE, totals);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<cbc:UUID>');
    expect(xml).toContain('<cbc:ID>INV-001</cbc:ID>');
    expect(xml).toContain('<cac:AccountingSupplierParty>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="SAR">287.50</cbc:PayableAmount>');
    expect(xml).toContain('<cac:TaxScheme><cbc:ID>VAT</cbc:ID>');
  });

  it('يختم الفاتورة: هاش SHA-256 + QR + ختم HMAC مرتبط بالسلسلة', () => {
    const sealer = new ZatcaSealer('test-zatca-secret', CSID);
    const result = sealer.seal(INVOICE, 'prev-block-hash');

    expect(result.invoiceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.qrBase64.length).toBeGreaterThan(0);
    expect(result.seal).toMatch(/^[a-f0-9]{64}$/);
    expect(result.ublXml).toContain('<Invoice');
    expect(result.invoiceId).toBe('INV-001');
  });

  it('التحقق يمر لفاتورة سليمة ويرفض الفاتورة المعدّلة', () => {
    const sealer = new ZatcaSealer('test-zatca-secret', CSID);
    const result = sealer.seal(INVOICE, 'prev-block-hash');

    expect(sealer.verify(INVOICE, result, 'prev-block-hash')).toBe(true);

    const tampered = { ...INVOICE, lines: [{ id: '1', name: 'خدمة مختلفة', quantity: 1, unitPrice: 999, vatPercent: 15 }] };
    expect(sealer.verify(tampered, result, 'prev-block-hash')).toBe(false);
  });

  it('يُنتج هاشاً مستقلاً عن ترتيب الدعوات (كانوني عبر UBL)', () => {
    const sealer = new ZatcaSealer('test-zatca-secret', CSID);
    const r1 = sealer.seal(INVOICE);
    const r2 = sealer.seal(INVOICE);
    // الهاش يعتمد على محتوى UBL الثابت
    expect(r1.invoiceHash).toBe(r2.invoiceHash);
  });

  it('يكشف توفر CSID الإنتاجي (توقيع X.509)', () => {
    const prod = new ZatcaSealer('s', CSID);
    expect(prod.hasProductionCsid).toBe(true);
    const dev = new ZatcaSealer('s', { vatId: 'x' });
    expect(dev.hasProductionCsid).toBe(false);
  });

  it('round2 يقرب بخانتين', () => {
    expect(round2(250.5)).toBe(250.5);
    expect(round2(1.23)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
  });
});
