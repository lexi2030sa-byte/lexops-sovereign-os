import { describe, expect, it } from 'vitest';
import { PulseService } from '../src/pulse/pulse.service';
import { SadeService } from '../src/sade/sade.service';
import { AttendanceService } from '../src/attendance/attendance.service';
import { HilapService } from '../src/hilap/hilap.service';
import { ZatcaService } from '../src/zatca/zatca.service';

describe('Pulse — نبض النظام', () => {
  it('يعيد نبضاً شاملاً بمحرك قواعد محمّل وإحصاءات الحزم', () => {
    const pulse = new PulseService(
      new SadeService(),
      new AttendanceService(),
      new HilapService(),
      new ZatcaService(),
    );
    const p = pulse.pulse();

    const engines = p.engines as {
      ruleEngine: { loaded: boolean; totalRules: number; executable: number };
      sade: { ready: boolean };
      attendance: { ready: boolean; registeredPeople: number };
      hilap: { ready: boolean };
      zatca: { ready: boolean; hasProductionCsid: boolean };
    };
    expect(engines.ruleEngine.loaded).toBe(true);
    expect(engines.ruleEngine.totalRules).toBeGreaterThan(1000);
    expect(engines.sade.ready).toBe(true);
    expect(engines.attendance.ready).toBe(true);
    expect(engines.attendance.registeredPeople).toBe(0);
    expect(engines.hilap.ready).toBe(true);
    expect(engines.zatca.ready).toBe(true);
    expect((p.c9 as { status: string }).status).toBe('append-only');
  });
});
