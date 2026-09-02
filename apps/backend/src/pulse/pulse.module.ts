import { Module } from '@nestjs/common';
import { PulseController } from './pulse.controller';
import { PulseService } from './pulse.service';
import { SadeModule } from '../sade/sade.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { HilapModule } from '../hilap/hilap.module';
import { ZatcaModule } from '../zatca/zatca.module';

@Module({
  imports: [SadeModule, AttendanceModule, HilapModule, ZatcaModule],
  controllers: [PulseController],
  providers: [PulseService],
})
export class PulseModule {}
