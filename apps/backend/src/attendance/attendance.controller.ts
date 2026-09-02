/**
 * واجهة الحضور — Attendance Controller
 *
 *   POST /attendance/check-in   — تسجيل حضور (عبر GeoGate)
 *   POST /attendance/check-out  — تسجيل انصراف
 *
 * محمية بـ ScopeGuard (Fortress 700). يقتصر على دور الموظف/المستقل داخل منشأته.
 */

import { Body, Controller, HttpException, Post, Req } from '@nestjs/common';
import { AttendanceService } from './attendance.service';

interface AttemptBody {
  action: 'check_in' | 'check_out';
  clientTimestamp: number;
  gps: { latitude: number; longitude: number; accuracy?: number; timestamp: number };
  deviceId?: string;
}

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('check-in')
  async checkIn(@Body() body: AttemptBody, @Req() req: { scopeGuard: { entityId?: string; userId: string; role: string } }): Promise<Record<string, unknown>> {
    return this.handle(body, 'check_in', req);
  }

  @Post('check-out')
  async checkOut(@Body() body: AttemptBody, @Req() req: { scopeGuard: { entityId?: string; userId: string; role: string } }): Promise<Record<string, unknown>> {
    return this.handle(body, 'check_out', req);
  }

  private async handle(
    body: AttemptBody,
    forcedAction: 'check_in' | 'check_out',
    req: { scopeGuard: { entityId?: string; userId: string; role: string } },
  ): Promise<Record<string, unknown>> {
    const guard = req.scopeGuard;
    if (!guard.entityId) {
      throw new HttpException(
        { success: false, message: 'يتطلب الرقم الموحد للمنشأة (X-Entity-Id)', data: null },
        403,
      );
    }
    if (!body?.gps || !Number.isFinite(body.clientTimestamp)) {
      throw new HttpException(
        { success: false, message: 'gps و clientTimestamp مطلوبان', data: null },
        400,
      );
    }

    const out = await this.attendanceService.geogate.process({
      userId: guard.userId,
      entityId: guard.entityId,
      action: forcedAction,
      clientTimestamp: body.clientTimestamp,
      gps: body.gps,
      deviceId: body.deviceId,
    });

    return { success: out.accepted, data: out };
  }
}
