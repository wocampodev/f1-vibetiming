import { Module } from '@nestjs/common';
import { LiveCaptureScheduler } from './live.capture.scheduler';
import { LiveCaptureService } from './live.capture.service';
import { LiveController } from './live.controller';
import { LiveProviderAdapter } from './live.provider.adapter';
import { LiveReplayService } from './live.replay.service';
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
    LiveReplayService,
  ],
  exports: [LiveService, LiveCaptureService, LiveReplayService],
})
export class LiveModule {}
