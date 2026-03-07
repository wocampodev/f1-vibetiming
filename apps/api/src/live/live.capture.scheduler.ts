import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LiveCaptureService } from './live.capture.service';

@Injectable()
export class LiveCaptureScheduler {
  private readonly logger = new Logger(LiveCaptureScheduler.name);

  constructor(private readonly liveCaptureService: LiveCaptureService) {}

  @Cron('0 35 4 * * *', { name: 'live-provider-retention-cleanup' })
  async purgeExpiredData(): Promise<void> {
    this.logger.debug('Running live provider retention cleanup');
    await this.liveCaptureService.purgeExpiredData();
  }
}
