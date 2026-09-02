/**
 * محولات المنافذ الحكومية — GovLink Adapters
 *
 * المرجع: الملاحق الفنية + وثيقة "لتحويل الأنظمة القانونية..." (GovLink)
 * + القرار الملكي 11438 (مهلة التصحيح 3 أيام عمل) + البروتوكول التشغيلي
 * (مهلة الاعتراض 60 يوماً).
 *
 * تُبنى الـ Adapters برمجياً الآن وتُفعَّل فعلياً عند الموافقة الرسمية
 * (mTLS / منافذ قوى / API حكومية). Fail-Closed: أي منفذ غير مفعّل يرفض.
 */

import { REGULATORY_DEADLINES } from '@lexops/shared';
import { GovAdapter, GovChannelId, GovChannelStatus, GovRequest, GovResponse } from './index';

/** Payload قوى Qiwa — عقد موثق إلكترونياً */
export interface QiwaPayload {
  contractId: string;
  employeeId: string;
  /** تاريخ التوثيق الإلكتروني عبر قوى */
  notarizedAt: string;
}

export interface QiwaResult {
  contractRef: string;
  notarized: boolean;
}

/** Payload بلدي — رخصة/نشاط */
export interface BaladyPayload {
  licenseId: string;
  activityCode?: string;
  isicCode?: string;
}

export interface BaladyResult {
  licenseStatus: 'valid' | 'expired' | 'suspended';
  expiresAt?: string;
}

/** Payload التأمينات GOSI — اشتراكات */
export interface GosiPayload {
  subscriptionId: string;
  period: string;
  contributionAmount: number;
}

export interface GosiResult {
  subscriptionRef: string;
  compliant: boolean;
}

/** Payload WPS — كشف رواتب */
export interface WpsPayload {
  payrollId: string;
  period: string;
  totalNet: number;
  /** نسبة الالتزام لآخر 3 أشهر (0-100) */
  compliancePercent: number;
}

export interface WpsResult {
  wpsRef: string;
  compliant: boolean;
  /** عتبة الحاكمة من الثوابت */
  requiredMinPercent: number;
}

/** Payload ZATCA — فاتورة مختومة */
export interface ZatcaPayload {
  invoiceId: string;
  invoiceHash: string;
  qrBase64: string;
}

export interface ZatcaResult {
  accepted: boolean;
  reportingRef?: string;
}

/** بروتوكول المدد السيادية الحاكم */
export const GOV_DEADLINES = {
  /** مهلة الاعتراض/التظلم — 60 يوماً */
  objectionWindowDays: REGULATORY_DEADLINES.objectionWindowDays,
  /** مهلة التصحيح للمخالفات غير الجسيمة — 3 أيام عمل (11438) */
  correctionGraceWorkDays: REGULATORY_DEADLINES.correctionGraceWorkDays,
  /** عتبة الالتزام بـ WPS */
  wpsMinPercent: REGULATORY_DEADLINES.wpsComplianceMinPercent,
} as const;

/**
 * مصنّع محول منفذ — يبني GovAdapter بحالة محددة.
 * عند عدم التفعيل يعيد رفضاً صريحاً (Fail-Closed) دون أي اتصال خارجي.
 */
export function createChannelAdapter<TReq, TRes>(
  channelId: GovChannelId,
  status: GovChannelStatus,
  authModel: string,
  executeImpl: (req: GovRequest<TReq>) => Promise<GovResponse<TRes>>,
): GovAdapter<TReq, TRes> {
  return {
    channelId,
    status,
    execute: async (req) => {
      if (status === 'inactive') {
        return { channelId, ok: false, reason: 'channel_inactive' };
      }
      if (status === 'provisioning') {
        return { channelId, ok: false, reason: 'auth_pending' };
      }
      return executeImpl(req);
    },
    get authModelLabel(): string {
      return authModel;
    },
  };
}

/** قوى Qiwa — توثيق عقد إلكترونياً */
export function createQiwaAdapter(status: GovChannelStatus): GovAdapter<QiwaPayload, QiwaResult> {
  return createChannelAdapter(
    'qiwa',
    status,
    'API موثق (شهادة mTLS)',
    async (req) => ({
      channelId: 'qiwa',
      ok: true,
      data: { contractRef: `QW-${req.payload.contractId}`, notarized: true },
    }),
  );
}

/** بلدي — استعلام حالة رخصة */
export function createBaladyAdapter(status: GovChannelStatus): GovAdapter<BaladyPayload, BaladyResult> {
  return createChannelAdapter(
    'balady',
    status,
    'API توثيقة',
    async (req) => ({
      channelId: 'balady',
      ok: true,
      data: { licenseStatus: 'valid' },
    }),
  );
}

/** التأمينات GOSI — اشتراكات */
export function createGosiAdapter(status: GovChannelStatus): GovAdapter<GosiPayload, GosiResult> {
  return createChannelAdapter(
    'gosi',
    status,
    'API توثيقة (اشتراكات)',
    async (req) => ({
      channelId: 'gosi',
      ok: true,
      data: { subscriptionRef: `GS-${req.payload.subscriptionId}`, compliant: true },
    }),
  );
}

/** WPS — كشف رواتب مع الالتزام بالعتبة */
export function createWpsAdapter(status: GovChannelStatus): GovAdapter<WpsPayload, WpsResult> {
  return createChannelAdapter(
    'wps',
    status,
    'API توثيقة (أجور)',
    async (req) => {
      const requiredMinPercent = GOV_DEADLINES.wpsMinPercent ?? REGULATORY_DEADLINES.wpsComplianceMinPercent;
      const compliant = req.payload.compliancePercent >= requiredMinPercent;
      return {
        channelId: 'wps',
        ok: true,
        data: { wpsRef: `WPS-${req.payload.payrollId}`, compliant, requiredMinPercent },
      };
    },
  );
}

/** ZATCA — إبلاغ فاتورة مختومة */
export function createZatcaAdapter(status: GovChannelStatus): GovAdapter<ZatcaPayload, ZatcaResult> {
  return createChannelAdapter(
    'zatca',
    status,
    'CSID/إبلاغ (Phase 2)',
    async (req) => ({
      channelId: 'zatca',
      ok: true,
      data: { accepted: true, reportingRef: `ZT-${req.payload.invoiceId}` },
    }),
  );
}
