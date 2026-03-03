import { Module } from '@nestjs/common';
import { LiveController } from './live.controller';
import { LiveProviderAdapter } from './live.provider.adapter';
import { LiveSimulatorAdapter } from './live.simulator.adapter';
import { LiveService } from './live.service';

@Module({
  controllers: [LiveController],
  providers: [LiveService, LiveSimulatorAdapter, LiveProviderAdapter],
  exports: [LiveService],
})
export class LiveModule {}
