import { Module } from '@nestjs/common';
import { LiveController } from './live.controller';
import { LiveSimulatorAdapter } from './live.simulator.adapter';
import { LiveService } from './live.service';

@Module({
  controllers: [LiveController],
  providers: [LiveService, LiveSimulatorAdapter],
  exports: [LiveService],
})
export class LiveModule {}
