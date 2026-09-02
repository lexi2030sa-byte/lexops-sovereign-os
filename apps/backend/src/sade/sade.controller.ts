/**
 * واجهة SADE — SADE Controller
 *
 * تكشف زناد التوثيق الذاتي عبر HTTP:
 *   POST /sade/triggers  — تشغيل تدفق SADE (تقييم قاعدة → مستند مختوم → كتلة C9)
 *
 * محمية بـ ScopeGuard (Fortress 700). الاستدعاء فقط لرتب الحصن المصرّحة.
 */

import { Body, Controller, HttpException, Post, Req } from '@nestjs/common';
import { SadeService } from './sade.service';
import type { SadeRunInput } from '@lexops/sade';

interface TriggerBody {
  event: SadeRunInput['event'];
  ruleId: string;
  data: Record<string, unknown>;
  severity?: 'severe' | 'moderate' | 'minor';
  history?: Array<{ eventType: 'early_warning' | 'violation'; ruleId?: string; occurredAt: string }>;
  now?: string;
}

@Controller('sade')
export class SadeController {
  constructor(private readonly sadeService: SadeService) {}

  @Post('triggers')
  async trigger(
    @Body() body: TriggerBody,
    @Req() req: { scopeGuard: { entityId?: string; userId: string; role: string } },
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      document: {
        id: string;
        type: string;
        status: string;
        hash: string;
        ledgerBlockId: number | null;
        ledgerTxId: string | null;
        metadata: Record<string, unknown>;
      };
      ledgerOk: boolean;
    } | null;
  }> {
    const guard = req.scopeGuard;
    if (!body.event || !body.ruleId) {
      throw new HttpException(
        { success: false, message: 'event و ruleId مطلوبان', data: null },
        400,
      );
    }
    if (!guard.entityId) {
      throw new HttpException(
        { success: false, message: 'يتطلب الرقم الموحد للمنشأة (X-Entity-Id)', data: null },
        403,
      );
    }

    try {
      const out = await this.sadeService.orchestrator.run({
        event: body.event,
        ruleId: body.ruleId,
        evalCtx: { data: body.data },
        royalInput: {
          ruleId: body.ruleId,
          severity: body.severity ?? 'moderate',
          entityId: guard.entityId,
          history: body.history ?? [],
          now: body.now ?? new Date().toISOString(),
        },
        entityId: guard.entityId,
        actorId: guard.userId,
        extraMeta: {},
      });

      return {
        success: true,
        message: 'SADE completed',
        data: {
          document: {
            id: out.document.id,
            type: out.document.type,
            status: out.document.status,
            hash: out.document.hash,
            ledgerBlockId: out.document.ledgerBlockId ?? null,
            ledgerTxId: out.document.ledgerTxId ?? null,
            metadata: out.document.metadata,
          },
          ledgerOk: out.ledger.ok,
        },
      };
    } catch (e) {
      throw new HttpException(
        { success: false, message: (e as Error).message, data: null },
        400,
      );
    }
  }
}
