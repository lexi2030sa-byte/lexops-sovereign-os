/**
 * مخزن C9 عبر Firestore — FirestoreC9Storage
 *
 * يطبق C9Storage على مجموعة c9_ledger داخل المستأجر:
 *   tenants/{tenantId}/c9_ledger/{eventId}
 *
 * الحصانة: قواعد Firestore (append-only) تمنع UPDATE/DELETE — وطبقة الكود
 * لا تعرض سوى الإضافة والقراءة (لا تحديث ولا حذف إطلاقاً).
 */

import { C9Storage, C9Block } from '@lexops/c9-ledger';
import type { Firestore } from 'firebase-admin/firestore';
import { tenantDocPath, tenantGroupPath } from './collections';

export class FirestoreC9Storage implements C9Storage {
  constructor(
    private readonly db: Firestore,
    private readonly tenantId: string,
  ) {}

  private doc(eventId: string): FirebaseFirestore.DocumentReference {
    return this.db.doc(tenantDocPath(this.tenantId, 'c9Ledger', eventId));
  }

  async getLatestBlock(entityId: string): Promise<C9Block | null> {
    const col = this.db.collection(tenantGroupPath(this.tenantId, 'c9Ledger'));
    const snap = await col.orderBy('blockIndex', 'desc').limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as C9Block;
  }

  async appendBlock(block: C9Block): Promise<void> {
    await this.doc(String(block.blockIndex)).set(block);
  }

  async getBlock(entityId: string, blockIndex: number): Promise<C9Block | null> {
    const snap = await this.doc(String(blockIndex)).get();
    return snap.exists ? (snap.data() as C9Block) : null;
  }
}
