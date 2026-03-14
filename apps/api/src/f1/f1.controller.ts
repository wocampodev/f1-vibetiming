import { Controller, Get, Header, Query } from '@nestjs/common';
import { StandingsQueryDto } from './dto/standings-query.dto';
import { F1Service } from './f1.service';

const CACHE_HEADER_VALUE = 'public, max-age=30, stale-while-revalidate=120';

@Controller()
export class F1Controller {
  constructor(private readonly f1Service: F1Service) {}

  @Get('standings/drivers')
  @Header('Cache-Control', CACHE_HEADER_VALUE)
  getDriverStandings(@Query() query: StandingsQueryDto) {
    return this.f1Service.getDriverStandings(query);
  }

  @Get('standings/constructors')
  @Header('Cache-Control', CACHE_HEADER_VALUE)
  getConstructorStandings(@Query() query: StandingsQueryDto) {
    return this.f1Service.getConstructorStandings(query);
  }
}
