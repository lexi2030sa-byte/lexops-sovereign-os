import { describe, expect, it } from 'vitest';
import { PersistenceService } from '../src/persistence/persistence.service';
import { PersistenceController } from '../src/persistence/persistence.controller';

describe('Persistence — طبقة الاستمرارية الحية (PH-N1)', () => {
  it('يعيد حالة التراجع الآمن (memory) عند غياب الاعتمادات', async () => {
    const service = new PersistenceService();
    const bundle = await service.init('T-1');
    expect(bundle.tenantId).toBe('T-1');
    expect(bundle.live).toBe(false);
    expect(service.isLive).toBe(false);
  });

  it('GET /sovereign/persistence يستجيب بحالة المخازن', async () => {
    const ctrl = new PersistenceController(new PersistenceService());
    const res = await ctrl.persistence();
    expect(res.success).toBe(true);
    const data = res.data as {
      live: boolean;
      credentialsAvailable: boolean;
      stores: { c9: boolean; attendance: boolean; hilap: boolean };
    };
    expect(data.live).toBe(false);
    expect(data.stores.c9).toBe(false);
    expect(data.stores.attendance).toBe(false);
    expect(data.stores.hilap).toBe(false);
  });
});
