/**
 * واجهة HILAP — HILAP Controller
 *
 *   POST /hilap/freeze       — تجميد قرار دون العتبة (استجابة للـ LEXI)
 *   POST /hilap/cases        — فتح قضية نقض (المرحلة 1)
 *   POST /hilap/review       — مراجعة مرحلة لاحقة (أولي/قانوني/قرار الإدارة)
 *
 * محمية بـ ScopeGuard. مسارات HILAP تُدار ضمن نطاق المنشأة.
 */

import { Body, Controller, HttpException, Post, Req } from '@nestjs/common';
import { HilapService } from './hilap.service';
import type { HilapRole, HilapStageKey } from '@lexops/hilap';
import { LEXI_CONFIDENCE } from '@lexops/shared';

interface FreezeBody {
  confidence: number;
  severity?: 'routine' | 'severe';
}

interface OpenBody {
  blockId: number;
  ruleId?: string;
  reason: string;
  evidenceHashes: string[];
  frozenConfidence: number;
}

interface ReviewBody {
  caseId: string;
  stage: HilapStageKey;
  role: HilapRole;
  action: string;
  note?: string;
}

@Controller('hilap')
export class HilapController {
  constructor(private readonly hilapService: HilapService) {}

  /** تجميد القرار دون العتبة (حسب جسامته) — مسار تحكيم حصري */
  @Post('freeze')
  freeze(
    @Body() body: FreezeBody,
    @Req() req: { scopeGuard: { entityId?: string; userId: string; role: string } },
  ): Record<string, unknown> {
    if (!Number.isFinite(body.confidence)) {
      throw new HttpException(
        { success: false, message: 'confidence مطلوب', data: null },
        400,
      );
    }
    const threshold =
      body.severity === 'severe'
        ? LEXI_CONFIDENCE.severeAutoDecision
        : LEXI_CONFIDENCE.minAutoDecision;
    const out = this.hilapService.orchestrator.freeze(body.confidence, threshold);
    return {
      success: true,
      message: out.frozen ? 'frozen' : 'auto_eligible',
      data: { frozen: out.frozen, threshold, ...(out.reason ? { reason: out.reason } : {}) },
    };
  }

  /** فتح قضية نقض — المرحلة 1 (تقديم الطلب) */
  @Post('cases')
  async open(
    @Body() body: OpenBody,
    @Req() req: { scopeGuard: { entityId?: string; userId: string; role: string } },
  ): Promise<Record<string, unknown>> {
    const guard = req.scopeGuard;
    if (!guard.entityId) {
      throw new HttpException(
        { success: false, message: 'يتطلب الرقم الموحد للمنشأة (X-Entity-Id)', data: null },
        403,
      );
    }
    if (!body.blockId || !body.reason) {
      throw new HttpException(
        { success: false, message: 'blockId و reason مطلوبان', data: null },
        400,
      );
    }
    const caseId = `HILAP-${Date.now()}`;
    const c = await this.hilapService.orchestrator.open(
      {
        id: caseId,
        entityId: guard.entityId,
        blockId: body.blockId,
        ruleId: body.ruleId,
        reason: body.reason,
        evidenceHashes: body.evidenceHashes ?? [],
        submittedBy: guard.userId,
        submittedAt: new Date().toISOString(),
        frozenConfidence: body.frozenConfidence,
      },
      guard.userId,
      this.mapRole(guard.role),
    );
    return { success: true, data: { id: c.id, stage: c.stage, status: c.status, expiresAt: c.expiresAt } };
  }

  /** مراجعة مرحلة لاحقة */
  @Post('review')
  async review(
    @Body() body: ReviewBody,
    @Req() req: { scopeGuard: { entityId?: string; userId: string; role: string } },
  ): Promise<Record<string, unknown>> {
    if (!body.caseId || !body.stage || !body.action) {
      throw new HttpException(
        { success: false, message: 'caseId و stage و action مطلوبة', data: null },
        400,
      );
    }
    try {
      const c = await this.hilapService.orchestrator.review({
        caseId: body.caseId,
        stage: body.stage,
        role: this.mapRole(req.scopeGuard.role),
        actorId: req.scopeGuard.userId,
        action: body.action,
        note: body.note,
      });
      return {
        success: true,
        data: {
          id: c.id,
          stage: c.stage,
          status: c.status,
          decision: c.decision ?? null,
          c9: c.c9,
        },
      };
    } catch (e) {
      throw new HttpException(
        { success: false, message: (e as Error).message, data: null },
        400,
      );
    }
  }

  /** تعيين دور النظام إلى دور HILAP — المؤسس ومدير المنشأة في قرار الإدارة */
  private mapRole(role: string): HilapRole {
    switch (role) {
      case 'founder':
        return 'founder';
      case 'entity_admin':
      case 'hr_manager':
        return 'org_owner';
      case 'legal_advisor':
        return 'legal_advisor';
      case 'compliance_officer':
      case 'field_inspector':
        return 'compliance_officer';
      default:
        throw new HttpException(
          { success: false, message: `دور غير مخول لـ HILAP: ${role}`, data: null },
          403,
        );
    }
  }
}
