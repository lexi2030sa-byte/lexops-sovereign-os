import { describe, expect, it } from 'vitest';
import { C9Ledger, C9Storage, C9Block } from '@lexops/c9-ledger';
import { HilapOrchestrator } from '../src/index';
import type { HilapStore, HilapCase } from '../src/index';

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

class MemHilapStore implements HilapStore {
  private cases = new Map<string, HilapCase>();
  async save(case_: HilapCase): Promise<void> {
    this.cases.set(case_.id, case_);
  }
  async get(caseId: string): Promise<HilapCase | null> {
    return this.cases.get(caseId) ?? null;
  }
}

const SECRET = 'test-hilap-secret';

function makeOrchestrator() {
  return new HilapOrchestrator(
    new MemHilapStore(),
    new C9Ledger(new MemStorage(), SECRET),
    SECRET,
  );
}

const BASE_REQUEST = {
  id: 'HILAP-001',
  entityId: '700-1000001234',
  blockId: 42,
  ruleId: 'R-100',
  reason: 'أدلة مادية استثنائية',
  evidenceHashes: ['sha256:abc123'],
  submittedBy: 'org-owner-1',
  submittedAt: new Date().toISOString(),
  frozenConfidence: 0.75,
};

describe('HILAP 2.0 — التحكيم البشري الحاكم', () => {
  it('يفتح قضية نقض بالمرحلة 1 ويقبل أصحاب الصلاحية (جميع الأدوار الخمسة)', async () => {
    const h = makeOrchestrator();
    const c = await h.open(BASE_REQUEST, 'org-owner-1', 'org_owner');
    expect(c.stage).toBe('SUBMIT');
    expect(c.status).toBe('open');
    expect(c.interventions).toHaveLength(1);
    expect(c.interventions[0].actorSignature).toMatch(/^[a-f0-9]{64}$/);
    expect(c.expiresAt > new Date().toISOString()).toBe(true);

    // كل الأدوار المخولة تُقبل في مرحلة التقديم (جدول الوثيقة)
    for (const role of ['hr_manager', 'legal_advisor', 'compliance_officer', 'founder'] as const) {
      await expect(
        h.open({ ...BASE_REQUEST, id: `HILAP-${role}` }, `${role}-actor`, role),
      ).resolves.toBeDefined();
    }
  });

  it('يمر بدورة كاملة من 4 مراحل وينتهي بقرار الإدارة', async () => {
    const h = makeOrchestrator();
    const c = await h.open(BASE_REQUEST, 'org-owner-1', 'org_owner');

    const afterReview = await h.review({
      caseId: c.id,
      stage: 'PRELIMINARY_REVIEW',
      role: 'compliance_officer',
      actorId: 'comp-1',
      action: 'verify_evidence',
      note: 'الأدلة متطابقة مع البصمة',
    });
    expect(afterReview.stage).toBe('PRELIMINARY_REVIEW');
    expect(afterReview.status).toBe('in_review');

    const afterLegal = await h.review({
      caseId: c.id,
      stage: 'LEGAL_ARBITRATION',
      role: 'legal_advisor',
      actorId: 'legal-1',
      action: 'legal_assessment',
      note: 'الاعتراض نظامي',
    });
    expect(afterLegal.stage).toBe('LEGAL_ARBITRATION');

    const decided = await h.review({
      caseId: c.id,
      stage: 'EXECUTIVE_DECISION',
      role: 'founder',
      actorId: 'founder-1',
      action: 'overturn',
      note: 'نقض الحظر الآلي',
    });
    expect(decided.status).toBe('decided');
    expect(decided.decision).toBe('overturn');
    expect(decided.decidedBy).toBe('founder-1');
    // كتلة التدخل سُجلت في C9
    expect(decided.c9?.interventionBlockId).toBeGreaterThan(0);
    expect(decided.c9?.interventionBlockHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('يرفض تجاوز التسلسل (مرحلة خاطئة)', async () => {
    const h = makeOrchestrator();
    const c = await h.open(BASE_REQUEST, 'org-owner-1', 'org_owner');
    await expect(
      h.review({
        caseId: c.id,
        stage: 'LEGAL_ARBITRATION',
        role: 'legal_advisor',
        actorId: 'legal-1',
        action: 'legal_assessment',
      }),
    ).rejects.toThrow('SOV_HILAP_STAGE');
  });

  it('يرفض دوراً غير مخول للمرحلة (SOV_HILAP_FORBIDDEN)', async () => {
    const h = makeOrchestrator();
    const c = await h.open(BASE_REQUEST, 'org-owner-1', 'org_owner');
    await expect(
      h.review({
        caseId: c.id,
        stage: 'PRELIMINARY_REVIEW',
        role: 'legal_advisor',
        actorId: 'legal-1',
        action: 'verify_evidence',
      }),
    ).rejects.toThrow('SOV_HILAP_FORBIDDEN');
  });

  it('التجميد: قرار دون العتبة يُجمَّد ويُحال لـ HILAP', async () => {
    const h = makeOrchestrator();
    expect(h.freeze(0.75, 0.9)).toEqual({ frozen: true, reason: 'below_confidence_threshold' });
    expect(h.freeze(0.95, 0.9)).toEqual({ frozen: false });
  });

  it('يكتشف انقضاء مهلة الـ 48 ساعة', async () => {
    const h = makeOrchestrator();
    const c = await h.open(BASE_REQUEST, 'org-owner-1', 'org_owner');
    expect(h.isExpired(c)).toBe(false);
    const future = new Date(Date.now() + 49 * 3600_000).toISOString();
    expect(h.isExpired(c, future)).toBe(true);
  });
});
