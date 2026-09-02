/**
 * نخاع C9 — C9 Sovereign Ledger
 *
 * المرجع: وثيقة "لتحويل الأنظمة القانونية..." (فصل C9) + SOCF + المخططات المعمارية.
 *
 * المخطط الحاكم (قرار المؤسس): HMAC-SHA256 مع prevHash + C9_HMAC_SECRET في Secret Manager.
 * أي تعديل على كتلة يكسر الهاش/الختم ويطلق إنذار حصانة إجرائية.
 */

import { createHmac, createHash } from 'crypto';
import { SOVEREIGN_ERROR_CODES } from '@lexops/contracts';
export interface C9Event {
  entityId: string;
  actorId: string;
  /** نوع الحدث (attendance | violation | contract | objection | ...) */
  eventType: string;
  payload: Record<string, unknown>;
  timestamp: number;
  /** مرجع الملف (Evidence Vault / Cloud Storage) */
  evidenceRef?: string;
  /** التصنيف القانوني المرتبط (إن وجد) */
  legalCode?: string;
  /** الأثر المالي المقدر (إن وجد) */
  financialImpact?: number;
}

export interface C9Block {
  blockIndex: number;
  event: C9Event;
  prevHash: string;
  hash: string;
  /** ختم التوقيع HMAC-SHA256 */
  seal: string;
}

/** واجهة مخزن C9 — يوفرها Firestore/PostgreSQL من طبقة أعلى */
export interface C9Storage {
  getLatestBlock(entityId: string): Promise<C9Block | null>;
  appendBlock(block: C9Block): Promise<void>;
  getBlock(entityId: string, blockIndex: number): Promise<C9Block | null>;
}

/** يحدد ما إذا كانت الكتابة مسموحة (Append-Only) */
export type C9WriteResult =
  | { ok: true; block: C9Block }
  | { ok: false; error: 'immutable_record' | 'hash_mismatch'; code: string };

export class C9Ledger {
  constructor(
    private readonly storage: C9Storage,
    private readonly hmacSecret: string,
  ) {}

  private seal(content: string): string {
    return createHmac('sha256', this.hmacSecret).update(content).digest('hex');
  }

  private hashOf(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /** بناء كتلة جديدة مرقمة في سلسلة المنشأة */
  async appendEvent(event: C9Event): Promise<C9WriteResult> {
    const latest = await this.storage.getLatestBlock(event.entityId);
    const prevHash = latest ? latest.hash : 'genesis-lexops-700';
    const blockIndex = latest ? latest.blockIndex + 1 : 1;

    const canonical = this.canonicalize(event);
    const content = `${blockIndex}|${canonical}|${prevHash}`;
    const hash = this.hashOf(content);
    const seal = this.seal(`${hash}|${prevHash}`);

    const block: C9Block = { blockIndex, event, prevHash, hash, seal };
    await this.storage.appendBlock(block);
    return { ok: true, block };
  }

  /** التحقق من سلامة السلسلة — أي تغيير يكسر الهاش/الختم */
  async verifyChain(entityId: string, upToBlockIndex: number): Promise<boolean> {
    let prevHash = 'genesis-lexops-700';
    for (let i = 1; i <= upToBlockIndex; i++) {
      const block = await this.storage.getBlock(entityId, i);
      if (!block) return false;
      const expectedHash = this.hashOf(
        `${block.blockIndex}|${this.canonicalize(block.event)}|${block.prevHash}`,
      );
      if (block.hash !== expectedHash) return false;
      if (block.prevHash !== prevHash) return false;
      const expectedSeal = this.seal(`${block.hash}|${block.prevHash}`);
      if (block.seal !== expectedSeal) return false;
      prevHash = block.hash;
    }
    return true;
  }

  /**
   * نبض النظام (System Pulse) — Gate 2.
   * يفحص تكامل كافة الهاشات من الكتلة صفر (genesis) حتى الكتلة الحالية للمنظمة،
   * ثم يسجل نتيجة الفحص كحدث سيادي SYSTEM_PULSE_CHECK في C9.
   * أي انقطاع تشفيري = فشل النبض + تسجيل الحادثة.
   */
  async validateChain(orgId: string, actorId = 'system'): Promise<{
    orgId: string;
    valid: boolean;
    checkedBlocks: number;
    lastBlockIndex: number;
    pulseBlockIndex: number;
  }> {
    const latest = await this.storage.getLatestBlock(orgId);
    const lastBlockIndex = latest ? latest.blockIndex : 0;
    const checkedBlocks = lastBlockIndex;
    const valid = await this.verifyChain(orgId, lastBlockIndex);

    // تسجيل نتيجة الفحص كحدث سيادي في C9 — يوثق سلامة السلسلة حتى هذه اللحظة
    const write = await this.appendEvent({
      entityId: orgId,
      actorId,
      eventType: 'SYSTEM_PULSE_CHECK',
      payload: {
        valid,
        checkedBlocks,
        lastBlockIndex,
        checkedAt: new Date().toISOString(),
      },
      timestamp: Date.now(),
      legalCode: 'SOV_PULSE',
    });

    return {
      orgId,
      valid,
      checkedBlocks,
      lastBlockIndex,
      pulseBlockIndex: write.ok ? write.block.blockIndex : -1,
    };
  }

  private canonicalize(event: C9Event): string {
    return JSON.stringify({
      entityId: event.entityId,
      actorId: event.actorId,
      eventType: event.eventType,
      payload: event.payload,
      timestamp: event.timestamp,
      evidenceRef: event.evidenceRef ?? null,
      legalCode: event.legalCode ?? null,
      financialImpact: event.financialImpact ?? null,
    });
  }
}

/** خطأ الحصانة الإجرائية عند محاولة التعديل */
export function immutableRecordError(): { code: string; message: string; httpStatus: number } {
  return {
    code: 'SOV_950',
    message: 'Immutable Record — يحظر تعديل أو حذف سجلات C9',
    httpStatus: SOVEREIGN_ERROR_CODES.SOV_950,
  };
}

export * from './triggers';
export * from './chainguardian';

// طبقات الحصانة التنفيذية المرجعية (تُسحب في الإنتاج):
//  - Firestore Rules: packages/c9-ledger/firestore/c9.firestore.rules
//  - PostgreSQL Triggers: packages/c9-ledger/postgres/c9_triggers.sql
