import { describe, expect, it } from 'vitest';
import { C9Ledger, C9Storage, C9Block } from '../src/index';

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

function makeEvent(overrides: Partial<Parameters<C9Ledger['appendEvent']>[0]> = {}) {
  return {
    entityId: '700-1000001234',
    actorId: 'DVJIbJSLEbS9n53exTYUdAz1CjH3',
    eventType: 'attendance',
    payload: { branchId: 'brn_001', status: 'inside' },
    timestamp: 1723000000000,
    ...overrides,
  };
}

describe('C9 Sovereign Ledger', () => {
  it('ينشئ كتلاً مرقمة ومترابطة بالهاشات', async () => {
    const ledger = new C9Ledger(new MemStorage(), SECRET);
    const r1 = await ledger.appendEvent(makeEvent());
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.block.blockIndex).toBe(1);
    expect(r1.block.prevHash).toBe('genesis-lexops-700');

    const r2 = await ledger.appendEvent(makeEvent({ eventType: 'violation' }));
    if (!r2.ok) return;
    expect(r2.block.blockIndex).toBe(2);
    expect(r2.block.prevHash).toBe(r1.block.hash);
    expect(r2.block.hash).not.toBe(r1.block.hash);
  });

  it('يكشف التلاعب في أي كتلة (كسر السلسلة)', async () => {
    const storage = new MemStorage();
    const ledger = new C9Ledger(storage, SECRET);
    await ledger.appendEvent(makeEvent());
    await ledger.appendEvent(makeEvent({ eventType: 'violation' }));
    const chain = storage as MemStorage;

    // تلاعب: تعديل payload الكتلة الأولى
    const arr = (storage as unknown as { blocks: Map<string, C9Block[]> }).blocks;
    const b1 = arr.get('700-1000001234')![0];
    b1.event.payload = { ...b1.event.payload, tampered: true };

    const ok = await ledger.verifyChain('700-1000001234', 2);
    expect(ok).toBe(false);
    void chain;
  });

  it('ختم HMAC مختلف عند تغيير المفتاح (لا يُقبل التزوير)', async () => {
    const storage = new MemStorage();
    const ledger1 = new C9Ledger(storage, SECRET);
    await ledger1.appendEvent(makeEvent());

    const ledger2 = new C9Ledger(storage, 'different-secret');
    const ok = await ledger2.verifyChain('700-1000001234', 1);
    expect(ok).toBe(false);
  });

  it('السلسلة سليمة عند عدم التلاعب', async () => {
    const storage = new MemStorage();
    const ledger = new C9Ledger(storage, SECRET);
    await ledger.appendEvent(makeEvent());
    await ledger.appendEvent(makeEvent({ eventType: 'violation' }));
    const ok = await ledger.verifyChain('700-1000001234', 2);
    expect(ok).toBe(true);
  });

  it('validateChain يفحص من الجينيسيس حتى الحالية ويسجل SYSTEM_PULSE_CHECK', async () => {
    const storage = new MemStorage();
    const ledger = new C9Ledger(storage, SECRET);
    await ledger.appendEvent(makeEvent());
    await ledger.appendEvent(makeEvent({ eventType: 'violation' }));

    const pulse = await ledger.validateChain('700-1000001234');
    expect(pulse.valid).toBe(true);
    expect(pulse.checkedBlocks).toBe(2);
    expect(pulse.lastBlockIndex).toBe(2);
    // حدث النبض نفسه سُجل ككتلة جديدة في السلسلة
    expect(pulse.pulseBlockIndex).toBe(3);

    const latest = await storage.getLatestBlock('700-1000001234');
    expect(latest?.event.eventType).toBe('SYSTEM_PULSE_CHECK');
  });

  it('validateChain يكشف أي كسر في السلسلة قبل التوثيق', async () => {
    const storage = new MemStorage();
    const ledger = new C9Ledger(storage, SECRET);
    await ledger.appendEvent(makeEvent());
    await ledger.appendEvent(makeEvent({ eventType: 'violation' }));

    // تلاعب في الكتلة الأولى قبل النبض
    const arr = (storage as unknown as { blocks: Map<string, C9Block[]> }).blocks;
    const b1 = arr.get('700-1000001234')![0];
    b1.event.payload = { ...b1.event.payload, tampered: true };

    const pulse = await ledger.validateChain('700-1000001234');
    expect(pulse.valid).toBe(false);
  });
});
