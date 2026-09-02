/**
 * واجهة الاستمرارية — Persistence Controller
 *
 *   GET /sovereign/persistence  — حالة طبقة الاستمرارية الحية (Firestore)
 *
 * محمية بـ ScopeGuard — مسار /sovereign/ للمؤسس حصراً.
 */

import { Controller, Get } from '@nestjs/common';
import { PersistenceService } from './persistence.service';

@Controller('sovereign')
export class PersistenceController {
  constructor(private readonly persistenceService: PersistenceService) {}

  @Get('persistence')
  async persistence(): Promise<Record<string, unknown>> {
    const bundle = await this.persistenceService.init();
    return {
      success: true,
      data: {
        live: this.persistenceService.isLive,
        credentialsAvailable: this.persistenceService.credentialsAvailable,
        tenantId: bundle.tenantId,
        stores: {
          c9: bundle.c9 !== null,
          attendance: bundle.attendance !== null,
          hilap: bundle.hilap !== null,
        },
        collections: 'tenants/{tenantId}/{entities|branches|employees|attendance|violations|objections|payroll}',
        rules: 'packages/persistence/firestore/rules.firestore',
      },
    };
  }
}
