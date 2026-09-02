/**
 * خدمة الاستمرارية في الخلفية — Persistence Service
 *
 * تهيّئ Firestore الحي عبر Service Account (VPC) عند توفر الاعتمادات،
 * وتبقي الحزمة في وضع التراجع (memory) بلا بيئة حية — لا يكسر التطوير.
 *
 * المرجع: PH-N1 (Firestore حي) + LEXOPS-T6-PERSIST-01.
 */

import { Injectable } from '@nestjs/common';
import { createLiveDb, createPersistence, PersistenceBundle, hasLiveCredentials } from '@lexops/persistence';

@Injectable()
export class PersistenceService {
  private bundle: PersistenceBundle | null = null;

  /** تهيئة الحزمة الحية — تُستدعى عند إقلاع التطبيق */
  async init(tenantId = 'sovereign-root'): Promise<PersistenceBundle> {
    if (!this.bundle) {
      const db = await createLiveDb();
      this.bundle = createPersistence(db, tenantId);
    }
    return this.bundle;
  }

  /** الحزمة الحالية — قد تكون null قبل init أو عند غياب الاعتمادات */
  get current(): PersistenceBundle | null {
    return this.bundle;
  }

  /** هل التشغيل حي (Firestore فعلي)؟ */
  get isLive(): boolean {
    return Boolean(this.bundle?.live);
  }

  /** هل الاعتمادات الحية متاحة في البيئة؟ */
  get credentialsAvailable(): boolean {
    return hasLiveCredentials();
  }
}
