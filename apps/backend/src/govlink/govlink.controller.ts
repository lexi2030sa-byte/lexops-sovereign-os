/**
 * واجهة GovLink — GovLink Controller
 *
 *   GET  /govlink/status    — حالة المنافذ الحكومية + المدد السيادية
 *   POST /govlink/call      — تنفيذ طلب على منفذ (Fail-Closed)
 *
 * محمية بـ ScopeGuard — تُدار ضمن نطاق المنشأة/المؤسس.
 */

import { Body, Controller, Get, HttpException, Post, Req } from '@nestjs/common';
import { GovLinkService } from './govlink.service';
import type { GovChannelId } from '@lexops/govlink';

@Controller('govlink')
export class GovLinkController {
  constructor(private readonly govlinkService: GovLinkService) {}

  @Get('status')
  status(): Record<string, unknown> {
    return {
      success: true,
      data: {
        channels: this.govlinkService.status(),
        deadlines: this.govlinkService.deadlines(),
      },
    };
  }

  @Post('call')
  async call(
    @Body() body: { channelId: GovChannelId; payload: unknown },
    @Req() req: { scopeGuard: { entityId?: string; userId: string; role: string } },
  ): Promise<Record<string, unknown>> {
    const guard = req.scopeGuard;
    if (!guard.entityId) {
      throw new HttpException(
        { success: false, message: 'يتطلب الرقم الموحد للمنشأة (X-Entity-Id)', data: null },
        403,
      );
    }
    if (!body?.channelId) {
      throw new HttpException(
        { success: false, message: 'channelId مطلوب', data: null },
        400,
      );
    }
    const res = await this.govlinkService.call({
      channelId: body.channelId,
      entityId: guard.entityId,
      payload: body.payload ?? {},
      actorId: guard.userId,
      requestId: `gov-${Date.now()}`,
    });
    return { success: res.ok, message: res.ok ? 'executed' : (res.reason ?? 'failed'), data: res };
  }
}
