import { Module } from '@nestjs/common';
import { IngestionScheduler } from './ingestion.scheduler';
import { IngestionService } from './ingestion.service';
import { JolpicaClient } from './jolpica.client';

@Module({
  providers: [JolpicaClient, IngestionService, IngestionScheduler],
  exports: [IngestionService],
})
export class IngestionModule {}
