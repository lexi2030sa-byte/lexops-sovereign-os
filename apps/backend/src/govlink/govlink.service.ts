/**
 * خدمة GovLink في الخلفية — GovLink Backend Service
 *
 * تسجل المنافذ الخمسة المطلوبة (قوى/بلدي/GOSI/WPS/ZATCA) بحالة "غير مفعل"
 * (Fail-Closed) إلى حين الموافقات الرسمية. الحالة قابلة للترقية عبر إعدادات.
 */

import { Injectable } from '@nestjs/common';
import {
  GovLink,
  createQiwaAdapter,
  createBaladyAdapter,
  createGosiAdapter,
  createWpsAdapter,
  createZatcaAdapter,
  GOV_DEADLINES,
} from '@lexops/govlink';
import type { GovAdapter, GovChannelId, GovChannelStatus } from '@lexops/govlink';

@Injectable()
export class GovLinkService {
  readonly govlink: GovLink;

  constructor() {
    this.govlink = new GovLink();
    // حالة الانطلاق: غير مفعّل (لا اتصال حكومي دون موافقة رسمية)
    const defaultStatus: GovChannelStatus = 'inactive';
    const adapters: GovAdapter[] = [
      createQiwaAdapter(defaultStatus),
      createBaladyAdapter(defaultStatus),
      createGosiAdapter(defaultStatus),
      createWpsAdapter(defaultStatus),
      createZatcaAdapter(defaultStatus),
    ];
    for (const a of adapters) this.govlink.register(a);
  }

  /** حالة المنافذ الحالية */
  status() {
    return this.govlink.status();
  }

  /** المدد السيادية الحاكمة */
  deadlines() {
    return GOV_DEADLINES;
  }

  /** تنفيذ طلب على منفذ — Fail-Closed */
  call(req: { channelId: GovChannelId; entityId: string; payload: unknown; actorId: string; requestId: string }) {
    return this.govlink.call(req);
  }
}
