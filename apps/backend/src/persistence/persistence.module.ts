import { Module } from '@nestjs/common';
import { PersistenceController } from './persistence.controller';
import { PersistenceService } from './persistence.service';

@Module({
  controllers: [PersistenceController],
  providers: [PersistenceService],
  exports: [PersistenceService],
})
export class PersistenceModule {}
