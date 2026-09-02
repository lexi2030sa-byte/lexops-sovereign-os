/**
 * خدمة SADE في الخلفية — SADE Backend Service
 *
 * توفر SadeOrchestrator مع محرك قواعد مُحمَّل من legal_engine_config.json
 * (المولّد عبر scripts/generate-config.ts في حزمة rule-engine).
 *
 * مرجع: USDS-02 (Orchestration Engine Layer 2) + وثيقة SADE.
 * ملاحظة سيادية: المحرك يُحمَّل من الإعداد الحاكم عند البداية؛ غيابه لا يوقف الخدمة.
 */

import { Injectable } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { C9Ledger, C9Storage, C9Block } from '@lexops/c9-ledger';
import { SovereignRuleEngine } from '@lexops/rule-engine';
import { DocumentBuilder, SadeOrchestrator, defaultTemplate } from '@lexops/sade';
import { ROLE_HIERARCHY } from '@lexops/contracts';
import type { SovereignRole } from '@lexops/contracts';

/** مخزن C9 بسيط للتوصيل — يُستبدل بـ Firestore/PostgreSQL في الإنتاج */
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
export class SadeService {
  readonly orchestrator: SadeOrchestrator;
  /** محرك القواعد المكشوف — لنبض النظام والتشخيص */
  readonly ruleEngine: SovereignRuleEngine;
  private readonly hmacSecret: string;

  constructor() {
    // C9_HMAC_SECRET من Secret Manager — لا hardcoding أبداً
    this.hmacSecret = process.env.C9_HMAC_SECRET ?? 'dev-insecure-fallback';
    const engine = new SovereignRuleEngine();
    this.ruleEngine = engine;
    this.tryLoadConfig(engine);
    this.orchestrator = new SadeOrchestrator({
      ruleEngine: engine,
      documentBuilder: new DocumentBuilder(this.hmacSecret),
      ledger: new C9Ledger(new MemStorage(), this.hmacSecret),
      templates: [defaultTemplate()],
    });
  }

  /** تحميل الإعداد الحاكم من المسار القابل للضبط — غيابه لا يوقف الخدمة */
  private tryLoadConfig(engine: SovereignRuleEngine): void {
    const configPath = this.resolveConfigPath();
    if (!configPath) {
      // eslint-disable-next-line no-console
      console.warn('[SADE] legal_engine_config غير موجود — يعمل المحرك فارغاً حتى يُحمَّل');
      return;
    }
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      engine.load(config as never);
      // eslint-disable-next-line no-console
      console.log('[SADE] legal_engine_config محمّل في محرك القواعد');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[SADE] تعذر تحليل legal_engine_config:', (e as Error).message);
    }
  }

  /** العثور على مسار الإعداد الحاكم (متغير، أو بالصعود حتى جذر العمل) */
  private resolveConfigPath(): string | null {
    if (process.env.LEGAL_ENGINE_CONFIG && existsSync(process.env.LEGAL_ENGINE_CONFIG)) {
      return process.env.LEGAL_ENGINE_CONFIG;
    }
    // الصعود من موضع الوحدة (src أو dist) حتى الوصول لمجلد الحزمة
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(dir, 'packages', 'rule-engine', 'data', 'legal_engine_config.json');
      if (existsSync(candidate)) return candidate;
      dir = path.dirname(dir);
    }
    return null;
  }

  /** تقييم الدور ضمن التسلسل السيادي (أعلى = أوسع) */
  roleRank(role: SovereignRole): number {
    return ROLE_HIERARCHY[role] ?? 1;
  }
}
