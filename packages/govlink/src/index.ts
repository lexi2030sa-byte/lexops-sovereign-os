/**
 * GovLink — بوابة الربط الحكومي السيادية
 *
 * قرار المؤسس: تُبنى الواجهات والـ Adapters برمجياً الآن، وتُفعَّل فعلياً
 * بعد الحصول على الموافقات الرسمية (شهادات mTLS / منافذ قوى / API حكومية).
 *
 * المنافذ المستهدفة (موثقة في الملاحق الفنية):
 *  - قوى Qiwa (عقود + توطين)
 *  - مكتب العمل MOL (رخص + مخالفات)
 *  - بلدي (رخص + ISIC)
 *  - التأمينات GOSI (اشتراكات)
 *  - زكاة وضريبة ZATCA (فوترة Phase 2)
 *  - سداد SADAD (مدفوعات)
 *  - إيفاء IVAA (المنصة الوطنية للمخالفات — شرط الاعتداد)
 */

/** حالة تفعيل المنفذ الحكومي */
export type GovChannelStatus = 'inactive' | 'provisioning' | 'active';

export interface GovChannel {
  /** قوى | mol | balady | gosi | zatca | sadad | ivaa */
  id: GovChannelId;
  status: GovChannelStatus;
  /** آلية الربط المتوقعة (mTLS | API توثيقة | واجهة ويب) */
  authModel: string;
}

export type GovChannelId =
  | 'qiwa'
  | 'mol'
  | 'balady'
  | 'gosi'
  | 'wps'
  | 'zatca'
  | 'sadad'
  | 'ivaa';

/** عقد الطلب الموحد لأي منفذ حكومي */
export interface GovRequest<T = unknown> {
  channelId: GovChannelId;
  entityId: string;
  payload: T;
  actorId: string;
  requestId: string;
}

export interface GovResponse<T = unknown> {
  channelId: GovChannelId;
  ok: boolean;
  /** سبب الفشل عند عدم التفعيل */
  reason?: 'channel_inactive' | 'auth_pending' | 'remote_error';
  data?: T;
}

/** الواجهة التي يلتزم بها كل Adapter حكومي */
export interface GovAdapter<TReq = unknown, TRes = unknown> {
  readonly channelId: GovChannelId;
  readonly status: GovChannelStatus;
  /** وصف آلية الربط (mTLS / API / واجهة ويب) */
  readonly authModelLabel: string;
  /** تنفيذ الطلب — يرفض صراحةً عند عدم تفعيل المنفذ */
  execute(req: GovRequest<TReq>): Promise<GovResponse<TRes>>;
}

/**
 * سجل المنافذ الحكومية — تُسجَّل فيه كل قناة بحالتها.
 * البوابة لا تعتمد أي قناة غير مفعّلة (Fail-Closed).
 */
export class GovLink {
  private readonly channels = new Map<GovChannelId, GovAdapter>();

  register(adapter: GovAdapter): void {
    this.channels.set(adapter.channelId, adapter);
  }

  async call<TReq, TRes>(req: GovRequest<TReq>): Promise<GovResponse<TRes>> {
    const adapter = this.channels.get(req.channelId);
    if (!adapter || adapter.status === 'inactive') {
      return {
        channelId: req.channelId,
        ok: false,
        reason: 'channel_inactive',
      };
    }
    return adapter.execute(req) as Promise<GovResponse<TRes>>;
  }

  status(): GovChannel[] {
    return [...this.channels.values()].map((a) => ({
      id: a.channelId,
      status: a.status,
      authModel: a.authModelLabel,
    }));
  }
}

export * from './adapters';
