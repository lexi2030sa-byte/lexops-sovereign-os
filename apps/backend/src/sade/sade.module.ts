import { Module } from '@nestjs/common';
import { SadeController } from './sade.controller';
import { SadeService } from './sade.service';

@Module({
  controllers: [SadeController],
  providers: [SadeService],
  exports: [SadeService],
})
export class SadeModule {}
