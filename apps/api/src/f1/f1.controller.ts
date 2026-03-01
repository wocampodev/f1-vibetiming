import { Controller, Get, Param, Query } from '@nestjs/common';
import { SeasonQueryDto } from './dto/season-query.dto';
import { F1Service } from './f1.service';

@Controller()
export class F1Controller {
  constructor(private readonly f1Service: F1Service) {}

  @Get('calendar')
  getCalendar(@Query() query: SeasonQueryDto) {
    return this.f1Service.getCalendar(query.season);
  }

  @Get('weekends/:eventId')
  getWeekend(@Param('eventId') eventId: string) {
    return this.f1Service.getWeekend(eventId);
  }

  @Get('sessions/:sessionId/results')
  getSessionResults(@Param('sessionId') sessionId: string) {
    return this.f1Service.getSessionResults(sessionId);
  }

  @Get('standings/drivers')
  getDriverStandings(@Query() query: SeasonQueryDto) {
    return this.f1Service.getDriverStandings(query.season);
  }

  @Get('standings/constructors')
  getConstructorStandings(@Query() query: SeasonQueryDto) {
    return this.f1Service.getConstructorStandings(query.season);
  }
}
