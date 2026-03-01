import { Module } from '@nestjs/common';
import { F1Controller } from './f1.controller';
import { F1Service } from './f1.service';

@Module({
  controllers: [F1Controller],
  providers: [F1Service],
  exports: [F1Service],
})
export class F1Module {}
