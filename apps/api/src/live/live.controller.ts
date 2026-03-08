import { Controller, Get, Header, Sse } from '@nestjs/common';
import { LiveService } from './live.service';

@Controller('live')
export class LiveController {
  constructor(private readonly liveService: LiveService) {}

  @Get('state')
  @Header('Cache-Control', 'no-store')
  getState() {
    return this.liveService.getState();
  }

  @Get('board')
  @Header('Cache-Control', 'no-store')
  getBoard() {
    return this.liveService.getBoard();
  }

  @Get('health')
  @Header('Cache-Control', 'no-store')
  getHealth() {
    return this.liveService.getHealth();
  }

  @Sse('stream')
  stream() {
    return this.liveService.stream();
  }
}
