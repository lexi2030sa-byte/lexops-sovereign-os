/**
 * خدمة HILAP في الخلفية — HILAP Backend Service
 *
 * توفر HilapOrchestrator مع مخزن مؤقت وسجل C9 (تُستبدل بـ Firestore في الإنتاج).
 * مرجع: وثيقة "بروتوكول التحكيم والتدخل البشري الحاكم (HILAP)".
 */

import { Injectable } from '@nestjs/common';
import { C9Ledger, C9Storage, C9Block } from '@lexops/c9-ledger';
import { HilapOrchestrator, HilapCase } from '@lexops/hilap';
import type { HilapStore } from '@lexops/hilap';

class MemHilapStore implements HilapStore {
  private cases = new Map<string, HilapCase>();
  async save(case_: HilapCase): Promise<void> {
    this.cases.set(case_.id, case_);
  }
  async get(caseId: string): Promise<HilapCase | null> {
    return this.cases.get(caseId) ?? null;
  }
}

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

@Injectable()
export class HilapService {
  readonly orchestrator: HilapOrchestrator;

  constructor() {
    const secret = process.env.C9_HMAC_SECRET ?? 'dev-insecure-fallback';
    this.orchestrator = new HilapOrchestrator(
      new MemHilapStore(),
      new C9Ledger(new MemStorage(), secret),
      secret,
    );
  }
}
