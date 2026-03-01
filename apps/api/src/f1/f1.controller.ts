import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { SeasonPaginationQueryDto } from './dto/season-pagination-query.dto';
import { F1Service } from './f1.service';

const CACHE_HEADER_VALUE = 'public, max-age=30, stale-while-revalidate=120';

@Controller()
export class F1Controller {
  constructor(private readonly f1Service: F1Service) {}

  @Get('calendar')
  @Header('Cache-Control', CACHE_HEADER_VALUE)
  getCalendar(@Query() query: SeasonPaginationQueryDto) {
    return this.f1Service.getCalendar(query);
  }

  @Get('weekends/:eventId')
  @Header('Cache-Control', CACHE_HEADER_VALUE)
  getWeekend(@Param('eventId') eventId: string) {
    return this.f1Service.getWeekend(eventId);
  }

  @Get('sessions/:sessionId/results')
  @Header('Cache-Control', CACHE_HEADER_VALUE)
  getSessionResults(@Param('sessionId') sessionId: string) {
    return this.f1Service.getSessionResults(sessionId);
  }

  @Get('standings/drivers')
  @Header('Cache-Control', CACHE_HEADER_VALUE)
  getDriverStandings(@Query() query: SeasonPaginationQueryDto) {
    return this.f1Service.getDriverStandings(query);
  }

  @Get('standings/constructors')
  @Header('Cache-Control', CACHE_HEADER_VALUE)
  getConstructorStandings(@Query() query: SeasonPaginationQueryDto) {
    return this.f1Service.getConstructorStandings(query);
  }
}
