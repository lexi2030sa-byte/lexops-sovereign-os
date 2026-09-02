/**
 * مخزن HILAP عبر Firestore — FirestoreHilapStore
 *
 * يطبق HilapStore على مجموعة objections داخل المستأجر:
 *   tenants/{tenantId}/objections/{hilapId}
 */

import { HilapStore, HilapCase } from '@lexops/hilap';
import type { Firestore } from 'firebase-admin/firestore';
import { tenantGroupPath } from './collections';

export class FirestoreHilapStore implements HilapStore {
  constructor(
    private readonly db: Firestore,
    private readonly tenantId: string,
  ) {}

  async save(case_: HilapCase): Promise<void> {
    await this.db.doc(`${tenantGroupPath(this.tenantId, 'objections')}/${case_.id}`).set(case_);
  }

  async get(caseId: string): Promise<HilapCase | null> {
    const snap = await this.db
      .doc(`${tenantGroupPath(this.tenantId, 'objections')}/${caseId}`)
      .get();
    return snap.exists ? (snap.data() as HilapCase) : null;
  }
}
