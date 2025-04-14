import { Module } from '@nestjs/common';
import { QuikReportsService } from './quik_reports.service';
import { QuikReportsController } from './quik_reports.controller';

@Module({
  controllers: [QuikReportsController],
  providers: [QuikReportsService],
})
export class QuikReportsModule {}
