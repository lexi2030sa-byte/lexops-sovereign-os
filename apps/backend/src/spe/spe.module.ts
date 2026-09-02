import { Module } from '@nestjs/common';
import { SpeController } from './spe.controller';
import { SpeService } from './spe.service';

@Module({
  controllers: [SpeController],
  providers: [SpeService],
  exports: [SpeService],
})
export class SpeModule {}
