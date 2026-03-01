import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IngestionService } from './ingestion.service';

@Injectable()
export class IngestionScheduler {
  private readonly logger = new Logger(IngestionScheduler.name);

  constructor(private readonly ingestionService: IngestionService) {}

  @Cron('0 */10 * * * *', { name: 'f1-refresh-all' })
  async refreshAll(): Promise<void> {
    this.logger.debug('Running scheduled full refresh');
    await this.ingestionService.refreshAll();
  }

  @Cron('0 0 2 * * *', { name: 'f1-refresh-calendar' })
  async refreshCalendar(): Promise<void> {
    this.logger.debug('Running scheduled calendar refresh');
    await this.ingestionService.refreshCalendar();
  }
}
