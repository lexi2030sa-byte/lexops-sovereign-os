import { Module } from '@nestjs/common';
import { GovLinkController } from './govlink.controller';
import { GovLinkService } from './govlink.service';

@Module({
  controllers: [GovLinkController],
  providers: [GovLinkService],
  exports: [GovLinkService],
})
export class GovLinkModule {}
