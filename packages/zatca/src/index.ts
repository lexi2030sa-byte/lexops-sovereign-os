/**
 * @lexops/zatca — ختم الفوترة الإلكترونية
 *
 * المرجع: لائحة ZATCA للفوترة الإلكترونية + قرار المؤسس (CSID/UBL 2.1/QR).
 *
 * المكوّنات:
 *  - ZatcaSealer: ختم الفاتورة (UBL 2.1 → SHA-256 → QR-TLV → HMAC مرتبط بـ C9)
 *  - invoiceTotals: حساب الإجماليات (الصافي/الضريبة/الإجمالي)
 *  - encodeTlv/buildQrPayload: ترميز QR-TLV وفق الوسوم الحاكمة
 */

export { ZatcaSealer, buildUblXml, invoiceTotals, buildQrPayload, encodeTlv, round2 } from './sealer';
export * from './types';
