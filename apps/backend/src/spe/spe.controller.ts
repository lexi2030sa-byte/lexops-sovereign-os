/**
 * واجهة SPE — SPE Controller
 *
 *   POST /spe/calculate — حساب صافي راتب موظف (مرتبط بالحضور/الاستقطاعات)
 *   POST /spe/close     — إقفال شهري (بصمة ZATCA + ربط C9)
 *
 * محمية بـ ScopeGuard. مسارات الرواتب ضمن نطاق المنشأة.
 */

import { Body, Controller, HttpException, Post, Req } from '@nestjs/common';
import { SpeService } from './spe.service';
import type { PayrollInput, SPEPolicy, SPEContext } from '@lexops/spe';

@Controller('spe')
export class SpeController {
  constructor(private readonly speService: SpeService) {}

  /** تقييم سياسة SPE (JSON Logic/SOCF/WPS/تكرار/11438) */
  @Post('evaluate')
  evaluate(
    @Body() body: { policy: SPEPolicy; context: SPEContext },
    @Req() req: { scopeGuard: { entityId?: string; userId: string; role: string } },
  ): Record<string, unknown> {
    const guard = req.scopeGuard;
    if (!guard.entityId) {
      throw new HttpException(
        { success: false, message: 'يتطلب الرقم الموحد للمنشأة (X-Entity-Id)', data: null },
        403,
      );
    }
    if (!body?.policy?.rules?.length) {
      throw new HttpException(
        { success: false, message: 'policy.rules مطلوبة', data: null },
        400,
      );
    }
    const entityId = guard.entityId;
    const results = this.speService.evaluate(body.policy, {
      ...body.context,
      entityId,
    });
    return { success: true, message: 'evaluated', data: results };
  }

  @Post('calculate')
  calculate(
    @Body() body: PayrollInput,
    @Req() req: { scopeGuard: { entityId?: string; userId: string; role: string } },
  ): Record<string, unknown> {
    const guard = req.scopeGuard;
    if (!guard.entityId) {
      throw new HttpException(
        { success: false, message: 'يتطلب الرقم الموحد للمنشأة (X-Entity-Id)', data: null },
        403,
      );
    }
    if (!body?.employeeId || !body?.period || !Number.isFinite(body.baseSalary)) {
      throw new HttpException(
        { success: false, message: 'employeeId و period و baseSalary مطلوبة', data: null },
        400,
      );
    }
    const entityId = guard.entityId;
    const result = this.speService.calculate({ ...body, entityId });
    return { success: true, message: 'computed', data: result };
  }

  @Post('close')
  async close(
    @Body()
    body: { period: string; results: PayrollInput[] },
    @Req() req: { scopeGuard: { entityId?: string; userId: string; role: string } },
  ): Promise<Record<string, unknown>> {
    const guard = req.scopeGuard;
    if (!guard.entityId) {
      throw new HttpException(
        { success: false, message: 'يتطلب الرقم الموحد للمنشأة (X-Entity-Id)', data: null },
        403,
      );
    }
    if (!body?.period || !body?.results?.length) {
      throw new HttpException(
        { success: false, message: 'period و results مطلوبة', data: null },
        400,
      );
    }
    const entityId = guard.entityId;
    const results = body.results.map((r) => this.speService.calculate({ ...r, entityId }));
    const close = await this.speService.payrollEngine.close({
      entityId,
      period: body.period,
      results,
    });
    return { success: true, message: 'closed', data: close };
  }
}
