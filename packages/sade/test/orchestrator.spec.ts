import { describe, expect, it } from 'vitest';
import { SovereignRuleEngine } from '@lexops/rule-engine';
import { C9Ledger, C9Storage, C9Block } from '@lexops/c9-ledger';
import { SadeOrchestrator, DocumentBuilder, defaultTemplate } from '../src/index';
import type { SadeRunInput } from '../src/orchestrator';

/** مخزن C9 للاختبار */
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

/** سجل C9 للاختبار */
function makeLedger(): C9Ledger {
  const storage = new MemStorage();
  return new C9Ledger(storage, 'test-hmac-secret');
}

/** محرك قواعد محمّل بوثيقة عمل مبسطة */
function makeEngine(): SovereignRuleEngine {
  const engine = new SovereignRuleEngine();
  engine.load({
    metadata: { version: '1.0.0', jurisdiction: 'Saudi Arabia' },
    sections: [
      {
        section_number: '1',
        section_title: 'التفتيش',
        articles: [
          {
            article_number: '1',
            compliance_rules: [
              {
                rule_id: 'R-100',
                rule_type: 'إلزامي',
                description: 'مخالفة تفتيش جسيمة',
                priority: 'عالية',
              },
              {
                rule_id: 'R-101',
                rule_type: 'إلزامي',
                description: 'مخالفة تفتيش خفيفة',
                priority: 'منخفضة',
              },
            ],
          },
        ],
      },
    ],
  });
  return engine;
}

const baseInput = (): Omit<SadeRunInput, 'royalInput'> => ({
  event: 'VIOLATION_ADJUDICATED',
  ruleId: 'R-100',
  evalCtx: { data: { entity_id: 'e-1' } },
  entityId: 'e-1',
  actorId: 'u-1',
});

describe('SADE Orchestrator — التوثيق الذاتي السيادي', () => {
  it('يربط زناد محرك القواعد بمستند مختوم وكتلة C9', async () => {
    const ledger = makeLedger();
    const orchestrator = new SadeOrchestrator({
      ruleEngine: makeEngine(),
      documentBuilder: new DocumentBuilder('test-hmac-secret'),
      ledger,
      templates: [defaultTemplate()],
    });

    const out = await orchestrator.run({
      ...baseInput(),
      royalInput: {
        ruleId: 'R-100',
        severity: 'severe',
        entityId: 'e-1',
        history: [],
        now: new Date().toISOString(),
      },
    });

    expect(out.ledger.ok).toBe(true);
    expect(out.document.status).toBe('LEDGER_RECORDED');
    expect(out.document.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.document.ledgerBlockId).toBe(1);
    expect(out.document.content).toContain('%PDF-1.4');
    expect(out.document.metadata.verdict.registerAllowed).toBe(true);
  });

  it('المخالفة الجسيمة تُسجَّل مباشرة (الفلتر الملكي يسمح)', async () => {
    const orchestrator = new SadeOrchestrator({
      ruleEngine: makeEngine(),
      documentBuilder: new DocumentBuilder('test-hmac-secret'),
      ledger: makeLedger(),
      templates: [defaultTemplate()],
    });

    const out = await orchestrator.run({
      ...baseInput(),
      royalInput: {
        ruleId: 'R-100',
        severity: 'severe',
        entityId: 'e-1',
        history: [],
        now: new Date().toISOString(),
      },
    });

    expect(out.document.metadata.verdict.registerAllowed).toBe(true);
  });

  it('المخالفة غير الجسيمة بلا إنذار مسبق تُجمَّد ولا تُسجَّل', async () => {
    const orchestrator = new SadeOrchestrator({
      ruleEngine: makeEngine(),
      documentBuilder: new DocumentBuilder('test-hmac-secret'),
      ledger: makeLedger(),
      templates: [defaultTemplate()],
    });

    const out = await orchestrator.run({
      ...baseInput(),
      ruleId: 'R-101',
      royalInput: {
        ruleId: 'R-101',
        severity: 'minor',
        entityId: 'e-1',
        history: [],
        now: new Date().toISOString(),
      },
    });

    expect(out.document.metadata.verdict.registerAllowed).toBe(false);
  });

  it('مستند بلا محرك مُحمَّل يُرفض (SOV_ORCHESTRATION_UNLOADED)', async () => {
    const orchestrator = new SadeOrchestrator({
      ruleEngine: new SovereignRuleEngine(),
      documentBuilder: new DocumentBuilder('test-hmac-secret'),
      ledger: makeLedger(),
      templates: [defaultTemplate()],
    });

    await expect(
      orchestrator.run({
        ...baseInput(),
        royalInput: {
          ruleId: 'R-100',
          severity: 'severe',
          entityId: 'e-1',
          history: [],
          now: new Date().toISOString(),
        },
      }),
    ).rejects.toThrow('SOV_ORCHESTRATION_UNLOADED');
  });
});

describe('DocumentBuilder — مولّد المستندات', () => {
  it('يملأ القالب ويحسب بصمة HMAC-SHA256 مستقرة', () => {
    const builder = new DocumentBuilder('test-hmac-secret');
    const doc1 = builder.build({
      entityId: 'e-1',
      actorId: 'u-1',
      event: 'STEP_COMPLETED',
      verdict: { ruleId: 'R-1', severity: 'moderate', confidence: 0.9 },
      metadata: {},
    });
    const doc2 = builder.build({
      entityId: 'e-1',
      actorId: 'u-1',
      event: 'STEP_COMPLETED',
      verdict: { ruleId: 'R-1', severity: 'moderate', confidence: 0.9 },
      metadata: {},
    });

    expect(doc1.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(doc1.type).toBe('STEP_RECORD');
    expect(doc1.status).toBe('SIGNED');
    // بصمتان مختلفتان (معرفا مستندان مختلفان) لكن البنية متماثلة
    expect(doc1.hash).not.toBe(doc2.hash);
    expect(doc1.content).toContain('%PDF-1.4');
    expect(doc2.content).toContain('%PDF-1.4');
  });
});
