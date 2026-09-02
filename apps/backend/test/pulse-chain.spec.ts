import { describe, expect, it } from 'vitest';
import { PulseService } from '../src/pulse/pulse.service';
import { SadeService } from '../src/sade/sade.service';
import { AttendanceService } from '../src/attendance/attendance.service';
import { HilapService } from '../src/hilap/hilap.service';
import { ZatcaService } from '../src/zatca/zatca.service';
import { PulseController } from '../src/pulse/pulse.controller';

describe('Pulse — نبض النظام وسلامة سلسلة C9', () => {
  function makeService(): PulseService {
    return new PulseService(
      new SadeService(),
      new AttendanceService(),
      new HilapService(),
      new ZatcaService(),
    );
  }

  it('chainPulse يفحص السلسلة ويسجل SYSTEM_PULSE_CHECK', async () => {
    const service = makeService();
    const pulse = await service.chainPulse('700-1000001234');
    expect(pulse.orgId).toBe('700-1000001234');
    // سلسلة فارغة = سليمة (0 كتلة)
    expect(pulse.valid).toBe(true);
    expect(pulse.lastBlockIndex).toBe(0);
    // حدث النبض نفسه سُجل ككتلة جديدة
    expect(pulse.pulseBlockIndex).toBe(1);
  });

  it('POST /sovereign/pulse/chain يستجيب للمؤسس', async () => {
    const controller = new PulseController(makeService());
    const res = await controller.chainPulse({ orgId: '700-1000001234' });
    expect(res.success).toBe(true);
    expect((res.data as { valid: boolean }).valid).toBe(true);
  });

  it('يرفض /sovereign/pulse/chain بلا orgId', async () => {
    const controller = new PulseController(makeService());
    await expect(controller.chainPulse({} as never)).rejects.toThrow('orgId مطلوب');
  });
});
