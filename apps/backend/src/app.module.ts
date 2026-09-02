import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScopeGuard } from './scope-guard/scope-guard.guard';
import { DevTokenVerifier, TOKEN_VERIFIER } from './scope-guard/token.verifier';
import { SadeModule } from './sade/sade.module';
import { AttendanceModule } from './attendance/attendance.module';
import { HilapModule } from './hilap/hilap.module';
import { ZatcaModule } from './zatca/zatca.module';
import { PulseModule } from './pulse/pulse.module';
import { PersistenceModule } from './persistence/persistence.module';
import { SpeModule } from './spe/spe.module';
import { GovLinkModule } from './govlink/govlink.module';

@Module({
  imports: [
    SadeModule,
    AttendanceModule,
    HilapModule,
    ZatcaModule,
    PulseModule,
    PersistenceModule,
    SpeModule,
    GovLinkModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: TOKEN_VERIFIER,
      useClass: DevTokenVerifier,
    },
    {
      provide: APP_GUARD,
      useClass: ScopeGuard,
    },
  ],
})
export class AppModule {}
