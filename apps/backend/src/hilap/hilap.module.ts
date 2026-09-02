import { Module } from '@nestjs/common';
import { HilapController } from './hilap.controller';
import { HilapService } from './hilap.service';

@Module({
  controllers: [HilapController],
  providers: [HilapService],
  exports: [HilapService],
})
export class HilapModule {}
