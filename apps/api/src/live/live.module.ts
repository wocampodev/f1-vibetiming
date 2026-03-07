import { Module } from '@nestjs/common';
import { LiveCaptureScheduler } from './live.capture.scheduler';
import { LiveCaptureService } from './live.capture.service';
import { LiveController } from './live.controller';
import { LiveProviderAdapter } from './live.provider.adapter';
import { LiveSimulatorAdapter } from './live.simulator.adapter';
import { LiveService } from './live.service';

@Module({
  controllers: [LiveController],
  providers: [
    LiveService,
    LiveSimulatorAdapter,
    LiveProviderAdapter,
    LiveCaptureService,
    LiveCaptureScheduler,
  ],
  exports: [LiveService, LiveCaptureService],
})
export class LiveModule {}
