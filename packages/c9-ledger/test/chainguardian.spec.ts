import { describe, expect, it } from 'vitest';
import { C9Ledger, C9Storage, C9Block, ChainGuardian } from '../src/index';

class MemStorage implements C9Storage {
  private blocks: Map<string, C9Block[]> = new Map();

  async getLatestBlock(entityId: string): Promise<C9Block | null> {
    const arr = this.blocks.get(entityId) ?? [];
    return arr.length ? arr[arr.length - 1] : null;
  }

  async appendBlock(block: C9Block): Promise<void> {
    const arr = this.blocks.get(block.event.entityId) ?? [];
    arr.push(block);
    this.blocks.set(block.event.entityId, arr);
  }

  async getBlock(entityId: string, blockIndex: number): Promise<C9Block | null> {
    const arr = this.blocks.get(entityId) ?? [];
    return arr.find((b) => b.blockIndex === blockIndex) ?? null;
  }
}

const SECRET = 'test-secret-lexops';

function makeEvent() {
  return {
    entityId: '700-1000001234',
    actorId: 'DVJIbJSLEbS9n53exTYUdAz1CjH3',
    eventType: 'attendance',
    payload: { branchId: 'brn_001', status: 'inside' },
    timestamp: 1723000000000,
  };
}

describe('ChainGuardian — حارس سلسلة الحقيقة (PH-N4)', () => {
  it('يقبل كتلة سليمة مرتبطة بالذيل (prevHash صحيح)', async () => {
    const ledger = new C9Ledger(new MemStorage(), SECRET);
    const guardian = new ChainGuardian(SECRET);
    const r1 = await ledger.appendEvent(makeEvent());
    if (!r1.ok) return;
    const r2 = await ledger.appendEvent(makeEvent({ eventType: 'violation' }));
    if (!r2.ok) return;

    const latest = r2.block;
    const verdict = guardian.guardAppend(latest, r1.block);
    expect(verdict.ok).toBe(true);
  });

  it('يرفض كتلة prevHash لا يطابق ذيل السلسلة (كسر)', async () => {
    const guardian = new ChainGuardian(SECRET);
    const ledger = new C9Ledger(new MemStorage(), SECRET);
    const r1 = await ledger.appendEvent(makeEvent());
    if (!r1.ok) return;

    // كتلة وهمية بلا ربط حقيقي
    const fake = {
      ...r1.block,
      blockIndex: 2,
      prevHash: 'deadbeef',
    };
    const verdict = guardian.guardAppend(fake, r1.block);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error).toBe('prev_hash_mismatch');
  });

  it('يرفض كتلة تلاعُب فيها الهاش (hash_mismatch)', async () => {
    const guardian = new ChainGuardian(SECRET);
    const ledger = new C9Ledger(new MemStorage(), SECRET);
    const r1 = await ledger.appendEvent(makeEvent());
    if (!r1.ok) return;

    const tampered = {
      ...r1.block,
      hash: '0'.repeat(64),
    };
    const verdict = guardian.guardAppend(tampered, null);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error).toBe('hash_mismatch');
  });

  it('يرفض ختم HMAC غير صحيح (seal_mismatch)', async () => {
    const guardian = new ChainGuardian(SECRET);
    const ledger = new C9Ledger(new MemStorage(), SECRET);
    const r1 = await ledger.appendEvent(makeEvent());
    if (!r1.ok) return;

    const badSeal = { ...r1.block, seal: 'f'.repeat(64) };
    const verdict = guardian.guardAppend(badSeal, null);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error).toBe('seal_mismatch');
  });

  it('يرفض تكرار Genesis على سلسلة موجودة', async () => {
    const guardian = new ChainGuardian(SECRET);
    const ledger = new C9Ledger(new MemStorage(), SECRET);
    const r1 = await ledger.appendEvent(makeEvent());
    if (!r1.ok) return;

    const genesisDup = {
      ...r1.block,
      blockIndex: 2,
      prevHash: 'genesis-lexops-700',
    };
    const verdict = guardian.guardAppend(genesisDup, r1.block);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error).toBe('genesis_duplicate');
  });

  it('الحارس يطابق خوارزمية C9Ledger الفعلية (seal متطابق)', async () => {
    const guardian = new ChainGuardian(SECRET);
    const ledger = new C9Ledger(new MemStorage(), SECRET);
    const r1 = await ledger.appendEvent(makeEvent());
    if (!r1.ok) return;

    const reSeal = guardian.seal(r1.block.hash, r1.block.prevHash);
    expect(reSeal).toBe(r1.block.seal);
  });
});
