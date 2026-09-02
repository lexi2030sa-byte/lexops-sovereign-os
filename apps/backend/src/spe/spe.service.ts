/**
 * خدمة SPE في الخلفية — SPE Backend Service
 *
 * توفر SPEEngine (تقييم السياسات: JSON Logic/SOCF/WPS/تكرار/11438)
 * و SpeEngine (الرواتب: صافي + إقفال شهري + C9).
 *
 * مرجع: وثيقة "تطبيق الموظفين" + SOCF v2 + القرار الملكي 11438.
 */

import { Injectable } from '@nestjs/common';
import { C9Ledger, C9Storage, C9Block } from '@lexops/c9-ledger';
import { SPEEngine, SpeEngine, computeNetSalary } from '@lexops/spe';
import type { PayrollInput, PayrollResult, SPEPolicy, SPEContext } from '@lexops/spe';

/** مخزن C9 مؤقت */
class MemC9Storage implements C9Storage {
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
export class SpeService {
  readonly policyEngine: SPEEngine;
  readonly payrollEngine: SpeEngine;

  constructor() {
    const secret = process.env.C9_HMAC_SECRET ?? 'dev-insecure-fallback';
    this.policyEngine = new SPEEngine();
    this.payrollEngine = new SpeEngine(new C9Ledger(new MemC9Storage(), secret), secret);
  }

  /** تقييم سياسة (JSON Logic/SOCF/WPS/تكرار/11438) */
  evaluate(policy: SPEPolicy, ctx: SPEContext): ReturnType<SPEEngine['evaluate']> {
    return this.policyEngine.evaluate(policy, ctx);
  }

  /** حساب صافي راتب موظف */
  calculate(input: PayrollInput): PayrollResult {
    return computeNetSalary(input);
  }
}
