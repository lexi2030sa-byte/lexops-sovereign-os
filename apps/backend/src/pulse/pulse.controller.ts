/**
 * واجهة نبض النظام — Pulse Controller
 *
 *   GET  /sovereign/pulse       — نبض النظام الشامل (تشخيص المؤسس حصراً)
 *   POST /sovereign/pulse/chain — فحص تكامل سلسلة C9 (validateChain) وتسجيل
 *                                 SYSTEM_PULSE_CHECK — المؤسس حصراً
 *
 * محمية بـ ScopeGuard — مسار /sovereign/ يمر به المؤسس فقط (Fortress 700).
 */

import { Body, Controller, Get, HttpException, Post } from '@nestjs/common';
import { PulseService } from './pulse.service';

@Controller('sovereign')
export class PulseController {
  constructor(private readonly pulseService: PulseService) {}

  @Get('pulse')
  pulse(): Record<string, unknown> {
    return { success: true, data: this.pulseService.pulse() };
  }

  @Post('pulse/chain')
  async chainPulse(@Body() body: { orgId?: string }): Promise<Record<string, unknown>> {
    if (!body?.orgId) {
      throw new HttpException(
        { success: false, message: 'orgId مطلوب', data: null },
        400,
      );
    }
    const pulse = await this.pulseService.chainPulse(body.orgId);
    return {
      success: true,
      message: pulse.valid ? 'chain_valid' : 'chain_broken',
      data: pulse,
    };
  }
}
