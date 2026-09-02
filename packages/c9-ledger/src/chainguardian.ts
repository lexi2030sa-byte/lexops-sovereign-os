/**
 * ChainGuardian — حارس سلسلة الحقيقة (PH-N4)
 *
 * المرجع: USDS-02 (سجل C9) + ملف PostgreSQL Triggers (c9_triggers.sql) + SOCF.
 *
 * يعكس منطق BEFORE INSERT في قاعدة البيانات على طبقة TypeScript:
 *  1) التحقق من ربط prevHash بذيل السلسلة الحالية (لا كسر/قفز)
 *  2) إعادة حساب block_hash من البناء الكنسي (SHA-256)
 *  3) إعادة حساب الختم HMAC-SHA256 ومطابقته
 * أي انحراف → رفض قبل الوصول إلى المخزن (دفاع متعدد الطبقات).
 */

import { createHmac, createHash } from 'crypto';
import { C9Block, C9Event } from './index';

export type ChainGuardianVerdict =
  | { ok: true; block: C9Block }
  | { ok: false; error: 'prev_hash_mismatch' | 'hash_mismatch' | 'seal_mismatch' | 'genesis_duplicate'; message: string };

/** البناء الكنسي للحدث — يجب أن يطابق canonicalize في C9Ledger */
export function canonicalizeEvent(event: C9Event): string {
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

/** محتوى الهاش — يطابق C9Ledger: `${blockIndex}|${canonical}|${prevHash}` */
export function canonicalBlockContent(
  blockIndex: number,
  event: C9Event,
  prevHash: string,
): string {
  return `${blockIndex}|${canonicalizeEvent(event)}|${prevHash}`;
}

/** حارس السلسلة — يتحقق قبل كل إلحاق */
export class ChainGuardian {
  constructor(private readonly hmacSecret: string) {}

  /** إعادة حساب هاش الكتلة — يطابق hashOf في C9Ledger */
  expectedHash(blockIndex: number, event: C9Event, prevHash: string): string {
    return createHash('sha256')
      .update(canonicalBlockContent(blockIndex, event, prevHash))
      .digest('hex');
  }

  /** إعادة حساب الختم — يطابق seal في C9Ledger: HMAC(`${hash}|${prevHash}`) */
  expectedSeal(hash: string, prevHash: string): string {
    return createHmac('sha256', this.hmacSecret)
      .update(`${hash}|${prevHash}`)
      .digest('hex');
  }

  /** التحقق من صحة كتلة جديدة قبل إلحاقها — يعكس Trigger PostgreSQL */
  guardAppend(
    newBlock: C9Block,
    latestBlock: C9Block | null,
  ): ChainGuardianVerdict {
    // Genesis
    if (newBlock.prevHash === 'genesis-lexops-700') {
      if (latestBlock) {
        return {
          ok: false,
          error: 'genesis_duplicate',
          message: 'Genesis مكرر — لا يجوز إعادة تهيئة السلسلة',
        };
      }
    } else {
      // الربط الحاكم: prevHash يجب أن يطابق ذيل السلسلة الحالية
      if (!latestBlock || latestBlock.hash !== newBlock.prevHash) {
        return {
          ok: false,
          error: 'prev_hash_mismatch',
          message: 'ChainGuardian: prevHash لا يطابق ذيل السلسلة (كسر محتمل)',
        };
      }
    }

    // إعادة حساب الهاش من البناء الكنسي
    const expectedHash = this.expectedHash(
      newBlock.blockIndex,
      newBlock.event,
      newBlock.prevHash,
    );
    if (newBlock.hash !== expectedHash) {
      return {
        ok: false,
        error: 'hash_mismatch',
        message: 'ChainGuardian: block_hash لا يطابق البناء الكنسي (تلاعب)',
      };
    }

    // إعادة حساب الختم HMAC-SHA256
    const expectedSeal = this.expectedSeal(expectedHash, newBlock.prevHash);
    if (newBlock.seal !== expectedSeal) {
      return {
        ok: false,
        error: 'seal_mismatch',
        message: 'ChainGuardian: الختم HMAC غير صحيح',
      };
    }

    return { ok: true, block: newBlock };
  }

  /** توقيع كتلة وفق نفس البناء الكنسي (تُستخدم عند الإنشاء) */
  seal(hash: string, prevHash: string): string {
    return this.expectedSeal(hash, prevHash);
  }
}
