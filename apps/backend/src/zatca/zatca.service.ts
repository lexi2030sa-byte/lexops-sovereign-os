/**
 * خدمة ZATCA في الخلفية — ZATCA Backend Service
 *
 * توفر ZatcaSealer مع CSID قابلة للضبط عبر متغيرات البيئة.
 * مرجع: لائحة الفوترة الإلكترونية (ZATCA) + قرار المؤسس.
 *
 * ملاحظة سيادية: مفاتيح التوقيع عبر Secret Manager — لا hardcoding أبداً.
 */

import { Injectable } from '@nestjs/common';
import { ZatcaSealer } from '@lexops/zatca';

@Injectable()
export class ZatcaService {
  readonly sealer: ZatcaSealer;

  constructor() {
    const hmacSecret = process.env.C9_HMAC_SECRET ?? 'dev-insecure-fallback';
    const csid = {
      vatId: process.env.ZATCA_VAT_ID ?? '',
      signingKey: process.env.ZATCA_SIGNING_KEY,
      certificate: process.env.ZATCA_CERTIFICATE,
      expiresAt: process.env.ZATCA_CSID_EXPIRY,
    };
    this.sealer = new ZatcaSealer(hmacSecret, csid);
  }
}
