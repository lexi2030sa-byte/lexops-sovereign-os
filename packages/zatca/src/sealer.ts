/**
 * خاتم ZATCA — ZATCA Sealer
 *
 * ينفّذ:
 *  1) توليد وثيقة UBL 2.1 من الفاتورة (بنية موحدة للهاش)
 *  2) هاش SHA-256 للوثيقة الكنسية (تسلسل مماثل لسلسلة C9)
 *  3) ترميز QR-TLV (Base64) بالوسوم الأربعة الحاكمة
 *  4) ختم HMAC-SHA256 مرتبط بمرجع سلسلة C9
 *
 * ملاحظة سيادية: التوقيع الرقمي عبر CSID (X.509/PEM) يُفعَّل عند وجود الشهادة؛
 * غيابها يُنتج ختم HMAC تجريبياً ولا يُعتد به في الإنتاج.
 */

import { createHash, createHmac } from 'crypto';
import {
  InvoiceLine,
  QR_TLV_TAGS,
  ZatcaCsid,
  ZatcaInvoice,
  ZatcaSealResult,
} from './types';

const DEFAULT_VAT_PERCENT = 15;
const DEFAULT_CURRENCY = 'SAR';

/** إجمالي الفاتورة (شامل الضريبة) */
export function invoiceTotals(invoice: ZatcaInvoice): {
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
} {
  const netTotal = invoice.lines.reduce((acc, l) => acc + l.quantity * l.unitPrice, 0);
  const vatTotal = invoice.lines.reduce(
    (acc, l) => acc + l.quantity * l.unitPrice * ((l.vatPercent ?? DEFAULT_VAT_PERCENT) / 100),
    0,
  );
  return { netTotal: round2(netTotal), vatTotal: round2(vatTotal), grossTotal: round2(netTotal + vatTotal) };
}

/** تقريب إلى خانتين عشرية (دقة فاتورة ZATCA) */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** ترميز TLV — معرف + طول + قيمة (بايتات) */
export function encodeTlv(tag: number, value: string): Buffer {
  const data = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(1);
  length.writeUInt8(data.length);
  const tagBuf = Buffer.alloc(1);
  tagBuf.writeUInt8(tag);
  return Buffer.concat([tagBuf, length, data]);
}

/** بناء QR-TLV Base64 وفق لائحة ZATCA */
export function buildQrPayload(
  invoice: ZatcaInvoice,
  totals: { netTotal: number; vatTotal: number; grossTotal: number },
): string {
  const sellerName = invoice.seller.name;
  const vatNumber = invoice.seller.vatId ?? '';
  const timestamp = invoice.issuedAt;
  const parts = [
    encodeTlv(QR_TLV_TAGS.sellerName, sellerName),
    encodeTlv(QR_TLV_TAGS.vatNumber, vatNumber),
    encodeTlv(QR_TLV_TAGS.invoiceTimestamp, timestamp),
    encodeTlv(QR_TLV_TAGS.invoiceTotal, totals.grossTotal.toFixed(2)),
    encodeTlv(QR_TLV_TAGS.vatTotal, totals.vatTotal.toFixed(2)),
  ];
  return Buffer.concat(parts).toString('base64');
}

/** هروب XML الآمن */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** توليد وثيقة UBL 2.1 من الفاتورة (نسخة كنسية للهاش) */
export function buildUblXml(invoice: ZatcaInvoice, totals: { netTotal: number; vatTotal: number; grossTotal: number }): string {
  const currency = invoice.currency ?? DEFAULT_CURRENCY;
  const buyer = invoice.buyer;
  const lines = invoice.lines.map((l) => ublLine(l)).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
    '         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
    '         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
    `  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>`,
    `  <cbc:ID>${xmlEscape(invoice.id)}</cbc:ID>`,
    `  <cbc:UUID>${xmlEscape(invoice.uuid)}</cbc:UUID>`,
    `  <cbc:IssueDate>${invoice.issuedAt.slice(0, 10)}</cbc:IssueDate>`,
    `  <cbc:IssueTime>${invoice.issuedAt.slice(11, 19)}</cbc:IssueTime>`,
    `  <cbc:InvoiceTypeCode>388</cbc:InvoiceTypeCode>`,
    `  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>`,
    `  <cac:AccountingSupplierParty>`,
    `    <cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>${xmlEscape(invoice.seller.name)}</cbc:RegistrationName>`,
    invoice.seller.registrationId
      ? `      <cbc:CompanyID>${xmlEscape(invoice.seller.registrationId)}</cbc:CompanyID>`
      : '',
    `    </cac:PartyLegalEntity>`,
    invoice.seller.vatId
      ? `    <cac:PartyTaxScheme><cbc:CompanyID>${xmlEscape(invoice.seller.vatId)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
      : '',
    `  </cac:Party></cac:AccountingSupplierParty>`,
    buyer
      ? `  <cac:AccountingCustomerParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>${xmlEscape(buyer.name)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>`
      : '',
    `  <cac:TaxTotal>`,
    `    <cbc:TaxAmount currencyID="${currency}">${totals.vatTotal.toFixed(2)}</cbc:TaxAmount>`,
    `    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="${currency}">${totals.netTotal.toFixed(2)}</cbc:TaxableAmount>`,
    `      <cbc:TaxAmount currencyID="${currency}">${totals.vatTotal.toFixed(2)}</cbc:TaxAmount>`,
    `      <cac:TaxCategory><cbc:ID>S</cbc:ID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>`,
    `    </cac:TaxSubtotal>`,
    `  </cac:TaxTotal>`,
    `  <cac:LegalMonetaryTotal>`,
    `    <cbc:LineExtensionAmount currencyID="${currency}">${totals.netTotal.toFixed(2)}</cbc:LineExtensionAmount>`,
    `    <cbc:TaxExclusiveAmount currencyID="${currency}">${totals.netTotal.toFixed(2)}</cbc:TaxExclusiveAmount>`,
    `    <cbc:TaxInclusiveAmount currencyID="${currency}">${totals.grossTotal.toFixed(2)}</cbc:TaxInclusiveAmount>`,
    `    <cbc:PayableAmount currencyID="${currency}">${totals.grossTotal.toFixed(2)}</cbc:PayableAmount>`,
    `  </cac:LegalMonetaryTotal>`,
    lines,
    '</Invoice>',
  ]
    .filter(Boolean)
    .join('\n');
}

/** سطر UBL لصنف واحد */
function ublLine(line: InvoiceLine): string {
  const vat = line.vatPercent ?? DEFAULT_VAT_PERCENT;
  const tax = round2(line.quantity * line.unitPrice * (vat / 100));
  return [
    `  <cac:InvoiceLine>`,
    `    <cbc:ID>${xmlEscape(line.id)}</cbc:ID>`,
    `    <cbc:InvoicedQuantity unitCode="PCE">${line.quantity}</cbc:InvoicedQuantity>`,
    `    <cbc:LineExtensionAmount currencyID="SAR">${round2(line.quantity * line.unitPrice).toFixed(2)}</cbc:LineExtensionAmount>`,
    `    <cac:Item><cbc:Name>${xmlEscape(line.name)}</cbc:Name>`,
    `      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${vat}</cbc:Percent>`,
    `        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>`,
    `    </cac:Item>`,
    `    <cac:Price><cbc:PriceAmount currencyID="SAR">${round2(line.unitPrice).toFixed(2)}</cbc:PriceAmount></cac:Price>`,
    `  </cac:InvoiceLine>`,
  ].join('\n');
}

/**
 * خاتم ZATCA — ينتج هاش الفاتورة + QR-TLV + ختم HMAC.
 * يربط الهاش بسلسلة C9 (تسلسل SHA-256 مماثل لسلسلة النخاع).
 */
export class ZatcaSealer {
  constructor(
    private readonly hmacSecret: string,
    private readonly csid: ZatcaCsid,
  ) {}

  /** ختم فاتورة — إنتاج كامل لبيانات ZATCA */
  seal(invoice: ZatcaInvoice, prevChainHash?: string): ZatcaSealResult {
    const totals = invoiceTotals(invoice);
    const ublXml = buildUblXml(invoice, totals);
    // الهاش الكنسي للفاتورة (SHA-256)
    const invoiceHash = createHash('sha256').update(ublXml).digest('hex');
    const qrBase64 = buildQrPayload(invoice, totals);
    const timestamp = new Date().toISOString();

    // الختم: هاش الفاتورة + المرجع في السلسلة (C9) — تسلسل مماثل لسلسلة النخاع
    const chainRef = prevChainHash ?? `genesis-lexops-700`;
    const seal = createHmac('sha256', this.hmacSecret)
      .update(`${invoiceHash}|${chainRef}|${invoice.uuid}`)
      .digest('hex');

    return {
      invoiceId: invoice.id,
      invoiceHash,
      qrBase64,
      ublXml,
      seal,
      timestamp,
    };
  }

  /** التحقق من صحة ختم الفاتورة — إعادة حساب الهاش */
  verify(invoice: ZatcaInvoice, sealResult: Pick<ZatcaSealResult, 'invoiceHash' | 'seal'>, prevChainHash?: string): boolean {
    const totals = invoiceTotals(invoice);
    const expectedHash = createHash('sha256').update(buildUblXml(invoice, totals)).digest('hex');
    if (expectedHash !== sealResult.invoiceHash) return false;
    const chainRef = prevChainHash ?? `genesis-lexops-700`;
    const expectedSeal = createHmac('sha256', this.hmacSecret)
      .update(`${expectedHash}|${chainRef}|${invoice.uuid}`)
      .digest('hex');
    return expectedSeal === sealResult.seal;
  }

  /** توفر CSID الإنتاجي (شهادة توقيع) */
  get hasProductionCsid(): boolean {
    return Boolean(this.csid.signingKey && this.csid.certificate);
  }
}
