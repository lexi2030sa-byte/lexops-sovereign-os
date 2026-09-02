/**
 * نماذج ZATCA — الفوترة الإلكترونية السيادية
 *
 * المرجع: لائحة الفوترة الإلكترونية (ZATCA) + وثيقة "لتحويل الأنظمة القانونية..."
 * + الحسم الحاكم: ختم ZATCA عبر (CSID / UBL 2.1 / QR-TLV).
 *
 * الحاكمات:
 *  - الفاتورة بلا ختم رقمي معتمد = مخالفة (رادار المخاطر يلتقطها)
 *  - هاش الفاتورة: SHA-256 على UBL الكنسي — يُربط بسلسلة C9 (تسلسل مماثل)
 *  - QR-TLV: ترميز معرفات الفاتورة الأربعة (بائع/ضريبة/تاريخ/إجمالي/ضريبة)
 */

/** بيانات اعتماد الفوترة (CSID) */
export interface ZatcaCsid {
  /** المعرّف الفريد للمنشأة الضريبية */
  vatId: string;
  /** رقم CSID الامتثال/الإنتاجي */
  csidNumber?: string;
  /** مفتاح توقيع الفاتورة (PEM) */
  signingKey?: string;
  /** شهادة X.509 (PEM) */
  certificate?: string;
  /** تاريخ انتهاء الشهادة */
  expiresAt?: string;
}

/** طرف (بائع/مشترٍ) */
export interface InvoiceParty {
  name: string;
  /** الرقم الموحد/السجل التجاري */
  registrationId?: string;
  vatId?: string;
  street?: string;
  city?: string;
  country?: string;
}

/** سطر صنف في الفاتورة */
export interface InvoiceLine {
  id: string;
  name: string;
  quantity: number;
  /** سعر الوحدة شامل الضريبة (SAR) */
  unitPrice: number;
  /** نسبة ضريبة القيمة المضافة 15% افتراضياً */
  vatPercent: number;
}

/** فاتورة إلكترونية كاملة للختم */
export interface ZatcaInvoice {
  id: string;
  /** UUID للفاتورة */
  uuid: string;
  issuedAt: string;
  seller: InvoiceParty;
  buyer?: InvoiceParty;
  lines: InvoiceLine[];
  /** العملة (SAR) */
  currency?: string;
  /** رقم المرجع في C9 إن وُجد */
  c9BlockId?: number;
}

/** نتيجة الختم */
export interface ZatcaSealResult {
  invoiceId: string;
  /** هاش SHA-256 للـ UBL الكنسي */
  invoiceHash: string;
  /** محتوى QR-TLV (Base64) */
  qrBase64: string;
  /** وثيقة UBL 2.1 كاملة */
  ublXml: string;
  /** ختم HMAC-SHA256 مرتبط بسلسلة C9 */
  seal: string;
  timestamp: string;
}

/** حقل TLV حسب لائحة ZATCA */
export const QR_TLV_TAGS = {
  sellerName: 1,
  vatNumber: 2,
  invoiceTimestamp: 3,
  invoiceTotal: 4,
  vatTotal: 5,
} as const;
